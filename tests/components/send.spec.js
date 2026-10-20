/*
 * The Send form in both interfaces: Classic HttpSend.vue (Send sends at once) and Modern
 * SendView.vue (Review send, then Send in the review dialog). Same logic, so the same cases run
 * against both; what differs is how a user submits.
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import HttpSend from '@/components/HttpSend.vue';
import SendView from '@/components/modern/views/SendView.vue';
import { MIN_CONFIRMATIONS } from '@/shared/confirmations';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { button } from './support/dom.js';
import { fakeSendWallet, NANO } from './support/sendWallet.js';

//a valid Epicbox address: 52 base58 characters, @ the server
const EPICBOX_ADDR = 'esWVc4Ex1SLvZLt8mAoMy1vabFzStbqTZHM3JSbzdGfKoECG2mNs@epicbox.epiccash.com';
const HTTP_ADDR = 'https://recipient.example:3415';

const required = (field) => t('msg.validators.empty', [field]);

const INTERFACES = [
  {
    name: 'Classic',
    Component: HttpSend,
    sendButton: (w) => button(w, t('msg.send')),
    /* Send: the checks and the send in one click */
    async submit(w) {
      await this.sendButton(w).trigger('click');
      await flushPromises();
    },
    async confirm() {},
  },
  {
    name: 'Modern',
    Component: SendView,
    sendButton: (w) => button(w, t('msg.modern.send.review')),
    /* Review send: the checks, then the review dialog */
    async submit(w) {
      await this.sendButton(w).trigger('click');
      await flushPromises();
    },
    /* the dialog's Send button */
    async confirm(w) {
      const dialog = w.find('dialog');
      expect(dialog.element.open).toBe(true);
      await button(dialog, 'Send', { partial: true }).trigger('click');
      await flushPromises();
    },
  },
];

function setup(ui, { wallet = fakeSendWallet(), state = {} } = {}) {
  const store = makeStore({ summary: { spendable: 10, unconfirmed: 0 }, ...state });
  const mounted = mountView(ui.Component, { store, services: { $walletService: wallet } });
  const w = mounted.wrapper;
  return {
    ...mounted,
    wallet,
    address: w.find('input[placeholder="' + t('msg.httpSend.address') + '"]'),
    amount: w.find('input[inputmode=decimal]'),
    message: w.find('textarea'),
  };
}

describe.each(INTERFACES)('Send form ($name)', (ui) => {
  test('an empty form says both fields are required and sends nothing', async () => {
    const s = setup(ui);
    await ui.submit(s.wrapper);
    expect(s.wrapper.text()).toContain(required('amount'));
    expect(s.wrapper.text()).toContain(required('address'));
    expect(s.wallet.issueSendTransaction).not.toHaveBeenCalled();
    expect(s.wrapper.find('dialog').exists() && s.wrapper.find('dialog').element.open).toBe(false);
  });

  test.each([
    ['hello world', 'msg.validators.address'],
    ['http://', 'msg.validators.http_address'],
    ['esNotAValidKey@epicbox.epiccash.com', 'msg.validators.epicbox_address'],
  ])('recipient %j is refused with its message', async (recipient, key) => {
    const s = setup(ui, { state: { walletEpicboxService: true } });
    await s.address.setValue(recipient);
    await s.amount.setValue('1');
    await ui.submit(s.wrapper);
    expect(s.wrapper.text()).toContain(t(key));
    expect(s.wallet.sends()).toHaveLength(0);
  });

  test('a Tor address is refused as soon as it is typed, before Send', async () => {
    const s = setup(ui);
    await s.address.setValue('http://' + 'a'.repeat(56) + '.onion');
    await flushPromises();
    expect(s.wrapper.text()).toContain(t('msg.validators.onion_address'));
    await s.amount.setValue('1');
    await ui.submit(s.wrapper);
    expect(s.wrapper.text()).toContain(t('msg.validators.onion_address'));
    expect(s.wallet.sends()).toHaveLength(0);
  });

  test.each([
    ['abc', () => t('msg.validators.number', ['amount'])],
    ['-1', () => t('msg.validators.number', ['amount'])],
    ['0', () => t('msg.validators.positive', ['amount'])],
    ['0.00000000', () => t('msg.validators.positive', ['amount'])],
    ['1.123456789', () => t('msg.validators.decimals', ['amount'])],
    ['99999999999999999', () => t('msg.validators.spendable')],
    ['20', () => t('msg.validators.spendable')],
    //all of the balance leaves nothing for the fee
    ['10', () => t('msg.validators.spendable')],
  ])('amount %j is refused with its message and nothing is sent', async (amount, message) => {
    const s = setup(ui);
    await s.address.setValue(HTTP_ADDR);
    await s.amount.setValue(amount);
    await ui.submit(s.wrapper);
    expect(s.wrapper.text()).toContain(message());
    expect(s.wallet.sends()).toHaveLength(0);
  });

  test('a valid HTTP send calls the wallet with the exact amount, address and message', async () => {
    const s = setup(ui);
    await s.address.setValue(HTTP_ADDR);
    await s.amount.setValue('1.5');
    await s.message.setValue('thanks');
    await ui.submit(s.wrapper);
    await ui.confirm(s.wrapper);

    expect(s.wallet.sends()).toEqual([{
      src_acct_name: null,
      amount: 1.5 * NANO,
      message: 'thanks',
      minimum_confirmations: MIN_CONFIRMATIONS,
      max_outputs: 500,
      target_slate_version: null,
      ttl_blocks: null,
      payment_proof_recipient_address: null,
      send_args: { method: 'http', dest: HTTP_ADDR, finalize: true, post_tx: true, fluff: false },
      num_change_outputs: 1,
      selection_strategy_is_use_all: false,
    }]);
    expect(s.$toast.success).toHaveBeenCalledWith(t('msg.httpSend.success'));
    expect(s.$addressTransactionsService.addAddress).toHaveBeenCalledWith(expect.objectContaining({ slateid: 'slate-1', type: 'direct' }));
  });

  test('after a send the form is clear and Send stays disabled until something new is typed', async () => {
    const s = setup(ui);
    await s.address.setValue(HTTP_ADDR);
    await s.amount.setValue('1');
    await ui.submit(s.wrapper);
    await ui.confirm(s.wrapper);
    expect(s.wallet.sends()).toHaveLength(1);

    expect(s.address.element.value).toBe('');
    expect(s.amount.element.value).toBe('');
    expect(ui.sendButton(s.wrapper).element.disabled).toBe(true);
    await s.amount.setValue('2');
    expect(ui.sendButton(s.wrapper).element.disabled).toBe(false);
  });

  test('a failed send says so and keeps the form', async () => {
    const wallet = fakeSendWallet({ sendResult: { error: { message: 'Post failed' } } });
    const s = setup(ui, { wallet });
    await s.address.setValue(HTTP_ADDR);
    await s.amount.setValue('1');
    await ui.submit(s.wrapper);
    await ui.confirm(s.wrapper);
    expect(wallet.sends()).toHaveLength(1);
    expect(s.$toast.error).toHaveBeenCalledWith(t('msg.httpSend.TxFailed'));
    expect(s.amount.element.value).toBe('1');
    expect(ui.sendButton(s.wrapper).element.disabled).toBe(false);
  });

  test('an Epicbox address is sent via Epicbox', async () => {
    const s = setup(ui, { state: { walletEpicboxService: true } });
    await s.address.setValue(EPICBOX_ADDR);
    await s.amount.setValue('1');
    await ui.submit(s.wrapper);
    await ui.confirm(s.wrapper);
    expect(s.wallet.sends()[0].send_args).toMatchObject({ method: 'epicbox', dest: EPICBOX_ADDR });
  });

  test('to an Epicbox address while Epicbox is not connected Send is disabled and says why', async () => {
    const s = setup(ui, { state: { walletEpicboxService: false } });
    await s.address.setValue(EPICBOX_ADDR);
    await s.amount.setValue('1');
    expect(ui.sendButton(s.wrapper).element.disabled).toBe(true);
    expect(s.wrapper.text()).toContain(t('msg.epicbox_not_connected'));
    await ui.sendButton(s.wrapper).trigger('click');
    await flushPromises();
    expect(s.wallet.sends()).toHaveLength(0);
  });

  test('while the node is not synced Send is disabled and says why', async () => {
    const s = setup(ui, { state: { nodeStatus: { sync_status: 'body_sync', tip: { height: 10 } } } });
    await s.address.setValue(HTTP_ADDR);
    await s.amount.setValue('1');
    expect(ui.sendButton(s.wrapper).element.disabled).toBe(true);
    expect(s.wrapper.text()).toContain(t('msg.node_not_synced'));
    expect(s.wallet.sends()).toHaveLength(0);
  });

  test('"All" fills in the balance minus the fee of spending every coin, and the send uses every coin', async () => {
    const s = setup(ui);
    await button(s.wrapper, t('msg.transaction.sendall')).trigger('click');
    await flushPromises();
    //10 EPIC spendable, 0.001 fee for one output from all coins
    expect(s.amount.element.value).toBe('9.999');

    await s.address.setValue(HTTP_ADDR);
    await ui.submit(s.wrapper);
    await ui.confirm(s.wrapper);
    expect(s.wallet.sends()).toHaveLength(1);
    expect(s.wallet.sends()[0]).toMatchObject({ amount: 999900000, selection_strategy_is_use_all: true });
  });

  test('"All" with nothing spendable says there is not enough balance', async () => {
    const wallet = fakeSendWallet({ spendable: 0 });
    const s = setup(ui, { wallet, state: { summary: { spendable: 0, unconfirmed: 0 } } });
    await button(s.wrapper, t('msg.transaction.sendall')).trigger('click');
    await flushPromises();
    expect(s.amount.element.value).toBe('');
    expect(s.wrapper.text()).toContain(t('msg.validators.spendable'));
  });

  test('the fee is estimated once typing pauses, not on every key', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = setup(ui);
    for (const v of ['1', '1.', '1.2']) await s.amount.setValue(v);
    expect(s.wallet.estimates()).toHaveLength(0);
    vi.advanceTimersByTime(350);
    await flushPromises();
    expect(s.wallet.estimates()).toHaveLength(1);
    expect(s.wallet.estimates()[0]).toMatchObject({ amount: 1.2 * NANO, estimate_only: true });
    //0.007 EPIC: shown in Classic's fee line and Modern's summary (Modern pads to 4 decimals)
    expect(s.wrapper.text()).toMatch(/0\.007/);
  });
});

describe('Send form (Modern only)', () => {
  test('the review dialog shows the amount, address and fee before anything is sent', async () => {
    const s = setup(INTERFACES[1]);
    await s.address.setValue(HTTP_ADDR);
    await s.amount.setValue('1.5');
    await INTERFACES[1].submit(s.wrapper);
    const dialog = s.wrapper.find('dialog');
    expect(dialog.element.open).toBe(true);
    expect(dialog.text()).toContain(t('msg.modern.send.review_title'));
    expect(dialog.text().replace(/\s+/g, '')).toContain(HTTP_ADDR);
    expect(dialog.text()).toContain(t('msg.modern.send.via_http'));
    expect(dialog.text()).toContain('0.0070');
    expect(s.wallet.sends()).toHaveLength(0);
  });

  test('Back in the review dialog sends nothing', async () => {
    const s = setup(INTERFACES[1]);
    await s.address.setValue(HTTP_ADDR);
    await s.amount.setValue('1');
    await INTERFACES[1].submit(s.wrapper);
    await button(s.wrapper.find('dialog'), t('msg.modern.send.back')).trigger('click');
    await flushPromises();
    expect(s.wrapper.find('dialog').element.open).toBe(false);
    expect(s.wallet.sends()).toHaveLength(0);
  });

  test('field errors make the hint say to fix the fields', async () => {
    const s = setup(INTERFACES[1]);
    await INTERFACES[1].submit(s.wrapper);
    expect(s.wrapper.text()).toContain(t('msg.modern.send.hint_errors'));
  });
});
