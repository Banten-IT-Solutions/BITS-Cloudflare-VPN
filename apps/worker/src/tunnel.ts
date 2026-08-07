import { connect } from "cloudflare:sockets";
import type { Env } from "./env";
import { getScannedProxies } from "./proxy";

/**
 * VLESS-over-WebSocket tunnel relay using cloudflare:sockets.
 * Region paths resolve from scanner output in R2; direct targets remain supported.
 */

const WS_OPEN = 1;
const WS_CLOSING = 2;

export function isTunnelRequest(_url: URL, request: Request): boolean {
  return request.headers.get("Upgrade") === "websocket";
}

/** Handle incoming WebSocket upgrade. */
export async function handleTunnel(request: Request, url: URL, env: Env): Promise<Response> {
  const directTarget = url.pathname.match(/^\/([\d.]+[:=-]\d+)$/)?.[1];
  const regions = url.pathname.slice(1).toUpperCase().split(",").filter((region): region is "ID" | "SG" => region === "ID" || region === "SG");
  let proxyTarget = directTarget ?? "";

  if (!proxyTarget && regions.length) {
    const list = await getScannedProxies(env);
    const matches = list?.proxies.filter((proxy) => regions.includes(proxy.region)) ?? [];
    if (!matches.length) return new Response("No healthy proxy available", { status: 503 });
    const selected = matches[crypto.getRandomValues(new Uint32Array(1))[0]! % matches.length]!;
    proxyTarget = `${selected.ip}:${selected.port}`;
  }
  if (!proxyTarget) return new Response("Bad Request", { status: 400 });
  return websocketHandler(request, proxyTarget);
}

async function websocketHandler(request: Request, prxIP: string): Promise<Response> {
  const pair = new WebSocketPair();
  const values = Object.values(pair) as [WebSocket, WebSocket];
  const [client, server] = values;
  server.accept();

  const earlyData = request.headers.get("sec-websocket-protocol") || "";
  const readable = makeReadable(server, earlyData);
  const remote: { value: Socket | null } = { value: null };

  void readable.pipeTo(new WritableStream<Uint8Array>({
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
  })).catch((error) => console.error(JSON.stringify({ message: "tunnel pipe failed", error: error instanceof Error ? error.message : String(error) })));

  return new Response(null, { status: 101, webSocket: client });
}

async function handleTcp(remote: { value: Socket | null }, header: ParsedHeader, prxIP: string, webSocket: WebSocket): Promise<void> {
  const [prxHost, prxPort] = prxIP.split(/[:=-]/);
  const socket = connect({ hostname: prxHost || header.addressRemote, port: Number(prxPort) || header.portRemote });
  remote.value = socket;
  const writer = socket.writable.getWriter();
  await writer.write(header.rawClientData);
  writer.releaseLock();
  void socket.readable.pipeTo(new WritableStream<Uint8Array>({
    write: (chunk, controller) => {
      if (webSocket.readyState !== WS_OPEN) return controller.error("webSocket not open");
      webSocket.send(chunk);
    },
  })).catch((error) => console.error(JSON.stringify({ message: "tunnel socket read failed", error: error instanceof Error ? error.message : String(error) })));
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
  const error = (message: string): ParsedHeader => ({ hasError: true, message, isUDP: false, addressRemote: "", portRemote: 0, rawClientData: buffer });
  if (!buffer || buffer.byteLength < 24) return error("invalid VLESS header length");
  const view = new DataView(buffer);
  const commandIndex = 18 + view.getUint8(17);
  if (buffer.byteLength < commandIndex + 1) return error("truncated command");
  if (view.getUint8(commandIndex) === 2) return { ...error("UDP not supported"), isUDP: true };
  const portIndex = commandIndex + 1;
  if (buffer.byteLength < portIndex + 2) return error("truncated port");
  const portRemote = view.getUint16(portIndex);
  const typeIndex = portIndex + 2;
  if (buffer.byteLength < typeIndex + 1) return error("truncated address type");
  let valueIndex = typeIndex + 1;
  let addressRemote = "";
  if (view.getUint8(typeIndex) === 1) {
    if (buffer.byteLength < valueIndex + 4) return error("truncated IPv4");
    const bytes = new Uint8Array(buffer);
    addressRemote = [bytes[valueIndex], bytes[valueIndex + 1], bytes[valueIndex + 2], bytes[valueIndex + 3]].join(".");
    valueIndex += 4;
  } else if (view.getUint8(typeIndex) === 2) {
    if (buffer.byteLength < valueIndex + 1) return error("truncated domain length");
    const length = view.getUint8(valueIndex++);
    if (buffer.byteLength < valueIndex + length) return error("truncated domain");
    addressRemote = new TextDecoder().decode(buffer.slice(valueIndex, valueIndex + length));
    valueIndex += length;
  } else if (view.getUint8(typeIndex) === 3) {
    if (buffer.byteLength < valueIndex + 16) return error("truncated IPv6");
    for (let index = 0; index < 8; index++) addressRemote += `${index ? ":" : ""}${view.getUint16(valueIndex + index * 2).toString(16)}`;
    valueIndex += 16;
  } else return error(`invalid address type ${view.getUint8(typeIndex)}`);
  return { hasError: false, isUDP: false, addressRemote, portRemote, rawClientData: buffer.slice(valueIndex) };
}

function makeReadable(server: WebSocket, earlyDataHeader: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      server.addEventListener("message", (event) => controller.enqueue(new Uint8Array(event.data as ArrayBuffer)));
      server.addEventListener("close", () => controller.close());
      server.addEventListener("error", (event) => controller.error(event));
      const earlyData = base64ToArrayBuffer(earlyDataHeader);
      if (earlyData instanceof Error) controller.error(earlyData);
      else if (earlyData) controller.enqueue(new Uint8Array(earlyData));
    },
    cancel() { safeClose(server); },
  });
}

function safeClose(socket: WebSocket): void {
  try {
    if (socket.readyState === WS_OPEN || socket.readyState === WS_CLOSING) socket.close();
  } catch (error) {
    console.error(JSON.stringify({ message: "websocket close failed", error: error instanceof Error ? error.message : String(error) }));
  }
}

function base64ToArrayBuffer(value: string): ArrayBuffer | null | Error {
  if (!value) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

type Socket = ReturnType<typeof connect>;
