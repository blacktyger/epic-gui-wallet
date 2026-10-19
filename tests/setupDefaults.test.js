// What the Setup Assistant prefills for configs left by older GUIs (matrix A/C runs). npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportedLocale, initialNodeChoice, initialEpicboxDomain, isLocalNodeAddress } from '../src/shared/setupDefaults.js';

const langs = {'bg': 'България', 'cz': 'Česko', 'de': 'Deutsch', 'en': 'English', 'fa': 'فارسی', 'hi': 'हिन्दी'};
const DEFAULT = 'epicbox.epiccash.com';

test('a language that is no longer offered falls back to English', () => {
  assert.equal(supportedLocale('ru', langs), 'en');
  assert.equal(supportedLocale('zh', langs), 'en');
  assert.equal(supportedLocale(undefined, langs), 'en');
  assert.equal(supportedLocale('', langs), 'en');
  assert.equal(supportedLocale('constructor', langs), 'en');
  assert.equal(supportedLocale('de', langs), 'de');
  assert.equal(supportedLocale('en', langs), 'en');
});

test('local node addresses', () => {
  for (const a of ['http://127.0.0.1:3413', 'http://localhost:3413', '127.0.0.1:3413', 'http://[::1]:3413', '', undefined]) {
    assert.equal(isLocalNodeAddress(a), true, String(a));
  }
  for (const a of ['https://node.epiccash.com:3413', 'node.epiccash.com:3413', 'http://192.168.1.5:3413', 'https://fastepic.eu:3413']) {
    assert.equal(isLocalNodeAddress(a), false, a);
  }
});

test('node step: a remote address saved by an old GUI preselects External with that address', () => {
  //5.3.1 -> 6.1 without the old row: was Built-in
  assert.deepEqual(initialNodeChoice({ user: undefined, address: 'https://node.epiccash.com:3413' }),
    { select: 'external', input: 'https://node.epiccash.com:3413' });
  //a 4.0.x row has no nodeInternal column value
  assert.deepEqual(initialNodeChoice({ user: { name: 'x' }, address: ' https://node.epiccash.com:3413 ' }),
    { select: 'external', input: 'https://node.epiccash.com:3413' });
});

test('node step: a local address or none preselects the built-in node', () => {
  assert.deepEqual(initialNodeChoice({ user: undefined, address: 'http://127.0.0.1:3413' }), { select: 'internal', input: '' });
  assert.deepEqual(initialNodeChoice({ user: undefined, address: '' }), { select: 'internal', input: '' });
  assert.deepEqual(initialNodeChoice({}), { select: 'internal', input: '' });
});

test('node step: what the row says wins', () => {
  assert.deepEqual(initialNodeChoice({ user: { nodeInternal: true }, address: 'https://node.epiccash.com:3413' }), { select: 'internal', input: '' });
  assert.deepEqual(initialNodeChoice({ user: { nodeInternal: false }, address: 'https://node.epiccash.com:3413' }),
    { select: 'external', input: 'https://node.epiccash.com:3413' });
  assert.deepEqual(initialNodeChoice({ user: { nodeInternal: false }, address: 'http://127.0.0.1:3413' }),
    { select: 'external', input: 'http://127.0.0.1:3413' });
});

test('Epicbox: a config without the key (up to 4.0.x) gets the default, not an empty field', () => {
  //4.0.6: {"version":"4.0.1","firstTime":false,...} with no epicbox_domain
  assert.equal(initialEpicboxDomain({ config: { version: '4.0.1', firstTime: false }, defaultDomain: DEFAULT }), DEFAULT);
  assert.equal(initialEpicboxDomain({ config: { version: '3.0.0', firstTime: false }, defaultDomain: DEFAULT }), DEFAULT);
  assert.equal(initialEpicboxDomain({ config: {}, defaultDomain: DEFAULT }), DEFAULT);
  assert.equal(initialEpicboxDomain({ config: undefined, defaultDomain: DEFAULT }), DEFAULT);
  assert.equal(initialEpicboxDomain({ config: { version: '5.0.4', epicbox_domain: null }, defaultDomain: DEFAULT }), DEFAULT);
});

test('Epicbox: an empty value written by an older assistant (bug) gets the default too', () => {
  assert.equal(initialEpicboxDomain({ config: { version: '4.0.1', firstTime: false, epicbox_domain: '' }, defaultDomain: DEFAULT }), DEFAULT);
  assert.equal(initialEpicboxDomain({ config: { version: '5.0.3', firstTime: false, epicbox_domain: '   ' }, defaultDomain: DEFAULT }), DEFAULT);
});

test('Epicbox: a domain the user saved is kept, and so is "off" chosen in a current assistant', () => {
  assert.equal(initialEpicboxDomain({ config: { version: '5.0.3', epicbox_domain: 'epicbox.epic.tech' }, defaultDomain: DEFAULT }), 'epicbox.epic.tech');
  assert.equal(initialEpicboxDomain({ config: { version: '5.0.4', epicbox_domain: ' my.box ' }, defaultDomain: DEFAULT }), 'my.box');
  assert.equal(initialEpicboxDomain({ config: { version: '5.0.4', firstTime: false, epicbox_domain: '' }, defaultDomain: DEFAULT }), '');
  assert.equal(initialEpicboxDomain({ config: { version: '6.0.0', firstTime: false, epicbox_domain: '' }, defaultDomain: DEFAULT }), '');
  assert.equal(initialEpicboxDomain({ config: { version: '5.0.10', firstTime: false, epicbox_domain: '' }, defaultDomain: DEFAULT }), '');
});
