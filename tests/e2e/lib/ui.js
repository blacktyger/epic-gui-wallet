/*
 * UI flows for both interfaces (Modern: src/components/modern/, Classic: src/components/*.vue).
 * English strings: src/lang/modern/*.js and src/lang/en.js. Each function returns a short string
 * of what it saw and throws when the expected thing isn't there; none waits without a timeout.
 *
 * Gotchas (from the QA drivers): Modern keeps closed dialogs in the DOM, so look for dialog[open];
 * Classic's gear menu is a click toggle, and its "Log out" is an <a> without href (no link role).
 */
'use strict';
const fs = require('fs');
const path = require('path');
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
/** Modern: the sidebar's node icon says "Node online and ready" (its aria-label; no height in the main views). */
async function waitNodeOnline(w, timeout = 30000) {
  return waitFor(async () => (await w.locator('button.e-svc[aria-label*="Node online and ready"]').count()) ? true : null, { timeout, interval: 300 });
}

async function waitText(w, re, timeout = 20000) {
  const t = await waitFor(async () => { const s = await text(w); return re.test(s) ? s : null; }, { timeout, interval: 300 });
  if (!t) throw new Error(`no ${re} on the page after ${timeout} ms: ${(await text(w)).slice(0, 300)}`);
  return (t.match(re) || [''])[0];
}

/* ---------- start, create ---------- */
async function welcome(w) {
  await clickable(w, 'Create a new wallet').first().waitFor({ timeout: 60000 });
  await clickable(w, 'Add an existing wallet').first().waitFor({ timeout: 5000 });
  await clickable(w, 'Restore from recovery phrase').first().waitFor({ timeout: 5000 });
  return 'Welcome: Create a new wallet / Add an existing wallet / Restore from recovery phrase';
}

/**
 * Add a wallet › Create a new wallet (Welcome, or Settings › All wallets): password twice, create,
 * reveal the 24 words (kept as secrets), "I've written it down, continue". Ends on Unlock with the new
 * wallet chosen (said to be added); returns {words, id} (id: the wallet chosen there).
 */
async function createOnly(w, password) {
  await clickable(w, 'Create a new wallet').first().click();
  await w.locator('input[name=password]').first().fill(password, { timeout: 15000 });
  await w.locator('input[name=password2]').first().fill(password);
  await w.getByRole('button', { name: /^(Create wallet|Create new wallet|Create)\b/ }).first().click();
  await w.getByRole('button', { name: 'Reveal phrase' }).first().click({ timeout: 90000 });
  const words = (await w.locator('ol.e-seed li, .e-seed li, li.mnemonic-word').allInnerTexts())
    .map((x) => x.trim().replace(/^\d+[.)]?[\s\u00a0]*/, '').trim()).filter(Boolean);
  addSecrets({ words });
  if (words.length !== 24) throw new Error('expected 24 recovery words, saw ' + words.length);
  await clickable(w, /written it down/).first().click();
  const id = await unlockChosen(w);
  return { words, id };
}

/** On Unlock right after adding: the wallet chosen (route query wallet = the chosen one), and the
    "was added" line naming it. Returns its id. */
async function unlockChosen(w) {
  await w.waitForURL(/login/, { timeout: 90000 });
  await w.locator('[data-added]').first().waitFor({ timeout: 15000 });
  const said = (await w.locator('[data-added]').first().innerText()).trim();
  //Modern: "<name> added." (msg.wallets.added_unlock_m); the name is the chosen wallet's own
  const nm = /^(.+) added\.$/.exec(said);
  if (!nm) throw new Error('Unlock says: ' + said);
  const r = await w.evaluate(() => {
    const q = new URLSearchParams(location.search || location.hash.split('?')[1] || '');
    const sel = document.querySelector('#loginWallet');
    const radio = document.querySelector('input[name=unlock-wallet]:checked');
    const lab = radio && (radio.closest('label') || document.querySelector(`label[for="${radio.id}"]`));
    return { label: lab ? lab.innerText : '', want: q.get('wallet'), chosen: sel ? sel.value : radio ? radio.value : q.get('wallet') };
  });
  if (!r.want || r.chosen !== r.want) throw new Error(`Unlock chose ${r.chosen}, the new wallet is ${r.want}`);
  if (r.label && !r.label.includes(nm[1])) throw new Error(`Unlock says "${said}", the chosen wallet reads "${r.label}"`);
  return r.want;
}

/** Welcome › Create: then Unlock (the new wallet chosen) with the password just set. */
async function createWallet(w, ui, password) {
  const { words } = await createOnly(w, password);
  await submitPassword(w, password);
  const where = await waitFor(async () => { const r = await route(w); return /dashboard/.test(r) ? r : null; }, { timeout: 90000, interval: 400 });
  if (!where) throw new Error('the wallet did not open after create: ' + (await route(w)) + ' :: ' + (await text(w)).slice(0, 200));
  return words.length + ' words shown (not logged); Unlock chose the new wallet; unlocked on ' + where;
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
    ['This wallet', '/account', 'Settings', 'stg'], ['All wallets', '/wallets', 'Settings', 'stg'], ['Recovery phrase', '/mnemonic', 'Settings', 'stg'],
    ['Rescan', '/recheckBalance', 'Settings', 'stg'], ['About', '/about', 'Settings', 'stg'], ['Help', '/help', 'Settings', 'stg'],
    ['Node', '/settings', 'Settings', 'stg'], ['Receiving', '/settings/receiving', 'Settings', 'stg'], ['Appearance', '/settings/appearance', 'Settings', 'stg'],
    //Receive › Transaction files
    ['Sign a transaction file', '/importTransaction', null, 'rcv-sign'], ['Finalize a transaction file', '/finalizeTransaction', null, 'rcv-fin'],
  ],
  classic: [
    ['Dashboard', '/dashboard', 'Dashboard'], ['Address Book', '/addressBook', 'Address Book'], ['Send', '/httpSend', 'Send'],
    ['Finalize offline transaction', '/finalizeTransaction', 'Finalize offline transaction'], ['Receive', '/httpReceive', 'Receive'],
    ['Import offline transaction', '/importTransaction', 'Import offline transaction'], ['About', '/about', 'About'], ['Help', '/help', 'Help'],
    ['Profile', '/account', 'Profile', 'gear'], ['All wallets', '/wallets', 'All wallets', 'gear'], ['Settings', '/settings', 'Settings', 'gear'], ['Recheck Balance', '/recheckBalance', 'Recheck Balance', 'gear'],
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
    if (!/^\/(settings(\/\w+)?|account|wallets|mnemonic|recheckBalance|about|help)$/.test(await route(w))) await w.locator('aside a[href="/settings"], nav a[href="/settings"]').first().click();
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
const nodeInput = (w, ui) => (ui === 'modern' ? w.locator('input[data-test=node-combo]') : w.locator('section.is-main-section input[type=nodeaddress], section.is-main-section input.input').first()).first();

async function openSettings(w, ui) {
  return nav(w, ui, ui === 'modern' ? PAGES.modern.find((p) => p[0] === 'Node') : PAGES.classic.find((p) => p[0] === 'Settings'));
}

/** The node address the wallet has saved (Modern: the default wallet's settings in settings.json). */
function storedNode(t) {
  const s = JSON.parse(fs.readFileSync(path.join(t.home, '.epic-gui', 'settings.json'), 'utf8'));
  const w = (s.wallets || []).find((x) => x.id === s.defaultWallet) || (s.wallets || [])[0] || {};
  return (w.settings || {}).check_node_api_http_addr;
}

/**
 * External node, address typed key by key: after every key the field holds exactly what was typed.
 * Modern: the node combobox on Settings › Node; the field stays focused, the address is applied by
 * saveNode (Enter).
 */
async function typeNodeAddress(w, ui, url = NODE_URL) {
  await openSettings(w, ui);
  if (ui === 'classic') {
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
  if (ui === 'classic') {
    await input.press('Tab');
    await w.waitForTimeout(400);
    const v = await input.inputValue();
    if (v !== url) throw new Error(`after leaving the field it shows ${JSON.stringify(v)}, typed ${JSON.stringify(url)}`);
    return `typed ${url} key by key; field holds ${JSON.stringify(v)} (both slashes)`;
  }
  //the typed address gets its live-check row in the list, the text stays as typed
  await w.locator('[data-test=node-list]').waitFor({ state: 'visible', timeout: 8000 });
  return `typed ${url} key by key; field holds ${JSON.stringify(await input.inputValue())} (both slashes), live check shown`;
}

/** Settings › node: the address filled at once (not key by key), then applied like saveNode. */
async function setNode(w, ui, url = NODE_URL, t = null) {
  await openSettings(w, ui);
  if (ui === 'classic') {
    const sel = w.locator('section.is-main-section select').first();
    if ((await sel.inputValue()) !== 'external') await sel.selectOption('external');
  }
  const input = nodeInput(w, ui);
  await input.click();
  await input.fill(url);
  return saveNode(w, ui, url, t);
}

/**
 * Apply the typed node (Modern: Enter in the combobox, no Save bar; Classic: Save); the app then talks
 * to the stub node: "Node online and ready" at the stub's height. Modern with t: the stored address is the typed one.
 */
async function saveNode(w, ui, url = NODE_URL, t = null) {
  if (ui === 'modern') {
    await nodeInput(w, ui).press('Enter');
    await waitNodeOnline(w, 45000);
  } else {
    await w.locator('section.is-main-section button.is-primary').filter({ hasText: /^\s*Save\s*$/ }).first().click({ timeout: 8000 });
    await waitText(w, /Node \(http:\/\/127\.0\.0\.1:13413\)/, 45000);
  }
  await openSettings(w, ui);
  const v = await nodeInput(w, ui).inputValue();
  const host = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (v !== (ui === 'modern' ? host : url)) throw new Error('after saving, the node field shows ' + JSON.stringify(v));
  let stored = '';
  if (ui === 'modern' && t) {
    const sv = storedNode(t);
    if (sv !== url) throw new Error('the stored node address is ' + JSON.stringify(sv) + ', typed ' + JSON.stringify(url));
    stored = `; stored ${sv}`;
  }
  return `saved; node field shows ${JSON.stringify(v)}${stored}; ` + (ui === 'modern' ? 'sidebar: Node online and ready' : 'header: Node (' + url + ')');
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
  const stop = w.getByRole('button', { name: ui === 'modern' ? /^Stop receiving$|^Stop listener$|^Turn off$/ : /^Stop( listener)?$/ });
  if (await stop.count()) {
    await stop.first().click({ timeout: 8000 });
  }
  const start = w.getByRole('button', { name: ui === 'modern' ? /^Start (listener|receiving)$|^Turn on$/ : /^Start( listener)?$/ });
  await start.first().waitFor({ timeout: 30000 });
  return 'listener off: Start is offered';
}

/** Modern Receive › HTTP address: Turn on (the HTTP listener is off until asked), wait for Turn off. */
async function startHttpListener(w) {
  await w.getByRole('button', { name: 'Turn on', exact: true }).first().click({ timeout: 8000 });
  await w.getByRole('button', { name: 'Turn off', exact: true }).first().waitFor({ timeout: 60000 });
  return 'HTTP listener on: Turn off is offered';
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

/* ---------- Contacts (both interfaces since 6.1.6: a list of rows, the form says what is wrong under the field) ---------- */
async function contactNames(w, ui) {
  return w.evaluate((ui) => [...document.querySelectorAll(ui === 'modern' ? '.e-con-list .e-con-row b' : '.cbook-list .cbook-row b')]
    .map((e) => e.innerText.replace(/\s+/g, ' ').trim()), ui);
}
/* the form's messages under its fields, and the toasts */
async function contactMessages(w) {
  const inline = await w.evaluate(() => [...document.querySelectorAll('.e-con-form .e-error-msg, .cbook-card .help.is-danger')]
    .map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
  return inline.concat(await toasts(w));
}
/** Open a new contact form, fill name / Epicbox address, save; returns the messages and toasts seen. */
async function addContact(w, ui, { name = '', epicbox = '', http = '' } = {}) {
  const p = ui === 'modern' ? 'con' : 'cb';
  if (ui === 'modern') await w.getByRole('button', { name: 'Add contact' }).first().click({ timeout: 8000 });
  else await w.locator('.cbook-head button.is-primary').first().click({ timeout: 8000 });
  await w.locator(`#${p}-f-name`).fill(name);
  await w.locator(`#${p}-f-box`).fill(epicbox);
  if (http) await w.locator(`#${p}-f-ext`).fill(http);
  await w.locator(ui === 'modern' ? '.e-con-form-foot button[type=submit]' : '.cbook-foot button[type=submit]').click();
  const seen = new Set();
  //a message (refused), or the name in the list (saved)
  await waitFor(async () => {
    for (const x of await contactMessages(w)) seen.add(x);
    return seen.size || (name && (await contactNames(w, ui)).includes(name)) ? 'done' : null;
  }, { timeout: 4000, interval: 150 });
  return [...seen];
}
async function cancelContact(w, ui) {
  const c = ui === 'modern' ? w.locator('.e-con-form-foot').getByRole('button', { name: 'Cancel' }) : w.locator('.cbook-foot').getByRole('button', { name: 'Cancel' });
  if (await c.count()) await c.first().click();
}

/* ---------- language ---------- */
const htmlAttrs = (w) => w.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir || getComputedStyle(document.documentElement).direction }));
/** Settings › language select (Modern: Appearance, applies at once; Classic: then the page's Save). */
async function setLanguage(w, ui, code) {
  if (ui === 'modern') await nav(w, ui, PAGES.modern.find((p) => p[0] === 'Appearance'));
  else await openSettings(w, ui);
  const sel = ui === 'modern' ? w.locator('#stg-lang') : w.locator('section.is-main-section select').filter({ has: w.locator('option[value=de]') }).first();
  await sel.selectOption(code);
  if (ui === 'classic') await w.locator('section.is-main-section button.is-primary').last().click({ timeout: 8000 });
  const want = code === 'cz' ? 'cs' : code;
  const a = await waitFor(async () => { const x = await htmlAttrs(w); return x.lang === want ? x : null; }, { timeout: 30000 });
  if (!a) throw new Error(`html lang is ${JSON.stringify(await htmlAttrs(w))} after choosing ${code}`);
  return a;
}

module.exports = { startHttpListener, ADDR_RE, toasts, contactNames, contactMessages, addContact, cancelContact, htmlAttrs, setLanguage, NODE_URL, PAGES, clickable, text, route, main, waitText, waitNodeOnline, welcome, createWallet, createOnly, unlockChosen, submitPassword, skipTour, nav, heading, visit,
  openSettings, typeNodeAddress, saveNode, setNode, nodeInput, sendTo, sendAmt, sendBtn, sendErrors, trySend, epicAddress, receiveAddress, stopListener,
  lock, unlock, wrongPassword, openGear, setupAssistant };
