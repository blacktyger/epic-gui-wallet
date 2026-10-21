/*
 * The node field's live check and My nodes in Modern Settings › Node (SettingsNode.vue, the combobox
 * modern/form/NodeCombo.vue; the logic is the Classic base's, form/nodeserverField.vue). Logic:
 * form/myNodesField.js, shared/nodeCheck.js, shared/myNodes.js. A typed address is a row at the top
 * of the list with its live status; the star keeps it in My nodes. The checks go to
 * $nodeService.probeNode (faked here); the list lives in configService.settings (faked in memory with
 * the real list functions).
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import SettingsNode from '@/components/modern/views/settings/SettingsNode.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { button, pressEnter } from './support/dom.js';
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

function setup(Component, { probe = async (a) => ONLINE(a), nodes = [], directory = null } = {}) {
  window.api.nodeDirectory = vi.fn(async () => directory);
  const settings = fakeSettings(nodes);
  const configService = {
    langs: { en: 'English' },
    config: { locale: 'en', epicbox_domain: 'epicbox.epiccash.com', walletlisten_on_startup: false, node_background: false, check_node_api_http_addr: SAVED_NODE },
    settings,
    defaultAccountNetwork: 'mainnet',
    walletId: 'w1',
    wallet: { label: 'Main' },
    updateConfig: vi.fn((form) => { Object.assign(configService.config, form); return true; }),
    getNodeFallBack: () => SAVED_NODE,
    localNodeUrl: () => 'http://127.0.0.1:3413',
  };
  const $nodeService = {
    checkNodeVersion: vi.fn(async () => ({ ok: true })),
    lastBlockTime: vi.fn(async () => 0),
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
  });
  return { ...m, configService, settings, $nodeService };
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const dialog = () => document.querySelector('dialog[open]');
const input = (w) => w.find('input[data-test=node-combo]');
//the list under the field, opened as a click into the field does
const open = async (w) => { await input(w).trigger('focus'); await flushPromises(); };
const typedRow = (w) => w.find('[data-test=node-list] .e-opt');
const rowButton = (w, label) => w.findAll('[data-test=node-list] button').find(b => b.attributes('aria-label') === label);

describe('Node address live check', () => {
  test('the saved address is checked once the public list says it is not one of its nodes', async () => {
    const { wrapper, $nodeService } = setup(SettingsNode);
    await flushPromises();
    await wait(700);
    await flushPromises();
    expect($nodeService.probeNode).toHaveBeenCalledTimes(1);
    expect($nodeService.probeNode.mock.calls[0][0]).toBe(SAVED_NODE);
    wrapper.unmount();
  });

  test('a node of the public list is not checked again: the list shows its status', async () => {
    const { wrapper, $nodeService } = setup(SettingsNode, { directory: { nodes: [{ endpoint: SAVED_NODE, host: 'node.epiccash.com:3413', operator: 'Epic Cash', state: 'healthy', height: 2500000, tipLag: 0, latencyMs: 80, uptime30d: 0.99, awaitingPeers: false }] } });
    await flushPromises();
    await wait(700);
    expect($nodeService.probeNode).not.toHaveBeenCalled();
    await open(wrapper);
    expect(wrapper.find('[data-test=node-list]').text()).toContain('node.epiccash.com:3413');
    wrapper.unmount();
  });

  test('typing: one check ~600 ms after the last key, then a status row at the top of the list', async () => {
    const { wrapper, $nodeService } = setup(SettingsNode);
    await flushPromises();
    await wait(700);
    $nodeService.probeNode.mockClear();
    for (const s of ['m', 'my', 'my.node.example.co', 'my.node.example.com']) {
      await input(wrapper).setValue(s);
      await wait(100);
    }
    expect($nodeService.probeNode).not.toHaveBeenCalled();
    await wait(650);
    await flushPromises();
    expect($nodeService.probeNode.mock.calls.map(c => c[0])).toEqual(['https://my.node.example.com']);
    const row = typedRow(wrapper).text();
    expect(row).toContain(t('msg.mynodes.state_online'));
    //the height with its meter and the version; no "at tip", no ms
    expect(row).toContain('2,500,000');
    expect(row).toContain('4.1.0');
    expect(typedRow(wrapper).find('.e-hmeter').exists()).toBe(true);
    expect(row).not.toMatch(/ms|at tip|replied/);
    wrapper.unmount();
  });

  test('a paste is checked at once; a failure explains itself and does not stop the pick', async () => {
    const { wrapper, $nodeService, configService } = setup(SettingsNode, { probe: async (a) => NOT_EPIC(a) });
    await flushPromises();
    $nodeService.probeNode.mockClear();
    await input(wrapper).trigger('paste');
    await input(wrapper).setValue('https://example.org:8080');
    await flushPromises();
    expect($nodeService.probeNode).toHaveBeenCalledTimes(1);
    expect(typedRow(wrapper).text()).toContain(t('msg.mynodes.state_not_epic'));
    expect(wrapper.text()).toContain(t('msg.modern.settings.node_check_port'));
    expect(input(wrapper).element.disabled).toBe(false);
    await pressEnter(input(wrapper));
    await flushPromises();
    //the page's save keeps its own check (checkNodeVersion)
    expect($nodeService.checkNodeVersion).toHaveBeenCalledWith('https://example.org:8080');
    expect(configService.updateConfig).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  test('no My nodes group until a node is kept; the star opens the dialog with the address, Save adds it with its label', async () => {
    const { wrapper, settings } = setup(SettingsNode);
    await flushPromises();
    expect(wrapper.text()).not.toContain(t('msg.mynodes.title'));
    await input(wrapper).trigger('paste');
    await input(wrapper).setValue('192.168.1.5:3413');
    await flushPromises();
    await rowButton(wrapper, t('msg.mynodes.add')).trigger('click');
    await flushPromises();
    const d = dialog();
    expect(d).not.toBeNull();
    expect(d.textContent).toContain(t('msg.mynodes.add_title'));
    const [addr, label] = d.querySelectorAll('input');
    expect(addr.value).toBe('192.168.1.5:3413');
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
    //it is in the list now: no second star for the same address
    expect(rowButton(wrapper, t('msg.mynodes.add'))).toBeUndefined();
    wrapper.unmount();
  });

  test('an offline address can still be added', async () => {
    const { wrapper, settings } = setup(SettingsNode, { probe: async (a) => ({ ...NOT_EPIC(a), state: 'offline', problem: 'unreachable' }) });
    await flushPromises();
    await input(wrapper).setValue('https://down.example.com');
    await flushPromises();
    await rowButton(wrapper, t('msg.mynodes.add')).trigger('click');
    await flushPromises();
    expect(dialog().textContent).toContain(t('msg.mynodes.state_offline'));
    dialog().querySelector('button[type=submit]').click();
    await flushPromises();
    expect(settings.lists.mainnet.map(e => e.address)).toEqual(['https://down.example.com']);
    wrapper.unmount();
  });

  test('the list: entries checked lightly, a row applies at once, Edit refuses a duplicate, the star removes', async () => {
    const nodes = [
      { address: 'https://a.example.com:3413', label: 'Alpha', addedAt: '' },
      { address: 'http://10.0.0.2:3413', label: '', addedAt: '' },
    ];
    const { wrapper, settings, $nodeService, configService } = setup(SettingsNode, { nodes });
    await flushPromises();
    await wait(50);
    await flushPromises();
    //both entries checked when the field opens, from then on from the cache
    const asked = $nodeService.probeNode.mock.calls.map(c => c[0]);
    expect(asked).toEqual(expect.arrayContaining(['https://a.example.com:3413', 'http://10.0.0.2:3413']));
    const list = wrapper.find('[data-test=node-list]');
    expect(list.text()).toContain('Alpha');
    expect(list.text()).not.toMatch(/\d+ ms|Online/);
    expect(list.findAll('.e-st')[0].classes()).toContain('e-ok');

    //Edit the second entry to the first one's address: refused with a short note
    await rowButton(wrapper, t('msg.mynodes.edit_named', { name: '10.0.0.2:3413' }).replace('10.0.0.2:3413', 'http://10.0.0.2:3413')).trigger('click');
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

    //a row applies the node at once
    await rowButton(wrapper, t('msg.modern.settings.node_use', { node: 'Alpha' })).trigger('click');
    await flushPromises();
    expect($nodeService.checkNodeVersion).toHaveBeenCalledWith('https://a.example.com:3413');
    expect(configService.updateConfig.mock.calls[0][0]).toMatchObject({ check_node_api_http_addr: 'https://a.example.com:3413', nodeInternal: false });

    //the star takes an entry out of My nodes
    await rowButton(wrapper, t('msg.modern.settings.node_remove_mine', { node: 'Alpha' })).trigger('click');
    expect(settings.removeMyNode).toHaveBeenCalledWith('mainnet', 'https://a.example.com:3413');
    expect(wrapper.find('[data-test=node-list]').text()).not.toContain('Alpha');
    wrapper.unmount();
  });

  test('a text selection dragged out of the dialog does not close it; a real backdrop click does', async () => {
    const nodes = [{ address: 'https://a.example.com:3413', label: 'Alpha', addedAt: '' }];
    const { wrapper } = setup(SettingsNode, { nodes });
    await flushPromises();
    await input(wrapper).setValue('https://b.example.com');
    await flushPromises();
    await rowButton(wrapper, t('msg.mynodes.add')).trigger('click');
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
    wrapper.unmount();
  });

  test('without the list in the settings service (an older one), the field works as before', async () => {
    const { wrapper } = setup(SettingsNode);
    delete wrapper.vm.configService.settings.myNodes;
    await flushPromises();
    expect(input(wrapper).exists()).toBe(true);
    wrapper.unmount();
  });
});
