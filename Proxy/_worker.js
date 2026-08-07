import { connect } from "cloudflare:sockets";

let cachedPrxList = [];
let cachedPrxListAt = 0;
let cachedKvPrxList = null;
let cachedKvPrxListAt = 0;
let cachedProxyHealthChecks = new Map();

// Constant
const neko = "dmxlc3M=";

const PORTS = [443, 80];
const PROTOCOLS = [atob(neko)];
const KV_PRX_URL = "https://raw.githubusercontent.com/bitscoid/Cloudflare-VPN/refs/heads/main/Proxy/kvProxyList.json";
const PRX_BANK_URL = "https://raw.githubusercontent.com/bitscoid/Cloudflare-VPN/refs/heads/main/Proxy/proxyList.txt";
const PROXY_LIST_TTL_MS = 5 * 60 * 1000;
const PROXY_HEALTH_TTL_MS = 15 * 1000;
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const CORS_HEADER_OPTIONS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

async function getKVPrxList(kvPrxUrl = KV_PRX_URL) {
  if (!kvPrxUrl) {
    throw new Error("No URL Provided!");
  }

  if (cachedKvPrxList && Date.now() - cachedKvPrxListAt < PROXY_LIST_TTL_MS) {
    return cachedKvPrxList;
  }

  const kvPrx = await fetch(kvPrxUrl);
  if (kvPrx.status == 200) {
    cachedKvPrxList = await kvPrx.json();
    cachedKvPrxListAt = Date.now();
    return cachedKvPrxList;
  } else {
    return {};
  }
}

async function getPrxList(prxBankUrl = PRX_BANK_URL) {
  /**
   * Format:
   *
   * <IP>,<Port>,<Country ID>,<ORG>
   * Contoh:
   * 1.1.1.1,443,SG,Cloudflare Inc.
   */
  if (!prxBankUrl) {
    throw new Error("No URL Provided!");
  }

  if (cachedPrxList.length && Date.now() - cachedPrxListAt < PROXY_LIST_TTL_MS) {
    return cachedPrxList;
  }

  const prxBank = await fetch(prxBankUrl);
  if (prxBank.status == 200) {
    const text = (await prxBank.text()) || "";

    const prxString = text.split("\n").filter(Boolean);
    cachedPrxList = prxString
      .map((entry) => {
        const [prxIP, prxPort, country, org] = entry.split(",");
        return {
          prxIP: prxIP || "Unknown",
          prxPort: prxPort || "Unknown",
          country: country || "Unknown",
          org: org || "Unknown Org",
        };
        })
      .filter(Boolean);
    cachedPrxListAt = Date.now();
  }

  return cachedPrxList;
}

function decodeURIComponentSafe(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const appDomain = url.hostname;

      const upgradeHeader = request.headers.get("Upgrade");

      // Handle prx client
      if (upgradeHeader === "websocket") {
        const prxMatch = url.pathname.match(/^\/(.+[:=-]\d+)$/);
        let prxIP = "";

        if (url.pathname.length == 3 || url.pathname.match(",")) {
          // Contoh: /ID, /SG, dll
          const prxKeys = url.pathname.replace("/", "").toUpperCase().split(",");
          const prxKey = prxKeys[Math.floor(Math.random() * prxKeys.length)];
          const kvPrx = await getKVPrxList();

          prxIP = kvPrx[prxKey][Math.floor(Math.random() * kvPrx[prxKey].length)];

          return await websocketHandler(request, prxIP);
        } else if (prxMatch) {
          prxIP = prxMatch[1];
          return await websocketHandler(request, prxIP);
        }
      }

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...CORS_HEADER_OPTIONS,
          },
        });
      }

      if (url.pathname.startsWith("/check")) {
        const target = (url.searchParams.get("target") || "").split(":");
        const result = await checkPrxHealth(target[0], target[1] || "443");

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            ...CORS_HEADER_OPTIONS,
            "Content-Type": "application/json",
          },
        });
      } else if (url.pathname.startsWith("/api/v1")) {
        const apiPath = url.pathname.replace("/api/v1", "");

        if (apiPath.startsWith("/check")) {
          const targetQuery = url.searchParams.get("target") || url.searchParams.get("ip") || url.searchParams.get("") || "";
          const target = targetQuery.split(":");
          if (!target[0]) {
            return new Response("Missing target or ip query", {
              status: 400,
              headers: {
                ...CORS_HEADER_OPTIONS,
              },
            });
          }

          const result = await checkPrxHealth(target[0], target[1] || "443");
          const cfData = request.cf || {};
          const responseData = {
            proxy: result.result?.proxy || target[0],
            port: parseInt(result.result?.port || target[1] || "443"),
            proxyip: result.result?.proxyip || false,
            delay: result.result?.delay || 0,
            ip: target[0],
            colo: request.headers.get("cf-ray")?.split("-")[1] || "",
            longitude: cfData.longitude || "",
            httpProtocol: request.headers.get("httpProtocol") || "HTTP/2",
            continent: cfData.continent || "",
            asn: cfData.asn || 0,
            country: cfData.country || "",
            tlsVersion: "",
            city: cfData.city || "",
            timezone: cfData.timezone || "",
            postalCode: cfData.postalCode || "",
            region: cfData.region || "",
            latitude: cfData.latitude || "",
            regionCode: cfData.regionCode || "",
            asOrganization: cfData.asOrganization || "",
            ...(result.error ? { error: result.error, message: result.message } : {}),
          };
          return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: {
              ...CORS_HEADER_OPTIONS,
              "Content-Type": "application/json",
            },
          });
        } else if (apiPath.startsWith("/myip")) {
          return new Response(
            JSON.stringify({
              ip:
                request.headers.get("cf-connecting-ipv6") ||
                request.headers.get("cf-connecting-ip") ||
                request.headers.get("x-real-ip"),
              colo: request.headers.get("cf-ray")?.split("-")[1],
              ...request.cf,
            }),
            {
              headers: {
                ...CORS_HEADER_OPTIONS,
              },
            },
          );
        }
      }

      const redirectUrl = new URL(request.url);
      redirectUrl.hostname = env.REVERSE_PRX_TARGET || "bits-vpn.bits.co.id";
      redirectUrl.port = "";
      return Response.redirect(redirectUrl.toString(), 301);
    } catch (err) {
      return new Response(`An error occurred: ${err.toString()}`, {
        status: 500,
        headers: {
          ...CORS_HEADER_OPTIONS,
        },
      });
    }
  },
};

async function websocketHandler(request, prxIP) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);

  webSocket.accept();

  let addressLog = "";
  let portLog = "";
  const log = (info, event) => {
    console.log(`[${addressLog}:${portLog}] ${info}`, event || "");
  };
  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";

  const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);

  let remoteSocketWrapper = {
    value: null,
  };

  readableWebSocketStream
    .pipeTo(
      new WritableStream({
        async write(chunk, controller) {
          if (remoteSocketWrapper.value) {
            const writer = remoteSocketWrapper.value.writable.getWriter();
            await writer.write(chunk);
            writer.releaseLock();
            return;
          }

          const protocolHeader = readNekoHeader(chunk);

          addressLog = protocolHeader.addressRemote;
          portLog = `${protocolHeader.portRemote} -> ${protocolHeader.isUDP ? "UDP" : "TCP"}`;

          if (protocolHeader.hasError) {
            throw new Error(protocolHeader.message);
          }

          const responseHeader = protocolHeader.version;

          if (protocolHeader.isUDP) {
            log(`unsupported VLESS command for ${protocolHeader.addressRemote}:${protocolHeader.portRemote}`);
            safeCloseWebSocket(webSocket);
            controller.error("unsupported VLESS command");
            return;
          }

          return await handleTCPOutBound(
            remoteSocketWrapper,
            protocolHeader.addressRemote,
            protocolHeader.portRemote,
            protocolHeader.rawClientData,
            prxIP,
            webSocket,
            responseHeader,
            log,
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

async function handleTCPOutBound(
  remoteSocket,
  addressRemote,
  portRemote,
  rawClientData,
  prxIP,
  webSocket,
  responseHeader,
  log,
) {
  async function connectAndWrite(address, port) {
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
      prxIP.split(/[:=-]/)[1] || portRemote,
    );
    tcpSocket.closed
      .catch((error) => {
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

function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
  let readableStreamCancel = false;
  const stream = new ReadableStream({
    start(controller) {
      webSocketServer.addEventListener("message", (event) => {
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
      webSocketServer.addEventListener("error", (err) => {
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

function readNekoHeader(buffer) {
  if (!buffer || buffer.byteLength < 24) {
    return {
      hasError: true,
      message: "invalid VLESS header length",
    };
  }

  const version = new Uint8Array(buffer.slice(0, 1));
  let isUDP = false;

  const optLength = new Uint8Array(buffer.slice(17, 18))[0];
  const commandIndex = 18 + optLength;
  if (buffer.byteLength < commandIndex + 1) {
    return {
      hasError: true,
      message: "truncated VLESS command",
    };
  }

  const cmd = new Uint8Array(buffer.slice(commandIndex, commandIndex + 1))[0];
  if (cmd === 1) {
  } else if (cmd === 2) {
    isUDP = true;
  } else {
    return {
      hasError: true,
      message: `command ${cmd} is not supported`,
    };
  }
  const portIndex = commandIndex + 1;
  if (buffer.byteLength < portIndex + 2) {
    return {
      hasError: true,
      message: "truncated VLESS port",
    };
  }
  const portBuffer = buffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);

  let addressIndex = portIndex + 2;
  if (buffer.byteLength < addressIndex + 1) {
    return {
      hasError: true,
      message: "truncated VLESS address type",
    };
  }
  const addressBuffer = new Uint8Array(buffer.slice(addressIndex, addressIndex + 1));

  const addressType = addressBuffer[0];
  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressValue = "";
  switch (addressType) {
    case 1: // For IPv4
      addressLength = 4;
      if (buffer.byteLength < addressValueIndex + addressLength) {
        return {
          hasError: true,
          message: "truncated IPv4 address",
        };
      }
      addressValue = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 2: // For Domain
      if (buffer.byteLength < addressValueIndex + 1) {
        return {
          hasError: true,
          message: "truncated domain length",
        };
      }
      addressLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      if (buffer.byteLength < addressValueIndex + addressLength) {
        return {
          hasError: true,
          message: "truncated domain address",
        };
      }
      addressValue = new TextDecoder().decode(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 3: // For IPv6
      addressLength = 16;
      if (buffer.byteLength < addressValueIndex + addressLength) {
        return {
          hasError: true,
          message: "truncated IPv6 address",
        };
      }
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

  const rawDataIndex = addressValueIndex + addressLength;
  if (buffer.byteLength < rawDataIndex) {
    return {
      hasError: true,
      message: "invalid VLESS payload length",
    };
  }

  return {
    hasError: false,
    addressRemote: addressValue,
    addressType: addressType,
    portRemote: portRemote,
    rawDataIndex,
    rawClientData: buffer.slice(rawDataIndex),
    version: new Uint8Array([version[0], 0]),
    isUDP: isUDP,
  };
}

async function remoteSocketToWS(remoteSocket, webSocket, responseHeader, retry, log) {
  let header = responseHeader;
  let hasIncomingData = false;
  await remoteSocket.readable
    .pipeTo(
      new WritableStream({
        start() {},
        async write(chunk, controller) {
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
        abort(reason) {
          console.error(`remoteConnection!.readable abort`, reason);
        },
      }),
    )
    .catch((error) => {
      console.error(`remoteSocketToWS has exception `, error.stack || error);
      safeCloseWebSocket(webSocket);
    });
  if (hasIncomingData === false && retry) {
    log(`retry`);
    retry();
  }
}

function safeCloseWebSocket(socket) {
  try {
    if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
      socket.close();
    }
  } catch (error) {
    console.error("safeCloseWebSocket error", error);
  }
}

async function checkPrxHealth(prxIP, prxPort) {
  const cacheKey = `${prxIP}:${prxPort}`;
  const cached = cachedProxyHealthChecks.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < PROXY_HEALTH_TTL_MS) {
    return cached.value;
  }

  const start = Date.now();
  const parsedPort = Number.parseInt(String(prxPort || ""), 10);
  const tlsPorts = new Set([443, 8443, 2053, 2083, 2087, 2096]);
  const scheme = tlsPorts.has(parsedPort) ? "https" : "http";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    await fetch(`${scheme}://${prxIP}:${prxPort}`, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const result = {
      error: false,
      result: {
        proxy: prxIP,
        port: prxPort,
        proxyip: true,
        delay: Date.now() - start,
      },
    };
    cachedProxyHealthChecks.set(cacheKey, { value: result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    const timeoutMs = 2000;
    const measured = Date.now() - start;
    const result = {
      error: true,
      message: err?.message || "failed",
      result: {
        proxy: prxIP,
        port: prxPort,
        proxyip: false,
        delay: measured >= timeoutMs ? timeoutMs : 0,
      },
    };
    cachedProxyHealthChecks.set(cacheKey, { value: result, cachedAt: Date.now() });
    return result;
  }
}

// Helpers
function base64ToArrayBuffer(base64Str) {
  if (!base64Str) {
    return { error: null };
  }
  try {
    base64Str = base64Str.replace(/-/g, "+").replace(/_/g, "/");
    const decode = atob(base64Str);
    const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
    return { earlyData: arryBuffer.buffer, error: null };
  } catch (error) {
    return { error };
  }
}

function shuffleArray(array) {
  let currentIndex = array.length;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {
    // Pick a remaining element...
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
}

function reverse(s) {
  return s.split("").reverse().join("");
}

function getFlagEmoji(isoCode) {
  const codePoints = isoCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
