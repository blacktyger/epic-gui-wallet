/*
 * The node address in Settings, both interfaces: Classic Settings.vue with form/nodeserverField.vue,
 * Modern SettingsGeneral.vue with modern/form/NodeserverField.vue. The field keeps the text exactly
 * as typed (6.1.4: a "/" of "http://" vanished while typing); Save checks the address, asks the
 * node for its version and saves the normalised address (scheme added, trailing "/" dropped).
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import Settings from '@/components/Settings.vue';
import SettingsGeneral from '@/components/modern/views/settings/SettingsGeneral.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { button } from './support/dom.js';

const SAVED_NODE = 'https://node.epiccash.com:3413';

function fakeConfig() {
  return {
    langs: { en: 'English', de: 'Deutsch' },
    config: { locale: 'en', epicbox_domain: 'epicbox.epiccash.com', walletlisten_on_startup: false, node_background: false, check_node_api_http_addr: SAVED_NODE },
    settings: { nodeChainDir: () => '', setChainOffer: vi.fn(() => true) },
    defaultAccountNetwork: 'mainnet',
    walletId: 'w1',
    wallet: { label: 'Main' },
    updateConfig: vi.fn(() => true),
    getNodeFallBack: () => SAVED_NODE,
    localNodeUrl: () => 'http://127.0.0.1:3413',
  };
}

function setup(Component, { nodeInternal = false, check = async () => ({ ok: true }) } = {}) {
  const configService = fakeConfig();
  const $nodeService = { checkNodeVersion: vi.fn(check) };
  const m = mountView(Component, {
    store: makeStore({ user: { id: 1, account: 'w1', nodeInternal } }),
    services: {
      configService,
      $nodeService,
      $walletService: { readEpicboxConfig: vi.fn(() => ({})) },
      $userService: { ensureUser: vi.fn(async () => ({ id: 1 })) },
      $importer: { scanChains: vi.fn(async () => []) },
    },
    stubs: { NodeDirectory: true, EpicboxServers: true },
  });
  return { ...m, configService, $nodeService };
}

const INTERFACES = [
  {
    name: 'Classic',
    Component: Settings,
    addressInput: (w) => w.find('input[type=nodeaddress]'),
    async choose(w, kind) { await w.find('select').setValue(kind); },
    async save(w) {
      await button(w, t('msg.save')).trigger('click');
      await flushPromises();
    },
  },
  {
    name: 'Modern',
    Component: SettingsGeneral,
    addressInput: (w) => w.find('input[id^="e-nodeserverField-"]'),
    async choose(w, kind) { await w.find('input[type=radio][value=' + kind + ']').setValue(true); },
    /* the save bar appears once something differs from what is saved */
    async save(w) {
      await button(w, t('msg.save')).trigger('click');
      await flushPromises();
    },
  },
];

describe.each(INTERFACES)('Settings node address ($name)', (ui) => {
  test('shows the saved external node address', async () => {
    const { wrapper } = setup(ui.Component);
    await flushPromises();
    expect(ui.addressInput(wrapper).element.value).toBe(SAVED_NODE);
  });

  test('typing "http://" key by key keeps both slashes, and the rest of the address as typed', async () => {
    const { wrapper } = setup(ui.Component);
    await flushPromises();
    const input = ui.addressInput(wrapper);
    await input.setValue('');
    const typed = 'http://192.168.1.5:3413/';
    let value = '';
    for (const ch of typed) {
      value += ch;
      await input.setValue(value);
      await flushPromises();
      expect(ui.addressInput(wrapper).element.value).toBe(value);
    }
  });

  test.each([
    ['192.168.1.5:3413/', 'http://192.168.1.5:3413'],
    ['node.example.com', 'https://node.example.com'],
    ['  http://node.example.com:3413// ', 'http://node.example.com:3413'],
    ['https://node.example.com:3413', 'https://node.example.com:3413'],
  ])('Save of %j checks and saves %j, the field keeps what was typed', async (typed, saved) => {
    const { wrapper, configService, $nodeService } = setup(ui.Component);
    await flushPromises();
    await ui.addressInput(wrapper).setValue(typed);
    await ui.save(wrapper);
    expect($nodeService.checkNodeVersion).toHaveBeenCalledWith(saved);
    expect(configService.updateConfig).toHaveBeenCalledTimes(1);
    expect(configService.updateConfig.mock.calls[0][0]).toMatchObject({ check_node_api_http_addr: saved, nodeInternal: false });
    expect(ui.addressInput(wrapper).element.value).toBe(typed);
  });

  test.each(['http://', 'not a node', 'https://my node.example'])('Save of the invalid address %j says so and saves nothing', async (typed) => {
    const { wrapper, configService, $nodeService } = setup(ui.Component);
    await flushPromises();
    await ui.addressInput(wrapper).setValue(typed);
    await ui.save(wrapper);
    expect(wrapper.text()).toContain(t('msg.validators.http_address'));
    expect($nodeService.checkNodeVersion).not.toHaveBeenCalled();
    expect(configService.updateConfig).not.toHaveBeenCalled();
  });

  test('an address that is not an Epic node is named in the error and not saved', async () => {
    const { wrapper, configService } = setup(ui.Component, { check: async () => ({ ok: false, reason: 'no answer' }) });
    await flushPromises();
    await ui.addressInput(wrapper).setValue('https://example.org');
    await ui.save(wrapper);
    expect(wrapper.text()).toContain(t('msg.validators.not_epic_node', ['https://example.org (no answer)']));
    expect(configService.updateConfig).not.toHaveBeenCalled();
  });

  test('the built-in node is saved as the local node, without asking any external node', async () => {
    const { wrapper, configService, $nodeService, $toast } = setup(ui.Component);
    await flushPromises();
    await ui.choose(wrapper, 'internal');
    expect(ui.addressInput(wrapper).exists()).toBe(false);
    await ui.save(wrapper);
    expect($nodeService.checkNodeVersion).not.toHaveBeenCalled();
    expect(configService.updateConfig.mock.calls[0][0]).toMatchObject({ check_node_api_http_addr: 'http://127.0.0.1:3413', nodeInternal: true });
    expect($toast.success).toHaveBeenCalledWith(t('msg.settings.settings_saved'));
  });

  test('switching from the built-in node to external fills in the default node', async () => {
    const { wrapper } = setup(ui.Component, { nodeInternal: true });
    await flushPromises();
    expect(ui.addressInput(wrapper).exists()).toBe(false);
    await ui.choose(wrapper, 'external');
    expect(ui.addressInput(wrapper).element.value).toBe(SAVED_NODE);
  });
});

describe('Settings node address (Modern save bar)', () => {
  test('no save bar until something changes; Discard brings the saved address back', async () => {
    const { wrapper } = setup(SettingsGeneral);
    await flushPromises();
    expect(() => button(wrapper, t('msg.save'))).toThrow();
    const input = INTERFACES[1].addressInput(wrapper);
    await input.setValue('https://other.example');
    expect(wrapper.text()).toContain(t('msg.modern.settings.unsaved'));
    await button(wrapper, t('msg.modern.settings.discard')).trigger('click');
    expect(INTERFACES[1].addressInput(wrapper).element.value).toBe(SAVED_NODE);
    expect(wrapper.text()).not.toContain(t('msg.modern.settings.unsaved'));
  });
});
