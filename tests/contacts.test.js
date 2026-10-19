// Tests for src/shared/contacts.js, what a contact save writes and what a search shows: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactFields, searchContacts, CONTACT_TEXT_FIELDS } from '../src/shared/contacts.js';

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
  assert.deepEqual(searchContacts([zoe, bob], 'KRAKÓW').map(c => c.id), [1]);
});

test('search takes the text literally: regex characters and backslashes neither throw nor match everything', () => {
  assert.deepEqual(searchContacts([zoe, bob], 'C:\\path').map(c => c.id), [1]);
  assert.deepEqual(searchContacts([zoe, bob], '(').map(c => c.id), []);
  assert.deepEqual(searchContacts([zoe, bob], '.').map(c => c.id), [1, 2]);
  assert.deepEqual(searchContacts([zoe, bob], 'a.o').map(c => c.id), []);
});

test('an empty or blank search shows all contacts; no match shows none', () => {
  assert.equal(searchContacts([zoe, bob], '').length, 2);
  assert.equal(searchContacts([zoe, bob], '   ').length, 2);
  assert.equal(searchContacts([zoe, bob], 'nomatch-xyz').length, 0);
  assert.deepEqual(searchContacts(null, 'x'), []);
});
