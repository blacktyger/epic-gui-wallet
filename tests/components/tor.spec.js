/*
 * Tor in the Modern screens (spec docs/plans/tor-616.md §6): the Direct transactions block in
 * Settings › Receiving, the Direct addresses on Receive, Send to a Tor address (Tor on and off, a typo, progress, errors) and the Contacts
 * Tor address field. The backend is faked: store.state.tor, the app.setTor / app.startTor events and walletService /
 * sendOverTor.
 */
import { describe, test, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { flushPromises } from '@vue/test-utils';
import DirectTxRow from '@/components/modern/settings/DirectTxRow.vue';
import ReceiveView from '@/components/modern/views/ReceiveView.vue';
import SendView from '@/components/modern/views/SendView.vue';
import ContactsView from '@/components/modern/views/ContactsView.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { button } from './support/dom.js';
import { fakeSendWallet, NANO } from './support/sendWallet.js';
import txDisplay from '@/components/modern/activity/txDisplay.js';

function makeOnion(seed = 7) {
  const pub = Buffer.alloc(32, seed);
  const sum = createHash('sha3-256').update(Buffer.concat([Buffer.from('.onion checksum'), pub, Buffer.from([3])])).digest().subarray(0, 2);
  const raw = Buffer.concat([pub, sum, Buffer.from([3])]);
  const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = '';
  for (const b of raw) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
const NAME = makeOnion();
const ONION = NAME + '.onion';
const TYPO = NAME.slice(0, 10) + (NAME[10] == 'a' ? 'b' : 'a') + NAME.slice(11) + '.onion';

const OFF = { enabled: false, state: 'off', progress: 0, onion: '', error: '', detail: '' };
const tor = (o) => ({ enabled: true, state: 'starting', progress: 0, onion: '', error: '', detail: '', ...o });
const k = (key) => 'msg.modern.settings.tor.' + key;

describe('Settings › Receiving › Direct transactions', () => {
  const D = (o) => ({ on: false, http: false, tor: true, public: false, wantPublic: false, ...o });
  function row(direct, torState = OFF, extra = {}) {
    const store = makeStore({ direct: D(direct), tor: torState, ...extra });
    const services = { configService: { config: { direct_autostart: true }, walletListenerPort: 3415 } };
    return mountView(DirectTxRow, { store, services });
  }

  test('off: only the title, the text with its info tip and the switch', () => {
    const { wrapper } = row({ on: false });
    expect(wrapper.text()).toContain(t('msg.modern.settings.direct.title'));
    expect(wrapper.text()).toContain(t('msg.modern.settings.direct.text'));
    expect(wrapper.find('[data-test=direct-info]').exists()).toBe(true);
    expect(wrapper.find('[data-test=direct-switch]').element.checked).toBe(false);
    for (const s of ['direct-chips', 'direct-status', 'direct-autostart', 'direct-tor-details', 'direct-reach']) expect(wrapper.find('[data-test=' + s + ']').exists()).toBe(false);
  });

  test('the switch asks for Direct on', async () => {
    const { wrapper, emitter } = row({ on: false });
    const input = wrapper.find('[data-test=direct-switch]');
    input.element.checked = true;
    await input.trigger('change');
    expect(emitter.emit).toHaveBeenCalledWith('app.direct', { on: true });
  });

  test('on with Tor only: the chips, starting progress, Tor details, Start with the wallet; the last chip stays on', async () => {
    const { wrapper, emitter } = row({ on: true, tor: true }, tor({ progress: 45 }));
    expect(wrapper.find('[data-test=direct-chip-tor]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-test=direct-chip-http]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('[data-test=direct-status]').text()).toContain(t(k('connecting'), { n: 45 }));
    expect(wrapper.find('[data-test=direct-tor-details]').exists()).toBe(true);
    expect(wrapper.find('[data-test=direct-autostart]').exists()).toBe(true);
    //no HTTP address or Reachable with Tor alone
    expect(wrapper.find('[data-test=direct-reach]').exists()).toBe(false);
    await wrapper.find('[data-test=direct-chip-tor]').trigger('click');
    expect(emitter.emit).not.toHaveBeenCalledWith('app.direct', expect.anything());
    await wrapper.find('[data-test=direct-chip-http]').trigger('click');
    expect(emitter.emit).toHaveBeenCalledWith('app.direct', { http: true, tor: true });
  });

  test('Tor ready: the onion address with copy', () => {
    const { wrapper } = row({ on: true, tor: true }, tor({ state: 'ready', progress: 100, onion: ONION }));
    expect(wrapper.find('[data-test=direct-onion]').exists()).toBe(true);
    expect(wrapper.find('[data-test=tor-onion]').text()).toBe(ONION);
    expect(wrapper.find('[data-test=direct-status]').text()).toContain(t('msg.modern.settings.direct.st_tor'));
  });

  test('HTTP on: the local address, Reachable Local only, and a port-busy error with an inline Retry', () => {
    const on = row({ on: true, http: true, tor: false }, OFF, { httpListener: { state: 'on', port: 3415, reason: '' } });
    expect(on.wrapper.find('[data-test=direct-http-addr]').text()).toContain('http://127.0.0.1:3415');
    expect(on.wrapper.find('[data-test=direct-reach-local]').attributes('aria-pressed')).toBe('true');
    const busy = row({ on: true, http: true, tor: false }, OFF, { httpListener: { state: 'failed', port: 3415, reason: 'port_in_use' } });
    expect(busy.wrapper.find('[data-test=direct-status]').text()).toContain(t('msg.modern.settings.direct.port_busy', { port: 3415 }));
    expect(busy.wrapper.find('[data-test=direct-retry]').classes()).toContain('e-btn-inline');
  });
});

describe('Receive › Direct addresses', () => {
  test('the onion shows next to the Epic address only while Tor is ready', async () => {
    const services = { $walletService: { getEpicboxAddress: vi.fn(async () => ({})) }, configService: { config: {}, epicboxDomain: 'x', walletListenerPort: 3415 } };
    const off = mountView(ReceiveView, { store: makeStore({ ui: 'modern', tor: OFF }), services });
    await flushPromises();
    expect(off.wrapper.find('[data-test=rcv-direct]').exists()).toBe(false);
    const direct = { on: true, http: false, tor: true, public: false, wantPublic: false };
    const on = mountView(ReceiveView, { store: makeStore({ ui: 'modern', direct, tor: tor({ state: 'ready', onion: ONION }) }), services });
    await flushPromises();
    expect(on.wrapper.find('[data-test=tor-receive-onion]').text()).toBe(ONION);
  });
});

describe('Send to a Tor address', () => {
  function setup(torState, wallet = fakeSendWallet()) {
    wallet.setTorEnabled = vi.fn(async () => ({ ok: true }));
    wallet.sendOverTor = vi.fn(async () => ({ ok: true, slate: { id: 'slate-tor' } }));
    const store = makeStore({ ui: 'modern', summary: { spendable: 10, unconfirmed: 0 }, tor: torState });
    const m = mountView(SendView, { store, services: { $walletService: wallet } });
    const w = m.wrapper;
    return {
      ...m, wallet,
      address: w.find('input[placeholder="' + t('msg.httpSend.address') + '"]'),
      amount: w.find('input[inputmode=decimal]'),
    };
  }
  const review = async (s) => { await button(s.wrapper, t('msg.modern.send.review')).trigger('click'); await flushPromises(); };

  test('Tor off: "Turn on Tor to send to this address." with a Turn on Tor button that turns it on', async () => {
    const s = setup(OFF);
    await s.address.setValue(ONION);
    await flushPromises();
    expect(s.wrapper.text()).toContain(t(k('send_off')));
    await s.amount.setValue('1');
    await review(s);
    expect(s.wrapper.find('dialog').element.open).toBe(false);
    expect(s.wallet.sendOverTor).not.toHaveBeenCalled();
    await s.wrapper.find('[data-test=send-tor-on]').trigger('click');
    expect(s.emitter.emit).toHaveBeenCalledWith('app.setTor', true);
  });

  test('a typo in the address: "This Tor address has a typo."', async () => {
    const s = setup(tor({ state: 'ready' }));
    await s.address.setValue(TYPO);
    await flushPromises();
    expect(s.wrapper.text()).toContain(t(k('send_typo')));
    expect(s.wrapper.find('[data-test=send-tor]').exists()).toBe(false);
  });

  test('Tor on but still connecting: the progress shows in place and the message goes away when it is ready', async () => {
    const s = setup(tor({ progress: 45 }));
    await s.address.setValue(ONION);
    await flushPromises();
    expect(s.wrapper.find('[data-test=send-tor]').text()).toContain(t(k('connecting'), { n: 45 }));
    expect(s.wrapper.text()).not.toContain(t(k('send_off')));
    s.store.commit('tor', tor({ state: 'ready', onion: 'x.onion' }));
    await flushPromises();
    expect(s.wrapper.find('[data-test=send-tor]').exists()).toBe(false);
  });

  test('Tor failed: its error with Try again', async () => {
    const s = setup(tor({ state: 'failed', error: 'network' }));
    await s.address.setValue(ONION);
    await flushPromises();
    expect(s.wrapper.text()).toContain(t(k('err_network')));
    await s.wrapper.find('[data-test=send-tor-retry]').trigger('click');
    expect(s.emitter.emit).toHaveBeenCalledWith('app.startTor');
  });

  test('a good send: the review says "Over Tor", the wallet gets the onion and no send_args, the form is cleared', async () => {
    const s = setup(tor({ state: 'ready', onion: 'mine.onion' }));
    s.wallet.sendOverTor = vi.fn(async (data, onion, onStep) => { onStep('signing'); return { ok: true, slate: { id: 'slate-tor' } }; });
    await s.address.setValue('http://' + ONION + '/');
    await s.amount.setValue('1.5');
    await review(s);
    const dialog = s.wrapper.find('dialog');
    expect(dialog.element.open).toBe(true);
    expect(dialog.text()).toContain(t(k('via')));
    await button(dialog, 'Send', { partial: true }).trigger('click');
    await flushPromises();
    const [data, onion] = s.wallet.sendOverTor.mock.calls[0];
    expect(onion).toBe(ONION);
    expect(data.amount).toBe(1.5 * NANO);
    expect(data.send_args).toBe(null);
    expect(s.wallet.sends()).toHaveLength(0);
    expect(s.$addressTransactionsService.addAddress).toHaveBeenCalledWith(expect.objectContaining({ slateid: 'slate-tor', type: 'tor', tor_address: ONION }));
    expect(s.$toast.success).toHaveBeenCalledWith(t('msg.httpSend.success'));
    expect(s.address.element.value).toBe('');
  });

  test('progress lines follow the steps while sending', async () => {
    const s = setup(tor({ state: 'ready' }));
    let finish;
    let report;
    s.wallet.sendOverTor = vi.fn((data, onion, onStep) => { report = onStep; return new Promise((r) => { finish = r; }); });
    await s.address.setValue(ONION);
    await s.amount.setValue('1');
    await review(s);
    await button(s.wrapper.find('dialog'), 'Send', { partial: true }).trigger('click');
    await flushPromises();
    expect(s.wrapper.find('dialog').text()).toContain(t(k('send_connect')));
    report('sign');
    await flushPromises();
    expect(s.wrapper.find('dialog').text()).toContain(t(k('send_sign')));
    report('post');
    await flushPromises();
    expect(s.wrapper.find('dialog').text()).toContain(t(k('send_post')));
    finish({ ok: true, slate: { id: 's' } });
    await flushPromises();
  });

  test('an error from the send is said in plain words and nothing is cleared', async () => {
    const s = setup(tor({ state: 'ready' }));
    s.wallet.sendOverTor = vi.fn(async () => ({ ok: false, code: 'unreachable', detail: '' }));
    await s.address.setValue(ONION);
    await s.amount.setValue('1');
    await review(s);
    await button(s.wrapper.find('dialog'), 'Send', { partial: true }).trigger('click');
    await flushPromises();
    expect(s.$toast.error).toHaveBeenCalledWith(t(k('err_unreachable')));
    expect(s.address.element.value).toBe(ONION);
    expect(s.$addressTransactionsService.addAddress).not.toHaveBeenCalled();
  });
});

describe('Contacts › Tor address', () => {
  const BOX = 'esWVc4Ex1SLvZLt8mAoMy1vabFzStbqTZHM3JSbzdGfKoECG2mNs@epicbox.epiccash.com';
  function book(list) {
    const b = {
      list,
      getAddress: vi.fn(async () => b.list),
      getAddressById: vi.fn(async (id) => b.list.filter((r) => r.id == id)),
      findAddress: vi.fn(async () => []),
      addAddress: vi.fn(async (row) => { b.list.push({ ...row, id: 50 }); return [{ id: 50 }]; }),
      updateAddressById: vi.fn(async (id, set) => { Object.assign(b.list.find((x) => x.id == id), set); return 1; }),
      removeAddress: vi.fn(async () => 1),
    };
    return b;
  }
  const row = (o) => ({ id: 1, user_id: 1, name: 'Mara', country: '', city: '', onion: '', alwaysproof: false, proofaddr: '', externalOne: '', externalTwo: '', notice: '', ...o });
  const avatars = { forUser: vi.fn(async () => new Map()), set: vi.fn(), remove: vi.fn() };

  async function open(list, torState) {
    const m = mountView(ContactsView, { store: makeStore({ ui: 'modern', txs: [], tor: torState }), services: { $addressBookService: book(list), $contactAvatars: avatars } });
    await flushPromises();
    return m;
  }

  test('the new-contact form has the Tor field only while Tor is on', async () => {
    const off = await open([row({ externalOne: BOX })], OFF);
    await button(off.wrapper, t('msg.modern.settings.add_contact')).trigger('click');
    await flushPromises();
    expect(off.wrapper.find('[data-test=con-onion]').exists()).toBe(false);
    const on = await open([row({ externalOne: BOX })], tor({ state: 'ready' }));
    await button(on.wrapper, t('msg.modern.settings.add_contact')).trigger('click');
    await flushPromises();
    expect(on.wrapper.find('[data-test=con-onion]').exists()).toBe(true);
  });

  test('a typo is refused, a good address saved, a Tor-only contact is complete', async () => {
    const m = await open([], tor({ state: 'ready' }));
    await button(m.wrapper, t('msg.modern.settings.add_contact')).trigger('click');
    await flushPromises();
    await m.wrapper.find('#con-f-name').setValue('Onion Ola');
    await m.wrapper.find('#con-f-onion').setValue(TYPO);
    await m.wrapper.find('form.e-con-form').trigger('submit');
    await flushPromises();
    expect(m.wrapper.text()).toContain(t(k('send_typo')));
    expect(m.$addressBookService.addAddress).not.toHaveBeenCalled();
    await m.wrapper.find('#con-f-onion').setValue(ONION);
    await m.wrapper.find('form.e-con-form').trigger('submit');
    await flushPromises();
    expect(m.$addressBookService.addAddress).toHaveBeenCalledWith(expect.objectContaining({ name: 'Onion Ola', onion: ONION }));
  });

  test('a contact with a Tor address shows it, is found by it, and Send fills it in', async () => {
    const m = await open([row({ id: 7, name: 'Tor Tom', onion: ONION }), row({ id: 8, name: 'Box Bea', externalOne: BOX })], OFF);
    expect(m.wrapper.text()).toContain('Tor Tom');
    //the row's one kind tag
    const tomRow = () => m.wrapper.findAll('.e-con-row').find((r) => r.text().includes('Tor Tom'));
    expect(tomRow().find('.e-con-kind').text()).toBe(t(k('kind')));
    //found by a piece of the onion
    await m.wrapper.find('#con-q').setValue(NAME.slice(8, 20));
    await flushPromises();
    expect(m.wrapper.text()).toContain('Tor Tom');
    expect(m.wrapper.text()).not.toContain('Box Bea');
    //the detail panel shows the onion; its Send goes to Send with the onion filled in
    await tomRow().trigger('click');
    await flushPromises();
    expect(m.wrapper.find('.e-con-facts').text()).toContain(t(k('address')));
    expect(m.wrapper.find('.e-con-facts').text()).toContain(ONION);
    await m.wrapper.find('.e-con-send').trigger('click');
    await flushPromises();
    expect(m.$router.push).toHaveBeenCalledWith({ name: 'httpSend', query: { contact: '7', use: 'onion' } });
  });

  test('a contact with Epicbox and Tor: the "Send using" toggle and the Send button name Tor in words', async () => {
    const m = await open([row({ id: 9, name: 'Both Bo', externalOne: BOX, onion: ONION })], tor({ state: 'ready' }));
    await m.wrapper.find('.e-con-row').trigger('click');
    await flushPromises();
    const via = m.wrapper.find('.e-con-via');
    expect(via.text()).toContain(t(k('kind')));
    expect(via.text()).not.toContain('msg.');
    await via.findAll('button').find((b) => b.text() == t(k('kind'))).trigger('click');
    expect(m.wrapper.find('.e-con-send').text()).toBe(t(k('menu_send')));
    await m.wrapper.find('.e-con-send').trigger('click');
    await flushPromises();
    expect(m.$router.push).toHaveBeenCalledWith({ name: 'httpSend', query: { contact: '9', use: 'onion' } });
  });

  test('Send opened from that contact fills the recipient (Tor off: with the Turn on Tor button)', async () => {
    const list = [row({ id: 7, name: 'Tor Tom', onion: ONION })];
    const wallet = fakeSendWallet();
    wallet.setTorEnabled = vi.fn(async () => ({}));
    const m = mountView(SendView, {
      store: makeStore({ ui: 'modern', summary: { spendable: 10, unconfirmed: 0 }, tor: OFF }),
      services: { $walletService: wallet, $addressBookService: book(list), $contactAvatars: avatars },
      route: { query: { contact: '7', use: 'onion' } },
    });
    await flushPromises();
    expect(m.wrapper.find('input[placeholder="' + t('msg.httpSend.address') + '"]').element.value).toBe(ONION);
    expect(m.wrapper.find('[data-test=send-tor-on]').exists()).toBe(true);
  });

  test('an old stored Tor value is kept when the contact is edited and saved, even with Tor off', async () => {
    const m = await open([row({ id: 8, name: 'Old', externalOne: BOX, onion: 'old-value.onion' })], OFF);
    await m.wrapper.find('.e-con-row').trigger('click');
    await flushPromises();
    m.$router.push.mockClear();
    await m.wrapper.vm.callAddress(m.$addressBookService.list[0]);
    await m.wrapper.vm.edit();
    await flushPromises();
    expect(m.wrapper.find('#con-f-onion').element.value).toBe('old-value.onion');
    await m.wrapper.find('#con-f-name').setValue('Old (renamed)');
    await m.wrapper.find('form.e-con-form').trigger('submit');
    await flushPromises();
    expect(m.$addressBookService.updateAddressById).toHaveBeenCalledWith(8, expect.objectContaining({ name: 'Old (renamed)', onion: 'old-value.onion' }));
  });
});

describe('Activity: a Tor send', () => {
  //the txDisplay mixin's methods with a fake component (its $t gives the key back)
  const view = Object.assign({ $t: (key) => key }, txDisplay.methods);
  const sent = (address) => ({ tx_type: 'TxSent', tx_slate_id: 'slate-tor', address });

  test('shows the onion and a Tor tag, not "Unknown recipient"', () => {
    const tx = sent({ type: 'tor', address: null, tor_address: ONION });
    const who = view.whoOf(tx);
    expect(who.addr).toBe(true);
    expect(who.text).toBe(NAME.slice(0, 6) + '…' + NAME.slice(-6) + '.onion');
    expect(who.tip).toBe(ONION);
    expect(view.methodOf(tx)).toBe('msg.modern.overview.m_tor');
  });

  test('a contact keeps its name; an older row without the onion still gets the Tor tag', () => {
    expect(view.whoOf(sent({ type: 'tor', name: 'Onion Ola', tor_address: ONION })).text).toBe('Onion Ola');
    const old = sent({ type: 'tor', address: null });
    expect(view.whoOf(old).text).toBe('msg.modern.overview.unknown_recipient');
    expect(view.methodOf(old)).toBe('msg.modern.overview.m_tor');
    //anything but an onion is not shown as one
    expect(view.whoOf(sent({ type: 'tor', tor_address: 'javascript:x' })).text).toBe('msg.modern.overview.unknown_recipient');
  });
});

describe('Activity: found by scan (#55)', () => {
  const view = Object.assign({ $t: (key) => key }, txDisplay.methods);
  //what epic-wallet's scan writes (libwallet/src/internal/scan.rs): a confirmed receive, public_addr "Restore"
  const scanned = { tx_type: 'TxReceived', tx_slate_id: null, public_addr: 'Restore', confirmed: true, amount_credited: '29000000' };

  test('a scan record reads "Found by scan" with its tooltip, never "Restore" as an address', () => {
    const who = view.whoOf(scanned);
    expect(who.text).toBe('msg.modern.overview.found_by_scan');
    expect(who.tip).toBe('msg.modern.overview.found_by_scan_tip');
    expect(who.addr).toBe(false);
    expect(view.addrOf(scanned)).toBe('');
    expect(view.methodOf(scanned)).toBe('');
    //the same with no public_addr at all (older wallets)
    expect(view.whoOf({ ...scanned, public_addr: null }).text).toBe('msg.modern.overview.found_by_scan');
  });

  test('a real receive keeps its address; a coinbase stays a mining reward', () => {
    const box = { ...scanned, tx_slate_id: 's1', public_addr: 'esAbc@epicbox.stackwallet.com' };
    expect(view.whoOf(box).addr).toBe(true);
    expect(view.methodOf(box)).toBe('msg.modern.overview.m_epicbox');
    expect(view.whoOf({ ...scanned, tx_type: 'ConfirmedCoinbase' }).text).toBe('msg.modern.overview.mining_reward');
  });
});
