// Constants dari worker.js (baris 1-45 + helpers)

export const horse = "dHJvamFu";
export const flash = "dm1lc3M=";
export const neko = "dmxlc3M=";
export const v2 = "djJyYXk=";

export const PORTS = [443, 80];
export const PROTOCOLS = [atob(neko), atob(horse), atob(flash)];
export const KV_PRX_URL =
  "https://raw.githubusercontent.com/bitscoid/BITS-Cloudflare-VPN/main/KV.json";
export const PRX_BANK_URL =
  "https://raw.githubusercontent.com/bitscoid/BITS-Cloudflare-VPN/main/proxy.txt";
export const DNS_SERVER_ADDRESS = "8.8.8.8";
export const DNS_SERVER_PORT = 53;
export const RELAY_SERVER_UDP = {
  host: "udp-relay.hobihaus.space",
  port: 7300,
};
export const WS_READY_STATE_OPEN = 1;
export const WS_READY_STATE_CLOSING = 2;
export const CORS_HEADER_OPTIONS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// VMess AEAD salt constants
export const SALT_A1 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgS2V5X0xlbmd0aA==");
export const SALT_A2 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgTm9uY2VfTGVuZ3Ro");
export const SALT_A3 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgS2V5");
export const SALT_A4 = atob("Vk1lc3MgSGVhZGVyIEFFQUQgTm9uY2U=");
export const SALT_B1 = atob("QUVBRCBSZXNwIEhlYWRlciBMZW4gS2V5");
export const SALT_B2 = atob("QUVBRCBSZXNwIEhlYWRlciBMZW4gSVY=");
export const SALT_B3 = atob("QUVBRCBSZXNwIEhlYWRlciBLZXk=");
export const SALT_B4 = atob("QUVBRCBSZXNwIEhlYWRlciBJVg==");

// Helper functions
export function getFlagEmoji(isoCode: string): string {
  const codePoints = isoCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function shuffleArray<T>(array: T[]): void {
  let currentIndex = array.length;
  while (currentIndex != 0) {
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
}

export function base64ToArrayBuffer(base64Str: string): { earlyData?: ArrayBuffer; error: any } {
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

export function arrayBufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
