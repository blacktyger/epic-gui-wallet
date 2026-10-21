// Tests for src/shared/onion.js: onion v3 names, parsing, and the wallet's onion key (tor-616 §4). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { onionFromPubkeyHex, onionFromPubkey, parseOnion, looksLikeOnion, pubkeyOfOnion, expandSeed, readOnionKeyFile,
  keyForTor, onionKeyPath, base32Encode, base32Decode, KEY_FILE_HEADER } from '../src/shared/onion.js';

//a throwaway wallet that never held funds: its key file's seed, `epic-wallet address` and its proof address
const SEED = '37c50a0cfaf343cbc594fde3cb29a88427d40891de34791f1d97f9d99e1e35d9';
const ONION = 'mk7ca5rxicc6ps765gdj3irikfzer6ffd2jpysipnnpttl7jynzaluyd';
const PROOF = '62be2076374085e7cbfee9869da228517248f8a51e92fc490f6b5f39afe9c372';

const sha512 = (b) => crypto.createHash('sha512').update(b).digest();
const hex = (b) => Buffer.from(b).toString('hex');
/* the ed25519 public key of a seed, from node's crypto (PKCS#8 wrapper of a raw seed) */
function pubOfSeed(seedHex) {
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(seedHex, 'hex')]);
  const pub = crypto.createPublicKey(crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }));
  return pub.export({ format: 'der', type: 'spki' }).subarray(-32);
}

test('the proof address (get_public_proof_address) is the onion `epic-wallet address` prints', () => {
  assert.equal(onionFromPubkeyHex(PROOF), ONION);
  assert.equal(onionFromPubkeyHex(PROOF.toUpperCase()), ONION);
  assert.throws(() => onionFromPubkeyHex('abc'));
  assert.throws(() => onionFromPubkey(new Uint8Array(31)));
});

test('fixture: the key file\'s seed is the key of that onion', () => {
  assert.equal(hex(pubOfSeed(SEED)), PROOF);
  assert.equal(onionFromPubkey(pubOfSeed(SEED)), ONION);
});

test('expandSeed: SHA-512 of the seed, clamped', () => {
  const seed = Buffer.from(SEED, 'hex');
  const e = expandSeed(seed, sha512);
  const h = sha512(seed);
  assert.equal(e.length, 64);
  assert.equal(e[0], h[0] & 248);
  assert.equal(e[31], (h[31] & 127) | 64);
  assert.equal(hex(e.slice(1, 31)), hex(h.subarray(1, 31)));
  assert.equal(hex(e.slice(32)), hex(h.subarray(32)));
  assert.throws(() => expandSeed(new Uint8Array(31), sha512));
});

test('parseOnion accepts the bare name, .onion, http://, any :port, a path and upper case', () => {
  for (const t of [ONION, ONION + '.onion', 'http://' + ONION + '.onion', 'http://' + ONION + '.onion:80/', ' ' + ONION.toUpperCase() + '.ONION ',
    'https://' + ONION + '.onion/', 'http://' + ONION + '.onion:3415', ONION + '.onion:8080', ONION + '.onion/v2/foreign',
    'http://' + ONION + '.onion:3415/v2/foreign', ONION + ':3415']) {
    assert.deepEqual(parseOnion(t), { host: ONION + '.onion', valid: true, reason: '' }, t);
  }
});

test('parseOnion: a typo is a checksum error, other shapes are not onions', () => {
  const typo = ONION.slice(0, 10) + (ONION[10] === 'a' ? 'b' : 'a') + ONION.slice(11);
  assert.deepEqual(parseOnion(typo), { host: typo + '.onion', valid: false, reason: 'checksum' });
  //the spike's malformed onion (tor answered SOCKS 0xF6): version 3, but no checksum
  assert.equal(parseOnion('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaad').reason, 'checksum');
  assert.equal(parseOnion('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaae').reason, 'version');
  assert.equal(parseOnion('').reason, 'empty');
  assert.equal(parseOnion(null).reason, 'empty');
  assert.equal(parseOnion(ONION.slice(1)).reason, 'format');
  assert.equal(parseOnion(ONION + '.onion:abc').reason, 'format');
  assert.equal(parseOnion(ONION + '.onion:123456').reason, 'format');
  assert.equal(parseOnion('http://' + typo + '.onion:3415/v2/foreign').reason, 'checksum', 'the checksum still counts with a port and path');
  assert.equal(parseOnion('esXXXXX@epicbox.stackwallet.com').reason, 'format');
  assert.equal(parseOnion('expyuzz4wqqyqhjn.onion').reason, 'format', 'v2 onions are gone');
  assert.equal(parseOnion(ONION.slice(0, 55) + '1').reason, 'format');
  assert.equal(looksLikeOnion(typo), true);
  assert.equal(looksLikeOnion('es1abc@epicbox'), false);
});

test('pubkeyOfOnion gives the key back; invalid ones give null', () => {
  assert.equal(hex(pubkeyOfOnion(ONION)), PROOF);
  assert.equal(pubkeyOfOnion('nope'), null);
});

test('base32 round trip', () => {
  const b = crypto.randomBytes(35);
  assert.equal(hex(base32Decode(base32Encode(b))), hex(b));
  assert.equal(base32Decode('a1'), null);
});

function keyFile(seedHex, pub) {
  const header = Buffer.alloc(32);
  header.write(KEY_FILE_HEADER);
  return Buffer.concat([header, Buffer.from(seedHex, 'hex'), Buffer.from(pub)]);
}

test('the key file: epic-wallet 4.1.0\'s seed ‖ pubkey is expanded; an already expanded key is used as it is', () => {
  const file = keyFile(SEED, pubOfSeed(SEED));
  const k = readOnionKeyFile(file);
  assert.ok(k);
  const r = keyForTor(k.key, ONION, sha512);
  assert.equal(r.format, 'seed');
  assert.equal(hex(r.key), hex(expandSeed(Buffer.from(SEED, 'hex'), sha512)));
  //a fixed epic-wallet writing the expanded key: never expanded twice
  const expanded = expandSeed(Buffer.from(SEED, 'hex'), sha512);
  const r2 = keyForTor(readOnionKeyFile(Buffer.concat([file.subarray(0, 32), Buffer.from(expanded)])).key, ONION, sha512);
  assert.equal(r2.format, 'expanded');
  assert.equal(hex(r2.key), hex(expanded));
  assert.deepEqual(keyForTor(k.key, 'bad', sha512), { error: 'mismatch' });
});

test('readOnionKeyFile refuses other files', () => {
  assert.equal(readOnionKeyFile(Buffer.alloc(96)), null);
  assert.equal(readOnionKeyFile(Buffer.alloc(64)), null);
  assert.equal(readOnionKeyFile(null), null);
});

test('onionKeyPath: under wallet_tor/onion_service_addresses/<name>', () => {
  const join = (...p) => p.join('/');
  assert.equal(onionKeyPath('/w', 'http://' + ONION + '.onion', join),
    '/w/wallet_tor/onion_service_addresses/' + ONION + '/hs_ed25519_secret_key');
  assert.throws(() => onionKeyPath('/w', '../../etc', join));
});
