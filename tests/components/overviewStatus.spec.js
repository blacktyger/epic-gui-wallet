/*
 * The Overview Status card (Modern): the same dot, word and lines as the sidebar rows and their hover
 * cards (modern/serviceRows.js), so the two never say different things: a node dot and word, Epicbox
 * listening / connecting / paused / not responding, and a Tor line only while Tor is on.
 */
import { describe, test, expect } from 'vitest';
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
    services: { configService },
    route: { path: '/dashboard', query: {} },
    stubs: { RecentTx: true, SyncNotes: true, TxRing: true, NodeNotice: true, ETour: true, MoneyText: true, EIcon: true },
  });
  await flushPromises();
  const row = (key) => m.wrapper.find('[data-test=ov-' + key + ']');
  return { ...m, node: row('node'), rcv: row('rcv') };
}

const dot = (row) => row.find('.e-st').classes();

describe('Overview Status card', () => {
  test('node: the dot and word of the sidebar, the address and height under it', async () => {
    const { node } = await overview({ nodeStatus: up });
    expect(dot(node)).toContain('e-ok');
    expect(node.text()).toContain(t('msg.modern.svc_node'));
    expect(node.text()).toContain(t('msg.mynodes.state_online'));
    expect(node.text()).toContain('node.example.org:3413 · 3,100,000');
  });

  test('Epicbox listening: On, the server and the HTTP listener', async () => {
    const { rcv } = await overview({ nodeStatus: up, walletEpicboxService: true, epicbox: { state: 'listening', server: EB, since: Date.now() } });
    expect(dot(rcv)).toContain('e-ok');
    expect(rcv.text()).toContain(t('msg.modern.svc_on'));
    expect(rcv.text()).toContain(t('msg.modern.svc_epicbox_line', { server: 'epicbox.epiccash.com', state: t('msg.modern.eb_listening') }));
    expect(rcv.text()).toContain(t('msg.modern.svc_http_off'));
  });

  test('Epicbox paused: its own words, never Connecting', async () => {
    const { rcv } = await overview({ nodeStatus: up, walletEpicboxService: true, epicbox: { state: 'paused', server: EB, since: Date.now() - 600000 } });
    expect(dot(rcv)).toContain('e-pause');
    expect(rcv.text()).toContain(t('msg.modern.eb_paused'));
    expect(rcv.text()).toContain(t('msg.modern.eb_why_node'));
    expect(rcv.text()).not.toContain(t('msg.modern.eb_connecting'));
  });

  test('Epicbox connecting, then not responding after a while', async () => {
    const connecting = await overview({ nodeStatus: up, epicbox: { state: 'connecting', server: EB, since: Date.now() } });
    expect(dot(connecting.rcv)).toContain('e-sync');
    expect(connecting.rcv.text()).toContain(t('msg.modern.eb_connecting'));
    const down = await overview({ nodeStatus: up, epicbox: { state: 'connecting', server: EB, since: Date.now() - 60000 } });
    expect(dot(down.rcv)).toContain('e-down');
    expect(down.rcv.text()).toContain(t('msg.modern.eb_down'));
    expect(down.rcv.text()).toContain(t('msg.modern.eb_why_no_answer'));
  });

  test('a Tor line only while Tor is on', async () => {
    const off = await overview({ nodeStatus: up, walletEpicboxService: true, epicbox: { state: 'listening', server: EB }, tor: { enabled: false, state: 'off' } });
    expect(off.rcv.text()).not.toContain(t('msg.modern.settings.tor.title'));
    const on = await overview({ nodeStatus: up, walletEpicboxService: true, epicbox: { state: 'listening', server: EB }, tor: { enabled: true, state: 'ready', onion: '' } });
    expect(on.rcv.text()).toContain(t('msg.modern.settings.tor.title') + ': ' + t('msg.modern.settings.tor.card_ready'));
  });
});
