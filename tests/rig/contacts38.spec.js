// Contacts (GUI feedback #38, branch feat/contacts), Modern only (Classic is frozen, not tested): add with the live checks, a
// contact's own picture (an SVG named .png refused; a PNG re-encoded to a small WebP without its
// metadata, kept in the app's IndexedDB), edit, copy, search, Contacts > Send (address filled), the
// Send screen's contact picker, delete. Port of the GUI repo's tests/e2e/specs/contacts.js. Same
// profile / stub node set-up as gate.spec.js; nothing is sent.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const A = require('../lib/app');
const U = require('../lib/gateui');
const lock = require('../lib/lock');
const { makeProfile } = require('../lib/env');
const { createFlows } = require('../lib/flows');
const { startStubNode } = require('../lib/stubnode');

const PROFILES = process.env.WINTEST_PROFILES || path.join(A.RUN, 'profiles');
const BOX_MARA = 'esYmsDGgwGPf5D6KPAW3j3jMbQojJ1UKwr44RwiEG7AZkV8V7uWh@epicbox.epiccash.com';
const BOX_JUNO = 'esWVc4Ex1SLvZLt8mAoMy1vabFzStbqTZHM3JSbzdGfKoECG2mNs@epicbox.epiccash.com';
const HTTP_MARA = 'http://192.0.2.55:3415';
const HTTP_CAFE = 'http://198.51.100.7:3415';
// servers: the local stub node only (nothing is sent), and Epicbox on BT Labs' preferred order
// (epicbox.epicnet.us, then epicbox.stackwallet.com; never the official one first). CONTACTS_EPICBOX overrides it.
const EPICBOX = process.env.CONTACTS_EPICBOX || 'epicbox.epicnet.us';

function pngWithMetadata(file) {
  const tbl = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = tbl[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const w = 400, h = 300;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = (x * 255 / w) | 0; raw[i + 1] = (y * 255 / h) | 0; raw[i + 2] = 160; }
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('Comment\0GPS 52.2297N rig-metadata-marker')), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

function contacts(ui) {
  const spec = `contacts38-${ui}`;
  const m = ui === 'modern';
  const p = m ? 'con' : 'cb';
  const row = m ? '.e-con-row' : '.cbook-row';
  let ctx = null, profile = null, node = null, password = '';
  const F = createFlows(spec, { win: () => ctx && ctx.win });
  const S = async name => { if (!ctx || !ctx.win || ctx.win.isClosed()) return; F.attachShot(await A.shot(ctx.win, name.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+$/, ''), spec)); };
  const w = () => ctx.win;
  const flow = (name, fn, opts = {}) => F.flow(name, async rec => { const r = await fn(rec); if (r) F.note('seen', A.redact(String(r)).slice(0, 400)); if (opts.shot) await S(opts.shot); }, opts);

  const names = () => w().evaluate(sel => [...document.querySelectorAll(sel + ' b')].map(e => e.innerText.trim()), row);
  //a row sends; its details are the first item of its … menu
  const item = name => w().locator('.e-con-item').filter({ has: w().locator('b', { hasText: name }) }).first();
  //a narrow window (the rig's is ~1030 px) shows the list or one contact: back to the list first
  const listUp = async () => { const b = w().getByRole('button', { name: 'All contacts' }); if (await b.count() && await b.first().isVisible()) { await b.first().click(); await w().waitForTimeout(200); } };
  const menuPick = async (name, i) => {
    await listUp();
    await item(name).locator('.rmenu-btn').click();
    const items = item(name).locator('[role=menuitem]');
    await (typeof i === 'number' ? items.nth(i) : items.filter({ hasText: i }).first()).click();
    await w().waitForTimeout(200);
  };
  const openRow = name => menuPick(name, 0);
  const submit = () => w().locator(m ? '.e-con-form-foot button[type=submit]' : '.cbook-foot button[type=submit]').click();
  const add = async ({ name, box = '', http = '' }) => {
    if (m) await w().getByRole('button', { name: 'Add contact' }).first().click(); else await w().locator('.cbook-head button.is-primary').click();
    await w().locator(`#${p}-f-name`).fill(name);
    if (box) await w().locator(`#${p}-f-box`).fill(box);
    if (http) await w().locator(`#${p}-f-ext`).fill(http);
    await submit();
    if (!await A.waitFor(async () => (await names()).includes(name), { timeout: 8000 })) throw new Error(`${name} not listed: ${(await names()).join(', ')}`);
  };
  const toValue = () => w().locator('input[placeholder*="address" i]').first().inputValue();
  const page = to => U.nav(w(), ui, U.PAGES[ui].find(x => x[1] === to));

  test.describe.serial(`contacts38 ${ui} (${A.BUILD})`, () => {
    test.beforeAll(async () => {
      test.setTimeout(120 * 60 * 1000);
      expect(A.EXE, 'WINTEST_EXE must point at an unpacked EpicWallet.exe').toBeTruthy();
      await lock.acquire(`${spec}:${A.BUILD}`);
      await A.assertPortsFree();
      const nlog = path.join(A.mkdirp(path.join(A.RUN, 'logs')), `${spec}.stub-node.log`);
      node = await startStubNode({ port: 13413, log: l => fs.appendFileSync(nlog, `${new Date().toISOString().slice(11, 23)} ${l}\n`) });
      profile = makeProfile(path.join(PROFILES, spec), 'wintest');
      if (!m) {
        A.mkdirp(profile.epicGuiDir);
        fs.writeFileSync(path.join(profile.epicGuiDir, 'settings.json'), JSON.stringify({ schema: 1, app: { ui: 'classic', theme: 'dark', scale: 100, locale: '' } }, null, 2));
      }
      password = 'Gate-' + crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) + '-7';
      A.setSecrets({ passwords: [password] });
      ctx = await A.launch({ profile, logName: spec });
    });

    test.afterAll(async () => {
      await A.close(ctx);
      A.killBuildProcesses(A.EXE);
      if (node) await node.close();
      lock.release();
    });

    test(`contacts (${ui})`, async () => {
      test.setTimeout(20 * 60 * 1000);
      const pics = A.mkdirp(path.join(PROFILES, spec + '-pictures'));
      const photo = path.join(pics, 'juno.png');
      const svg = path.join(pics, 'evil.png');
      pngWithMetadata(photo);
      fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="5"/></svg>');

      await flow('first start: Welcome', () => U.welcome(w()));
      F.gate('first start: Welcome');
      await flow('create a wallet', () => U.createWallet(w(), ui, password));
      F.gate('create a wallet');
      if (m) await flow('skip the tour', async () => { try { return await U.skipTour(w(), ui); } finally { await require('../lib/ui').closeTour(w()); } });

      await flow(`servers: node = the local stub, Epicbox = ${EPICBOX} (no official Epic server)`, async () => {
        await U.typeNodeAddress(w(), ui);
        await w().locator('#stg-relay').fill(EPICBOX);
        const r = await U.saveNode(w(), ui);
        await U.openSettings(w(), ui);
        const relay = await w().locator('#stg-relay').inputValue();
        if (relay !== EPICBOX) throw new Error('Epicbox field: ' + relay);
        return r + '; Epicbox ' + relay;
      });
      F.gate(`servers: node = the local stub, Epicbox = ${EPICBOX} (no official Epic server)`);
      await flow('Contacts: empty state', async () => { await page('/addressBook'); await U.waitText(w(), /No contacts yet/, 8000); }, { shot: 'empty' });
      await flow('add: a bad Epicbox address is said under the field', async () => {
        if (m) await w().getByRole('button', { name: 'Add contact' }).first().click(); else await w().locator('.cbook-head button.is-primary').click();
        await w().locator(`#${p}-f-name`).fill('Mara Okafor');
        await w().locator(`#${p}-f-box`).fill('esShort@epicbox.epiccash.com');
        await w().locator(`#${p}-f-ext`).click();
        await U.waitText(w(), /not a complete Epicbox address/, 4000);
        await S('form-error');
        await w().locator(`#${p}-f-box`).fill(BOX_MARA);
        await w().locator(`#${p}-f-ext`).fill(HTTP_MARA);
        await submit();
        if (!await A.waitFor(async () => (await names()).includes('Mara Okafor'), { timeout: 8000 })) throw new Error('not saved');
      });
      await flow('add two more', async () => { await add({ name: 'Café Lumen', http: HTTP_CAFE }); await add({ name: 'Juno Reyes', box: BOX_JUNO }); return (await names()).join(', '); });
      await flow('picture: SVG refused, PNG re-encoded (WebP, no metadata), stored in the app', async () => {
        await openRow('Juno Reyes');
        await w().getByRole('button', { name: /^Edit$/ }).first().click();
        await w().locator('input[type=file]').setInputFiles(svg);
        await U.waitText(w(), /not a PNG, JPEG, WebP or GIF/, 5000);
        await w().locator('input[type=file]').setInputFiles(photo);
        const src = await A.waitFor(() => w().locator('form .cav img').getAttribute('src').catch(() => null), { timeout: 8000 });
        if (!src || !src.startsWith('data:image/webp;base64,')) throw new Error('preview: ' + String(src).slice(0, 40));
        const bytes = Buffer.from(src.split(',')[1], 'base64');
        if (bytes.includes(Buffer.from('rig-metadata-marker'))) throw new Error('metadata survived');
        await S('form-picture');
        await submit();
        await w().waitForTimeout(500);
        const stored = await w().evaluate(() => new Promise(res => { const r = indexedDB.open('EpicwalletContactAvatars'); r.onsuccess = () => { const q = r.result.transaction('avatars').objectStore('avatars').getAll(); q.onsuccess = () => res(q.result.map(x => x.image.slice(0, 23))); }; r.onerror = () => res('no db'); }));
        if (JSON.stringify(stored) !== JSON.stringify(['data:image/webp;base64,'])) throw new Error('stored: ' + JSON.stringify(stored));
        fs.unlinkSync(photo);
        return `${bytes.length} bytes WebP`;
      });
      await flow('edit: rename', async () => {
        await openRow('Mara Okafor');
        await w().getByRole('button', { name: /^Edit$/ }).first().click();
        await w().locator(`#${p}-f-name`).fill('Mara O. Okafor');
        await submit();
        if (!await A.waitFor(async () => (await names()).includes('Mara O. Okafor'), { timeout: 8000 })) throw new Error((await names()).join(', '));
      });
      await flow('copy: on the clipboard, the button says Copied', async () => {
        await openRow('Mara O. Okafor');
        await w().getByRole('button', { name: 'Copy Epicbox address' }).first().click();
        await U.waitText(w(), /Copied/, 3000);
        const clip = await ctx.app.evaluate(({ clipboard }) => clipboard.readText());
        if (clip !== BOX_MARA) throw new Error('clipboard: ' + clip.slice(0, 16));
      }, { shot: 'detail' });
      await flow('search', async () => {
        await listUp();
        await w().locator(`#${p}-q`).fill('lumen'); await w().waitForTimeout(200);
        const n = await names(); await w().locator(`#${p}-q`).fill('');
        if (n.join() !== 'Café Lumen') throw new Error(n.join(', '));
      });
      await flow('a click on a contact: Send opens with its Epicbox address', async () => {
        await listUp();
        await item('Mara O. Okafor').locator(row).click();
        const v = await A.waitFor(async () => (await toValue()) || null, { timeout: 6000 });
        if (v !== BOX_MARA) throw new Error('recipient: ' + v);
      }, { shot: 'send-prefilled' });
      await flow('the … menu: Send via HTTP; by keyboard Enter opens it, Esc closes it', async () => {
        await page('/addressBook');
        await w().waitForTimeout(300);
        await item('Mara O. Okafor').locator('.rmenu-btn').click();
        await S('row-menu');
        await item('Mara O. Okafor').locator('[role=menuitem]', { hasText: 'Send via HTTP' }).click();
        if (!await A.waitFor(async () => (await toValue()) === HTTP_MARA, { timeout: 6000 })) throw new Error('recipient: ' + (await toValue()));
        await page('/addressBook');
        await w().waitForTimeout(300);
        await item('Juno Reyes').locator('.rmenu-btn').focus();
        await w().keyboard.press('Enter');
        const first = await w().evaluate(() => document.activeElement && document.activeElement.textContent.trim());
        await w().keyboard.press('Escape');
        const back = await w().evaluate(() => document.activeElement && document.activeElement.className);
        if (first !== 'Details' || !/rmenu-btn/.test(back)) throw new Error(`focus ${first} / ${back}`);
      });
      await flow('Send > Choose from contacts: Juno fills the recipient (#38)', async () => {
        await page('/httpSend');
        await w().getByRole('button', { name: 'Choose from contacts' }).click();
        const dlg = w().locator(m ? 'dialog.e-cpick[open]' : '.cpick');
        await dlg.waitFor({ timeout: 5000 });
        if (!await A.waitFor(() => dlg.locator('.cav img').count(), { timeout: 5000 })) throw new Error('no picture in the picker');
        await S('picker');
        await dlg.getByRole('button', { name: /Juno Reyes/ }).click();
        await w().waitForTimeout(300);
        const v = await toValue();
        if (v !== BOX_JUNO) throw new Error('recipient: ' + v);
      }, { shot: 'send-picked' });
      await flow('delete: Keep keeps, Delete removes', async () => {
        await page('/addressBook');
        await openRow('Café Lumen');
        await w().locator('.e-con-del, .cbook-del-btn').first().click();
        await w().getByRole('button', { name: 'Keep contact' }).click();
        await menuPick('Café Lumen', 'Delete');
        await w().locator(m ? 'dialog[open]' : '.modal.is-active').getByRole('button', { name: 'Delete contact' }).click();
        if (!await A.waitFor(async () => (await names()).length === 2, { timeout: 5000 })) throw new Error((await names()).join(', '));
      }, { shot: 'after-delete' });

      expect(F.failed().map(f => `${f.name}: ${f.error}`)).toEqual([]);
    });
  });
}

contacts('modern');
