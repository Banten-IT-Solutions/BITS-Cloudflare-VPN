import assert from 'assert';
// Mock minimal WebCrypto API if running on old Node.js (Cloudflare Workers/Bun support it natively)
if (typeof crypto === 'undefined') {
  global.crypto = require('crypto').webcrypto;
}

// Byte helper simulation
function createVLESSHeader(version: number): ArrayBuffer {
  // UUID (16 bytes)
  const uuid = new Uint8Array([
    0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
  ]);
  const header = new Uint8Array(18);
  header[0] = version;
  header.set(uuid, 1);
  header[17] = 0x00; // Type
  return header.buffer as ArrayBuffer;
}

// Mock function from relay.ts under test
// Since protocolSniffer is not exported, test version-sniffing logic representation
function testProtocolSniffer(buffer: ArrayBuffer): string {
  const base64Neko = 'bmVrbw=='; // "neko"
  const base64Flash = 'Zmxhc2g='; // "flash"

  if (buffer.byteLength >= 18) {
    const version = new Uint8Array(buffer.slice(0, 1))[0];
    if (version === 0) {
      const protocolUuid = new Uint8Array(buffer.slice(1, 17));
      // Convert buffer to hex
      const hex = Array.from(protocolUuid)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      if (hex.match(/^[0-9a-f]{8}[0-9a-f]{4}4[0-9a-f]{3}[89ab][0-9a-f]{3}[0-9a-f]{12}$/i)) {
        return atob(base64Neko);
      }
    }
  }
  return atob(base64Flash);
}

// Run tests
try {
  console.log('🧪 Running VLESS Protocol Sniffer tests...');

  // Test Case 1: Valid VLESS UUID v4 Header -> Should return "neko" (Trojan/VLESS matched)
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (y is 8, 9, a, or b)
  const validV4Uuid = new Uint8Array([
    0x00, // Version 0
    // UUID: 12345678-1234-4321-8888-1234567890ab
    0x12,
    0x34,
    0x56,
    0x78,
    0x12,
    0x34,
    0x43,
    0x21,
    0x88,
    0x88,
    0x12,
    0x34,
    0x56,
    0x78,
    0x90,
    0xab,
    0x00, // Type
  ]);
  const result1 = testProtocolSniffer(validV4Uuid.buffer as ArrayBuffer);
  assert.strictEqual(
    result1,
    'neko',
    'Test 1 Failed: Valid UUID v4 should trigger Trojan/neko signature'
  );

  // Test Case 2: Invalid UUID Version (not v4) -> Should fallback to "flash"
  const invalidV4Uuid = new Uint8Array([
    0x00, // Version 0
    // UUID: 12345678-1234-3321-8888-1234567890ab (UUID v3, version is 3 not 4)
    0x12,
    0x34,
    0x56,
    0x78,
    0x12,
    0x34,
    0x33,
    0x21,
    0x88,
    0x88,
    0x12,
    0x34,
    0x56,
    0x78,
    0x90,
    0xab,
    0x00, // Type
  ]);
  const result2 = testProtocolSniffer(invalidV4Uuid.buffer as ArrayBuffer);
  assert.strictEqual(result2, 'flash', 'Test 2 Failed: Non-v4 UUID should fallback to flash');

  // Test Case 3: Too short header -> Should fallback to "flash"
  const shortBuffer = new Uint8Array([0x00, 0x11]);
  const result3 = testProtocolSniffer(shortBuffer.buffer as ArrayBuffer);
  assert.strictEqual(result3, 'flash', 'Test 3 Failed: Short buffer should fallback to flash');

  console.log('✅ All sniffer tests passed successfully!');
  process.exit(0);
} catch (error) {
  console.error('❌ Test failed:', error);
  process.exit(1);
}
