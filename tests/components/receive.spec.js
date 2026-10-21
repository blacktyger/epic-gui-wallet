/*
 * Receive in both interfaces: Classic HttpReceive.vue and Modern ReceiveView.vue (its reskin).
 * The Epic address is shown whenever it is known, also while the listener is stopped, with a
 * notice that receiving is off (QA T09); the HTTP listener has its own state, so a busy port 3415
 * says so while Epicbox keeps running (QA W01).
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import HttpReceive from '@/components/HttpReceive.vue';
import ReceiveView from '@/components/modern/views/ReceiveView.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { button } from './support/dom.js';

const KEY = 'esWVc4Ex1SLvZLt8mAoMy1vabFzStbqTZHM3JSbzdGfKoECG2mNs';
const DOMAIN = 'epicbox.epiccash.com';
const ADDRESS = KEY + '@' + DOMAIN;
const HTTP_ADDRESS = 'http://203.0.113.7:3415';

function fakeWallet(overrides = {}) {
  return {
    getEpicboxAddress: vi.fn(async () => ({ result: { Ok: { public_key: KEY } } })),
    startListen: vi.fn(async () => ({ success: true, pid: 11 })),
    startEpicbox: vi.fn(async () => ({ success: true })),
    stopListen: vi.fn(async () => true),
    stopHttpListen: vi.fn(async () => true),
    ...overrides,
  };
}

async function setup(Component, { listening = false, epicbox = listening, http, domain = DOMAIN, wallet = fakeWallet(), config = {} } = {}) {
  const store = makeStore({
    //Modern's own rules (HTTP on demand) need its interface; the fake store's default is Classic
    ui: Component === ReceiveView ? 'modern' : 'classic',
    walletListenerService: listening,
    walletEpicboxService: epicbox,
    httpListener: http || (listening ? { state: 'on', port: 3415, reason: '' } : { state: 'off', port: 0, reason: '' }),
    epicbox: epicbox ? { state: 'listening', server: 'wss://' + DOMAIN, address: ADDRESS, checking: '', pid: 5 } : { state: '', server: '', address: '', checking: '', pid: 0 },
  });
  const configService = { config: { epicbox_domain: domain, ...config }, epicboxDomain: DOMAIN, walletListenerPort: 3415, updateConfig: vi.fn(() => true) };
  const m = mountView(Component, { store, services: { $walletService: wallet, configService } });
  await flushPromises();
  return { ...m, wallet, configService };
}

/* Classic keeps both panels in the page and shows one (v-show): the running one, else the stopped one */
function classicPanel(wrapper) {
  const [running, stopped] = wrapper.findAll('section > div');
  return running.isVisible() ? running : stopped;
}

describe('Receive (Classic)', () => {
  test('listening: the Epic and HTTP addresses with Stop listener', async () => {
    const { wrapper } = await setup(HttpReceive, { listening: true });
    const panel = classicPanel(wrapper);
    expect(panel.text()).toContain(t('msg.httpReceive.listening'));
    expect(panel.text()).toContain(ADDRESS);
    expect(panel.text()).toContain(HTTP_ADDRESS);
    expect(panel.text()).toContain(t('msg.httpReceive.close'));
  });

  test('stopped: the Epic address is still shown, with the notice that receiving is off (QA T09)', async () => {
    const { wrapper } = await setup(HttpReceive, { listening: false });
    const panel = classicPanel(wrapper);
    expect(panel.text()).toContain(t('msg.httpReceive.reachableMsg'));
    expect(panel.text()).toContain(ADDRESS);
    expect(panel.text()).toContain(t('msg.httpReceive.epicbox_address_off'));
    expect(panel.text()).toContain(t('msg.httpReceive.start'));
  });

  test('stopped: copying the Epic address puts it on the clipboard', async () => {
    const { wrapper, $toast } = await setup(HttpReceive, { listening: false });
    await classicPanel(wrapper).find('[data-icon="content-copy"]').trigger('click');
    expect(window.clipboard.writeText).toHaveBeenCalledWith(ADDRESS);
    expect($toast.show).toHaveBeenCalledWith(t('msg.copy_to_clipboard'), expect.anything());
  });

  test('listening: copy icons copy the Epic and the HTTP address', async () => {
    const { wrapper } = await setup(HttpReceive, { listening: true });
    const icons = classicPanel(wrapper).findAll('[data-icon="content-copy"]');
    await icons[0].trigger('click');
    await icons[1].trigger('click');
    expect(window.clipboard.writeText.mock.calls).toEqual([[ADDRESS], [HTTP_ADDRESS]]);
  });

  test('no Epicbox server set: no address, says Epicbox is not configured', async () => {
    const { wrapper } = await setup(HttpReceive, { listening: true, domain: '' });
    const panel = classicPanel(wrapper);
    expect(panel.text()).toContain(t('msg.httpReceive.epicbox_off'));
    expect(panel.text()).not.toContain(KEY);
  });

  test('HTTP port 3415 busy: says so, Try again starts only the HTTP listener', async () => {
    const wallet = fakeWallet();
    const { wrapper, store } = await setup(HttpReceive, { listening: true, http: { state: 'failed', port: 3415, reason: 'port_in_use' }, wallet });
    const panel = classicPanel(wrapper);
    expect(panel.text()).toContain(t('msg.httpReceive.http_failed_port', [3415]));
    expect(panel.text()).toContain(ADDRESS);
    const retry = panel.findAll('a').find((a) => a.text() === t('msg.httpReceive.http_retry'));
    await retry.trigger('click');
    await flushPromises();
    expect(wallet.startListen).toHaveBeenCalledWith('http');
    expect(wallet.startEpicbox).not.toHaveBeenCalled();
    expect(store.state.httpListener).toEqual({ state: 'on', port: 3415, reason: '' });
    expect(classicPanel(wrapper).text()).not.toContain(t('msg.httpReceive.http_failed_port', [3415]));
  });

  test('Start with port 3415 busy: HTTP fails with the port named, Epicbox still starts', async () => {
    const wallet = fakeWallet({ startListen: vi.fn(async () => ({ success: false, portInUse: 3415 })) });
    const { wrapper, store, $toast } = await setup(HttpReceive, { listening: false, wallet });
    await button(classicPanel(wrapper), t('msg.httpReceive.start')).trigger('click');
    await flushPromises();
    expect(wallet.startListen).toHaveBeenCalledWith('http');
    expect(wallet.startEpicbox).toHaveBeenCalled();
    expect($toast.error).toHaveBeenCalledWith(t('msg.login.port_in_use', [3415]));
    expect(store.state.httpListener).toEqual({ state: 'failed', port: 3415, reason: 'port_in_use' });
    expect(store.state.walletEpicboxService).toBe(true);
    expect(store.state.walletListenerService).toBe(true);
    expect(classicPanel(wrapper).text()).toContain(t('msg.httpReceive.http_failed_port', [3415]));
  });

  test('Stop listener stops both and goes back to the stopped panel', async () => {
    const wallet = fakeWallet();
    const { wrapper, store, $toast } = await setup(HttpReceive, { listening: true, wallet });
    await button(classicPanel(wrapper), t('msg.httpReceive.close')).trigger('click');
    await flushPromises();
    expect(wallet.stopListen).toHaveBeenCalled();
    expect(store.state.walletListenerService).toBe(false);
    expect(store.state.walletEpicboxService).toBe(false);
    expect($toast.success).toHaveBeenCalledWith(t('msg.httpReceive.listener_stopped'));
    expect(classicPanel(wrapper).text()).toContain(t('msg.httpReceive.start'));
  });
});

describe('Receive (Modern)', () => {
  test('listening: Receiving is on, the Epic address; Direct transactions off with its Settings link', async () => {
    const { wrapper } = await setup(ReceiveView, { listening: true });
    const text = wrapper.text();
    expect(text).toContain(t('msg.modern.send.rcv_on'));
    expect(text.replace(/\s+/g, '')).toContain(ADDRESS);
    //HTTP and Tor live in Direct transactions: off here, with the way to Settings › Receiving
    expect(wrapper.find('[data-test=rcv-direct]').exists()).toBe(false);
    expect(wrapper.find('[data-test=rcv-direct-open]').exists()).toBe(true);
    expect(text).toContain(t('msg.modern.send.rcv_listening_via', { domain: DOMAIN }));
  });

  test('regression: no "port reachable" or "forward the port" claim (the listener binds 127.0.0.1 only)', async () => {
    for (const reachable of [true, false]) {
      window.config.isPortReachable.mockResolvedValue(reachable);
      const { wrapper } = await setup(ReceiveView, { listening: true });
      expect(wrapper.text()).not.toContain(t('msg.modern.send.rcv_http_open', { port: 3415 }));
      expect(wrapper.text()).not.toContain(t('msg.modern.send.rcv_http_closed', { port: 3415 }));
    }
  });

  test('Start listener: Epicbox only, unless Start with wallet is on for HTTP', async () => {
    const off = await setup(ReceiveView, { listening: false });
    await button(off.wrapper, t('msg.modern.send.rcv_start')).trigger('click');
    await flushPromises();
    expect(off.wallet.startEpicbox).toHaveBeenCalledTimes(1);
    expect(off.wallet.startListen).not.toHaveBeenCalled();
    expect(off.store.state.walletListenerService).toBe(true);
    //Modern: HTTP runs with Direct transactions (Settings › Receiving), never with Start listener
    const on = await setup(ReceiveView, { listening: false, config: { direct_on: true, direct_http: true } });
    await button(on.wrapper, t('msg.modern.send.rcv_start')).trigger('click');
    await flushPromises();
    expect(on.wallet.startListen).not.toHaveBeenCalled();
  });

  test('stopped: the Epic address is still shown with Copy, and the notice that receiving is off (QA T09)', async () => {
    const { wrapper } = await setup(ReceiveView, { listening: false });
    const text = wrapper.text();
    expect(text).toContain(t('msg.modern.send.rcv_off'));
    expect(text).toContain(t('msg.modern.send.rcv_start_title'));
    expect(text.replace(/\s+/g, '')).toContain(ADDRESS);
    expect(text).toContain(t('msg.httpReceive.epicbox_address_off'));
    const copy = button(wrapper, t('msg.modern.send.rcv_copy_addr'));
    expect(copy.element.disabled).toBe(false);
    await copy.trigger('click');
    expect(window.clipboard.writeText).toHaveBeenCalledWith(ADDRESS);
  });

  test('no Epicbox server set: no address and Copy is disabled', async () => {
    const { wrapper } = await setup(ReceiveView, { listening: true, domain: '' });
    expect(wrapper.text()).toContain(t('msg.httpReceive.epicbox_off'));
    expect(button(wrapper, t('msg.modern.send.rcv_copy_addr')).element.disabled).toBe(true);
  });

  test('the Epic address cannot be read: says so instead of an empty address', async () => {
    const wallet = fakeWallet({ getEpicboxAddress: vi.fn(async () => ({ error: { message: 'down' } })) });
    const { wrapper } = await setup(ReceiveView, { listening: true, wallet });
    expect(wrapper.text()).toContain(t('msg.httpReceive.epicbox_address_unknown'));
  });

  test('Stop receiving: back to the start block, the address stays', async () => {
    const wallet = fakeWallet();
    const { wrapper } = await setup(ReceiveView, { listening: true, wallet });
    await button(wrapper, t('msg.modern.send.rcv_stop')).trigger('click');
    await flushPromises();
    expect(wallet.stopListen).toHaveBeenCalled();
    expect(wrapper.text()).toContain(t('msg.modern.send.rcv_start'));
    expect(wrapper.text().replace(/\s+/g, '')).toContain(ADDRESS);
  });
});
