// Tests for src/shared/unlockResult.js, what a failed unlock shows and the unsaved User row: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unlockFailure, pendingUser } from '../src/shared/unlockResult.js';

test('open_wallet refusing the password (the unlock step) is a wrong password', () => {
  assert.equal(unlockFailure({ startFailure: '', lastStage: 'unlock' }), 'password');
});

test('epic-wallet refusing the password while starting is a wrong password', () => {
  assert.equal(unlockFailure({ startFailure: 'password', lastStage: 'wallet' }), 'password');
});

test('a failure before any step is shown at the field, one at a step on the step list', () => {
  assert.equal(unlockFailure({}), 'field');
  assert.equal(unlockFailure({ lastStage: 'processes' }), 'stage');
  assert.equal(unlockFailure({ startFailure: 'service', lastStage: 'wallet' }), 'stage');
});

test('a failure after the owner API took the password is never a wrong password', () => {
  assert.equal(unlockFailure({ lastStage: 'unlock', opened: true }), 'stage');
});

test('first unlock: the pending User row is only the wallet settings, with no id (nothing saved yet)', () => {
  const u = pendingUser('w1', [], { name: 'Main', language: 'de', nodeInternal: 1, epicbox_domain: 'epicbox.epiccash.com' });
  assert.deepEqual(u, { account: 'w1', name: 'Main', language: 'de', nodeInternal: true, epicbox_domain: 'epicbox.epiccash.com' });
  assert.equal('id' in u, false);
});

test('a saved User row keeps its id and other columns, the wallet settings go over it', () => {
  const row = { id: 7, account: 'w1', name: 'Old', language: 'en', nodeInternal: false, epicbox_domain: '', ngrok: '' };
  const u = pendingUser('w1', [row], { name: 'New', nodeInternal: true, language: null });
  assert.deepEqual(u, { id: 7, account: 'w1', name: 'New', language: 'en', nodeInternal: true, epicbox_domain: '', ngrok: '' });
  assert.equal(row.name, 'Old');
});

// the first unlock of any wallet (new, imported, a folder opened, added) is Unlock's openWallet:
// the password is verified there before the User row is saved, and nothing on the way routes to
// the Setup Assistant (6.0 did, so a wrong password was only found out after setup)
test('unlock never routes to the Setup Assistant and saves the User row only after the password', () => {
  const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
  for (const f of ['components/wallets.js', 'components/Login.vue', 'components/modern/views/UnlockView.vue', 'App.vue']) {
    assert.doesNotMatch(src(f), /setupwizard['"/]|name:\s*['"]setupwizard/, f);
  }
  const open = src('components/wallets.js');
  const start = open.indexOf('async startWallet(');
  const verified = open.indexOf('canLogin.success', start);
  const saved = open.indexOf('await opened()', start);
  assert.ok(start > 0 && verified > start && saved > verified, 'opened() runs after the owner API took the password');
  //openWallet saves the User row only in the callback it hands to startWallet
  const body = open.slice(open.indexOf('async openWallet('), start);
  assert.equal(body.split('ensureUser(').length, 2, 'one ensureUser call in openWallet');
  assert.ok(body.indexOf('ensureUser(') > body.indexOf('const saveUser = async'));
  assert.match(body, /this\.startWallet\([^)]*saveUser\)/);
});
