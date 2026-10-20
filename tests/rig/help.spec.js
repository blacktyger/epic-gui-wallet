// For the Windows rig (wintest-rig, suite/tests/help.spec.js; run with scripts/test-gate-windows.sh <sha> --specs help).
// Kept here until it is copied to the rig; it uses the rig's lib/ and is not run from this repo.
// Settings > Help on Windows (GUI feat/help-rework, the release after 6.1.5), Modern only (Classic is frozen), in a
// fresh throwaway profile. The same checks as the GUI repo's tests/e2e/specs/help.js (Linux, no network):
// stub node 127.0.0.1:13413 -> create a wallet -> node: the stub -> Settings > Help: topics in sections, folded ->
// search as you type with marks -> a match in the detail opens it -> Esc clears -> "/" focuses the search ->
// nothing found -> the handshake diagram steps and switches to the file way -> reduced motion: no travel ->
// light theme -> 150% interface scale: nothing overflows -> Polish: search "fraza" -> Persian: rtl, search ->
// English -> Menu > Quit -> nothing of the build left.
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
//the Epicbox server for this run: epicbox.epicnet.us first, then epicbox.stackwallet.com; never the official one by default
const EPICBOX = process.env.WINTEST_EPICBOX || 'epicbox.epicnet.us';
const waitFor = async (fn, { timeout = 30000 } = {}) => { const t0 = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t0 > timeout) return null; await new Promise(r => setTimeout(r, 250)); } };

function help(ui) {
  const spec = `help-${ui}`;
  let ctx = null, profile = null, node = null, password = '';
  const consoleErrs = [];
  const F = createFlows(spec, { win: () => ctx && ctx.win });
  const S = async name => { if (!ctx || !ctx.win || ctx.win.isClosed()) return; F.attachShot(await A.shot(ctx.win, name.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+$/, ''), spec)); };
  const w = () => ctx.win;
  const flow = (name, fn, opts = {}) => F.flow(name, async rec => {
    const before = consoleErrs.length;
    const r = await fn(rec);
    if (r) F.note('seen', A.redact(String(r)).slice(0, 400));
    await new Promise(res => setTimeout(res, 150));
    const bad = consoleErrs.slice(before).filter(e => !(opts.allowConsole || []).some(re => re.test(e)));
    if (bad.length) throw new Error('console errors: ' + bad.map(e => e.slice(0, 300)).join(' | '));
    if (opts.shot) {
      //toasts fade after a few seconds: wait so they cover nothing
      await waitFor(async () => (await w().locator('.c-toast').count()) === 0, { timeout: 12000 });
      await S(opts.shot);
    }
  }, opts);

  const topics = () => w().locator('article.e-hlp-topic');
  const search = () => w().locator('#stg-help-q');
  const openHelp = () => U.nav(w(), ui, U.PAGES.modern.find(p => p[1] === '/help'));
  const marks = () => w().locator('article.e-hlp-topic mark').count();
  async function setLanguage(code) {
    await U.openSettings(w(), ui);
    await w().locator('#stg-lang').selectOption(code);
    await w().locator('.e-stg-savebar button.e-btn-primary').click({ timeout: 8000 });
    const want = code === 'cz' ? 'cs' : code;
    const a = await waitFor(async () => { const x = await w().evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir })); return x.lang === want ? x : null; }, { timeout: 30000 });
    if (!a) throw new Error('html lang did not become ' + want);
    return a;
  }

  test.describe.serial(`help ${ui} (${A.BUILD})`, () => {
    test.beforeAll(async () => {
      test.setTimeout(120 * 60 * 1000);
      expect(A.EXE, 'WINTEST_EXE must point at an unpacked EpicWallet.exe').toBeTruthy();
      await lock.acquire(`${spec}:${A.BUILD}`);
      await A.assertPortsFree();
      const nlog = path.join(A.mkdirp(path.join(A.RUN, 'logs')), `${spec}.stub-node.log`);
      node = await startStubNode({ port: 13413, log: l => fs.appendFileSync(nlog, `${new Date().toISOString().slice(11, 23)} ${l}\n`) });
      profile = makeProfile(path.join(PROFILES, spec), 'wintest');
      password = 'Help-' + crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) + '-7';
      A.setSecrets({ passwords: [password] });
      ctx = await A.launch({ profile, logName: spec });
      const watch = win => {
        win.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
        win.on('pageerror', e => consoleErrs.push('uncaught: ' + e.message));
      };
      watch(ctx.win); ctx.app.on('window', watch);
    });

    test.afterAll(async () => {
      await A.close(ctx);
      A.killBuildProcesses(A.EXE);
      if (node) await node.close();
      lock.release();
    });

    test(`help flows (${ui})`, async () => {
      test.setTimeout(30 * 60 * 1000);
      await flow('first start: Welcome', () => U.welcome(w()));
      F.gate('first start: Welcome');
      await flow('create a wallet', () => U.createWallet(w(), ui, password));
      F.gate('create a wallet');
      await flow('the tour can be skipped', async () => {
        try { return await U.skipTour(w(), ui); } finally { await require('../lib/ui').closeTour(w()); }
      });
      //BT Labs' rule: no load on the official Epic servers. The node is the local stub; Epicbox: epicbox.epicnet.us
      //(no BT Labs mainnet Epicbox), saved together before anything else
      await flow('node: the stub, Epicbox: ' + EPICBOX + ' (Settings > Save checks the node)', async () => {
        await U.typeNodeAddress(w(), ui);
        await w().locator('#stg-relay').fill(EPICBOX);
        await U.saveNode(w(), ui);
        return 'node ' + U.NODE_URL + ', Epicbox ' + (await w().locator('#stg-relay').inputValue());
      });
      F.gate('node: the stub, Epicbox: ' + EPICBOX + ' (Settings > Save checks the node)');

      await flow('Settings > Help: every topic in its section, folded', async () => {
        await openHelp();
        const n = await topics().count();
        const secs = await w().locator('.e-hlp-sec').allInnerTexts();
        const open = await w().locator('.e-hlp-more[aria-expanded="true"]').count();
        if (n < 12 || secs.length < 4 || open) throw new Error(`${n} topics, ${secs.length} sections, ${open} open`);
        return `${n} topics in ${secs.length} sections`;
      }, { shot: 'help-dark' });
      F.gate('Settings > Help: every topic in its section, folded');
      await flow('typing filters at once and marks the words', async () => {
        await search().fill('confirmations');
        const id = await topics().first().getAttribute('id');
        const m = await marks();
        const status = await w().locator('#stg-help-n').innerText();
        if (id !== 'help-confirmations' || !m || !/\d/.test(status)) throw new Error(`first ${id}, marks ${m}, "${status}"`);
        return `${await topics().count()} topics, ${m} marks, "${status}"`;
      }, { shot: 'search-confirmations' });
      await flow('a word only in the detail opens the fold', async () => {
        await search().fill('change output');
        const open = await w().locator('article.e-hlp-topic .e-hlp-more[aria-expanded="true"]').count();
        const marked = await w().locator('.e-hlp-body mark').count();
        if (!open || !marked) throw new Error(`open ${open}, marks in a detail ${marked}`);
        return `${open} open, ${marked} marks`;
      }, { shot: 'search-detail' });
      await flow('Esc clears the search', async () => {
        await search().press('Escape');
        if (await search().inputValue() || await marks()) throw new Error('not cleared');
        return `${await topics().count()} topics`;
      });
      await flow('"/" focuses the search', async () => {
        await w().locator('.e-hlp-sec').first().click();
        await w().keyboard.press('/');
        const id = await w().evaluate(() => document.activeElement && document.activeElement.id);
        if (id !== 'stg-help-q') throw new Error('focus on ' + id);
        return 'focused';
      });
      await flow('nothing found: says so', async () => {
        await search().fill('qqzzxx');
        const n = await topics().count();
        const status = await w().locator('#stg-help-n').innerText();
        await search().fill('');
        if (n || !/qqzzxx/.test(status)) throw new Error(`${n} topics, "${status}"`);
        return status;
      });
      await flow('the handshake diagram steps and switches to the file way', async () => {
        const t = w().locator('#help-both-sides');
        await t.locator('.e-hlp-more').click();
        const cap = () => t.locator('.hs-cap').innerText();
        const first = await cap();
        await t.locator('.hs-nav button').nth(1).click();
        if (first === await cap()) throw new Error('caption did not change');
        await t.locator('.hs-flows button').nth(1).click();
        if ((await t.locator('.hs-flows button').nth(1).getAttribute('aria-pressed')) !== 'true') throw new Error('file way not pressed');
        await t.locator('figure.hs').scrollIntoViewIfNeeded();
        return await cap();
      }, { shot: 'handshake' });
      await flow('reduced motion: the dot does not travel', async () => {
        await w().emulateMedia({ reducedMotion: 'reduce' });
        await w().locator('#help-both-sides .hs-nav button').nth(1).click();
        const anim = await w().evaluate(() => { const d = document.querySelector('#help-both-sides .hs-dot'); return d ? getComputedStyle(d).animationName : 'no dot'; });
        await w().emulateMedia({ reducedMotion: 'no-preference' });
        if (anim !== 'none') throw new Error('animation ' + anim);
        return anim;
      });
      await flow('light theme', async () => {
        await w().evaluate(() => { document.documentElement.dataset.theme = 'light'; });
        return 'light';
      }, { shot: 'handshake-light' });
      await flow('150% interface scale: nothing of Help overflows', async () => {
        await w().evaluate(() => { document.documentElement.style.fontSize = (150 * 1.0625) + '%'; });
        await search().fill('epicbox');
        await w().waitForTimeout(500);
        const over = await w().evaluate(() => [...document.querySelectorAll('.e-hlp-topic, .e-hlp-body, .hs, .e-stg-search')]
          .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className + ' ' + e.scrollWidth + '>' + e.clientWidth));
        if (over.length) throw new Error('overflow: ' + over.join('; '));
        return 'nothing overflows';
      }, { shot: 'scale-150-light' });
      await flow('back to 100%, dark', async () => {
        await search().fill('');
        await w().evaluate(() => { document.documentElement.style.fontSize = ''; document.documentElement.dataset.theme = 'dark'; });
        return 'ok';
      });

      await flow('Polish: the help and its search are in Polish', async () => {
        await setLanguage('pl');
        await openHelp();
        await search().fill('fraza');
        const id = await topics().first().getAttribute('id');
        const m = await marks();
        if (id !== 'help-phrase' || !m) throw new Error(`first ${id}, marks ${m}`);
        return `${await w().locator('label[for="stg-help-q"]').innerText()}: ${await topics().count()} topics`;
      }, { shot: 'pl-search' });
      await flow('Persian: right to left, the search works', async () => {
        const a = await setLanguage('fa');
        if (a.dir !== 'rtl') throw new Error('dir ' + a.dir);
        await openHelp();
        const title = await topics().first().locator('h4').innerText();
        await search().fill(title.split(/\s+/)[0]);
        if (!(await marks())) throw new Error('no marks for ' + title);
        return title;
      }, { shot: 'fa-search' });
      await flow('back to English', () => setLanguage('en'));

      await flow('Menu > Quit; nothing of the build left after 10 s', async () => {
        await ctx.app.evaluate(({ app }) => { app.quit(); });
        await new Promise(r => setTimeout(r, 10000));
        const left = A.buildProcesses ? A.buildProcesses(A.EXE) : [];
        if (left && left.length) throw new Error('left: ' + left.map(p => p.name || p).join(', '));
        ctx = null;
        return 'none left';
      });
    });
  });
}

//Modern only: Classic is frozen (2026-10-20)
help('modern');
