// Tests for src/shared/httpListener.js: the HTTP listener's own state (QA W01). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAddrInUse, httpListenerState, httpShown, HTTP_OFF } from '../src/shared/httpListener.js';

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

test('any other failure (no session, it exited, no answer): failed, generic', () => {
  assert.deepEqual(httpListenerState({ success: false, noSession: true }, 3415), { state: 'failed', port: 3415, reason: 'error' });
  assert.deepEqual(httpListenerState({ success: false, msg: 'listener exited (1)' }, 3415), { state: 'failed', port: 3415, reason: 'error' });
  assert.deepEqual(httpListenerState(undefined, 3415), { state: 'failed', port: 3415, reason: 'error' });
});

test('the status mentions HTTP only while it runs, says "failed" when it couldn\'t start', () => {
  const on = { state: 'on', port: 3415, reason: '' };
  const failed = { state: 'failed', port: 3415, reason: 'port_in_use' };
  assert.equal(httpShown(true, on), 'on');
  assert.equal(httpShown(true, failed), 'failed');
  //Epicbox alone turned receiving on: no HTTP in the status (it said "Receiving … · HTTP" before)
  assert.equal(httpShown(true, HTTP_OFF), 'off');
  assert.equal(httpShown(true, undefined), 'off');
  //receiving is off: nothing about HTTP
  assert.equal(httpShown(false, on), 'off');
  assert.equal(httpShown(false, failed), 'off');
});
