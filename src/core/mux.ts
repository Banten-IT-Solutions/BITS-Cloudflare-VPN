// VLESS Mux (Mux.cool) server-side demux on Cloudflare Workers.
// One WS carries many multiplexed TCP sessions; each session maps to its own outbound socket.
import { connect } from 'cloudflare:sockets';
import { WS_READY_STATE_OPEN } from './constants';
import {
  MuxStream,
  buildKeepFrame,
  buildEndFrame,
  NET_UDP,
  STATUS_NEW,
  STATUS_KEEP,
  STATUS_END,
  STATUS_KEEPALIVE,
} from './muxframe';
import type { MuxFrame, MuxTarget } from './muxframe';

interface Session {
  id: number;
  socket: any;
  closed: boolean;
}

export class MuxRelay {
  private sessions = new Map<number, Session>();
  private stream = new MuxStream();

  constructor(
    private webSocket: any,
    private prxIP: string,
    private log: (msg: string, ev?: any) => void
  ) {}

  feed(chunk: ArrayBuffer | Uint8Array): void {
    this.stream.feed(chunk);
    let frame: MuxFrame | null;
    while ((frame = this.stream.next())) {
      this.handle(frame).catch(e => this.log('mux frame error', (e as Error)?.message));
    }
  }

  closeAll(): void {
    for (const s of this.sessions.values()) {
      try {
        s.socket?.close();
      } catch {}
    }
    this.sessions.clear();
  }

  private send(bytes: Uint8Array): void {
    if (this.webSocket.readyState === WS_READY_STATE_OPEN) {
      this.webSocket.send(bytes);
    }
  }

  // Direct connect to destination; fall back to the relay target (prxIP) once on failure.
  private async dial(target: MuxTarget): Promise<any> {
    const parts = this.prxIP.split(/[:=-]/);
    const relayHost = parts[0] || target.address;
    const relayPort = Number(parts[1]) || target.port;

    const direct = connect({ hostname: target.address, port: target.port });
    try {
      await direct.opened;
      return direct;
    } catch {
      try {
        direct.close();
      } catch {}
      if (relayHost === target.address && relayPort === target.port) throw new Error('dial failed');
      const relay = connect({ hostname: relayHost, port: relayPort });
      await relay.opened;
      return relay;
    }
  }

  private async handle(f: MuxFrame): Promise<void> {
    switch (f.status) {
      case STATUS_NEW:
        await this.open(f);
        break;
      case STATUS_KEEP:
        this.keep(f);
        break;
      case STATUS_END:
        this.end(f);
        break;
      case STATUS_KEEPALIVE:
        break; // no-op keepalive
      default:
        this.log('mux unknown status', f.status);
    }
  }

  private async open(f: MuxFrame): Promise<void> {
    if (this.sessions.has(f.sessionId)) return;

    // ponytail: UDP-over-mux (XUDP) unsupported. Reply End so client closes cleanly.
    // Add XUDP GlobalID mapping when UDP relay over mux is required.
    if (!f.target || f.target.network === NET_UDP) {
      this.send(buildEndFrame(f.sessionId));
      return;
    }

    let socket: any;
    try {
      socket = await this.dial(f.target);
    } catch (e) {
      this.log('mux dial failed', (e as Error)?.message);
      this.send(buildEndFrame(f.sessionId, true));
      return;
    }

    const session: Session = { id: f.sessionId, socket, closed: false };
    this.sessions.set(f.sessionId, session);
    this.pump(session);
    if (f.hasData && f.payload.length) this.writeToSession(session, f.payload);
  }

  private keep(f: MuxFrame): void {
    const s = this.sessions.get(f.sessionId);
    if (!s) {
      // Unknown session: tell client to close it.
      this.send(buildEndFrame(f.sessionId, true));
      return;
    }
    if (f.hasData && f.payload.length) this.writeToSession(s, f.payload);
  }

  private end(f: MuxFrame): void {
    const s = this.sessions.get(f.sessionId);
    this.sessions.delete(f.sessionId);
    if (s && !s.closed) {
      s.closed = true;
      try {
        s.socket?.close();
      } catch {}
    }
  }

  private async writeToSession(s: Session, data: Uint8Array): Promise<void> {
    try {
      const writer = s.socket.writable.getWriter();
      await writer.write(data);
      writer.releaseLock();
    } catch {
      this.onSocketClose(s, true);
    }
  }

  private pump(s: Session): void {
    s.socket.readable
      .pipeTo(
        new WritableStream({
          write: (chunk: any) => {
            this.send(buildKeepFrame(s.id, toUint8(chunk)));
          },
          close: () => this.onSocketClose(s, false),
          abort: () => this.onSocketClose(s, true),
        })
      )
      .catch(() => this.onSocketClose(s, true));
  }

  private onSocketClose(s: Session, isError: boolean): void {
    if (s.closed) return;
    s.closed = true;
    this.sessions.delete(s.id);
    this.send(buildEndFrame(s.id, isError));
  }
}

function toUint8(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  return new Uint8Array((chunk as ArrayBuffer) ?? new ArrayBuffer(0));
}
