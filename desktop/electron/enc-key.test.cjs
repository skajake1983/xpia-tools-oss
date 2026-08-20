// Regression test for enc-key.cjs — plain node, mock safeStorage (no Electron needed).
// Run: `node electron/enc-key.test.cjs` (wired into CI). Guards the API-key encryption key
// against the silent-regeneration bug that orphaned saved keys on upgrade.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveEncryptionKey } = require('./enc-key.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'enckey-'));
let n = 0;
const keyPath = () => path.join(tmp, `enc-${++n}.key`);
const HEX = /^[0-9a-f]{64}$/;

// Mock DPAPI: "encrypt" prefixes a marker (so the blob is NOT valid hex, like a real binary
// DPAPI blob); "decrypt" reverses it. Toggle availability / force failures per test.
function mockSafe({ available = true, decryptThrows = false, decryptReturns = null } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.concat([Buffer.from('DPAPI:'), Buffer.from(s, 'utf8')]),
    decryptString: (b) => {
      if (decryptThrows) throw new Error('DPAPI decrypt failed');
      if (decryptReturns !== null) return decryptReturns;
      const s = b.toString('utf8');
      if (!s.startsWith('DPAPI:')) throw new Error('bad blob');
      return s.slice(6);
    },
  };
}
const test = (name, fn) => {
  try {
    fn();
    console.log('  ok  ', name);
  } catch (e) {
    console.log('  FAIL', name, '\n       ', e.message);
    process.exitCode = 1;
  }
};

test('first run generates + persists; second call is stable', () => {
  const p = keyPath();
  const k1 = resolveEncryptionKey(mockSafe({ available: true }), p);
  assert(HEX.test(k1), 'k1 is 64-hex');
  assert(fs.existsSync(p), 'file created');
  assert.strictEqual(resolveEncryptionKey(mockSafe({ available: true }), p), k1, 'same key across calls');
});

test('legacy plaintext hex is read directly (even without safeStorage)', () => {
  const p = keyPath();
  const raw = 'a'.repeat(64);
  fs.writeFileSync(p, Buffer.from(raw, 'utf8'));
  assert.strictEqual(resolveEncryptionKey(mockSafe({ available: false }), p), raw);
});

test('undecryptable blob throws AND leaves the file untouched (no regen); recovers after', () => {
  const p = keyPath();
  const original = resolveEncryptionKey(mockSafe({ available: true }), p);
  const before = fs.readFileSync(p);
  assert.throws(() => resolveEncryptionKey(mockSafe({ available: true, decryptThrows: true }), p), /not.*regenerating|orphan/i);
  assert.deepStrictEqual(fs.readFileSync(p), before, 'file NOT overwritten');
  assert.strictEqual(resolveEncryptionKey(mockSafe({ available: true }), p), original, 'recovers after transient failure');
});

test('safeStorage unavailable + encrypted blob throws (no garbage key)', () => {
  const p = keyPath();
  resolveEncryptionKey(mockSafe({ available: true }), p);
  const before = fs.readFileSync(p);
  assert.throws(() => resolveEncryptionKey(mockSafe({ available: false }), p), /safeStorage.*unavailable|restart/i);
  assert.deepStrictEqual(fs.readFileSync(p), before, 'file NOT overwritten');
});

test('decrypted-but-not-hex throws', () => {
  const p = keyPath();
  resolveEncryptionKey(mockSafe({ available: true }), p);
  assert.throws(() => resolveEncryptionKey(mockSafe({ available: true, decryptReturns: 'nope' }), p), /unexpected value/i);
});

console.log(process.exitCode ? 'RESULT: FAILURES' : 'RESULT: all passed');
