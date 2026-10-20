'use strict';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { seal, open, readHeader, keyIdOf, generateKeyPair, buildBundle, openBundle, tailText, rawPublicKey,
  MAGIC, MAX_BUNDLE, MAX_FILE_TEXT, MAX_DESCRIPTION, MAX_CONTACT } from '../src/shared/supportBundle.js';
import { SUPPORT_PUBLIC_KEY, SUPPORT_KEY_ID } from '../src/shared/supportKey.js';

const dev = generateKeyPair();
const other = generateKeyPair();

test('seal/open round trip; every bundle has a fresh ephemeral key and nonce', () => {
  const plain = Buffer.from('zażółć gęślą jaźń · C:\\Users\\… · 0123', 'utf8');
  const a = seal(plain, dev.publicKey);
  const b = seal(plain, dev.publicKey);
  assert.ok(a.subarray(0, 8).equals(MAGIC));
  assert.deepEqual(open(a, dev.privatePem), plain);
  assert.deepEqual(open(b, dev.privatePem), plain);
  assert.ok(!readHeader(a).ephRaw.equals(readHeader(b).ephRaw));
  assert.ok(!readHeader(a).nonce.equals(readHeader(b).nonce));
  //no plaintext in the sealed bytes
  assert.ok(!a.includes(Buffer.from('gęślą')));
  assert.equal(a.length, plain.length + 60 + 16);
});

test('the key id names the developer key; another key cannot open it', () => {
  const s = seal(Buffer.from('x'), dev.publicKey);
  assert.equal(readHeader(s).keyId.toString('hex'), dev.keyId);
  assert.equal(keyIdOf(dev.publicKey).toString('hex'), dev.keyId);
  assert.throws(() => open(s, other.privatePem), /another key/);
  //another key with the key id forged to match still fails authentication
  const forged = Buffer.from(s);
  keyIdOf(other.publicKey).copy(forged, 8);
  assert.throws(() => open(forged, other.privatePem));
});

test('any changed byte (header, ciphertext, tag) or a cut is refused', () => {
  const s = seal(Buffer.from('a report body that is long enough to flip bits in'), dev.publicKey);
  for (const i of [9, 20, 50, 61, 70, s.length - 1]) {
    const t = Buffer.from(s);
    t[i] ^= 1;
    assert.throws(() => open(t, dev.privatePem), undefined, 'byte ' + i);
  }
  assert.throws(() => open(s.subarray(0, s.length - 1), dev.privatePem));
  assert.throws(() => open(Buffer.from('EPICSUP2' + 'x'.repeat(100)), dev.privatePem), /not a support bundle/);
  assert.equal(readHeader(Buffer.from('short')), null);
});

test('bad public keys are refused: wrong length, all-zero (low order)', () => {
  assert.throws(() => rawPublicKey('AAAA'));
  assert.throws(() => seal(Buffer.from('x'), Buffer.alloc(32)));
});

test('the embedded public key is a valid X25519 key with the published key id', () => {
  assert.equal(rawPublicKey(SUPPORT_PUBLIC_KEY).length, 32);
  assert.equal(keyIdOf(SUPPORT_PUBLIC_KEY).toString('hex'), SUPPORT_KEY_ID);
  //and nothing that looks like a private key sits next to it
  assert.ok(!/PRIVATE KEY/.test(JSON.stringify({ SUPPORT_PUBLIC_KEY, SUPPORT_KEY_ID })));
});

test('buildBundle/openBundle: the report as it went in, description and contact trimmed and capped', () => {
  const r = buildBundle({ description: '  Nie łączy się z węzłem\u0007\u0000 ' + 'x'.repeat(3000), contact: '@tester\n' + 'y'.repeat(200),
    app: { version: '6.1.5', platform: 'win32' }, files: [{ name: 'main.log', text: 'line 1\nline 2\n' }] }, dev.publicKey);
  const p = openBundle(r.bundle, dev.privatePem);
  assert.equal(p.v, 1);
  assert.equal(p.app.version, '6.1.5');
  assert.equal(p.description.length, MAX_DESCRIPTION);
  assert.ok(p.description.startsWith('Nie łączy się z węzłem x'));
  assert.equal(p.contact.length, MAX_CONTACT);
  assert.ok(!p.description.includes('\u0000') && !p.description.includes('\u0007'));
  assert.deepEqual(p.files, [{ name: 'main.log', bytes: 14, text: 'line 1\nline 2\n', cut: false }]);
  assert.deepEqual(p.dropped, []);
});

test('size cap: a long log keeps its tail; files that do not fit are dropped, least important first', () => {
  const t = tailText('a\n'.repeat(MAX_FILE_TEXT), MAX_FILE_TEXT);
  assert.ok(t.cut);
  assert.ok(Buffer.byteLength(t.text) <= MAX_FILE_TEXT + 40);
  assert.ok(t.text.startsWith('[… earlier lines left out …]\na\n'));
  //a multi-byte character cut in half is not left as a broken character
  assert.ok(!tailText('ż'.repeat(1000), 1001).text.includes('\uFFFD'));
  //incompressible logs: 6 × 512 KiB of random base64 (~384 KiB each gzipped) cannot fit in 2 MiB
  const noise = () => crypto.randomBytes(MAX_FILE_TEXT * 3 / 4).toString('base64');
  const files = ['main.log', 'renderer.log', 'epic-wallet.log', 'epic-wallet.log.1', 'epic-server.log', 'main.old.log'].map((name) => ({ name, text: noise() }));
  const r = buildBundle({ description: 'd', files }, dev.publicKey);
  assert.ok(r.bundle.length <= MAX_BUNDLE);
  assert.ok(r.dropped.length >= 1);
  assert.deepEqual(r.files.map((f) => f.name), files.slice(0, files.length - r.dropped.length).map((f) => f.name));
  assert.deepEqual(openBundle(r.bundle, dev.privatePem).dropped, r.dropped);
  //a smaller cap that not even the description fits in is an error, not an empty report
  assert.throws(() => buildBundle({ description: 'd', files: [] }, dev.publicKey, 50), /too big/);
});

test('openBundle refuses a gzip bomb and an unknown version', () => {
  const bomb = seal(zlib.gzipSync(Buffer.alloc(80 * 1024 * 1024)), dev.publicKey);
  assert.throws(() => openBundle(bomb, dev.privatePem));
  const v2 = seal(zlib.gzipSync(Buffer.from(JSON.stringify({ v: 2 }))), dev.publicKey);
  assert.throws(() => openBundle(v2, dev.privatePem), /version/);
});
