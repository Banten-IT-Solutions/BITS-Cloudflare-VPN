// sing-box multiplex (smux) server-side demux for Cloudflare Workers.
//
// One WS carries N smux streams. Each stream opens with a StreamRequest
// (flags + addr + port = the REAL destination), then multiplexes TCP payload.
// The worker dials one TCP socket per stream (with prxIP fallback) and bridges
// the smux stream <-> outbound socket. Net effect: N app connections -> 1 WS.
//
// Protocol spec verified against github.com/sagernet/sing-mux:
//  - handshake: ReadRequest (protocol.go)
//  - framing:  github.com/sagernet/smux (frame.go / session.go)
//  - per-stream: StreamRequest (protocol.go)
//
// ponytail: UDP streams (smux StreamRequest flags UDP) are not bridged here —
//   they FIN immediately. Most browser traffic is TCP/TLS, which is the bulk.
//   Add UDP-over-smux datagram relaying only if QUIC/DoQ over smux is needed.
// ponytail: yamux/h2mux protocols are rejected (set `protocol: smux` in the client).
// ponytail: no periodic smux NOP keepalive is emitted (WS ping covers liveness).
import { WS_READY_STATE_OPEN } from './constants';
import {
  SmuxStream,
  buildSmuxFrame,
  readMuxRequest,
  readStreamRequest,
  SMUX_CMD_FIN,
  SMUX_CMD_NOP,
  SMUX_CMD_PSH,
  SMUX_CMD_SYN,
  MUX_PROTO_SMX,
} from './smuxframes';
import type { SmuxFrame } from './smuxframes';

export interface SmuxSocket {
  readable: ReadableStream;
  writable: WritableStream;
  close: () => void;
  opened?: Promise<unknown>;
}

type DialFn = (host: string, port: number, firstData: Uint8Array) => Promise<SmuxSocket | null>;

interface StreamCtx {
  sid: number;
  socket: SmuxSocket | null;
  pending: Uint8Array; // accumulates StreamRequest bytes until we can dial
  bridged: boolean;
}

export class SmuxRelay {
  private smux = new SmuxStream();
  private handshakeDone = false;
  private protocol: number | null = null;
  private streams = new Map<number, StreamCtx>();
  private closed = false;

  constructor(
    private webSocket: any,
    private prxIP: string,
    private log: (msg: string, ev?: any) => void,
    private dial: DialFn
  ) {}

  feed(chunk: ArrayBuffer | Uint8Array): void {
    if (this.closed) return;
    this.smux.feed(chunk);

    if (!this.handshakeDone) {
      const r = readMuxRequest(this.smux.peek(), 0);
      if (!r) return; // need more bytes
      // Diagnostic: log the handshake so we can confirm which protocol the client
      // actually requests (0=smux, 1=yamux, 2=h2mux). sing-box defaults to h2mux(2).
      this.log('smux handshake version', `${r.req.version} protocol=${r.req.protocol}`);
      if (r.req.protocol !== MUX_PROTO_SMX) {
        this.log(
          'smux unsupported protocol',
          `proto=${r.req.protocol} (0=smux,1=yamux,2=h2mux). Set multiplex.protocol="smux" on the client, or this worker cannot multiplex.`
        );
        this.closeWS();
        return;
      }
      this.protocol = r.req.protocol;
      this.smux.consumed(r.next);
      this.handshakeDone = true;
    }

    let frame: SmuxFrame | null;
    while ((frame = this.smux.next())) {
      this.handleFrame(frame).catch((e: any) => this.log('smux frame error', e?.message));
    }
  }

  private async handleFrame(f: SmuxFrame): Promise<void> {
    if (f.cmd === SMUX_CMD_SYN) {
      // Open a virtual stream. SYN carries no payload in xtaci/smux; the first
      // PSH on this sid carries the StreamRequest (real destination).
      if (this.streams.has(f.sid)) return;
      this.streams.set(f.sid, {
        sid: f.sid,
        socket: null,
        pending: new Uint8Array(0),
        bridged: false,
      });
      return;
    }
    if (f.cmd === SMUX_CMD_PSH) {
      let ctx = this.streams.get(f.sid);
      if (!ctx) return; // unknown/orphan stream
      if (!ctx.bridged) {
        // accumulate until the StreamRequest header is complete
        const merged = new Uint8Array(ctx.pending.length + f.payload.length);
        merged.set(ctx.pending);
        merged.set(f.payload, ctx.pending.length);
        const sr = readStreamRequest(merged, 0);
        if (!sr) {
          ctx.pending = merged;
          return;
        }
        // ponytail: UDP streams are rejected (see class header).
        if (sr.req.network === 'udp') {
          this.send(buildSmuxFrame(SMUX_CMD_FIN, f.sid));
          this.streams.delete(f.sid);
          this.log('smux udp stream rejected', `${sr.req.host}:${sr.req.port}`);
          return;
        }
        this.log('smux open stream', `${f.sid} -> ${sr.req.host}:${sr.req.port}`);
        const firstData = merged.subarray(sr.next);
        // dial() writes firstData to the new socket. Bound the wait so a hung
        // connect becomes a clean FIN (fast fail) instead of a hung stream.
        const socket = await withTimeout(this.dial(sr.req.host, sr.req.port, firstData), 8000);
        if (!socket) {
          this.send(buildSmuxFrame(SMUX_CMD_FIN, f.sid));
          this.streams.delete(f.sid);
          return;
        }
        ctx.socket = socket;
        ctx.bridged = true;
        ctx.pending = new Uint8Array(0);
        this.pump(ctx);
        // NOTE: do NOT re-write firstData here — dial() already wrote it.
        // Writing it twice corrupts the TLS handshake (duplicate ClientHello)
        // and stalls the remote, which hung every stream (all dl=0, timeout).
        return;
      }
      // already bridged: payload is raw stream data
      await this.writeToSession(ctx, f.payload);
      return;
    }
    if (f.cmd === SMUX_CMD_FIN) {
      const ctx = this.streams.get(f.sid);
      if (ctx?.socket) {
        try {
          ctx.socket.close();
        } catch {}
      }
      if (ctx) this.streams.delete(f.sid);
      return;
    }
    // NOP / UPD (window) -> ignore
  }

  private async writeToSession(ctx: StreamCtx, data: Uint8Array): Promise<void> {
    try {
      const writer = ctx.socket!.writable.getWriter();
      await writer.write(data);
      writer.releaseLock();
    } catch {
      this.onSocketClose(ctx);
    }
  }

  private pump(ctx: StreamCtx): void {
    const sid = ctx.sid;
    const target = this;
    ctx
      .socket!.readable.pipeTo(
        new WritableStream({
          write(chunk: any) {
            target.send(buildSmuxFrame(SMUX_CMD_PSH, sid, toUint8(chunk)));
          },
          close() {
            target.send(buildSmuxFrame(SMUX_CMD_FIN, sid));
            target.streams.delete(sid);
          },
          abort() {
            target.send(buildSmuxFrame(SMUX_CMD_FIN, sid));
            target.streams.delete(sid);
          },
        })
      )
      .catch(() => target.onSocketClose(ctx));
  }

  private onSocketClose(ctx: StreamCtx): void {
    if (!this.streams.has(ctx.sid)) return;
    this.streams.delete(ctx.sid);
    this.send(buildSmuxFrame(SMUX_CMD_FIN, ctx.sid));
  }

  private send(bytes: Uint8Array): void {
    if (this.webSocket.readyState === WS_READY_STATE_OPEN) {
      this.webSocket.send(bytes);
    }
  }

  private closeWS(): void {
    this.closed = true;
    try {
      if (this.webSocket.readyState === WS_READY_STATE_OPEN || this.webSocket.readyState === 2) {
        this.webSocket.close();
      }
    } catch {}
    this.streams.clear();
  }

  closeAll(): void {
    this.closed = true;
    for (const s of this.streams.values()) {
      try {
        s.socket?.close();
      } catch {}
    }
    this.streams.clear();
  }
}

function toUint8(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  return new Uint8Array((chunk as ArrayBuffer) ?? new ArrayBuffer(0));
}

// Resolve with null if the promise does not settle within ms. Used to bound
// outbound dials so a hung connect cannot hang a multiplexed stream forever.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: any;
  const gate = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([p.then(v => (clearTimeout(timer), v)), gate]);
}
