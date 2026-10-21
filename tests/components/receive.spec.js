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
  test('listening: Receiving is on, the Epic address, HTTP on this computer only (127.0.0.1)', async () => {
    const { wrapper } = await setup(ReceiveView, { listening: true });
    const text = wrapper.text();
    expect(text).toContain(t('msg.modern.send.rcv_on'));
    expect(text.replace(/\s+/g, '')).toContain(ADDRESS);
    expect(text).toContain(HTTP_ADDRESS);
    //one short muted line; the long 127.0.0.1 explanation is only its title
    expect(text).toContain(t('msg.modern.settings.http_on', { port: 3415 }));
    expect(text).not.toContain(t('msg.modern.send.rcv_http_local_only', { port: 3415 }));
    expect(wrapper.find('p[title]').attributes('title')).toBe(t('msg.modern.send.rcv_http_local_only', { port: 3415 }));
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

  test('Epicbox on, HTTP off (the default): the HTTP address dimmed, when to use it, Turn on', async () => {
    const { wrapper } = await setup(ReceiveView, { listening: true, epicbox: true, http: { state: 'off', port: 0, reason: '' } });
    const text = wrapper.text();
    expect(text).toContain(t('msg.modern.send.rcv_on'));
    expect(text).toContain(t('msg.modern.settings.http_off'));
    expect(text).toContain(t('msg.modern.send.rcv_listener_on_epicbox'));
    expect(wrapper.find('code.e-faint').text()).toBe(HTTP_ADDRESS);
    expect(wrapper.find('button[aria-label="' + t('msg.modern.send.rcv_copy_http_off') + '"]').element.disabled).toBe(true);
    expect(button(wrapper, t('msg.modern.send.rcv_http_turn_on')).exists()).toBe(true);
  });

  test('Turn on starts only the HTTP listener and does not change Start with wallet; Turn off stops only it', async () => {
    const wallet = fakeWallet();
    const { wrapper, store, configService } = await setup(ReceiveView, { listening: true, epicbox: true, http: { state: 'off', port: 0, reason: '' }, wallet });
    await button(wrapper, t('msg.modern.send.rcv_http_turn_on')).trigger('click');
    await flushPromises();
    expect(wallet.startListen).toHaveBeenCalledWith('http');
    expect(wallet.startEpicbox).not.toHaveBeenCalled();
    expect(store.state.httpListener.state).toBe('on');
    expect(wrapper.text()).toContain(t('msg.modern.settings.http_on', { port: 3415 }));
    await button(wrapper, t('msg.modern.send.rcv_http_turn_off')).trigger('click');
    await flushPromises();
    expect(wallet.stopHttpListen).toHaveBeenCalledTimes(1);
    expect(wallet.stopListen).not.toHaveBeenCalled();
    expect(store.state.httpListener).toBe(null);
    //Epicbox still receives
    expect(store.state.walletListenerService).toBe(true);
    expect(configService.updateConfig).not.toHaveBeenCalled();
  });

  test('Start listener: Epicbox only, unless Start with wallet is on for HTTP', async () => {
    const off = await setup(ReceiveView, { listening: false });
    await button(off.wrapper, t('msg.modern.send.rcv_start')).trigger('click');
    await flushPromises();
    expect(off.wallet.startEpicbox).toHaveBeenCalledTimes(1);
    expect(off.wallet.startListen).not.toHaveBeenCalled();
    expect(off.store.state.walletListenerService).toBe(true);
    const on = await setup(ReceiveView, { listening: false, config: { http_listener_autostart: true } });
    await button(on.wrapper, t('msg.modern.send.rcv_start')).trigger('click');
    await flushPromises();
    expect(on.wallet.startListen).toHaveBeenCalledWith('http');
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

  test('stopped: the HTTP address cannot be copied and says when to turn it on', async () => {
    const { wrapper } = await setup(ReceiveView, { listening: false });
    expect(wrapper.text()).toContain(t('msg.modern.settings.http_off'));
    const copyHttp = wrapper.find('button[aria-label="' + t('msg.modern.send.rcv_copy_http_off') + '"]');
    expect(copyHttp.element.disabled).toBe(true);
  });

  test('listening: Copy HTTP address copies it', async () => {
    const { wrapper } = await setup(ReceiveView, { listening: true });
    await wrapper.find('button[aria-label="' + t('msg.modern.send.rcv_copy_http') + '"]').trigger('click');
    expect(window.clipboard.writeText).toHaveBeenCalledWith(HTTP_ADDRESS);
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

  test('HTTP port 3415 busy: says so beside the HTTP address, Epicbox goes on, Try again retries HTTP', async () => {
    const wallet = fakeWallet();
    const { wrapper, store } = await setup(ReceiveView, { listening: true, http: { state: 'failed', port: 3415, reason: 'port_in_use' }, wallet });
    expect(wrapper.text()).toContain(t('msg.modern.send.rcv_http_failed'));
    expect(wrapper.text()).toContain(t('msg.modern.send.rcv_http_failed_port', { port: 3415 }).trim());
    expect(wrapper.text()).toContain(t('msg.modern.send.rcv_on'));
    expect(wrapper.find('button[aria-label="' + t('msg.modern.send.rcv_copy_http_off') + '"]').element.disabled).toBe(true);
    await button(wrapper, t('msg.httpReceive.http_retry')).trigger('click');
    await flushPromises();
    expect(wallet.startListen).toHaveBeenCalledWith('http');
    expect(store.state.httpListener.state).toBe('on');
    expect(wrapper.text()).not.toContain(t('msg.modern.send.rcv_http_failed'));
  });

  test('Start listener with port 3415 busy (HTTP starts with the wallet): HTTP failed shown, receiving on via Epicbox', async () => {
    const wallet = fakeWallet({ startListen: vi.fn(async () => ({ success: false, portInUse: 3415 })) });
    const { wrapper, store } = await setup(ReceiveView, { listening: false, wallet, config: { http_listener_autostart: true } });
    await button(wrapper, t('msg.modern.send.rcv_start')).trigger('click');
    await flushPromises();
    expect(wallet.startListen).toHaveBeenCalledTimes(1);
    expect(wallet.startEpicbox).toHaveBeenCalledTimes(1);
    expect(store.state.walletListenerService).toBe(true);
    expect(wrapper.text()).toContain(t('msg.modern.send.rcv_on'));
    expect(wrapper.text()).toContain(t('msg.modern.send.rcv_http_failed_port', { port: 3415 }).trim());
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
