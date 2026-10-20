/*
 * Checks ported from the QA drivers that need no funds and no network, once per interface:
 *   version     the window title and About say this build's version (s14, 6.1.4)
 *   contacts    an empty contact and a bad Epicbox address are refused, a good one is listed (s6, QA T04)
 *   unlock      an empty password is refused (s8)
 *   busy port   3415 held by another program: Receive says so, Try again works once it is free (s14, W01)
 *   language    Persian sets <html dir=rtl lang=fa>, English sets it back (s14, QA T26)
 * then Menu › Quit and no process left.
 */
'use strict';
const net = require('net');
const H = require('../lib/harness');
const U = require('../lib/ui');
const { version } = require('../../../package.json');

/** A dummy TCP server on 0.0.0.0:port inside the sandbox (stands for another program on the port). */
function occupy(port) {
  return new Promise((resolve, reject) => {
    const s = net.createServer((c) => c.end('e2e-dummy\n'));
    s.once('error', reject);
    s.listen(port, '0.0.0.0', () => resolve({ close: () => new Promise((r) => s.close(() => r())) }));
  });
}

H.runCase('checks', async (t) => {
  const ui = t.ui;
  const password = H.newPassword();
  //known bug E2E-1, see the end: may show up in any step after Receive was left with a start pending
  const E2E_1 = /this\.\$t is not a function/;
  const w = await t.launch();

  //public/index.html carries the version by hand; Modern sets its own page titles, so there it is the sidebar's
  await t.step(ui === 'modern' ? `sidebar says Wallet ${version}` : `window title says v${version}`, async () => {
    const want = ui === 'modern' ? `Wallet ${version}` : `v${version}`;
    const read = () => (ui === 'modern' ? w.locator('.e-side-version, .e-welcome-ver, body').first().innerText() : t.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()));
    const got = await H.waitFor(async () => { const x = await read(); return x.includes(want) ? x : null; }, { timeout: 15000 });
    if (!got) throw new Error(`no "${want}" in: ${String(await read()).slice(0, 200)}`);
    return ui === 'modern' ? want : got;
  });
  await t.step('create a wallet', () => U.createWallet(w, ui, password), { fatal: true, timeout: 150000 });
  if (ui === 'modern') await t.step('skip the tour', () => U.skipTour(w, ui));
  await t.step('node: the stub', async () => {
    await U.openSettings(w, ui);
    if (ui === 'modern') await w.getByText('External node server', { exact: true }).first().click();
    else await w.locator('section.is-main-section select').first().selectOption('external');
    await w.locator(ui === 'modern' ? '#e-nodeserverField-1-a' : 'section.is-main-section input.input').first().fill(U.NODE_URL);
    return U.saveNode(w, ui);
  }, { fatal: true, timeout: 90000 });
  await t.step(`About shows ${version}`, async () => {
    await U.nav(w, ui, U.PAGES[ui].find((p) => p[1] === '/about'));
    return U.waitText(w, new RegExp('v?' + version.replace(/\./g, '\\.') + '(?![\\d.])'), 8000);
  });

  /* ---- contacts ---- */
  await t.step('Contacts: open', () => U.nav(w, ui, U.PAGES[ui].find((p) => p[1] === '/addressBook')), { fatal: true });
  await t.step('Contacts: an empty contact is refused', async () => {
    const seen = await U.addContact(w, ui, {});
    if (!seen.some((x) => /Give the contact a name/.test(x))) throw new Error('toasts: [' + seen.join(' | ') + ']');
    const n = await U.contactNames(w, ui);
    if (n.length) throw new Error('listed anyway: ' + n.join(', '));
    await U.cancelContact(w, ui);
    return seen.join(' | ');
  });
  await t.step('Contacts: a bad Epicbox address is refused', async () => {
    const seen = await U.addContact(w, ui, { name: 'Bad Bob', epicbox: 'not an address!!' });
    if (!seen.some((x) => /not a valid Epicbox address/.test(x))) throw new Error('toasts: [' + seen.join(' | ') + ']');
    if ((await U.contactNames(w, ui)).includes('Bad Bob')) throw new Error('"Bad Bob" was saved');
    await U.cancelContact(w, ui);
    return seen.join(' | ');
  });
  await t.step('Contacts: a valid contact is saved and listed', async () => {
    const addr = 'esYmsDGgwGPf5D6KPAW3j3jMbQojJ1UKwr44RwiEG7AZkV8V7uWh@epicbox.epiccash.com';
    const seen = await U.addContact(w, ui, { name: 'Alice E2E', epicbox: addr });
    const n = await H.waitFor(async () => { const x = await U.contactNames(w, ui); return x.includes('Alice E2E') ? x : null; }, { timeout: 8000 });
    if (!n) throw new Error('not listed: [' + (await U.contactNames(w, ui)).join(', ') + '] toasts [' + seen.join(' | ') + ']');
    return 'listed: ' + n.join(', ');
  });

  /* ---- unlock: empty password; busy port 3415 ---- */
  await t.step('lock', () => U.lock(w, ui), { fatal: true });
  await t.step('an empty password is refused', async () => {
    await w.locator('input[type=password]').first().fill('');
    const b = w.getByRole('button', { name: /^(Unlock|Login)$/ }).first();
    if (!(await b.isDisabled())) await b.click();
    await w.waitForTimeout(1500);
    if (!/login/.test(await U.route(w))) throw new Error('left the unlock screen: ' + await U.route(w));
    return 'still on the unlock screen';
  });
  let dummy = await t.step('another program holds port 3415', () => occupy(3415), { fatal: true });
  await t.step('unlock with 3415 busy', () => U.unlock(w, ui, password), { fatal: true, timeout: 120000 });
  if (ui === 'modern') await t.step('no tour after the second unlock', async () => ((await w.locator('#e-tour-t').count()) ? U.skipTour(w, ui) : 'none'));
  //Try again shows only while Epicbox listens; Epicbox can't connect here (no network), so the
  //listener is started again with Start listener (Modern) / Start (Classic), as a user would
  const retry = () => w.getByRole('button', { name: 'Try again' }).or(w.getByRole('link', { name: 'Try again' }))
    .or(w.getByRole('button', { name: ui === 'modern' ? 'Start listener' : /^Start( listener)?$/ })).first();
  await t.step('Receive: HTTP not receiving, port 3415 named', async () => {
    await U.nav(w, ui, U.PAGES[ui].find((p) => p[1] === '/httpReceive'));
    const s = await U.waitText(w, /port 3415 (is )?used by another program[^.]*\./i, 45000);
    await retry().waitFor({ timeout: 5000 });
    return s;
  }, { timeout: 60000, allowConsole: [E2E_1] });
  await t.step('free the port, start again: HTTP receives on 3415', async () => {
    await dummy.close(); dummy = null;
    const how = (await retry().innerText()).trim();
    await retry().click();
    const ok = await H.waitFor(async () => !/port 3415 (is )?used by another program/i.test(await U.text(w)), { timeout: 30000 });
    if (!ok) throw new Error('still says the port is used: ' + (await U.main(w)).slice(0, 300));
    const listening = await H.waitFor(() => new Promise((r) => { const c = net.connect(3415, '127.0.0.1'); c.on('connect', () => { c.destroy(); r(true); }); c.on('error', () => r(false)); }), { timeout: 15000 });
    if (!listening) throw new Error('nothing listens on 3415 after ' + how);
    return `"${how}": the message is gone and the wallet listens on 3415`;
  }, { timeout: 60000, allowConsole: [E2E_1] });

  //E2E-1 (below): start the listener and leave Receive at once, so its start is still pending when
  //the page goes. Every time in Classic; Modern's Start often reuses the Epicbox listener of the
  //login, which settles at once, so there it shows about every other run
  await t.step('Receive: Start listener, then leave the page at once', async () => {
    await U.stopListener(w, ui);
    await w.getByRole('button', { name: ui === 'modern' ? 'Start listener' : /^Start( listener)?$/ }).first().click();
    await U.nav(w, ui, U.PAGES[ui][0]);
    return 'on ' + await U.route(w);
  }, { allowConsole: [E2E_1] });

  /* ---- language: Persian is right-to-left ---- */
  await t.step('Persian: <html dir=rtl lang=fa>', async () => {
    const a = await U.setLanguage(w, ui, 'fa');
    if (a.dir !== 'rtl') throw new Error(JSON.stringify(a));
    return JSON.stringify(a);
  }, { timeout: 60000, allowConsole: [E2E_1] });
  await t.step('English again: <html dir=ltr lang=en>', async () => {
    const a = await U.setLanguage(w, ui, 'en');
    if (a.dir !== 'ltr') throw new Error(JSON.stringify(a));
    return JSON.stringify(a);
  }, { timeout: 60000, allowConsole: [E2E_1] });

  /*
   * Known bug E2E-1: Receive's start() (src/components/HttpReceive.vue, also behind Modern's Receive)
   * awaits the Epicbox start, which stays pending while the relay can't be reached. When the page
   * was left meanwhile and the start then settles (the next Epicbox job, e.g. the Settings save of the
   * language steps, its 45 s timeout, or quit), it calls this.$t on the unmounted component:
   * "TypeError: this.$t is not a function at Proxy.start". Set up by "Start listener, then leave".
   */
  await t.step('quit (Menu › Quit)', () => t.quit(), { fatal: true, timeout: 60000, allowConsole: [E2E_1] });
  await t.step('no TypeError from Receive\'s pending start once the page was left', async () => {
    const hit = t.logLines(E2E_1);
    if (hit.length) throw new Error(hit[0].replace(/^\[[^\]]+\] /, '').slice(0, 200));
    return 'none';
  }, { knownBug: 'E2E-1', intermittent: ui === 'modern' });
  await t.step('no process of the app left after 10 s', () => t.assertNoLeftovers({ timeout: 10000 }), { timeout: 20000 });
  if (dummy) await dummy.close();
});
