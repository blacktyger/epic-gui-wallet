/*
 * The node in Modern Settings › Node (SettingsNode.vue with the combobox field form/NodeCombo.vue,
 * the logic of Classic form/nodeserverField.vue). The field keeps the text exactly as typed (6.1.4: a
 * "/" of "http://" vanished while typing); a pick (Enter on a typed address, a list row, the
 * built-in node) is applied at once through Settings.vue save(): the address is checked, the node
 * is asked for its version and the normalised address (scheme added, trailing "/" dropped) is saved.
 * There is no Save bar any more.
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import SettingsNode from '@/components/modern/views/settings/SettingsNode.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { button, pressEnter } from './support/dom.js';

const SAVED_NODE = 'https://node.epiccash.com:3413';

function fakeConfig() {
  const configService = {
    langs: { en: 'English', de: 'Deutsch' },
    config: { locale: 'en', epicbox_domain: 'epicbox.epiccash.com', walletlisten_on_startup: false, node_background: false, check_node_api_http_addr: SAVED_NODE },
    settings: { nodeChainDir: () => '', setChainOffer: vi.fn(() => true) },
    defaultAccountNetwork: 'mainnet',
    walletId: 'w1',
    wallet: { label: 'Main' },
    updateConfig: vi.fn((form) => { Object.assign(configService.config, form); return true; }),
    getNodeFallBack: () => SAVED_NODE,
    localNodeUrl: () => 'http://127.0.0.1:3413',
  };
  return configService;
}

function setup({ nodeInternal = false, check = async () => ({ ok: true }) } = {}) {
  const configService = fakeConfig();
  const $nodeService = { checkNodeVersion: vi.fn(check), lastBlockTime: vi.fn(async () => 0) };
  const m = mountView(SettingsNode, {
    store: makeStore({ user: { id: 1, account: 'w1', nodeInternal } }),
    services: {
      configService,
      $nodeService,
      $walletService: { readEpicboxConfig: vi.fn(() => ({})) },
      $userService: { ensureUser: vi.fn(async () => ({ id: 1 })) },
      $importer: { scanChains: vi.fn(async () => []) },
    },
  });
  return { ...m, configService, $nodeService };
}

const input = (w) => w.find('input[data-test=node-combo]');
const typeAndEnter = async (w, text) => {
  await input(w).setValue(text);
  await pressEnter(input(w));
  await flushPromises();
};

describe('Settings › Node address', () => {
  test('shows the saved external node, no Save bar', async () => {
    const { wrapper } = setup();
    await flushPromises();
    expect(input(wrapper).element.value).toBe('node.epiccash.com:3413');
    expect(() => button(wrapper, t('msg.save'))).toThrow();
    expect(wrapper.text()).not.toContain(t('msg.modern.settings.unsaved'));
  });

  test('typing "http://" key by key keeps both slashes, and the rest of the address as typed', async () => {
    const { wrapper } = setup();
    await flushPromises();
    await input(wrapper).setValue('');
    const typed = 'http://192.168.1.5:3413/';
    let value = '';
    for (const ch of typed) {
      value += ch;
      await input(wrapper).setValue(value);
      await flushPromises();
      expect(input(wrapper).element.value).toBe(value);
    }
  });

  test.each([
    ['192.168.1.5:3413/', 'http://192.168.1.5:3413'],
    ['node.example.com', 'https://node.example.com'],
    ['  http://node.example.com:3413// ', 'http://node.example.com:3413'],
    ['https://node.example.com:3413', 'https://node.example.com:3413'],
  ])('Enter on the typed %j checks and saves %j at once', async (typed, saved) => {
    const { wrapper, configService, $nodeService } = setup();
    await flushPromises();
    await typeAndEnter(wrapper, typed);
    expect($nodeService.checkNodeVersion).toHaveBeenCalledWith(saved);
    expect(configService.updateConfig).toHaveBeenCalledTimes(1);
    expect(configService.updateConfig.mock.calls[0][0]).toMatchObject({ check_node_api_http_addr: saved, nodeInternal: false });
  });

  test('an invalid address says so and saves nothing', async () => {
    const { wrapper, configService, $nodeService } = setup();
    await flushPromises();
    await typeAndEnter(wrapper, 'http://');
    expect(wrapper.text()).toContain(t('msg.validators.http_address'));
    expect($nodeService.checkNodeVersion).not.toHaveBeenCalled();
    expect(configService.updateConfig).not.toHaveBeenCalled();
  });

  test('something that is no address (spaces) is not offered and Enter saves nothing', async () => {
    const { wrapper, configService } = setup();
    await flushPromises();
    await typeAndEnter(wrapper, 'not a node');
    expect(configService.updateConfig).not.toHaveBeenCalled();
  });

  test('an address that is not an Epic node is named in the error, stays in the field and is not saved', async () => {
    const { wrapper, configService } = setup({ check: async () => ({ ok: false, reason: 'no answer' }) });
    await flushPromises();
    await typeAndEnter(wrapper, 'https://example.org');
    expect(wrapper.text()).toContain(t('msg.validators.not_epic_node', ['https://example.org (no answer)']));
    expect(configService.updateConfig).not.toHaveBeenCalled();
    expect(input(wrapper).element.value).toBe('example.org');
  });

  /* final 6.1.6 QA bug 2: a node that was slow once got "Not an Epic node … (no reply within 5 s)" */
  test('no reply in time: asked once more, then "didn\'t answer in time", never "not an Epic node"', async () => {
    const slow = { ok: false, reason: 'no reply within 5 s', timeout: true };
    const { wrapper, configService, $nodeService } = setup({ check: async () => slow });
    await flushPromises();
    await typeAndEnter(wrapper, 'https://example.org');
    expect($nodeService.checkNodeVersion).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain(t('msg.modern.settings.node_check_timeout'));
    expect(wrapper.text()).not.toContain(t('msg.validators.not_epic_node', ['https://example.org (no reply within 5 s)']));
    expect(configService.updateConfig).not.toHaveBeenCalled();

    //slow once, then an answer: saved
    const answers = [slow, { ok: true, version: '4.1.0' }];
    const second = setup({ check: async () => answers.shift() });
    await flushPromises();
    await typeAndEnter(second.wrapper, 'https://example.org');
    expect(second.$nodeService.checkNodeVersion).toHaveBeenCalledTimes(2);
    expect(second.configService.updateConfig).toHaveBeenCalled();
  });

  test('the built-in node row saves the local node, without asking any external node', async () => {
    const { wrapper, configService, $nodeService, $toast } = setup();
    await flushPromises();
    await input(wrapper).trigger('focus');
    await wrapper.find('[data-test=node-use-builtin]').trigger('click');
    await flushPromises();
    expect($nodeService.checkNodeVersion).not.toHaveBeenCalled();
    expect(configService.updateConfig.mock.calls[0][0]).toMatchObject({ check_node_api_http_addr: 'http://127.0.0.1:3413', nodeInternal: true });
    expect($toast.success).toHaveBeenCalledWith(t('msg.settings.settings_saved'));
  });

  /* rig 6.1.6: Lock while a picked node was still being checked; the check answered after Settings
     was gone and the save went on ("Cannot read properties of null (reading 'select')") */
  test.each([
    ['answers', { ok: true, version: '4.1.0' }],
    ['does not answer in time', { ok: false, reason: 'no reply within 5 s', timeout: true }],
    ['is not an Epic node', { ok: false, reason: 'HTTP 404' }],
  ])('a check that %s after Settings was left saves nothing and throws nothing', async (_, answer) => {
    const pending = [];
    const { wrapper, configService, emitter } = setup({ check: () => new Promise((resolve) => pending.push(resolve)) });
    const s = { userService: wrapper.vm.$userService };
    await flushPromises();
    const errors = [];
    const onError = (e) => errors.push(e);
    process.on('unhandledRejection', onError);
    const warn = vi.spyOn(console, 'warn');
    try {
      await typeAndEnter(wrapper, 'https://node.example.com');
      expect(pending).toHaveLength(1);
      wrapper.unmount();
      //the timeout asks once more: that one is answered too
      while (pending.length) { pending.shift()(answer); await flushPromises(); }
      await new Promise((r) => setTimeout(r, 0));
      expect(errors).toEqual([]);
      expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => /Unhandled error/.test(m))).toEqual([]);
      expect(configService.updateConfig).not.toHaveBeenCalled();
      expect(s.userService.ensureUser).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalledWith('app.nodeStart');
      expect(configService.config.check_node_api_http_addr).toBe(SAVED_NODE);
    } finally {
      process.off('unhandledRejection', onError);
    }
  });

  test('"Sync in background" only for the built-in node, and it saves at once', async () => {
    const remote = setup();
    await flushPromises();
    expect(remote.wrapper.text()).not.toContain(t('msg.modern.settings.node_bg_label'));
    remote.wrapper.unmount();
    const { wrapper, configService } = setup({ nodeInternal: true });
    await flushPromises();
    expect(input(wrapper).element.value).toBe(t('msg.modern.settings.node_builtin'));
    expect(wrapper.text()).toContain(t('msg.modern.settings.node_bg_label'));
    await wrapper.find('.e-switch input').setValue(true);
    expect(configService.updateConfig).toHaveBeenCalledWith({ node_background: true });
  });
});
