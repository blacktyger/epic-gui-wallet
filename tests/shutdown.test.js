// Tests for src/shared/shutdown.js: the app's processes are stopped once, on every quit path. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShutdown, SIGNALS } from '../src/shared/shutdown.js';

function setup(stop) {
  const calls = { stop: 0, quit: 0, exit: [] };
  const s = createShutdown({
    stop: stop || (() => { calls.stop++; }),
    quit: () => { calls.quit++; },
    exit: (c) => calls.exit.push(c),
    setTimer: () => ({ unref() {} }),
  });
  return { s, calls };
}
const tick = () => new Promise((r) => setImmediate(r));
function event() { return { prevented: false, preventDefault() { this.prevented = true; } }; }

test('signals: SIGTERM, SIGINT and SIGHUP', () => {
  assert.deepEqual(SIGNALS, ['SIGTERM', 'SIGINT', 'SIGHUP']);
});

test('a quit is held until the processes are stopped, then quits again', async () => {
  const { s, calls } = setup();
  const e = event();
  s.onQuitEvent(e);
  assert.equal(e.prevented, true);
  await tick();
  assert.equal(calls.stop, 1);
  assert.equal(calls.quit, 1);
  const again = event();
  s.onQuitEvent(again);
  assert.equal(again.prevented, false);
});

test('idempotent: signals, quit events and run() stop the processes once', async () => {
  const { s, calls } = setup();
  s.onSignal('SIGTERM');
  s.onSignal('SIGINT');
  s.onQuitEvent(event());
  await s.run();
  await tick();
  assert.equal(calls.stop, 1);
  assert.equal(s.done, true);
});

test('a failing stop still lets the app quit', async () => {
  const { s, calls } = setup(() => { throw new Error('scan failed'); });
  s.onSignal('SIGHUP');
  await tick(); await tick();
  assert.equal(s.done, true);
  assert.equal(calls.quit, 1);
});
