import assert from 'assert';
import {
  MuxStream,
  buildNewFrame,
  buildKeepFrame,
  buildEndFrame,
  STATUS_NEW,
  STATUS_KEEP,
  STATUS_END,
  NET_TCP,
} from './muxframe';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

function run() {
  // Round-trip: New (IPv4) frame
  const newFrame = buildNewFrame(100, '1.2.3.4', 443, enc('hello'));
  const s1 = new MuxStream();
  s1.feed(newFrame);
  const f1 = s1.next()!;
  assert.strictEqual(f1.sessionId, 100, 'New sessionId');
  assert.strictEqual(f1.status, STATUS_NEW, 'New status');
  assert.strictEqual(f1.target!.network, NET_TCP, 'New network TCP');
  assert.strictEqual(f1.target!.port, 443, 'New port');
  assert.strictEqual(f1.target!.address, '1.2.3.4', 'New address');
  assert.strictEqual(f1.hasData, true, 'New hasData');
  assert.strictEqual(dec(f1.payload), 'hello', 'New payload');

  // Round-trip: Keep frame
  const keepFrame = buildKeepFrame(100, enc('world'));
  const s2 = new MuxStream();
  s2.feed(keepFrame);
  const f2 = s2.next()!;
  assert.strictEqual(f2.sessionId, 100, 'Keep sessionId');
  assert.strictEqual(f2.status, STATUS_KEEP, 'Keep status');
  assert.strictEqual(dec(f2.payload), 'world', 'Keep payload');

  // Round-trip: End frame
  const endFrame = buildEndFrame(100);
  const s3 = new MuxStream();
  s3.feed(endFrame);
  const f3 = s3.next()!;
  assert.strictEqual(f3.status, STATUS_END, 'End status');
  assert.strictEqual(f3.hasData, false, 'End hasData');

  // Domain address
  const domainFrame = buildNewFrame(7, 'www.google.com', 80);
  const s4 = new MuxStream();
  s4.feed(domainFrame);
  const f4 = s4.next()!;
  assert.strictEqual(f4.target!.address, 'www.google.com', 'Domain address');
  assert.strictEqual(f4.target!.port, 80, 'Domain port');

  // Incremental: two frames split across arbitrary chunk boundaries
  const combined = new Uint8Array(newFrame.length + keepFrame.length);
  combined.set(newFrame);
  combined.set(keepFrame, newFrame.length);
  const s5 = new MuxStream();
  const splitAt = 3; // split inside the New frame's metaLen
  s5.feed(combined.slice(0, splitAt));
  let n = s5.next();
  assert.strictEqual(n, null, 'incomplete frame yields null');
  s5.feed(combined.slice(splitAt));
  const g1 = s5.next()!;
  assert.strictEqual(g1.status, STATUS_NEW, 'split New status');
  assert.strictEqual(dec(g1.payload), 'hello', 'split New payload');
  const g2 = s5.next()!;
  assert.strictEqual(g2.status, STATUS_KEEP, 'split Keep status');
  assert.strictEqual(dec(g2.payload), 'world', 'split Keep payload');
  assert.strictEqual(s5.next(), null, 'stream drained');
}

try {
  run();
  console.log('✅ muxframe round-trip tests passed');
  process.exit(0);
} catch (e) {
  console.error('❌ muxframe test failed:', e);
  process.exit(1);
}
