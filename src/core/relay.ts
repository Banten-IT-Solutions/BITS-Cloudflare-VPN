// Relay WebSocket handler + protocol parsers (verbatim from worker.js lines 418-1167)
import { connect } from "cloudflare:sockets";
import {
  DNS_SERVER_ADDRESS,
  DNS_SERVER_PORT,
  RELAY_SERVER_UDP,
  WS_READY_STATE_OPEN,
  WS_READY_STATE_CLOSING,
  SALT_A1,
  SALT_A2,
  SALT_A3,
  SALT_A4,
  SALT_B1,
  SALT_B2,
  SALT_B3,
  SALT_B4,
  horse,
  flash,
  neko,
  base64ToArrayBuffer,
  arrayBufferToHex,
  sha224Hex,
} from "./constants";

export async function websocketHandler(request: Request, prxIP: string, vmessUuid?: string, trojanPasswordHashes?: string[]) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);

  webSocket.accept();

  let addressLog = "";
  let portLog = "";
  const log = (info: string, event?: any) => {
    console.log(`[${addressLog}:${portLog}] ${info}`, event || "");
  };
  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";

  const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

  let remoteSocketWrapper = {
    value: null as any,
  };
  let isDNS = false;

  readableWebSocketStream
    .pipeTo(
      new WritableStream({
        async write(chunk, controller) {
          if (isDNS) {
            return handleUDPOutbound(
              DNS_SERVER_ADDRESS,
              DNS_SERVER_PORT,
              chunk,
              webSocket,
              null,
              log,
              RELAY_SERVER_UDP,
            );
          }
          if (remoteSocketWrapper.value) {
            const writer = remoteSocketWrapper.value.writable.getWriter();
            await writer.write(chunk);
            writer.releaseLock();
            return;
          }

          const protocol = await protocolSniffer(chunk);
          let protocolHeader: any;

          if (protocol === atob(horse)) {
            protocolHeader = readHorseHeader(chunk, trojanPasswordHashes);
          } else if (protocol === atob(flash)) {
            protocolHeader = await readStreamHeader(chunk, vmessUuid);
          } else if (protocol === atob(neko)) {
            protocolHeader = readNekoHeader(chunk, vmessUuid);
          } else {
            throw new Error("Unknown Protocol!");
          }

          addressLog = protocolHeader.addressRemote;
          portLog = `${protocolHeader.portRemote} -> ${protocolHeader.isUDP ? "UDP" : "TCP"}`;

          if (protocolHeader.hasError) {
            throw new Error(protocolHeader.message);
          }

          let responseHeader = protocolHeader.version;
          if (protocol === atob(flash) && protocolHeader.needsResponse) {
            responseHeader = await generateStreamResponseHeader(
              protocolHeader.responseOptions,
              protocolHeader.encKey,
              protocolHeader.encIv,
            );
          }

          if (protocolHeader.isUDP) {
            if (protocolHeader.portRemote === 53) {
              isDNS = true;
              return handleUDPOutbound(
                DNS_SERVER_ADDRESS,
                DNS_SERVER_PORT,
                chunk,
                webSocket,
                responseHeader,
                log,
                RELAY_SERVER_UDP,
              );
            }

            return handleUDPOutbound(
              protocolHeader.addressRemote,
              protocolHeader.portRemote,
              chunk,
              webSocket,
              responseHeader,
              log,
              RELAY_SERVER_UDP,
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
            prxIP,
          );
        },
        close() {
          log(`readableWebSocketStream is close`);
        },
        abort(reason) {
          log(`readableWebSocketStream is abort`, JSON.stringify(reason));
        },
      }),
    )
    .catch((err) => {
      log("readableWebSocketStream pipeTo error", err);
    });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

async function protocolSniffer(buffer: ArrayBuffer) {
  if (buffer.byteLength >= 62) {
    const horseDelimiter = new Uint8Array(buffer.slice(56, 60));
    if (horseDelimiter[0] === 0x0d && horseDelimiter[1] === 0x0a) {
      if (horseDelimiter[2] === 0x01 || horseDelimiter[2] === 0x03 || horseDelimiter[2] === 0x7f) {
        if (horseDelimiter[3] === 0x01 || horseDelimiter[3] === 0x03 || horseDelimiter[3] === 0x04) {
          return atob(horse);
        }
      }
    }
  }

  if (buffer.byteLength >= 18) {
    const version = new Uint8Array(buffer.slice(0, 1))[0];
    if (version === 0) {
      const protocolUuid = new Uint8Array(buffer.slice(1, 17));
      if (arrayBufferToHex(protocolUuid.buffer as ArrayBuffer).match(/^[0-9a-f]{8}[0-9a-f]{4}4[0-9a-f]{3}[89ab][0-9a-f]{3}[0-9a-f]{12}$/i)) {
        return atob(neko);
      }
    }
  }

  return atob(flash);
}

async function generateStreamResponseHeader(responseOptions: Uint8Array, encKey: Uint8Array, encIv: Uint8Array) {
  try {
    const key = (await sha256(encKey)).slice(0, 16);
    const iv = (await sha256(encIv)).slice(0, 16);

    const lengthKey = (await kdf(key, [SALT_B1])).slice(0, 16);
    const lengthIv = (await kdf(iv, [SALT_B2])).slice(0, 12);

    const lengthData = new Uint8Array(2);
    lengthData[0] = 0;
    lengthData[1] = 4;

    const encryptedLength = await aesGcmEncrypt(lengthKey, lengthIv, lengthData, new Uint8Array(0));

    const headerPayload = new Uint8Array([
      responseOptions[0],
      0x00,
      0x00,
      0x00,
    ]);

    const payloadKey = (await kdf(key, [SALT_B3])).slice(0, 16);
    const payloadIv = (await kdf(iv, [SALT_B4])).slice(0, 12);

    const encryptedPayload = await aesGcmEncrypt(payloadKey, payloadIv, headerPayload, new Uint8Array(0));

    const response = new Uint8Array(encryptedLength.length + encryptedPayload.length);
    response.set(encryptedLength, 0);
    response.set(encryptedPayload, encryptedLength.length);

    return response;
  } catch (e) {
    console.error("Failed to generate stream response:", e);
    return new Uint8Array(0);
  }
}

function isDestinationSafe(address: string, port: number): boolean {
  if (port < 1 || port > 65535 || isNaN(port)) {
    return false;
  }

  const addr = address.trim().toLowerCase();

  // Basic Hostname SSRF Checks
  if (addr === "localhost" || addr.endsWith(".local") || addr.endsWith(".internal")) {
    return false;
  }

  // IPv4 Checks
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = addr.match(ipv4Regex);
  if (match) {
    const octets = match.slice(1).map(x => parseInt(x, 10));
    if (octets.some(o => o < 0 || o > 255)) return false;

    const [o1, o2, o3, o4] = octets;

    // 127.0.0.0/8 (Loopback)
    if (o1 === 127) return false;
    // 10.0.0.0/8 (Private)
    if (o1 === 10) return false;
    // 172.16.0.0/12 (Private)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return false;
    // 192.168.0.0/16 (Private)
    if (o1 === 192 && o2 === 168) return false;
    // 169.254.0.0/16 (Link-Local)
    if (o1 === 169 && o2 === 254) return false;
    // 100.64.0.0/10 (Carrier-Grade NAT)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return false;
    // 0.0.0.0/8 (Current network)
    if (o1 === 0) return false;
    // Multicast & Broadcast
    if (o1 >= 224) return false;
  }

  // IPv6 Checks
  if (addr.includes(":")) {
    // Loopback ::1
    if (addr === "::1" || addr === "0:0:0:0:0:0:0:1") return false;
    // Link-local fe80::/10
    if (addr.startsWith("fe80:") || addr.startsWith("fe80::")) return false;
    // Unique local fc00::/7
    if (addr.startsWith("fc") || addr.startsWith("fd")) return false;
    // Unspecified ::
    if (addr === "::" || addr === "0:0:0:0:0:0:0:0") return false;
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
  prxIP: string,
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
    log(`connected to ${address}:${port}`);
    const writer = tcpSocket.writable.getWriter();
    await writer.write(rawClientData);
    writer.releaseLock();

    return tcpSocket;
  }

  async function retry() {
    const tcpSocket = await connectAndWrite(
      prxIP.split(/[:=-]/)[0] || addressRemote,
      parseInt(prxIP.split(/[:=-]/)[1]) || portRemote,
    );
    tcpSocket.closed
      .catch((error: any) => {
        console.log("retry tcpSocket closed error", error);
      })
      .finally(() => {
        safeCloseWebSocket(webSocket);
      });
    remoteSocketToWS(tcpSocket, webSocket, responseHeader, null, log);
  }

  const tcpSocket = await connectAndWrite(addressRemote, portRemote);

  remoteSocketToWS(tcpSocket, webSocket, responseHeader, retry, log);
}

async function handleUDPOutbound(targetAddress: string, targetPort: number, dataChunk: ArrayBuffer, webSocket: any, responseHeader: any, log: any, relay: any) {
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
    const relayMessage = new Uint8Array(headerBuffer.length + separator.length + dataChunk.byteLength);
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
        close() {
          log(`UDP connection to ${targetAddress} closed`);
        },
        abort(reason) {
          console.error(`UDP connection aborted due to ${reason}`);
        },
      }),
    );
  } catch (e: any) {
    console.error(`Error while handling UDP outbound: ${e.message}`);
  }
}

function makeReadableWebSocketStream(webSocketServer: any, earlyDataHeader: string, log: any) {
  let readableStreamCancel = false;
  const stream = new ReadableStream({
    start(controller) {
      webSocketServer.addEventListener("message", (event: any) => {
        if (readableStreamCancel) {
          return;
        }
        const message = event.data;
        controller.enqueue(message);
      });
      webSocketServer.addEventListener("close", () => {
        safeCloseWebSocket(webSocketServer);
        if (readableStreamCancel) {
          return;
        }
        controller.close();
      });
      webSocketServer.addEventListener("error", (err: any) => {
        log("webSocketServer has error");
        controller.error(err);
      });
      const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
      if (error) {
        controller.error(error);
      } else if (earlyData) {
        controller.enqueue(earlyData);
      }
    },

    pull(controller) {},
    cancel(reason) {
      if (readableStreamCancel) {
        return;
      }
      log(`ReadableStream was canceled, due to ${reason}`);
      readableStreamCancel = true;
      safeCloseWebSocket(webSocketServer);
    },
  });

  return stream;
}

async function md5(...inputs: ArrayBuffer[]) {
  const combined = new Uint8Array(inputs.reduce((acc, input) => acc + input.byteLength, 0));
  let offset = 0;
  for (const input of inputs) {
    combined.set(new Uint8Array(input), offset);
    offset += input.byteLength;
  }
  const hashBuffer = await crypto.subtle.digest("MD5", combined.buffer as ArrayBuffer);
  return new Uint8Array(hashBuffer);
}

async function sha256(input: Uint8Array) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", input.buffer as ArrayBuffer);
  return new Uint8Array(hashBuffer);
}

async function kdf(key: Uint8Array, path: (string | Uint8Array)[]) {
  async function hmacSha256(key: Uint8Array, data: Uint8Array) {
    const hmacKey = await crypto.subtle.importKey("raw", key.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", hmacKey, data.buffer as ArrayBuffer);
    return new Uint8Array(signature);
  }

  async function recursiveHash(keyBytes: Uint8Array, innerHashFn: (data: Uint8Array) => Promise<Uint8Array>) {
    return async (data: Uint8Array) => {
      const ipad = new Uint8Array(64);
      const opad = new Uint8Array(64);

      ipad.set(keyBytes.slice(0, Math.min(64, keyBytes.length)));
      opad.set(keyBytes.slice(0, Math.min(64, keyBytes.length)));

      for (let i = 0; i < 64; i++) {
        ipad[i] ^= 0x36;
        opad[i] ^= 0x5c;
      }

      const innerData = new Uint8Array(ipad.length + data.length);
      innerData.set(ipad);
      innerData.set(data, ipad.length);
      const innerResult = await innerHashFn(innerData);

      const outerData = new Uint8Array(opad.length + innerResult.length);
      outerData.set(opad);
      outerData.set(innerResult, opad.length);
      return await innerHashFn(outerData);
    };
  }

  const sha256Hash = async (data: Uint8Array) => {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer));
  };

  let currentHashFn = await recursiveHash(new TextEncoder().encode("VMess AEAD KDF"), sha256Hash);

  for (const salt of path) {
    const saltBytes = typeof salt === "string" ? new TextEncoder().encode(salt) : new Uint8Array(salt);
    currentHashFn = await recursiveHash(saltBytes, currentHashFn);
  }

  return await currentHashFn(key);
}

async function aesGcmDecrypt(key: Uint8Array, nonce: Uint8Array, data: Uint8Array, aad: Uint8Array) {
  const cryptoKey = await crypto.subtle.importKey("raw", key.buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["decrypt"]);

  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce.buffer as ArrayBuffer, additionalData: aad.buffer as ArrayBuffer }, cryptoKey, data.buffer as ArrayBuffer);
    return new Uint8Array(decrypted);
  } catch (e: any) {
    throw new Error("AEAD decryption failed: " + e.message);
  }
}

async function aesGcmEncrypt(key: Uint8Array, nonce: Uint8Array, data: Uint8Array, aad: Uint8Array) {
  const cryptoKey = await crypto.subtle.importKey("raw", key.buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt"]);

  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce.buffer as ArrayBuffer, additionalData: aad.buffer as ArrayBuffer }, cryptoKey, data.buffer as ArrayBuffer);
  return new Uint8Array(encrypted);
}

async function readStreamHeader(buffer: ArrayBuffer, vmessUuid?: string) {
  try {
    // VMess AEAD auth key is derived from the user UUID + fixed salt.
    // Use the UUID derived from SUB_TOKEN so links from /api/sub can connect;
    // fall back to the legacy all-zero UUID for backwards compatibility.
    const uuidString = vmessUuid || "00000000-0000-0000-0000-000000000000";
    const uuidBytes = new Uint8Array(
      uuidString
        .replace(/-/g, "")
        .match(/.{1,2}/g)!
        .map((byte) => parseInt(byte, 16)),
    );

    const authKey = await md5(
      uuidBytes.buffer,
      new TextEncoder().encode(atob("YzQ4NjE5ZmUtOGYwMi00OWUwLWI5ZTktZWRmNzYzZTE3ZTIx")).buffer,
    );

    const authId = new Uint8Array(buffer.slice(0, 16));
    const encryptedLength = new Uint8Array(buffer.slice(16, 34));
    const nonce = new Uint8Array(buffer.slice(34, 42));

    const lengthKey = (await kdf(authKey, [SALT_A1, authId, nonce])).slice(0, 16);
    const lengthIv = (await kdf(authKey, [SALT_A2, authId, nonce])).slice(0, 12);

    const lengthBytes = await aesGcmDecrypt(lengthKey, lengthIv, encryptedLength, authId);
    const headerLength = (lengthBytes[0] << 8) | lengthBytes[1];

    const encryptedHeader = new Uint8Array(buffer.slice(42, 42 + headerLength + 16));

    const payloadKey = (await kdf(authKey, [SALT_A3, authId, nonce])).slice(0, 16);
    const payloadIv = (await kdf(authKey, [SALT_A4, authId, nonce])).slice(0, 12);

    const headerPayload = await aesGcmDecrypt(payloadKey, payloadIv, encryptedHeader, authId);

    const view = new DataView(headerPayload.buffer);
    let offset = 0;

    const version = view.getUint8(offset);
    offset += 1;
    if (version !== 1) {
      return { hasError: true, message: `Invalid protocol version: ${version}` };
    }

    const encIv = new Uint8Array(headerPayload.slice(offset, offset + 16));
    offset += 16;

    const encKey = new Uint8Array(headerPayload.slice(offset, offset + 16));
    offset += 16;

    const options = new Uint8Array(headerPayload.slice(offset, offset + 4));
    offset += 4;

    const cmd = view.getUint8(offset);
    offset += 1;
    const isUDP = cmd !== 0x01;

    const portRemote = view.getUint16(offset, false);
    offset += 2;

    const addressType = view.getUint8(offset);
    offset += 1;
    let addressRemote = "";

    switch (addressType) {
      case 1:
        addressRemote = `${view.getUint8(offset)}.${view.getUint8(offset + 1)}.${view.getUint8(offset + 2)}.${view.getUint8(offset + 3)}`;
        offset += 4;
        break;
      case 2:
      case 3:
        const domainLength = view.getUint8(offset);
        offset += 1;
        addressRemote = new TextDecoder().decode(headerPayload.slice(offset, offset + domainLength));
        offset += domainLength;
        break;
      case 4:
        const ipv6Parts = [];
        for (let i = 0; i < 8; i++) {
          ipv6Parts.push(view.getUint16(offset + i * 2, false).toString(16));
        }
        addressRemote = ipv6Parts.join(":");
        offset += 16;
        break;
      default:
        return { hasError: true, message: `Invalid address type: ${addressType} (hex: 0x${addressType.toString(16)})` };
    }

    const rawDataIndex = 42 + headerLength + 16;

    return {
      hasError: false,
      addressRemote,
      addressType,
      portRemote,
      rawDataIndex,
      rawClientData: buffer.slice(rawDataIndex),
      version: new Uint8Array([options[0], 0]),
      isUDP,
      needsResponse: true,
      responseOptions: options,
      encKey: encKey,
      encIv: encIv,
    };
  } catch (e: any) {
    return {
      hasError: true,
      message: "Stream header parsing failed: " + e.message,
    };
  }
}

function readNekoHeader(buffer: ArrayBuffer, expectedUuid?: string) {
  const version = new Uint8Array(buffer.slice(0, 1));
  let isUDP = false;

  // Strict auth: the VLESS client UUID (bytes 1-16) must match the UUID
  // derived from SUB_TOKEN. If no expected UUID is configured, skip check.
  if (expectedUuid) {
    const clientUuidHex = arrayBufferToHex(buffer.slice(1, 17));
    const expectedHex = expectedUuid.replace(/-/g, "").toLowerCase();
    if (clientUuidHex !== expectedHex) {
      return {
        hasError: true,
        message: "Invalid VLESS UUID",
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
  let addressValue = "";
  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 2:
      addressLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 3:
      addressLength = 16;
      const dataView = new DataView(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
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
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex: addressValueIndex + addressLength,
    rawClientData: buffer.slice(addressValueIndex + addressLength),
    version: new Uint8Array([version[0], 0]),
    isUDP: isUDP,
  };
}

function readHorseHeader(buffer: ArrayBuffer, expectedPasswordHashes?: string[]) {
  // Strict auth: the Trojan header carries hex(SHA224(password)) in the first
  // 56 bytes (followed by CRLF at 56-57). Accept if it matches ANY of the
  // expected hashes:
  //   - sha224Hex(SUB_TOKEN)            -> client configured with raw SUB_TOKEN
  //   - sha224Hex(sha224Hex(SUB_TOKEN)) -> client used the hashed sub link password
  // If no expected hashes are configured, skip the check.
  if (expectedPasswordHashes && expectedPasswordHashes.length) {
    const headerHashHex = new TextDecoder().decode(buffer.slice(0, 56)).toLowerCase();
    const accepted = expectedPasswordHashes.some((h) => h.toLowerCase() === headerHashHex);
    if (!accepted) {
      return {
        hasError: true,
        message: "Invalid Trojan password",
      };
    }
  }

  const dataBuffer = buffer.slice(58);
  if (dataBuffer.byteLength < 6) {
    return {
      hasError: true,
      message: "invalid request data",
    };
  }

  let isUDP = false;
  const view = new DataView(dataBuffer);
  const cmd = view.getUint8(0);
  if (cmd == 3) {
    isUDP = true;
  } else if (cmd != 1) {
    throw new Error("Unsupported command type!");
  }

  let addressType = view.getUint8(1);
  let addressLength = 0;
  let addressValueIndex = 2;
  let addressValue = "";
  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 3:
      addressLength = new Uint8Array(dataBuffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 4:
      addressLength = 16;
      const dataView = new DataView(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `invalid addressType is ${addressType}`,
      };
  }

  if (!addressValue) {
    return {
      hasError: true,
      message: `address is empty, addressType is ${addressType}`,
    };
  }

  const portIndex = addressValueIndex + addressLength;
  const portBuffer = dataBuffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex: portIndex + 4,
    rawClientData: dataBuffer.slice(portIndex + 4),
    version: null,
    isUDP: isUDP,
  };
}

async function remoteSocketToWS(remoteSocket: any, webSocket: any, responseHeader: any, retry: any, log: any) {
  let header = responseHeader;
  let hasIncomingData = false;
  await remoteSocket.readable
    .pipeTo(
      new WritableStream({
        start() {},
        async write(chunk: any, controller: any) {
          hasIncomingData = true;
          if (webSocket.readyState !== WS_READY_STATE_OPEN) {
            controller.error("webSocket.readyState is not open, maybe close");
          }
          if (header) {
            webSocket.send(await new Blob([header, chunk]).arrayBuffer());
            header = null;
          } else {
            webSocket.send(chunk);
          }
        },
        close() {
          log(`remoteConnection!.readable is close with hasIncomingData is ${hasIncomingData}`);
        },
        abort(reason: any) {
          console.error(`remoteConnection!.readable abort`, reason);
        },
      }),
    )
    .catch((error: any) => {
      console.error(`remoteSocketToWS has exception `, error.stack || error);
      safeCloseWebSocket(webSocket);
    });
  if (hasIncomingData === false && retry) {
    log(`retry`);
    retry();
  }
}

function safeCloseWebSocket(socket: any) {
  try {
    if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
      socket.close();
    }
  } catch (error) {
    console.error("safeCloseWebSocket error", error);
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
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
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
