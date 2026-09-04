// VLESS-over-WebSocket relay: handshake framing, TCP/UDP forwarding, DNS.
import { connect } from 'cloudflare:sockets';
import {
  DNS_SERVER_ADDRESS,
  DNS_SERVER_PORT,
  RELAY_SERVER_UDP,
  WS_READY_STATE_OPEN,
  WS_READY_STATE_CLOSING,
  neko,
  base64ToArrayBuffer,
  arrayBufferToHex,
} from './constants';
import {
  vlessHeaderLength,
  concatBytes,
  MAX_HANDSHAKE_BYTES,
  HANDSHAKE_TIMEOUT_MS,
} from './header';

const VLESS_PROTO = atob(neko);

export async function websocketHandler(request: Request, prxIP: string, expectedUuid?: string) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);

  webSocket.accept();

  let addressLog = '';
  let portLog = '';
  const log = (info: string, event?: any) => {
    console.log(`[${addressLog}:${portLog}] ${info}`, event || '');
  };
  const earlyDataHeader = request.headers.get('sec-websocket-protocol') || '';

  const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader);

  let remoteSocketWrapper = {
    value: null as any,
  };
  let isDNS = false;

  // Pre-parse handshake buffer: accumulate short first WS messages until the
  // full VLESS header is present (prevents RangeError on split handshakes).
  let headerParsed = false;
  let headerBuf: Uint8Array | null = null;
  let headerTimer: any = null;
  const clearHeaderTimer = () => {
    if (headerTimer) {
      clearTimeout(headerTimer);
      headerTimer = null;
    }
  };

  readableWebSocketStream
    .pipeTo(
      new WritableStream({
        async write(chunk) {
          if (!headerParsed) {
            const incoming =
              typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
            headerBuf = headerBuf ? concatBytes(headerBuf, incoming) : incoming;
            if (headerBuf.length > MAX_HANDSHAKE_BYTES) {
              clearHeaderTimer();
              safeCloseWebSocket(webSocket);
              return;
            }
            const need = vlessHeaderLength(headerBuf);
            if (need !== 0 && (need < 0 || headerBuf.length < need)) {
              if (!headerTimer) {
                headerTimer = setTimeout(() => {
                  try {
                    webSocket.close();
                  } catch {}
                }, HANDSHAKE_TIMEOUT_MS);
              }
              return;
            }
            clearHeaderTimer();
            chunk = headerBuf.slice().buffer as ArrayBuffer;
            headerParsed = true;
          }
          if (isDNS) {
            return handleUDPOutbound(
              DNS_SERVER_ADDRESS,
              DNS_SERVER_PORT,
              chunk,
              webSocket,
              null,
              log,
              RELAY_SERVER_UDP
            );
          }
          if (remoteSocketWrapper.value) {
            const writer = remoteSocketWrapper.value.writable.getWriter();
            await writer.write(chunk);
            writer.releaseLock();
            return;
          }

          const protocol = protocolSniffer(chunk);
          if (protocol !== VLESS_PROTO) {
            safeCloseWebSocket(webSocket);
            return;
          }
          const protocolHeader: any = readNekoHeader(chunk, expectedUuid);

          addressLog = protocolHeader.addressRemote;
          portLog = `${protocolHeader.portRemote} -> ${protocolHeader.isUDP ? 'UDP' : 'TCP'}`;

          if (protocolHeader.hasError) {
            safeCloseWebSocket(webSocket);
            return;
          }

          const responseHeader = protocolHeader.version;

          if (protocolHeader.isUDP) {
            if (protocolHeader.portRemote === 53) {
              isDNS = true;
              return handleUDPOutbound(
                DNS_SERVER_ADDRESS,
                DNS_SERVER_PORT,
                protocolHeader.rawClientData,
                webSocket,
                responseHeader,
                log,
                RELAY_SERVER_UDP
              );
            }

            return handleUDPOutbound(
              protocolHeader.addressRemote,
              protocolHeader.portRemote,
              protocolHeader.rawClientData,
              webSocket,
              responseHeader,
              log,
              RELAY_SERVER_UDP
            );
          }

          handleTCPOutBound(
            remoteSocketWrapper,
            protocolHeader.addressRemote,
            protocolHeader.portRemote,
            protocolHeader.rawClientData,
            webSocket,
            responseHeader,
            log,
            prxIP
          ).catch(() => {});
        },
        close() {
          clearHeaderTimer();
        },
        abort() {},
      })
    )
    .catch(() => {});

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function protocolSniffer(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength >= 18) {
    const version = new Uint8Array(buffer.slice(0, 1))[0];
    if (version === 0) {
      const protocolUuid = new Uint8Array(buffer.slice(1, 17));
      if (
        arrayBufferToHex(protocolUuid.buffer as ArrayBuffer).match(
          /^[0-9a-f]{8}[0-9a-f]{4}4[0-9a-f]{3}[89ab][0-9a-f]{3}[0-9a-f]{12}$/i
        )
      ) {
        return VLESS_PROTO;
      }
    }
  }
  return null;
}

function isReservedIPv4(o1: number, o2: number): boolean {
  // 127.0.0.0/8 (Loopback)
  if (o1 === 127) return true;
  // 10.0.0.0/8 (Private)
  if (o1 === 10) return true;
  // 172.16.0.0/12 (Private)
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (o1 === 192 && o2 === 168) return true;
  // 169.254.0.0/16 (Link-Local)
  if (o1 === 169 && o2 === 254) return true;
  // 100.64.0.0/10 (Carrier-Grade NAT)
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
  // 0.0.0.0/8 (Current network)
  if (o1 === 0) return true;
  // Multicast & Broadcast
  if (o1 >= 224) return true;
  return false;
}

function isDestinationSafe(address: string, port: number): boolean {
  if (port < 1 || port > 65535 || isNaN(port)) {
    return false;
  }

  const addr = address.trim().toLowerCase();

  // Basic Hostname SSRF Checks
  if (addr === 'localhost' || addr.endsWith('.local') || addr.endsWith('.internal')) {
    return false;
  }

  // IPv4 Checks
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = addr.match(ipv4Regex);
  if (match) {
    const octets = match.slice(1).map(x => parseInt(x, 10));
    if (octets.some(o => o < 0 || o > 255)) return false;
    if (isReservedIPv4(octets[0], octets[1])) return false;
  }

  // IPv6 Checks
  if (addr.includes(':')) {
    // Loopback ::1
    if (addr === '::1' || addr === '0:0:0:0:0:0:0:1') return false;
    // Link-local fe80::/10
    if (addr.startsWith('fe80:') || addr.startsWith('fe80::')) return false;
    // Unique local fc00::/7
    if (addr.startsWith('fc') || addr.startsWith('fd')) return false;
    // Unspecified ::
    if (addr === '::' || addr === '0:0:0:0:0:0:0:0') return false;
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — check embedded IPv4.
    const groups = addr.split(':');
    if (groups.length === 8 && groups[5] === 'ffff' && groups.slice(0, 5).every(g => g === '0')) {
      const hi = parseInt(groups[6] || '0', 16) || 0;
      if (isReservedIPv4((hi >> 8) & 0xff, hi & 0xff)) return false;
    }
  }

  return true;
}

async function handleTCPOutBound(
  remoteSocket: any,
  addressRemote: string,
  portRemote: number,
  rawClientData: ArrayBuffer,
  webSocket: any,
  responseHeader: any,
  log: any,
  prxIP: string
) {
  // Validate outbound destination (SSRF Protection)
  if (!isDestinationSafe(addressRemote, portRemote)) {
    log(`Blocked unsafe connection to ${addressRemote}:${portRemote}`);
    safeCloseWebSocket(webSocket);
    return;
  }
  async function connectAndWrite(address: string, port: number) {
    const tcpSocket = connect({
      hostname: address,
      port: port,
    });
    remoteSocket.value = tcpSocket;
    const writer = tcpSocket.writable.getWriter();
    await writer.write(rawClientData);
    writer.releaseLock();

    return tcpSocket;
  }

  async function retry() {
    const [relayHost = addressRemote, relayPortStr] = prxIP.split(/[:=-]/);
    const relayPort = parseInt(relayPortStr) || portRemote;
    if (!isDestinationSafe(relayHost, relayPort)) {
      log(`Blocked unsafe relay ${relayHost}:${relayPort}`);
      safeCloseWebSocket(webSocket);
      return;
    }
    try {
      const tcpSocket = await connectAndWrite(relayHost, relayPort);
      tcpSocket.closed
        .catch(() => {})
        .finally(() => {
          safeCloseWebSocket(webSocket);
        });
      remoteSocketToWS(tcpSocket, webSocket, responseHeader, null);
    } catch {
      safeCloseWebSocket(webSocket);
    }
  }

  let tcpSocket;
  try {
    tcpSocket = await connectAndWrite(addressRemote, portRemote);
  } catch {
    // Direct dial failed — fall back to relay instead of hanging / dying.
    await retry();
    return;
  }

  remoteSocketToWS(tcpSocket, webSocket, responseHeader, retry);
}

async function handleUDPOutbound(
  targetAddress: string,
  targetPort: number,
  dataChunk: ArrayBuffer,
  webSocket: any,
  responseHeader: any,
  log: any,
  relay: any
) {
  // Validate outbound destination (SSRF Protection)
  if (!isDestinationSafe(targetAddress, targetPort)) {
    log(`Blocked unsafe UDP connection to ${targetAddress}:${targetPort}`);
    return;
  }
  try {
    let protocolHeader = responseHeader;

    const tcpSocket = connect({
      hostname: relay.host,
      port: relay.port,
    });

    const header = `udp:${targetAddress}:${targetPort}`;
    const headerBuffer = new TextEncoder().encode(header);
    const separator = new Uint8Array([0x7c]);
    const relayMessage = new Uint8Array(
      headerBuffer.length + separator.length + dataChunk.byteLength
    );
    relayMessage.set(headerBuffer, 0);
    relayMessage.set(separator, headerBuffer.length);
    relayMessage.set(new Uint8Array(dataChunk), headerBuffer.length + separator.length);

    const writer = tcpSocket.writable.getWriter();
    await writer.write(relayMessage);
    writer.releaseLock();

    await tcpSocket.readable.pipeTo(
      new WritableStream({
        async write(chunk) {
          if (webSocket.readyState === WS_READY_STATE_OPEN) {
            if (protocolHeader) {
              webSocket.send(await new Blob([protocolHeader, chunk]).arrayBuffer());
              protocolHeader = null;
            } else {
              webSocket.send(chunk);
            }
          }
        },
        close() {},
        abort() {},
      })
    );
  } catch (e: any) {
    console.error(`Error while handling UDP outbound: ${e.message}`);
  }
}

function makeReadableWebSocketStream(webSocketServer: any, earlyDataHeader: string) {
  let readableStreamCancel = false;
  const stream = new ReadableStream({
    start(controller) {
      webSocketServer.addEventListener('message', (event: any) => {
        if (readableStreamCancel) {
          return;
        }
        const message = event.data;
        controller.enqueue(message);
      });
      webSocketServer.addEventListener('close', () => {
        safeCloseWebSocket(webSocketServer);
        if (readableStreamCancel) {
          return;
        }
        controller.close();
      });
      webSocketServer.addEventListener('error', (err: any) => {
        controller.error(err);
      });
      const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
      if (error) {
        controller.error(error);
      } else if (earlyData) {
        controller.enqueue(earlyData);
      }
    },

    cancel() {
      if (readableStreamCancel) {
        return;
      }
      readableStreamCancel = true;
      safeCloseWebSocket(webSocketServer);
    },
  });

  return stream;
}

function readNekoHeader(buffer: ArrayBuffer, expectedUuid?: string) {
  const version = new Uint8Array(buffer.slice(0, 1));
  let isUDP = false;

  // Strict auth: the VLESS client UUID (bytes 1-16) must match the UUID
  // derived from SUB_TOKEN. If no expected UUID is configured, skip check.
  if (expectedUuid) {
    const clientUuidHex = arrayBufferToHex(buffer.slice(1, 17));
    const expectedHex = expectedUuid.replace(/-/g, '').toLowerCase();
    if (clientUuidHex !== expectedHex) {
      return {
        hasError: true,
        message: 'Invalid VLESS UUID',
      };
    }
  }

  const optLength = new Uint8Array(buffer.slice(17, 18))[0];

  const cmd = new Uint8Array(buffer.slice(18 + optLength, 18 + optLength + 1))[0];
  if (cmd === 1) {
  } else if (cmd === 2) {
    isUDP = true;
  } else {
    return {
      hasError: true,
      message: `command ${cmd} is not supported`,
    };
  }
  const portIndex = 18 + optLength + 1;
  const portBuffer = buffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);

  let addressIndex = portIndex + 2;
  const addressBuffer = new Uint8Array(buffer.slice(addressIndex, addressIndex + 1));

  const addressType = addressBuffer[0];
  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressValue = '';
  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(
        buffer.slice(addressValueIndex, addressValueIndex + addressLength)
      ).join('.');
      break;
    case 2:
      addressLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(
        buffer.slice(addressValueIndex, addressValueIndex + addressLength)
      );
      break;
    case 3:
      addressLength = 16;
      const dataView = new DataView(
        buffer.slice(addressValueIndex, addressValueIndex + addressLength)
      );
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(':');
      break;
    default:
      return {
        hasError: true,
        message: `invild  addressType is ${addressType}`,
      };
  }
  if (!addressValue) {
    return {
      hasError: true,
      message: `addressValue is empty, addressType is ${addressType}`,
    };
  }

  return {
    hasError: false,
    addressRemote: addressValue,
    portRemote: portRemote,
    rawClientData: buffer.slice(addressValueIndex + addressLength),
    version: new Uint8Array([version[0], 0]),
    isUDP: isUDP,
  };
}

async function remoteSocketToWS(
  remoteSocket: any,
  webSocket: any,
  responseHeader: any,
  retry: any
) {
  let header = responseHeader;
  let hasIncomingData = false;
  await remoteSocket.readable
    .pipeTo(
      new WritableStream({
        async write(chunk: any, controller: any) {
          hasIncomingData = true;
          if (webSocket.readyState !== WS_READY_STATE_OPEN) {
            controller.error('webSocket.readyState is not open, maybe close');
            return;
          }
          if (header) {
            webSocket.send(await new Blob([header, chunk]).arrayBuffer());
            header = null;
          } else {
            webSocket.send(chunk);
          }
        },
        close() {},
        abort() {},
      })
    )
    .catch((error: any) => {
      console.error(`remoteSocketToWS has exception `, error.stack || error);
      safeCloseWebSocket(webSocket);
    });
  if (hasIncomingData === false && retry) {
    retry();
  }
}

function safeCloseWebSocket(socket: any) {
  try {
    if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
      socket.close();
    }
  } catch (error) {
    console.error('safeCloseWebSocket error', error);
  }
}

export async function checkPrxHealth(prxIP: string, prxPort: string) {
  const start = Date.now();
  const timeoutMs = 3000;
  let socket: any;
  try {
    socket = connect({ hostname: prxIP, port: Number(prxPort) });

    // Measure latency when connection is successfully opened (socket.opened),
    // not when connection closes (socket.closed), which can take a long time.
    await Promise.race([
      socket.opened,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);

    try {
      socket.close();
    } catch (_) {}

    return {
      ip: prxIP,
      port: prxPort,
      success: true,
      latency: Date.now() - start,
    };
  } catch (error: any) {
    try {
      socket?.close();
    } catch (_) {}
    return {
      ip: prxIP,
      port: prxPort,
      success: false,
      latency: Date.now() - start,
      error: error?.message || String(error),
    };
  }
}
