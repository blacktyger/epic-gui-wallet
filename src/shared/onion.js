/*
 * Tor onion v3 addresses and the wallet's onion key (docs/plans/tor-616.md §4).
 *
 *   onionFromPubkeyHex(hex)  the 56-character name of an ed25519 public key:
 *                            base32(pubkey ‖ sha3-256(".onion checksum" ‖ pubkey ‖ 0x03)[0..2] ‖ 0x03)
 *   parseOnion(text)         {host: '<56>.onion' | '', valid, reason}: the bare name, with or without
 *                            .onion, http://, :80 or a trailing /; checks version and checksum
 *   expandSeed(seed, sha512) the 64-byte key tor wants (SHA-512 of the seed, clamped): epic-wallet
 *                            4.1.0 writes seed ‖ pubkey instead (§1, §8.1)
 *   readOnionKeyFile(buf)    the 96-byte hs_ed25519_secret_key: {seed, pub} | null
 *
 * Plain ESM: used by the page (Send, Contacts), the main process and `node --test`
 * (tests/onion.test.js). SHA-512 is passed in (node's crypto in the main process), so the page
 * needs none. Never logs a key.
 */
import { sha3_256 } from 'js-sha3';

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
export const ONION_LEN = 56;
export const KEY_FILE_HEADER = '== ed25519v1-secret: type0 ==';

export function base32Encode(bytes) {
  let out = '', bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/* lower-case base32 without padding → bytes, or null on a character outside the alphabet */
export function base32Decode(text) {
  const out = [];
  let bits = 0, value = 0;
  for (const ch of String(text)) {
    const i = B32.indexOf(ch);
    if (i < 0) return null;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Uint8Array.from(out);
}

function checksum(pub) {
  const prefix = new TextEncoder().encode('.onion checksum');
  const data = new Uint8Array(prefix.length + 33);
  data.set(prefix, 0);
  data.set(pub, prefix.length);
  data[prefix.length + 32] = 3;
  return Uint8Array.from(sha3_256.array(data).slice(0, 2));
}

function hexBytes(hex) {
  const h = String(hex || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) throw new Error('not a 32-byte hex key');
  return Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
}

/* the onion name (no .onion) of a 32-byte ed25519 public key */
export function onionFromPubkey(pub) {
  if (!pub || pub.length !== 32) throw new Error('not a 32-byte key');
  const all = new Uint8Array(35);
  all.set(pub, 0);
  all.set(checksum(pub), 32);
  all[34] = 3;
  return base32Encode(all);
}

export function onionFromPubkeyHex(hex) {
  return onionFromPubkey(hexBytes(hex));
}

/*
 * What someone typed or pasted as a Tor address → {host, valid, reason}
 *   reason: '' | 'empty' | 'format' (not a 56-character onion name) | 'version' | 'checksum'
 * host is '<name>.onion' (lower case) once the shape is right, even when the checksum is wrong.
 */
export function parseOnion(text) {
  let s = String(text == null ? '' : text).trim().toLowerCase();
  if (!s) return { host: '', valid: false, reason: 'empty' };
  s = s.replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/:80$/, '').replace(/\.onion$/, '');
  if (s.length !== ONION_LEN || !/^[a-z2-7]+$/.test(s)) return { host: '', valid: false, reason: 'format' };
  const host = s + '.onion';
  const bytes = base32Decode(s);
  if (!bytes || bytes.length !== 35) return { host: '', valid: false, reason: 'format' };
  if (bytes[34] !== 3) return { host, valid: false, reason: 'version' };
  const want = checksum(bytes.slice(0, 32));
  if (bytes[32] !== want[0] || bytes[33] !== want[1]) return { host, valid: false, reason: 'checksum' };
  return { host, valid: true, reason: '' };
}

/* does this text look like an onion address at all (Send: show the Tor hints) */
export function looksLikeOnion(text) {
  return parseOnion(text).reason !== 'format' && parseOnion(text).reason !== 'empty';
}

/* the 32-byte public key of a valid onion, or null */
export function pubkeyOfOnion(text) {
  const p = parseOnion(text);
  return p.valid ? base32Decode(p.host.slice(0, ONION_LEN)).slice(0, 32) : null;
}

/*
 * Tor's expanded ed25519 secret key from the 32-byte seed: SHA-512, then clamp
 * (h[0] &= 248; h[31] &= 127; h[31] |= 64). sha512(bytes) → bytes (64), passed in.
 */
export function expandSeed(seed, sha512) {
  if (!seed || seed.length !== 32) throw new Error('seed must be 32 bytes');
  const h = Uint8Array.from(sha512(seed));
  if (h.length !== 64) throw new Error('sha512 must give 64 bytes');
  h[0] &= 248;
  h[31] &= 127;
  h[31] |= 64;
  return h;
}

/*
 * epic-wallet's hs_ed25519_secret_key (96 bytes: a 32-byte header, then 64 key bytes) →
 * {key: the 64 key bytes, header ok}. 4.1.0 writes seed ‖ pubkey; a fixed wallet would write
 * tor's expanded key. Which one it is: the caller checks the second half against the onion
 * (keyForTor). null when the file isn't one.
 */
export function readOnionKeyFile(buf) {
  if (!buf || buf.length !== 96) return null;
  const header = new TextDecoder().decode(buf.slice(0, KEY_FILE_HEADER.length));
  if (header !== KEY_FILE_HEADER) return null;
  return { key: Uint8Array.from(buf.slice(32, 96)) };
}

function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/*
 * The 64-byte expanded key for ADD_ONION from a key file's 64 key bytes, for the onion it must
 * publish. 4.1.0's format (seed ‖ pubkey, the pubkey the onion's): the seed expanded. Anything
 * else is taken as already expanded (a fixed epic-wallet); tor's ServiceID then tells whether it
 * was right (torManager checks it). → {key, format: 'seed' | 'expanded'} | {error: 'mismatch'}
 * when the file is the seed format of another onion.
 */
export function keyForTor(key64, onion, sha512) {
  const pub = pubkeyOfOnion(onion);
  if (!pub || !key64 || key64.length !== 64) return { error: 'mismatch' };
  if (sameBytes(key64.slice(32, 64), pub)) return { key: expandSeed(key64.slice(0, 32), sha512), format: 'seed' };
  return { key: Uint8Array.from(key64), format: 'expanded' };
}

/* the key file of an onion: <dataDir>/wallet_tor/onion_service_addresses/<name>/hs_ed25519_secret_key */
export function onionKeyPath(dataDir, onion, join) {
  const p = parseOnion(onion);
  if (!p.valid) throw new Error('not a valid onion');
  return join(dataDir, 'wallet_tor', 'onion_service_addresses', p.host.slice(0, ONION_LEN), 'hs_ed25519_secret_key');
}
