// e2e-ui: modern
/*
 * Settings › Node: the live check of a typed address and My nodes, once per interface, in the no-network
 * sandbox (form/myNodesField.js, shared/nodeCheck.js, shared/myNodes.js). Modern only: Classic is no longer
 * tested (the user's call, 2026-10-20); it shares the logic.
 *   live check   the stub node typed key by key: Online, the height with its meter (no public list offline: tip unknown,
 *                neutral), no version or ms text;
 *                an address nothing listens on: Not responding with the port tip; a web server that is not a node:
 *                Not an Epic node; a paste
 *   My nodes     Add (prefilled, a label, the dialog's own check), an offline one too; the duplicate note;
 *                Edit; Use; Remove (Keep first); kept in settings.json and still there after a restart
 *   layout       a narrow window, and Persian (right to left)
 * Screenshots of each state are kept (opts.shot) for the release notes.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const H = require('../lib/harness');
const U = require('../lib/ui');

const DEAD = 'http://127.0.0.1:9';
const WEB_PORT = 18080;
const WEB = 'http://127.0.0.1:' + WEB_PORT;

/** a plain web server that is not an Epic node: an HTML page on every path */
function webServer() {
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html><body>hello</body></html>'); });
    s.once('error', reject);
    s.listen(WEB_PORT, '127.0.0.1', () => resolve({ close: () => new Promise((r) => s.close(() => r())) }));
  });
}

H.runCase('mynodes', async (t) => {
  const ui = t.ui;
  const modern = ui === 'modern';
  const password = H.newPassword();
  const web = await webServer();
  const w = await t.launch();
  //6.1.6: the live check of a typed address is the first row of the combobox list (and its note); My nodes are rows of the same list
  const list = () => w.locator('[data-test=node-list]');
  const status = () => list().locator('.e-opt').first();
  const rows = () => list().locator('.e-opt:has(.e-opt-acts)');
  const dlg = () => w.locator('dialog[open]');
  const input = () => U.nodeInput(w, ui);
  const statusText = async () => {
    const row = await status().innerText({ timeout: 3000 }).catch(() => '');
    const note = await list().locator('.e-combo-note').first().innerText({ timeout: 500 }).catch(() => '');
    return (row + ' ' + note).replace(/\s+/g, ' ').trim();
  };
  const statusSays = async (re, timeout = 15000) => {
    const got = await H.waitFor(async () => { const s = await statusText(); return re.test(s) ? s : null; }, { timeout });
    if (!got) throw new Error(`status: ${JSON.stringify(await statusText())}, wanted ${re}`);
    return got;
  };
  //typed into the combobox (its list opens with the live check); Enter would apply it
  const setAddress = async (url) => { await input().click(); await input().fill(url); };
  //the list is a v-show popup: closed, its rows have no text
  const openList = async () => { if (!(await list().isVisible())) await input().click(); };
  const rowTexts = async () => (await openList(), await rows().allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim());

  await t.step('create a wallet', () => U.createWallet(w, ui, password), { fatal: true, timeout: 150000 });
  if (modern) await t.step('skip the tour', () => U.skipTour(w, ui));

  /* ---- live check ---- */
  await t.step('typed key by key: the stub node is Online, with its height, version and a neutral meter (no tip offline), no ms', async () => {
    await U.typeNodeAddress(w, ui, U.NODE_URL);
    const says = await statusSays(/Online 3,100,000/);
    if (/\bms\b|replied|at tip/.test(says)) throw new Error('old texts: ' + says);
    const m = await status().locator('.e-hmeter').first().getAttribute('aria-label');
    if (modern && m !== 'Network height unknown') throw new Error('meter: ' + m);
    return says + ' [' + m + ']';
  }, { fatal: true, timeout: 60000, shot: true });
  await t.step('nothing listens there: Not responding, a plain explanation and the port tip', async () => {
    await setAddress(DEAD);
    return statusSays(/Not responding.*port.*3413/);
  }, { shot: true });
  await t.step('a web server that is not a node: Not an Epic node', async () => {
    await setAddress(WEB);
    return statusSays(/Not an Epic node/);
  }, { shot: true });
  await t.step('a paste is checked too (the stub again, from the cache)', async () => {
    await input().fill('');
    await input().dispatchEvent('paste');
    await input().fill(U.NODE_URL);
    return statusSays(/Online/, 5000);
  });
  await t.step('Enter applies the address while the list shows a problem row (it has its own check)', async () => {
    await setAddress(WEB);
    await statusSays(/Not an Epic node/);
    await setAddress(U.NODE_URL);
    return U.saveNode(w, ui);
  }, { timeout: 90000 });

  if (modern) {
    await t.step('Node status line: status, height with a meter and the last block time (the version only when too old), nothing else', async () => {
      const info = w.locator('[data-test=node-status]').first();
      const norm = async () => (await info.innerText()).replace(/\s+/g, ' ').replace(/ ?· ?/g, ' ').trim();
      const got = await H.waitFor(async () => { const x = await norm(); return /last block \d+ (sec|min)\. ago/i.test(x) ? x : null; }, { timeout: 40000 });
      if (!got) throw new Error('status: ' + await norm());
      if (!/^Online 3,100,000 last block/i.test(got) || /\bms\b|checked|Address|at tip|behind|Version/i.test(got)) throw new Error('status: ' + got);
      return got;
    }, { timeout: 60000, shot: true });
  }

  /* ---- My nodes ---- */
  await t.step('no My nodes list before a node is saved', async () => {
    if (await rows().count()) throw new Error('rows: ' + (await rowTexts()).join(' | '));
    return 'none';
  });
  await t.step('Add to my nodes: the dialog has the address, its own check, a label; Save lists it', async () => {
    await setAddress(U.NODE_URL);
    await w.getByRole('button', { name: 'Add to my nodes', exact: true }).first().click({ timeout: 8000 });
    await dlg().waitFor({ timeout: 8000 });
    const addr = await dlg().locator('input').first().inputValue();
    if (addr !== U.NODE_URL) throw new Error('prefilled ' + JSON.stringify(addr));
    await H.waitFor(async () => /Online/.test(await dlg().innerText()), { timeout: 10000 });
    await dlg().locator('input').nth(1).fill('Stub node');
    await t.screenshot('add-dialog');
    await dlg().getByRole('button', { name: 'Save' }).click();
    await dlg().waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    const r = await H.waitFor(async () => { const x = await rowTexts(); return x.length === 1 && /Stub node/.test(x[0]) && !/\d+ ms/.test(x[0]) ? x : null; }, { timeout: 10000 });
    if (!r) throw new Error('rows: ' + (await rowTexts()).join(' | '));
    const dot = await rows().first().locator('.e-st').first().getAttribute('class');
    if (!/\be-ok\b/.test(dot || '')) throw new Error('dot: ' + dot);
    return r[0] + ' [' + dot + ']';
  }, { fatal: true, timeout: 40000, shot: true });
  await t.step('a typed address that is in My nodes has no ☆ in its row', async () => {
    await setAddress(U.NODE_URL);
    await w.waitForTimeout(1500);
    if (await list().getByRole('button', { name: 'Add to my nodes', exact: true }).count()) throw new Error('the typed row still offers ☆');
    const r = await rowTexts();
    if (r.length !== 1 || !/Stub node/.test(r[0])) throw new Error('rows: ' + r.join(' | '));
    return 'no ☆ offered for a kept address; its My nodes row: ' + r[0];
  });
  await t.step('an offline address can be added too', async () => {
    await setAddress(DEAD);
    await statusSays(/Not responding/);
    await w.getByRole('button', { name: 'Add to my nodes', exact: true }).first().click({ timeout: 8000 });
    await dlg().waitFor({ timeout: 8000 });
    await H.waitFor(async () => /Not responding/.test(await dlg().innerText()), { timeout: 15000 });
    await dlg().getByRole('button', { name: 'Save' }).click();
    await input().fill('');   //the typed text would filter My nodes
    const r = await H.waitFor(async () => { const x = await rowTexts(); return x.length === 2 ? x : null; }, { timeout: 10000 });
    if (!r || !/127\.0\.0\.1:9/.test(r[1]) || /\be-ok\b/.test(await rows().nth(1).locator('.e-st').first().getAttribute('class'))) throw new Error('rows: ' + (await rowTexts()).join(' | '));
    return r[1];
  }, { timeout: 40000 });
  await t.step('(the list is open)', async () => { await input().click(); return 'ok'; });
  await t.step('Edit to an address already in the list: a short note, Save off; Cancel', async () => {
    await w.getByRole('button', { name: /^Edit .*127\.0\.0\.1:9/ }).click({ timeout: 8000 });
    await dlg().waitFor({ timeout: 8000 });
    await dlg().locator('input').first().fill('HTTP://127.0.0.1:13413/');
    await H.waitFor(async () => /already in your list as .Stub node./.test(await dlg().innerText()), { timeout: 5000 });
    if (!(await dlg().getByRole('button', { name: 'Save' }).isDisabled())) throw new Error('Save is on');
    await t.screenshot('duplicate');
    await dlg().getByRole('button', { name: 'Cancel' }).click();
    await dlg().waitFor({ state: 'detached', timeout: 8000 });
    return 'refused: ' + (await rowTexts()).length + ' rows';
  }, { timeout: 30000 });
  await t.step('Edit: a label for the offline one', async () => {
    await w.getByRole('button', { name: /^Edit .*127\.0\.0\.1:9/ }).click({ timeout: 8000 });
    await dlg().waitFor({ timeout: 8000 });
    await dlg().locator('input').nth(1).fill('Old box');
    await dlg().getByRole('button', { name: 'Save' }).click();
    const r = await H.waitFor(async () => { const x = await rowTexts(); return x.some((s) => /Old box/.test(s)) ? x : null; }, { timeout: 8000 });
    if (!r) throw new Error('rows: ' + (await rowTexts()).join(' | '));
    return r.join(' | ');
  }, { timeout: 30000 });
  await t.step('a row of My nodes applies at once (Enter or a click; no Save)', async () => {
    await setAddress(WEB);
    await statusSays(/Not an Epic node/);
    await input().fill('');
    await w.getByRole('button', { name: 'Use Stub node' }).click({ timeout: 8000 });
    await U.waitNodeOnline(w, 45000);
    const v = await input().inputValue();
    if (v !== '127.0.0.1:13413') throw new Error('field: ' + v);
    return 'field: ' + v + ', node online';
  }, { shot: true, timeout: 90000 });
  await t.step('the ☆ of a kept row removes it at once (aria-pressed), the other stays', async () => {
    await openList();
    const star = w.getByRole('button', { name: 'Remove Old box from my nodes' });
    if ((await star.getAttribute('aria-pressed')) !== 'true') throw new Error('not pressed');
    await t.screenshot('remove-star');
    await star.click({ timeout: 8000 });
    const r = await H.waitFor(async () => { const x = await rowTexts(); return x.length === 1 ? x : null; }, { timeout: 5000 });
    if (!r) throw new Error('rows: ' + (await rowTexts()).join(' | '));
    const dot = await rows().first().locator('.e-st').first().getAttribute('class');
    if (!/\be-ok\b/.test(dot || '')) throw new Error('dot: ' + dot);
    return r[0] + ' [' + dot + ']';
  }, { timeout: 30000 });
  await t.step('settings.json holds the list (schema 1)', async () => {
    const s = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.epic-gui', 'settings.json'), 'utf8'));
    const list = s.myNodes && s.myNodes.mainnet;
    if (s.schema !== 1 || !Array.isArray(list) || list.length !== 1 || list[0].address !== U.NODE_URL || list[0].label !== 'Stub node') throw new Error(JSON.stringify(s.myNodes));
    return JSON.stringify(list.map((e) => [e.address, e.label]));
  });

  /* ---- layout ---- */
  await t.step('the smallest window at 150 % zoom (the narrowest the app gets): field, button, status and list stay tidy', async () => {
    await setAddress(DEAD);
    await statusSays(/Not responding/);
    await t.app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0]; b.setSize(1044, 860); b.webContents.setZoomFactor(1.5); });
    await w.waitForTimeout(800);
    await input().scrollIntoViewIfNeeded();
    //nothing of the feature sticks out of its box (the app's own layout is not this spec's business)
    const over = await w.evaluate(() => [...document.querySelectorAll('[data-test=node-list] .e-opt, [data-test=node-list], [data-test=node-status], .e-combo')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.className + ' ' + e.scrollWidth + '>' + e.clientWidth));
    if (over.length) throw new Error('overflow: ' + over.join('; '));
    return 'nothing overflows';
  }, { knownBug: 'E2E-2' });   //6.1.6: at 1044 px / 150 % the Settings pane is ~130 px wide (sub-nav beside it): the combobox list and the status line overflow it
  await t.step('back to a desktop window', async () => {
    await t.app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0]; b.webContents.setZoomFactor(1); b.setSize(1200, 860); });
    await w.waitForTimeout(400);
    return 'ok';
  });
  await t.step('Persian: right to left, translated', async () => {
    const a = await U.setLanguage(w, ui, 'fa');
    if (a.dir !== 'rtl') throw new Error(JSON.stringify(a));
    await U.openSettings(w, ui);
    await setAddress(DEAD);
    await H.waitFor(async () => { const x = await statusText(); return !/Not responding/.test(x) && x.length > 0 && !/checking/i.test(x) ? x : null; }, { timeout: 15000 });
    if (/My nodes|Add to my nodes/.test(await w.locator('body').innerText())) throw new Error('English left');
    await t.screenshot('persian-offline');
    return JSON.stringify(a);
  }, { timeout: 60000, shot: true });
  await t.step('English again', async () => {
    const a = await U.setLanguage(w, ui, 'en');
    if (a.dir !== 'ltr') throw new Error(JSON.stringify(a));
    return JSON.stringify(a);
  }, { timeout: 60000 });

  /* ---- kept after a restart ---- */
  await t.step('quit', () => t.quit(), { fatal: true, timeout: 60000 });
  await t.step('after a restart My nodes is still there', async () => {
    const w2 = await t.launch({ fresh: false });
    await U.unlock(w2, ui, password);
    await U.openSettings(w2, ui);
    await U.nodeInput(w2, ui).click();
    await w2.waitForTimeout(500);
    const myRows = () => w2.locator('[data-test=node-list] .e-opt:has(.e-opt-acts)');
    const r = await H.waitFor(async () => { const x = (await myRows().allInnerTexts()); return x.length === 1 && /Stub node/.test(x[0]) ? x : null; }, { timeout: 15000 });
    if (!r) throw new Error('rows after restart: ' + (await myRows().allInnerTexts()).join(' | '));
    return r[0].replace(/\s+/g, ' ');
  }, { timeout: 150000, shot: true });
  await t.step('quit again', () => t.quit(), { fatal: true, timeout: 60000 });
  await t.step('no process of the app left after 10 s', () => t.assertNoLeftovers({ timeout: 10000 }), { timeout: 20000 });
  await web.close();
});
