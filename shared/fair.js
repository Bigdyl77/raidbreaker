// Provably fair primitives, shared by the server and the browser verifier.
// Pure JS (synchronous) so both sides run the exact same code.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fair = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // SHA-256 constants: fractional bits of square/cube roots of the first primes.
  const PRIMES = [];
  for (let n = 2; PRIMES.length < 64; n++) {
    if (PRIMES.every((p) => n % p !== 0)) PRIMES.push(n);
  }
  const frac32 = (x) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
  const K = PRIMES.map((p) => frac32(Math.cbrt(p)));
  const H0 = PRIMES.slice(0, 8).map((p) => frac32(Math.sqrt(p)));

  const ror = (x, n) => (x >>> n) | (x << (32 - n));
  const encoder = new TextEncoder();

  function sha256(bytes) {
    const len = bytes.length;
    const padLen = ((len + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(padLen);
    m.set(bytes);
    m[len] = 0x80;
    const dv = new DataView(m.buffer);
    const bitLen = len * 8;
    dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));
    dv.setUint32(padLen - 4, bitLen >>> 0);

    const H = H0.slice();
    const w = new Uint32Array(64);
    for (let off = 0; off < padLen; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        const s0 = ror(a, 7) ^ ror(a, 18) ^ (a >>> 3);
        const s1 = ror(b, 17) ^ ror(b, 19) ^ (b >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    H.forEach((v, i) => odv.setUint32(i * 4, v));
    return out;
  }

  function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  }

  function hmacSha256(key, msg) {
    let k = typeof key === 'string' ? encoder.encode(key) : key;
    const data = typeof msg === 'string' ? encoder.encode(msg) : msg;
    if (k.length > 64) k = sha256(k);
    const block = new Uint8Array(64);
    block.set(k);
    const ipad = block.map((x) => x ^ 0x36);
    const opad = block.map((x) => x ^ 0x5c);
    return sha256(concat(opad, sha256(concat(ipad, data))));
  }

  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const hashSeed = (serverSeed) => toHex(sha256(encoder.encode(serverSeed)));

  // Deterministic stream of floats in [0, 1) for one bet.
  // Block i = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}:${i}`), 8 floats per block,
  // each float built from 4 bytes: b0/256 + b1/256^2 + b2/256^3 + b3/256^4.
  // A named channel (e.g. "raid") gets its own stream: `${clientSeed}:${nonce}:${channel}:${i}`.
  function floatStream(serverSeed, clientSeed, nonce, channel = '') {
    const prefix = channel ? `${clientSeed}:${nonce}:${channel}:` : `${clientSeed}:${nonce}:`;
    let cursor = 0;
    let block = null;
    let pos = 32;
    return {
      next() {
        if (pos >= 32) {
          block = hmacSha256(serverSeed, prefix + cursor++);
          pos = 0;
        }
        let f = 0;
        for (let i = 0; i < 4; i++) f += block[pos + i] / Math.pow(256, i + 1);
        pos += 4;
        return f;
      },
    };
  }

  // All channels for one bet: rngFor('') is the base spin, rngFor('raid') etc.
  function streams(serverSeed, clientSeed, nonce) {
    const cache = {};
    return (channel = '') => cache[channel] || (cache[channel] = floatStream(serverSeed, clientSeed, nonce, channel));
  }

  return { sha256, hmacSha256, toHex, hashSeed, floatStream, streams };
});
