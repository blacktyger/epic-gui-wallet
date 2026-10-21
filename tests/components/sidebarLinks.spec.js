/*
 * Sidebar links (Modern): Node opens Settings › Node (/settings#node), Receiving Settings › Receiving (/settings/receiving#epicbox), the
 * wallet row opens Settings › Wallet, and the section jump scrolls, flashes and focuses.
 */
import { readFileSync } from 'node:fs';
import { describe, test, expect, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import ServiceStatus from '@/components/modern/shell/ServiceStatus.vue';
import { jumpTo, openSettingsSection, JUMP_EVENT } from '@/components/modern/settings/jump';
import { i18n } from '@/i18n';
import { makeStore } from './support/fakeStore.js';
import { t } from './support/mountView.js';

const Blank = { template: '<div />' };
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/settings', '/settings/receiving', '/account'].map(path => ({ path, component: Blank })),
  });
}

async function mountStatus() {
  const router = makeRouter();
  await router.push('/');
  const wrapper = mount(ServiceStatus, { attachTo: document.body, global: { plugins: [i18n, makeStore(), router], stubs: { mdicon: true } } });
  return { wrapper, router };
}

describe('sidebar service lines', () => {
  test('Node opens Settings at #node, Receiving at #epicbox, each with an "Open ... settings" label', async () => {
    const { wrapper, router } = await mountStatus();
    const node = wrapper.find('[data-test=svc-node]');
    const rcv = wrapper.find('[data-test=svc-rcv]');
    expect(node.attributes('aria-label')).toContain(t('msg.modern.svc_open_node'));
    expect(rcv.attributes('aria-label')).toContain(t('msg.modern.svc_open_epicbox'));
    await rcv.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/settings/receiving#epicbox');
    await router.push('/');
    await node.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/settings#node');
  });

  test('with Settings already open the same link fires the jump event again', async () => {
    const { wrapper, router } = await mountStatus();
    await router.push('/settings/receiving#epicbox');
    const seen = vi.fn();
    window.addEventListener(JUMP_EVENT, seen);
    await wrapper.find('[data-test=svc-rcv]').trigger('click');
    await flushPromises();
    window.removeEventListener(JUMP_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('jumpTo', () => {
  function page() {
    document.body.innerHTML = '<section id="stg-sec-epicbox"><h2 id="stg-rcv-h" tabindex="-1"></h2></section><section id="stg-sec-node"><h2 id="stg-node-h" tabindex="-1"></h2></section>';
    const sec = document.getElementById('stg-sec-epicbox');
    sec.scrollIntoView = vi.fn();
    document.getElementById('stg-sec-node').scrollIntoView = vi.fn();
    return sec;
  }

  test('#epicbox scrolls the section, flashes it and focuses the Receiving heading', () => {
    const sec = page();
    expect(jumpTo('#epicbox')).toBe(true);
    expect(sec.scrollIntoView).toHaveBeenCalled();
    expect(sec.classList.contains('e-jump-flash')).toBe(true);
    expect(document.activeElement.id).toBe('stg-rcv-h');
  });

  test('#node focuses the Node heading; an unknown hash does nothing', () => {
    page();
    expect(jumpTo('#node')).toBe(true);
    expect(document.activeElement.id).toBe('stg-node-h');
    expect(jumpTo('#nope')).toBe(false);
  });
});

describe('jumpTo: content that loads above the section later', () => {
  function pushedDown() {
    document.body.innerHTML = '<main><section id="stg-sec-epicbox"><h2 id="stg-rcv-h" tabindex="-1"></h2></section></main>';
    const sec = document.getElementById('stg-sec-epicbox');
    sec.scrollIntoView = vi.fn();
    //the node list and details above it arrived: the section is 700 px down again
    sec.getBoundingClientRect = () => ({ top: 700, bottom: 1500 });
    return sec;
  }

  test('puts the section back at the top once the page settles', () => {
    vi.useFakeTimers();
    const sec = pushedDown();
    jumpTo('#epicbox');
    vi.advanceTimersByTime(3000);
    expect(sec.scrollIntoView.mock.calls.length).toBeGreaterThan(1);
    expect(sec.scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'start' });
    vi.useRealTimers();
  });

  test('leaves it alone once the user scrolls', () => {
    vi.useFakeTimers();
    const sec = pushedDown();
    jumpTo('#epicbox');
    document.dispatchEvent(new Event('wheel'));
    vi.advanceTimersByTime(3000);
    expect(sec.scrollIntoView).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('wallet row', () => {
  //AppShell extends NavBar (styles the component harness can't load), so the markup is pinned from source
  const src = readFileSync('src/components/modern/shell/AppShell.vue', 'utf8');

  test('avatar and name are one link to /account, labelled, and the lock button stays a separate button', () => {
    const link = src.match(/<router-link to="\/account"[\s\S]*?<\/router-link>/)[0];
    expect(link).toContain('e-account-link');
    expect(link).toContain('svc_open_wallet');
    expect(link).toContain('e-avatar');
    expect(link).not.toContain('<button');
    expect(src).toMatch(/@click="logout"/);
    expect(src.indexOf('@click="logout"')).toBeGreaterThan(src.indexOf('</router-link>'));
  });
});
