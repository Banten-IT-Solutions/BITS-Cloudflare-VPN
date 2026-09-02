// sing-box multiplex (smux/yamux/h2mux) wire codec, byte-exact vs:
//  - github.com/sagernet/sing-mux protocol.go  (handshake ReadRequest / StreamRequest)
//  - github.com/sagernet/sing common/metadata serializer.go (AddrPort: addr THEN port, big-endian)
//  - github.com/sagernet/smux frame.go / session.go (frame header)
// Pure TS — no runtime deps — so tests run under Bun/Node.
//
// Layout
//   multiplex handshake (read by sing-box server.go `ReadRequest`):
//     1B version (0 or 1)
//     1B protocol (0=smux, 1=yamux, 2=h2mux)
//     if version==1:
//       1B padding flag (0/1)
//       if padding flag==1: 2B paddingLen (big-endian) + paddingLen bytes
//   smux frame header (xtaci/smux, LE):  [ver:1][cmd:1][sid:4 LE][len:2 LE] + payload
//     ver 0x01 (v1) or 0x02 (v2)
//     cmd: 0=New(OpenStream), 1=FIN, 2=PSH(data), 3=NOP, 4=UPD(window)
//   per-stream StreamRequest (protocol.go ReadStreamRequest):
//     2B flags (big-endian; bit0 = UDP)
//     then Socksaddr via SocksaddrSerializer (no PortThenAddress => addr THEN port):
//       1B addrType (0x01 IPv4, 0x03 Domain, 0x04 IPv6)
//       addr bytes (IPv4=4, IPv6=16, Domain=1B len + N)
//       2B port (big-endian)

export const SMUX_MUX_ADDR = 'sp.mux.sing-box.arpa';

// multiplex handshake protocol (sing-mux protocol.go)
export const MUX_PROTO_SMX = 0;
export const MUX_PROTO_YAMUX = 1;
export const MUX_PROTO_H2MUX = 2;

// multiplex handshake versions
export const MUX_VERSION_0 = 0;
export const MUX_VERSION_1 = 1;

// smux framing versions (one byte in every smux frame)
export const SMUX_VERSION_1 = 0x01;
export const SMUX_VERSION_2 = 0x02;

// smux cmds
export const SMUX_CMD_SYN = 0x00; // open stream
export const SMUX_CMD_FIN = 0x01; // close stream
export const SMUX_CMD_PSH = 0x02; // data
export const SMUX_CMD_NOP = 0x03; // keepalive
export const SMUX_CMD_UPD = 0x04; // window update

export interface MuxRequest {
  version: number; // 0 | 1
  protocol: number;
  padding: boolean;
}

export interface StreamRequest {
  network: 'tcp' | 'udp';
  host: string;
  port: number;
}

export interface SmuxFrame {
  ver: number;
  cmd: number;
  sid: number;
  payload: Uint8Array;
}

const SMUX_FLAG_UDP = 0x01;
const AF_IPV4 = 0x01;
const AF_FQDN = 0x03;
const AF_IPV6 = 0x04;

// ---- multiplex handshake (ReadRequest / EncodeRequest) ----

export function readMuxRequest(buf: Uint8Array, off = 0): { req: MuxRequest; next: number } | null {
  if (buf.length - off < 2) return null;
  const version = buf[off];
  if (version > MUX_VERSION_1) return null;
  const protocol = buf[off + 1];
  let cursor = off + 2;
  let padding = false;
  if (version === MUX_VERSION_1) {
    if (buf.length - cursor < 1) return null;
    const paddingFlag = buf[cursor];
    cursor += 1;
    if (paddingFlag !== 0 && paddingFlag !== 1) return null;
    padding = paddingFlag === 1;
    if (padding) {
      if (buf.length - cursor < 2) return null;
      const paddingLen = (buf[cursor] << 8) | buf[cursor + 1];
      cursor += 2;
      if (buf.length - cursor < paddingLen) return null;
      cursor += paddingLen;
    }
  }
  return { req: { version, protocol, padding }, next: cursor };
}

export function buildMuxRequest(req: MuxRequest): Uint8Array {
  let total = 2;
  if (req.version === MUX_VERSION_1) {
    total += 1;
    if (req.padding) {
      total += 2 + 256; // deterministic padding length for server->? we never send a request; kept for symmetry
    }
  }
  const out = new Uint8Array(total);
  out[0] = req.version;
  out[1] = req.protocol;
  if (req.version === MUX_VERSION_1) {
    out[2] = req.padding ? 1 : 0;
    // padding length 0 is fine; field present only when flag set
    if (req.padding) {
      new DataView(out.buffer).setUint16(3, 256);
    }
  }
  return out;
}

// ---- smux frames (xtaci) ----

export class SmuxStream {
  private buf: Uint8Array = new Uint8Array(0);
  private off = 0;

  feed(chunk: ArrayBuffer | Uint8Array): void {
    const b = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    const rest = this.buf.length - this.off;
    const merged = new Uint8Array(rest + b.length);
    if (rest > 0) merged.set(this.buf.subarray(this.off));
    merged.set(b, rest);
    this.buf = merged;
    this.off = 0;
  }

  private get avail(): number {
    return this.buf.length - this.off;
  }

  next(): SmuxFrame | null {
    if (this.avail < 8) return null;
    const o = this.off;
    const ver = this.buf[o];
    if (ver !== SMUX_VERSION_1 && ver !== SMUX_VERSION_2) return null;
    const cmd = this.buf[o + 1];
    const sid =
      this.buf[o + 2] | (this.buf[o + 3] << 8) | (this.buf[o + 4] << 16) | (this.buf[o + 5] << 24);
    const len = this.buf[o + 6] | (this.buf[o + 7] << 8);
    if (this.avail < 8 + len) return null;
    const payload = this.buf.slice(o + 8, o + 8 + len);
    this.off = o + 8 + len;
    return { ver, cmd, sid, payload };
  }

  // remaining unparsed bytes — used so callers can read the multiplex handshake first
  peek(): Uint8Array {
    return this.buf.slice(this.off);
  }
  consumed(n: number): void {
    this.off += n;
  }
  free(): void {
    this.buf = new Uint8Array(0);
    this.off = 0;
  }
}

export function buildSmuxFrame(
  cmd: number,
  sid: number,
  payload: Uint8Array = new Uint8Array(0)
): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  out[0] = SMUX_VERSION_1;
  out[1] = cmd;
  const dv = new DataView(out.buffer);
  dv.setUint32(2, sid, true); // LE
  dv.setUint16(6, payload.length, true); // LE
  out.set(payload, 8);
  return out;
}

// ---- per-stream StreamRequest (protocol.go ReadStreamRequest / EncodeStreamRequest) ----

export function readStreamRequest(
  buf: Uint8Array,
  off = 0
): { req: StreamRequest; next: number } | null {
  if (buf.length - off < 2) return null;
  const flags = (buf[off] << 8) | buf[off + 1];
  const udp = (flags & SMUX_FLAG_UDP) !== 0;
  let cursor = off + 2;
  const parsed = parseAddr(buf, cursor);
  if (parsed === null) return null;
  cursor = parsed.end;
  if (buf.length - cursor < 2) return null;
  const port = (buf[cursor] << 8) | buf[cursor + 1];
  cursor += 2;
  return { req: { network: udp ? 'udp' : 'tcp', host: parsed.address, port }, next: cursor };
}

// NOTE: sing-box server-side mux (server.go NewConnectionEx) does NOT send a
// StreamResponse after opening a stream — the client sends a StreamRequest as
// the stream's first bytes and the server dials. So no per-stream response encoder.

function parseAddr(buf: Uint8Array, off: number): { address: string; end: number } | null {
  if (buf.length - off < 1) return null;
  const af = buf[off];
  if (af === AF_IPV4) {
    if (buf.length - off < 5) return null;
    const a = buf.subarray(off + 1, off + 5);
    return { address: `${a[0]}.${a[1]}.${a[2]}.${a[3]}`, end: off + 5 };
  }
  if (af === AF_FQDN) {
    if (buf.length - off < 2) return null;
    const len = buf[off + 1];
    if (buf.length - off < 2 + len) return null;
    return {
      address: new TextDecoder().decode(buf.subarray(off + 2, off + 2 + len)),
      end: off + 2 + len,
    };
  }
  if (af === AF_IPV6) {
    if (buf.length - off < 17) return null;
    const parts: string[] = [];
    for (let i = 0; i < 8; i += 2) {
      parts.push(((buf[off + 1 + i] << 8) | buf[off + 1 + i + 1]).toString(16));
    }
    return { address: parts.join(':'), end: off + 17 };
  }
  return null;
}
