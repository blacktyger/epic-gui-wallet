/*
 * Smoke: the whole life of a new user's wallet, once per interface (E2E_UI = modern | classic).
 * Empty HOME -> Welcome -> create a wallet -> node set to the stub (typed key by key) -> lock, wrong
 * password, unlock (the listeners start against the stub) -> every page of the interface -> Send
 * validation (nothing sent) -> Receive (also with the listener stopped) -> lock / unlock ->
 * Menu › Quit -> no process of the app left.
 */
'use strict';
const H = require('../lib/harness');
const U = require('../lib/ui');

H.runCase('smoke', async (t) => {
  const ui = t.ui;
  const password = H.newPassword();
  const w = await t.launch();

  await t.step('first start: Welcome', () => U.welcome(w), { fatal: true });
  await t.step('create a wallet (24 words, then open it)', () => U.createWallet(w, ui, password), { fatal: true, timeout: 150000 });
  if (ui === 'modern') await t.step('the first-unlock tour can be skipped', () => U.skipTour(w, ui));

  //the default node is the public one, unreachable here: the stub first, so every page sees a synced node
  await t.step('Settings: type the node address key by key, both slashes stay', () => U.typeNodeAddress(w, ui), { fatal: true });
  await t.step('Settings: save; the wallet uses the stub node', () => U.saveNode(w, ui), { fatal: true, timeout: 90000 });

  /* ---- lock, a wrong password, unlock: the wallet now starts with a synced node ---- */
  await t.step(ui === 'modern' ? 'Lock wallet' : 'Log out', () => U.lock(w, ui), { fatal: true });
  await t.step('wrong password is refused', () => U.wrongPassword(w, ui, 'Not-the-password-1'));
  const mark = t.logLength();
  const outputCalls = () => Object.entries(t.node.counts).filter(([k]) => /get_unspent_outputs|get_outputs|get_pmmr_indices/.test(k)).reduce((n, [, v]) => n + v, 0);
  const callsBefore = outputCalls();
  await t.step('unlock with the right password', () => U.unlock(w, ui, password), { fatal: true, timeout: 120000 });
  await t.step('after unlock: the stub node, synced', () => ui === 'modern' ? U.waitNodeOnline(w, 30000) : U.waitText(w, /Node \(http:\/\/127\.0\.0\.1:13413\)/, 30000));
  //Modern: the HTTP listener is off until Start with wallet or Receive › Turn on (node-load); Classic starts it
  await t.step(ui === 'modern' ? 'after unlock: the HTTP listener stays off (Start with wallet is off)' : 'after unlock: the HTTP listener starts',
    () => t.waitLog(ui === 'modern' ? /\[login\] http listener not started \(Start with wallet is off\)/ : /\[login\] http listener started/, { from: mark, timeout: 30000 }));
  await t.step('after unlock: the wallet updates from the node', async () => {
    //the wallet's refresh reads its outputs from the node; the page must not fall back to the last known balance
    const calls = await H.waitFor(() => outputCalls() > callsBefore && outputCalls() - callsBefore, { timeout: 30000 });
    if (!calls) throw new Error('the wallet asked the node for no outputs after unlock');
    await w.waitForTimeout(1500);
    const stale = (await U.text(w)).match(/could not update from the node|Wallet API not reachable|node is not reachable/);
    if (stale) throw new Error('the page says: ' + stale[0]);
    const failed = t.logLines(/\[refresh\] (failed|wallet API|the wallet could not update)/, mark);
    if (failed.length) throw new Error(failed[0].slice(0, 300));
    return `${calls} output call(s) at the node since unlock; balance not stale`;
  });

  for (const page of U.PAGES[ui]) {
    await t.step(`page renders: ${page[0]}`, () => U.visit(w, ui, page));
  }
  //gear › "Epic wallet location" only opens the folder in the system's file manager: not followed
  if (ui === 'classic') await t.step('Run Setup Assistant: all steps, leave without saving', () => U.setupAssistant(w), { timeout: 90000 });

  /* ---- Send: validation only; the wallet has no funds and nothing may be sent ---- */
  await t.step('Send page opens', () => U.nav(w, ui, U.PAGES[ui].find((p) => p[1] === '/httpSend')), { fatal: true });
  const HTTP_TO = 'http://192.0.2.55:3415';   //TEST-NET-1: an http recipient that is valid but never reached
  const cases = [
    ['empty recipient', { to: '', amount: '1' }, /address field is required/i],
    ['not an address ("hello world")', { to: 'hello world', amount: '1' }, /Not an address the wallet can send to/],
    ['amount 0', { to: HTTP_TO, amount: '0' }, /amount must be more than 0/i],
    ['negative amount', { to: HTTP_TO, amount: '-5' }, /must be a number|more than 0/i],
    ['too many decimals (1.123456789)', { to: HTTP_TO, amount: '1.123456789' }, /at most 8 decimals/i],
    ['amount over the balance (5 of 0)', { to: HTTP_TO, amount: '5' }, /Not enough balance/i],
    ['huge amount (99999999999)', { to: HTTP_TO, amount: '99999999999' }, /Not enough balance/i],
  ];
  for (const [name, fields, want] of cases) {
    await t.step(`Send refuses: ${name}`, async () => {
      const r = await U.trySend(w, ui, fields);
      if (r.dialog) throw new Error('a review / confirm dialog opened: nothing should get that far');
      const said = r.errors.join(' | ');
      if (!want.test(said)) throw new Error(`expected ${want}; the form said [${said}]`);
      return `errors [${said}], send button ${r.enabled ? 'enabled (pressed: refused)' : 'disabled'}`;
    });
  }
  await t.step('Send: nothing was sent', async () => {
    const n = t.node.counts['POST /v2/foreign push_transaction'] || 0;
    if (n) throw new Error(`the stub node got ${n} push_transaction call(s)`);
    return 'no push_transaction at the node';
  });

  /* ---- Receive ---- */
  const addr = await t.step('Receive shows the Epic address', () => U.receiveAddress(w, ui));
  if (ui === 'modern') await t.step('Receive: Turn on starts the HTTP listener', () => U.startHttpListener(w));
  await t.step('Receive with the listener stopped: address still shown', async () => {
    const s = await U.stopListener(w, ui);
    await w.waitForTimeout(800);
    const a = await U.epicAddress(w);
    if (!a) throw new Error('no Epic address once the listener is off: ' + (await U.main(w)).slice(0, 300));
    if (addr && a !== addr) throw new Error('the address changed when the listener stopped');
    return `${s}; address ${a.slice(0, 10)}… still shown`;
  });

  /* ---- lock / unlock once more, quit ---- */
  await t.step(`${ui === 'modern' ? 'Lock wallet' : 'Log out'} again`, () => U.lock(w, ui), { fatal: true });
  await t.step('unlock again', () => U.unlock(w, ui, password), { fatal: true, timeout: 120000 });
  await t.step('the wallet API had no errors with the stub node', async () => {
    const bad = t.logLines(/wallet API error|Unable to parse|JSON decode error/);
    if (bad.length) throw new Error(bad.length + ' error line(s): ' + bad.slice(0, 3).map((l) => l.slice(0, 200)).join(' | '));
    return 'no "wallet API error" in the log';
  });
  await t.step('quit with the app\'s own Quit (Menu › Quit)', () => t.quit(), { fatal: true, timeout: 60000 });
  await t.step('no epic-wallet, epic or Electron process left after 10 s', () => t.assertNoLeftovers({ timeout: 10000 }), { timeout: 20000 });
});
