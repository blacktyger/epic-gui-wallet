// The Tor UI helpers (src/shared/torUi.js), the stubbed onion parser and the contacts' Tor address. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha3_256, parseOnion } from '../src/shared/onion.js';
import {
  torPhase, torPercent, torStatus, torErrorKey, torErrorText, torCardLine, onionVerdict, torSendStepKey, torSendError, showOnionField, onionProblem,
} from '../src/shared/torUi.js';
import { contactAddresses, sendableAddresses, searchContacts, contactProblems } from '../src/shared/contacts.js';

/* a good v3 address made here from a fixed public key */
function makeOnion(seed = 7) {
  const pub = Buffer.alloc(32, seed);
  const sum = createHash('sha3-256').update(Buffer.concat([Buffer.from('.onion checksum'), pub, Buffer.from([3])])).digest().subarray(0, 2);
  const raw = Buffer.concat([pub, sum, Buffer.from([3])]);
  const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = '';
  for (const b of raw) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
const GOOD = makeOnion();
const TYPO = GOOD.slice(0, 10) + (GOOD[10] == 'a' ? 'b' : 'a') + GOOD.slice(11);

const T = (k, p) => k + (p && Object.keys(p).length ? JSON.stringify(p) : '');

test('sha3_256 agrees with node:crypto, also across the 136-byte block edge', () => {
  for (const n of [0, 1, 15, 135, 136, 137, 300]) {
    const data = Buffer.alloc(n, n % 251);
    assert.equal(Buffer.from(sha3_256(data)).toString('hex'), createHash('sha3-256').update(data).digest('hex'), 'length ' + n);
  }
});

test('parseOnion: the bare name, .onion, http://, :80 and a trailing slash are the same address', () => {
  for (const form of [GOOD, GOOD + '.onion', 'http://' + GOOD + '.onion', 'HTTP://' + GOOD.toUpperCase() + '.ONION:80/', ' ' + GOOD + ' ']) {
    assert.deepEqual(parseOnion(form), { host: GOOD + '.onion', valid: true, reason: '' }, form);
  }
});

test('parseOnion: a typo fails the checksum, other text is not an onion name', () => {
  assert.equal(parseOnion(TYPO).valid, false);
  assert.equal(parseOnion(TYPO).reason, 'checksum');
  assert.equal(parseOnion('abc.onion').reason, 'format');
  assert.equal(parseOnion('').valid, false);
  assert.equal(parseOnion(GOOD + ':8080').valid, false);
});

const tor = (o) => ({ enabled: true, state: 'starting', progress: 0, onion: '', error: '', detail: '', ...o });

test('torPhase / torPercent', () => {
  assert.equal(torPhase(undefined), 'off');
  assert.equal(torPhase({ enabled: false, state: 'ready' }), 'off');
  assert.equal(torPhase(tor({ state: 'ready' })), 'ready');
  assert.equal(torPhase(tor({ state: 'weird' })), 'starting');
  assert.equal(torPercent(tor({ progress: 44.6 })), 45);
  assert.equal(torPercent(tor({ progress: 400 })), 100);
  assert.equal(torPercent(tor({ progress: 'x' })), 0);
});

test('torStatus: the row line for each state', () => {
  assert.equal(torStatus(undefined), null);
  assert.deepEqual(torStatus(tor({ progress: 45 })), { tone: 'busy', key: 'msg.modern.settings.tor.connecting', params: { n: 45 } });
  assert.equal(torStatus(tor({ state: 'publishing' })).key, 'msg.modern.settings.tor.publishing');
  assert.deepEqual(torStatus(tor({ state: 'ready' })).tone, 'ok');
  const f = torStatus(tor({ state: 'failed', error: 'start', detail: 'boom' }));
  assert.deepEqual([f.tone, f.key, f.params.detail], ['warn', 'msg.modern.settings.tor.err_start', 'boom']);
});

test('error codes: a message of their own, else err_other', () => {
  for (const c of ['unreachable', 'invalid', 'broken', 'auth', 'not_epic', 'too_old', 'refused', 'finalize', 'post', 'missing', 'start', 'network', 'clock', 'keys', 'listener', 'tor_off']) {
    assert.equal(torErrorKey(c), 'msg.modern.settings.tor.err_' + c);
  }
  assert.equal(torErrorKey('???'), 'msg.modern.settings.tor.err_other');
  assert.equal(torErrorText(T, 'refused', 'no thanks'), 'msg.modern.settings.tor.err_refused{"msg":"no thanks","detail":"no thanks"}');
  assert.equal(torSendError(T, { ok: false, code: 'unreachable' }).startsWith('msg.modern.settings.tor.err_unreachable'), true);
});

test('torCardLine: null while off, else "Tor: …"', () => {
  assert.equal(torCardLine(tor({ enabled: false }), T), null);
  assert.equal(torCardLine(tor({ state: 'ready' }), T), 'msg.modern.settings.tor.title: msg.modern.settings.tor.card_ready');
  assert.match(torCardLine(tor({ progress: 45 }), T), /card_connecting\{"n":45\}$/);
  assert.match(torCardLine(tor({ state: 'failed', error: 'network' }), T), /card_failed$/);
});

test('onionVerdict: what Send does with the recipient', () => {
  assert.equal(onionVerdict('esAbc@epicbox.epiccash.com', tor({ state: 'ready' })), 'none');
  assert.equal(onionVerdict('http://203.0.113.7:3415', tor({ state: 'ready' })), 'none');
  assert.equal(onionVerdict(TYPO + '.onion', tor({ state: 'ready' })), 'typo');
  assert.equal(onionVerdict(GOOD + '.onion', undefined), 'tor_off');
  assert.equal(onionVerdict(GOOD, tor({ enabled: false })), 'tor_off');
  assert.equal(onionVerdict(GOOD, tor({ state: 'starting' })), 'wait');
  assert.equal(onionVerdict(GOOD, tor({ state: 'publishing' })), 'ok');
  assert.equal(onionVerdict(GOOD, tor({ state: 'ready' })), 'ok');
  assert.equal(onionVerdict(GOOD, tor({ state: 'failed' })), 'failed');
});

test('send steps map to their progress lines', () => {
  assert.equal(torSendStepKey('sign'), 'msg.modern.settings.tor.send_sign');
  assert.equal(torSendStepKey('post'), 'msg.modern.settings.tor.send_post');
  assert.equal(torSendStepKey('x'), 'msg.modern.settings.tor.send_connect');
});

test('contacts: the Tor field shows when Tor is on or the contact has an address', () => {
  assert.equal(showOnionField(undefined, { onion: '' }), false);
  assert.equal(showOnionField(undefined, { onion: GOOD }), true);
  assert.equal(showOnionField(tor({ state: 'ready' }), {}), true);
  assert.equal(onionProblem(''), '');
  assert.equal(onionProblem(GOOD), '');
  assert.equal(onionProblem(TYPO), 'typo');
  assert.equal(onionProblem('hello'), 'format');
});

test('contacts: the onion column is an address only with tor (Classic is unchanged)', () => {
  const c = { name: 'A', externalOne: '', externalTwo: '', onion: GOOD + '.onion' };
  assert.deepEqual(contactAddresses(c), []);
  assert.deepEqual(contactAddresses(c, { tor: true }).map(a => [a.field, a.kind]), [['onion', 'tor']]);
  assert.equal(sendableAddresses(c, { tor: true }).length, 1);
  assert.equal(sendableAddresses({ ...c, onion: TYPO }, { tor: true }).length, 0);
  assert.equal(searchContacts([c], GOOD.slice(5, 15)).length, 0);
  assert.equal(searchContacts([c], GOOD.slice(5, 15), { tor: true }).length, 1);
});

test('contacts: a Tor address alone is an address; a bad one is a problem', () => {
  const c = { name: 'A', onion: GOOD };
  assert.equal(contactProblems(c).address, true);
  assert.equal(contactProblems(c, { tor: true }).address, undefined);
  assert.equal(contactProblems({ ...c, onion: TYPO }, { tor: true }).torTypo, true);
  assert.equal(contactProblems({ ...c, onion: 'hi' }, { tor: true }).torFormat, true);
  //an old stored value in Classic is not judged
  assert.equal(contactProblems({ ...c, onion: 'hi' }).torFormat, undefined);
});
