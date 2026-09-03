// Pure VLESS handshake framing helpers (no Cloudflare imports → unit-testable).
// Used by relay.ts to BUFFER short first WebSocket messages until the full
// VLESS header is present, instead of throwing RangeError in DataView.getUint16.

export const MAX_HANDSHAKE_BYTES = 8192;
export const HANDSHAKE_TIMEOUT_MS = 10000;

// Total VLESS header length (ver + uuid + opt + cmd + port + address) for a
// VLESS-shaped buffer (first byte 0x00). Returns:
//   > 0  exact header length required before parsing is safe
//   = 0  not VLESS-shaped, or deterministically invalid (bad cmd/addrType)
//        → parse immediately on the legacy path
//   = -1 cannot tell yet → keep buffering
export function vlessHeaderLength(buf: Uint8Array): number {
  if (buf.length < 18) return -1;
  if (buf[0] !== 0) return 0;
  const opt = buf[17];
  const cmdIdx = 18 + opt;
  // need cmd(1) + port(2) + addrType(1) to decide the address length
  if (buf.length < cmdIdx + 4) return -1;
  const cmd = buf[cmdIdx];
  if (cmd !== 1 && cmd !== 2 && cmd !== 3) return 0;
  const addrType = buf[cmdIdx + 3];
  if (addrType === 1) return cmdIdx + 3 + 1 + 4; // IPv4
  if (addrType === 3) return cmdIdx + 3 + 1 + 16; // IPv6
  if (addrType === 2) {
    // domain: addrType(1) + len(1) + name(len); len byte sits at cmdIdx+4
    if (buf.length < cmdIdx + 5) return -1;
    return cmdIdx + 5 + buf[cmdIdx + 4];
  }
  return 0;
}

export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
