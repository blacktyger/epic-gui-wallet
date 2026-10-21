// e2e-ui: modern
/*
 * Tor (6.1.6, docs/plans/tor-616.md §10) in the no-network sandbox: off by default with no tor
 * process; Settings › Receiving › Tor on starts the bundled tor, which can't reach the network and
 * ends in the `network` error within the test-shortened stall time (EPIC_GUI_TEST=1 +
 * EPIC_GUI_TEST_TOR_*_MS, shared/torTestTimings.js; the backoff is long, so it stays failed);
 * Try again starts over and fails the same way; Tor off leaves no tor process; Lock with Tor on
 * leaves no tor process. Needs the bundle in the build: `node scripts/fetch-tor.mjs --platform linux`.
 */
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('../lib/harness');
const U = require('../lib/ui');

const APPDIR = process.env.E2E_APPDIR;
const STALL_MS = 6000;
const TOR_ENV = { EPIC_GUI_TEST: '1', EPIC_GUI_TEST_TOR_STALL_MS: String(STALL_MS), EPIC_GUI_TEST_TOR_BOOT_MS: '20000', EPIC_GUI_TEST_TOR_BACKOFF_MS: '600000' };

/* the build's own tor processes (by the program each runs) */
function torProcs() {
  const out = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => {
    const exe = l.replace(/^\d+\s+/, '').split(' ')[0];
    return exe.startsWith(APPDIR + '/') && path.basename(exe) === 'tor';
  });
}
async function noTor(timeout = 15000) {
  const gone = await H.waitFor(() => (torProcs().length ? null : 'none'), { timeout, interval: 300 });
  if (!gone) throw new Error('tor still running after ' + Math.round(timeout / 1000) + ' s: ' + torProcs().join(' ; ').slice(0, 300));
  return 'no tor process';
}
async function torRuns(timeout = 30000) {
  const up = await H.waitFor(() => (torProcs().length ? torProcs().length : null), { timeout, interval: 300 });
  if (!up) throw new Error('no tor process after ' + Math.round(timeout / 1000) + ' s');
  return up + ' tor process';
}

H.runCase('tor', async (t) => {
  const ui = t.ui;
  const password = H.newPassword();
  const w = await t.launch({ env: TOR_ENV });
  await t.step('first start: Welcome', () => U.welcome(w), { fatal: true });
  await t.step('create a wallet', () => U.createWallet(w, ui, password), { fatal: true, timeout: 150000 });
  await t.step('the first-unlock tour can be skipped', () => U.skipTour(w, ui));
  //the HTTP listener Tor needs checks the node first: the stub node, not the default one on the internet
  //(Settings › Node is one combobox since the Settings split: type the address, Enter applies it)
  await t.step('Settings › Node: the stub node', async () => {
    if (await U.route(w) !== '/settings') await w.locator('aside a[href="/settings"], nav a[href="/settings"]').first().click();
    const input = w.locator('#stg-node-in');
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill(U.NODE_URL);
    await input.press('Enter');
    const online = () => w.locator('[data-test=svc-node]').innerText().then((x) => (/Online/.test(x) ? x.replace(/\s+/g, ' ') : null)).catch(() => null);
    const said = await H.waitFor(online, { timeout: 45000, interval: 300 });
    if (!said) throw new Error('the sidebar never says the node is online');
    return 'node ' + U.NODE_URL + ': ' + said;
  }, { fatal: true, timeout: 90000 });

  const row = () => w.locator('[data-test=tor-row]');
  const sw = () => row().locator('[data-test=tor-switch]');
  const status = async () => ((await row().locator('[data-test=tor-status]').count()) ? (await row().locator('[data-test=tor-status]').innerText()).trim() : '');
  const openReceiving = async () => {
    if (await U.route(w) !== '/settings/receiving') {
      if (!/^\/settings/.test(await U.route(w))) await w.locator('aside a[href="/settings"], nav a[href="/settings"]').first().click();
      await w.locator('nav.e-stg-nav a[href="/settings/receiving"]').first().click({ timeout: 10000 });
    }
    await row().waitFor({ timeout: 10000 });
    return U.route(w);
  };
  const waitStatus = async (re, timeout) => {
    const s = await H.waitFor(async () => { const x = await status(); return re.test(x) ? x : null; }, { timeout, interval: 250 });
    if (!s) throw new Error(`Tor status not ${re} after ${timeout} ms: "${await status()}"`);
    return s;
  };
  const NETWORK = /Can't reach the Tor network/;

  await t.step('Tor is off by default: the switch is off, no status, no tor process', async () => {
    await openReceiving();
    if (await sw().isChecked()) throw new Error('the Tor switch is on');
    if (await status()) throw new Error('a status while off: ' + await status());
    if (torProcs().length) throw new Error('tor runs: ' + torProcs().join(' ; '));
    return 'off, no tor';
  }, { fatal: true });

  await t.step('turn Tor on: tor starts, connecting is shown', async () => {
    await row().locator('.e-switch').click();
    const s = await waitStatus(/Connecting to Tor|Publishing|Can't reach|stopped|couldn't/, 30000);
    return s + ' | ' + await torRuns();
  }, { fatal: true, timeout: 60000 });

  await t.step('with no network it ends in the network error within the shortened stall time; Try again offered', async () => {
    const began = Date.now();
    const s = await waitStatus(NETWORK, STALL_MS + 40000);
    await row().locator('[data-test=tor-retry]').waitFor({ timeout: 5000 });
    if (!await sw().isChecked()) throw new Error('the switch went off');
    return s + ' after ' + ((Date.now() - began) / 1000).toFixed(1) + ' s | ' + await noTor();
  }, { timeout: 90000, shot: true });

  await t.step('Try again: starts over (connecting, a tor runs), then the network error again (tor stopped while failed)', async () => {
    await row().locator('[data-test=tor-retry]').click();
    await waitStatus(/Connecting to Tor/, 15000);
    const up = await torRuns(10000);
    const s = await waitStatus(NETWORK, STALL_MS + 40000);
    return up + ' | ' + s + ' | ' + await noTor();
  }, { timeout: 90000 });

  await t.step('turn Tor off: no status, no tor process', async () => {
    await row().locator('.e-switch').click();
    await H.waitFor(async () => (await status()) ? null : 'gone', { timeout: 10000 });
    if (await sw().isChecked()) throw new Error('still on');
    return noTor();
  }, { timeout: 30000 });

  await t.step('Tor on again, then Lock: no tor process', async () => {
    await openReceiving();
    await row().locator('.e-switch').click();
    await torRuns();
    await U.lock(w, ui);
    return noTor();
  }, { timeout: 90000 });

  await t.step('unlock: Tor is still on (the setting stays) and starts again', async () => {
    await U.unlock(w, ui, password);
    await openReceiving();
    if (!await sw().isChecked()) throw new Error('Tor is off after the unlock');
    return (await waitStatus(/Connecting to Tor|Can't reach/, 30000)) + ' | ' + await torRuns();
  }, { timeout: 90000 });

  await t.step('quit', () => t.quit(), { fatal: true, timeout: 60000 });
  await t.step('no process of the app left after 10 s (tor included)', () => t.assertNoLeftovers({ timeout: 10000 }), { timeout: 20000 });
});
