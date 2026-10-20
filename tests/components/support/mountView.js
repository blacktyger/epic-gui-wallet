/*
 * mountView(Component, opts): a screen mounted the way main.js sets the app up (i18n with the real
 * English strings, the store, $toast, the emitter and the services as global properties), with
 * fakes for everything outside the renderer.
 *
 *   store      a store from makeStore() (default: makeStore())
 *   services   global properties to add or replace ($walletService, configService, ...)
 *   props, route, stubs, attachTo as in @vue/test-utils
 */
import { h } from 'vue';
import { vi } from 'vitest';
import { mount, RouterLinkStub } from '@vue/test-utils';
import mitt from 'mitt';
import { i18n } from '@/i18n';
import { makeStore } from './fakeStore.js';

/* mdi-vue's <mdicon>: an <i> naming the icon, so a click on it still reaches the component */
const MdiStub = {
  name: 'mdicon',
  props: { name: String, size: [String, Number] },
  setup(props) { return () => h('i', { 'data-icon': props.name }); },
};

export function fakeToast() {
  return { show: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), clear: vi.fn() };
}

export function fakeEmitter() {
  const emitter = mitt();
  vi.spyOn(emitter, 'emit');
  return emitter;
}

export function mountView(Component, { store = makeStore(), services = {}, props = {}, route = {}, stubs = {}, attachTo } = {}) {
  const mocks = {
    $toast: fakeToast(),
    emitter: fakeEmitter(),
    $walletService: {},
    $nodeService: {},
    $userService: {},
    $addressBookService: { findAddress: vi.fn(async () => []) },
    $addressTransactionsService: { addAddress: vi.fn(async () => {}) },
    configService: {},
    $router: { push: vi.fn(), replace: vi.fn() },
    $route: { path: '/', query: {}, params: {}, ...route },
    ...services,
  };
  const wrapper = mount(Component, {
    props,
    attachTo: attachTo === undefined ? document.body : attachTo,
    global: {
      plugins: [i18n, store],
      mocks,
      stubs: { RouterLink: RouterLinkStub, mdicon: MdiStub, ...stubs },
    },
  });
  return { wrapper, store, ...mocks };
}

/* the text a user sees for a message key, from the English strings */
export const t = (...args) => i18n.global.t(...args);
