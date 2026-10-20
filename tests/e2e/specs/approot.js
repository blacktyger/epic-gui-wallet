// e2e-timeout: 420
// e2e-ui: modern
/*
 * Welcome › Advanced › App data folder, once per interface (behaviour unchanged since 6.1; the
 * explanation is now one line with the rest folded). The real relaunch is watched: after
 * the folder pick (or Use the default folder) the app exits and starts itself again inside the sandbox; that second process is
 * stopped and the app launched again under the test driver.
 *
 *   ~/.epic-gui (default) -> choose ~/elsewhere -> relaunch: <default>/location.json names it,
 *   the app's folders are made there, Advanced shows it -> Use the default folder -> relaunch:
 *   back on ~/.epic-gui -> choose ~/elsewhere2 -> relaunch -> create a wallet: it is made in
 *   ~/elsewhere2/wallets/w1 -> quit, start again: still ~/elsewhere2 with that wallet.
 *
 * The interface is a setting in the root's settings.json: for Classic the new root gets one with
 * app.ui classic before the app starts there (otherwise it starts in Modern).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('../lib/harness');
const U = require('../lib/ui');

H.runCase('approot', async (t) => {
  const ui = t.ui;
  const home = t.home;
  const def = path.join(home, '.epic-gui');
  const loc = path.join(def, 'location.json');
  const moved = path.join(def, 'root-moved');
  let w = await t.launch();

  const appPids = () => execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' }).split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+(.*)$/)).filter((m) => m && /EpicWallet/.test(m[2]) && !/--type=/.test(m[2])).map((m) => Number(m[1]));
  const pickerReturns = (dir) => t.app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, dir);
  const advanced = async () => {
    await w.getByText('Advanced', { exact: true }).first().click();
    await w.getByText('App data folder', { exact: true }).first().waitFor({ timeout: 5000 });
  };
  /* back from a folder change: Advanced is open and says "Using <folder>" (the folder path line is replaced) */
  const usingShown = async (root) => {
    await U.waitText(w, new RegExp('Using ' + root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 8000);
    await w.getByText('App data folder', { exact: true }).first().waitFor({ timeout: 5000 });
    return 'Advanced open, "Using ' + root.replace(home, '~') + '"';
  };
  const shownRoot = () => w.evaluate(() => [...document.querySelectorAll('code, .e-mono')].map((e) => e.innerText.trim()).find((s) => s.startsWith('/')) || '');
  /* the app exits and starts itself again; that new process is stopped, then launched under the driver */
  const relaunch = async (act) => {
    const proc = t.app.process();
    const before = new Set(appPids());
    const exited = new Promise((r) => { if (proc.exitCode !== null) r(); else proc.once('exit', () => r()); });
    await act();
    const gone = await Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), 30000))]);
    if (!gone) throw new Error('the app did not exit after the pick');
    t.app = null; t.win = null;
    const again = await H.waitFor(() => { const n = appPids().filter((p) => !before.has(p)); return n.length ? n : null; }, { timeout: 20000, interval: 300 });
    if (!again) throw new Error('the app did not start itself again');
    for (const p of again) { try { process.kill(p, 'SIGTERM'); } catch (e) { /* gone */ } }
    //the app's own relaunch may have taken the "folder moved" hint already; put it back so the next start can show it
    fs.mkdirSync(def, { recursive: true });
    if (!fs.existsSync(moved)) fs.writeFileSync(moved, '1');
    const stopped = await H.waitFor(() => (appPids().length ? null : true), { timeout: 15000, interval: 300 });
    if (!stopped) for (const p of appPids()) { try { process.kill(p, 'SIGKILL'); } catch (e) { /* gone */ } }
    await H.waitFor(() => (appPids().length ? null : true), { timeout: 5000, interval: 200 });
    return 'exited and started again (pid ' + again.join(',') + ', stopped)';
  };
  const seedUi = (root) => {
    if (ui !== 'classic') return;
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ schema: 1, app: { ui: 'classic', theme: 'dark', scale: 100, locale: '' } }, null, 2));
  };

  await t.step('Welcome › Advanced: App data folder is the default ~/.epic-gui', async () => {
    await U.welcome(w);
    await advanced();
    const r = await shownRoot();
    if (r !== def) throw new Error('shown ' + r);
    return r.replace(home, '~');
  }, { fatal: true });

  const else1 = path.join(home, 'elsewhere');
  fs.mkdirSync(else1);
  await t.step('choose ~/elsewhere: the app restarts itself at once', async () => {
    await pickerReturns(else1);
    const r = await relaunch(() => w.getByRole('button', { name: 'Keep app data in another folder' }).first().click());
    const saved = JSON.parse(fs.readFileSync(loc, 'utf8'));
    if (saved.root !== else1) throw new Error('location.json ' + JSON.stringify(saved));
    return r + '; location.json → ~/elsewhere';
  }, { fatal: true, timeout: 90000 });

  seedUi(else1);
  w = await t.launch({ fresh: false });
  await t.step('started again: ~/elsewhere is used, the app\'s folders are made there', async () => {
    await U.welcome(w);
    const r = await usingShown(else1);
    const made = ['app', 'logs'].filter((d) => fs.existsSync(path.join(else1, d)));
    if (!made.includes('app')) throw new Error('in ~/elsewhere: ' + fs.readdirSync(else1).join(', '));
    if (fs.existsSync(path.join(def, 'wallets'))) throw new Error('a wallets folder in the default root');
    return r + '; made there: ' + fs.readdirSync(else1).sort().join(', ');
  }, { fatal: true });

  await t.step('Use the default folder: the app restarts on ~/.epic-gui', async () => {
    const r = await relaunch(() => w.getByRole('button', { name: 'Use the default folder' }).first().click());
    if (fs.existsSync(loc)) throw new Error('location.json still there: ' + fs.readFileSync(loc, 'utf8'));
    return r + '; location.json removed';
  }, { fatal: true, timeout: 90000 });

  w = await t.launch({ fresh: false });
  const else2 = path.join(home, 'elsewhere2');
  fs.mkdirSync(else2);
  await t.step('started again on the default folder; choose ~/elsewhere2, the app restarts itself', async () => {
    await U.welcome(w);
    const shown = await usingShown(def);
    await pickerReturns(else2);
    return shown + '; ' + await relaunch(() => w.getByRole('button', { name: 'Keep app data in another folder' }).first().click());
  }, { fatal: true, timeout: 90000 });

  seedUi(else2);
  w = await t.launch({ fresh: false });
  await t.step('started again: Advanced says "Using ~/elsewhere2"', async () => { await U.welcome(w); return usingShown(else2); }, { fatal: true });
  const password = H.newPassword();
  await t.step('a wallet created now is made in ~/elsewhere2/wallets/w1', async () => {
    await U.welcome(w);
    const { id } = await U.createOnly(w, password);
    const s = JSON.parse(fs.readFileSync(path.join(else2, 'settings.json'), 'utf8'));
    const rec = s.wallets.find((x) => x.id === id);
    if (!rec || rec.dataDir !== path.join(else2, 'wallets', 'w1')) throw new Error('wallet ' + JSON.stringify(rec));
    if (!fs.existsSync(path.join(else2, 'wallets', 'w1', 'wallet_data', 'wallet.seed'))) throw new Error('no seed in ~/elsewhere2/wallets/w1');
    if (fs.existsSync(path.join(def, 'wallets'))) throw new Error('a wallets folder in the default root');
    return 'w1 in ~/elsewhere2/wallets/w1';
  }, { fatal: true, timeout: 150000 });
  await t.step('quit', () => t.quit(), { fatal: true, timeout: 60000 });

  w = await t.launch({ fresh: false });
  await t.step('started again: still ~/elsewhere2, its wallet offered on Unlock', async () => {
    await w.waitForURL(/login/, { timeout: 30000 });
    await w.locator('input[type=password]').first().waitFor({ timeout: 15000 });
    await U.submitPassword(w, password);
    await w.waitForURL(/dashboard/, { timeout: 90000 });
    return 'unlocked the wallet in ~/elsewhere2';
  }, { fatal: true, timeout: 120000 });
  await t.step('quit with the app\'s own Quit (Menu › Quit)', () => t.quit(), { fatal: true, timeout: 60000 });
  await t.step('no epic-wallet, epic or Electron process left after 10 s', () => t.assertNoLeftovers({ timeout: 10000 }), { timeout: 20000 });
});
