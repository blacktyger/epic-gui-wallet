/*
 * The HTTP listener on demand (Modern, fix/node-load): Settings › Receiving turns it on and
 * off now and has its own "Start with the wallet" checkbox (default off, saved at once); the tour has
 * one step per way to send and receive. Each epic-wallet process asks the node every 10 s, so the
 * HTTP listener only runs while someone wants it.
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import SettingsReceiving from '@/components/modern/views/settings/SettingsReceiving.vue';
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
  const m = mountView(SettingsReceiving, {
    store: makeStore({ ui: 'modern', user: { id: 1, account: 'w1', nodeInternal: false }, httpListener: http, walletEpicboxService: true, walletListenerService: true }),
    services: {
      configService,
      $walletService,
      $nodeService: { checkNodeVersion: vi.fn(async () => ({ ok: true })) },
      $userService: { ensureUser: vi.fn(async () => ({ id: 1 })) },
      $importer: { scanChains: vi.fn(async () => []) },
    },
  });
  return { ...m, configService, $walletService };
}

describe('Settings › Receiving › Epicbox', () => {
  test('Start Epicbox with the wallet saves at once; the status line says Connecting while it starts', async () => {
    const { wrapper, configService } = setup();
    await flushPromises();
    const box = wrapper.find('input[aria-labelledby=stg-auto-l]');
    expect(box.element.checked).toBe(true);
    box.element.checked = false;
    await box.trigger('change');
    expect(configService.updateConfig).toHaveBeenCalledWith({ walletlisten_on_startup: false });
    expect(wrapper.find('[data-test=epicbox-status]').text()).toContain(t('msg.modern.eb_connecting'));
  });

  test('paused (node not synced): Paused, waiting for the node; back to Listening when the store says so', async () => {
    const { wrapper, store } = setup();
    store.commit('epicbox', { state: 'paused', server: 'wss://epicbox.epiccash.com:443', since: Date.now() - 600000 });
    await flushPromises();
    const st = wrapper.find('[data-test=epicbox-status]');
    expect(st.text()).toContain(t('msg.modern.eb_paused'));
    expect(st.text()).toContain(t('msg.modern.settings.eb_paused_line'));
    expect(st.text()).not.toContain(t('msg.modern.eb_connecting'));
    expect(st.find('.e-stword').classes()).toContain('e-pause');
    store.commit('epicbox', { state: 'listening', server: 'wss://epicbox.epiccash.com:443', since: Date.now() });
    await flushPromises();
    expect(wrapper.find('[data-test=epicbox-status]').text()).toContain(t('msg.modern.eb_listening'));
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
