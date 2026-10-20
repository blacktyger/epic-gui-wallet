/*
 * The HTTP listener on demand (Modern, fix/node-load): Settings › Node and receiving turns it on and
 * off now and has its own "start with the wallet" switch (default off, saved at once); the tour has
 * one step per way to send and receive. Each epic-wallet process asks the node every 10 s, so the
 * HTTP listener only runs while someone wants it.
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import SettingsGeneral from '@/components/modern/views/settings/SettingsGeneral.vue';
import OverviewView from '@/components/modern/views/OverviewView.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';

function setup({ http = { state: 'off', port: 0, reason: '' }, config = {}, wallet = {} } = {}) {
  const configService = {
    langs: { en: 'English' },
    config: { locale: 'en', epicbox_domain: 'epicbox.epiccash.com', walletlisten_on_startup: true, node_background: false, check_node_api_http_addr: 'https://node.example.org:3413', ...config },
    settings: { nodeChainDir: () => '', setChainOffer: vi.fn(() => true) },
    defaultAccountNetwork: 'mainnet',
    walletId: 'w1',
    wallet: { label: 'Main' },
    walletListenerPort: 3415,
    updateConfig: vi.fn(() => true),
    getNodeFallBack: () => 'https://node.example.org:3413',
    localNodeUrl: () => 'http://127.0.0.1:3413',
  };
  const $walletService = {
    readEpicboxConfig: vi.fn(() => ({})),
    startListen: vi.fn(async () => ({ success: true, pid: 12 })),
    stopHttpListen: vi.fn(async () => true),
    stopListen: vi.fn(async () => true),
    ...wallet,
  };
  const m = mountView(SettingsGeneral, {
    store: makeStore({ ui: 'modern', user: { id: 1, account: 'w1', nodeInternal: false }, httpListener: http, walletEpicboxService: true, walletListenerService: true }),
    services: {
      configService,
      $walletService,
      $nodeService: { checkNodeVersion: vi.fn(async () => ({ ok: true })) },
      $userService: { ensureUser: vi.fn(async () => ({ id: 1 })) },
      $importer: { scanChains: vi.fn(async () => []) },
    },
    stubs: { NodeDirectory: true, EpicboxServers: true },
  });
  return { ...m, configService, $walletService };
}

describe('Settings › HTTP listener (Modern)', () => {
  test('off by default: the switch is off and says so, Start with wallet is off', async () => {
    const { wrapper } = setup();
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.modern.settings.http_l'));
    expect(wrapper.find('[data-test=http-switch]').element.checked).toBe(false);
    expect(wrapper.text()).toContain(t('msg.modern.settings.http_off'));
    expect(wrapper.find('[data-test=http-autostart]').element.checked).toBe(false);
  });

  test('the switch starts the HTTP listener now, and stops only it', async () => {
    const { wrapper, store, $walletService, configService } = setup();
    await flushPromises();
    const sw = wrapper.find('[data-test=http-switch]');
    sw.element.checked = true;
    await sw.trigger('change');
    await flushPromises();
    expect($walletService.startListen).toHaveBeenCalledWith('http');
    expect(store.state.httpListener.state).toBe('on');
    expect(wrapper.find('[data-test=http-switch]').element.checked).toBe(true);
    expect(wrapper.text()).toContain(t('msg.modern.settings.http_on', { port: 3415 }));
    sw.element.checked = false;
    await sw.trigger('change');
    await flushPromises();
    expect($walletService.stopHttpListen).toHaveBeenCalledTimes(1);
    expect($walletService.stopListen).not.toHaveBeenCalled();
    expect(store.state.httpListener).toBe(null);
    expect(store.state.walletListenerService).toBe(true);
    //on/off now is not a setting: nothing saved, no unsaved-changes bar
    expect(configService.updateConfig).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain(t('msg.modern.settings.unsaved'));
  });

  test('port 3415 busy: the switch stays off and says why', async () => {
    const { wrapper } = setup({ wallet: { startListen: vi.fn(async () => ({ success: false, portInUse: 3415 })) } });
    await flushPromises();
    const sw = wrapper.find('[data-test=http-switch]');
    sw.element.checked = true;
    await sw.trigger('change');
    await flushPromises();
    expect(wrapper.find('[data-test=http-switch]').element.checked).toBe(false);
    expect(wrapper.text()).toContain(t('msg.modern.send.rcv_http_failed_port', { port: 3415 }).trim());
  });

  test('Start with wallet is saved at once (http_listener_autostart) and shows the saved value', async () => {
    const { wrapper, configService } = setup();
    await flushPromises();
    const auto = wrapper.find('[data-test=http-autostart]');
    auto.element.checked = true;
    await auto.trigger('change');
    expect(configService.updateConfig).toHaveBeenCalledWith({ http_listener_autostart: true });
    expect(wrapper.text()).not.toContain(t('msg.modern.settings.unsaved'));
    const on = setup({ config: { http_listener_autostart: true } });
    await flushPromises();
    expect(on.wrapper.find('[data-test=http-autostart]').element.checked).toBe(true);
  });
});

describe('Welcome tour (Modern)', () => {
  test('one step each for Epicbox, HTTP(S) and transaction files, after Receive', () => {
    const steps = OverviewView.computed.tourSteps.call({ $t: (k) => t(k) });
    const titles = steps.map((s) => s.title);
    const at = titles.indexOf(t('msg.modern.tour_receive_t'));
    expect(at).toBeGreaterThanOrEqual(0);
    expect(titles.slice(at + 1, at + 4)).toEqual([t('msg.modern.tour_epicbox_t'), t('msg.modern.tour_http_t'), t('msg.modern.tour_files_t')]);
    for (const s of steps.slice(at + 1, at + 4)) {
      expect(s.text.length).toBeGreaterThan(20);
      //one or two lines: short
      expect(s.text.length).toBeLessThan(160);
    }
  });
});
