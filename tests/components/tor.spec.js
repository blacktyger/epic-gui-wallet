/*
 * Tor in the Modern screens (spec docs/plans/tor-616.md §6): the Settings › Receiving row, the
 * Receive row, Send to a Tor address (Tor on and off, a typo, progress, errors) and the Contacts
 * Tor address field. The backend is faked: store.state.tor, the app.setTor / app.startTor events and walletService /
 * sendOverTor.
 */
import { describe, test, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { flushPromises } from '@vue/test-utils';
import TorSettingsRow from '@/components/modern/settings/TorSettingsRow.vue';
import TorReceiveRow from '@/components/modern/receive/TorReceiveRow.vue';
import ReceiveView from '@/components/modern/views/ReceiveView.vue';
import SendView from '@/components/modern/views/SendView.vue';
import ContactsView from '@/components/modern/views/ContactsView.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { button } from './support/dom.js';
import { fakeSendWallet, NANO } from './support/sendWallet.js';

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

describe('Settings › Receiving › Tor row', () => {
  function row(state, wallet = {}) {
    const store = makeStore({ tor: state });
    const services = { $walletService: { setTorEnabled: vi.fn(async () => ({ ok: true })), ...wallet } };
    return { ...mountView(TorSettingsRow, { store, services }), services };
  }

  test('off: the title, what it does, a switch that is off, no status', () => {
    const { wrapper } = row(OFF);
    expect(wrapper.text()).toContain(t(k('title')));
    expect(wrapper.text()).toContain(t(k('text')));
    expect(wrapper.find('[data-test=tor-switch]').element.checked).toBe(false);
    expect(wrapper.find('[data-test=tor-status]').exists()).toBe(false);
    expect(wrapper.find('[data-test=tor-onion]').exists()).toBe(false);
  });

  test('turning it on asks the wallet', async () => {
    const { wrapper, emitter } = row(OFF);
    const input = wrapper.find('[data-test=tor-switch]');
    input.element.checked = true;
    await input.trigger('change');
    await flushPromises();
    expect(emitter.emit).toHaveBeenCalledWith('app.setTor', true);
  });

  test('starting: "Connecting to Tor… 45 %"', () => {
    const { wrapper } = row(tor({ progress: 45 }));
    expect(wrapper.find('[data-test=tor-switch]').element.checked).toBe(true);
    expect(wrapper.find('[data-test=tor-status]').text()).toBe(t(k('connecting'), { n: 45 }));
    expect(wrapper.find('[data-test=tor-status]').text()).toContain('45');
  });

  test('publishing, then ready with the address and a copy button', async () => {
    const pub = row(tor({ state: 'publishing', progress: 100 }));
    expect(pub.wrapper.find('[data-test=tor-status]').text()).toBe(t(k('publishing')));
    const { wrapper } = row(tor({ state: 'ready', progress: 100, onion: ONION }));
    expect(wrapper.find('[data-test=tor-status]').text()).toBe(t(k('ready')));
    expect(wrapper.find('[data-test=tor-onion]').text()).toBe(ONION);
    await wrapper.find('[data-test=tor-copy]').trigger('click');
    expect(window.clipboard.writeText).toHaveBeenCalledWith(ONION);
  });

  test.each([
    ['missing', ''], ['start', 'bad config'], ['network', ''], ['clock', ''], ['keys', ''], ['listener', ''],
  ])('error %s: its message and Try again', async (error, detail) => {
    const { wrapper, emitter } = row(tor({ state: 'failed', error, detail }));
    expect(wrapper.find('[data-test=tor-status]').text()).toBe(t(k('err_' + error), { detail, msg: detail }));
    await button(wrapper, t(k('retry'))).trigger('click');
    expect(emitter.emit).toHaveBeenCalledWith('app.startTor');
  });
});

describe('Receive › Tor address', () => {
  test('hidden while Tor is off', () => {
    const { wrapper } = mountView(TorReceiveRow, { store: makeStore({ tor: OFF }) });
    expect(wrapper.find('[data-test=tor-receive]').exists()).toBe(false);
  });

  test('shown with the address, Copy and QR while Tor is on', async () => {
    const { wrapper } = mountView(TorReceiveRow, { store: makeStore({ tor: tor({ state: 'ready', onion: ONION }) }) });
    expect(wrapper.find('[data-test=tor-receive-onion]').text()).toBe(ONION);
    await wrapper.find('[data-test=tor-receive-copy]').trigger('click');
    await wrapper.find('[data-test=tor-receive-qr]').trigger('click');
    expect(wrapper.emitted('copy')[0]).toEqual([ONION]);
    expect(wrapper.emitted('qr')[0]).toEqual([ONION]);
  });

  test('before the address is known, Copy and QR are disabled', () => {
    const { wrapper } = mountView(TorReceiveRow, { store: makeStore({ tor: tor({ progress: 20 }) }) });
    expect(wrapper.find('[data-test=tor-receive-copy]').element.disabled).toBe(true);
    expect(wrapper.find('[data-test=tor-receive]').text()).toContain(t(k('connecting'), { n: 20 }));
  });

  test('the Receive screen shows the row only with Tor on', async () => {
    const services = { $walletService: { getEpicboxAddress: vi.fn(async () => ({})) }, configService: { config: {}, epicboxDomain: 'x', walletListenerPort: 3415 } };
    const off = mountView(ReceiveView, { store: makeStore({ ui: 'modern', tor: OFF }), services });
    await flushPromises();
    expect(off.wrapper.find('[data-test=tor-receive]').exists()).toBe(false);
    const on = mountView(ReceiveView, { store: makeStore({ ui: 'modern', tor: tor({ state: 'ready', onion: ONION }) }), services });
    await flushPromises();
    expect(on.wrapper.find('[data-test=tor-receive]').exists()).toBe(true);
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
    expect(s.$addressTransactionsService.addAddress).toHaveBeenCalledWith(expect.objectContaining({ slateid: 'slate-tor', type: 'tor' }));
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
    const m = await open([row({ id: 7, name: 'Tor Tom', onion: ONION })], OFF);
    expect(m.wrapper.text()).toContain('Tor Tom');
    expect(m.wrapper.find('.e-con-kinds').text()).toContain(t(k('kind')));
    await m.wrapper.find('#con-q').setValue(NAME.slice(8, 20));
    await flushPromises();
    expect(m.wrapper.text()).toContain('Tor Tom');
    await m.wrapper.find('.e-con-row').trigger('click');
    await flushPromises();
    expect(m.$router.push).toHaveBeenCalledWith({ name: 'httpSend', query: { contact: '7', use: 'onion' } });
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
