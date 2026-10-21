/*
 * The node combobox (modern/form/NodeCombo.vue) on its own: a typed address shows the live-check row,
 * Enter on it asks the page to apply it, a public node row applies that endpoint at once, Esc brings
 * the saved address back. The page (SettingsNode.vue) does the saving; this field only emits "apply".
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import NodeCombo from '@/components/modern/form/NodeCombo.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { pressEnter } from './support/dom.js';

const SAVED = 'https://node.example.org:3413';
const PUBLIC = { endpoint: 'https://pub.example.net:3413', host: 'pub.example.net:3413', operator: 'Pub Ops', state: 'healthy', height: 3100000, tipLag: 0, latencyMs: 60, uptime30d: 0.99, awaitingPeers: false };

async function setup({ savedInternal = false, directory = { nodes: [PUBLIC] } } = {}) {
  window.api.nodeDirectory = vi.fn(async () => directory);
  const probeNode = vi.fn(async (address) => ({ address, state: 'online', tone: 'ok', version: '4.1.0', versionOld: false, height: 3100000, behind: 0, peers: 8, ms: 80, problem: '', hint: '' }));
  const m = mountView(NodeCombo, {
    store: makeStore(),
    props: { inputId: 'n', savedAddress: SAVED, savedInternal },
    services: {
      configService: { config: {}, settings: {}, defaultAccountNetwork: 'mainnet', getNodeFallBack: () => SAVED },
      $nodeService: { probeNode },
    },
  });
  //Settings.vue fills the field with the saved node before the page shows it
  m.wrapper.vm.select = savedInternal ? 'internal' : 'external';
  m.wrapper.vm.input = savedInternal ? '' : SAVED;
  await flushPromises();
  const input = m.wrapper.find('input[data-test=node-combo]');
  return { ...m, input, probeNode };
}

describe('NodeCombo', () => {
  test('shows the saved node as its host, the list closed until the field is used', async () => {
    const { input, wrapper } = await setup();
    expect(input.element.value).toBe('node.example.org:3413');
    expect(input.attributes('aria-expanded')).toBe('false');
    await input.trigger('focus');
    expect(input.attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('[data-test=node-list]').text()).toContain('pub.example.net:3413');
  });

  test('typing an address shows the live-check row first, with its status', async () => {
    const { input, wrapper } = await setup();
    await input.setValue('192.168.1.5:3413');
    const row = wrapper.find('[data-test=node-list] .e-opt');
    expect(row.text()).toContain(t('msg.mynodes.checking'));
    await new Promise(r => setTimeout(r, 750));
    await flushPromises();
    expect(wrapper.find('[data-test=node-list] .e-opt').text()).toContain(t('msg.mynodes.state_online'));
    expect(wrapper.find('[data-test=node-list]').text()).toContain(t('msg.modern.settings.node_typed_note'));
    //the typed text stays exactly as typed
    expect(input.element.value).toBe('192.168.1.5:3413');
    expect(wrapper.emitted('apply')).toBeUndefined();
  });

  test('Enter on the typed address emits apply (the page saves it)', async () => {
    const { input, wrapper } = await setup();
    await input.setValue('192.168.1.5:3413');
    await pressEnter(input);
    expect(wrapper.emitted('apply')).toHaveLength(1);
    expect(wrapper.vm.select).toBe('external');
    expect(wrapper.vm.input).toBe('192.168.1.5:3413');
  });

  test('a public node row applies at once: select external and that endpoint', async () => {
    const { wrapper } = await setup();
    await wrapper.find('input[data-test=node-combo]').trigger('focus');
    const pick = wrapper.findAll('[data-test=node-list] button.e-opt-pick').find(b => b.attributes('aria-label').includes('pub.example.net:3413'));
    expect(pick.attributes('aria-label')).toContain(t('msg.modern.settings.node_use', { node: 'pub.example.net:3413' }));
    await pick.trigger('click');
    expect(wrapper.emitted('apply')).toHaveLength(1);
    expect(wrapper.vm.select).toBe('external');
    expect(wrapper.vm.input).toBe(PUBLIC.endpoint);
  });

  test.fails('BUG: after a pick from a focused row the list stays closed', async () => {
    const { wrapper, input } = await setup();
    input.element.focus();
    await input.trigger('keydown.down');
    await flushPromises();
    const row = wrapper.find('[data-test=node-list] button.e-opt-pick');
    expect(document.activeElement).toBe(row.element);
    await row.trigger('click');
    await flushPromises();
    expect(input.attributes('aria-expanded')).toBe('false');
  });

  test('the row of the node already in use applies nothing', async () => {
    const { wrapper, input } = await setup({ directory: { nodes: [{ ...PUBLIC, endpoint: SAVED, host: 'node.example.org:3413' }] } });
    await input.trigger('focus');
    const pick = wrapper.findAll('[data-test=node-list] button.e-opt-pick').find(b => b.attributes('aria-current') === 'true');
    await pick.trigger('click');
    expect(wrapper.emitted('apply')).toBeUndefined();
  });

  test('the built-in node row emits apply with select internal', async () => {
    const { wrapper, input } = await setup();
    await input.trigger('focus');
    await wrapper.find('[data-test=node-use-builtin]').trigger('click');
    expect(wrapper.emitted('apply')).toHaveLength(1);
    expect(wrapper.vm.select).toBe('internal');
  });

  test('Esc restores the saved address and closes the list', async () => {
    const { input, wrapper } = await setup();
    input.element.focus();
    await input.setValue('192.168.1.5:3413');
    expect(input.attributes('aria-expanded')).toBe('true');
    await input.trigger('keydown.esc');
    await flushPromises();
    expect(input.element.value).toBe('node.example.org:3413');
    expect(input.attributes('aria-expanded')).toBe('false');
    expect(wrapper.vm.input).toBe(SAVED);
    expect(wrapper.emitted('apply')).toBeUndefined();
  });

  /* SUSPECTED BUG (src, not fixed here): collapse() closes the list and then escape()/pick() call
     field.focus(), whose @focus handler (openList) opens it again when focus was on a row */
  test.fails('BUG: Esc from a list row (reached with the arrow key) closes the list and focus goes back to the field', async () => {
    const { input, wrapper } = await setup();
    input.element.focus();
    await input.trigger('keydown.down');
    await flushPromises();
    const row = wrapper.find('[data-test=node-list] button.e-opt-pick');
    expect(document.activeElement).toBe(row.element);
    await row.trigger('keydown.esc');
    await flushPromises();
    expect(document.activeElement).toBe(input.element);
    expect(input.attributes('aria-expanded')).toBe('false');
  });

  test('with the built-in node saved the field says so', async () => {
    const { input } = await setup({ savedInternal: true });
    expect(input.element.value).toBe(t('msg.modern.settings.node_builtin'));
  });
});
