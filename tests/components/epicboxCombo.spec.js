/*
 * The Epicbox server combobox (modern/form/EpicboxCombo.vue) and the not-responding notice
 * (modern/form/EpicboxDownNotice.vue) in Settings › Receiving: a listed server is picked with one
 * click and emitted; a typed unlisted domain is offered; the notice offers the healthiest other
 * server and switches only on its button.
 */
import { describe, test, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import EpicboxCombo from '@/components/modern/form/EpicboxCombo.vue';
import EpicboxDownNotice from '@/components/modern/form/EpicboxDownNotice.vue';
import { mountView, t } from './support/mountView.js';
import { pressEnter } from './support/dom.js';

const S = (domain, state, latencyMs = 50) => ({ domain, state, latencyMs, uptime24h: 0.99, operator: '', label: '', isDefault: false });
const SERVERS = [S('epicbox.epiccash.com', 'healthy'), S('epicbox.alt.example', 'healthy', 30), S('old.example', 'down', null)];

function combo(props = {}) {
  return mountView(EpicboxCombo, { props: { inputId: 'eb', servers: SERVERS, live: true, current: 'epicbox.epiccash.com', ...props } });
}
const picks = (w) => w.findAll('[data-test=epicbox-list] button.e-opt-pick');

describe('EpicboxCombo', () => {
  test('shows the saved server; a listed server is picked with one click and emitted', async () => {
    const { wrapper } = combo();
    const input = wrapper.find('input');
    expect(input.element.value).toBe('epicbox.epiccash.com');
    await input.trigger('focus');
    const alt = picks(wrapper).find(b => b.attributes('aria-label').includes('epicbox.alt.example'));
    await alt.trigger('click');
    expect(wrapper.emitted('pick')).toEqual([['epicbox.alt.example']]);
  });

  test('the server in use is marked and picking it emits nothing; a down server says so', async () => {
    const { wrapper } = combo();
    await wrapper.find('input').trigger('focus');
    const cur = picks(wrapper).find(b => b.attributes('aria-current') === 'true');
    expect(cur.attributes('aria-label')).toContain('epicbox.epiccash.com');
    await cur.trigger('click');
    expect(wrapper.emitted('pick')).toBeUndefined();
    expect(wrapper.find('[data-test=epicbox-list]').text()).toContain(t('msg.epicboxdir.down'));
  });

  test('a typed domain that is not listed is offered and Enter picks it', async () => {
    const { wrapper } = combo();
    const input = wrapper.find('input');
    await input.setValue('my.box.example');
    expect(wrapper.find('[data-test=epicbox-list]').text()).toContain(t('msg.modern.settings.eb_unlisted'));
    await pressEnter(input);
    expect(wrapper.emitted('pick')).toEqual([['my.box.example']]);
  });

  test('nothing is picked while a switch is running', async () => {
    const { wrapper } = combo({ busy: true });
    await wrapper.find('input').trigger('focus');
    await picks(wrapper)[1].trigger('click');
    expect(wrapper.emitted('pick')).toBeUndefined();
  });

  /* pick() collapses and focuses the field again; its @focus must not reopen the list */
  test('after a pick from a focused row the list stays closed', async () => {
    const { wrapper } = combo();
    const input = wrapper.find('input');
    input.element.focus();
    await input.trigger('keydown.down');
    await flushPromises();
    const row = picks(wrapper)[0];
    expect(document.activeElement).toBe(row.element);
    await row.trigger('click');
    await flushPromises();
    expect(input.attributes('aria-expanded')).toBe('false');
  });
});

describe('EpicboxDownNotice', () => {
  const mount = (props) => mountView(EpicboxDownNotice, { props });

  test('nothing while Epicbox is fine', () => {
    for (const state of ['listening', 'connecting', 'off']) {
      expect(mount({ health: { state, server: 'x', why: '' } }).wrapper.find('[data-test=epicbox-down-notice]').exists()).toBe(false);
    }
  });

  test('down with a better server: asks, and switches only on the button', async () => {
    const { wrapper } = mount({ health: { state: 'down', server: 'epicbox.epiccash.com', why: 'no_answer' }, suggest: SERVERS[1] });
    expect(wrapper.text()).toContain(t('msg.modern.eb_down_title'));
    expect(wrapper.text()).toContain(t('msg.modern.eb_switch_q', { server: 'epicbox.alt.example' }));
    expect(wrapper.emitted('switch')).toBeUndefined();
    await wrapper.find('[data-test=epicbox-switch]').trigger('click');
    expect(wrapper.emitted('switch')).toEqual([['epicbox.alt.example']]);
  });

  test('down with no other server: says payments wait, no button; busy disables the button', async () => {
    const none = mount({ health: { state: 'down', server: 'a', why: 'stopped' } });
    expect(none.wrapper.text()).toContain(t('msg.modern.eb_down_wait'));
    expect(none.wrapper.find('[data-test=epicbox-switch]').exists()).toBe(false);
    const busy = mount({ health: { state: 'down', server: 'a', why: 'stopped' }, suggest: SERVERS[1], busy: true });
    expect(busy.wrapper.find('[data-test=epicbox-switch]').element.disabled).toBe(true);
  });
});
