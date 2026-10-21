/* global BigInt */
/*
 * TOR-CORE: replaced by feat/tor-616-core. A stub of the part of onion.js the UI needs (spec §4):
 * parseOnion(text) → { host, valid, reason }. Only the lookup is stubbed; the checksum is real
 * (SHA3-256 below, checked against node:crypto in tests/torUi.test.js), so "typo" is a true typo.
 */

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
const M = (1n << 64n) - 1n;
const rol = (v, n) => (n ? ((v << BigInt(n)) | (v >> BigInt(64 - n))) & M : v);

function keccakF(l) {
  let R = 1;
  for (let round = 0; round < 24; round++) {
    const C = [0, 1, 2, 3, 4].map((x) => l[x] ^ l[x + 5] ^ l[x + 10] ^ l[x + 15] ^ l[x + 20]);
    const D = [0, 1, 2, 3, 4].map((x) => C[(x + 4) % 5] ^ rol(C[(x + 1) % 5], 1));
    for (let i = 0; i < 25; i++) l[i] ^= D[i % 5];
    let x = 1, y = 0, cur = l[1];
    for (let t = 0; t < 24; t++) {
      [x, y] = [y, (2 * x + 3 * y) % 5];
      const i = x + 5 * y;
      [cur, l[i]] = [l[i], rol(cur, ((t + 1) * (t + 2) / 2) % 64)];
    }
    for (let yy = 0; yy < 5; yy++) {
      const T = [0, 1, 2, 3, 4].map((xx) => l[xx + 5 * yy]);
      for (let xx = 0; xx < 5; xx++) l[xx + 5 * yy] = T[xx] ^ (~T[(xx + 1) % 5] & M & T[(xx + 2) % 5]);
    }
    for (let j = 0; j < 7; j++) {
      R = ((R << 1) ^ ((R >> 7) * 0x71)) % 256;
      if (R & 2) l[0] ^= 1n << BigInt((1 << j) - 1);
    }
  }
}

/* SHA3-256 of a Uint8Array → Uint8Array(32) */
export function sha3_256(bytes) {
  const rate = 136;
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
  padded.set(bytes);
  padded[bytes.length] ^= 0x06;
  padded[padded.length - 1] ^= 0x80;
  const l = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let v = 0n;
      for (let b = 7; b >= 0; b--) v = (v << 8n) | BigInt(padded[off + i * 8 + b]);
      l[i] ^= v;
    }
    keccakF(l);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number((l[i >> 3] >> BigInt(8 * (i & 7))) & 0xffn);
  return out;
}

/* the text as a Tor v3 address: the bare 56-character name, with or without .onion, http://, :80 or a
   trailing /. reason: '' | 'format' (not an onion v3 name) | 'checksum' (a typo) | 'version' */
export function parseOnion(text) {
  let s = String(text == null ? '' : text).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/:80$/, '').replace(/\.onion$/, '');
  if (!/^[a-z2-7]{56}$/.test(s)) return { host: '', valid: false, reason: 'format' };
  const bytes = new Uint8Array(35);
  let bits = 0, acc = 0, n = 0;
  for (const ch of s) {
    acc = (acc << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes[n++] = (acc >> bits) & 0xff; }
  }
  if (bytes[34] !== 3) return { host: s + '.onion', valid: false, reason: 'version' };
  const pre = new TextEncoder().encode('.onion checksum');
  const msg = new Uint8Array(pre.length + 33);
  msg.set(pre);
  msg.set(bytes.subarray(0, 32), pre.length);
  msg[msg.length - 1] = 3;
  const sum = sha3_256(msg);
  const ok = sum[0] === bytes[32] && sum[1] === bytes[33];
  return { host: s + '.onion', valid: ok, reason: ok ? '' : 'checksum' };
}
