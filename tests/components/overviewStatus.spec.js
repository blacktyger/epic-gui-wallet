/*
 * The Overview Status card (Modern): the same dot, word and lines as the sidebar rows and their hover
 * cards (modern/serviceRows.js), so the two never say different things: a node dot and word, Epicbox
 * listening / connecting / paused / not responding, and a Tor line only while Tor is on.
 */
import { describe, test, expect } from 'vitest';
import { vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import OverviewView from '@/components/modern/views/OverviewView.vue';
import { makeStore } from './support/fakeStore.js';
import { mountView, t } from './support/mountView.js';

const up = { user_agent: 'MW/Epic 4.1.0', sync_status: 'synced', tip: { height: 3100000 }, ready_for_txs: true, node_behind: 0 };
const EB = 'wss://epicbox.epiccash.com:443';

async function overview(state) {
  const configService = {
    config: { check_node_api_http_addr: 'https://node.example.org:3413', epicbox_domain: 'epicbox.epiccash.com', nodesynced: true },
    defaultAccountNetwork: 'mainnet',
    getNodeFallBack: () => 'https://node.example.org:3413',
  };
  const m = mountView(OverviewView, {
    store: makeStore({ ui: 'modern', txs: [], nodeType: 'external', ...state }),
    services: { configService, $router: { push: vi.fn(async () => {}), replace: vi.fn(), currentRoute: { value: { fullPath: '/dashboard' } } } },
    route: { path: '/dashboard', query: {} },
    stubs: { RecentTx: true, SyncNotes: true, TxRing: true, NodeNotice: true, ETour: true, MoneyText: true, EIcon: true },
  });
  await flushPromises();
  const row = (key) => m.wrapper.find('[data-test=ov-' + key + ']');
  return { ...m, node: row('node'), eb: row('epicbox'), http: row('http'), tor: row('tor') };
}

const dot = (row) => row.find('.e-ico .e-st').classes();

describe('Overview Status card', () => {
  test('node: icon with the dot, "Synced · height" on the right, address and height in the tooltip', async () => {
    const { node } = await overview({ nodeStatus: up });
    expect(dot(node)).toContain('e-ok');
    expect(node.attributes('tabindex')).toBe('0');
    expect(node.text()).toContain(t('msg.modern.svc_node'));
    expect(node.find('.e-srow-val').text()).toBe(t('msg.modern.svc_synced') + ' · 3,100,000');
    expect(node.find('[role=tooltip]').text()).toContain('node.example.org:3413 · 3,100,000');
    expect(node.attributes('aria-describedby')).toBe(node.find('[role=tooltip]').attributes('id'));
  });

  test('Epicbox listening: the domain only, the full host in the tooltip', async () => {
    const { eb } = await overview({ nodeStatus: up, walletEpicboxService: true, epicbox: { state: 'listening', server: EB, since: Date.now() } });
    expect(dot(eb)).toContain('e-ok');
    expect(eb.find('.e-srow-val').text()).toBe('epiccash.com');
    expect(eb.find('[role=tooltip]').text()).toContain(t('msg.modern.svc_epicbox_line', { server: 'epicbox.epiccash.com', state: t('msg.modern.eb_listening') }));
  });

  test('Epicbox paused: its own dot and words, never Connecting', async () => {
    const { eb } = await overview({ nodeStatus: up, walletEpicboxService: true, epicbox: { state: 'paused', server: EB, since: Date.now() - 600000 } });
    expect(dot(eb)).toContain('e-pause');
    expect(eb.text()).toContain(t('msg.modern.eb_paused'));
    expect(eb.text()).toContain(t('msg.modern.eb_why_node'));
    expect(eb.text()).not.toContain(t('msg.modern.eb_connecting'));
  });

  test('Epicbox connecting, then "no answer" with the risk icon after a while', async () => {
    const connecting = await overview({ nodeStatus: up, epicbox: { state: 'connecting', server: EB, since: Date.now() } });
    expect(dot(connecting.eb)).toContain('e-sync');
    expect(connecting.eb.find('.e-srow-val').text()).toContain(t('msg.modern.eb_connecting'));
    const down = await overview({ nodeStatus: up, epicbox: { state: 'connecting', server: EB, since: Date.now() - 60000 } });
    expect(dot(down.eb)).toContain('e-down');
    expect(down.eb.find('.e-srow-val').text()).toBe('epiccash.com · ' + t('msg.modern.svc_no_answer'));
    expect(down.eb.find('.e-ico').classes()).toContain('e-err');
    expect(down.eb.text()).toContain(t('msg.modern.eb_why_no_answer'));
  });

  test('HTTP and Tor rows only while Direct offers them', async () => {
    const off = await overview({ nodeStatus: up, walletEpicboxService: true, epicbox: { state: 'listening', server: EB }, tor: { enabled: false, state: 'off' }, direct: { on: false, http: true, tor: true } });
    expect(off.http.exists()).toBe(false);
    expect(off.tor.exists()).toBe(false);
    const direct = { on: true, http: true, tor: true, public: false, wantPublic: false };
    const onion = 'mk7ca5xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxluyd';
    const on = await overview({ nodeStatus: up, walletEpicboxService: true, epicbox: { state: 'listening', server: EB }, httpListener: { state: 'on', port: 3415, reason: '' }, direct, tor: { enabled: true, state: 'ready', onion: onion + '.onion' } });
    expect(on.http.find('.e-srow-val').text()).toMatch(/^127\.0\.0\.1:/);
    expect(on.tor.find('.e-srow-val').text()).toBe('mk7ca5…luyd.onion');
    const starting = await overview({ nodeStatus: up, direct, tor: { enabled: true, state: 'starting', progress: 62 } });
    expect(starting.tor.find('.e-srow-val').text()).toBe(t('msg.modern.svc_tor_starting', { n: 62 }));
    expect(dot(starting.tor)).toContain('e-busy');
  });

  test('Receive options opens Settings › Receiving', async () => {
    const { wrapper, $router } = await overview({ nodeStatus: up });
    await wrapper.find('[data-test=ov-receive-options]').trigger('click');
    await flushPromises();
    expect($router.push).toHaveBeenCalledWith({ path: '/settings/receiving' });
  });

  test('Esc dismisses a row tooltip', async () => {
    const { node } = await overview({ nodeStatus: up });
    await node.trigger('keydown', { key: 'Escape' });
    expect(node.classes()).toContain('e-is-dismissed');
  });
});
