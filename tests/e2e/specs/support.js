/*
 * Support: logs on by default, and Get help / Report a problem end to end (docs/support/DESIGN.md).
 * Empty HOME -> create a wallet -> the stub node -> lock / unlock -> the log files exist (app at
 * debug, epic-wallet's own file at Debug, bounded tomls) -> Help › Report a problem from the menu
 * and the Help page -> review shows the cleaned logs (no home path) -> Save to a file (the save dialog
 * answered in the main process) -> Send to a stub intake on 127.0.0.1 -> the bundle is sealed
 * (EPICSUP1 + the app's key id) and holds no plaintext. The sealed files are copied to the case
 * dir (support-saved.epicsupport, support-sent.epicsupport) for scripts/support-decrypt.mjs.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const H = require('../lib/harness');
const U = require('../lib/ui');

const CASE_DIR = process.env.E2E_CASE_DIR;
const HOME = process.env.HOME;
const ROOT = path.join(HOME, '.epic-gui');
const KEY_ID = 'd9749febd701c2fe';
const INTAKE_PORT = 18447;

/* a stand-in for the bot's intake: checks the request shape, keeps what came */
function startIntake() {
  const got = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { body = {}; }
      got.push({ method: req.method, url: req.url, type: req.headers['content-type'], body });
      const ok = req.method === 'POST' && req.url === '/v1/report' && body.v === 1 && typeof body.bundle === 'string';
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(ok ? { ok: true, id: 'e2etest1' } : { ok: false, error: 'bad-request' }));
    });
  });
  return new Promise((resolve) => server.listen(INTAKE_PORT, '127.0.0.1', () => resolve({ got, close: () => server.close() })));
}

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };

H.runCase('support', async (t) => {
  const ui = t.ui;
  const password = H.newPassword();
  const intake = await startIntake();
  const w = await t.launch({ env: { EPIC_SUPPORT_URL: 'http://127.0.0.1:' + INTAKE_PORT + '/v1/report' } });

  await t.step('first start: Welcome', () => U.welcome(w), { fatal: true });
  await t.step('create a wallet', () => U.createWallet(w, ui, password), { fatal: true, timeout: 150000 });
  if (ui === 'modern') {
    await t.step('the tour has a step about help', async () => {
      const seen = [];
      //the tour opens a moment after the first unlock
      await w.locator('#e-tour-t').waitFor({ state: 'visible', timeout: 10000 });
      for (let i = 0; i < 8 && (await w.locator('#e-tour-t').count()); i++) {
        seen.push((await w.locator('.e-tour-count').innerText()) + ' ' + (await w.locator('#e-tour-t').innerText()));
        await w.locator('.e-tour-foot .e-btn-primary').click();
        await w.waitForTimeout(250);
      }
      if (!seen.some((s) => s.endsWith('Help is here'))) throw new Error('tour steps: ' + seen.join(' | '));
      return seen.length + ' steps: ' + seen.join(' | ');
    });
  }
  await t.step('Settings: the stub node', async () => { await U.typeNodeAddress(w, ui); return U.saveNode(w, ui); }, { fatal: true, timeout: 90000 });
  await t.step('lock and unlock (the wallet processes log)', async () => {
    await U.lock(w, ui);
    await U.unlock(w, ui, password);
    return t.waitLog(/\[login\] http listener started/, { timeout: 60000 });
  }, { fatal: true, timeout: 150000 });

  /* ---- logs on by default ---- */
  await t.step('app logs: main.log and renderer.log, the start line with versions, no daily file', async () => {
    const logs = fs.readdirSync(path.join(ROOT, 'logs'));
    const main = read(path.join(ROOT, 'logs', 'main.log'));
    const page = read(path.join(ROOT, 'logs', 'renderer.log'));
    if (!/App starting: \d+\.\d+\.\d+.*electron \d+.*linux/.test(main)) throw new Error('no start line in main.log');
    if (!/\[login\]/.test(page) || !/spawn epic-wallet/.test(page)) throw new Error('renderer.log lacks [login] / spawn lines');
    if (logs.some((f) => /^\d{4}_\d+_\d+\.log$/.test(f))) throw new Error('a daily log file was written: ' + logs.join(', '));
    if (/--pass\s+(?!<redacted>)\S/.test(page + main) || page.includes(password) || main.includes(password)) throw new Error('a password in the app logs');
    return logs.join(', ');
  });
  let walletDir = '';
  await t.step('epic-wallet log: its own file at Debug, bounded, in the wallet folder', async () => {
    const ids = fs.readdirSync(path.join(ROOT, 'wallets'));
    walletDir = path.join(ROOT, 'wallets', ids[0]);
    const toml = read(path.join(walletDir, 'epic-wallet.toml'));
    for (const re of [/^log_to_file = true$/m, /^file_log_level = "Debug"$/m, /^log_max_size = 5242880$/m, /^log_max_files = 4$/m]) {
      if (!re.test(toml)) throw new Error('epic-wallet.toml lacks ' + re);
    }
    const log = read(path.join(walletDir, 'epic-wallet.log'));
    if (!/ DEBUG /.test(log) || !/Using wallet configuration file/.test(log)) throw new Error('epic-wallet.log has no Debug lines (' + log.length + ' bytes)');
    if (log.includes(password)) throw new Error('the password in epic-wallet.log');
    return ids[0] + '/epic-wallet.log ' + log.length + ' bytes';
  });

  /* ---- the report ---- */
  await t.step('Help page: the Report a problem entry', async () => {
    await U.nav(w, ui, U.PAGES[ui].find((p) => p[1] === '/help'));
    await w.getByRole('button', { name: 'Report a problem' }).first().click();
    await w.getByText('Tell us what happened.').first().waitFor({ state: 'visible', timeout: 5000 });
    //Esc closes it in both interfaces
    await w.keyboard.press('Escape');
    await w.getByText('Tell us what happened.').first().waitFor({ state: 'hidden', timeout: 5000 });
    return 'opens, Esc closes';
  });
  await t.step('Help menu › Get help / Report a problem… opens the dialog', async () => {
    const items = await t.app.evaluate(({ Menu, BrowserWindow }) => {
      const help = Menu.getApplicationMenu().items.find((i) => i.label === 'Help');
      const item = help && help.submenu.items.find((i) => i.id === 'support');
      if (item) item.click(undefined, BrowserWindow.getAllWindows()[0]);
      return help ? help.submenu.items.map((i) => i.label) : [];
    });
    if (!items.includes('Get help / Report a problem…')) throw new Error('Help menu: ' + JSON.stringify(items));
    await w.getByText('Tell us what happened.').first().waitFor({ state: 'visible', timeout: 5000 });
    return items.join(', ');
  });
  const DESC = 'e2e: the wallet does not connect. Path ' + ROOT + ' and IP 85.214.12.7';
const CLEAN_DESC = 'e2e: the wallet does not connect. Path ~/.epic-gui and IP <ip>';
  await t.step('write and review: the cleaned logs, no home path, what goes where', async () => {
    await w.locator('textarea:visible').fill(DESC);
    await w.locator('input[type=text]:visible').last().fill('@e2e_tester');
    await w.getByRole('button', { name: 'Review what will be sent' }).click();
    await w.getByText('Encrypted: only the developer can read it').first().waitFor({ state: 'visible', timeout: 15000 });
    const pres = await w.locator('pre').allTextContents();
    const all = pres.join('\n');
    if (pres.length < 2) throw new Error('only ' + pres.length + ' log(s) in the preview');
    if (all.includes(HOME + '/')) throw new Error('the home path is in the preview');
    if (!/~\/\.epic-gui/.test(all)) throw new Error('no ~/.epic-gui in the cleaned logs');
    if (!(await w.getByText(CLEAN_DESC).first().isVisible())) throw new Error('the review does not show the cleaned description');
    const names = await w.locator('details summary').allTextContents();
    return names.map((n) => n.replace(/\s+/g, ' ').trim()).join(' | ');
  });
  await t.step('Save encrypted report to a file', async () => {
    const target = path.join(HOME, 'report.epicsupport');
    await t.app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, target);
    await w.getByRole('button', { name: 'Save encrypted report to a file' }).click();
    await w.getByText('Saved to ' + target).first().waitFor({ state: 'visible', timeout: 15000 });
    const b = fs.readFileSync(target);
    if (b.subarray(0, 8).toString() !== 'EPICSUP1' || b.subarray(8, 16).toString('hex') !== KEY_ID) throw new Error('not a sealed bundle for ' + KEY_ID);
    if (b.includes(Buffer.from('e2e_tester')) || b.includes(Buffer.from('does not connect'))) throw new Error('plaintext in the bundle');
    fs.copyFileSync(target, path.join(CASE_DIR, 'support-saved.epicsupport'));
    return b.length + ' bytes, sealed';
  });
  await t.step('Send: the intake gets the description and the sealed bundle only', async () => {
    //a new report: the menu again, the same text
    await w.getByRole('button', { name: 'Close' }).last().click();
    await t.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('open-support'));
    await w.locator('textarea:visible').fill(DESC);
    await w.getByRole('button', { name: 'Review what will be sent' }).click();
    await w.getByRole('button', { name: 'Send report' }).click();
    await w.getByText('Report e2etest1 has reached the developer').first().waitFor({ state: 'visible', timeout: 20000 });
    const r = intake.got[intake.got.length - 1];
    if (!r || r.type !== 'application/json' || r.body.v !== 1) throw new Error('intake got ' + JSON.stringify(r && { type: r.type, v: r.body.v }));
    if (Object.keys(r.body).sort().join() !== 'bundle,description,v') throw new Error('extra fields: ' + Object.keys(r.body));
    //the description is posted readable, so it is cleaned like the logs
    if (r.body.description !== CLEAN_DESC) throw new Error('description not cleaned as expected: ' + r.body.description);
    const b = Buffer.from(r.body.bundle, 'base64');
    if (b.subarray(0, 8).toString() !== 'EPICSUP1') throw new Error('not sealed');
    fs.copyFileSync(path.join(HOME, 'report.epicsupport'), path.join(CASE_DIR, 'support-saved.epicsupport'));
    fs.writeFileSync(path.join(CASE_DIR, 'support-sent.epicsupport'), b);
    return intake.got.length + ' request(s), ' + b.length + ' bytes sealed';
  });
  await t.step('the support steps are logged without content', async () => {
    const main = read(path.join(ROOT, 'logs', 'main.log'));
    if (!/support: send ok, report e2etest1/.test(main) || !/support: save ok/.test(main)) throw new Error('no support lines in main.log');
    if (main.includes('e2e_tester') || main.includes('does not connect')) throw new Error('report content in main.log');
    return 'ok';
  });
  //the logs as the developer will see them, for the decrypt check outside the sandbox
  for (const f of ['main.log', 'renderer.log']) fs.copyFileSync(path.join(ROOT, 'logs', f), path.join(CASE_DIR, 'raw-' + f));
  if (walletDir) fs.copyFileSync(path.join(walletDir, 'epic-wallet.log'), path.join(CASE_DIR, 'raw-epic-wallet.log'));
  intake.close();
  await t.step('Menu › Quit', () => t.quit());
});
