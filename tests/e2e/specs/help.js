// e2e-ui: modern
/*
 * Settings › Help (Modern; Classic is frozen and keeps its old Help): every topic in its section, the
 * search filters as you type and marks the words, a match in the detail opens it, Esc clears, "/"
 * focuses the search, the handshake diagram steps (and does not move with reduced motion), and the
 * search in Polish and Persian (RTL). E2E_SHOTS=1: screenshots in dark and light, at the window's smallest
 * size (it can't be narrower than 1044 px) and at the largest interface scale (150 %).
 */
'use strict';
const H = require('../lib/harness');
const U = require('../lib/ui');

const SHOTS = !!process.env.E2E_SHOTS;

H.runCase('help', async (t) => {
  const ui = t.ui;
  const password = H.newPassword();
  const w = await t.launch();
  const help = () => U.nav(w, ui, U.PAGES.modern.find((p) => p[1] === '/help'));
  const topics = () => w.locator('article.e-hlp-topic');
  const search = () => w.locator('#stg-help-q');
  //toasts (Settings saved, the node is online) fade after a few seconds: wait for them so they cover nothing
  const shot = (name) => (SHOTS ? t.step('screenshot: ' + name, async () => {
    await H.waitFor(async () => (await w.locator('.c-toast').count()) === 0, { timeout: 12000 });
    return name;
  }, { shot: true, timeout: 20000 }) : null);
  //the largest interface scale (Settings › Appearance, 150 %): the rem root grows, the pane gets relatively narrower
  const scale = (pct) => w.evaluate((pct) => { document.documentElement.style.fontSize = (pct * 1.0625) + '%'; }, pct);
  const theme = (s) => w.evaluate((s) => { document.documentElement.dataset.theme = s; }, s);

  await t.step('create a wallet', () => U.createWallet(w, ui, password), { fatal: true, timeout: 150000 });
  await t.step('skip the tour', () => U.skipTour(w, ui));
  //Applying the node checks it: the stub first (the default public node is unreachable here), so the language can be saved later
  await t.step('node: the stub', async () => {
    return U.setNode(w, ui);
  }, { fatal: true, timeout: 90000 });
  await t.step('Settings › Help opens', help, { fatal: true });

  await t.step('every topic is listed in its section, folded', async () => {
    const n = await topics().count();
    if (n < 12) throw new Error(`${n} topics`);
    const secs = await w.locator('.e-hlp-sec').allInnerTexts();
    if (secs.length < 4) throw new Error('sections: ' + secs.join(', '));
    const open = await w.locator('.e-hlp-more[aria-expanded="true"]').count();
    if (open) throw new Error(`${open} open`);
    return `${n} topics in ${secs.length} sections`;
  });
  await shot('help, dark');

  await t.step('typing filters at once and marks the words', async () => {
    await search().fill('confirmations');
    const first = topics().first();
    const id = await first.getAttribute('id');
    if (id !== 'help-confirmations') throw new Error('first result: ' + id);
    const marks = await w.locator('article.e-hlp-topic mark').count();
    const status = await w.locator('#stg-help-n').innerText();
    if (!marks || !/\d/.test(status)) throw new Error(`marks ${marks}, status "${status}"`);
    return `${await topics().count()} topics, ${marks} marks, "${status}"`;
  });
  await t.step('a word only in the detail opens the fold', async () => {
    await search().fill('change output');
    const open = await w.locator('article.e-hlp-topic .e-hlp-more[aria-expanded="true"]').count();
    const marked = await w.locator('.e-hlp-body mark').count();
    if (!open || !marked) throw new Error(`open ${open}, marks in a detail ${marked}`);
    return `${open} open`;
  });
  await shot('search, a match in the detail');
  await t.step('Esc clears the search and lists everything again', async () => {
    await search().press('Escape');
    if (await search().inputValue()) throw new Error('still: ' + (await search().inputValue()));
    const n = await topics().count();
    if (await w.locator('article.e-hlp-topic mark').count()) throw new Error('marks left');
    return `${n} topics`;
  });
  await t.step('"/" focuses the search', async () => {
    await w.locator('.e-hlp-sec').first().click();
    await w.keyboard.press('/');
    const id = await w.evaluate(() => document.activeElement && document.activeElement.id);
    if (id !== 'stg-help-q') throw new Error('focus on ' + id);
    return 'focused';
  });
  await t.step('nothing found: says so', async () => {
    await search().fill('qqzzxx');
    const n = await topics().count();
    const status = await w.locator('#stg-help-n').innerText();
    if (n || !/qqzzxx/.test(status)) throw new Error(`${n} topics, "${status}"`);
    await search().fill('');
    return status;
  });

  await t.step('the handshake diagram steps forward and to the file way', async () => {
    const topic = w.locator('#help-both-sides');
    await topic.locator('.e-hlp-more').click();
    const cap = () => topic.locator('.hs-cap').innerText();
    const first = await cap();
    await topic.locator('.hs-nav button').nth(1).click();
    const second = await cap();
    if (first === second) throw new Error('the caption did not change');
    await topic.locator('.hs-flows button').nth(1).click();
    if ((await topic.locator('.hs-flows button').nth(1).getAttribute('aria-pressed')) !== 'true') throw new Error('file way not pressed');
    await topic.scrollIntoViewIfNeeded();
    return second;
  });
  await shot('handshake diagram');
  await t.step('reduced motion: the dot does not travel', async () => {
    await w.emulateMedia({ reducedMotion: 'reduce' });
    await w.locator('#help-both-sides .hs-nav button').nth(1).click();
    const anim = await w.evaluate(() => { const d = document.querySelector('#help-both-sides .hs-dot'); return d ? getComputedStyle(d).animationName : 'no dot'; });
    await w.emulateMedia({ reducedMotion: 'no-preference' });
    if (anim !== 'none') throw new Error('animation: ' + anim);
    return anim;
  });

  if (SHOTS) {
    await theme('light');
    await shot('handshake, light');
    await w.locator('#help-both-sides .e-hlp-more').click();
    await w.locator('.e-stg-panes, main').first().evaluate((e) => e.scrollTo(0, 0)).catch(() => {});
    await shot('help, light');
    await scale(150);
    await shot('help, light, 150 %');
    await search().fill('epicbox');
    await shot('search epicbox, light, 150 %');
    await theme('dark');
    await shot('search epicbox, dark, 150 %');
    await search().fill('');
    await scale(100);
  }

  await t.step('Polish: Help and its search are in Polish', async () => {
    await U.setLanguage(w, ui, 'pl');
    await help();
    await search().fill('fraza');
    const id = await topics().first().getAttribute('id');
    const marks = await w.locator('article.e-hlp-topic mark').count();
    if (id !== 'help-phrase' || !marks) throw new Error(`first ${id}, marks ${marks}`);
    const label = await w.locator('label[for="stg-help-q"]').innerText();
    return `${label}: ${await topics().count()} topics`;
  }, { timeout: 60000 });
  await shot('pl, search fraza');
  if (SHOTS) {
    await search().fill('');
    await shot('pl, help');
  }
  await t.step('Persian: right to left, the search works', async () => {
    await U.setLanguage(w, ui, 'fa');
    await help();
    const dir = await w.evaluate(() => document.documentElement.dir);
    if (dir !== 'rtl') throw new Error('dir ' + dir);
    const title = await topics().first().locator('h4').innerText();
    await search().fill(title.split(/\s+/)[0]);
    const marks = await w.locator('article.e-hlp-topic mark').count();
    if (!marks) throw new Error('no marks for ' + title);
    return `${title}: ${marks} marks`;
  }, { timeout: 60000 });
  await shot('fa, search');
  await t.step('back to English', () => U.setLanguage(w, ui, 'en'), { timeout: 60000 });

  await t.step('quit (Menu › Quit)', () => t.quit(), { fatal: true, timeout: 60000 });
  await t.step('no process of the app left after 10 s', () => t.assertNoLeftovers({ timeout: 10000 }), { timeout: 20000 });
});
