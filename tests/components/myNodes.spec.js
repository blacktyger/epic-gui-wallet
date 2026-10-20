/*
 * The node address field's live check and My nodes in Modern SettingsGeneral.vue
 * (modern/form/NodeserverField.vue; the logic is the Classic base's, form/nodeserverField.vue). Logic:
 * form/myNodesField.js, shared/nodeCheck.js, shared/myNodes.js. The checks go to
 * $nodeService.probeNode (faked here); the list lives in configService.settings (faked in memory with
 * the real list functions).
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import SettingsGeneral from '@/components/modern/views/settings/SettingsGeneral.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { button } from './support/dom.js';
import { addMyNode, updateMyNode, removeMyNode } from '@/shared/myNodes';
import { createCheckCache } from '@/shared/nodeCheck';

const SAVED_NODE = 'https://node.epiccash.com:3413';
const ONLINE = (address) => ({ address, state: 'online', tone: 'ok', version: '4.1.0', versionOld: false, height: 2500000, behind: 0, peers: 8, ms: 85, problem: '', hint: '' });
const NOT_EPIC = (address) => ({ address, state: 'not_epic', tone: 'risk', version: null, height: null, behind: null, peers: null, ms: 40, problem: 'not_epic', hint: 'port' });

/* settings.json's My nodes, in memory */
function fakeSettings(initial = []) {
  const lists = { mainnet: initial };
  const apply = (net, res) => { if (res.ok) lists[net] = res.list; return res; };
  return {
    nodeChainDir: () => '',
    setChainOffer: vi.fn(() => true),
    myNodes: (net) => (lists[net] || []).map(e => ({ ...e })),
    addMyNode: vi.fn((net, e) => apply(net, addMyNode(lists[net] || [], e))),
    updateMyNode: vi.fn((net, was, e) => apply(net, updateMyNode(lists[net] || [], was, e))),
    removeMyNode: vi.fn((net, a) => apply(net, removeMyNode(lists[net] || [], a))),
    lists,
  };
}

function setup(Component, { probe = async (a) => ONLINE(a), nodes = [] } = {}) {
  const settings = fakeSettings(nodes);
  const configService = {
    langs: { en: 'English' },
    config: { locale: 'en', epicbox_domain: 'epicbox.epiccash.com', walletlisten_on_startup: false, node_background: false, check_node_api_http_addr: SAVED_NODE },
    settings,
    defaultAccountNetwork: 'mainnet',
    walletId: 'w1',
    wallet: { label: 'Main' },
    updateConfig: vi.fn(() => true),
    getNodeFallBack: () => SAVED_NODE,
    localNodeUrl: () => 'http://127.0.0.1:3413',
  };
  const $nodeService = {
    checkNodeVersion: vi.fn(async () => ({ ok: true })),
    probeNode: vi.fn(probe),
    checkCache: createCheckCache(),
  };
  const m = mountView(Component, {
    store: makeStore({ user: { id: 1, account: 'w1', nodeInternal: false } }),
    services: {
      configService,
      $nodeService,
      $walletService: { readEpicboxConfig: vi.fn(() => ({})) },
      $userService: { ensureUser: vi.fn(async () => ({ id: 1 })) },
      $importer: { scanChains: vi.fn(async () => []) },
    },
    stubs: { NodeDirectory: true, EpicboxServers: true },
  });
  return { ...m, configService, settings, $nodeService };
}

/* the public node list has answered (the stub stands in for it) */
async function listLoaded(wrapper, dir = null) {
  const stub = wrapper.findAllComponents({ name: 'NodeDirectory' })[0] || wrapper.findAllComponents({ name: 'ModernNodeDirectory' })[0];
  stub.vm.$emit('loaded', dir);
  await flushPromises();
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const dialog = () => document.querySelector('dialog[open]');

//Modern only: Classic is no longer tested (the user's call, 2026-10-20); it shares this logic
const INTERFACES = [
  { name: 'Modern', Component: SettingsGeneral, addressInput: (w) => w.find('input[id^="e-nodeserverField-"]') },
];

describe.each(INTERFACES)('Node address live check ($name)', (ui) => {
  test('the saved address is checked once the public list says it is not one of its nodes', async () => {
    const { wrapper, $nodeService } = setup(ui.Component);
    await flushPromises();
    expect($nodeService.probeNode).not.toHaveBeenCalled();
    await listLoaded(wrapper);
    await wait(700);
    await flushPromises();
    expect($nodeService.probeNode).toHaveBeenCalledTimes(1);
    expect($nodeService.probeNode.mock.calls[0][0]).toBe(SAVED_NODE);
    wrapper.unmount();
  });

  test('a node of the public list is not checked again: the list shows its status', async () => {
    const { wrapper, $nodeService } = setup(ui.Component);
    await flushPromises();
    await listLoaded(wrapper, { nodes: [{ endpoint: SAVED_NODE, host: 'node.epiccash.com:3413' }] });
    await wait(700);
    expect($nodeService.probeNode).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  test('typing: one check ~600 ms after the last key, then a compact status under the field', async () => {
    const { wrapper, $nodeService } = setup(ui.Component);
    await flushPromises();
    await listLoaded(wrapper);
    const input = ui.addressInput(wrapper);
    for (const s of ['m', 'my', 'my.node.example.co', 'my.node.example.com']) {
      await input.setValue(s);
      await wait(100);
    }
    expect($nodeService.probeNode).not.toHaveBeenCalled();
    await wait(650);
    await flushPromises();
    expect($nodeService.probeNode.mock.calls.map(c => c[0])).toEqual(['https://my.node.example.com']);
    const text = wrapper.text();
    expect(text).toContain(t('msg.mynodes.state_online'));
    //the height with its meter (level: the gap only in the tooltip); no "at tip", no ms, no version when it is fine
    expect(text).toContain('2,500,000');
    expect(wrapper.find('.e-nodecheck .e-hmeter').attributes('aria-label')).toBe(t('msg.mynodes.height_level'));
    expect(wrapper.find('.e-nodecheck .e-hmeter').attributes('role')).toBe('img');
    expect(wrapper.find('.e-nodecheck').text()).not.toMatch(/ms|at tip|replied|4\.1\.0/);
    wrapper.unmount();
  });

  test('a paste is checked at once; a failure explains itself and never blocks Save', async () => {
    const { wrapper, $nodeService, configService } = setup(ui.Component, { probe: async (a) => NOT_EPIC(a) });
    await flushPromises();
    await listLoaded(wrapper);
    const input = ui.addressInput(wrapper);
    await input.trigger('paste');
    await input.setValue('https://example.org:8080');
    await flushPromises();
    expect($nodeService.probeNode).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain(t('msg.mynodes.state_not_epic'));
    expect(wrapper.text()).toContain(t('msg.mynodes.problem_not_epic'));
    expect(wrapper.text()).toContain(t('msg.mynodes.hint_port'));
    expect(input.element.disabled).toBe(false);
    await button(wrapper, t('msg.save')).trigger('click');
    await flushPromises();
    //Save keeps its own check (checkNodeVersion), as before
    expect($nodeService.checkNodeVersion).toHaveBeenCalledWith('https://example.org:8080');
    expect(configService.updateConfig).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  test('no list until a node is saved; Add opens the dialog with the address, Save adds it with its label', async () => {
    const { wrapper, settings } = setup(ui.Component);
    await flushPromises();
    await listLoaded(wrapper);
    expect(wrapper.text()).not.toContain(t('msg.mynodes.title'));
    const input = ui.addressInput(wrapper);
    await input.trigger('paste');
    await input.setValue('192.168.1.5:3413/');
    await button(wrapper, t('msg.mynodes.add')).trigger('click');
    await flushPromises();
    const d = dialog();
    expect(d).not.toBeNull();
    expect(d.textContent).toContain(t('msg.mynodes.add_title'));
    const [addr, label] = d.querySelectorAll('input');
    expect(addr.value).toBe('192.168.1.5:3413/');
    label.value = 'Home node';
    label.dispatchEvent(new Event('input'));
    await flushPromises();
    //the dialog's own live check (short): online
    expect(d.textContent).toContain(t('msg.mynodes.state_online'));
    d.querySelector('button[type=submit]').click();
    await flushPromises();
    expect(settings.addMyNode).toHaveBeenCalledWith('mainnet', { address: 'http://192.168.1.5:3413', label: 'Home node' });
    expect(dialog()).toBeNull();
    expect(wrapper.text()).toContain(t('msg.mynodes.title'));
    expect(wrapper.text()).toContain('Home node');
    //the field's address is in the list now: the button says so
    const inList = button(wrapper, t('msg.mynodes.in_list'), { partial: true });
    expect(inList.attributes('aria-disabled')).toBe('true');
    await inList.trigger('click');
    expect(dialog()).toBeNull();
    wrapper.unmount();
  });

  test('an offline address can still be added', async () => {
    const { wrapper, settings } = setup(ui.Component, { probe: async (a) => ({ ...NOT_EPIC(a), state: 'offline', problem: 'unreachable' }) });
    await flushPromises();
    await listLoaded(wrapper);
    await ui.addressInput(wrapper).setValue('https://down.example.com');
    await button(wrapper, t('msg.mynodes.add')).trigger('click');
    await flushPromises();
    expect(dialog().textContent).toContain(t('msg.mynodes.state_offline'));
    dialog().querySelector('button[type=submit]').click();
    await flushPromises();
    expect(settings.lists.mainnet.map(e => e.address)).toEqual(['https://down.example.com']);
    wrapper.unmount();
  });

  test('the list: entries checked lightly, Use fills the field, Edit refuses a duplicate, Remove asks quietly', async () => {
    const nodes = [
      { address: 'https://a.example.com:3413', label: 'Alpha', addedAt: '' },
      { address: 'http://10.0.0.2:3413', label: '', addedAt: '' },
    ];
    const { wrapper, settings, $nodeService } = setup(ui.Component, { nodes });
    await flushPromises();
    await wait(50);
    await flushPromises();
    //both entries checked when the field opens, from then on from the cache
    const asked = $nodeService.probeNode.mock.calls.map(c => c[0]);
    expect(asked).toEqual(expect.arrayContaining(['https://a.example.com:3413', 'http://10.0.0.2:3413']));
    expect(wrapper.text()).toContain('Alpha');
    expect(wrapper.find('.e-mynodes').text()).not.toMatch(/\d+ ms|Online/);
    const dots = wrapper.findAll('.e-mynodes .e-nodedir-dot');
    expect(dots[0].attributes('aria-label')).toBe(t('msg.mynodes.state_online') + ', ' + t('msg.mynodes.height_level'));
    expect(dots[0].attributes('title')).toBe(dots[0].attributes('aria-label'));

    await button(wrapper, t('msg.mynodes.use'), { partial: false }).trigger('click');
    expect(ui.addressInput(wrapper).element.value).toBe('https://a.example.com:3413');
    expect(wrapper.text()).toContain(t('msg.mynodes.selected'));

    //Edit the second entry to the first one's address: refused with a short note
    const edits = wrapper.findAll('button').filter(b => b.attributes('aria-label') === t('msg.mynodes.edit_named', { name: '10.0.0.2:3413' }));
    await edits[0].trigger('click');
    await flushPromises();
    const [addr] = dialog().querySelectorAll('input');
    expect(addr.value).toBe('http://10.0.0.2:3413');
    addr.value = 'A.EXAMPLE.COM:3413/';
    addr.dispatchEvent(new Event('input'));
    await flushPromises();
    expect(dialog().textContent).toContain(t('msg.mynodes.duplicate_named', { name: 'Alpha' }));
    expect(dialog().querySelector('button[type=submit]').disabled).toBe(true);
    [...dialog().querySelectorAll('button')].find(b => b.textContent.trim() === t('msg.cancel')).click();
    await flushPromises();
    expect(dialog()).toBeNull();
    expect(settings.updateMyNode).not.toHaveBeenCalled();

    //Remove: Keep first, then Remove
    const removeBtn = () => wrapper.findAll('button').find(b => b.attributes('aria-label') === t('msg.mynodes.remove_named', { name: 'Alpha' }));
    await removeBtn().trigger('click');
    expect(wrapper.text()).toContain(t('msg.mynodes.remove_ask', { name: 'Alpha' }));
    await button(wrapper, t('msg.mynodes.remove_keep')).trigger('click');
    expect(settings.removeMyNode).not.toHaveBeenCalled();
    await removeBtn().trigger('click');
    await button(wrapper, t('msg.mynodes.remove_yes')).trigger('click');
    expect(settings.removeMyNode).toHaveBeenCalledWith('mainnet', 'https://a.example.com:3413');
    expect(wrapper.text()).not.toContain('Alpha');
    wrapper.unmount();
  });

  test('a text selection dragged out of the dialog does not close it; a real backdrop click does; Keep gives focus back', async () => {
    const nodes = [{ address: 'https://a.example.com:3413', label: 'Alpha', addedAt: '' }];
    const { wrapper } = setup(ui.Component, { nodes });
    await flushPromises();
    await listLoaded(wrapper);
    await ui.addressInput(wrapper).setValue('https://b.example.com');
    await button(wrapper, t('msg.mynodes.add')).trigger('click');
    await flushPromises();
    const d = dialog();
    d.querySelector('input').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    d.dispatchEvent(new Event('click', { bubbles: true }));
    await flushPromises();
    expect(dialog()).not.toBeNull();
    d.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    d.dispatchEvent(new Event('click', { bubbles: true }));
    await flushPromises();
    expect(dialog()).toBeNull();

    const removeBtn = wrapper.findAll('button').find(b => b.attributes('aria-label') === t('msg.mynodes.remove_named', { name: 'Alpha' }));
    await removeBtn.trigger('click');
    await button(wrapper, t('msg.mynodes.remove_keep')).trigger('click');
    await flushPromises();
    expect(document.activeElement && document.activeElement.getAttribute('aria-label')).toBe(t('msg.mynodes.remove_named', { name: 'Alpha' }));
    wrapper.unmount();
  });

  test('without the list in the settings service (an older one), the field works as before', async () => {
    const { wrapper } = setup(ui.Component);
    delete wrapper.vm.configService.settings.myNodes;
    await flushPromises();
    expect(ui.addressInput(wrapper).exists()).toBe(true);
    wrapper.unmount();
  });
});
