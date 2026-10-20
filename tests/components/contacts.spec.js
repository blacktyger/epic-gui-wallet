/*
 * Contacts in both interfaces (Classic AddressBook.vue, Modern ContactsView.vue: the same logic) and
 * the Send screen's contact picker (Classic HttpSend.vue, Modern SendView.vue): picking a contact on
 * Send fills the recipient (tester item #38), Contacts › Send opens Send on that contact, the list
 * (avatars, search, sort), the form's live checks, a stored contact's hidden fields kept on save,
 * delete, copy, and a contact's own picture.
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import AddressBook from '@/components/AddressBook.vue';
import ContactsView from '@/components/modern/views/ContactsView.vue';
import HttpSend from '@/components/HttpSend.vue';
import SendView from '@/components/modern/views/SendView.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { button } from './support/dom.js';
import { fakeSendWallet } from './support/sendWallet.js';

//the picture pipeline needs a real page (createImageBitmap, canvas): its checks are unit-tested in
//tests/avatarImage.test.js; here it returns a made picture
vi.mock('@/shared/avatarImage.js', async (orig) => ({
  ...(await orig()),
  makeAvatar: vi.fn(async () => ({ dataUrl: 'data:image/webp;base64,UklGRiIAAABXRUJQ' })),
}));

const BOX = 'esWVc4Ex1SLvZLt8mAoMy1vabFzStbqTZHM3JSbzdGfKoECG2mNs@epicbox.epiccash.com';
const HTTP = 'http://203.0.113.5:3415';
const WEBP = 'data:image/webp;base64,UklGRiIAAABXRUJQ';

/* the wallet's contacts (user 1), one of another wallet (user 2), and one stored by 6.0 with a Tor
   address and payment proof fields the screens no longer show */
function rows() {
  return [
    { id: 4, user_id: 1, name: 'Mara Okafor', country: 'PL', city: 'Kraków', onion: '', alwaysproof: false, proofaddr: '', externalOne: BOX, externalTwo: HTTP, notice: 'Flatmate' },
    { id: 5, user_id: 1, name: 'Café Lumen', country: '', city: '', onion: '', alwaysproof: false, proofaddr: '', externalOne: '', externalTwo: 'http://cafe.example:3415', notice: '' },
    { id: 6, user_id: 1, name: 'Old Friend', country: '', city: '', onion: 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion', alwaysproof: true, proofaddr: 'b4e2a7c6d1f0e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4', externalOne: 'esNmrkdAvQKzs3QkbEcWv5Lq1pZ8TxFh2yJgR9oBcDe7UiWa4nXs@epicbox.epiccash.com', externalTwo: '', notice: '' },
    { id: 9, user_id: 2, name: 'Not mine', country: '', city: '', onion: '', alwaysproof: false, proofaddr: '', externalOne: BOX, externalTwo: '', notice: '' },
  ];
}

function fakeBook(list = rows()) {
  let next = 20;
  const book = {
    list,
    getAddress: vi.fn(async (uid) => book.list.filter((r) => r.user_id == uid).sort((a, b) => a.name.localeCompare(b.name))),
    getAddressById: vi.fn(async (id) => book.list.filter((r) => r.id == id)),
    findAddress: vi.fn(async () => []),
    addAddress: vi.fn(async (row) => { const r = { ...row, id: next++ }; book.list.push(r); return [r]; }),
    updateAddressById: vi.fn(async (id, set) => { const r = book.list.find((x) => x.id == id); Object.assign(r, set); return 1; }),
    removeAddress: vi.fn(async (id) => { book.list = book.list.filter((r) => r.id != id); return 1; }),
  };
  return book;
}

function fakeAvatars(initial = {}) {
  const m = new Map(Object.entries(initial).map(([k, v]) => [Number(k), v]));
  return {
    m,
    forUser: vi.fn(async () => new Map(m)),
    set: vi.fn(async (u, c, v) => { m.set(c, v); return true; }),
    remove: vi.fn(async (u, c) => { m.delete(c); }),
  };
}

const BOOKS = [
  { name: 'Classic', Component: AddressBook },
  { name: 'Modern', Component: ContactsView },
];

async function openBook(ui, { book = fakeBook(), avatars = fakeAvatars(), txs = [] } = {}) {
  const store = makeStore({ txs });
  const m = mountView(ui.Component, { store, services: { $addressBookService: book, $contactAvatars: avatars } });
  await flushPromises();
  return { ...m, book, avatars, w: m.wrapper };
}
const rowNames = (w) => w.findAll('li button[aria-current], li .cbook-row, li .e-con-row').map((b) => b.find('b').text());
const pick = async (w, name) => {
  const row = w.findAll('.cbook-row, .e-con-row').find((b) => b.text().includes(name));
  await row.trigger('click');
  await flushPromises();
};

describe.each(BOOKS)('Contacts ($name)', (ui) => {
  test('the list: avatars with initials, the short address, the kinds; only this wallet\'s contacts', async () => {
    const { w } = await openBook(ui);
    const names = w.findAll('.cbook-row b, .e-con-row b').map((b) => b.text());
    expect(names).toEqual(['Café Lumen', 'Mara Okafor', 'Old Friend']);
    const mara = w.findAll('.cbook-row, .e-con-row').find((b) => b.text().includes('Mara'));
    expect(mara.find('.cav').text()).toBe('MO');
    expect(mara.text()).toContain('esWVc4…2mNs@epicbox.epiccash.com');
    expect(mara.text()).toContain(t('msg.contacts.kind_epicbox'));
    expect(mara.text()).toContain(t('msg.contacts.kind_http'));
    expect(w.text()).not.toContain('Not mine');
    //the hidden Tor address is not shown anywhere
    expect(w.text()).not.toContain('.onion');
  });

  test('search filters as you type; nothing found says so', async () => {
    const { w } = await openBook(ui);
    const q = w.find('input[type=search]');
    await q.setValue('kraków');
    expect(w.findAll('.cbook-row b, .e-con-row b').map((b) => b.text())).toEqual(['Mara Okafor']);
    await q.setValue('cafe.example');
    expect(w.findAll('.cbook-row b, .e-con-row b').map((b) => b.text())).toEqual(['Café Lumen']);
    await q.setValue('zzz');
    expect(w.text()).toContain(t('msg.modern.settings.no_results'));
  });

  test('sort by recent: the contact with the newest transaction first, and when it was', async () => {
    const txs = [
      { id: 1, creation_ts: new Date(Date.now() - 86400000).toISOString(), address: { address: 6 } },
      { id: 2, creation_ts: '2026-01-02T10:00:00Z', address: { address: 5 } },
    ];
    const { w } = await openBook(ui, { txs });
    w.vm.sort = 'recent';
    await flushPromises();
    expect(w.findAll('.cbook-row b, .e-con-row b').map((b) => b.text())).toEqual(['Old Friend', 'Café Lumen', 'Mara Okafor']);
    expect(w.text()).toContain('yesterday');
  });

  test('a contact\'s Send opens Send on that contact (its id and field, not the address)', async () => {
    const { w, $router } = await openBook(ui);
    await pick(w, 'Mara');
    await button(w, t('msg.contacts.send_http'), { partial: true }).trigger('click');
    expect($router.push).toHaveBeenCalledWith({ name: 'httpSend', query: { contact: '4', use: 'externalTwo' } });
    await pick(w, 'Café');
    await button(w, t('msg.contacts.send'), { partial: true }).trigger('click');
    expect($router.push).toHaveBeenLastCalledWith({ name: 'httpSend', query: { contact: '5', use: 'externalTwo' } });
  });

  test('copy puts the address on the clipboard and the button says so', async () => {
    const { w } = await openBook(ui);
    await pick(w, 'Mara');
    const copy = w.findAll('button').find((b) => b.attributes('aria-label') == t('msg.modern.settings.copy_field', { what: t('msg.contacts.epicbox_address') }));
    await copy.trigger('click');
    expect(window.clipboard.writeText).toHaveBeenCalledWith(BOX);
    expect(copy.text()).toContain(t('msg.contacts.copied'));
  });

  test('the form checks fields as you leave them, and Save refuses with the field marked', async () => {
    const { w, book } = await openBook(ui);
    await w.vm.create();
    await flushPromises();
    const name = w.find('input[id$=f-name]');
    const box = w.find('input[id$=f-box]');
    await box.setValue('esShort@epicbox.epiccash.com');
    await box.trigger('blur');
    expect(w.text()).toContain(t('msg.contacts.err_epicbox'));
    expect(box.attributes('aria-invalid')).toBe('true');
    await w.find('form[novalidate]').trigger('submit');
    await flushPromises();
    expect(book.addAddress).not.toHaveBeenCalled();
    expect(w.text()).toContain(t('msg.contacts.err_name'));
    //a Tor address has its own message
    const web = w.find('input[id$=f-ext]');
    await web.setValue('http://' + 'a'.repeat(56) + '.onion');
    await web.trigger('blur');
    expect(w.text()).toContain(t('msg.contacts.err_onion'));
    expect(name.exists()).toBe(true);
  });

  test('a new contact is saved trimmed, with its picture, and then shown', async () => {
    const { w, book, avatars } = await openBook(ui);
    await w.vm.create();
    await flushPromises();
    await w.find('input[id$=f-name]').setValue('  Ines Duarte ');
    await w.find('input[id$=f-box]').setValue(' ' + BOX + ' ');
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'me.png', { type: 'image/png' });
    const input = w.find('input[type=file]');
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await flushPromises();
    expect(w.find('form[novalidate] .cav img').attributes('src')).toBe(WEBP);
    await w.find('form[novalidate]').trigger('submit');
    await flushPromises();
    expect(book.addAddress).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ines Duarte', externalOne: BOX, externalTwo: '', onion: '', user_id: 1 }));
    expect(avatars.set).toHaveBeenCalledWith(1, 20, WEBP);
    expect(w.find('h2').text()).toBe('Ines Duarte');
  });

  test('editing a contact an older version stored keeps its hidden Tor and proof fields', async () => {
    const { w, book } = await openBook(ui);
    await pick(w, 'Old Friend');
    await button(w, t('msg.edit'), { partial: true }).trigger('click');
    await w.find('input[id$=f-name]').setValue('Old Friend (2019)');
    await w.find('form[novalidate]').trigger('submit');
    await flushPromises();
    expect(book.updateAddressById).toHaveBeenCalledWith(6, expect.objectContaining({
      name: 'Old Friend (2019)',
      onion: 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion',
      proofaddr: 'b4e2a7c6d1f0e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4',
      alwaysproof: true,
    }));
  });

  test('delete asks quietly; Keep keeps it, Delete removes the contact and its picture', async () => {
    const { w, book, avatars } = await openBook(ui, { avatars: fakeAvatars({ 5: WEBP }) });
    await pick(w, 'Café');
    expect(w.find('.cav img').attributes('src')).toBe(WEBP);
    await w.find('.e-con-del, .cbook-del-btn').trigger('click');
    await flushPromises();
    await button(w, t('msg.modern.settings.keep_contact')).trigger('click');
    expect(book.removeAddress).not.toHaveBeenCalled();
    await w.find('.e-con-del, .cbook-del-btn').trigger('click');
    await button(w, t('msg.modern.settings.delete_contact'), { partial: true }).trigger('click');
    await flushPromises();
    expect(book.removeAddress).toHaveBeenCalledWith(5);
    expect(avatars.remove).toHaveBeenCalledWith(1, 5);
    expect(w.findAll('.cbook-row b, .e-con-row b').map((b) => b.text())).toEqual(['Mara Okafor', 'Old Friend']);
  });

  test('focus: Add contact and Edit go to the name, a refused Save to the first wrong field', async () => {
    const { w } = await openBook(ui);
    await w.vm.create();
    await flushPromises();
    expect(document.activeElement && document.activeElement.id).toMatch(/f-name$/);
    await w.find('input[id$=f-name]').setValue('Bob');
    await w.find('input[id$=f-box]').setValue('nope');
    await w.find('form[novalidate]').trigger('submit');
    await flushPromises();
    expect(document.activeElement && document.activeElement.id).toMatch(/f-box$/);
  });

  test('a picture still being made when another contact is opened is not put on that contact', async () => {
    const { makeAvatar } = await import('@/shared/avatarImage.js');
    let finish;
    makeAvatar.mockImplementationOnce(() => new Promise((r) => { finish = () => r({ dataUrl: WEBP }); }));
    const { w, avatars, book } = await openBook(ui);
    await pick(w, 'Mara');
    await button(w, t('msg.edit'), { partial: true }).trigger('click');
    const input = w.find('input[type=file]');
    Object.defineProperty(input.element, 'files', { value: [new File([new Uint8Array([1])], 'a.png')], configurable: true });
    await input.trigger('change');
    //Café opened and edited while Mara's picture is still being made
    await pick(w, 'Café');
    await button(w, t('msg.edit'), { partial: true }).trigger('click');
    finish();
    await flushPromises();
    expect(w.find('form[novalidate] .cav img').exists()).toBe(false);
    await w.find('form[novalidate]').trigger('submit');
    await flushPromises();
    expect(book.updateAddressById).toHaveBeenCalledWith(5, expect.anything());
    expect(avatars.set).not.toHaveBeenCalled();
  });

  test('no contacts: the empty state, not an empty list', async () => {
    const { w } = await openBook(ui, { book: fakeBook([]) });
    expect(w.text()).toContain(t('msg.modern.settings.empty_title'));
  });
});

/* ---- Send: choosing a contact ---- */

const SENDS = [
  { name: 'Classic', Component: HttpSend, dialog: (w) => w.find('.cpick') },
  { name: 'Modern', Component: SendView, dialog: (w) => w.find('dialog.e-cpick') },
];

async function openSend(ui, { book = fakeBook(), route = {}, avatars = fakeAvatars({ 4: WEBP }) } = {}) {
  const store = makeStore({ summary: { spendable: 10, unconfirmed: 0 } });
  const m = mountView(ui.Component, { store, route, services: { $walletService: fakeSendWallet(), $addressBookService: book, $contactAvatars: avatars } });
  await flushPromises();
  const w = m.wrapper;
  return { ...m, book, w, to: w.find('input[placeholder="' + t('msg.httpSend.address') + '"]') };
}
const isOpen = (ui, w) => {
  const d = ui.dialog(w);
  return d.exists() && (d.element.tagName == 'DIALOG' ? d.element.open : true);
};

describe.each(SENDS)('Send › choose a contact ($name)', (ui) => {
  test('the contact button opens the picker; choosing a name fills the recipient with its Epicbox address (item #38)', async () => {
    const s = await openSend(ui);
    await s.w.find('button[aria-label="' + t('msg.contacts.picker_open') + '"]').trigger('click');
    await flushPromises();
    expect(isOpen(ui, s.w)).toBe(true);
    const d = ui.dialog(s.w);
    expect(d.text()).toContain('Mara Okafor');
    expect(d.text()).toContain('Café Lumen');
    expect(d.text()).not.toContain('Not mine');
    //its picture
    expect(d.find('.cav img').attributes('src')).toBe(WEBP);
    await d.findAll('button').find((b) => b.text().includes('Mara Okafor')).trigger('click');
    await flushPromises();
    expect(s.to.element.value).toBe(BOX);
    expect(s.w.vm.epicboxSelected).toBe(true);
    expect(isOpen(ui, s.w)).toBe(false);
  });

  test('a contact with an HTTP address too: its HTTP button fills that one', async () => {
    const s = await openSend(ui);
    await s.w.find('button[aria-label="' + t('msg.contacts.picker_open') + '"]').trigger('click');
    await flushPromises();
    const alt = ui.dialog(s.w).find('button[aria-label="' + t('msg.contacts.use_http_label', { name: 'Mara Okafor' }) + '"]');
    await alt.trigger('click');
    await flushPromises();
    expect(s.to.element.value).toBe(HTTP);
    expect(s.w.vm.epicboxSelected).toBe(false);
  });

  test('the picker searches as you type', async () => {
    const s = await openSend(ui);
    await s.w.find('button[aria-label="' + t('msg.contacts.picker_open') + '"]').trigger('click');
    await flushPromises();
    const d = ui.dialog(s.w);
    await d.find('input[type=search]').setValue('lumen');
    expect(d.text()).toContain('Café Lumen');
    expect(d.text()).not.toContain('Mara Okafor');
    await d.find('input[type=search]').setValue('nobody');
    expect(d.text()).toContain(t('msg.contacts.picker_none', { q: 'nobody' }));
  });

  test('no contacts yet: the picker says so and offers Contacts', async () => {
    const s = await openSend(ui, { book: fakeBook([]) });
    await s.w.find('button[aria-label="' + t('msg.contacts.picker_open') + '"]').trigger('click');
    await flushPromises();
    expect(ui.dialog(s.w).text()).toContain(t('msg.contacts.picker_empty_title'));
  });

  test('Contacts › Send: the contact\'s address is filled in, the review shows its name', async () => {
    const s = await openSend(ui, { route: { query: { contact: '4', use: 'externalTwo' } } });
    expect(s.book.getAddressById).toHaveBeenCalledWith(4);
    expect(s.to.element.value).toBe(HTTP);
    expect(s.w.vm.contact ? s.w.vm.contact.name : s.w.vm.address.name).toBe('Mara Okafor');
  });

  test('Contacts › Send with a contact of another wallet fills nothing and says so', async () => {
    const s = await openSend(ui, { route: { query: { contact: '9' } } });
    expect(s.to.element.value).toBe('');
    expect(s.$toast.error).toHaveBeenCalledWith(t('msg.contacts.send_missing'));
  });

  test('a Tor address an older version kept is never filled in: the wallet has no Tor', async () => {
    const book = fakeBook([{ id: 7, user_id: 1, name: 'Tor shop', country: '', city: '', onion: '', alwaysproof: false, proofaddr: '', externalOne: '', externalTwo: 'http://' + 'a'.repeat(56) + '.onion', notice: '' }]);
    const s = await openSend(ui, { book, route: { query: { contact: '7' } } });
    await flushPromises();
    expect(s.to.element.value).toBe('');
    expect(s.$toast.error).toHaveBeenCalledWith(t('msg.contacts.err_address'));
    //and the picker does not list it
    await s.w.find('button[aria-label="' + t('msg.contacts.picker_open') + '"]').trigger('click');
    await flushPromises();
    expect(ui.dialog(s.w).text()).not.toContain('Tor shop');
  });

  test('a typed address is not overwritten by a late Contacts › Send prefill', async () => {
    const book = fakeBook();
    let release;
    book.getAddressById = vi.fn(() => new Promise((r) => { release = () => r(book.list.filter((x) => x.id == 4)); }));
    const s = await openSend(ui, { book, route: { query: { contact: '4' } } });
    await s.to.setValue(HTTP);
    release();
    await flushPromises();
    expect(s.to.element.value).toBe(HTTP);
  });
});
