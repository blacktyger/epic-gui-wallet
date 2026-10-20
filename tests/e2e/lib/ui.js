/*
 * UI flows for both interfaces (Modern: src/components/modern/, Classic: src/components/*.vue).
 * English strings: src/lang/modern/*.js and src/lang/en.js. Each function returns a short string
 * of what it saw and throws when the expected thing isn't there; none waits without a timeout.
 *
 * Gotchas (from the QA drivers): Modern keeps closed dialogs in the DOM, so look for dialog[open];
 * Classic's gear menu is a click toggle, and its "Log out" is an <a> without href (no link role).
 */
'use strict';
const { addSecrets, waitFor } = require('./harness');

const ADDR_RE = /\bes[a-zA-Z0-9]{40,60}@[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?/;
const NODE_URL = 'http://127.0.0.1:13413';

const clickable = (w, name) => w.getByRole('button', { name }).or(w.getByRole('link', { name }));
const text = async (w) => (await w.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim();
const route = (w) => w.evaluate(() => location.hash.replace(/^#/, '') || location.pathname);
/** The page's own area (no sidebar / header chrome). */
const main = (w) => w.evaluate(() => {
  const el = document.querySelector('#e-main, .e-content, section.is-main-section') || document.body;
  return el.innerText.replace(/\s+/g, ' ').trim();
});
async function waitText(w, re, timeout = 20000) {
  const t = await waitFor(async () => { const s = await text(w); return re.test(s) ? s : null; }, { timeout, interval: 300 });
  if (!t) throw new Error(`no ${re} on the page after ${timeout} ms: ${(await text(w)).slice(0, 300)}`);
  return (t.match(re) || [''])[0];
}

/* ---------- start, create ---------- */
async function welcome(w) {
  await clickable(w, 'Create a wallet').first().waitFor({ timeout: 60000 });
  await clickable(w, 'Restore from recovery phrase').first().waitFor({ timeout: 5000 });
  return 'Welcome: Create a wallet / Restore from recovery phrase';
}

/** Welcome › Create: password twice, create, reveal the 24 words (kept as secrets), open the wallet. */
async function createWallet(w, ui, password) {
  await clickable(w, 'Create a wallet').first().click();
  await w.locator('input[name=password]').first().fill(password, { timeout: 15000 });
  await w.locator('input[name=password2]').first().fill(password);
  await w.getByRole('button', { name: /^(Create wallet|Create new wallet|Create)\b/ }).first().click();
  await w.getByRole('button', { name: 'Reveal phrase' }).first().click({ timeout: 90000 });
  const words = (await w.locator('ol.e-seed li, .e-seed li, li.mnemonic-word').allInnerTexts())
    .map((x) => x.trim().replace(/^\d+[.)]?[\s\u00a0]*/, '').trim()).filter(Boolean);
  addSecrets({ words });
  if (words.length !== 24) throw new Error('expected 24 recovery words, saw ' + words.length);
  //Modern: "I've written it down, open my wallet"; Classic: "Open my wallet"; a confirmation may follow
  await clickable(w, /written it down|Open my wallet/).first().click();
  const where = await waitFor(async () => {
    const r = await route(w);
    if (/dashboard/.test(r)) return r;
    const again = w.locator('dialog[open], .modal.is-active').getByRole('button', { name: /written it down|Yes|Continue/ });
    if (await again.count()) await again.first().click().catch(() => {});
    return null;
  }, { timeout: 90000, interval: 400 });
  if (!where) throw new Error('the wallet did not open after create: ' + (await route(w)) + ' :: ' + (await text(w)).slice(0, 200));
  return '24 words shown (not logged); wallet opened on ' + where;
}

/** Modern's first-unlock tour (absent in Classic). */
async function skipTour(w, ui) {
  if (ui !== 'modern') return 'Classic has no tour';
  const skip = w.getByRole('button', { name: 'Skip tour' });
  await skip.first().click({ timeout: 15000 });
  await w.locator('#e-tour-t').waitFor({ state: 'hidden', timeout: 5000 });
  return 'tour skipped';
}

/* ---------- navigation ---------- */
/*
 * Every page each interface's menus lead to: [label, route, heading]. Modern: the sidebar and the
 * Settings sub-navigation, h1 is the heading. Classic: the side menu and the gear menu, the title bar
 * shows the route title (src/router/index.js meta.title).
 */
const PAGES = {
  modern: [
    ['Overview', '/dashboard', 'Overview'], ['Activity', '/activity', 'Activity'], ['Send', '/httpSend', 'Send'],
    ['Receive', '/httpReceive', 'Receive'], ['Contacts', '/addressBook', 'Contacts'],
    ['Settings', '/settings', 'Settings', 'side'],
    ['Wallet', '/account', 'Settings', 'stg'], ['Recovery phrase', '/mnemonic', 'Settings', 'stg'],
    ['Rescan', '/recheckBalance', 'Settings', 'stg'], ['About', '/about', 'Settings', 'stg'], ['Help', '/help', 'Settings', 'stg'],
    ['Node and receiving', '/settings', 'Settings', 'stg'],
    //Receive › Transaction files
    ['Sign a transaction file', '/importTransaction', null, 'rcv-sign'], ['Finalize a transaction file', '/finalizeTransaction', null, 'rcv-fin'],
  ],
  classic: [
    ['Dashboard', '/dashboard', 'Dashboard'], ['Address Book', '/addressBook', 'Address Book'], ['Send', '/httpSend', 'Send'],
    ['Finalize offline transaction', '/finalizeTransaction', 'Finalize offline transaction'], ['Receive', '/httpReceive', 'Receive'],
    ['Import offline transaction', '/importTransaction', 'Import offline transaction'], ['About', '/about', 'About'], ['Help', '/help', 'Help'],
    ['Profile', '/account', 'Profile', 'gear'], ['Settings', '/settings', 'Settings', 'gear'], ['Recheck Balance', '/recheckBalance', 'Recheck Balance', 'gear'],
    ['Mnemonic Words', '/mnemonic', 'Recovery phrase', 'gear'],
  ],
};

async function openGear(w) {
  const dd = w.locator('.has-dropdown-with-icons').first();
  if (!/is-active/.test((await dd.getAttribute('class')) || '')) await dd.locator('a.navbar-link').first().click();
  await w.locator('.navbar-dropdown').first().waitFor({ state: 'visible', timeout: 5000 });
}

/** Open a page from its menu like a user; returns the route reached. */
async function nav(w, ui, [label, path, , where]) {
  if (ui === 'classic' && where === 'gear') {
    await openGear(w);
    await w.locator(`.navbar-dropdown a[href="${path}"]`).first().click();
  } else if (ui === 'modern' && where === 'stg') {
    if (!/^\/(settings|account|mnemonic|recheckBalance|about|help)$/.test(await route(w))) await w.locator('aside a[href="/settings"], nav a[href="/settings"]').first().click();
    await w.locator(`nav.e-stg-nav a[href="${path}"]`).first().click();
  } else if (ui === 'modern' && /^rcv-/.test(where || '')) {
    if (await route(w) !== '/httpReceive') await w.locator('a[href="/httpReceive"]').first().click();
    await w.locator(where === 'rcv-sign' ? '#e-rcv-sign-l' : '#e-rcv-fin-l').click();
  } else {
    await w.locator(`aside a[href="${path}"], nav a[href="${path}"]`).first().click();
  }
  const r = await waitFor(async () => { const x = await route(w); return x.startsWith(path) ? x : null; }, { timeout: 10000 });
  if (!r) throw new Error(`"${label}" did not open ${path} (on ${await route(w)})`);
  return r;
}

/** The heading the page shows (Modern: the visible h1 of the page; Classic: the title bar). */
async function heading(w, ui) {
  if (ui === 'classic') return (await w.locator('section.is-title-bar li').first().innerText({ timeout: 5000 })).trim();
  return w.evaluate(() => {
    const h = [...document.querySelectorAll('main h1, #e-main h1, h1')].find((e) => e.getBoundingClientRect().width > 0);
    return h ? h.innerText.trim() : '';
  });
}

/** Visit a page and check its heading and that it rendered some content of its own. */
async function visit(w, ui, page) {
  const r = await nav(w, ui, page);
  const want = page[2];
  const h = await waitFor(async () => { const x = await heading(w, ui); return (!want && x) || x === want ? x : null; }, { timeout: 8000 });
  if (!h) throw new Error(`${page[0]}: heading "${await heading(w, ui)}", expected "${want}"`);
  //the page's component rendered, not just the frame: own text or controls in the page area
  const body = await waitFor(() => w.evaluate(() => {
    const el = document.querySelector('#e-main, .e-content, section.is-main-section');
    if (!el) return null;
    const vis = (e) => e.getBoundingClientRect().width > 0;
    const controls = [...el.querySelectorAll('input, button, select, textarea, a[href]')].filter(vis).length;
    const t = el.innerText.replace(/\s+/g, ' ').trim();
    return t.length > 20 || controls ? `${controls} controls :: ${t.slice(0, 80)}` : null;
  }), { timeout: 8000 });
  if (!body) throw new Error(`${page[0]}: the page area is empty`);
  return `${r}: "${h}" :: ${body}`;
}

/**
 * Classic gear › Run Setup Assistant: walk its four steps (the node step checks the stub node) and
 * leave with Previous / Back, saving nothing. Modern has no menu entry for it.
 */
async function setupAssistant(w) {
  await openGear(w);
  await w.locator('.navbar-dropdown a[href^="/setupwizard"]').first().click();
  await w.getByText(/setup assistant/i).first().waitFor({ timeout: 10000 });
  const btn = (name) => w.locator('.buttons button.is-primary').filter({ hasText: name }).filter({ visible: true }).first();
  const seen = [];
  for (let i = 0; i < 3; i++) {
    await btn(/Next/).click({ timeout: 8000 });
    //the node step waits for its check of the node address
    const next = await waitFor(async () => (await w.locator('.buttons button.is-primary').filter({ hasText: /Previous/ }).filter({ visible: true }).count()) && 'ok', { timeout: 20000 });
    if (!next) throw new Error('step ' + (i + 2) + ' did not open');
    seen.push('step ' + (i + 2));
  }
  if (!(await btn(/Save and finish|Save/).count())) throw new Error('no Save on the last step');
  for (let i = 0; i < 3; i++) await btn(/Previous/).click({ timeout: 8000 });
  await btn(/^\s*Back\s*$/).click({ timeout: 8000 });
  await w.waitForURL(/dashboard/, { timeout: 15000 });
  return `steps 1-4 shown (${seen.join(', ')}), left without saving`;
}

/* ---------- Settings: the node ---------- */
const nodeInput = (w, ui) => (ui === 'modern' ? w.locator('#e-nodeserverField-1-a, input[id^="e-nodeserverField"][id$="-a"]') : w.locator('section.is-main-section input[type=nodeaddress], section.is-main-section input.input').first()).first();

async function openSettings(w, ui) {
  return nav(w, ui, ui === 'modern' ? PAGES.modern.find((p) => p[0] === 'Settings') : PAGES.classic.find((p) => p[0] === 'Settings'));
}

/** External node, address typed key by key: after every key the field holds exactly what was typed. */
async function typeNodeAddress(w, ui, url = NODE_URL) {
  await openSettings(w, ui);
  if (ui === 'modern') {
    const ext = w.locator('input[name^="e-nodeserverField"][value="external"]').first();
    if (!(await ext.isChecked())) await w.getByText('External node server', { exact: true }).first().click();
  } else {
    const sel = w.locator('section.is-main-section select').first();
    if ((await sel.inputValue()) !== 'external') await sel.selectOption('external');
  }
  const input = nodeInput(w, ui);
  await input.waitFor({ state: 'visible', timeout: 8000 });
  await input.click();
  await input.press('Control+A'); await input.press('Delete');
  if ((await input.inputValue()) !== '') throw new Error('the node field did not clear: ' + JSON.stringify(await input.inputValue()));
  let typed = '';
  for (const ch of url) {
    await input.press(ch === ' ' ? 'Space' : ch);
    typed += ch;
    const v = await input.inputValue();
    if (v !== typed) throw new Error(`after typing ${JSON.stringify(typed)} the field shows ${JSON.stringify(v)}`);
  }
  await input.press('Tab');
  await w.waitForTimeout(400);
  const v = await input.inputValue();
  if (v !== url) throw new Error(`after leaving the field it shows ${JSON.stringify(v)}, typed ${JSON.stringify(url)}`);
  return `typed ${url} key by key; field holds ${JSON.stringify(v)} (both slashes)`;
}

/** Save the settings page; the app then talks to the stub node: "Synced" at the stub's height. */
async function saveNode(w, ui, url = NODE_URL) {
  if (ui === 'modern') {
    const save = w.locator('.e-stg-savebar').getByRole('button', { name: 'Save', exact: true });
    await save.click({ timeout: 8000 });
    await waitText(w, /Synced · block 3,100,000/, 45000);
  } else {
    await w.locator('section.is-main-section button.is-primary').filter({ hasText: /^\s*Save\s*$/ }).first().click({ timeout: 8000 });
    await waitText(w, /Node \(http:\/\/127\.0\.0\.1:13413\)/, 45000);
  }
  await openSettings(w, ui);
  const v = await nodeInput(w, ui).inputValue();
  if (v !== url) throw new Error('after saving, the node field shows ' + JSON.stringify(v));
  return `saved; node field still ${JSON.stringify(v)}; ` + (ui === 'modern' ? 'sidebar: Synced · block 3,100,000' : 'header: Node (' + url + ')');
}

/* ---------- Send ---------- */
const sendTo = (w, ui) => (ui === 'modern' ? w.locator('#e-send-to') : w.locator('section.is-main-section input[placeholder="Recipient Address"]').first());
const sendAmt = (w, ui) => (ui === 'modern' ? w.locator('#e-send-amt') : w.locator('section.is-main-section input[placeholder="Amount to send"]').first());
const sendBtn = (w, ui) => (ui === 'modern' ? w.getByRole('button', { name: 'Review send', exact: true }) : w.locator('section.is-main-section button.is-primary').filter({ hasText: /^\s*Send\s*$/ })).first();

/** The validation errors the Send form shows (red text / error lines). */
async function sendErrors(w) {
  return w.evaluate(() => [...new Set([...document.querySelectorAll('.e-error-msg, .e-field-err, [role=alert], .help.is-danger, [style*="color:red"], [style*="color: red"]')]
    .filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean))]);
}

/**
 * Fill the form, press the send button if it is enabled, and return what the form said. Nothing may
 * be sent: no review dialog, no send started (the wallet has no funds and the stub node refuses
 * transactions anyway).
 */
async function trySend(w, ui, { to, amount }) {
  const a = sendTo(w, ui); const m = sendAmt(w, ui);
  await a.fill(''); await m.fill('');
  if (to) await a.fill(to);
  if (amount) await m.fill(amount);
  await m.press('Tab');
  await w.waitForTimeout(300);
  const b = sendBtn(w, ui);
  const enabled = !(await b.isDisabled());
  if (enabled) await b.click();
  await w.waitForTimeout(700);
  const dialog = await w.locator('dialog[open], .modal.is-active').count();
  return { errors: await sendErrors(w), enabled, dialog, page: await main(w) };
}

/* ---------- Receive ---------- */
async function epicAddress(w) { return ((await text(w)).replace(/\s+/g, '').match(ADDR_RE) || [])[0] || null; }

async function receiveAddress(w, ui) {
  await nav(w, ui, PAGES[ui].find((p) => p[1] === '/httpReceive'));
  const a = await waitFor(() => epicAddress(w), { timeout: 30000, interval: 400 });
  if (!a) throw new Error('no Epic address on Receive: ' + (await main(w)).slice(0, 300));
  return a;
}

/** Stop the listener (if it runs) from the Receive page; the address must stay. */
async function stopListener(w, ui) {
  const stop = w.getByRole('button', { name: ui === 'modern' ? /^Stop receiving$|^Stop listener$/ : /^Stop( listener)?$/ });
  if (await stop.count()) {
    await stop.first().click({ timeout: 8000 });
  }
  const start = w.getByRole('button', { name: ui === 'modern' ? /^Start (listener|receiving)$/ : /^Start( listener)?$/ });
  await start.first().waitFor({ timeout: 30000 });
  return 'listener off: Start is offered';
}

/* ---------- lock, unlock ---------- */
async function lock(w, ui) {
  if (ui === 'modern') await w.getByRole('button', { name: 'Lock wallet' }).click({ timeout: 8000 });
  else await w.locator('aside a.is-state-info').filter({ hasText: /Log out/ }).first().click({ timeout: 8000 });
  await w.waitForURL(/login/, { timeout: 30000 });
  await w.locator('input[type=password]').first().waitFor({ timeout: 15000 });
  return 'unlock screen';
}

async function submitPassword(w, password) {
  const f = w.locator('input[type=password]').first();
  await f.fill(password);
  await w.getByRole('button', { name: /^(Unlock|Login)$/ }).first().click();
}

async function unlock(w, ui, password) {
  const t0 = Date.now();
  await submitPassword(w, password);
  await w.waitForURL(/dashboard/, { timeout: 90000 });
  return `dashboard after ${Date.now() - t0} ms`;
}

/** Toasts shown now (vue-toaster), innermost elements only. */
const toasts = (w) => w.evaluate(() => [...document.querySelectorAll('.c-toast')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);

/** A wrong password: Modern says so at the field; Classic in a toast (QA T21). */
async function wrongPassword(w, ui, bad) {
  await submitPassword(w, bad);
  const seen = new Set();
  const msg = await waitFor(async () => {
    for (const x of await toasts(w)) seen.add(x);
    const m = (await text(w)).match(/Wrong password[^.]*\.?/) || [...seen].join(' ').match(/Error opening wallet \(is password correct\?\)/);
    return m ? m[0] : null;
  }, { timeout: 30000, interval: 200 });
  if (!msg) throw new Error(`no "Wrong password" message; toasts [${[...seen].join(' | ')}]; page: ${(await text(w)).slice(0, 200)}`);
  if (!/login/.test(await route(w))) throw new Error('a wrong password left the unlock screen: ' + await route(w));
  return `"${msg}", still on the unlock screen`;
}

/* ---------- Contacts (Modern: Contacts, Classic: Address Book); problems show as toasts ---------- */
async function contactNames(w, ui) {
  return w.evaluate((ui) => [...document.querySelectorAll(ui === 'modern' ? '.e-contact-list .e-contact b' : 'a.panel-block')]
    .map((e) => e.innerText.replace(/\s+/g, ' ').trim()), ui);
}
/** Open a new contact form, fill name / Epicbox address, save; returns the toasts seen. */
async function addContact(w, ui, { name = '', epicbox = '' } = {}) {
  if (ui === 'modern') {
    await w.getByRole('button', { name: 'Add contact' }).first().click({ timeout: 8000 });
    await w.locator('#con-f-name').fill(name);
    await w.locator('#con-f-box').fill(epicbox);
    await w.locator('.e-con-form-foot button[type=submit]').click();
  } else {
    await w.locator('section.is-main-section button.is-primary.is-small').first().click({ timeout: 8000 });
    const field = (label) => w.locator(`xpath=//label[normalize-space(.)="${label}"]/following::input[1]`).first();
    await field('Name').fill(name);
    await field('Epicbox Address').fill(epicbox);
    await w.locator('a.card-footer-item').filter({ hasText: /^\s*Save\s*$/ }).first().click();
  }
  const seen = new Set();
  await waitFor(async () => { for (const x of await toasts(w)) seen.add(x); return seen.size ? 'toast' : null; }, { timeout: 4000, interval: 150 });
  return [...seen];
}
async function cancelContact(w, ui) {
  const c = ui === 'modern' ? w.locator('.e-con-form-foot').getByRole('button', { name: 'Cancel' }) : w.locator('a.card-footer-item').filter({ hasText: /^\s*Cancel\s*$/ });
  if (await c.count()) await c.first().click();
}

/* ---------- language ---------- */
const htmlAttrs = (w) => w.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir || getComputedStyle(document.documentElement).direction }));
/** Settings › language select, then Save (Modern: the save bar; Classic: the page's Save). */
async function setLanguage(w, ui, code) {
  await openSettings(w, ui);
  const sel = ui === 'modern' ? w.locator('#stg-lang') : w.locator('section.is-main-section select').filter({ has: w.locator('option[value=de]') }).first();
  await sel.selectOption(code);
  const save = ui === 'modern' ? w.locator('.e-stg-savebar button.e-btn-primary') : w.locator('section.is-main-section button.is-primary').last();
  await save.click({ timeout: 8000 });
  const want = code === 'cz' ? 'cs' : code;
  const a = await waitFor(async () => { const x = await htmlAttrs(w); return x.lang === want ? x : null; }, { timeout: 30000 });
  if (!a) throw new Error(`html lang is ${JSON.stringify(await htmlAttrs(w))} after choosing ${code}`);
  return a;
}

module.exports = { ADDR_RE, toasts, contactNames, addContact, cancelContact, htmlAttrs, setLanguage, NODE_URL, PAGES, clickable, text, route, main, waitText, welcome, createWallet, skipTour, nav, heading, visit,
  openSettings, typeNodeAddress, saveNode, sendTo, sendAmt, sendBtn, sendErrors, trySend, epicAddress, receiveAddress, stopListener,
  lock, unlock, wrongPassword, openGear, setupAssistant };
