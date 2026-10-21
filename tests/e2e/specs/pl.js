// e2e-gate: off
// e2e-timeout: 420
/*
 * Polish: no English left on any page of either interface. Not in the default gate:
 *   npm run test:e2e -- --spec pl
 * A wallet is created and a second one added while the app is in English (so the second keeps the
 * label "Wallet 2" its form filled in), the language is set to Polski, then every page of PAGES
 * (lib/ui.js) and the removal dialog are read. A visible text, placeholder, aria-label or title is
 * English when it
 *   - is exactly an English message (src/lang/en.js) whose Polish one differs, or
 *   - has a word from the English stop list below (words that aren't Polish).
 * Data is skipped: addresses, paths, host names, numbers, the names in SAME. Modern's sidebar
 * wallet name must fit ("Portfel 2"). Screenshots of About, Account, Receive and Settings in shots/.
 */
'use strict';
const path = require('path');
const H = require('../lib/harness');
const U = require('../lib/ui');
const V = require('../lib/ui615');

const LANG = path.join(__dirname, '..', '..', '..', 'src', 'lang');
const flat = (o, p = '', r = {}) => {
  for (const [k, v] of Object.entries(o)) { const q = p ? p + '.' + k : k; if (v && typeof v === 'object') flat(v, q, r); else r[q] = v; }
  return r;
};
//words of English UI text that are not Polish words ("to", "on", "a", "i" and "import" are); whole
//words only, Polish letters count as letters ("Hasło" has no "has")
//not 'node': the Polish strings say "node" (node'a, node'em), the user's choice in 6.1.5
//nor "port" (Polish too: "zajęty port"); an exact English message "Port" still counts through the EN check
const STOP = /(?<!\p{L})(the|and|your|you|are|is|of|with|this|that|not|will|can|please|from|have|has|been|here|there|wallet|wallets|transaction|address|settings|balance|password|amount|send|receive|cancel|delete|save|close|open|copy|details|back|next|done|loading|error|failed|wrong|update|updates|log|out|thank|learn|more|about|connect|recheck|profile|finalize|dashboard|help|confirm|action|message|file|clipboard)(?!\p{L})/iu;
//the same in every language: names, units, technical words, language names
const SAME = /^(Epic( Cash)?|EPIC|Epicbox|HTTP|HTTPS|Tor|Dandelion\+\+|BT Labs|btlabs|Johannes Hahn|Cypher Stack|mainnet|floonet|usernet|Mainnet|Floonet|Usernet|GitHub|Polski|English|Deutsch|Čeština|Česko|България|Български|فارسی|हिन्दी|OK|QR|ID|URL|API|PID \d+|MW\/Epic [\d.]+)$/;

function english(texts, EN, PL, data) {
  return texts.filter((s) => {
    const bare = s.replace(/^(placeholder|aria-label|title): /, '').trim();
    if (!/[A-Za-z]{3,}/.test(bare) || SAME.test(bare)) return false;
    if (data && !/\s/.test(bare) && data.includes(bare)) return false;
    if (/@|:\/\/|^[a-z0-9]{30,}$/i.test(bare) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(bare) || /^[~/]|^[A-Z]:\\/.test(bare)) return false;
    if (EN.has(bare) && !PL.has(bare)) return true;
    //names, paths and host names may stand inside a Polish sentence; the stop words may not
    return STOP.test(bare.replace(/(?<!\p{L})node(?:['’]?(?:a|em|y|ów|owi|u))?(?!\p{L})/giu, '').replace(/\b(Epic Cash|Epic Wallet|Epicbox|GitHub|BT Labs|Dandelion\+\+)\b/g, '').replace(/(?:[A-Z]:\\|~?\/)\S*|\S+\.[a-z]{2,}(?::\d+)?\S*/g, ''));
  });
}

/* visible texts plus title attributes */
const pageTexts = async (w) => [...await V.leafTexts(w), ...await w.evaluate(() => [...document.querySelectorAll('[title]')]
  .filter((e) => e.getBoundingClientRect().width > 0 && e.getAttribute('title').trim()).map((e) => 'title: ' + e.getAttribute('title').trim()))];

/* Modern's sidebar wallet name: {text, fits} */
const sideName = (w) => w.evaluate(() => {
  const b = document.querySelector('.e-account b');
  return b ? { text: b.innerText.trim(), fits: b.scrollWidth <= b.clientWidth + 1, widths: b.scrollWidth + '/' + b.clientWidth } : null;
});

H.runCase('pl', async (t) => {
  const ui = t.ui;
  const EN = flat((await import(path.join(LANG, 'en.js'))).default);
  const PL = flat((await import(path.join(LANG, 'pl.js'))).default);
  const enSet = new Set(Object.values(EN).filter((v) => typeof v === 'string' && !/[{<]/.test(v)).map((v) => v.trim()));
  const plSet = new Set(Object.values(PL).filter((v) => typeof v === 'string').map((v) => v.trim()));
  const password = H.newPassword();
  const w = await t.launch();
  //known bug E2E-1 (specs/checks.js)
  const E2E_1 = /this\.\$t is not a function/;
  //Modern's tour (again after an added wallet or a language change): its Skip button, in any language
  const skipTourIfAny = async (wait = 2500) => {
    if (ui !== 'modern' || !(await w.locator('#e-tour-t').waitFor({ state: 'visible', timeout: wait }).then(() => true, () => false))) return false;
    await w.locator('#e-tour-t').locator('xpath=ancestor::*[.//button[contains(@class,"e-btn-ghost")]][1]').locator('button.e-btn-ghost').first().click();
    await w.locator('#e-tour-t').waitFor({ state: 'hidden', timeout: 5000 });
    return true;
  };

  await t.step('create a wallet', () => U.createWallet(w, ui, password), { fatal: true, timeout: 150000 });
  if (ui === 'modern') await t.step('skip the tour', () => U.skipTour(w, ui));
  //the node is a setting of each wallet: the stub for both
  const stubNode = async () => {
    return U.setNode(w, ui);
  };
  await t.step('node: the stub', stubNode, { fatal: true, timeout: 90000 });
  await t.step('add a second wallet in English (its label: "Wallet 2")', async () => {
    let r;
    try {
      r = await V.addWallet(w, ui, password);
    } catch (e) {
      //Classic may show the login with the new wallet picked instead of opening it: log in there
      const pw = w.locator('input[type=password]').first();
      if (!(await pw.isVisible().catch(() => false))) throw e;
      await pw.fill(password);
      await w.getByRole('button', { name: 'Login', exact: true }).first().click();
      await w.waitForURL(/dashboard/, { timeout: 90000 });
      r = 'second wallet created; opened from the login';
    }
    await skipTourIfAny(5000);
    return r;
  }, { fatal: true, timeout: 150000 });
  await t.step('node of the second wallet: the stub', stubNode, { fatal: true, timeout: 90000 });
  if (ui === 'modern') {
    await t.step('English: the sidebar wallet name fits', async () => {
      const n = await H.waitFor(() => sideName(w), { timeout: 10000 });
      await t.screenshot('en-sidebar');
      if (!n || !n.fits) throw new Error('cut off: ' + JSON.stringify(n));
      return JSON.stringify(n);
    }, { shot: true });
  }

  await t.step('switch to Polski', async () => {
    //the English toasts of the saves before (a click closes one): only toasts from now on count
    for (let i = 0; i < 10 && await w.locator('.c-toast').count(); i++) await w.locator('.c-toast').first().click({ timeout: 2000 }).catch(() => {});
    await w.locator('.c-toast').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    const a = await U.setLanguage(w, ui, 'pl');
    await w.waitForTimeout(1200);
    await skipTourIfAny();
    return JSON.stringify(a);
  }, { fatal: true, timeout: 60000, allowConsole: [E2E_1] });

  const found = {};
  const SHOT = /^\/(about|account|httpReceive|settings|dashboard|help|recheckBalance)$/;
  for (const page of U.PAGES[ui]) {
    await t.step(`Polish ${page[1]}${page[3] && page[3] !== 'side' ? ' (' + page[0] + ')' : ''}`, async () => {
      //the labels of PAGES are English: open by route
      await U.nav(w, ui, page);
      await w.waitForTimeout(700);
      await skipTourIfAny(300);
      if (SHOT.test(page[1]) && !/rcv-/.test(page[3] || '')) await t.screenshot('pl' + page[1].replace(/\//g, '-') + (page[0] === 'Node and receiving' ? '-node' : ''));
      const left = english(await pageTexts(w), enSet, plSet, (await U.epicAddress(w)) || '');
      if (left.length) found[page[1] + ' ' + page[0]] = left;
      if (left.length) throw new Error('English: ' + JSON.stringify(left));
      return 'none';
    }, { allowConsole: [E2E_1] });
  }

  await t.step('Polish: the other wallet\'s removal dialog', async () => {
    await V.openAllWallets(w, ui);
    const name = PL['msg.wallets.wallet_n'].replace('{0}', '1');
    await w.getByRole('button', { name: PL['msg.removal.open_named'].replace('{0}', name) }).first().click({ timeout: 10000 });
    const dlg = w.locator('dialog[open], .modal.is-active').last();
    await dlg.waitFor({ state: 'visible', timeout: 10000 });
    await w.waitForTimeout(2500);
    await t.screenshot('pl-removal');
    const left = english(await pageTexts(w), enSet, plSet, '');
    await dlg.getByRole('button', { name: PL['msg.cancel'], exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    if (left.length) throw new Error('English: ' + JSON.stringify(left));
    return 'none';
  }, { allowConsole: [E2E_1] });

  await t.step('Polish: the default label "Wallet 2" shows as "Portfel 2"', async () => {
    await V.openWalletSettings(w, ui);
    const all = (await pageTexts(w)).join(' | ') + ' | ' + await w.locator('input#stg-label, input#accountLabel').first().inputValue();
    if (/Wallet \d/.test(all)) throw new Error('still English: ' + all.match(/.{0,40}Wallet \d.{0,20}/)[0]);
    if (!/Portfel 2/.test(all)) throw new Error('no "Portfel 2" on the page');
    return 'Portfel 2';
  });
  if (ui === 'modern') {
    await t.step('Polish: the sidebar wallet name fits', async () => {
      const n = await sideName(w);
      if (!n || n.text !== 'Portfel 2' || !n.fits) throw new Error(JSON.stringify(n));
      return JSON.stringify(n);
    });
  }

  await t.step('back to English', () => U.setLanguage(w, ui, 'en').then((a) => JSON.stringify(a)), { timeout: 60000, allowConsole: [E2E_1] });
  await t.step('quit (Menu › Quit)', () => t.quit(), { fatal: true, timeout: 60000, allowConsole: [E2E_1] });
  await t.step('no process of the app left after 10 s', () => t.assertNoLeftovers({ timeout: 10000 }), { timeout: 20000 });
});
