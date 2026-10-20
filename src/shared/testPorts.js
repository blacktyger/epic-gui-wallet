/*
 * Test runs only: every port the app uses, shifted by one offset, so several test sessions (the
 * Windows rig's EpicWalletRig, EpicWalletRig2, ...) can run side by side on one host.
 *
 *   EPIC_GUI_TEST=1 and EPIC_GUI_TEST_PORT_OFFSET=<1..9000> (the rig uses 100, 200, ...)
 *
 * Without EPIC_GUI_TEST=1 the offset is ignored and is 0: the fixed ports 3413/3414/3415/3416
 * (13413.., 23413.. on floonet, usernet) and 3420 for the owner API, as always. The offset moves the
 * node API, p2p, wallet listener, stratum and the owner API (and with it the page's CSP and the one
 * address the owner API secret may go to). Up to 9000 no network's ports reach the next one's.
 * Plain ESM without app imports, so it runs under `node --test` (tests/testPorts.test.js).
 *
 * Each JavaScript context finds its offset itself: the main process and the preload from their
 * environment, the page from the preload (window.config.testPortOffset).
 */

export const OWNER_API_PORT = 3420;
export const MAX_PORT_OFFSET = 9000;

/* the offset an environment asks for: 0 unless EPIC_GUI_TEST is "1" and the offset a whole number in range */
export function portOffsetFromEnv(env) {
  const e = env && typeof env === 'object' ? env : {};
  if (String(e.EPIC_GUI_TEST || '') !== '1') return 0;
  const v = String(e.EPIC_GUI_TEST_PORT_OFFSET || '').trim();
  if (!/^\d{1,4}$/.test(v)) return 0;
  const n = Number(v);
  return n >= 1 && n <= MAX_PORT_OFFSET ? n : 0;
}

let offset = null;

/* global globalThis */
function detect() {
  const g = typeof globalThis === 'object' ? globalThis : {};
  //the page: no process, the preload's answer
  if (g.config && typeof g.config.testPortOffset === 'function') {
    const n = Number(g.config.testPortOffset());
    return Number.isInteger(n) && n >= 1 && n <= MAX_PORT_OFFSET ? n : 0;
  }
  //the main process, the preload (and node --test)
  return g.process && g.process.env ? portOffsetFromEnv(g.process.env) : 0;
}

/* this context's offset (found once) */
export function portOffset() {
  if (offset === null) offset = detect();
  return offset;
}

/* tests: set the offset (null: find it again) */
export function setPortOffset(n) {
  offset = n === null ? null : (Number.isInteger(n) && n >= 1 && n <= MAX_PORT_OFFSET ? n : 0);
}

/* the wallet's owner API port (epic-wallet owner_api_listen_port) */
export function ownerApiPort() {
  return OWNER_API_PORT + portOffset();
}
