// e2e-timeout: 600
// e2e-ui: modern
/*
 * Adding wallets (tester item #34), Modern (Classic is frozen and no longer tested). Every way of adding lists a NEW wallet;
 * none replaces the open one. After each, the open wallet locks (its epic-wallet stops) and Unlock
 * opens with the new wallet chosen. Settings › This wallet › Open wallet folder opens the open
 * wallet's own folder.
 *
 *   Welcome: the three ways; Advanced › App data folder (short line, the rest folded)
 *   A: Welcome › Create a new wallet -> Unlock chooses A -> unlock
 *   Settings › This wallet › Open wallet folder -> <HOME>/.epic-gui/wallets/w1 (shell.openPath stubbed)
 *   B: Settings › All wallets › Create a new wallet -> A's epic-wallet stopped, Unlock chooses B; A still unlocks
 *   C: Unlock › Add a wallet › Restore from recovery phrase (A's words) -> a new wallet, Unlock chooses C
 *   Add an existing wallet › From a wallet folder: A's own folder is refused ("already in the list");
 *   D: a copy of A's folder -> Unlock chooses D
 *   E: Unlock › Add a wallet › Add an existing wallet › Look for wallets: ~/.epic/main (an older
 *      Epic Wallet's place; a copy of A's folder) -> imported, Unlock chooses E, unlocks with A's password
 *   F: Settings › All wallets › Restore from recovery phrase (B's words) -> Unlock chooses F
 *   G: Settings › All wallets › Add an existing wallet › Choose a folder… (a copy of B's folder) -> G
 *   Settings › All wallets › Look for wallets again: nothing left to import (no second copy of E)
 *   settings.json: w1..w7, seven folders, A's record and seed as they were
 * Screenshots of the screens it passes (shots/NN-shot-*.png, secrets blurred) for the release notes.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const H = require('../lib/harness');
const U = require('../lib/ui');

H.runCase('addwallet', async (t) => {
  const ui = t.ui;
  const home = t.home;
  const pwA = H.newPassword(), pwB = H.newPassword(), pwC = H.newPassword();
  const w = await t.launch();
  const settings = () => JSON.parse(fs.readFileSync(path.join(home, '.epic-gui', 'settings.json'), 'utf8'));
  const ids = () => settings().wallets.map((x) => x.id);
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  //epic-wallet owner APIs running now, by their -c <config dir> (the sandbox has its own pid namespace)
  const ownerApis = () => execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' }).split('\n')
    .filter((l) => /epic-wallet/.test(l) && /owner_api/.test(l)).map((l) => (l.match(/-c\s+(\S+)/) || [])[1] || l);
  const skipTourIfAny = async (wait = 2500) => {
    if (ui !== 'modern' || !(await w.locator('#e-tour-t').waitFor({ state: 'visible', timeout: wait }).then(() => true, () => false))) return false;
    await w.getByRole('button', { name: 'Skip tour' }).first().click();
    await w.locator('#e-tour-t').waitFor({ state: 'hidden', timeout: 5000 });
    return true;
  };
  const unlock = async (password) => {
    await U.submitPassword(w, password);
    await w.waitForURL(/dashboard/, { timeout: 90000 });
    await skipTourIfAny();
  };
  //the Unlock picker (several wallets): choose one by its id
  const choose = async (id) => {
    if (ui === 'classic') await w.locator('#loginWallet').selectOption(id);
    else await w.locator(`input[name=unlock-wallet][value="${id}"]`).check({ force: true });
  };
  const allWallets = () => U.nav(w, ui, ui === 'modern' ? ['All wallets', '/wallets', null, 'stg'] : ['All wallets', '/wallets', null, 'gear']);
  const thisWallet = () => U.nav(w, ui, ui === 'modern' ? ['This wallet', '/account', null, 'stg'] : ['Profile', '/account', null, 'gear']);
  //a picture of the window for the release notes (shots/, recovery words and passwords blurred)
  const shot = (name) => t.screenshot('shot-' + name).catch(() => null);
  const pickerReturns = (dir) => t.app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, dir);

  /* ---- Welcome ---- */
  await t.step('Welcome: the three ways to add a wallet', () => U.welcome(w), { fatal: true });
  await t.step('Welcome › Advanced › App data folder: one short line, the rest folded', async () => {
    await w.getByText('Advanced', { exact: true }).first().click();
    await w.getByText('Where the app keeps wallets, settings and the blockchain.').first().waitFor({ timeout: 5000 });
    const more = w.locator('details').filter({ hasText: 'More about this' }).last();
    if (await more.getAttribute('open') !== null) throw new Error('the longer text is not folded');
    await more.locator('summary').click();
    await more.getByText(/Choose a new, empty folder/).waitFor({ timeout: 3000 });
    await shot('welcome-advanced');
    await w.getByText('Advanced', { exact: true }).first().click();
    await shot('welcome');
    return 'short line shown; "More about this" folds the rest';
  });

  /* ---- A: Welcome › Create ---- */
  const a = await t.step('A: Welcome › Create a new wallet: Unlock opens with it chosen', () => U.createOnly(w, pwA), { fatal: true, timeout: 150000 });
  await t.step('A: unlock with its password', () => unlock(pwA), { fatal: true, timeout: 120000 });
  const recA = settings().wallets.find((x) => x.id === 'w1');
  const seedA = path.join(recA.dataDir, 'wallet_data', 'wallet.seed');
  const seedHashA = sha(seedA);

  /* ---- Settings › This wallet › Open wallet folder ---- */
  await t.step('Settings › This wallet › Open wallet folder opens <HOME>/.epic-gui/wallets/w1', async () => {
    await t.app.evaluate(({ shell }) => { global.__opened = []; shell.openPath = async (p) => { global.__opened.push(p); return ''; }; });
    await thisWallet();
    await shot('settings-this-wallet');
    if (await U.clickable(w, 'Create a new wallet').count()) throw new Error('Settings › This wallet offers to add a wallet');
    await w.getByRole('button', { name: 'Open wallet folder' }).first().click({ timeout: 10000 });
    const opened = await H.waitFor(() => t.app.evaluate(() => global.__opened.slice()).then((o) => (o.length ? o : null)), { timeout: 5000 });
    const want = path.join(home, '.epic-gui', 'wallets', 'w1');
    if (!opened || opened.length !== 1 || opened[0] !== want || recA.dataDir !== want) throw new Error(`opened ${JSON.stringify(opened)}, want ${want} (record ${recA.dataDir})`);
    return 'opened ' + opened[0].replace(home, '~');
  });

  /* ---- B: Settings › All wallets › Create ---- */
  let wordsB = [];
  await t.step('B: Settings › All wallets › Create a new wallet: A locks (its epic-wallet stops), Unlock chooses B', async () => {
    if (!ownerApis().some((d) => d.endsWith('/wallets/w1'))) throw new Error('A\'s owner API is not running before: ' + JSON.stringify(ownerApis()));
    await allWallets();
    await shot('settings-all-wallets');
    const r = await U.createOnly(w, pwB);
    wordsB = r.words;
    if (r.id !== 'w2') throw new Error('Unlock chose ' + r.id);
    await shot('unlock-new-wallet-chosen');
    const left = ownerApis();
    if (left.length) throw new Error('still running after adding: ' + JSON.stringify(left));
    if (JSON.stringify(ids()) !== '["w1","w2"]') throw new Error('wallets ' + ids());
    return 'A locked, no owner API left; Unlock chose w2; list w1, w2';
  }, { fatal: true, timeout: 150000 });
  await t.step('A still unlocks after B was added', async () => {
    await choose('w1');
    await unlock(pwA);
    return 'A open';
  }, { fatal: true, timeout: 120000 });
  await t.step(ui === 'modern' ? 'Lock wallet' : 'Log out', () => U.lock(w, ui), { fatal: true });

  /* ---- C: Unlock › Add a wallet › Restore (A's words) ---- */
  await t.step('C: Unlock › Add a wallet › Restore from recovery phrase (A\'s words): a new wallet, Unlock chooses it', async () => {
    await U.clickable(w, 'Add a wallet').first().click();
    await w.getByRole('heading', { name: 'Add a wallet' }).first().waitFor({ timeout: 10000 });
    await U.clickable(w, 'Restore from recovery phrase').first().click();
    await w.locator('textarea').first().fill(a.words.join(' '));
    await w.getByRole('button', { name: ui === 'modern' ? 'Continue' : 'Recover wallet' }).first().click({ timeout: 10000 });
    await w.locator('input[name=password]').first().fill(pwC, { timeout: 10000 });
    await w.locator('input[name=password2]').first().fill(pwC);
    await w.getByRole('button', { name: ui === 'modern' ? 'Restore wallet' : 'Recover' }).first().click();
    const id = await U.unlockChosen(w);
    if (id !== 'w3') throw new Error('Unlock chose ' + id);
    const list = settings().wallets;
    if (list.length !== 3 || new Set(list.map((x) => x.dataDir)).size !== 3) throw new Error('wallets ' + JSON.stringify(list.map((x) => [x.id, x.dataDir])));
    return 'w3 in its own folder; Unlock chose it';
  }, { fatal: true, timeout: 150000 });
  await t.step('C unlocks with its password', () => unlock(pwC), { timeout: 120000 });
  await t.step((ui === 'modern' ? 'Lock wallet' : 'Log out') + ' (C)', () => U.lock(w, ui), { fatal: true });

  /* ---- Add an existing wallet › From a wallet folder ---- */
  const toFolderPicker = async () => {
    if (/login/.test(await U.route(w))) await U.clickable(w, 'Add a wallet').first().click();
    await U.clickable(w, 'Add an existing wallet').first().click({ timeout: 10000 });
    await w.getByRole('heading', { name: 'Add an existing wallet' }).first().waitFor({ timeout: 10000 });
  };
  await t.step('From a wallet folder: A\'s own folder is refused, nothing added', async () => {
    await toFolderPicker();
    await pickerReturns(recA.dataDir);
    await w.getByRole('button', { name: 'Choose a folder…' }).first().click();
    await U.waitText(w, /This wallet is already in the list\./, 15000);
    await shot('add-existing-listed');
    if (ids().length !== 3) throw new Error('wallets ' + ids());
    if (/login/.test(await U.route(w))) throw new Error('it went to Unlock');
    return '"This wallet is already in the list."';
  });
  //copies are made with the wallets locked, without this app's files for them (toml, secrets, logs)
  const copyWallet = (from, to) => fs.cpSync(from, to, { recursive: true, filter: (src) => !/epic-wallet\.toml$|WALLET\.txt$|api_secret$|[\\/]logs?$/.test(src) });
  const copyA = path.join(home, 'copy-of-a');
  await t.step('D: From a wallet folder, a copy of A\'s folder: a new wallet, Unlock chooses it', async () => {
    copyWallet(recA.dataDir, copyA);
    await pickerReturns(copyA);
    await w.getByRole('button', { name: 'Choose a folder…' }).first().click();
    //no epic-wallet.toml in the copy and no network in its name: the app asks
    await U.waitText(w, /Which network is this wallet on\?/, 15000);
    await shot('add-existing-network');
    await w.locator('select').last().selectOption('mainnet');
    await w.getByRole('button', { name: 'Continue', exact: true }).first().click();
    const id = await U.unlockChosen(w);
    if (id !== 'w4') throw new Error('Unlock chose ' + id);
    const d = settings().wallets.find((x) => x.id === 'w4');
    if (d.dataDir !== copyA) throw new Error('w4 data folder ' + d.dataDir);
    return 'w4 = ~/copy-of-a; Unlock chose it';
  }, { fatal: true, timeout: 60000 });
  const lookForWallets = async () => {
    await U.clickable(w, 'Look for wallets').first().click({ timeout: 10000 });
    await w.waitForURL(/found/, { timeout: 15000 });
  };

  /* ---- E: an older Epic Wallet's wallet, from Welcome (Unlock › Add a wallet) ---- */
  const legacyMain = path.join(home, '.epic', 'main');
  await t.step('E: Unlock › Add a wallet › Add an existing wallet › Look for wallets: ~/.epic/main imported, Unlock chooses it', async () => {
    copyWallet(recA.dataDir, legacyMain);
    await toFolderPicker();
    await lookForWallets();
    const box = w.locator(ui === 'modern' ? 'input.e-oldw-check' : 'input.found-check');
    await box.first().waitFor({ timeout: 30000 });
    if (await box.count() !== 1) throw new Error(await box.count() + ' wallets found');
    if (!(await box.first().isChecked())) await box.first().check({ force: true });
    await w.getByRole('button', { name: /^Use selected wallet/ }).first().click();
    const id = await U.unlockChosen(w);
    if (id !== 'w5') throw new Error('Unlock chose ' + id);
    const e = settings().wallets.find((x) => x.id === 'w5');
    if (e.dataDir !== legacyMain || e.origin !== 'imported') throw new Error('w5 ' + JSON.stringify([e.dataDir, e.origin]));
    return 'w5 = ~/.epic/main (imported); Unlock chose it';
  }, { fatal: true, timeout: 60000 });
  await t.step('E unlocks with A\'s password (a copy of A)', () => unlock(pwA), { fatal: true, timeout: 120000 });

  /* ---- F: Settings › All wallets › Restore ---- */
  const pwF = H.newPassword();
  await t.step('F: Settings › All wallets › Restore from recovery phrase (B\'s words): E locks, Unlock chooses F', async () => {
    await allWallets();
    await U.clickable(w, 'Restore from recovery phrase').first().click({ timeout: 10000 });
    await w.locator('textarea').first().fill(wordsB.join(' '));
    await w.getByRole('button', { name: ui === 'modern' ? 'Continue' : 'Recover wallet' }).first().click({ timeout: 10000 });
    await w.locator('input[name=password]').first().fill(pwF, { timeout: 10000 });
    await w.locator('input[name=password2]').first().fill(pwF);
    await w.getByRole('button', { name: ui === 'modern' ? 'Restore wallet' : 'Recover' }).first().click();
    const id = await U.unlockChosen(w);
    if (id !== 'w6') throw new Error('Unlock chose ' + id);
    const left = ownerApis();
    if (left.length) throw new Error('still running after adding: ' + JSON.stringify(left));
    return 'w6; E locked, no owner API left; Unlock chose w6';
  }, { fatal: true, timeout: 150000 });
  await t.step('F unlocks with its password', () => unlock(pwF), { fatal: true, timeout: 120000 });

  /* ---- G: Settings › All wallets › Add an existing wallet › Choose a folder… ---- */
  await t.step('G: Settings › All wallets › Add an existing wallet › Choose a folder… (a copy of B\'s folder): Unlock chooses G', async () => {
    const recB = settings().wallets.find((x) => x.id === 'w2');
    const copyB = path.join(home, 'copy-of-b');
    copyWallet(recB.dataDir, copyB);
    await allWallets();
    await U.clickable(w, 'Add an existing wallet').first().click({ timeout: 10000 });
    await pickerReturns(copyB);
    await w.getByRole('button', { name: 'Choose a folder…' }).first().click({ timeout: 10000 });
    await U.waitText(w, /Which network is this wallet on\?/, 15000);
    await w.locator('select').last().selectOption('mainnet');
    await w.getByRole('button', { name: 'Continue', exact: true }).first().click();
    const id = await U.unlockChosen(w);
    if (id !== 'w7') throw new Error('Unlock chose ' + id);
    return 'w7 = ~/copy-of-b; Unlock chose it';
  }, { fatal: true, timeout: 60000 });
  await t.step('G unlocks with B\'s password (a copy of B)', () => unlock(pwB), { fatal: true, timeout: 120000 });
  await t.step('Settings › All wallets › Look for wallets again: nothing left to import', async () => {
    await allWallets();
    await U.clickable(w, 'Add an existing wallet').first().click({ timeout: 10000 });
    await lookForWallets();
    await U.waitText(w, /No wallets from an older Epic Wallet are left to import/, 30000);
    //the found screen has no menu: its Back goes to Settings › All wallets
    await U.clickable(w, 'Back').first().click();
    await w.waitForURL(/wallets/, { timeout: 10000 });
    await shot('settings-all-wallets-seven');
    if (settings().wallets.length !== 7) throw new Error('wallets ' + ids());
    return '"Nothing found"; still 7 wallets';
  });

  /* ---- nothing was replaced ---- */
  await t.step('settings.json: seven wallets in seven folders; A\'s record and seed as they were', () => {
    const list = settings().wallets;
    if (JSON.stringify(list.map((x) => x.id)) !== '["w1","w2","w3","w4","w5","w6","w7"]') throw new Error('wallets ' + list.map((x) => x.id));
    if (new Set(list.map((x) => x.dataDir)).size !== 7 || new Set(list.map((x) => x.configDir)).size !== 7) throw new Error('a folder is shared');
    const nowA = list.find((x) => x.id === 'w1');
    for (const k of ['id', 'network', 'configDir', 'dataDir', 'origin', 'label', 'createdAt']) {
      if (JSON.stringify(nowA[k]) !== JSON.stringify(recA[k])) throw new Error(`A's ${k} changed: ${JSON.stringify(recA[k])} -> ${JSON.stringify(nowA[k])}`);
    }
    if (sha(seedA) !== seedHashA) throw new Error('A\'s wallet.seed changed');
    return 'w1..w7, distinct folders; A unchanged';
  });

  await t.step('quit with the app\'s own Quit (Menu › Quit)', () => t.quit(), { fatal: true, timeout: 60000 });
  await t.step('no epic-wallet, epic or Electron process left after 10 s', () => t.assertNoLeftovers({ timeout: 10000 }), { timeout: 20000 });
});
