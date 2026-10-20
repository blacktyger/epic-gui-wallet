// Tests for src/shared/httpListener.js: the HTTP listener's own state (QA W01). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAddrInUse, httpListenerState, httpShown, HTTP_OFF, httpAutostart } from '../src/shared/httpListener.js';
import { WALLET_DEFAULTS } from '../src/shared/settingsStore.js';

test('the listener\'s bind errors on Linux, macOS and Windows read as a busy port', () => {
  assert.equal(isAddrInUse('ERROR Address already in use (os error 98)'), true);
  assert.equal(isAddrInUse('Error: Os { code: 48, kind: AddrInUse, message: "Address already in use" }'), true);
  assert.equal(isAddrInUse('Only one usage of each socket address (protocol/network address/port) is normally permitted. (os error 10048)'), true);
  assert.equal(isAddrInUse('Wallet command failed: wrong password'), false);
  assert.equal(isAddrInUse('listener exited (1)'), false);
  assert.equal(isAddrInUse(undefined), false);
  //not any number that happens to end in 98
  assert.equal(isAddrInUse('os error 980'), false);
});

test('a started listener is on', () => {
  assert.deepEqual(httpListenerState({ success: true, pid: 42 }, 3415), { state: 'on', port: 3415, reason: '' });
  assert.deepEqual(httpListenerState({ success: true }, 3415), { state: 'on', port: 3415, reason: '' });
});

test('another program on 3415: failed, port in use (the pre-start check or the listener\'s own output)', () => {
  assert.deepEqual(httpListenerState({ success: false, portInUse: 3415 }, 3415), { state: 'failed', port: 3415, reason: 'port_in_use' });
  assert.deepEqual(httpListenerState({ success: false, msg: 'ERROR ... (os error 10048)' }, 13415), { state: 'failed', port: 13415, reason: 'port_in_use' });
});

test('the node did not answer the listener at its start (6.1.5 Classic Try again on the rig): failed, node', () => {
  //execListen's answer for epic-wallet's "Failed to check node sync status: ... ready_for_txs ..."
  assert.deepEqual(httpListenerState({ success: false, msg: 'node not synced' }, 3415), { state: 'failed', port: 3415, reason: 'node' });
  assert.deepEqual(httpListenerState({ success: false, msg: 'ERROR Failed to check node sync status: Client Callback Error: Error calling ready_for_txs' }, 3415),
    { state: 'failed', port: 3415, reason: 'node' });
  //a busy port still wins
  assert.equal(httpListenerState({ success: false, msg: 'node not synced', portInUse: 3415 }, 3415).reason, 'port_in_use');
});

test('any other failure (no session, it exited, no answer): failed, generic', () => {
  assert.deepEqual(httpListenerState({ success: false, noSession: true }, 3415), { state: 'failed', port: 3415, reason: 'error' });
  assert.deepEqual(httpListenerState({ success: false, msg: 'listener exited (1)' }, 3415), { state: 'failed', port: 3415, reason: 'error' });
  assert.deepEqual(httpListenerState(undefined, 3415), { state: 'failed', port: 3415, reason: 'error' });
});

test('the status mentions HTTP only while it runs, says "failed" when it couldn\'t start', () => {
  assert.equal(httpShown({ state: 'on', port: 3415, reason: '' }), 'on');
  assert.equal(httpShown({ state: 'failed', port: 3415, reason: 'port_in_use' }), 'failed');
  //Epicbox alone turned receiving on, or Stop/lock reset it: no HTTP in the status (it said "Receiving … · HTTP")
  assert.equal(httpShown(HTTP_OFF), 'off');
  assert.equal(httpShown(undefined), 'off');
});

test('the HTTP listener is off by default: a new or older wallet does not start it at unlock (Modern)', () => {
  assert.equal(WALLET_DEFAULTS.http_listener_autostart, false);
  assert.equal(httpAutostart(WALLET_DEFAULTS, 'modern'), false);
  //a wallet from before 6.1.6 has no such key: off
  assert.equal(httpAutostart({ walletlisten_on_startup: true }, 'modern'), false);
  assert.equal(httpAutostart(null, 'modern'), false);
  assert.equal(httpAutostart({ http_listener_autostart: 'yes' }, 'modern'), false);
});

test('Start with wallet on: the HTTP listener starts at unlock; Classic (frozen) as before', () => {
  assert.equal(httpAutostart({ http_listener_autostart: true }, 'modern'), true);
  assert.equal(httpAutostart({}, 'classic'), true);
  assert.equal(httpAutostart({ http_listener_autostart: false }, 'classic'), true);
});
