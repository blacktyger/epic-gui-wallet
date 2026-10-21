// Tests for src/shared/torTestTimings.js: the Tor watchdogs shortened only with EPIC_GUI_TEST=1. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { torTimingsFromEnv } from '../src/shared/torTestTimings.js';

test('without EPIC_GUI_TEST=1 nothing changes', () => {
  const t = { EPIC_GUI_TEST_TOR_STALL_MS: '5000', EPIC_GUI_TEST_TOR_BOOT_MS: '9000', EPIC_GUI_TEST_TOR_BACKOFF_MS: '1000' };
  assert.deepEqual(torTimingsFromEnv(t), {});
  assert.deepEqual(torTimingsFromEnv({ ...t, EPIC_GUI_TEST: '0' }), {});
  assert.deepEqual(torTimingsFromEnv({ ...t, EPIC_GUI_TEST: 'true' }), {});
  assert.deepEqual(torTimingsFromEnv(undefined), {});
});

test('with EPIC_GUI_TEST=1: stall, boot and the backoff', () => {
  assert.deepEqual(torTimingsFromEnv({ EPIC_GUI_TEST: '1', EPIC_GUI_TEST_TOR_STALL_MS: '5000', EPIC_GUI_TEST_TOR_BOOT_MS: '9000', EPIC_GUI_TEST_TOR_BACKOFF_MS: '600000' }),
    { stallMs: 5000, bootMs: 9000, backoffMs: [600000, 600000, 600000] });
  assert.deepEqual(torTimingsFromEnv({ EPIC_GUI_TEST: '1', EPIC_GUI_TEST_TOR_STALL_MS: '4000' }), { stallMs: 4000 });
});

test('out of range or not a whole number: ignored', () => {
  for (const v of ['0', '99', '3600001', '-5', '1e4', '5000.5', 'abc', '']) {
    assert.deepEqual(torTimingsFromEnv({ EPIC_GUI_TEST: '1', EPIC_GUI_TEST_TOR_STALL_MS: v }), {}, v);
  }
});
