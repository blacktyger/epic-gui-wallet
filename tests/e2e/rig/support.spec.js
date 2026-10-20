// Support logs and the encrypted report on Windows (GUI feat/support-logs, its tests/e2e/specs/support.js):
// a fresh throwaway profile, the stub node on 127.0.0.1:13413, per interface:
// create a wallet -> stub node -> lock / unlock -> the log files exist (app debug logs, epic-wallet's own
// file at Debug with a bounded toml) -> Help menu > Get help / Report a problem -> review: the cleaned
// logs hold no profile path, no C:\Users\<name> and no user name -> Save encrypted report to a file
// (the save dialog answered in the main process) -> a sealed EPICSUP1 file for the developer key.
// The sealed file and the raw logs are kept in the run folder (support-<ui>-*) for the decrypt check.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const A = require('../lib/app');
const U = require('../lib/gateui');
const lock = require('../lib/lock');
const { makeProfile } = require('../lib/env');
const { createFlows } = require('../lib/flows');
const { startStubNode } = require('../lib/stubnode');

const PROFILES = process.env.WINTEST_PROFILES || path.join(A.RUN, 'profiles');
const KEY_ID = 'd9749febd701c2fe';
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } };

function support(ui) {
  const spec = `support-${ui}`;
  let ctx = null, profile = null, node = null, password = '';
  const F = createFlows(spec, { win: () => ctx && ctx.win });
  const S = async name => { if (!ctx || !ctx.win || ctx.win.isClosed()) return; F.attachShot(await A.shot(ctx.win, name, spec)); };
  const w = () => ctx.win;
  const flow = (name, fn, opts = {}) => F.flow(name, async () => {
    const r = await fn();
    if (r) F.note('seen', A.redact(String(r)).slice(0, 600));
    if (opts.shot) await S(opts.shot);
  }, opts);

  test.describe.serial(`support ${ui} (${A.BUILD})`, () => {
    test.beforeAll(async () => {
      test.setTimeout(120 * 60 * 1000);
      expect(A.EXE, 'WINTEST_EXE must point at an unpacked EpicWallet.exe').toBeTruthy();
      await lock.acquire(`${spec}:${A.BUILD}`);
      await A.assertPortsFree();
      node = await startStubNode({ port: 13413, log: () => {} });
      profile = makeProfile(path.join(PROFILES, spec), 'wintest');
      if (ui === 'classic') {
        A.mkdirp(profile.epicGuiDir);
        fs.writeFileSync(path.join(profile.epicGuiDir, 'settings.json'), JSON.stringify({ schema: 1, app: { ui: 'classic', theme: 'dark', scale: 100, locale: '' } }, null, 2));
      }
      password = 'Sup-' + crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) + '-7';
      A.setSecrets({ passwords: [password] });
      ctx = await A.launch({ profile, logName: spec });
    });

    test.afterAll(async () => {
      await A.close(ctx);
      A.killBuildProcesses(A.EXE);
      if (node) await node.close();
      lock.release();
    });

    test(`support flows (${ui})`, async () => {
      test.setTimeout(30 * 60 * 1000);
      const root = profile.epicGuiDir;
      const out = A.mkdirp(path.join(A.RUN, 'support'));
      await flow('first start: Welcome', () => U.welcome(w()));
      F.gate('first start: Welcome');
      await flow('create a wallet', () => U.createWallet(w(), ui, password));
      F.gate('create a wallet');
      if (ui === 'modern') await flow('close the tour', async () => { try { return await U.skipTour(w(), ui); } finally { await require('../lib/ui').closeTour(w()); } });
      await flow('Settings: the stub node', async () => { await U.typeNodeAddress(w(), ui); return U.saveNode(w(), ui); });
      await flow('lock and unlock (the wallet processes log)', async () => {
        await U.lock(w(), ui);
        await U.unlock(w(), ui, password);
        await w().waitForTimeout(4000);
        return 'unlocked';
      });
      F.gate('lock and unlock (the wallet processes log)');

      await flow('log files: main.log, renderer.log, epic-wallet.log at Debug, bounded toml', async () => {
        const logs = fs.readdirSync(path.join(root, 'logs'));
        const main = read(path.join(root, 'logs', 'main.log'));
        const page = read(path.join(root, 'logs', 'renderer.log'));
        if (!/App starting: \d+\.\d+\.\d+.*win32/.test(main)) throw new Error('no start line in main.log');
        if (!/\[login\]/.test(page)) throw new Error('renderer.log has no [login] lines');
        const id = fs.readdirSync(path.join(root, 'wallets'))[0];
        const wdir = path.join(root, 'wallets', id);
        const toml = read(path.join(wdir, 'epic-wallet.toml'));
        for (const re of [/^log_to_file = true\r?$/m, /^file_log_level = "Debug"\r?$/m, /^log_max_size = 5242880\r?$/m, /^log_max_files = 4\r?$/m]) {
          if (!re.test(toml)) throw new Error('epic-wallet.toml lacks ' + re);
        }
        const wlog = read(path.join(wdir, 'epic-wallet.log'));
        if (!/ DEBUG /.test(wlog)) throw new Error('epic-wallet.log has no Debug lines (' + wlog.length + ' bytes)');
        for (const t of [main, page, wlog]) if (t.includes(password)) throw new Error('the password is in a log');
        for (const [n, f] of [['main.log', path.join(root, 'logs', 'main.log')], ['renderer.log', path.join(root, 'logs', 'renderer.log')], ['epic-wallet.log', path.join(wdir, 'epic-wallet.log')]]) {
          fs.copyFileSync(f, path.join(out, `${ui}-raw-${n}`));
        }
        return logs.join(', ') + '; ' + id + '/epic-wallet.log ' + wlog.length + ' B; raw logs hold the profile path: ' + (wlog.includes(profile.home) || page.includes(profile.home));
      });

      await flow('Help menu > Get help / Report a problem opens the dialog', async () => {
        const items = await ctx.app.evaluate(({ Menu, BrowserWindow }) => {
          const help = Menu.getApplicationMenu().items.find(i => i.label === 'Help');
          const item = help && help.submenu.items.find(i => i.id === 'support');
          if (item) item.click(undefined, BrowserWindow.getAllWindows()[0]);
          return help ? help.submenu.items.map(i => i.label) : [];
        });
        if (!items.includes('Get help / Report a problem…')) throw new Error('Help menu: ' + JSON.stringify(items));
        await w().locator('textarea:visible').waitFor({ state: 'visible', timeout: 8000 });
        return items.join(', ');
      });
      const DESC = 'rig: the wallet does not connect. Folder ' + root;
      await flow('Show what’s sent: cleaned logs, no profile path, no C:\\Users\\<name>, no user name', async () => {
        await w().locator('textarea:visible').fill(DESC);
        await w().getByText('Show what’s sent').first().click();
        await w().locator('pre').first().waitFor({ state: 'attached', timeout: 20000 });
        await w().waitForTimeout(800);
        const all = (await w().locator('pre').allTextContents()).join('\n');
        const quote = await w().locator('blockquote').first().innerText();
        const bad = [profile.home, profile.home.replace(/\\/g, '\\\\'), profile.home.replace(/\\/g, '/'), 'C:\\Users\\' + require('os').userInfo().username,
          '\\Users\\wintest', 'wintest', require('os').userInfo().username].filter(s => s && s.length > 2 && (all.toLowerCase().includes(s.toLowerCase()) || quote.toLowerCase().includes(s.toLowerCase())));
        if (bad.length) throw new Error('left in the preview: ' + bad.join(' | '));
        if (!/~\\\.epic-gui/.test(all + quote)) throw new Error('no ~\\.epic-gui in the cleaned text');
        const names = await w().locator('details summary').allTextContents();
        fs.writeFileSync(path.join(out, `${ui}-preview.txt`), quote + '\n\n' + all);
        return 'description: ' + quote + ' | ' + names.map(n => n.replace(/\s+/g, ' ').trim()).join(' | ');
      }, { shot: 'review' });
      await flow('Save encrypted report to a file', async () => {
        const target = path.join(profile.docs, 'report.epicsupport');
        await ctx.app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, target);
        await w().getByRole('button', { name: 'Save to file' }).click();
        await w().getByText('Saved: ' + target).first().waitFor({ state: 'visible', timeout: 20000 });
        const b = fs.readFileSync(target);
        if (b.subarray(0, 8).toString() !== 'EPICSUP1' || b.subarray(8, 16).toString('hex') !== KEY_ID) throw new Error('not sealed for ' + KEY_ID);
        if (b.includes(Buffer.from('does not connect'))) throw new Error('plaintext in the bundle');
        fs.copyFileSync(target, path.join(out, `${ui}-report.epicsupport`));
        return b.length + ' bytes, sealed';
      }, { shot: 'saved' });
      await flow('quit', async () => { await A.close(ctx); return 'closed'; });
    });
  });
}

support('modern');

