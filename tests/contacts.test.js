// Tests for src/shared/contacts.js, what a contact save writes and what a search shows: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactFields, searchContacts, contactProblem, CONTACT_TEXT_FIELDS } from '../src/shared/contacts.js';

const zoe = { id: 1, user_id: 7, name: 'Zoë Łukasz', country: '', city: 'Kraków', onion: '', proofaddr: '',
  externalOne: 'esWg1ygtow@epicbox.epiccash.com', externalTwo: '', notice: 'rig contact, C:\\path\\with\\backslashes' };
const bob = { id: 2, user_id: 7, name: 'Bob', country: 'UK', city: '', onion: 'abc.onion', proofaddr: '', externalOne: '', externalTwo: '', notice: '' };

test('a save writes every text column as a string, missing or null ones empty', () => {
  const f = contactFields({ name: 'A', city: null, alwaysproof: 1 });
  for (const k of CONTACT_TEXT_FIELDS) assert.equal(typeof f[k], 'string', k);
  assert.equal(f.name, 'A');
  assert.equal(f.city, '');
  assert.equal(f.alwaysproof, true);
  assert.equal(contactFields().alwaysproof, false);
});

test('search ignores case, also for non-ASCII letters', () => {
  assert.deepEqual(searchContacts([zoe, bob], 'łuk').map(c => c.id), [1]);
  assert.deepEqual(searchContacts([zoe, bob], 'ŁUKASZ').map(c => c.id), [1]);
});

test('country and city an older version stored are kept on save but not searched (they are not shown any more)', () => {
  assert.deepEqual(searchContacts([zoe, bob], 'kraków').map(c => c.id), []);
  assert.deepEqual(searchContacts([bob], 'UK').map(c => c.id), []);
  assert.equal(contactFields(zoe).city, 'Kraków');
  assert.equal(contactFields(bob).country, 'UK');
});

test('search takes the text literally: regex characters and backslashes neither throw nor match everything', () => {
  assert.deepEqual(searchContacts([zoe, bob], 'C:\\path').map(c => c.id), [1]);
  assert.deepEqual(searchContacts([zoe, bob], '(').map(c => c.id), []);
  assert.deepEqual(searchContacts([zoe, bob], '.').map(c => c.id), [1]);
  assert.deepEqual(searchContacts([zoe, bob], 'a.o').map(c => c.id), []);
});

test('a Tor address an older version stored: kept on save, not searched (it is not shown any more)', () => {
  assert.equal(contactFields(bob).onion, 'abc.onion');
  assert.deepEqual(searchContacts([zoe, bob], 'abc.onion').map(c => c.id), []);
  assert.deepEqual(searchContacts([zoe, bob], 'bob').map(c => c.id), [2]);
});

test('proof fields an older version stored: kept on save, not searched (they are not shown any more)', () => {
  const old = { ...bob, proofaddr: 'b4e2a7c6d1f0e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4', alwaysproof: true };
  assert.equal(contactFields(old).proofaddr, old.proofaddr);
  assert.equal(contactFields(old).alwaysproof, true);
  assert.deepEqual(searchContacts([zoe, old], 'b4e2a7c6').map(c => c.id), []);
});

test('an empty or blank search shows all contacts; no match shows none', () => {
  assert.equal(searchContacts([zoe, bob], '').length, 2);
  assert.equal(searchContacts([zoe, bob], '   ').length, 2);
  assert.equal(searchContacts([zoe, bob], 'nomatch-xyz').length, 0);
  assert.deepEqual(searchContacts(null, 'x'), []);
});

test('a contact needs a name and an address to send to; an Epicbox address must be one (QA T04)', () => {
  const box = 'esWY5xrwwGme5Ca6Aje8joEvtqNLtUcKfkycNFDQSYQbHi14LyEM@epicbox.epiccash.com';
  assert.equal(contactProblem({}), 'name');
  assert.equal(contactProblem({ name: '   ', externalOne: box }), 'name');
  assert.equal(contactProblem({ name: 'Alice' }), 'address');
  assert.equal(contactProblem({ name: 'Alice', externalOne: 'not an address!!' }), 'epicbox');
  assert.equal(contactProblem({ name: 'Alice', externalOne: box }), null);
  assert.equal(contactProblem({ name: 'Alice', externalOne: box.split('@')[0] }), null);
  assert.equal(contactProblem({ name: 'Alice', externalTwo: 'http://1.2.3.4:3415' }), null);
  assert.equal(contactProblem({ name: 'Alice', onion: 'a'.repeat(56) }), 'address');
});

/* ---- 6.1.6: the redesigned Contacts and the Send picker ---- */
import {
  contactProblems, contactAddresses, shortAddress, contactActivity, contactTransactions, sortContacts,
  pickableContacts, sendQuery, sendableAddresses,
} from '../src/shared/contacts.js';

const BOX = 'esWY5xrwwGme5Ca6Aje8joEvtqNLtUcKfkycNFDQSYQbHi14LyEM@epicbox.epiccash.com';

/* a row as 6.0/6.1.x stored it in the Addressbook table (IndexedDB "Epicwallet" v5): gender and keybase
   columns, a Tor address, payment proof fields, a missing city */
const legacy = { id: 4, user_id: 7, name: 'Old Friend', gender: 'male', keybase: '', country: 'PL', onion: 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion',
  alwaysproof: true, proofaddr: 'b4e2a7c6d1f0e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4', externalOne: BOX, externalTwo: '', notice: 'from 6.0' };

test('migration: a contact stored by an older version reads and saves back with every field it had', () => {
  const saved = contactFields(legacy);
  for (const k of ['name', 'country', 'onion', 'proofaddr', 'externalOne', 'externalTwo', 'notice']) assert.equal(saved[k], legacy[k], k);
  assert.equal(saved.city, '');
  assert.equal(saved.alwaysproof, true);
  //nothing new is written into the row: the schema (and an older GUI reading it) stays as it was
  assert.deepEqual(Object.keys(saved).sort(), [...CONTACT_TEXT_FIELDS, 'alwaysproof'].sort());
  //its hidden Tor address is no problem for the form (it is not one of the fields shown)
  assert.deepEqual(contactProblems(legacy), {});
  assert.deepEqual(contactAddresses(legacy).map((a) => a.field), ['externalOne']);
});

test('the form checks each field as you type: name, Epicbox, HTTP, Tor', () => {
  assert.deepEqual(contactProblems({}), { name: true, address: true });
  assert.deepEqual(contactProblems({ name: 'A', externalOne: 'esShort@epicbox.epiccash.com' }), { epicbox: true });
  assert.deepEqual(contactProblems({ name: 'A', externalTwo: 'http://203.0.113.5:3415' }), {});
  assert.deepEqual(contactProblems({ name: 'A', externalTwo: 'https://shop.example/v2/foreign' }), {});
  assert.deepEqual(contactProblems({ name: 'A', externalTwo: '203.0.113.5:3415' }), {});
  assert.deepEqual(contactProblems({ name: 'A', externalTwo: 'hello world' }), { http: true });
  assert.deepEqual(contactProblems({ name: 'A', externalTwo: BOX }), { http: true });
  assert.deepEqual(contactProblems({ name: 'A', externalTwo: 'http://' + 'a'.repeat(56) + '.onion' }), { http: true, onion: true });
  assert.deepEqual(contactProblems({ name: 'A', externalOne: 'abc.onion' }), { epicbox: true, onion: true });
  assert.equal(contactProblem({ name: 'A', externalOne: BOX, externalTwo: 'nope' }), 'http');
});

test('a contact\'s addresses: Epicbox first, blank ones left out, trimmed', () => {
  assert.deepEqual(contactAddresses({ externalOne: ' ' + BOX + ' ', externalTwo: 'http://1.2.3.4:3415' }), [
    { field: 'externalOne', kind: 'epicbox', address: BOX },
    { field: 'externalTwo', kind: 'http', address: 'http://1.2.3.4:3415' },
  ]);
  assert.deepEqual(contactAddresses({ externalOne: '  ', externalTwo: null }), []);
  assert.deepEqual(contactAddresses(null), []);
});

test('short addresses keep the start and end of the key, and the server', () => {
  assert.equal(shortAddress(BOX), 'esWY5x…LyEM@epicbox.epiccash.com');
  assert.equal(shortAddress(BOX.split('@')[0]), 'esWY5x…LyEM');
  assert.equal(shortAddress('http://203.0.113.5:3415'), 'http://203.0.113.5:3415');
  assert.equal(shortAddress('https://a-very-long-hostname.example.com:3415/v2/foreign'), 'https://a-very-long-host…v2/foreign');
  assert.equal(shortAddress(''), '');
});

/* store txs as processTxs leaves them: tx.address is the AddressTransactions row (address = contact id) */
const tx = (id, contact, ts) => ({ id, creation_ts: ts, address: contact ? { slateid: 's' + id, type: 'http', address: contact } : undefined });
const txs = [tx(1, 4, '2026-10-01T10:00:00Z'), tx(2, 4, '2026-10-18T09:00:00Z'), tx(3, 9, '2026-09-01T00:00:00Z'), tx(4, null, '2026-10-19T00:00:00Z')];

test('the last transaction and the count per contact come from the linked transactions', () => {
  const a = contactActivity(txs);
  assert.deepEqual(a.get(4), { last: Date.parse('2026-10-18T09:00:00Z'), count: 2 });
  assert.equal(a.get(9).count, 1);
  assert.equal(a.size, 2);
  assert.equal(contactActivity(null).size, 0);
  assert.deepEqual(contactTransactions(txs, 4).map((t) => t.id), [2, 1]);
  assert.deepEqual(contactTransactions(txs, 0), []);
});

test('sorting: by name in the user\'s language, or the most recent transaction first', () => {
  const list = [{ id: 1, name: 'zoë' }, { id: 4, name: 'Bob' }, { id: 9, name: 'Ála' }, { id: 2, name: 'carl' }];
  assert.deepEqual(sortContacts(list, 'name', new Map(), 'en').map((c) => c.id), [9, 4, 2, 1]);
  //4: 18 Oct, 9: 1 Sep, then the ones without a transaction by name
  assert.deepEqual(sortContacts(list, 'recent', contactActivity(txs), 'en').map((c) => c.id), [4, 9, 2, 1]);
  //the list itself is not reordered
  assert.equal(list[0].id, 1);
});

test('the Send picker lists only contacts with an address, matching the search', () => {
  const list = [legacy, { id: 5, name: 'Tor only', onion: 'x.onion', externalOne: '', externalTwo: '' }, { id: 6, name: 'Shop', externalTwo: 'http://shop.example:3415' }];
  assert.deepEqual(pickableContacts(list, '').map((c) => c.id), [4, 6]);
  assert.deepEqual(pickableContacts(list, 'shop').map((c) => c.id), [6]);
  assert.deepEqual(pickableContacts(list, 'tor').map((c) => c.id), []);
});

test('a Tor address an older version kept in the HTTP field is shown but never offered for Send', () => {
  const c = { id: 8, name: 'Tor shop', externalOne: BOX, externalTwo: 'http://' + 'a'.repeat(56) + '.onion' };
  assert.equal(contactAddresses(c).length, 2);
  assert.deepEqual(sendableAddresses(c).map((a) => a.field), ['externalOne']);
  assert.deepEqual(pickableContacts([{ ...c, externalOne: '' }], ''), []);
});

test('Contacts › Send passes only a contact id and a field name', () => {
  assert.deepEqual(sendQuery({ contact: '4', use: 'externalTwo' }), { id: 4, field: 'externalTwo' });
  assert.deepEqual(sendQuery({ contact: '4' }), { id: 4, field: null });
  assert.deepEqual(sendQuery({ contact: '4', use: 'onion' }), { id: 4, field: 'onion' });
  assert.deepEqual(sendQuery({ contact: '4', use: 'proofaddr' }), { id: 4, field: null });
  assert.equal(sendQuery({ contact: 'x' }), null);
  assert.equal(sendQuery({ contact: '-1' }), null);
  assert.equal(sendQuery({}), null);
  assert.equal(sendQuery(undefined), null);
});
