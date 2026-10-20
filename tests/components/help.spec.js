/*
 * Settings › Help (Modern SettingsHelp.vue; Classic is frozen and keeps its old Help). Topics in
 * sections; typing filters at once and marks the words; a match in the detail opens it; Esc clears;
 * the search follows the app's language; the handshake diagram steps; Report a problem when the
 * support flow is there.
 */
import { describe, test, expect, afterEach } from 'vitest';
import { h, nextTick } from 'vue';
import SettingsHelp from '@/components/modern/views/settings/SettingsHelp.vue';
import { i18n } from '@/i18n';
import { helpTopics as help, topicsFor } from '@/help/topics';
import { mountView } from './support/mountView.js';

const FrameStub = { name: 'SettingsFrame', setup(_, { slots }) { return () => h('div', slots.default && slots.default()); } };
function setup() {
  return mountView(SettingsHelp, { stubs: { SettingsFrame: FrameStub } });
}
const input = w => w.find('input[type="search"]');
const titles = w => w.findAll('article[id^="help-"] h4').map(e => e.text());

afterEach(() => { i18n.global.locale = 'en'; });

describe('Settings › Help', () => {
    test('every topic is listed, in its section, with its one-line answer and the detail folded', () => {
      const { wrapper } = setup();
      expect(titles(wrapper)).toEqual(topicsFor(help.en).map(t => t.title));
      for (const s of help.en.sections) expect(wrapper.text()).toContain(s.title);
      const first = wrapper.find('article[id^="help-"]');
      expect(first.text()).toContain(topicsFor(help.en)[0].short);
      const more = first.find('button[aria-expanded]');
      expect(more.attributes('aria-expanded')).toBe('false');
      expect(first.find('[id^="help-d-"]').isVisible()).toBe(false);
      wrapper.unmount();
    });

    test('the fold opens and closes by hand', async () => {
      const { wrapper } = setup();
      const more = wrapper.find('article[id^="help-"] button[aria-expanded]');
      await more.trigger('click');
      expect(more.attributes('aria-expanded')).toBe('true');
      expect(wrapper.find('[id^="help-d-"]').isVisible()).toBe(true);
      await more.trigger('click');
      expect(more.attributes('aria-expanded')).toBe('false');
      wrapper.unmount();
    });

    test('typing filters at once, marks the words, says how many match; Esc clears', async () => {
      const { wrapper } = setup();
      await input(wrapper).setValue('confirmations');
      const shown = wrapper.findAll('article[id^="help-"]');
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.length).toBeLessThan(help.en.topics.length);
      expect(shown[0].attributes('id')).toBe('help-confirmations');
      expect(shown[0].find('mark').text().toLowerCase()).toBe('confirmations');
      expect(wrapper.find('[role="status"]').text()).toMatch(String(shown.length));
      await input(wrapper).trigger('keydown', { key: 'Escape' });
      expect(input(wrapper).element.value).toBe('');
      expect(wrapper.findAll('article[id^="help-"]').length).toBe(help.en.topics.length);
      expect(wrapper.find('mark').exists()).toBe(false);
      wrapper.unmount();
    });

    test('a word found only in the detail opens that topic\'s fold', async () => {
      const { wrapper } = setup();
      await input(wrapper).setValue('change output');
      const hit = wrapper.findAll('article[id^="help-"]').find(a => a.find('[id^="help-d-"] mark').exists());
      expect(hit).toBeTruthy();
      expect(hit.find('button[aria-expanded]').attributes('aria-expanded')).toBe('true');
      wrapper.unmount();
    });

    test('nothing found: says so and lists no topics', async () => {
      const { wrapper } = setup();
      await input(wrapper).setValue('qqzzxx');
      expect(wrapper.findAll('article[id^="help-"]').length).toBe(0);
      expect(wrapper.find('[role="status"]').text()).toContain('qqzzxx');
      wrapper.unmount();
    });

    test('the help and its search follow the app language (Polish)', async () => {
      const { wrapper } = setup();
      i18n.global.locale = 'pl';
      await nextTick();
      expect(wrapper.text()).toContain(topicsFor(help.pl)[0].short);
      await input(wrapper).setValue('fraza');
      const shown = wrapper.findAll('article[id^="help-"]');
      expect(shown.length).toBeGreaterThan(0);
      expect(shown[0].attributes('id')).toBe('help-phrase');
      expect(shown[0].find('mark').exists()).toBe(true);
      wrapper.unmount();
    });

    test('the handshake diagram steps forward and back, and switches to the file way', async () => {
      const { wrapper } = setup();
      const topic = wrapper.find('#help-both-sides');
      await topic.find('button[aria-expanded]').trigger('click');
      const fig = topic.find('figure.hs');
      const cap = () => fig.find('.hs-cap').text();
      const [prev, next] = fig.findAll('.hs-nav button');
      expect(prev.attributes('disabled')).toBeDefined();
      expect(cap()).toBe(help.en.ui.handshake.steps.epicbox[0]);
      await next.trigger('click');
      expect(cap()).toBe(help.en.ui.handshake.steps.epicbox[1]);
      await prev.trigger('click');
      expect(cap()).toBe(help.en.ui.handshake.steps.epicbox[0]);
      await fig.findAll('.hs-flows button')[1].trigger('click');
      expect(cap()).toBe(help.en.ui.handshake.steps.file[0]);
      expect(fig.findAll('.hs-flows button')[1].attributes('aria-pressed')).toBe('true');
      for (let i = 0; i < 5; i++) await next.trigger('click');
      expect(cap()).toBe(help.en.ui.handshake.steps.file[5]);
      expect(next.attributes('disabled')).toBeDefined();
      wrapper.unmount();
    });

  test('Report a problem: the card and Getting help open the support report', async () => {
    //msg.support.* arrives with feat/support-logs (merged in 6.1.6)
    const { wrapper, emitter } = setup();
    expect(wrapper.find('#stg-sup-h').text()).toBe('Something not working?');
    await wrapper.find('#stg-sup-h + button').trigger('click');
    expect(emitter.emit).toHaveBeenCalledWith('open-support');
    const gh = wrapper.find('#help-getting-help');
    await gh.find('button[aria-expanded]').trigger('click');
    emitter.emit.mockClear();
    await gh.find('.e-hlp-body button').trigger('click');
    expect(emitter.emit).toHaveBeenCalledWith('open-support');
    wrapper.unmount();
  });
});
