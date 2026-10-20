/*
 * The sidebar Node line (Modern): one status icon and a short tooltip, no height, peers, version or ms.
 */
import { describe, test, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import ServiceStatus from '@/components/modern/shell/ServiceStatus.vue';
import { i18n } from '@/i18n';
import { makeStore } from './support/fakeStore.js';
import { t } from './support/mountView.js';

const Blank = { template: '<div />' };

async function nodeLine(state) {
  const router = createRouter({ history: createMemoryHistory(), routes: ['/', '/settings'].map(path => ({ path, component: Blank })) });
  await router.push('/');
  const w = mount(ServiceStatus, { global: { plugins: [i18n, makeStore(state), router], stubs: { mdicon: true } } });
  return w.findAll('button.e-svc')[0];
}

const up = { user_agent: 'MW/Epic 4.1.0', sync_status: 'synced', tip: { height: 3100000 }, ready_for_txs: true, node_behind: 0 };

describe('sidebar node line', () => {
  test('green: ready_for_txs, tooltip only, no block number', async () => {
    const b = await nodeLine({ nodeStatus: up });
    expect(b.attributes('aria-label')).toContain(t('msg.modern.svc_open_node'));
    expect(b.attributes('aria-label')).toContain('Node online and ready');
    expect(b.attributes('title')).toContain('Node online and ready');
    expect(b.text()).not.toMatch(/3,100,000|3100000|peers|block/i);
  });

  test('yellow: not ready yet, no "blocks behind" in the main view, "Switch node" offered', async () => {
    const b = await nodeLine({ nodeStatus: { ...up, ready_for_txs: false, node_behind: 120 } });
    expect(b.attributes('title')).toContain('Node syncing, not ready yet');
    expect(b.attributes('title')).not.toMatch(/120|behind/);
    expect(b.text()).toContain(t('msg.modern.switch_node'));
  });

  test('red with a short reason; connecting before the first answer', async () => {
    expect((await nodeLine({ nodeStatus: { error: true, reason: 'no reply within 10 s' } })).attributes('title')).toContain('Node not responding: no reply in time');
    expect((await nodeLine({ nodeStatus: { error: true, reason: 'HTTP 403' } })).attributes('title')).toContain('Node not responding: HTTP error 403');
    expect((await nodeLine({ nodeStatus: { error: true }, nodeProblem: { kind: 'not_epic' } })).attributes('title')).toContain('Node not responding: not an Epic node');
    expect((await nodeLine({ nodeStatus: {} })).attributes('title')).toContain('Connecting to the node');
  });
});
