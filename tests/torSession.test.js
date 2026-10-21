// Tests for src/shared/torSession.js: a Tor start that outlives its session never touches the wallet open now (tor-616 §5). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTorFor, onionFor, staleSavedOnion } from '../src/shared/torSession.js';

const ONION_A = 'a'.repeat(56) + '.onion';

/* the page's calls, recorded; session.id changes like App.vue's loginSession at a lock or switch */
function fake(opts = {}) {
  const h = { calls: [], session: { id: 1 } };
  const began = h.session.id;
  h.run = () => startTorFor({
    walletId: 'A',
    isCurrent: () => h.session.id === began,
    startListen: async () => { h.calls.push('listen'); if (opts.switchAt === 'listen') h.session.id++; return opts.listener || { success: true, pid: 41 }; },
    torAddress: async () => { h.calls.push('address'); if (opts.switchAt === 'address') h.session.id++; return opts.onion === undefined ? ONION_A : opts.onion; },
    start: async (w, onion) => { h.calls.push('start ' + w + ' ' + onion); if (opts.switchAt === 'start') h.session.id++; return { ok: true, status: { state: 'starting' } }; },
    stop: async (w) => { h.calls.push('stop ' + w); },
    stopPid: async (pid) => { h.calls.push('stopPid ' + pid); },
  });
  return h;
}

test('a start in its own session: listener, address, start; the listener pid it started is returned', async () => {
  const h = fake();
  const r = await h.run();
  assert.deepEqual(h.calls, ['listen', 'address', 'start A ' + ONION_A]);
  assert.equal(r.ok, true);
  assert.equal(r.onion, ONION_A);
  assert.equal(r.listenerPid, 41);
});

test('switched while the listener started: no address, no tor, only its own listener stopped', async () => {
  const h = fake({ switchAt: 'listen' });
  assert.deepEqual(await h.run(), { stale: true });
  assert.deepEqual(h.calls, ['listen', 'stopPid 41']);
});

test('switched while the address was asked (it may be the next wallet\'s): not used for a start', async () => {
  const h = fake({ switchAt: 'address' });
  assert.deepEqual(await h.run(), { stale: true });
  assert.deepEqual(h.calls, ['listen', 'address', 'stopPid 41']);
});

test('switched while tor started: only wallet A\'s tor is stopped (per wallet), and its own listener', async () => {
  const h = fake({ switchAt: 'start' });
  assert.deepEqual(await h.run(), { stale: true });
  assert.deepEqual(h.calls, ['listen', 'address', 'start A ' + ONION_A, 'stop A', 'stopPid 41']);
});

test('a listener that was already running (no pid) is never stopped by a dropped start', async () => {
  const h = fake({ switchAt: 'listen', listener: { success: true } });
  assert.deepEqual(await h.run(), { stale: true });
  assert.deepEqual(h.calls, ['listen']);
});

test('failures: no listener, no address', async () => {
  let h = fake({ listener: { success: false, portInUse: 3415 } });
  assert.deepEqual(await h.run(), { ok: false, error: 'listener', listener: { success: false, portInUse: 3415 } });
  h = fake({ onion: '' });
  const r = await h.run();
  assert.equal(r.error, 'keys');
  assert.deepEqual(h.calls, ['listen', 'address']);
});

test('a listener the node keeps down: tor still starts (waitListener), the caller retries the listener', async () => {
  const seen = [];
  const r = await startTorFor({
    walletId: 'A', isCurrent: () => true,
    startListen: async () => ({ success: false, msg: 'node not synced' }),
    torAddress: async () => ONION_A,
    start: async (w, onion, opts) => { seen.push(opts); return { ok: true, status: { state: 'starting' } }; },
    stop: async () => {}, stopPid: async () => {},
  });
  assert.equal(r.ok, true);
  assert.equal(r.waitListener, true);
  assert.deepEqual(seen, [{ waitListener: true }]);
  //a listener up: no waiting
  const r2 = await fake().run();
  assert.equal(r2.waitListener, false);
});

//a real onion (the checksum holds): parseOnion takes it
const REAL = 'mk7ca5rxicc6ps765gdj3irikfzer6ffd2jpysipnnpttl7jynzaluyd.onion';

test('the onion: the saved one at once (no wallet call); else the wallet\'s, with the wait said first and the answer saved', async () => {
  const ev = [];
  const fetch = async () => { ev.push('fetch'); return REAL; };
  assert.equal(await onionFor({ saved: REAL, fetch, save: (o) => ev.push('save ' + o), onWait: () => ev.push('wait') }), REAL);
  assert.deepEqual(ev, []);
  assert.equal(await onionFor({ saved: '', fetch, save: (o) => ev.push('save ' + o), onWait: () => ev.push('wait') }), REAL);
  assert.deepEqual(ev, ['wait', 'fetch', 'save ' + REAL]);
  //a broken saved value is not used; no answer saves nothing
  ev.length = 0;
  assert.equal(await onionFor({ saved: 'junk', fetch: async () => '', save: (o) => ev.push('save ' + o) }), '');
  assert.deepEqual(ev, []);
});

test('a saved onion is checked against the wallet: only a different answer counts', async () => {
  const B = 'b'.repeat(56) + '.onion';
  assert.equal(await staleSavedOnion({ saved: REAL, fetch: async () => REAL }), '');
  assert.equal(await staleSavedOnion({ saved: REAL, fetch: async () => '' }), '');
  assert.equal(await staleSavedOnion({ saved: REAL, fetch: async () => { throw new Error('x'); } }), '');
  assert.equal(await staleSavedOnion({ saved: REAL, fetch: async () => B }), B);
  assert.equal(await staleSavedOnion({ saved: '', fetch: async () => B }), '');
});
