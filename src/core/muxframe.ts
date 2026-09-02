// VLESS Mux (Mux.cool / Xray Mux) byte framing.
// Byte layout verified against xray-core `common/mux` (frame.go, writer.go, reader.go).
// Pure functions — no runtime deps — so tests can run under Bun/Node.

export const STATUS_NEW = 0x01;
export const STATUS_KEEP = 0x02;
export const STATUS_END = 0x03;
export const STATUS_KEEPALIVE = 0x04;

export const OPTION_DATA = 0x01;
export const OPTION_ERROR = 0x02;

export const NET_TCP = 0x01;
export const NET_UDP = 0x02;

const MAX_META_LEN = 512;

const decoder = new TextDecoder();

export interface MuxTarget {
  network: number;
  port: number;
  address: string;
  addrType: number;
}

export interface MuxFrame {
  sessionId: number;
  status: number;
  option: number;
  target: MuxTarget | null;
  payload: Uint8Array;
  hasData: boolean;
}

// Address is type byte + payload (same encoding as VLESS/VMess).
export function parseAddress(buf: Uint8Array, at: number): { address: string; end: number } {
  const addrType = buf[at];
  if (addrType === 1) {
    return {
      address: `${buf[at + 1]}.${buf[at + 2]}.${buf[at + 3]}.${buf[at + 4]}`,
      end: at + 5,
    };
  }
  if (addrType === 2) {
    const len = buf[at + 1];
    return { address: decoder.decode(buf.subarray(at + 2, at + 2 + len)), end: at + 2 + len };
  }
  if (addrType === 3) {
    const parts: string[] = [];
    for (let i = 0; i < 16; i += 2) {
      parts.push(((buf[at + 1 + i] << 8) | buf[at + 1 + i + 1]).toString(16));
    }
    return { address: parts.join(':'), end: at + 17 };
  }
  return { address: '', end: at };
}

// Incremental frame buffer. Feed raw bytes; pull complete frames.
export class MuxStream {
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

  private u16(p: number): number {
    return (this.buf[p] << 8) | this.buf[p + 1];
  }

  next(): MuxFrame | null {
    if (this.avail < 2) return null;
    const metaLen = this.u16(this.off);
    if (metaLen > MAX_META_LEN) {
      // Corrupt stream: drop one byte to attempt resync.
      this.off += 1;
      return null;
    }
    if (this.avail < 2 + metaLen) return null;

    const m = this.off + 2;
    const sessionId = this.u16(m);
    const status = this.buf[m + 2];
    const option = this.buf[m + 3];

    let target: MuxTarget | null = null;
    if (status === STATUS_NEW) {
      const network = this.buf[m + 4];
      const port = this.u16(m + 5);
      const addrType = this.buf[m + 7];
      const parsed = parseAddress(this.buf, m + 7);
      target = { network, port, address: parsed.address, addrType };
    }

    let cursor = this.off + 2 + metaLen;
    const hasData = (option & OPTION_DATA) !== 0;
    let payload = new Uint8Array(0);
    if (hasData) {
      if (this.buf.length - cursor < 2) return null;
      const plen = this.u16(cursor);
      cursor += 2;
      if (this.buf.length - cursor < plen) return null;
      payload = this.buf.slice(cursor, cursor + plen);
      cursor += plen;
    }

    this.off = cursor;
    return { sessionId, status, option, target, payload, hasData };
  }
}

function buildMetaHeader(sessionId: number, status: number, option: number): Uint8Array {
  const h = new Uint8Array(6);
  const dv = new DataView(h.buffer);
  dv.setUint16(0, 4); // metaLen: sid(2)+status(1)+option(1)
  dv.setUint16(2, sessionId);
  h[4] = status;
  h[5] = option;
  return h;
}

// Worker -> client data frame: Keep + Data + length-prefixed payload.
export function buildKeepFrame(sessionId: number, payload: Uint8Array): Uint8Array {
  const header = buildMetaHeader(sessionId, STATUS_KEEP, OPTION_DATA);
  const out = new Uint8Array(header.length + 2 + payload.length);
  out.set(header);
  new DataView(out.buffer).setUint16(header.length, payload.length);
  out.set(payload, header.length + 2);
  return out;
}

// Worker -> client close frame.
export function buildEndFrame(sessionId: number, isError = false): Uint8Array {
  return buildMetaHeader(sessionId, STATUS_END, isError ? OPTION_ERROR : 0);
}

// Client -> worker session open frame (used in tests to round-trip New frames).
export function buildNewFrame(
  sessionId: number,
  address: string,
  port: number,
  payload?: Uint8Array
): Uint8Array {
  const octets = address.split('.');
  let addrBytes: number[];
  let addrType: number;
  if (octets.length === 4 && octets.every(o => /^\d{1,3}$/.test(o))) {
    addrType = 1;
    addrBytes = octets.map(Number);
  } else {
    addrType = 2;
    const te = new TextEncoder().encode(address);
    addrBytes = [te.length, ...Array.from(te)];
  }

  const targetLen = 1 + 2 + 1 + addrBytes.length; // network + port + type + addr
  const metaLen = 4 + targetLen;
  const hasData = !!payload && payload.length > 0;
  const total = 2 + metaLen + (hasData ? 2 + payload!.length : 0);

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, metaLen);
  dv.setUint16(2, sessionId);
  out[4] = STATUS_NEW;
  out[5] = hasData ? OPTION_DATA : 0;
  out[6] = NET_TCP;
  dv.setUint16(7, port);
  out[9] = addrType;
  out.set(addrBytes, 10);

  if (hasData) {
    const plenOff = 2 + metaLen;
    dv.setUint16(plenOff, payload!.length);
    out.set(payload!, plenOff + 2);
  }
  return out;
}
