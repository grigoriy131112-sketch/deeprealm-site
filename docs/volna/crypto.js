/* Волна — шифрование локальных данных паролем (WebCrypto: PBKDF2 + AES-GCM) */

const Vault = (() => {
  const ENC = new TextEncoder();
  const DEC = new TextDecoder();
  const ITER = 250000;

  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  function randomSalt() { return crypto.getRandomValues(new Uint8Array(16)); }

  async function deriveKey(pass, salt) {
    const base = await crypto.subtle.importKey('raw', ENC.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Держит производный ключ в памяти: PBKDF2 считается один раз,
  // а не на каждое автосохранение.
  async function makeCipher(pass, saltB64) {
    const salt = saltB64 ? unb64(saltB64) : randomSalt();
    const key = await deriveKey(pass, salt);
    return {
      salt: b64(salt),
      async seal(text) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ENC.encode(text));
        return { v: 1, alg: 'AES-GCM', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
      },
      async open(payload) {
        const pt = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.ct));
        return DEC.decode(pt);
      },
    };
  }

  return { makeCipher, available: !!(window.crypto && crypto.subtle) };
})();
