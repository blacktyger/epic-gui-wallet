// e2e-gate: off
// e2e-timeout: 600
/*
 * Confirmation of the 6.1.4 / 6.1.5 fixes on Linux, manual-test style: every item gets a PASS/FAIL
 * (Polish: FINDINGS) and screenshots, passes included. Not in the default gate:
 *   npm run test:e2e -- --spec confirm615
 * Output: tests/e2e/out/run-<stamp>/confirm615/ (index.html, <ui>.json, <ui>-<item>-*.png), one
 * folder for both interfaces, ready to publish.
 *
 *   a  node field keeps both slashes of http:// typed key by key (6.1.4)
 *   b  Receive with the listener stopped shows the address and the off notice (6.1.4, T09)
 *   c  port 3415 held by another program: Receive says so; freed, receiving works (6.1.4, W01)
 *   d  lock check (#33): a real `epic` node and real `epic-wallet` CLIs hold folders; the chain data
 *      offer, Add a wallet from a folder…, import and Remove refuse; no file changes; all allowed again
 *      once they stop; the first check's time and the folder-lock lines of the main log
 *   e  the removal dialog wording (Classic: dark mode)
 *   f  Menu › Lock wallet (menu click and Ctrl+L), enabled only while unlocked
 *   g  WALLET.txt: content, LF line endings, the LABEL line follows a rename
 *   h  Polish: every page, English leftovers and text that doesn't fit
 *   i  Show in folder opens the wallet's own folder (a fake xdg-open on PATH logs what the app asks for)
 */
'use strict';
const fs = require('fs');
const net = require('net');
const path = require('path');
const H = require('../lib/harness');
const U = require('../lib/ui');
const V = require('../lib/ui615');

const CASE_DIR = process.env.E2E_CASE_DIR;
const OUT = path.join(path.dirname(CASE_DIR), 'confirm615');
const APPDIR = process.env.E2E_APPDIR;
//known bug E2E-1 (specs/checks.js): may show up once Receive was left with an Epicbox start pending
const E2E_1 = /this\.\$t is not a function/;

const TITLES = {
  a: 'Node field: http:// typed key by key keeps both slashes',
  b: 'Receive with the listener stopped: address and notice',
  c: 'Port 3415 busy: Receive says so; freed, receiving works',
  d: 'Lock check (#33): other Epic programs holding folders',
  e: 'Removal dialog wording',
  f: 'Menu › Lock wallet (menu click and Ctrl+L)',
  g: 'WALLET.txt: content and line endings',
  h: 'Polish UI pass',
  i: 'Show in folder opens the right folder',
};

function occupy(port) {
  return new Promise((resolve, reject) => {
    const s = net.createServer((c) => c.end('e2e-dummy\n'));
    s.once('error', reject);
    s.listen(port, '0.0.0.0', () => resolve({ close: () => new Promise((r) => s.close(() => r())) }));
  });
}
const listening = (port) => new Promise((r) => { const c = net.connect(port, '127.0.0.1'); c.on('connect', () => { c.destroy(); r(true); }); c.on('error', () => r(false)); });

H.runCase('confirm615', async (t) => {
  const ui = t.ui;
  fs.mkdirSync(OUT, { recursive: true });
  const items = Object.fromEntries(Object.entries(TITLES).map(([id, title]) => [id, { id, title, checks: [], shots: [], findings: [] }]));
  let shotN = 0;
  const snap = async (id, name) => {
    const rel = await t.screenshot(`${id}-${name}`);
    if (!rel) return null;
    const file = `${ui}-${id}-${String(++shotN).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    fs.copyFileSync(path.join(CASE_DIR, rel), path.join(OUT, file));
    items[id].shots.push(file);
    return file;
  };
  /** One check of an item: a gate step, recorded on the item. */
  const check = async (id, name, fn, opts = {}) => {
    const r = await t.step(`[${id}] ${name}`, fn, { timeout: 90000, ...opts, allowConsole: [E2E_1, ...(opts.allowConsole || [])] });
    const s = t.steps[t.steps.length - 1];
    items[id].checks.push({ name, status: s.status, actual: s.actual, error: s.error });
    return r;
  };
  const save = () => {
    for (const it of Object.values(items)) {
      it.status = !it.checks.length ? 'NOT RUN' : it.checks.some((c) => c.status === 'fail') ? 'FAIL' : it.findings.length ? 'FINDINGS' : 'PASS';
    }
    fs.writeFileSync(path.join(OUT, `${ui}.json`), H.redact(JSON.stringify({ ui, items: Object.values(items) }, null, 2)));
    writeIndex();
  };

  const home = t.home;
  const settings = () => JSON.parse(fs.readFileSync(path.join(home, '.epic-gui', 'settings.json'), 'utf8'));
  const walletOf = (label) => settings().wallets.find((x) => x.label === label);
  const size = () => t.app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0]; if (b.isMaximized()) b.unmaximize(); b.setContentSize(1280, 800); }).then(() => t.win.waitForTimeout(300));
  const lockCheck = (kind, dir) => w.evaluate(([k, d]) => { const t0 = performance.now(); return window.api.folderLock(k, d).then((r) => ({ ms: Math.round(performance.now() - t0), state: r.state, via: r.via, files: r.files.filter((f) => f.state !== 'free').map((f) => f.file) })); }, [kind, dir]);
  //the tour's own Skip (its ghost button), in any language; returns whether a tour was open
  const skipTourIfAny = async (wait = 2500) => {
    if (ui !== 'modern' || !(await w.locator('#e-tour-t').waitFor({ state: 'visible', timeout: wait }).then(() => true, () => false))) return false;
    await w.locator('#e-tour-t').locator('xpath=ancestor::*[.//button[contains(@class,"e-btn-ghost")]][1]').locator('button.e-btn-ghost').first().click();
    await w.locator('#e-tour-t').waitFor({ state: 'hidden', timeout: 5000 });
    return true;
  };
  const pickerReturns = (dir) => t.app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, dir);
  const addFromFolder = (dir) => pickerReturns(dir).then(() => V.addFromFolder(w, ui));
  const setLabel = async (label) => {
    await V.openWalletSettings(w, ui);
    await w.locator(ui === 'modern' ? '#stg-label' : '#accountLabel').fill(label);
    await (ui === 'modern' ? w.locator('#stg-label').locator('xpath=ancestor::form[1]').getByRole('button', { name: 'Save' }) : w.getByRole('button', { name: 'Save', exact: true })).first().click();
    const ok = await H.waitFor(() => (settings().wallets.find((x) => x.label === label) ? true : null), { timeout: 10000 });
    if (!ok) throw new Error('label not saved');
  };
  //Modern: the busy-port notice offers Try again (the banner's Start listener starts Epicbox only)
  const retry = () => (ui === 'modern' ? w.getByRole('button', { name: 'Try again' }) : w.getByRole('button', { name: 'Try again' }).or(w.getByRole('link', { name: 'Try again' }))
    .or(w.getByRole('button', { name: /^Start( listener)?$/ }))).first();

  //a fake xdg-open first on the app's PATH: what Show in folder asks the system to open, logged
  const fakebin = path.join(home, 'fakebin'); const xdgLog = path.join(home, 'xdg-open.log');
  fs.mkdirSync(fakebin, { recursive: true });
  fs.writeFileSync(path.join(fakebin, 'xdg-open'), '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$HOME/xdg-open.log"\n', { mode: 0o755 });

  const pwA = H.newPassword(); const pwB = H.newPassword(); const pwC = H.newPassword();
  const w = await t.launch({ env: { PATH: fakebin + ':' + process.env.PATH } });
  await size();
  await t.step('create wallet A (mainnet)', () => U.createWallet(w, ui, pwA), { fatal: true, timeout: 150000 });
  await skipTourIfAny(15000); await size();

  /* ---------- g: WALLET.txt ---------- */
  const dirA = settings().wallets[0].dataDir;
  await check('g', 'content: intro line, details block, the data folder, no secrets', async () => {
    const txt = fs.readFileSync(path.join(dirA, 'WALLET.txt'), 'utf8');
    fs.writeFileSync(path.join(OUT, `${ui}-g-WALLET.txt`), txt.split(home).join('<home>'));
    items.g.text = txt.split(home).join('<home>');
    const lines = txt.split('\n');
    if (lines[0] !== 'This file tells you which Epic Cash wallet this folder belongs to.') throw new Error('first line: ' + lines[0]);
    if (!txt.includes('## YOUR WALLET DETAILS ##')) throw new Error('no details block');
    if (!/^DATA FOLDER =\n/m.test(txt) || txt.split(dirA).length - 1 < 1) throw new Error('no "DATA FOLDER =" with ' + dirA);
    if (txt.includes(pwA)) throw new Error('the password is in WALLET.txt');
    return `${lines.length} lines; ${(txt.match(/^LABEL.*$/m) || [''])[0]}`;
  });
  await check('g', 'line endings: LF only (Linux)', async () => {
    const b = fs.readFileSync(path.join(dirA, 'WALLET.txt'));
    const crlf = (b.toString('latin1').match(/\r\n/g) || []).length; const lf = (b.toString('latin1').match(/\n/g) || []).length;
    items.g.lineEndings = { lf: lf - crlf, crlf, endsWithNewline: b[b.length - 1] === 0x0a };
    if (crlf) throw new Error(`${crlf} CRLF line endings`);
    return `${lf} LF, 0 CRLF, ends with a newline: ${b[b.length - 1] === 0x0a}`;
  });
  await check('g', 'rename to "Alpha": the LABEL line follows', async () => {
    await setLabel('Alpha');
    const txt = await H.waitFor(() => { const x = fs.readFileSync(path.join(dirA, 'WALLET.txt'), 'utf8'); return /^LABEL\s*=\s*Alpha$/m.test(x) ? x : null; }, { timeout: 10000 });
    await snap('g', 'settings-wallet-alpha');
    if (!txt) throw new Error('LABEL line: ' + (fs.readFileSync(path.join(dirA, 'WALLET.txt'), 'utf8').match(/^LABEL.*$/m) || [''])[0]);
    return (txt.match(/^LABEL.*$/m) || [''])[0];
  });
  save();

  /* ---------- a: node field ---------- */
  await check('a', 'type http://127.0.0.1:13413 key by key; the field holds each key, slashes included', async () => {
    await U.openSettings(w, ui);
    if (ui === 'modern') { const ext = w.locator('input[name^="e-nodeserverField"][value="external"]').first(); if (!(await ext.isChecked())) await w.getByText('External node server', { exact: true }).first().click(); }
    else { const sel = w.locator('section.is-main-section select').first(); if ((await sel.inputValue()) !== 'external') await sel.selectOption('external'); }
    const input = (ui === 'modern' ? w.locator('#e-nodeserverField-1-a, input[id^="e-nodeserverField"][id$="-a"]') : w.locator('section.is-main-section input.input')).first();
    await input.click(); await input.press('Control+A'); await input.press('Delete');
    let typed = '';
    for (const ch of U.NODE_URL) {
      await input.press(ch); typed += ch;
      const v = await input.inputValue();
      if (v !== typed) throw new Error(`after ${JSON.stringify(typed)} the field shows ${JSON.stringify(v)}`);
      if (typed === 'http://') await snap('a', 'typing-http-slashes');
    }
    await input.press('Tab');
    await snap('a', 'typed-full-address');
    return 'every key kept: ' + await input.inputValue();
  }, { fatal: true });
  await check('a', 'save: the address stays, the wallet uses it', async () => { const r = await U.saveNode(w, ui); await snap('a', 'after-save'); return r; }, { fatal: true });
  save();

  /* ---------- f: Menu › Lock wallet ---------- */
  await check('f', 'menu: "Lock wallet", CmdOrCtrl+L, right above Quit, enabled while unlocked', async () => {
    const m = await V.menuLock(t.app);
    if (!m || m.label !== 'Lock wallet' || m.accelerator !== 'CmdOrCtrl+L' || !m.aboveQuit || !m.enabled) throw new Error(JSON.stringify(m));
    return JSON.stringify(m);
  });
  await check('f', 'Menu › Lock wallet (the menu item\'s click) locks', async () => {
    await t.app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('lock').click());
    await w.waitForURL(/login/, { timeout: 30000 });
    await snap('f', 'locked-from-menu');
    return U.route(w);
  });
  await check('f', 'on the Unlock screen the menu item is disabled', async () => {
    const m = await H.waitFor(async () => { const x = await V.menuLock(t.app); return x && !x.enabled ? x : null; }, { timeout: 8000 });
    if (!m) throw new Error(JSON.stringify(await V.menuLock(t.app)));
    return 'enabled=false';
  });
  await check('f', 'unlock', async () => { const r = await U.unlock(w, ui, pwA); await skipTourIfAny(); await size(); return r; }, { fatal: true, timeout: 120000 });
  await check('f', 'a real Ctrl+L (an X key event, which the menu accelerator receives) locks', async () => {
    const how = V.realKey('Control_L', 'l');
    await w.waitForURL(/login/, { timeout: 15000 });
    await snap('f', 'locked-ctrl-l');
    return `${how} -> ${await U.route(w)}`;
  });
  await check('f', 'unlock again', async () => { const r = await U.unlock(w, ui, pwA); await skipTourIfAny(); await size(); return r; }, { fatal: true, timeout: 120000 });
  await check('f', 'Ctrl+L in the page (a key event to the page only, as the Windows rig can send) locks', async () => {
    await w.locator('h1').first().click({ position: { x: 2, y: 2 } }).catch(() => {});
    await w.keyboard.press('Control+L');
    await w.waitForURL(/login/, { timeout: 15000 });
    return U.route(w);
  });
  await check('f', 'unlock after the page Ctrl+L', async () => { const r = await U.unlock(w, ui, pwA); await skipTourIfAny(); await size(); return r; }, { fatal: true, timeout: 120000 });
  save();

  /* ---------- b: Receive with the listener stopped ---------- */
  await check('b', 'Receive, listener stopped: Epic address and "Receiving is off…" notice', async () => {
    const addr = await U.receiveAddress(w, ui);
    await U.stopListener(w, ui);
    const notice = await U.waitText(w, /Receiving is off\. Payments wait on Epicbox until you start it\./, 20000);
    const a = await U.epicAddress(w);
    await snap('b', 'receive-stopped');
    if (a !== addr) throw new Error('address after stop: ' + a);
    return `${notice} :: ${a.slice(0, 12)}…`;
  });
  save();

  /* ---------- c: busy port 3415 ---------- */
  let dummy = null;
  await check('c', 'lock, another program takes 0.0.0.0:3415, unlock', async () => {
    await U.lock(w, ui); dummy = await occupy(3415); const r = await U.unlock(w, ui, pwA); await skipTourIfAny(); await size(); return r;
  }, { fatal: true, timeout: 120000 });
  await check('c', 'Receive says the port is used, in the 6.1.5 wording', async () => {
    await U.nav(w, ui, U.PAGES[ui].find((p) => p[1] === '/httpReceive'));
    //HTTP receiving is off until asked (fix/node-load): Turn on meets the busy port
    if (ui === 'modern') await w.getByRole('button', { name: 'Turn on', exact: true }).first().click({ timeout: 8000 });
    const s = await U.waitText(w, /Port 3415 is used by another program, for example another Epic wallet\. Close it, then try again\./, 45000);
    await snap('c', 'port-busy');
    return s;
  });
  await check('c', 'the program closes the port; Try again / Start: the wallet listens on 3415', async () => {
    await dummy.close(); dummy = null;
    const how = (await retry().innerText()).trim();
    await retry().click();
    const gone = await H.waitFor(async () => !/Port 3415 is used by another program/.test(await U.text(w)), { timeout: 30000 });
    const up = await H.waitFor(() => listening(3415), { timeout: 15000 });
    await w.waitForTimeout(800);
    await snap('c', 'port-free-receiving');
    if (!gone) throw new Error('the message stays');
    if (!up) throw new Error('nothing listens on 3415');
    return `"${how}" -> message gone, 3415 answers`;
  });
  save();

  /* ---------- h: Polish ---------- */
  const enTexts = {};
  await check('h', 'English text of every page (the baseline)', async () => {
    for (const page of U.PAGES[ui]) { await U.nav(w, ui, page); await w.waitForTimeout(500); enTexts[page[1] + (page[3] || '')] = await V.leafTexts(w); }
    return Object.keys(enTexts).length + ' pages';
  });
  await check('h', 'switch to Polski', async () => {
    const a = await U.setLanguage(w, ui, 'pl');
    await w.waitForTimeout(1200);
    const where = await U.route(w);
    if (await skipTourIfAny()) items.h.findings.push({ page: where, text: 'After saving the language the app shows ' + where + ' and the first-unlock tour again (step 1 of 5)', why: 'behaviour' });
    await snap('h', 'pl-after-switch');
    return JSON.stringify(a) + ' then on ' + where;
  });
  for (const page of U.PAGES[ui]) {
    await check('h', `Polish page ${page[1]}${page[3] && page[3] !== 'side' ? ' (' + page[0] + ')' : ''}`, async () => {
      await U.nav(w, ui, page); await w.waitForTimeout(700);
      await snap('h', 'pl' + page[1].replace(/\//g, '-') + (page[3] && /rcv|stg/.test(page[3]) ? '-' + page[0] : ''));
      const left = V.englishLeft(enTexts[page[1] + (page[3] || '')] || [], await V.leafTexts(w), { names: ['Alpha'], data: await U.epicAddress(w) || '' });
      const clip = await V.clippedText(w);
      //an amount that looks the same as in English: the number isn't formatted for Polish (decimal comma)
      for (const x of left) items.h.findings.push({ page: page[1], text: x, why: /^[\d.,]+ EPIC$/.test(x) ? 'number not in Polish format (0,00)' : 'English text left' });
      for (const x of clip) items.h.findings.push({ page: page[1], text: x, why: 'does not fit' });
      return `${left.length} English, ${clip.length} not fitting`;
    });
  }
  await check('h', 'back to English', async () => { const a = await U.setLanguage(w, ui, 'en'); await w.waitForTimeout(1200); await skipTourIfAny(); return JSON.stringify(a); });
  save();

  /* ---------- a second 6.1 wallet and three CLI wallets ---------- */
  await t.step('wallet B (Settings › All wallets › Create a new wallet), named "Bravo"', async () => {
    const r = await V.addWallet(w, ui, pwB); await skipTourIfAny(); await size(); await setLabel('Bravo'); return r;
  }, { fatal: true, timeout: 150000, allowConsole: [E2E_1] });
  const dirB = walletOf('Bravo').dataDir;
  const L1 = path.join(home, '.epic', 'main'); const L2 = path.join(home, 'cli', 'l2'); const LF = path.join(home, 'cli', 'floo');
  await t.step('three wallets made with the epic-wallet CLI: ~/.epic/main, ~/cli/l2, ~/cli/floo (floonet)', async () => {
    const out = [];
    for (const [dir, network] of [[L1, 'mainnet'], [L2, 'mainnet'], [LF, 'floonet']]) out.push(await V.cliInit({ appDir: APPDIR, dir, network, password: pwC, log: path.join(CASE_DIR, `cli-init-${path.basename(dir)}.log`) }));
    return out.join(' | ');
  }, { fatal: true, timeout: 120000, allowConsole: [E2E_1] });

  /* ---------- d: the first lock check, then the floonet wallet from its folder ---------- */
  await check('d', 'the app\'s first folder-lock check (cold, perl helper) and a second one', async () => {
    const first = await lockCheck('wallet', LF); const second = await lockCheck('wallet', LF);
    items.d.timing = { firstMs: first.ms, secondMs: second.ms, via: first.via };
    if (first.state !== 'free') throw new Error(JSON.stringify(first));
    return `first ${first.ms} ms (${first.via}, ${first.state}), second ${second.ms} ms`;
  });
  await t.step('Add a wallet from a folder… ~/cli/floo (free): Unlock opens with it; unlock, name it "Floo"', async () => {
    await addFromFolder(LF);
    await w.waitForURL(/login/, { timeout: 30000 });
    const r = await U.unlock(w, ui, pwC); await skipTourIfAny(); await size(); await setLabel('Floo');
    return r;
  }, { fatal: true, timeout: 150000, allowConsole: [E2E_1] });

  /* ---------- i: Show in folder ---------- */
  await check('i', 'Show in folder on Alpha asks the system to open Alpha\'s own folder', async () => {
    await V.openAllWallets(w, ui);
    await w.getByRole('button', { name: 'Show Alpha in folder' }).first().click({ timeout: 10000 });
    const got = await H.waitFor(() => { try { return fs.readFileSync(xdgLog, 'utf8').trim(); } catch (e) { return null; } }, { timeout: 10000 });
    await snap('i', 'settings-wallets-show-in-folder');
    items.i.opened = got && got.split(home).join('<home>');
    if (!got) throw new Error('xdg-open was not run');
    if (got.split('\n').pop() !== dirA) throw new Error(`xdg-open ${got}, expected ${dirA}`);
    return 'xdg-open ' + got.split(home).join('~');
  });
  save();

  /* ---------- e: removal dialog wording ---------- */
  await check('e', 'Remove Alpha…: the three choices and their hints', async () => {
    const dlg = await V.openRemoval(w, ui, 'Alpha');
    const c = await V.removalChoices(dlg);
    items.e.theme = await w.evaluate(() => document.documentElement.dataset.theme || '');
    items.e.choices = c.map((x) => ({ ...x, text: x.text.split(home).join('~') }));
    await snap('e', 'remove-dialog' + (ui === 'classic' ? '-dark' : ''));
    const by = Object.fromEntries(c.map((x) => [x.mode, x]));
    const want = {
      list: /Remove from the list only All files stay where they are\. You can add the wallet back later: Add a wallet › Add an existing wallet\./,
      app: /Remove this app’s files for it Also deletes its settings, its contacts in this app and this app’s files for it\. The wallet itself, with its seed, stays in .+\./,
      everything: /Remove everything, including the wallet seed Deletes this wallet from this computer: .+\. You can restore it only with your recovery phrase; without it the coins are lost\./,
    };
    for (const [mode, re] of Object.entries(want)) if (!by[mode] || !re.test(by[mode].text)) throw new Error(`${mode}: ${by[mode] ? by[mode].text : 'missing'}`);
    if (ui === 'classic' && items.e.theme !== 'dark') throw new Error('Classic theme is ' + items.e.theme);
    return c.map((x) => x.mode + (x.disabled ? '(off)' : '')).join(', ') + (ui === 'classic' ? ', theme ' + items.e.theme : '');
  });
  await check('e', 'choosing "Remove everything": the warning', async () => {
    const dlg = w.locator('dialog[open]').last();
    await dlg.locator('input[type=radio][value="everything"]').check({ force: true });
    const s = await H.waitFor(async () => { const x = (await dlg.innerText()).replace(/\s+/g, ' '); return /This deletes the wallet seed from this computer\. You can restore the wallet only with your recovery phrase; without it the coins are lost for good\./.test(x) ? x : null; }, { timeout: 5000 });
    await snap('e', 'remove-everything-warning' + (ui === 'classic' ? '-dark' : ''));
    await V.closeRemoval(w);
    if (!s) throw new Error('warning text not shown');
    return 'This deletes the wallet seed from this computer. You can restore the wallet only with your recovery phrase; without it the coins are lost for good.';
  });
  save();

  /* ---------- d: real programs hold the folders ---------- */
  const held = { Alpha: dirA, Bravo: dirB, '~/.epic/main': L1, '~/cli/l2': L2, '~/.epic/floo/chain_data': path.join(home, '.epic', 'floo', 'chain_data') };
  const holders = [];
  let nodeH = null;
  await check('d', 'start the holders: epic node on ~/.epic/floo/chain_data; epic-wallet owner_api on Alpha, Bravo, ~/.epic/main, ~/cli/l2', async () => {
    nodeH = await V.startNode({ appDir: APPDIR, dir: path.join(home, '.epic', 'floo'), log: path.join(CASE_DIR, 'holder-node.log') });
    let port = 23420;
    for (const [name, dir, pw] of [['Alpha', dirA, pwA], ['Bravo', dirB, pwB], ['main', L1, pwC], ['l2', L2, pwC]]) {
      holders.push({ name, h: await V.holdWallet({ appDir: APPDIR, walletDir: dir, workDir: path.join(home, 'hold', name), port: (port += 10), password: pw, log: path.join(CASE_DIR, `holder-${name}.log`) }) });
    }
    const states = [];
    for (const [name, dir] of Object.entries(held)) { const r = await lockCheck(/chain_data$/.test(dir) ? 'chain' : 'wallet', dir); states.push(`${name} ${r.state}`); if (r.state !== 'locked') throw new Error(states.join(', ')); }
    return states.join(', ');
  }, { fatal: true, timeout: 120000 });
  const before = Object.fromEntries(Object.entries(held).map(([k, d]) => [k, V.hashTree(d)]));

  await check('d', 'chain data offer (Settings › Built-in node › Save): "Use this data" disabled, the folder in use', async () => {
    await U.openSettings(w, ui);
    if (ui === 'modern') await w.getByText('Built-in node server', { exact: true }).first().click();
    else await w.locator('section.is-main-section select').first().selectOption('internal');
    await (ui === 'modern' ? w.locator('.e-stg-savebar button.e-btn-primary') : w.locator('section.is-main-section button.is-primary').last()).click({ timeout: 8000 });
    const dlg = w.locator('dialog[open]').last();
    await dlg.getByText('Existing blockchain data found').waitFor({ timeout: 30000 });
    const t0 = (await dlg.innerText()).replace(/\s+/g, ' ');
    const use = dlg.getByRole('button', { name: 'Use this data' });
    const disabled = await use.isDisabled();
    await snap('d', 'chain-offer-in-use');
    await dlg.getByRole('button', { name: 'Close', exact: true }).click();
    if (!disabled) throw new Error('"Use this data" is enabled');
    if (!/Another Epic program is using this folder\./.test(t0)) throw new Error('no in-use text: ' + t0.slice(0, 300));
    return (t0.match(/Another Epic program is using this folder\.[^.]*\./) || [''])[0];
  });
  const revertNode = async () => {
    if (ui === 'modern') { const d = w.getByRole('button', { name: 'Discard', exact: true }); if (await d.count()) await d.first().click(); }
    else await w.locator('section.is-main-section select').first().selectOption('external');
  };
  await revertNode();
  await check('d', 'Add a wallet from a folder… ~/cli/l2 (held): refused with the in-use message', async () => {
    await V.openWalletSettings(w, ui);
    await addFromFolder(L2);
    const s = await U.waitText(w, /Another Epic program is using this folder\. Close it and try again\./, 20000);
    await snap('d', 'add-from-folder-refused');
    if (/login/.test(await U.route(w))) throw new Error('it opened the wallet');
    return s;
  });
  const importL1 = async () => {
    await V.openAllWallets(w, ui);
    await U.clickable(w, 'Add an existing wallet').first().click({ timeout: 10000 });
    await U.clickable(w, 'Look for wallets').first().click({ timeout: 10000 });
    await w.waitForURL(/found/, { timeout: 15000 });
    const box = w.locator(ui === 'modern' ? 'input.e-oldw-check' : 'input.found-check');
    await box.first().waitFor({ timeout: 30000 });
    const rows = await w.evaluate(() => [...document.querySelectorAll('.e-oldw-row, .found-check')].map((e) => (e.closest('li') || e).innerText.replace(/\s+/g, ' ').trim()));
    if (!(await box.first().isChecked())) await box.first().check({ force: true });
    await w.locator('form button[type=submit]').first().click();
    return rows;
  };
  await check('d', 'Import from an older Epic Wallet: ~/.epic/main (held) is listed, importing it is refused', async () => {
    const rows = await importL1();
    const s = await U.waitText(w, /wallet wasn’t imported|wallets weren’t imported/, 30000);
    const reason = await U.waitText(w, /Another Epic program is using this folder\. Close it and try again\./, 5000);
    await snap('d', 'import-refused');
    await w.getByRole('button', { name: 'Continue' }).first().click().catch(() => {});
    await w.waitForTimeout(800);
    return `${rows.map((x) => x.split(home).join('~')).join(' | ')} -> ${s}: ${reason}`;
  });
  await check('d', 'Remove Alpha… (held): "app files" and "everything" off with the in-use reason, "list only" on', async () => {
    const dlg = await V.openRemoval(w, ui, 'Alpha');
    const c = await V.removalChoices(dlg);
    await snap('d', 'remove-alpha-held');
    await V.closeRemoval(w);
    const by = Object.fromEntries(c.map((x) => [x.mode, x]));
    if (!by.list || by.list.disabled) throw new Error('list only is off');
    for (const m of ['app', 'everything']) if (!by[m] || !by[m].disabled || !/Another Epic program is using this folder\. Close it and try again\./.test(by[m].text)) throw new Error(`${m}: ${by[m] && by[m].text}`);
    return c.map((x) => x.mode + (x.disabled ? '(off)' : '(on)')).join(', ');
  });
  await check('d', 'Remove Bravo… (held) › "Remove from the list only" works', async () => {
    const dlg = await V.openRemoval(w, ui, 'Bravo');
    await dlg.locator('input[type=radio][value="list"]').check({ force: true });
    await dlg.locator('button.e-btn-danger, button.is-danger').first().click({ timeout: 8000 });
    const gone = await H.waitFor(() => (!walletOf('Bravo') ? true : null), { timeout: 20000 });
    await w.waitForTimeout(800);
    await snap('d', 'bravo-removed-from-list');
    if (!gone) throw new Error('Bravo is still in settings.json');
    if (!fs.existsSync(path.join(dirB, 'wallet_data', 'wallet.seed'))) throw new Error('Bravo\'s seed is gone');
    return 'Bravo left the list; its folder and seed stay';
  });
  await check('d', 'no file in the held folders changed', async () => {
    const changed = Object.entries(held).flatMap(([k, d]) => V.hashDiff(before[k], V.hashTree(d)).map((x) => `${k}/${x}`));
    items.d.filesHashed = Object.values(before).reduce((n, h) => n + Object.keys(h).length, 0);
    if (changed.length) throw new Error(changed.join(', '));
    return `${items.d.filesHashed} files hashed before and after, none changed`;
  });
  await check('d', 'the holders logged no errors and are still running', async () => {
    const bad = [];
    for (const { name, h } of holders) { if (h.exited()) bad.push(name + ' exited'); for (const l of h.output().split('\n')) if (/\bERROR\b|panicked/.test(l)) bad.push(`${name}: ${l.trim().slice(0, 160)}`); }
    for (const l of fs.readFileSync(path.join(CASE_DIR, 'holder-node.log'), 'utf8').split('\n')) if (/\bERROR\b|panicked/.test(l)) bad.push('node: ' + l.trim().slice(0, 160));
    if (bad.length) throw new Error(bad.slice(0, 5).join(' | '));
    return 'no ERROR lines; node + 4 CLIs running';
  });
  await check('d', 'stop the holders', async () => {
    const r = [];
    for (const { name, h } of holders) r.push(name + ' ' + await h.stop());
    r.push('node ' + await nodeH.stop());
    return r.join(', ');
  }, { timeout: 120000 });
  await check('d', 'after: the chain data offer lets "Use this data" be pressed', async () => {
    await U.openSettings(w, ui);
    if (ui === 'modern') await w.getByText('Built-in node server', { exact: true }).first().click();
    else await w.locator('section.is-main-section select').first().selectOption('internal');
    await (ui === 'modern' ? w.locator('.e-stg-savebar button.e-btn-primary') : w.locator('section.is-main-section button.is-primary').last()).click({ timeout: 8000 });
    const dlg = w.locator('dialog[open]').last();
    await dlg.getByText('Existing blockchain data found').waitFor({ timeout: 30000 });
    const enabled = !(await dlg.getByRole('button', { name: 'Use this data' }).isDisabled());
    await snap('d', 'chain-offer-free');
    await w.keyboard.press('Escape');
    await dlg.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await revertNode();
    if (!enabled) throw new Error('"Use this data" still disabled');
    return '"Use this data" enabled; closed without answering';
  });
  await check('d', 'after: Remove Alpha… offers all three', async () => {
    const dlg = await V.openRemoval(w, ui, 'Alpha');
    const c = await V.removalChoices(dlg);
    await snap('d', 'remove-alpha-free');
    await V.closeRemoval(w);
    if (c.some((x) => x.disabled)) throw new Error(c.map((x) => x.mode + (x.disabled ? '(off)' : '')).join(', '));
    return c.map((x) => x.mode).join(', ') + ' all on';
  });
  await check('d', 'after: importing ~/.epic/main works', async () => {
    await importL1();
    const r = await H.waitFor(async () => { const s = await U.text(w); if (/wasn’t imported|weren’t imported/.test(s)) return 'refused: ' + s.slice(0, 200); return settings().wallets.some((x) => x.dataDir === L1) ? 'imported' : null; }, { timeout: 30000 });
    await w.waitForTimeout(1000);
    await snap('d', 'import-done');
    if (r !== 'imported') throw new Error(String(r));
    return '~/.epic/main is in the list; now on ' + await U.route(w);
  });
  await check('d', 'after: Add a wallet from a folder… ~/cli/l2 works (Unlock opens with it)', async () => {
    if (/login/.test(await U.route(w))) await U.unlock(w, ui, pwC).then(skipTourIfAny);
    await V.openWalletSettings(w, ui);
    await addFromFolder(L2);
    await w.waitForURL(/login/, { timeout: 30000 });
    await w.waitForTimeout(600);
    await snap('d', 'add-from-folder-done');
    if (!settings().wallets.some((x) => x.dataDir === L2)) throw new Error('~/cli/l2 not in the list');
    return '~/cli/l2 added; Unlock shows it';
  }, { timeout: 120000 });
  await check('d', 'the folder-lock lines of the app\'s main log', async () => {
    const lines = fs.readFileSync(path.join(home, '.epic-gui', 'logs', 'main.log'), 'utf8').split('\n').filter((l) => /folder-?lock/i.test(l)).map((l) => l.split(home).join('~'));
    items.d.logLines = lines;
    if (!lines.length) throw new Error('no folder-lock line');
    return lines.length + ' lines';
  });
  save();

  /* ---------- quit ---------- */
  await t.step('quit (Menu › Quit)', () => t.quit(), { fatal: true, timeout: 60000, allowConsole: [E2E_1] });
  await t.step('no process of the app left after 10 s', () => t.assertNoLeftovers({ timeout: 10000 }), { timeout: 20000 });
  items.d.e2e1 = t.logLines(E2E_1).length ? 'known bug E2E-1 showed up' : 'E2E-1 not seen';
  save();
});

/* ---------- index.html of the confirm615 folder, from every <ui>.json in it ---------- */
function writeIndex() {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const runs = ['modern', 'classic'].map((u) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, `${u}.json`), 'utf8')); } catch (e) { return null; } }).filter(Boolean);
  const ids = Object.keys(TITLES);
  const badge = (s) => `<span class="b ${esc(String(s).toLowerCase().replace(/\s/g, ''))}">${esc(s)}</span>`;
  let html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>6.1.5 confirmation</title><style>
:root{--bg:#fff;--fg:#1b1b1b;--dim:#666;--line:#ddd;--pass:#1a7f37;--fail:#c62828;--find:#a15c00}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--dim:#aaa;--line:#333;--pass:#4caf50;--fail:#ef5350;--find:#ffb74d}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}
.b{font-weight:700}.pass{color:var(--pass)}.fail{color:var(--fail)}.findings{color:var(--find)}
img{max-width:100%;border:1px solid var(--line);margin:4px 0}details{margin:8px 0}code,pre{white-space:pre-wrap;word-break:break-word;font-size:13px}
.dim{color:var(--dim)}</style></head><body><h1>Epic GUI Wallet 6.1.5: confirmation on Linux</h1>
<p class="dim">tests/e2e/specs/confirm615.js, packaged Linux build in a network-less sandbox. ${esc(new Date().toISOString())}</p>
<table><tr><th>Item</th>${runs.map((r) => `<th>${esc(r.ui)}</th>`).join('')}</tr>`;
  for (const id of ids) html += `<tr><td><b>${id}</b> ${esc(TITLES[id])}</td>${runs.map((r) => `<td>${badge(r.items.find((x) => x.id === id).status)}</td>`).join('')}</tr>`;
  html += '</table>';
  for (const id of ids) {
    html += `<h2>${id}. ${esc(TITLES[id])}</h2>`;
    for (const r of runs) {
      const it = r.items.find((x) => x.id === id);
      html += `<details open><summary><b>${esc(r.ui)}</b> ${badge(it.status)}</summary><ul>`;
      for (const c of it.checks) html += `<li>${badge(c.status)} ${esc(c.name)}<br><span class="dim">${esc(c.error || c.actual || '')}</span></li>`;
      html += '</ul>';
      if (it.timing) html += `<p>First lock check: <b>${it.timing.firstMs} ms</b> (${esc(it.timing.via)}), second: ${it.timing.secondMs} ms</p>`;
      if (it.logLines) html += `<p>main.log folder-lock lines:</p><pre>${esc(it.logLines.join('\n'))}</pre>`;
      if (it.lineEndings) html += `<p>Line endings: ${esc(JSON.stringify(it.lineEndings))}</p>`;
      if (it.text) html += `<pre>${esc(it.text)}</pre>`;
      if (it.opened) html += `<p>xdg-open was called with: <code>${esc(it.opened)}</code></p>`;
      if (it.findings.length) html += `<table><tr><th>Page</th><th>Text</th><th>Why</th></tr>${it.findings.map((f) => `<tr><td>${esc(f.page)}</td><td>${esc(f.text)}</td><td>${esc(f.why)}</td></tr>`).join('')}</table>`;
      for (const s of it.shots) html += `<p class="dim">${esc(s)}</p><img loading="lazy" src="${esc(s)}" alt="${esc(s)}">`;
      html += '</details>';
    }
  }
  fs.writeFileSync(path.join(OUT, 'index.html'), H.redact(html + '</body></html>\n'));
}
