import { connect } from "cloudflare:sockets";

/**
 * VLESS-over-WebSocket tunnel relay using cloudflare:sockets.
 * Adapted from the legacy _worker.js implementation and wrapped for Hono.
 */

const WS_OPEN = 1;
const WS_CLOSING = 2;

export function isTunnelRequest(url: URL, request: Request): boolean {
  return request.headers.get("Upgrade") === "websocket";
}

/** Handle an incoming WebSocket upgrade for the tunnel. */
export async function handleTunnel(request: Request, url: URL): Promise<Response> {
  let prxIP = "";

  // Format: /<IP>:<port> or /<IP>-<port> or /<IP>=<port>
  const prxMatch = url.pathname.match(/^\/(.+[:=-]\d+)$/);
  // Format: /ID /SG /ID,SG (random country pick from KV list)
  if (url.pathname.length === 3 || url.pathname.includes(",")) {
    const keys = url.pathname.replace("/", "").toUpperCase().split(",");
    const key = keys[Math.floor(Math.random() * keys.length)];
    prxIP = key ?? ""; // resolved by upstream via KV (kept simple here)
  } else if (prxMatch) {
    prxIP = prxMatch[1]!;
  } else {
    return new Response("Bad Request", { status: 400 });
  }

  return websocketHandler(request, prxIP);
}

async function websocketHandler(request: Request, prxIP: string): Promise<Response> {
  const pair = new WebSocketPair();
  const values = Object.values(pair) as [WebSocket, WebSocket];
  const [client, server] = values;
  server.accept();

  const earlyData = request.headers.get("sec-websocket-protocol") || "";
  const readable = makeReadable(server, earlyData);

  const remote: { value: Socket | null } = { value: null };

  readable
    .pipeTo(
      new WritableStream<Uint8Array>({
        write: async (chunk: Uint8Array) => {
          if (remote.value) {
            const writer = remote.value.writable.getWriter();
            await writer.write(chunk as Uint8Array<ArrayBuffer>);
            writer.releaseLock();
            return;
          }

          const header = parseVlessHeader(chunk.buffer as ArrayBuffer);
          if (header.hasError) throw new Error(header.message);
          if (header.isUDP) {
            safeClose(server);
            return;
          }
          await handleTcp(remote, header, prxIP, server);
        },
      }),
    )
    .catch((err) => console.error("tunnel pipeTo error", err));

  return new Response(null, { status: 101, webSocket: client });
}

async function handleTcp(
  remote: { value: Socket | null },
  header: ParsedHeader,
  prxIP: string,
  webSocket: WebSocket,
) {
  const [prxHost, prxPort] = prxIP.split(/[:=-]/);
  const socket = connect({
    hostname: prxHost || header.addressRemote,
    port: Number(prxPort) || header.portRemote,
  });
  remote.value = socket;

  const writer = socket.writable.getWriter();
  await writer.write(header.rawClientData);
  writer.releaseLock();

  socket.readable.pipeTo(
    new WritableStream<Uint8Array>({
      write: (chunk, ctl) => {
        if (webSocket.readyState !== WS_OPEN) {
          ctl.error("webSocket not open");
          return;
        }
        webSocket.send(chunk);
      },
    }),
  );
}

interface ParsedHeader {
  hasError: boolean;
  message?: string;
  isUDP: boolean;
  addressRemote: string;
  portRemote: number;
  rawClientData: ArrayBuffer;
}

function parseVlessHeader(buffer: ArrayBuffer): ParsedHeader {
  const err = (message: string): ParsedHeader => ({ hasError: true, message, isUDP: false, addressRemote: "", portRemote: 0, rawClientData: buffer });
  if (!buffer || buffer.byteLength < 24) return err("invalid VLESS header length");

  const view = new DataView(buffer);
  const optLength = view.getUint8(17);
  const commandIndex = 18 + optLength;
  if (buffer.byteLength < commandIndex + 1) return err("truncated command");

  const cmd = view.getUint8(commandIndex);
  if (cmd === 2) return { ...err("UDP not supported"), isUDP: true };

  const portIndex = commandIndex + 1;
  if (buffer.byteLength < portIndex + 2) return err("truncated port");
  const portRemote = view.getUint16(portIndex);

  const typeIndex = portIndex + 2;
  if (buffer.byteLength < typeIndex + 1) return err("truncated address type");
  const addressType = view.getUint8(typeIndex);

  let valueIndex = typeIndex + 1;
  let addressRemote = "";
  if (addressType === 1) {
    if (buffer.byteLength < valueIndex + 4) return err("truncated IPv4");
    const b = new Uint8Array(buffer);
    addressRemote = [b[valueIndex], b[valueIndex + 1], b[valueIndex + 2], b[valueIndex + 3]].join(".");
    valueIndex += 4;
  } else if (addressType === 2) {
    if (buffer.byteLength < valueIndex + 1) return err("truncated domain len");
    const len = view.getUint8(valueIndex);
    valueIndex += 1;
    if (buffer.byteLength < valueIndex + len) return err("truncated domain");
    addressRemote = new TextDecoder().decode(buffer.slice(valueIndex, valueIndex + len));
    valueIndex += len;
  } else if (addressType === 3) {
    if (buffer.byteLength < valueIndex + 16) return err("truncated IPv6");
    const parts: string[] = [];
    for (let i = 0; i < 8; i++) parts.push(view.getUint16(valueIndex + i * 2).toString(16));
    addressRemote = parts.join(":");
    valueIndex += 16;
  } else {
    return err(`invalid address type ${addressType}`);
  }

  return {
    hasError: false,
    isUDP: false,
    addressRemote,
    portRemote,
    rawClientData: buffer.slice(valueIndex),
  };
}

function makeReadable(server: WebSocket, earlyDataHeader: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      server.addEventListener("message", (e) => {
        controller.enqueue(new Uint8Array(e.data as ArrayBuffer));
      });
      server.addEventListener("close", () => controller.close());
      server.addEventListener("error", (e) => controller.error(e));

      const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
      if (error) controller.error(error);
      else if (earlyData) controller.enqueue(new Uint8Array(earlyData));
    },
    cancel() {
      safeClose(server);
    },
  });
}

function safeClose(socket: WebSocket) {
  try {
    if (socket.readyState === WS_OPEN || socket.readyState === WS_CLOSING) socket.close();
  } catch (e) {
    console.error("safeClose error", e);
  }
}

function base64ToArrayBuffer(b64: string): { earlyData: ArrayBuffer | null; error: Error | null } {
  if (!b64) return { earlyData: null, error: null };
  try {
    const clean = b64.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(clean);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return { earlyData: bytes.buffer, error: null };
  } catch (error) {
    return { earlyData: null, error: error as Error };
  }
}

type Socket = ReturnType<typeof connect>;