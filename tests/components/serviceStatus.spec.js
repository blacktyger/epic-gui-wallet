/*
 * The sidebar status (Modern, option A): two rows, Node and Receiving, each a button with a status dot,
 * the name and one word; the details (server, height, the reason) are in a hover card linked by
 * aria-describedby. No height, peers, version or ms in the row itself.
 */
import { describe, test, expect } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import ServiceStatus from '@/components/modern/shell/ServiceStatus.vue';
import { i18n } from '@/i18n';
import { makeStore } from './support/fakeStore.js';
import { t } from './support/mountView.js';

const Blank = { template: '<div />' };

async function sidebar(state, config = { check_node_api_http_addr: 'https://node.example.org:3413', epicbox_domain: 'epicbox.epiccash.com' }) {
  const router = createRouter({ history: createMemoryHistory(), routes: ['/', '/settings', '/settings/receiving'].map(path => ({ path, component: Blank })) });
  await router.push('/');
  const w = mount(ServiceStatus, { attachTo: document.body, global: { plugins: [i18n, makeStore(state), router], mocks: { configService: { config, defaultAccountNetwork: 'mainnet' } }, stubs: { mdicon: true } } });
  await flushPromises();
  const row = (key) => w.find('[data-test=svc-' + key + ']');
  const card = (key) => w.find('#' + row(key).attributes('aria-describedby'));
  return { w, router, node: row('node'), rcv: row('rcv'), nodeCard: card('node'), rcvCard: card('rcv') };
}

const up = { user_agent: 'MW/Epic 4.1.0', sync_status: 'synced', tip: { height: 3100000 }, ready_for_txs: true, node_behind: 0 };
const dot = (b) => b.find('.e-st').classes();

describe('sidebar Node row', () => {
  test('green: ready_for_txs, one word in the row, the server and height only in the hover card', async () => {
    const { node, nodeCard } = await sidebar({ nodeStatus: up });
    expect(dot(node)).toContain('e-ok');
    expect(node.text()).toContain(t('msg.modern.svc_node'));
    expect(node.text()).toContain(t('msg.mynodes.state_online'));
    expect(node.text()).not.toMatch(/3,100,000|3100000|peers|block|node\.example/i);
    expect(node.attributes('aria-label')).toBe(t('msg.modern.svc_open_node') + ': ' + t('msg.mynodes.state_online'));
    expect(nodeCard.attributes('role')).toBe('tooltip');
    expect(nodeCard.text()).toContain('node.example.org:3413');
    expect(nodeCard.text()).toContain('3,100,000');
  });

  test('yellow: not ready yet is Syncing, the reason without "blocks behind" in the card', async () => {
    const { node, nodeCard } = await sidebar({ nodeStatus: { ...up, ready_for_txs: false, node_behind: 120 } });
    expect(dot(node)).toContain('e-sync');
    expect(node.text()).toContain(t('msg.mynodes.state_syncing'));
    expect(nodeCard.text()).toContain('Node syncing, not ready yet');
    expect(nodeCard.text()).not.toMatch(/120|behind/);
  });

  test('red with a short reason in the card; connecting before the first answer', async () => {
    const reasons = [
      [{ nodeStatus: { error: true, reason: 'no reply within 10 s' } }, 'Node not responding: no reply in time'],
      [{ nodeStatus: { error: true, reason: 'HTTP 403' } }, 'Node not responding: HTTP error 403'],
      [{ nodeStatus: { error: true }, nodeProblem: { kind: 'not_epic' } }, 'Node not responding: not an Epic node'],
    ];
    for (const [state, text] of reasons) {
      const { node, nodeCard } = await sidebar(state);
      expect(dot(node)).toContain('e-down');
      expect(node.text()).toContain(t('msg.mynodes.state_offline'));
      expect(nodeCard.text()).toContain(text);
    }
    const first = await sidebar({ nodeStatus: {} });
    expect(dot(first.node)).toContain('e-busy');
    expect(first.node.text()).toContain(t('msg.modern.eb_connecting'));
    expect(first.nodeCard.text()).toContain('Connecting to the node');
  });

  test('the built-in node is named in the card', async () => {
    const { nodeCard } = await sidebar({ nodeStatus: up, user: { id: 1, nodeInternal: true } });
    expect(nodeCard.text()).toContain(t('msg.modern.settings.node_builtin'));
  });
});

describe('sidebar Receiving row', () => {
  test('Epicbox listening: On, the server and HTTP state in the card', async () => {
    const { rcv, rcvCard } = await sidebar({ walletEpicboxService: true, epicbox: { state: 'listening', server: 'wss://epicbox.epiccash.com:443', since: Date.now() } });
    expect(dot(rcv)).toContain('e-ok');
    expect(rcv.text()).toContain(t('msg.modern.svc_receiving'));
    expect(rcv.text()).toContain(t('msg.modern.svc_on'));
    expect(rcvCard.text()).toContain('epicbox.epiccash.com');
    expect(rcvCard.text()).toContain(t('msg.modern.svc_http_off'));
  });

  test('off: Off, and only HTTP running is "HTTP only"', async () => {
    const off = await sidebar({});
    expect(dot(off.rcv)).toContain('e-off');
    expect(off.rcv.text()).toContain(t('msg.modern.eb_off'));
    expect(off.rcvCard.text()).toContain(t('msg.modern.svc_epicbox_off'));
    const http = await sidebar({ httpListener: { state: 'on', port: 3415, reason: '' } });
    expect(dot(http.rcv)).toContain('e-ok');
    expect(http.rcv.text()).toContain(t('msg.modern.svc_http_only_word'));
    expect(http.rcvCard.text()).toContain(t('msg.modern.svc_http_on'));
  });

  test('Epicbox connecting for a long time: Not responding with the reason', async () => {
    const { rcv, rcvCard } = await sidebar({ walletEpicboxService: true, epicbox: { state: 'connecting', server: 'wss://epicbox.epiccash.com:443', since: Date.now() - 60000 } });
    expect(dot(rcv)).toContain('e-down');
    expect(rcv.text()).toContain(t('msg.modern.eb_down'));
    expect(rcvCard.text()).toContain(t('msg.modern.eb_why_no_answer'));
  });
});
