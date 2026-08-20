// Resolves the per-install 32-byte hex encryption key from disk. Extracted from entry.cjs
// so it can be unit-tested with an injected `safeStorage`. See the doc comment on the
// wrapper in entry.cjs for WHY key stability is safety-critical.
const fs = require('fs');
const crypto = require('crypto');

const HEX32_KEY = /^[0-9a-f]{64}$/i;

/**
 * Return the stable per-install AES-256 key (64-char hex).
 *
 * If a key file exists we return EXACTLY the key it holds, or THROW — never regenerate and
 * never guess. Every stored API key is encrypted with this key, so a silent change orphans
 * all of them permanently. A thrown startup error is recoverable (restart); a changed key is
 * not. A new key is generated ONLY when no file exists (genuine first run).
 *
 * @param {{isEncryptionAvailable():boolean, encryptString(s:string):Buffer, decryptString(b:Buffer):string}} safeStorage
 * @param {string} keyPath absolute path to the enc.key file
 * @returns {string} 64-char hex key
 */
function resolveEncryptionKey(safeStorage, keyPath) {
  if (fs.existsSync(keyPath)) {
    const blob = fs.readFileSync(keyPath);
    // Legacy plaintext form (written when safeStorage was unavailable): the raw 64-char hex.
    const asText = blob.toString('utf8').trim();
    if (HEX32_KEY.test(asText)) return asText;
    // Otherwise it's a DPAPI-encrypted blob — safeStorage is required to read it. Do NOT fall
    // back to raw bytes (a wrong key) and do NOT regenerate (orphans the user's keys).
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'enc.key exists but OS encryption (safeStorage) is unavailable right now — refusing to ' +
          'run with a wrong key, which would orphan your saved API keys. Please restart the app.',
      );
    }
    let decrypted;
    try {
      decrypted = safeStorage.decryptString(blob);
    } catch (err) {
      throw new Error(
        `enc.key exists but could not be decrypted (${(err && err.message) || err}) — not ` +
          'regenerating it, to avoid orphaning your saved API keys. Please restart the app.',
      );
    }
    if (!HEX32_KEY.test(decrypted.trim())) {
      throw new Error('enc.key decrypted to an unexpected value — refusing to proceed rather than orphan saved API keys.');
    }
    return decrypted.trim();
  }

  // No key file → genuine first run → generate and persist.
  const key = crypto.randomBytes(32).toString('hex');
  const toStore = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8');
  try {
    fs.writeFileSync(keyPath, toStore);
  } catch {
    // best effort — a non-persisted key still works for this session
  }
  return key;
}

module.exports = { resolveEncryptionKey, HEX32_KEY };
