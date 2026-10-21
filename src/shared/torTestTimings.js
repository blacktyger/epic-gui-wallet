/*
 * Test runs only: shorter Tor watchdogs (shared/torManager.js TIMINGS), so the e2e gate (no
 * network) reaches the `network` error in seconds instead of a minute, and stays there.
 *
 *   EPIC_GUI_TEST=1 and any of
 *     EPIC_GUI_TEST_TOR_STALL_MS    progress unchanged this long → network (default 60 s)
 *     EPIC_GUI_TEST_TOR_BOOT_MS     no 100 % this long → network (default 120 s)
 *     EPIC_GUI_TEST_TOR_BACKOFF_MS  every automatic restart waits this long (default 5 s, 30 s, 2 min)
 *
 * Without EPIC_GUI_TEST=1 nothing here applies: torTimingsFromEnv gives {} and the defaults stay.
 * Each value must be a whole number of ms from 100 to 3600000, else it is ignored.
 * Plain ESM, no app imports (tests/torTestTimings.test.js).
 */
const MIN_MS = 100;
const MAX_MS = 3600000;

function ms(v) {
  const s = String(v == null ? '' : v).trim();
  if (!/^\d{1,7}$/.test(s)) return 0;
  const n = Number(s);
  return n >= MIN_MS && n <= MAX_MS ? n : 0;
}

/* the env's overrides for createTorManager({timings}) */
export function torTimingsFromEnv(env) {
  const e = env && typeof env === 'object' ? env : {};
  if (String(e.EPIC_GUI_TEST || '') !== '1') return {};
  const out = {};
  const stall = ms(e.EPIC_GUI_TEST_TOR_STALL_MS);
  const boot = ms(e.EPIC_GUI_TEST_TOR_BOOT_MS);
  const backoff = ms(e.EPIC_GUI_TEST_TOR_BACKOFF_MS);
  if (stall) out.stallMs = stall;
  if (boot) out.bootMs = boot;
  if (backoff) out.backoffMs = [backoff, backoff, backoff];
  return out;
}
