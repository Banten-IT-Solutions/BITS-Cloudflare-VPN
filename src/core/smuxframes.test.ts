import assert from 'assert';
import {
  readMuxRequest,
  buildSmuxFrame,
  SmuxStream,
  readStreamRequest,
  SMUX_VERSION_1,
  SMUX_CMD_SYN,
  SMUX_CMD_FIN,
  SMUX_CMD_PSH,
  MUX_PROTO_SMX,
  MUX_VERSION_0,
  MUX_VERSION_1,
} from './smuxframes';

function u16be(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}
function u32le(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

function enc(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function run() {
  // ---- multiplex handshake ----
  // v0: 2 bytes (version + protocol), no padding
  const v0 = new Uint8Array([MUX_VERSION_0, MUX_PROTO_SMX]);
  {
    const r = readMuxRequest(v0);
    assert.ok(r, 'handshake v0');
    assert.strictEqual(r!.req.version, 0);
    assert.strictEqual(r!.req.protocol, MUX_PROTO_SMX);
    assert.strictEqual(r!.req.padding, false);
    assert.strictEqual(r!.next, 2);
  }

  // v1 no padding: version(1)+protocol(1)+paddingFlag(0) = 3 bytes
  const v1n = new Uint8Array([MUX_VERSION_1, MUX_PROTO_SMX, 0]);
  {
    const r = readMuxRequest(v1n);
    assert.ok(r, 'handshake v1 no padding');
    assert.strictEqual(r!.req.version, 1);
    assert.strictEqual(r!.req.protocol, MUX_PROTO_SMX);
    assert.strictEqual(r!.req.padding, false);
    assert.strictEqual(r!.next, 3);
  }

  // v1 with padding: version(1)+protocol(1)+paddingFlag(1)+paddingLen(2)+N
  const pad = new Uint8Array(8);
  pad[0] = MUX_VERSION_1; // version
  pad[1] = MUX_PROTO_SMX; // protocol
  pad[2] = 1; // padding enabled
  new DataView(pad.buffer).setUint16(3, 3); // paddingLen = 3
  pad[5] = 0xaa;
  pad[6] = 0xbb;
  pad[7] = 0xcc;
  {
    const r = readMuxRequest(pad);
    assert.ok(r, 'handshake v1 padding');
    assert.strictEqual(r!.req.padding, true);
    assert.strictEqual(r!.next, 8);
  }

  // incomplete handshake needs more bytes
  assert.strictEqual(
    readMuxRequest(new Uint8Array([MUX_VERSION_1, 0, 1])),
    null,
    'incomplete handshake buffered'
  );

  // unknown version -> reject
  assert.strictEqual(readMuxRequest(new Uint8Array([0x09, 0x00])), null, 'reject unknown version');

  // ---- smux frames: SYN / PSH / FIN round-trip ----
  const syn = buildSmuxFrame(SMUX_CMD_SYN, 1, new Uint8Array(0));
  assert.strictEqual(syn.length, 8, 'SYN header only');
  assert.strictEqual(syn[0], SMUX_VERSION_1, 'SYN ver');
  assert.strictEqual(syn[1], SMUX_CMD_SYN, 'SYN cmd');
  {
    const s = new SmuxStream();
    s.feed(syn);
    const f = s.next()!;
    assert.strictEqual(f.ver, SMUX_VERSION_1);
    assert.strictEqual(f.cmd, SMUX_CMD_SYN);
    assert.strictEqual(f.sid, 1);
    assert.strictEqual(f.payload.length, 0);
    assert.strictEqual(s.next(), null, 'drained');
  }

  // PSH with payload
  const want = enc('hello-mux');
  const psh = buildSmuxFrame(SMUX_CMD_PSH, 3, want);
  {
    const s = new SmuxStream();
    s.feed(psh);
    const f = s.next()!;
    assert.strictEqual(f.cmd, SMUX_CMD_PSH);
    assert.strictEqual(f.sid, 3);
    assert.strictEqual(new TextDecoder().decode(f.payload), 'hello-mux');
  }

  // incremental: two frames split mid-header
  const a = buildSmuxFrame(SMUX_CMD_PSH, 5, enc('A'));
  const b = buildSmuxFrame(SMUX_CMD_FIN, 5, new Uint8Array(0));
  const combined = new Uint8Array(a.length + b.length);
  combined.set(a);
  combined.set(b, a.length);
  {
    const s = new SmuxStream();
    s.feed(combined.slice(0, 4)); // split inside first frame
    assert.strictEqual(s.next(), null, 'split: no full frame');
    s.feed(combined.slice(4)); // remainder + second frame
    const f1 = s.next()!;
    assert.strictEqual(f1.cmd, SMUX_CMD_PSH);
    assert.strictEqual(f1.sid, 5);
    const f2 = s.next()!;
    assert.strictEqual(f2.cmd, SMUX_CMD_FIN);
    assert.strictEqual(f2.sid, 5);
    assert.strictEqual(s.next(), null, 'drained after split');
  }

  // ---- StreamRequest (TCP IPv4) ----
  // flags=0 (TCP), addrType=1 (IPv4), 4 octets, port 2 BE
  const sr4 = new Uint8Array([0x00, 0x00, 0x01, 1, 2, 3, 4, 0x01, 0xbb]); // 1.2.3.4:443
  {
    const r = readStreamRequest(sr4);
    assert.ok(r);
    assert.strictEqual(r!.req.network, 'tcp');
    assert.strictEqual(r!.req.host, '1.2.3.4');
    assert.strictEqual(r!.req.port, 443);
  }

  // ---- StreamRequest (TCP domain) ----
  const dom = enc('support.zoom.us');
  const srDom = new Uint8Array(2 + 1 + 1 + dom.length + 2);
  srDom[0] = 0x00;
  srDom[1] = 0x00; // flags TCP
  srDom[2] = 0x03; // addrType FQDN
  srDom[3] = dom.length;
  srDom.set(dom, 4);
  srDom[4 + dom.length] = 0x01;
  srDom[5 + dom.length] = 0xbb; // port 443
  {
    const r = readStreamRequest(srDom);
    assert.ok(r);
    assert.strictEqual(r!.req.network, 'tcp');
    assert.strictEqual(r!.req.host, 'support.zoom.us');
    assert.strictEqual(r!.req.port, 443);
  }

  // ---- StreamRequest (UDP) ----
  const srUdp = new Uint8Array([0x00, 0x01, 0x01, 1, 2, 3, 4, 0x10, 0x00]); // flags UDP, 1.2.3.4:4096
  {
    const r = readStreamRequest(srUdp);
    assert.ok(r);
    assert.strictEqual(r!.req.network, 'udp');
    assert.strictEqual(r!.req.host, '1.2.3.4');
    assert.strictEqual(r!.req.port, 4096);
  }

  // StreamRequest needs the full address+port
  assert.strictEqual(readStreamRequest(new Uint8Array([0x00])), null, 'incomplete sr buffered');

  // ---- end-to-end: handshake + SYN + StreamRequest+data inside a PSH ----
  {
    const s = new SmuxStream();
    // handshake v0
    s.feed(new Uint8Array([MUX_VERSION_0, MUX_PROTO_SMX]));
    const h = readMuxRequest(s.peek(), 0);
    assert.ok(h);
    s.consumed(h!.next);

    const psh = buildSmuxFrame(SMUX_CMD_PSH, 1, new Uint8Array([...sr4, ...enc('TLS-HELLO')]));
    s.feed(psh);
    const f = s.next()!;
    assert.strictEqual(f.cmd, SMUX_CMD_PSH);
    assert.strictEqual(f.sid, 1);
    const sr = readStreamRequest(f.payload);
    assert.ok(sr);
    assert.strictEqual(sr!.req.host, '1.2.3.4');
    assert.strictEqual(sr!.req.port, 443);
    const rest = f.payload.slice(sr!.next);
    assert.strictEqual(new TextDecoder().decode(rest), 'TLS-HELLO');
  }

  // ---- smux version 2 accepted ----
  {
    // header: ver=2, cmd=PSH, sid=9 (LE), len=5 (LE) + "abcde"
    const raw = new Uint8Array([0x02, SMUX_CMD_PSH, ...u32le(9), 0x05, 0x00, ...enc('abcde')]);
    const s = new SmuxStream();
    s.feed(raw);
    const f = s.next()!;
    assert.strictEqual(f.ver, 2);
    assert.strictEqual(f.cmd, SMUX_CMD_PSH);
    assert.strictEqual(f.sid, 9);
    assert.strictEqual(new TextDecoder().decode(f.payload), 'abcde');
  }

  console.log('✅ smuxframe round-trip tests passed');
}

try {
  run();
  process.exit(0);
} catch (e) {
  console.error('❌ smuxframe test failed:', e);
  process.exit(1);
}
