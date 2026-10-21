// e2e-ui: modern
/*
 * Tor (6.1.6, docs/plans/tor-616.md §10) in the no-network sandbox: off by default with no tor
 * process; Settings › Receiving › Tor on starts the bundled tor, which can't reach the network and
 * shows the `network` error after the 2nd test-shortened stall (EPIC_GUI_TEST=1 +
 * EPIC_GUI_TEST_TOR_*_MS, shared/torTestTimings.js; the first restart is quiet: "trying again").
 * The automatic restarts go on behind the error: a tor starts again and the error stays (final
 * 6.1.6 QA bug 4: it showed only after 394 s). First with the wallet's default node, which doesn't
 * answer here: the HTTP listener can't start ("node not synced"), yet tor starts and it still ends
 * in `network`, never "the receiver stopped" (Tor round bug 2). Then with the stub node: Try again
 * starts over and fails the same way, still trying behind it; Tor off leaves no tor process; Lock with Tor on leaves no tor process. Needs the bundle
 * in the build: `node scripts/fetch-tor.mjs --platform linux`.
 */
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('../lib/harness');
const U = require('../lib/ui');

const APPDIR = process.env.E2E_APPDIR;
const STALL_MS = 6000;
//one quiet restart after a short wait: the error shows after two stalls
const BACKOFF_MS = 300;
const FAIL_MS = 2 * (STALL_MS + BACKOFF_MS) + 30000;
const TOR_ENV = { EPIC_GUI_TEST: '1', EPIC_GUI_TEST_TOR_STALL_MS: String(STALL_MS), EPIC_GUI_TEST_TOR_BOOT_MS: '20000', EPIC_GUI_TEST_TOR_BACKOFF_MS: String(BACKOFF_MS) };

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

  const row = () => w.locator('[data-test=tor-row]');
  const sw = () => row().locator('[data-test=tor-switch]');
  //the line can go between count() and innerText() (Tor off): '' then, not Playwright's 30 s wait for it
  const status = async () => ((await row().locator('[data-test=tor-status]').count())
    ? (await row().locator('[data-test=tor-status]').innerText({ timeout: 1000 }).catch(() => '')).trim() : '');
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
  const LISTENER = /receiver stopped/;
  //the status until the network error: never the listener error, and "trying again" on the way
  const untilNetwork = async () => {
    const seen = new Set();
    const s = await H.waitFor(async () => {
      const x = await status();
      //(waitFor swallows a throw: noted, checked below)
      if (LISTENER.test(x)) seen.add('listener: ' + x);
      if (/trying again/.test(x)) seen.add('trying again');
      return NETWORK.test(x) ? x : null;
    }, { timeout: FAIL_MS, interval: 250 });
    const bad = [...seen].find((x) => x.startsWith('listener'));
    if (bad) throw new Error('the listener error was shown: "' + bad + '"');
    if (!s) throw new Error(`Tor status not ${NETWORK} after ${FAIL_MS} ms: "${await status()}"`);
    if (!seen.has('trying again')) throw new Error('no "trying again" during the automatic restarts');
    return s;
  };
  //after the error: the automatic restarts go on behind it (a tor starts again) and never hide it
  const keepsTrying = async () => {
    const until = Date.now() + STALL_MS + 3000;
    let runs = 0;
    while (Date.now() < until) {
      const x = await status();
      if (!NETWORK.test(x)) throw new Error('the error went away during an automatic restart: "' + x + '"');
      if (torProcs().length) runs++;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!runs) throw new Error('no tor started again behind the error');
    if (!/Still trying in the background/.test(await status())) throw new Error('no "still trying": "' + await status() + '"');
    return 'still trying behind the error (a tor ran in ' + runs + ' checks)';
  };

  await t.step('Tor is off by default: the switch is off, no status, no tor process', async () => {
    await openReceiving();
    if (await sw().isChecked()) throw new Error('the Tor switch is on');
    if (await status()) throw new Error('a status while off: ' + await status());
    if (torProcs().length) throw new Error('tor runs: ' + torProcs().join(' ; '));
    return 'off, no tor';
  }, { fatal: true });

  await t.step('the node doesn\'t answer (the default node, no network): Tor on still starts tor', async () => {
    await row().locator('.e-switch').click();
    const s = await waitStatus(/Waiting for the wallet|Connecting to Tor|Can't reach|stopped|couldn't/, 30000);
    if (LISTENER.test(s)) throw new Error('the listener error: "' + s + '"');
    return s + ' | ' + await torRuns();
  }, { fatal: true, timeout: 60000 });

  await t.step('... and shows the network error after the 2nd stall ("trying again" before), not "the receiver stopped"', async () => {
    const began = Date.now();
    const s = await untilNetwork();
    return s + ' after ' + ((Date.now() - began) / 1000).toFixed(1) + ' s | ' + await keepsTrying();
  }, { timeout: FAIL_MS + STALL_MS + 25000, shot: true });

  await t.step('turn Tor off', async () => {
    await row().locator('.e-switch').click();
    await H.waitFor(async () => (await status()) ? null : 'gone', { timeout: 10000 });
    return noTor();
  }, { timeout: 30000 });

  //the HTTP listener checks the node first: from here the stub node, which answers
  await t.step('Settings › Node: the stub node', () => U.setNode(w, ui, U.NODE_URL, t), { fatal: true, timeout: 90000 });

  await t.step('turn Tor on: tor starts, connecting is shown', async () => {
    await openReceiving();
    await row().locator('.e-switch').click();
    const s = await waitStatus(/Waiting for the wallet|Connecting to Tor|Publishing|Can't reach|stopped|couldn't/, 30000);
    return s + ' | ' + await torRuns();
  }, { fatal: true, timeout: 60000 });

  await t.step('with no network it shows the network error after the 2nd stall and keeps trying; Try again offered', async () => {
    const began = Date.now();
    const s = await untilNetwork();
    await row().locator('[data-test=tor-retry]').waitFor({ timeout: 5000 });
    if (!await sw().isChecked()) throw new Error('the switch went off');
    return s + ' after ' + ((Date.now() - began) / 1000).toFixed(1) + ' s | ' + await keepsTrying();
  }, { timeout: FAIL_MS + STALL_MS + 25000, shot: true });

  await t.step('Try again: starts over (connecting, a tor runs), then the network error again, still trying behind it', async () => {
    await row().locator('[data-test=tor-retry]').click();
    await waitStatus(/Connecting to Tor/, 15000);
    const up = await torRuns(10000);
    const s = await untilNetwork();
    return up + ' | ' + s + ' | ' + await keepsTrying();
  }, { timeout: FAIL_MS + STALL_MS + 35000 });

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
