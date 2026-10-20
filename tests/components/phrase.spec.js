/*
 * The recovery phrase, both interfaces: Classic Seed.vue and Modern SettingsPhrase.vue (its
 * reskin). The words stay hidden until the wallet accepts the password (walletService.getMnemonic);
 * Copy goes through the main process's secret clipboard (window.clipboard.copySecret: marked for
 * clipboard managers, wiped after 60 s), never navigator.clipboard.
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import Seed from '@/components/Seed.vue';
import SettingsPhrase from '@/components/modern/views/settings/SettingsPhrase.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { button, pressEnter } from './support/dom.js';

const WORDS = ('rapid voyage sudden fence cotton echo noble trial uniform below crisp ' +
  'harvest rival glimpse tongue amused parade cabin wheat oyster lunar dial spice kingdom').split(' ');
const PHRASE = WORDS.join(' ');
//what epic-wallet says when the password does not open the seed file
const WRONG = { error: { code: -32099, message: 'Lifecycle: Error opening wallet seed file' } };

function setup(Component, { mnemonic = async () => ({ result: { Ok: PHRASE } }) } = {}) {
  const $walletService = { getMnemonic: vi.fn(mnemonic) };
  const m = mountView(Component, { store: makeStore(), services: { $walletService } });
  return { ...m, $walletService, password: m.wrapper.find('input[name=password]') };
}

const INTERFACES = [
  {
    name: 'Classic',
    Component: Seed,
    showLabel: () => t('msg.check.start'),
    words: (w) => w.findAll('.mnemonic-word').map((x) => x.text().trim()),
  },
  {
    name: 'Modern',
    Component: SettingsPhrase,
    showLabel: () => t('msg.modern.settings.show_words'),
    words: (w) => w.findAll('ol:not([aria-hidden]) li').map((x) => x.text().trim()),
  },
];

async function reveal(ui, s, password = 'correct horse') {
  await s.password.setValue(password);
  await button(s.wrapper, ui.showLabel()).trigger('click');
  await flushPromises();
}

describe.each(INTERFACES)('Recovery phrase ($name)', (ui) => {
  test('the words are hidden until the password is given', () => {
    const s = setup(ui.Component);
    expect(ui.words(s.wrapper)).toEqual([]);
    expect(s.wrapper.text()).not.toContain(WORDS[0]);
    expect(s.password.isVisible()).toBe(true);
    //Classic keeps the Copy button in the page, hidden (v-show); Modern leaves it out
    const copy = s.wrapper.findAll('button').find((b) => b.text().includes(t('msg.modern.unlock.phrase_copy')));
    expect(!copy || !copy.isVisible()).toBe(true);
    expect(s.$walletService.getMnemonic).not.toHaveBeenCalled();
  });

  test('no password: says it is required and does not ask the wallet', async () => {
    const s = setup(ui.Component);
    await button(s.wrapper, ui.showLabel()).trigger('click');
    await flushPromises();
    expect(s.wrapper.text()).toContain(t('msg.validators.empty', ['password']));
    expect(s.$walletService.getMnemonic).not.toHaveBeenCalled();
  });

  test('a wrong password says "Wrong password" under the field and shows no words', async () => {
    const s = setup(ui.Component, { mnemonic: async () => WRONG });
    await reveal(ui, s, 'wrong one');
    expect(s.$walletService.getMnemonic).toHaveBeenCalledWith('wrong one');
    expect(s.wrapper.text()).toContain(t('msg.modern.unlock.wrong_password'));
    expect(s.wrapper.text()).not.toContain(WRONG.error.message);
    expect(s.$toast.error).not.toHaveBeenCalled();
    expect(ui.words(s.wrapper)).toEqual([]);
  });

  test('no answer from the wallet is not called a wrong password', async () => {
    const s = setup(ui.Component, { mnemonic: async () => false });
    await reveal(ui, s);
    expect(s.$toast.error).toHaveBeenCalledWith(t('msg.app.wallet_api_unreachable'));
    expect(s.wrapper.text()).not.toContain(t('msg.modern.unlock.wrong_password'));
  });

  test('the right password shows all 24 words in order and hides the password form', async () => {
    const s = setup(ui.Component);
    await reveal(ui, s);
    expect(s.$walletService.getMnemonic).toHaveBeenCalledWith('correct horse');
    expect(ui.words(s.wrapper)).toEqual(WORDS);
    expect(s.wrapper.find('input[name=password]').exists() && s.wrapper.find('input[name=password]').isVisible()).toBe(false);
    expect(s.wrapper.text()).toContain(t('msg.create.backupNote'));
  });

  test('a phrase with a word twice shows every word in its place', async () => {
    const words = [...WORDS.slice(0, 23), WORDS[0]];
    const s = setup(ui.Component, { mnemonic: async () => ({ result: { Ok: words.join(' ') } }) });
    await reveal(ui, s);
    expect(ui.words(s.wrapper)).toEqual(words);
  });

  test('Copy uses the secret clipboard with the whole phrase, never the page clipboard', async () => {
    const pageClipboard = navigator.clipboard ? vi.spyOn(navigator.clipboard, 'writeText') : null;
    const s = setup(ui.Component);
    await reveal(ui, s);
    await button(s.wrapper, t('msg.modern.unlock.phrase_copy')).trigger('click');
    await flushPromises();
    expect(window.clipboard.copySecret).toHaveBeenCalledWith(PHRASE);
    expect(window.clipboard.writeText).not.toHaveBeenCalled();
    if (pageClipboard) expect(pageClipboard).not.toHaveBeenCalled();
    expect(s.$toast.success).toHaveBeenCalledWith(t('msg.modern.unlock.phrase_copied'));
  });

  test('a failed copy says so', async () => {
    window.clipboard.copySecret.mockRejectedValue(new Error('clipboard busy'));
    const s = setup(ui.Component);
    await reveal(ui, s);
    await button(s.wrapper, t('msg.modern.unlock.phrase_copy')).trigger('click');
    await flushPromises();
    expect(s.$toast.error).toHaveBeenCalledWith('clipboard busy');
    expect(s.$toast.success).not.toHaveBeenCalled();
  });

  test('the QR code is drawn only when asked for, and can be hidden again', async () => {
    const s = setup(ui.Component);
    await reveal(ui, s);
    expect(s.wrapper.find('canvas').exists()).toBe(false);
    expect(window.nodeQr.toCanvas).not.toHaveBeenCalled();

    await button(s.wrapper, t('msg.modern.unlock.phrase_qr')).trigger('click');
    await flushPromises();
    expect(s.wrapper.find('canvas').exists()).toBe(true);
    expect(window.nodeQr.toCanvas).toHaveBeenCalledWith(s.wrapper.find('canvas').element, PHRASE, expect.any(Function));

    await button(s.wrapper, t('msg.modern.unlock.phrase_qr_hide')).trigger('click');
    expect(s.wrapper.find('canvas').exists()).toBe(false);
  });
});

describe('Recovery phrase (Modern only)', () => {
  test('Enter in the password field shows the words', async () => {
    const s = setup(SettingsPhrase);
    await s.password.setValue('correct horse');
    await pressEnter(s.password);
    await flushPromises();
    expect(s.$walletService.getMnemonic).toHaveBeenCalledWith('correct horse');
    expect(INTERFACES[1].words(s.wrapper)).toEqual(WORDS);
  });

  test('the list is labelled with the number of words', async () => {
    const s = setup(SettingsPhrase);
    await reveal(INTERFACES[1], s);
    expect(s.wrapper.find('ol').attributes('aria-label')).toBe(t('msg.modern.settings.words_label', { n: 24 }));
  });
});
