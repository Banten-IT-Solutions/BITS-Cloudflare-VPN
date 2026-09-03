import assert from 'assert';
import { vlessHeaderLength, concatBytes } from './header';

// Build a VLESS-shaped header: ver(0) + uuid16 + opt + cmd + port2 + addr...
function buildHeader(
  uuid: number[],
  opt: number,
  cmd: number,
  port: number,
  addr: number[]
): Uint8Array {
  const h = [0, ...uuid, opt, cmd, (port >> 8) & 0xff, port & 0xff, ...addr];
  return new Uint8Array(h);
}

const UUID_OK = [
  0x12, 0x34, 0x56, 0x78, 0x12, 0x34, 0x43, 0x21, 0x88, 0x88, 0x12, 0x34, 0x56, 0x78, 0x90, 0xab,
];

try {
  console.log('🧪 Running vlessHeaderLength tests...');

  // 1. Too short to even read opt (<18B) → buffer
  assert.strictEqual(vlessHeaderLength(new Uint8Array(10)), -1, 'short <18 → -1');

  // 2. Non-zero first byte → not VLESS-shaped → legacy path
  const nonVless = new Uint8Array(30);
  nonVless[0] = 0xab;
  assert.strictEqual(vlessHeaderLength(nonVless), 0, 'non-zero ver → 0');

  // 3. 19B VLESS prefix (ver+uuid+opt+cmd), IPv4 addr missing → buffer; full = 26
  const prefix19 = buildHeader(UUID_OK, 0, 1, 0, []).slice(0, 19);
  assert.strictEqual(prefix19.length, 19);
  assert.strictEqual(vlessHeaderLength(prefix19), -1, '19B prefix → -1');

  // 4. 20B (port high byte only) → still buffer
  const prefix20 = buildHeader(UUID_OK, 0, 1, 443, [1, 2, 3, 4]).slice(0, 20);
  assert.strictEqual(vlessHeaderLength(prefix20), -1, '20B prefix → -1');

  // 5. Full IPv4 TCP header → 26
  const ipv4 = buildHeader(UUID_OK, 0, 1, 443, [1, 192, 168, 1, 1]);
  assert.strictEqual(ipv4.length, 26);
  assert.strictEqual(vlessHeaderLength(ipv4), 26, 'IPv4 full → 26');

  // 6. Full IPv6 header → 18+1+2+1+16 = 38
  const ipv6 = buildHeader(UUID_OK, 0, 1, 443, [3, ...new Array(16).fill(0x20)]);
  assert.strictEqual(ipv6.length, 38);
  assert.strictEqual(vlessHeaderLength(ipv6), 38, 'IPv6 full → 38');

  // 7. Domain "abcde" → 18+1+2+1+1+5 = 28; truncated (no len) → buffer
  const domTrunc = buildHeader(UUID_OK, 0, 1, 443, [2]);
  assert.strictEqual(vlessHeaderLength(domTrunc), -1, 'domain w/o len → -1');
  const dom = buildHeader(UUID_OK, 0, 1, 443, [2, 5, 97, 98, 99, 100, 101]);
  assert.strictEqual(dom.length, 28);
  assert.strictEqual(vlessHeaderLength(dom), 28, 'domain full → 28');

  // 8. smux magic host (20-char domain, port 444) → 43
  const muxHost = 'sp.mux.sing-box.arpa';
  assert.strictEqual(muxHost.length, 20);
  const smux = buildHeader(UUID_OK, 0, 1, 444, [
    2,
    muxHost.length,
    ...Array.from(muxHost).map(c => c.charCodeAt(0)),
  ]);
  assert.strictEqual(smux.length, 43);
  assert.strictEqual(vlessHeaderLength(smux), 43, 'smux header → 43');

  // 9. Options present (opt=2): cmd shifts → IPv4 total 28
  const withOpt = new Uint8Array([0, ...UUID_OK, 2, 0xaa, 0xbb, 1, 0x01, 0xbb, 1, 2, 3, 4]);
  assert.strictEqual(vlessHeaderLength(withOpt), 28, 'opt=2 IPv4 → 28');

  // 10. Bad cmd → legacy path (parser throws 'not supported' as before)
  const badCmd = buildHeader(UUID_OK, 0, 7, 443, [1, 1, 2, 3, 4]);
  assert.strictEqual(vlessHeaderLength(badCmd), 0, 'bad cmd → 0');

  // 11. Bad addrType → legacy path
  const badAddr = buildHeader(UUID_OK, 0, 1, 443, [9, 1, 2, 3, 4]);
  assert.strictEqual(vlessHeaderLength(badAddr), 0, 'bad addrType → 0');

  // 12. concatBytes sanity
  const c = concatBytes(new Uint8Array([1, 2]), new Uint8Array([3]));
  assert.deepStrictEqual(Array.from(c), [1, 2, 3], 'concat');

  console.log('✅ header tests passed');
} catch (e) {
  console.error('❌ header tests failed:', e);
  process.exit(1);
}
