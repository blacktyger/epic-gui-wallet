// Tests for src/shared/receiveAddress.js: the Epic address on Receive (QA T09). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epicAddressView } from '../src/shared/receiveAddress.js';

const known = { address: 'esAbc@epicbox.epiccash.com', domain: 'epicbox.epiccash.com' };

test('listener stopped: the known address is shown, dimmed (Copy and QR stay)', () => {
  assert.deepEqual(epicAddressView({ ...known, listening: false, epicbox: false }), { state: 'off', show: true, dim: true });
});

test('listener on and Epicbox running: shown in full', () => {
  assert.deepEqual(epicAddressView({ ...known, listening: true, epicbox: true }), { state: 'receiving', show: true, dim: false });
});

test('listener on but Epicbox not running: still shown, dimmed', () => {
  assert.deepEqual(epicAddressView({ ...known, listening: true, epicbox: false }), { state: 'paused', show: true, dim: true });
});

test('no address read yet, or no Epicbox domain: nothing to show or copy', () => {
  assert.equal(epicAddressView({ ...known, address: '', listening: true, epicbox: true }).state, 'unknown');
  assert.equal(epicAddressView({ address: '', domain: undefined, listening: false }).state, 'unknown');
  assert.equal(epicAddressView({ ...known, address: '', listening: false }).show, false);
  assert.equal(epicAddressView({ address: '', domain: '', listening: true, epicbox: true }).state, 'unconfigured');
});

test('a known address is shown even when the wallet has no Epicbox domain of its own (the default one is used)', () => {
  assert.equal(epicAddressView({ address: 'esAbc@epicbox.epiccash.com', domain: '', listening: false }).show, true);
});
