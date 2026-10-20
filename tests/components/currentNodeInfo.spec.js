/*
 * Settings › Node's details block (modern/form/CurrentNodeInfo.vue): status word, version (a warning
 * only when too old), height with the network-gap meter, and the last block's time. The time is asked
 * from nodeService.lastBlockTime only while the block is shown, once per new tip height.
 */
import { describe, test, expect, vi, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import CurrentNodeInfo from '@/components/modern/form/CurrentNodeInfo.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';

const status = (extra = {}) => ({ sync_status: 'no_sync', ready_for_txs: true, user_agent: 'MW/Epic 4.1.0', tip: { height: 3100000 }, network_height: 3100000, ...extra });

function setup(nodeStatus, lastBlockTime = vi.fn(async () => Date.now() - 40000)) {
  const store = makeStore({ nodeStatus });
  const m = mountView(CurrentNodeInfo, { store, services: { $nodeService: { lastBlockTime } } });
  return { ...m, lastBlockTime };
}

afterEach(() => vi.useRealTimers());

describe('CurrentNodeInfo', () => {
  test('online: status word, version line, height with a level meter, last block time with the exact time as title', async () => {
    const { wrapper, lastBlockTime } = setup(status());
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain(t('msg.mynodes.state_online'));
    expect(text).toContain('4.1.0');
    expect(text).toContain('3,100,000');
    expect(text).not.toMatch(/at tip|behind| ms|Last checked|Response|Address/);
    expect(text).not.toContain(t('msg.mynodes.version_old', { min: '4.1.0' }));
    const meter = wrapper.find('.e-hmeter');
    expect(meter.attributes('role')).toBe('img');
    expect(meter.attributes('aria-label')).toBe(t('msg.mynodes.height_level'));
    expect(meter.classes()).toContain('e-ok');
    expect(lastBlockTime).toHaveBeenCalledTimes(1);
    expect(lastBlockTime).toHaveBeenCalledWith(3100000);
    expect(text).toContain('40 sec. ago');
    expect(wrapper.find('dd[title]').attributes('title')).toMatch(/\d/);
    wrapper.unmount();
  });

  test('the gap: a little behind is amber, far behind red, an unknown network tip is neutral with no claim', async () => {
    const near = setup(status({ network_height: 3100010 }));
    await flushPromises();
    expect(near.wrapper.find('.e-hmeter').classes()).toContain('e-warn');
    expect(near.wrapper.find('.e-hmeter').attributes('aria-label')).toBe(t('msg.mynodes.height_behind', { n: '10' }));
    near.wrapper.unmount();
    const far = setup(status({ network_height: 3100500 }));
    await flushPromises();
    expect(far.wrapper.find('.e-hmeter').classes()).toContain('e-risk');
    far.wrapper.unmount();
    const unknown = setup(status({ network_height: 0 }));
    await flushPromises();
    expect(unknown.wrapper.find('.e-hmeter').classes()).not.toContain('e-ok');
    expect(unknown.wrapper.find('.e-hmeter').attributes('aria-label')).toBe(t('msg.mynodes.height_unknown'));
    unknown.wrapper.unmount();
  });

  test('syncing and a too-old version', async () => {
    const { wrapper } = setup(status({ ready_for_txs: false, sync_status: 'body_sync', user_agent: 'MW/Epic 4.0.3' }));
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.mynodes.state_syncing'));
    expect(wrapper.text()).toContain(t('msg.mynodes.version_old', { min: '4.1.0' }));
    wrapper.unmount();
  });

  test('no answer: Not responding, no details and no block time asked', async () => {
    const { wrapper, lastBlockTime } = setup({ error: true, reason: 'not reachable' });
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.mynodes.state_offline'));
    expect(wrapper.find('dl').exists()).toBe(false);
    expect(lastBlockTime).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  test('a new tip asks once more, the same tip never; the relative text moves on locally every 15 s', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const { wrapper, lastBlockTime, store } = setup(status());
    await flushPromises();
    expect(lastBlockTime).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('40 sec. ago');
    vi.advanceTimersByTime(15000);
    await flushPromises();
    expect(wrapper.text()).toContain('55 sec. ago');
    expect(lastBlockTime).toHaveBeenCalledTimes(1);
    store.commit('nodeStatus', status({ tip: { height: 3100000 } }));
    await flushPromises();
    expect(lastBlockTime).toHaveBeenCalledTimes(1);
    store.commit('nodeStatus', status({ tip: { height: 3100001 }, network_height: 3100001 }));
    await flushPromises();
    expect(lastBlockTime).toHaveBeenCalledTimes(2);
    expect(lastBlockTime).toHaveBeenLastCalledWith(3100001);
    wrapper.unmount();
  });
});
