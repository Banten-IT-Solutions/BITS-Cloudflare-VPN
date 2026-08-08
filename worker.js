import { connect } from "cloudflare:sockets";

let serviceName = "";
let APP_DOMAIN = "";

let prxIP = "";
let cachedPrxList = [];

const horse = "dHJvamFu";
const flash = "dm1lc3M=";
const neko = "dmxlc3M=";
const v2 = "djJyYXk=";

const PORTS = [443, 80];
const PROTOCOLS = [atob(neko), atob(horse), atob(flash)];
const KV_PRX_URL =
  "https://raw.githubusercontent.com/bitscoid/BITS-Cloudflare-VPN/main/KV.json";
const PRX_BANK_URL =
  "https://raw.githubusercontent.com/bitscoid/BITS-Cloudflare-VPN/main/proxy.txt";
const DNS_SERVER_ADDRESS = "8.8.8.8";
const DNS_SERVER_PORT = 53;
const RELAY_SERVER_UDP = {
  host: "udp-relay.hobihaus.space", // Kontribusi atau cek relay publik disini: https://hub.docker.com/r/kelvinzer0/udp-relay
  port: 7300,
};
const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;
const CORS_HEADER_OPTIONS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// VMess AEAD salt constants
const SALT_A1 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgS2V5X0xlbmd0aA==");
const SALT_A2 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgTm9uY2VfTGVuZ3Ro");
const SALT_A3 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgS2V5");
const SALT_A4 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgTm9uY2U=");
const SALT_B1 = atob("QUVBRCBSZXNwIEhlYWRlciBMZW4gS2V5");
const SALT_B2 = atob("QUVBRCBSZXNwIEhlYWRlciBMZW4gSVY=");
const SALT_B3 = atob("QUVBRCBSZXNwIEhlYWRlciBLZXk=");
const SALT_B4 = atob("QUVBRCBSZXNwIEhlYWRlciBJVg==");

async function getKVPrxList(kvPrxUrl = KV_PRX_URL) {
  if (!kvPrxUrl) {
    throw new Error("No URL Provided!");
  }

  const kvPrx = await fetch(kvPrxUrl);
  if (kvPrx.status == 200) {
    return await kvPrx.json();
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
  }

  return cachedPrxList;
}

function htmlPage(title, body, domain) {
  const safeTitle = title.replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<style>
  :root { --bg:#0b1020; --card:#131a2e; --line:#223052; --txt:#e6ecff; --mut:#8fa3cc; --acc:#5b8cff; --ok:#37d67a; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--txt); font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:40px 16px; }
  .wrap { width:100%; max-width:720px; }
  h1 { font-size:26px; margin-bottom:4px; letter-spacing:.3px; }
  .sub { color:var(--mut); margin-bottom:24px; font-size:14px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px; margin-bottom:16px; }
  .card h2 { font-size:16px; margin-bottom:12px; }
  .row { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:12px; }
  label { display:block; font-size:12px; color:var(--mut); margin-bottom:4px; }
  select, input { width:100%; background:#0d1426; color:var(--txt); border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-size:14px; }
  .btn { background:var(--acc); color:#fff; border:0; border-radius:8px; padding:10px 18px; font-size:14px; cursor:pointer; font-weight:600; }
  .btn:hover { filter:brightness(1.1); }
  .btn.ghost { background:transparent; border:1px solid var(--line); color:var(--txt); }
  textarea { width:100%; background:#0d1426; color:var(--txt); border:1px solid var(--line); border-radius:8px; padding:10px; font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; min-height:180px; resize:vertical; }
  .url { background:#0d1426; border:1px solid var(--line); border-radius:8px; padding:10px; font:12px ui-monospace,Menlo,monospace; color:var(--acc); word-break:break-all; margin-bottom:12px; }
  code { background:#0d1426; border:1px solid var(--line); border-radius:5px; padding:1px 6px; font-size:13px; }
  .ok { color:var(--ok); }
  a { color:var(--acc); text-decoration:none; }
  a:hover { text-decoration:underline; }
  .pill { display:inline-block; background:#0d1426; border:1px solid var(--line); border-radius:999px; padding:3px 12px; font-size:12px; color:var(--mut); margin:0 6px 8px 0; }
  .foot { color:var(--mut); font-size:12px; text-align:center; margin-top:24px; }
  .flex2 { flex:1 1 160px; }
  .note { font-size:13px; color:var(--mut); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:12px; }
</style>
</head>
<body>
<div class="wrap">
  ${body}
  <div class="foot">${domain} &middot; Banten IT Solutions &middot; gratis, tidak perlu bayar</div>
</div>
</body>
</html>`;
}

function renderHomePage(domain, service) {
  const subUrl = `${domain}/sub`;
  const apiUrl = `${domain}/api/v1/sub`;
  const body = `
  <h1>${service}</h1>
  <div class="sub">Tunnel VPN serverless di Cloudflare Workers &mdash; VLESS / VMess / Trojan via WebSocket (CDN)</div>

  <div class="card">
    <h2>Status</h2>
    <div><span class="pill">✅ Worker aktif</span><span class="pill">Endpoint: <code>wss://${domain}</code></span><span class="pill">Proto: VLESS &middot; VMess &middot; Trojan</span></div>
    <p class="note" style="margin-top:8px">Semua subdomain wildcard (<code>*.${domain.split(".").slice(1).join(".")}</code>) juga melayani tunnel ini.</p>
  </div>

  <div class="card">
    <h2>Mulai cepat</h2>
    <ol style="padding-left:20px; margin-bottom:10px">
      <li>Buka <a href="${subUrl}">halaman subscription</a> di browser.</li>
      <li>Atur protokol &amp; jumlah akun, lalu salin URL subscription (format <code>v2ray</code>).</li>
      <li>Import URL tersebut di aplikasi VPN (v2rayN, v2rayNG, Nekoray, dsb.).</li>
    </ol>
    <div class="url">${apiUrl}?vpn=vless&limit=10&format=v2ray</div>
  </div>

  <div class="card">
    <h2>Parameter API</h2>
    <div class="grid">
      <div><label>vpn</label><code>vless</code>, <code>vmess</code>, <code>trojan</code> (default <code>vless</code>)</div>
      <div><label>cc</label>kode negara <code>ID</code>,<code>SG</code>,&hellip;</div>
      <div><label>port</label><code>443</code>,<code>80</code></div>
      <div><label>limit</label>jumlah akun (default <code>10</code>)</div>
      <div><label>format</label><code>raw</code> atau <code>v2ray</code></div>
      <div><label>domain</label>SNI/domain isian</div>
    </div>
  </div>

  <div class="card">
    <h2>Lainnya</h2>
    <p class="note"><a href="/api/v1/myip">/api/v1/myip</a> &mdash; cek IP &amp; colo kamu saat ini.</p>
  </div>
  `;
  return htmlPage(`${service} &mdash; VPN`, body, domain);
}

function renderSubPage(domain, service) {
  const body = `
  <h1>Subscription</h1>
  <div class="sub">Generate link akun VPN di <code>${domain}</code> &mdash; default: <b>VLESS</b></div>

  <div class="card">
    <h2>Pengaturan</h2>
    <div class="row">
      <div class="flex2"><label>Protokol (vpn)</label>
        <select id="vpn" multiple size="3">
          <option value="vless" selected>vless</option>
          <option value="vmess">vmess</option>
          <option value="trojan">trojan</option>
        </select>
      </div>
      <div class="flex2"><label>Negara (cc, kosong = semua)</label><input id="cc" placeholder="ID,SG,JP"></div>
    </div>
    <div class="row">
      <div class="flex2"><label>Port</label>
        <select id="port"><option>443</option><option>80</option></select>
      </div>
      <div class="flex2"><label>Jumlah akun (limit)</label><input id="limit" type="number" value="10" min="1" max="200"></div>
    </div>
    <div class="row">
      <div class="flex2"><label>Format</label>
        <select id="format"><option value="v2ray">v2ray (base64)</option><option value="raw">raw</option></select>
      </div>
    </div>
    <button class="btn" id="gen">Generate</button>
  </div>

  <div class="card" id="result" style="display:none">
    <h2>URL Subscription <span class="ok">&#10003;</span></h2>
    <div class="url" id="suburl"></div>
    <div class="row">
      <button class="btn" id="copy">Salin URL</button>
      <button class="btn ghost" id="dl">Unduh file</button>
    </div>
    <h2 style="margin-top:8px">Pratinjau akun</h2>
    <textarea id="preview" readonly></textarea>
  </div>

<script>
const base = "https://${domain}";
const el = (id) => document.getElementById(id);
el("gen").addEventListener("click", gen);
el("copy").addEventListener("click", () => { navigator.clipboard.writeText(el("suburl").textContent); el("copy").textContent = "Tersalin!"; setTimeout(()=>el("copy").textContent="Salin URL",1500); });
el("dl").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = el("suburl").textContent;
  a.download = "sub.txt";
  a.click();
});
async function gen() {
  const p = new URLSearchParams();
  const vpns = [...el("vpn").selectedOptions].map(o=>o.value);
  if (vpns.length) p.set("vpn", vpns.join(","));
  if (el("cc").value.trim()) p.set("cc", el("cc").value.trim());
  p.set("port", el("port").value);
  p.set("limit", el("limit").value || "10");
  p.set("format", el("format").value);
  const url = base + "/api/v1/sub?" + p.toString();
  el("suburl").textContent = url;
  el("preview").value = "Memuat...";
  el("result").style.display = "";
  try {
    const r = await fetch(url);
    const t = await r.text();
    el("preview").value = r.ok ? t : ("Error " + r.status + "\\n" + t);
  } catch (e) {
    el("preview").value = "Gagal: " + e;
  }
}
</script>
  `;
  return htmlPage("Subscription", body, domain);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      APP_DOMAIN = url.hostname;
      serviceName = APP_DOMAIN.split(".")[0];

      const upgradeHeader = request.headers.get("Upgrade");

      if (upgradeHeader === "websocket") {
        const prxMatch = url.pathname.match(/^\/(.+[:=-]\d+)$/);

        if (url.pathname.length == 3 || url.pathname.match(",")) {
          const prxKeys = url.pathname.replace("/", "").toUpperCase().split(",");
          const prxKey = prxKeys[Math.floor(Math.random() * prxKeys.length)];
          const kvPrx = await getKVPrxList();

          prxIP = kvPrx[prxKey][Math.floor(Math.random() * kvPrx[prxKey].length)];

          return await websocketHandler(request);
        } else if (prxMatch) {
          prxIP = prxMatch[1];
          return await websocketHandler(request);
        }
      }

      if (url.pathname.startsWith("/sub")) {
        return new Response(renderSubPage(APP_DOMAIN, serviceName), {
          status: 200,
          headers: {
            ...CORS_HEADER_OPTIONS,
            "Content-Type": "text/html; charset=utf-8",
          },
        });
      } else if (url.pathname.startsWith("/check")) {
        const target = url.searchParams.get("target").split(":");
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

        if (apiPath.startsWith("/sub")) {
          const filterCC = url.searchParams.get("cc")?.split(",") || [];
          const filterPort = url.searchParams.get("port")?.split(",") || PORTS;
          const filterVPN = url.searchParams.get("vpn")?.split(",").filter((p) => PROTOCOLS.includes(p)) || [];
          const protocols =
            filterVPN.length ? filterVPN : [atob(neko)];
          const filterLimit = parseInt(url.searchParams.get("limit")) || 10;
          const filterFormat = url.searchParams.get("format") || "raw";
          const fillerDomain = url.searchParams.get("domain") || APP_DOMAIN;

          const prxBankUrl = url.searchParams.get("prx-list") || env.PRX_BANK_URL || PRX_BANK_URL;
          const prxList = await getPrxList(prxBankUrl)
            .then((prxs) => {
              if (filterCC.length) {
                return prxs.filter((prx) => filterCC.includes(prx.country));
              }
              return prxs;
            })
            .then((prxs) => {
              shuffleArray(prxs);
              return prxs;
            });

          const uuid = crypto.randomUUID();
          const result = [];
          for (const prx of prxList) {
            const uri = new URL(`${atob(horse)}://${fillerDomain}`);
            uri.searchParams.set("encryption", "none");
            uri.searchParams.set("type", "ws");
            uri.searchParams.set("host", APP_DOMAIN);

            for (const port of filterPort) {
              for (const protocol of protocols) {
                if (result.length >= filterLimit) break;

                uri.protocol = protocol;
                uri.port = port.toString();
                uri.username = uuid;

                uri.searchParams.set("security", port == 443 ? "tls" : "none");
                uri.searchParams.set("sni", port == 80 && protocol == atob(flash) ? "" : APP_DOMAIN);
                uri.searchParams.set("path", `/${prx.prxIP}-${prx.prxPort}`);

                uri.hash = `${result.length + 1} ${getFlagEmoji(prx.country)} ${prx.org} WS ${
                  port == 443 ? "TLS" : "NTLS"
                } [BITS Cloudflare VPN]`;
                result.push(uri.toString());
              }
            }
          }

          let finalResult = "";
          switch (filterFormat) {
            case "raw":
              finalResult = result.join("\n");
              break;
            case atob(v2):
              finalResult = btoa(result.join("\n"));
              break;
            default:
              return new Response(
                `Unsupported format "${filterFormat}". Supported formats: raw, ${atob(v2)}.`,
                {
                  status: 400,
                  headers: {
                    ...CORS_HEADER_OPTIONS,
                  },
                },
              );
          }

          return new Response(finalResult, {
            status: 200,
            headers: {
              ...CORS_HEADER_OPTIONS,
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

      return new Response(renderHomePage(APP_DOMAIN, serviceName), {
        status: 200,
        headers: {
          ...CORS_HEADER_OPTIONS,
          "Content-Type": "text/html; charset=utf-8",
        },
      });
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

async function websocketHandler(request) {
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
          let protocolHeader;

          if (protocol === atob(horse)) {
            protocolHeader = readHorseHeader(chunk);
          } else if (protocol === atob(flash)) {
            protocolHeader = await readStreamHeader(chunk);
          } else if (protocol === atob(neko)) {
            protocolHeader = readNekoHeader(chunk);
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

async function protocolSniffer(buffer) {
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
      if (arrayBufferToHex(protocolUuid).match(/^[0-9a-f]{8}[0-9a-f]{4}4[0-9a-f]{3}[89ab][0-9a-f]{3}[0-9a-f]{12}$/i)) {
        return atob(neko);
      }
    }
  }

  return atob(flash);
}

async function generateStreamResponseHeader(responseOptions, encKey, encIv) {
  try {
    // Hash the key and IV from request header - NOTE: swapped compared to variable names!
    // In Rust: key = SHA256(key)[..16], iv = SHA256(iv)[..16]
    // Then use these for KDF base
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

async function handleTCPOutBound(
  remoteSocket,
  addressRemote,
  portRemote,
  rawClientData,
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

async function handleUDPOutbound(targetAddress, targetPort, dataChunk, webSocket, responseHeader, log, relay) {
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
  } catch (e) {
    console.error(`Error while handling UDP outbound: ${e.message}`);
  }
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

async function md5(...inputs) {
  const combined = new Uint8Array(inputs.reduce((acc, input) => acc + input.length, 0));
  let offset = 0;
  for (const input of inputs) {
    combined.set(new Uint8Array(input), offset);
    offset += input.length;
  }
  const hashBuffer = await crypto.subtle.digest("MD5", combined);
  return new Uint8Array(hashBuffer);
}

async function sha256(input) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(hashBuffer);
}

async function kdf(key, path) {
  // VMess KDF custom recursive HMAC
  // Reference: https://github.com/v2ray/v2ray-core/blob/master/common/crypto/auth.go

  async function hmacSha256(key, data) {
    const hmacKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", hmacKey, data);
    return new Uint8Array(signature);
  }

  async function recursiveHash(keyBytes, innerHashFn) {
    return async (data) => {
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

  const sha256Hash = async (data) => {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  };

  let currentHashFn = await recursiveHash(new TextEncoder().encode("VMess AEAD KDF"), sha256Hash);

  for (const salt of path) {
    const saltBytes = typeof salt === "string" ? new TextEncoder().encode(salt) : new Uint8Array(salt);
    currentHashFn = await recursiveHash(saltBytes, currentHashFn);
  }

  return await currentHashFn(key);
}

async function aesGcmDecrypt(key, nonce, data, aad) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"]);

  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, cryptoKey, data);
    return new Uint8Array(decrypted);
  } catch (e) {
    throw new Error("AEAD decryption failed: " + e.message);
  }
}

async function aesGcmEncrypt(key, nonce, data, aad) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["encrypt"]);

  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad }, cryptoKey, data);
  return new Uint8Array(encrypted);
}

// Stream Protocol Handler
async function readStreamHeader(buffer) {
  try {
    const uuidString = "00000000-0000-0000-0000-000000000000";
    const uuidBytes = new Uint8Array(
      uuidString
        .replace(/-/g, "")
        .match(/.{1,2}/g)
        .map((byte) => parseInt(byte, 16)),
    );

    // Auth key = MD5(UUID + config salt)
    const authKey = await md5(
      uuidBytes,
      new TextEncoder().encode(atob("YzQ4NjE5ZmUtOGYwMi00OWUwLWI5ZTktZWRmNzYzZTE3ZTIx")),
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

    // Parse decrypted header
    const view = new DataView(headerPayload.buffer);
    let offset = 0;

    // Version (1 byte)
    const version = view.getUint8(offset);
    offset += 1;
    if (version !== 1) {
      return { hasError: true, message: `Invalid protocol version: ${version}` };
    }

    // IV (16 bytes)
    const encIv = new Uint8Array(headerPayload.slice(offset, offset + 16));
    offset += 16;

    // Key (16 bytes)
    const encKey = new Uint8Array(headerPayload.slice(offset, offset + 16));
    offset += 16;

    // Options (4 bytes)
    const options = new Uint8Array(headerPayload.slice(offset, offset + 4));
    offset += 4;

    // Command (1 byte)
    const cmd = view.getUint8(offset);
    offset += 1;
    const isUDP = cmd !== 0x01;

    // Port (2 bytes, big-endian)
    const portRemote = view.getUint16(offset, false);
    offset += 2;

    // Address Type (1 byte)
    const addressType = view.getUint8(offset);
    offset += 1;
    let addressRemote = "";

    // Parse address following Rust implementation
    switch (addressType) {
      case 1: // IPv4
        addressRemote = `${view.getUint8(offset)}.${view.getUint8(offset + 1)}.${view.getUint8(offset + 2)}.${view.getUint8(offset + 3)}`;
        offset += 4;
        break;
      case 2: // Domain (same as case 3 in Rust)
      case 3: // Domain
        const domainLength = view.getUint8(offset);
        offset += 1;
        addressRemote = new TextDecoder().decode(headerPayload.slice(offset, offset + domainLength));
        offset += domainLength;
        break;
      case 4: // IPv6
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

    // Calculate raw data index: authId (16) + encryptedLength (18) + nonce (8) + encrypted header payload (headerLength + 16 GCM tag)
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
  } catch (e) {
    return {
      hasError: true,
      message: "Stream header parsing failed: " + e.message,
    };
  }
}

function readNekoHeader(buffer) {
  const version = new Uint8Array(buffer.slice(0, 1));
  let isUDP = false;

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
    case 1: // For IPv4
      addressLength = 4;
      addressValue = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 2: // For Domain
      addressLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 3: // For IPv6
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

function readHorseHeader(buffer) {
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
    case 1: // For IPv4
      addressLength = 4;
      addressValue = new Uint8Array(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength)).join(".");
      break;
    case 3: // For Domain
      addressLength = new Uint8Array(dataBuffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(dataBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 4: // For IPv6
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
  const start = Date.now();
  const timeoutMs = 5000;
  try {
    const socket = connect({ hostname: prxIP, port: Number(prxPort) });

    // Jika koneksi gagal (host unreachable, port tertutup), promise `closed`
    // akan reject. Jika koneksi sukses, koneksi tetap terbuka hingga timeout,
    // yang kita anggap sebagai proxy hidup.
    await Promise.race([
      socket.closed.catch((error) => {
        throw error;
      }),
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
  } catch (error) {
    return {
      ip: prxIP,
      port: prxPort,
      success: false,
      latency: Date.now() - start,
      error: error?.message || String(error),
    };
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

function arrayBufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function shuffleArray(array) {
  let currentIndex = array.length;

  while (currentIndex != 0) {
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
}

function getFlagEmoji(isoCode) {
  const codePoints = isoCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
