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

const up = { user_agent: 'MW/Epic 4.1.0', sync_status: 'synced', tip: { height: 3100000 }, connections: 8, node_behind: 0 };

describe('sidebar node line', () => {
  test('online and synced: tooltip only, no block number', async () => {
    const b = await nodeLine({ nodeStatus: up });
    expect(b.attributes('aria-label')).toContain(t('msg.modern.svc_open_node'));
    expect(b.attributes('aria-label')).toContain('Node online and synced');
    expect(b.attributes('title')).toContain('Node online and synced');
    expect(b.text()).not.toMatch(/3,100,000|3100000|peers|block/i);
  });

  test('behind: the tooltip says how far, and "Switch node" is offered', async () => {
    const b = await nodeLine({ nodeStatus: { ...up, node_behind: 120 } });
    expect(b.attributes('title')).toContain('Node syncing: 120 blocks behind');
    expect(b.text()).toContain(t('msg.modern.switch_node'));
  });

  test('not responding, not an Epic node, connecting', async () => {
    expect((await nodeLine({ nodeStatus: { error: true } })).attributes('title')).toContain('Node not responding');
    expect((await nodeLine({ nodeStatus: { error: true }, nodeProblem: { kind: 'not_epic' } })).attributes('title')).toContain('Not an Epic node');
    expect((await nodeLine({ nodeStatus: {} })).attributes('title')).toContain('Connecting to the node');
  });
});
