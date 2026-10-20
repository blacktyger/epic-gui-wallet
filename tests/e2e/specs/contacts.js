/*
 * Contacts (6.1.6), Modern only (Classic is no longer tested): add (with live checks), a contact's own picture (made safe:
 * re-encoded, metadata gone, an SVG refused), edit, search, sort, copy, a click on a contact opens
 * Send on it, the row's … menu (also by keyboard), the Send screen's picker (tester item #38), delete. No node is needed: nothing is sent.
 * E2E_CONTACT_SHOTS=1 also takes the screenshots for the release notes (desktop and a narrow
 * window at 150 % text; Modern also light), in the case's shots/ folder.
 */
// e2e-ui: modern
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const H = require('../lib/harness');
const U = require('../lib/ui');

const SHOTS = !!process.env.E2E_CONTACT_SHOTS;
const BOX_MARA = 'esYmsDGgwGPf5D6KPAW3j3jMbQojJ1UKwr44RwiEG7AZkV8V7uWh@epicbox.epiccash.com';
const BOX_JUNO = 'esWVc4Ex1SLvZLt8mAoMy1vabFzStbqTZHM3JSbzdGfKoECG2mNs@epicbox.epiccash.com';
const HTTP_MARA = 'http://192.0.2.55:3415';
const HTTP_CAFE = 'http://198.51.100.7:3415';
const SECRET = 'GPS 52.2297N 21.0122E e2e-metadata-marker';

/* a 400 x 300 PNG with a text chunk (the kind of metadata a photo carries) */
function pngWithMetadata(file) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const w = 400, h = 300;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * (w * 3 + 1) + 1 + x * 3;
    raw[i] = (x * 255 / w) | 0; raw[i + 1] = (y * 255 / h) | 0; raw[i + 2] = 160;
  }
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('Comment\0' + SECRET)), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

H.runCase('contacts', async (t) => {
  const ui = t.ui;
  const m = ui === 'modern';
  const p = m ? 'con' : 'cb';
  const row = m ? '.e-con-row' : '.cbook-row';
  const password = H.newPassword();
  const w = await t.launch();
  const tmp = path.join(t.home, 'pictures');
  fs.mkdirSync(tmp, { recursive: true });
  const photo = path.join(tmp, 'juno.png');
  pngWithMetadata(photo);
  const svg = path.join(tmp, 'evil.png');
  fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="5"/></svg>');

  const size = (width, height) => t.app.evaluate(({ BrowserWindow }, [a, b]) => { const win = BrowserWindow.getAllWindows()[0]; win.setSize(a, b); }, [width, height]);
  const shot = async (name) => { if (SHOTS) { await w.waitForTimeout(350); await t.screenshot(name); } };
  //a row sends; its details are the first item of its … menu
  const item = (name) => w.locator(m ? '.e-con-item' : '.cbook-item').filter({ has: w.locator('b', { hasText: name }) }).first();
  //a narrow window shows the list or one contact: back to the list first
  const listUp = async () => { const b = w.getByRole('button', { name: 'All contacts' }); if (await b.count() && await b.first().isVisible()) { await b.first().click(); await w.waitForTimeout(200); } };
  const menuPick = async (name, i) => {
    await listUp();
    await item(name).locator('.rmenu-btn').click();
    const items = item(name).locator('[role=menuitem]');
    await (typeof i === 'number' ? items.nth(i) : items.filter({ hasText: i }).first()).click();
    await w.waitForTimeout(200);
  };
  const openRow = (name) => menuPick(name, 0);
  const toValue = () => w.locator('input[placeholder="Recipient\'s address"], input[placeholder*="address" i]').first().inputValue();

  await t.step('first start: Welcome', () => U.welcome(w), { fatal: true });
  await t.step('create a wallet', () => U.createWallet(w, ui, password), { fatal: true, timeout: 150000 });
  if (m) await t.step('skip the tour', () => U.skipTour(w, ui));
  await size(1280, 820);

  await t.step('Contacts: the empty state', async () => {
    await U.nav(w, ui, U.PAGES[ui].find((x) => x[1] === '/addressBook'));
    await U.waitText(w, /No contacts yet/, 8000);
    await shot('empty');
    return 'empty state shown';
  }, { fatal: true });

  await t.step('add: the form checks the Epicbox address as you leave the field', async () => {
    if (m) await w.getByRole('button', { name: 'Add contact' }).first().click();
    else await w.locator('.cbook-head button.is-primary').click();
    await w.locator(`#${p}-f-name`).fill('Mara Okafor');
    await w.locator(`#${p}-f-box`).fill('esShort@epicbox.epiccash.com');
    await w.locator(`#${p}-f-ext`).click();
    await U.waitText(w, /not a complete Epicbox address/, 4000);
    if ((await w.locator(`#${p}-f-box`).getAttribute('aria-invalid')) !== 'true') throw new Error('the field is not marked invalid');
    await shot('form-error');
    await w.locator(`#${p}-f-box`).fill(BOX_MARA);
    await w.locator(`#${p}-f-ext`).fill(HTTP_MARA);
    await w.locator(`#${p}-f-note`).fill('Flatmate. Rent share on the 18th.');
    await w.locator(m ? '.e-con-form-foot button[type=submit]' : '.cbook-foot button[type=submit]').click();
    await H.waitFor(async () => (await U.contactNames(w, ui)).includes('Mara Okafor'), { timeout: 8000 });
    return 'saved after the fix: ' + (await U.contactNames(w, ui)).join(', ');
  }, { fatal: true });

  await t.step('add two more (one HTTP only)', async () => {
    await U.addContact(w, ui, { name: 'Café Lumen', http: HTTP_CAFE });
    await U.addContact(w, ui, { name: 'Juno Reyes', epicbox: BOX_JUNO });
    const n = await H.waitFor(async () => { const x = await U.contactNames(w, ui); return x.length === 3 ? x : null; }, { timeout: 8000 });
    if (!n || n.join() !== 'Café Lumen,Juno Reyes,Mara Okafor') throw new Error('list: ' + (await U.contactNames(w, ui)).join(', '));
    return n.join(', ');
  });

  await t.step('picture: an SVG named .png is refused', async () => {
    await openRow('Juno Reyes');
    await w.getByRole('button', { name: /^Edit$/ }).first().click();
    await w.locator('input[type=file]').setInputFiles(svg);
    await U.waitText(w, /not a PNG, JPEG, WebP or GIF/, 5000);
    if (await w.locator('form .cav img').count()) throw new Error('an image is shown');
    return 'refused';
  });

  await t.step('picture: a PNG is re-encoded to a small WebP without its metadata, kept in the app', async () => {
    await w.locator('input[type=file]').setInputFiles(photo);
    const src = await H.waitFor(() => w.locator('form .cav img').getAttribute('src').catch(() => null), { timeout: 8000 });
    if (!src || !src.startsWith('data:image/webp;base64,')) throw new Error('preview: ' + String(src).slice(0, 40));
    const bytes = Buffer.from(src.split(',')[1], 'base64');
    if (bytes.includes(Buffer.from('e2e-metadata-marker'))) throw new Error('the metadata survived');
    if (bytes.length > 16000) throw new Error('too big: ' + bytes.length + ' bytes');
    await shot('form-picture');
    await w.locator(m ? '.e-con-form-foot button[type=submit]' : '.cbook-foot button[type=submit]').click();
    const read = () => w.evaluate(() => new Promise((resolve) => {
      const r = indexedDB.open('EpicwalletContactAvatars');
      r.onsuccess = () => { const q = r.result.transaction('avatars').objectStore('avatars').getAll(); q.onsuccess = () => { r.result.close(); resolve(q.result.map((x) => ({ c: x.contact_id, u: x.user_id, k: x.image.slice(0, 23), n: x.image.length }))); }; };
      r.onerror = () => resolve('no db');
    }));
    const stored = await H.waitFor(async () => { const x = await read(); return Array.isArray(x) && x.length ? x : null; }, { timeout: 6000 }) || await read();
    if (!Array.isArray(stored) || stored.length !== 1 || stored[0].k !== 'data:image/webp;base64,') throw new Error('stored: ' + JSON.stringify(stored));
    //the original file is never referenced: removing it changes nothing
    fs.unlinkSync(photo);
    return `${bytes.length} bytes WebP, 128 px; stored ${JSON.stringify(stored)}`;
  });

  await t.step('edit: rename, the list follows', async () => {
    await openRow('Mara Okafor');
    await w.getByRole('button', { name: /^Edit$/ }).first().click();
    await w.locator(`#${p}-f-name`).fill('Mara O. Okafor');
    await w.locator(m ? '.e-con-form-foot button[type=submit]' : '.cbook-foot button[type=submit]').click();
    await H.waitFor(async () => (await U.contactNames(w, ui)).includes('Mara O. Okafor'), { timeout: 8000 });
    return (await U.contactNames(w, ui)).join(', ');
  });

  await t.step('the detail: copy says so', async () => {
    await openRow('Mara O. Okafor');
    await w.getByRole('button', { name: 'Copy Epicbox address' }).first().click();
    await U.waitText(w, /Copied/, 3000);
    const clip = await t.app.evaluate(({ clipboard }) => clipboard.readText());
    if (clip !== BOX_MARA) throw new Error('clipboard: ' + clip.slice(0, 20));
    await shot('detail');
    return 'Epicbox address on the clipboard';
  });

  await t.step('search and sort', async () => {
    const q = w.locator(`#${p}-q`);
    await q.fill('lumen');
    await w.waitForTimeout(200);
    const one = await U.contactNames(w, ui);
    if (one.join() !== 'Café Lumen') throw new Error('search lumen: ' + one.join(', '));
    await q.fill('');
    if (m) await w.getByRole('button', { name: 'Recent' }).click();
    else await w.locator('#cb-sort').selectOption('recent');
    await w.waitForTimeout(200);
    //no transactions yet: by recent falls back to the names
    const recent = await U.contactNames(w, ui);
    if (recent.join() !== 'Café Lumen,Juno Reyes,Mara O. Okafor') throw new Error('recent: ' + recent.join(', '));
    return 'search: ' + one.join(', ') + '; sorted by recent: ' + recent.join(', ');
  });

  if (SHOTS) {
    await t.step('narrow window, 150 % text', async () => {
      await size(1044, 760);
      await w.evaluate(() => { document.documentElement.style.fontSize = (150 * (document.documentElement.dataset.ui === 'modern' ? 1.0625 : 1)) + '%'; });
      await openRow('Mara O. Okafor').catch(() => {});
      await shot('narrow-detail');
      const back = w.getByRole('button', { name: 'All contacts' });
      if (await back.isVisible()) await back.click();
      await shot('narrow-list');
      await w.evaluate(() => { document.documentElement.style.fontSize = ''; });
      await size(1280, 820);
      return 'shots taken';
    });
    if (m) {
      await t.step('light theme', async () => {
        await w.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
        await openRow('Juno Reyes');
        await shot('light-detail');
        await w.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
        return 'shot taken';
      });
    }
  }

  await t.step('a click on a contact: Send opens with its Epicbox address; its … menu: Send via HTTP', async () => {
    await item('Mara O. Okafor').locator(row).click();
    await H.waitFor(async () => /httpSend/.test(await U.route(w)), { timeout: 5000 });
    const v = await H.waitFor(async () => { const x = await toValue(); return x || null; }, { timeout: 5000 });
    if (v !== BOX_MARA) throw new Error('recipient: ' + v);
    await shot('send-prefilled');
    await U.nav(w, ui, U.PAGES[ui].find((x) => x[1] === '/addressBook'));
    await w.waitForTimeout(300);
    await item('Mara O. Okafor').locator('.rmenu-btn').click();
    await shot('row-menu');
    await item('Mara O. Okafor').locator('[role=menuitem]', { hasText: 'Send via HTTP' }).click();
    const h = await H.waitFor(async () => { const x = await toValue(); return x === HTTP_MARA ? x : null; }, { timeout: 5000 });
    if (!h) throw new Error('recipient: ' + (await toValue()));
    return 'Epicbox by the row, HTTP from the menu';
  });

  await t.step('the … menu by keyboard: Enter opens it, ↓ moves, Esc closes back to the button', async () => {
    await U.nav(w, ui, U.PAGES[ui].find((x) => x[1] === '/addressBook'));
    await w.waitForTimeout(300);
    const btn = item('Juno Reyes').locator('.rmenu-btn');
    await btn.focus();
    await w.keyboard.press('Enter');
    const first = await w.evaluate(() => document.activeElement && document.activeElement.getAttribute('role') + ':' + document.activeElement.textContent.trim());
    if (first !== 'menuitem:Details') throw new Error('focus after Enter: ' + first);
    await w.keyboard.press('ArrowDown');
    await w.keyboard.press('Escape');
    const back = await w.evaluate(() => document.activeElement && document.activeElement.className);
    if (!/rmenu-btn/.test(back)) throw new Error('focus after Esc: ' + back);
    if (await item('Juno Reyes').locator('[role=menu]').count()) throw new Error('the menu stayed open');
    return 'Details first, Esc back to the … button';
  });

  await t.step('Send › the contact button: choose Juno, the recipient is filled (item #38)', async () => {
    await U.nav(w, ui, U.PAGES[ui].find((x) => x[1] === '/httpSend'));
    await w.getByRole('button', { name: 'Choose from contacts' }).click();
    const dlg = w.locator(m ? 'dialog.e-cpick[open]' : '.cpick');
    await dlg.waitFor({ timeout: 5000 });
    //the pictures load just after the list
    if (!(await H.waitFor(() => dlg.locator('.cav img').count(), { timeout: 5000 }))) throw new Error("Juno's picture is not in the picker");
    await shot('picker');
    await dlg.locator('input[type=search]').fill('juno');
    await dlg.getByRole('button', { name: /Juno Reyes/ }).click();
    await w.waitForTimeout(300);
    if (await dlg.isVisible()) throw new Error('the picker stayed open');
    const v = await toValue();
    if (v !== BOX_JUNO) throw new Error('recipient: ' + v);
    await shot('send-picked');
    return 'recipient ' + v.slice(0, 12) + '…';
  });

  if (SHOTS && m) {
    await t.step('Persian (right to left): Contacts and the picker', async () => {
      //Settings › Language (its save needs a reachable node: the stub first)
      await U.typeNodeAddress(w, ui);
      await U.saveNode(w, ui);
      await U.setLanguage(w, ui, 'fa');
      //the sidebar by its links (the labels are Persian now)
      await w.locator('a[href="/addressBook"]').first().click();
      await w.waitForTimeout(800);
      await openRow('Mara O. Okafor');
      await shot('rtl-detail');
      await w.locator('a[href="/httpSend"]').first().click();
      await w.waitForTimeout(800);
      await w.locator('.e-send-pick').click();
      await w.locator('dialog.e-cpick[open]').waitFor({ timeout: 5000 });
      await shot('rtl-picker');
      await w.keyboard.press('Escape');
      await U.setLanguage(w, ui, 'en');
      return 'shots taken';
    });
  }

  await t.step('delete: a quiet confirmation, then gone', async () => {
    await U.nav(w, ui, U.PAGES[ui].find((x) => x[1] === '/addressBook'));
    await openRow('Café Lumen');
    await w.locator('.e-con-del, .cbook-del-btn').first().click();
    await shot('delete');
    await w.getByRole('button', { name: 'Keep contact' }).click();
    if (!(await U.contactNames(w, ui)).includes('Café Lumen')) throw new Error('Keep deleted it');
    //this time from the row's … menu
    await menuPick('Café Lumen', 'Delete');
    await w.locator(m ? 'dialog[open]' : '.modal.is-active').getByRole('button', { name: 'Delete contact' }).click();
    const n = await H.waitFor(async () => { const x = await U.contactNames(w, ui); return x.length === 2 ? x : null; }, { timeout: 5000 });
    if (!n) throw new Error('still listed: ' + (await U.contactNames(w, ui)).join(', '));
    return n.join(', ');
  });

  await t.step('quit', () => t.quit(), { fatal: true, timeout: 60000 });
});
