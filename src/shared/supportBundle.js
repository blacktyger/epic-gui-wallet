/*
 * Support reports: the encrypted bundle (docs/support/DESIGN.md). Plain ESM on Node's own crypto and
 * zlib (OpenSSL: X25519, HKDF-SHA256, AES-256-GCM), no new dependency; the main process builds it,
 * scripts/support-decrypt opens it, `node --test` checks both (tests/supportBundle.test.js).
 *
 * A sealed box to the developer's public key: each bundle gets a fresh X25519 key pair, so only the
 * holder of the developer's private key can open it, and the app (which only has the public key)
 * cannot open what it sent. Layout:
 *   "EPICSUP1" (8) | keyId (8) | ephemeral public key (32) | nonce (12) | ciphertext | GCM tag (16)
 * key = HKDF-SHA256(X25519(ephemeral, developer), salt = ephemeral || developer, info = INFO);
 * the 60 header bytes are the AEAD's additional data, so no header byte can be swapped.
 */
import crypto from 'crypto';
import zlib from 'zlib';

export const MAGIC = Buffer.from('EPICSUP1', 'ascii');
const INFO = Buffer.from('epic-gui-support v1', 'ascii');
const HEADER = 8 + 8 + 32 + 12;
const TAG = 16;

//a sealed bundle is at most this big (the intake refuses more); each log adds at most its tail
export const MAX_BUNDLE = 2 * 1024 * 1024;
export const MAX_FILE_TEXT = 512 * 1024;
export const MAX_DESCRIPTION = 2000;
export const MAX_CONTACT = 100;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/* the developer public key: 32 raw bytes, from base64 (as embedded) or a Buffer */
export function rawPublicKey(key) {
  const raw = Buffer.isBuffer(key) ? key : Buffer.from(String(key || ''), 'base64');
  if (raw.length !== 32) throw new Error('support key: an X25519 public key is 32 bytes');
  return raw;
}

/* which key a bundle is for: the first 8 bytes of SHA-256(public key) */
export function keyIdOf(publicKey) {
  return crypto.createHash('sha256').update(rawPublicKey(publicKey)).digest().subarray(0, 8);
}

function publicKeyObject(raw) {
  return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: b64url(raw) }, format: 'jwk' });
}

function rawOf(keyObject) {
  return Buffer.from(keyObject.export({ format: 'jwk' }).x, 'base64url');
}

function deriveKey(privateKey, peerPublicRaw, ephRaw, devRaw) {
  const shared = crypto.diffieHellman({ privateKey, publicKey: publicKeyObject(peerPublicRaw) });
  //a low-order public key gives an all-zero secret: refuse it rather than encrypt to nobody
  if (shared.every((b) => b === 0)) throw new Error('support key: bad public key');
  return Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.concat([ephRaw, devRaw]), INFO, 32));
}

/* seal bytes to the developer's public key (base64 or raw) */
export function seal(plain, developerPublicKey) {
  const devRaw = rawPublicKey(developerPublicKey);
  const eph = crypto.generateKeyPairSync('x25519');
  const ephRaw = rawOf(eph.publicKey);
  const key = deriveKey(eph.privateKey, devRaw, ephRaw, devRaw);
  const nonce = crypto.randomBytes(12);
  const header = Buffer.concat([MAGIC, keyIdOf(devRaw), ephRaw, nonce]);
  const c = crypto.createCipheriv('aes-256-gcm', key, nonce);
  c.setAAD(header);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([header, body, c.getAuthTag()]);
}

/* the parts of a sealed bundle's header, or null when it is not one */
export function readHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < HEADER + TAG || !buf.subarray(0, 8).equals(MAGIC)) return null;
  return { keyId: buf.subarray(8, 16), ephRaw: buf.subarray(16, 48), nonce: buf.subarray(48, 60) };
}

/* open a sealed bundle with the developer's private key (a KeyObject or PEM); throws when it is not
   for this key or was changed */
export function open(buf, developerPrivateKey) {
  const h = readHeader(buf);
  if (!h) throw new Error('not a support bundle');
  const priv = typeof developerPrivateKey === 'string' || Buffer.isBuffer(developerPrivateKey)
    ? crypto.createPrivateKey(developerPrivateKey) : developerPrivateKey;
  const devRaw = rawOf(crypto.createPublicKey(priv));
  if (!h.keyId.equals(keyIdOf(devRaw))) throw new Error('this bundle is for another key (key id ' + h.keyId.toString('hex') + ')');
  const key = deriveKey(priv, h.ephRaw, h.ephRaw, devRaw);
  const d = crypto.createDecipheriv('aes-256-gcm', key, h.nonce);
  d.setAAD(buf.subarray(0, HEADER));
  d.setAuthTag(buf.subarray(buf.length - TAG));
  return Buffer.concat([d.update(buf.subarray(HEADER, buf.length - TAG)), d.final()]);
}

/* a new developer key pair: the private key as PKCS#8 PEM, the public key as base64 raw bytes */
export function generateKeyPair() {
  const k = crypto.generateKeyPairSync('x25519');
  const publicKey = rawOf(k.publicKey).toString('base64');
  return { publicKey, keyId: keyIdOf(publicKey).toString('hex'),
    privatePem: k.privateKey.export({ format: 'pem', type: 'pkcs8' }) };
}

/* the last `max` bytes of a text, cut at a line start, with a note that the start was left out */
export function tailText(text, max = MAX_FILE_TEXT) {
  const s = String(text == null ? '' : text);
  const buf = Buffer.from(s, 'utf8');
  if (buf.length <= max) return { text: s, cut: false };
  let rest = buf.subarray(buf.length - max).toString('utf8');
  const nl = rest.indexOf('\n');
  if (nl >= 0 && nl < rest.length - 1) rest = rest.slice(nl + 1);
  //a split multi-byte character at the cut decodes as U+FFFD: drop it
  rest = rest.replace(/^�+/, '');
  return { text: '[… earlier lines left out …]\n' + rest, cut: true };
}

//one line of user text: no control characters (they would reach a terminal or the Telegram group)
// eslint-disable-next-line no-control-regex
const one = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

/*
 * The report as sealed bytes, within MAX_BUNDLE: files are [{name, text}] in order of importance
 * (already cleaned by logSanitize); each keeps at most its tail of MAX_FILE_TEXT, and when the whole
 * is still too big, the least important files are dropped. Returns {bundle, files, dropped}, files
 * as they went in ({name, bytes, text, cut}).
 */
export function buildBundle({ description, contact, app, files = [], created = new Date().toISOString() }, developerPublicKey, max = MAX_BUNDLE) {
  let kept = files.map((f) => {
    const t = tailText(f.text);
    return { name: String(f.name), bytes: Buffer.byteLength(t.text), text: t.text, cut: t.cut };
  });
  const dropped = [];
  for (;;) {
    const payload = { v: 1, created, app: app || {}, description: one(description, MAX_DESCRIPTION),
      contact: one(contact, MAX_CONTACT), files: kept, dropped };
    const bundle = seal(zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 }), developerPublicKey);
    if (bundle.length <= max) return { bundle, files: kept, dropped };
    if (!kept.length) throw new Error('support report too big');
    dropped.unshift(kept[kept.length - 1].name);
    kept = kept.slice(0, -1);
  }
}

/* the report inside a sealed bundle (the decrypt tool) */
export function openBundle(buf, developerPrivateKey) {
  const json = zlib.gunzipSync(open(buf, developerPrivateKey), { maxOutputLength: 64 * 1024 * 1024 });
  const payload = JSON.parse(json.toString('utf8'));
  if (!payload || payload.v !== 1) throw new Error('unknown report version');
  return payload;
}
