// e2e-ui: modern
/*
 * Sidebar links (Modern, tester item #37): Node and Receiving open Settings › Node at #node / Receiving at
 * #epicbox (scrolled, flashed, focus inside), the wallet row opens Settings › Wallet, by click and by
 * keyboard, from another page and with Settings already open; Lock stays a lock button.
 */
'use strict';
const H = require('../lib/harness');
const U = require('../lib/ui');

H.runCase('sidebar', async (t) => {
  const ui = t.ui;
  const password = H.newPassword();
  const w = await t.launch();
  await t.step('first start: Welcome', () => U.welcome(w), { fatal: true });
  await t.step('create a wallet', () => U.createWallet(w, ui, password), { fatal: true, timeout: 150000 });
  await t.step('the first-unlock tour can be skipped', () => U.skipTour(w, ui));

  const svc = (name) => w.locator(name === 'Node' ? '[data-test=svc-node]' : '[data-test=svc-rcv]');
  const wallet = () => w.locator('a.e-account-link').first();
  const active = () => w.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
  const hash = () => w.evaluate(() => location.pathname + location.hash);
  const flashing = () => w.evaluate(() => !!document.querySelector('.e-jump-flash'));
  const settle = () => w.waitForTimeout(900);
  const expectFocus = async (id, label) => {
    const got = await H.waitFor(async () => (await active()) === id, { timeout: 5000 });
    if (!got) throw new Error(`${label}: focus is on ${await active()}, not ${id}`);
  };
  const scrolled = async (id) => w.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return r.top >= -2 && r.top < window.innerHeight; }, id);

  await t.step('labels: "Open node settings", "Open Receiving settings", "Open wallet settings"', async () => {
    const a = [await svc('Node').getAttribute('aria-label'), await svc('Receiving').getAttribute('aria-label'), await wallet().getAttribute('aria-label')];
    if (!/^Open node settings/.test(a[0]) || !/^Open Receiving settings/.test(a[1]) || !/^Open wallet settings/.test(a[2])) throw new Error(JSON.stringify(a));
    return a.join(' | ');
  });

  await t.step('click Receiving from another page: Settings › Receiving#epicbox, its heading focused, section flashing', async () => {
    await U.nav(w, ui, U.PAGES.modern.find((p) => p[1] === '/activity'));
    await svc('Receiving').click();
    await expectFocus('stg-rcv-h', 'Receiving');
    if (await hash() !== '/settings/receiving#epicbox') throw new Error(await hash());
    if (!await flashing()) throw new Error('no highlight');
    if (!await scrolled('stg-sec-epicbox')) throw new Error('section not in view');
    await w.waitForTimeout(400);
    return 'ok';
  }, { shot: true });

  await t.step('Settings already open: Node, then Receiving again (scrolled away and unfocused first)', async () => {
    await svc('Node').click();
    await expectFocus('stg-node-h', 'Node');
    if (await hash() !== '/settings#node') throw new Error(await hash());
    await w.evaluate(() => { document.querySelector('#e-main').scrollTop = 99999; document.activeElement.blur(); });
    await svc('Receiving').click();
    await expectFocus('stg-rcv-h', 'Receiving (Settings open)');
    if (!await scrolled('stg-sec-epicbox')) throw new Error('section not in view');
    await w.evaluate(() => { document.querySelector('#e-main').scrollTop = 0; document.activeElement.blur(); });
    await svc('Receiving').click();   //the very same hash again
    await expectFocus('stg-rcv-h', 'Receiving (same hash again)');
    return 'ok';
  });

  await t.step('keyboard: Tab-focus a link and press Enter / Space', async () => {
    await U.nav(w, ui, U.PAGES.modern.find((p) => p[1] === '/activity'));
    await svc('Receiving').focus();
    await w.keyboard.press('Enter');
    await expectFocus('stg-rcv-h', 'Receiving by Enter');
    await w.evaluate(() => document.activeElement.blur());
    await svc('Node').focus();
    await w.keyboard.press('Space');
    await expectFocus('stg-node-h', 'Node by Space');
    await wallet().focus();
    await w.keyboard.press('Enter');
    await H.waitFor(async () => (await hash()) === '/account', { timeout: 5000 }) || (() => { throw new Error('wallet by Enter: ' + hash()); })();
    return 'ok';
  });

  await t.step('wallet row by click: from another page and from Settings', async () => {
    await U.nav(w, ui, U.PAGES.modern.find((p) => p[1] === '/activity'));
    await wallet().click();
    if (!await H.waitFor(async () => (await hash()) === '/account', { timeout: 5000 })) throw new Error(await hash());
    await svc('Node').click();
    await expectFocus('stg-node-h', 'Node');
    await wallet().click();
    if (!await H.waitFor(async () => (await hash()) === '/account', { timeout: 5000 })) throw new Error(await hash());
    await settle();
    return 'ok';
  }, { shot: true });

  await t.step('reduced motion: no flash animation, still jumps and focuses', async () => {
    await w.emulateMedia({ reducedMotion: 'reduce' });
    await U.nav(w, ui, U.PAGES.modern.find((p) => p[1] === '/activity'));
    await svc('Receiving').click();
    await expectFocus('stg-rcv-h', 'Receiving');
    const anim = await w.evaluate(() => getComputedStyle(document.querySelector('.e-jump-flash')).animationName);
    await w.emulateMedia({ reducedMotion: 'no-preference' });
    if (anim !== 'none') throw new Error('animation ' + anim);
    return 'ok';
  });

  await t.step('Lock still locks (the wallet row is not the lock button)', async () => {
    await U.lock(w, ui);
    return 'locked';
  });
  await t.step('quit', () => t.quit(), { fatal: true, timeout: 60000 });
  await t.step('no process of the app left after 10 s', () => t.assertNoLeftovers({ timeout: 10000 }), { timeout: 20000 });
});
