// Считает такой же конверт, как crypto.js: PBKDF2(250000, SHA-256) + AES-GCM 256
const { webcrypto } = require('crypto');
const { subtle } = webcrypto;
const ENC = new TextEncoder();

const b64 = buf => Buffer.from(buf).toString('base64');

(async () => {
  const pass = process.argv[2] || 'test1234';
  const entries = JSON.parse(process.argv[3]);
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const base = await subtle.importKey('raw', ENC.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, ENC.encode(JSON.stringify(entries)));
  process.stdout.write(JSON.stringify({
    v: 1, alg: 'AES-GCM', iter: 250000,
    salt: b64(salt), iv: b64(iv), ct: b64(ct)
  }));
})();
