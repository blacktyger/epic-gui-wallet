/*
 * Removing a wallet, both interfaces: Classic layout/RemoveWalletDialog.vue and Modern
 * modern/settings/RemoveWalletDialog.vue (same logic, components/removalPlan.js). Three choices:
 * from the list only, this app's files, or everything (typed name and a checkbox first).
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import ClassicDialog from '@/components/layout/RemoveWalletDialog.vue';
import ModernDialog from '@/components/modern/settings/RemoveWalletDialog.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { button } from './support/dom.js';

const WALLET = { id: 'w1', dataDir: '/home/u/.epic-gui/wallets/w1/data', configDir: '/home/u/.epic-gui/wallets/w1' };
const NAME = 'Main';
const ALL_OK = { canList: true, canAppFiles: true, canEverything: true, reasons: {} };
const DONE = { ok: true, plan: { dir: WALLET.configDir }, entryRemoved: true, dirRemoved: true, failed: [] };

async function setup(Component, { plan = ALL_OK, result = DONE, folderMissing = false, settle = true } = {}) {
  const configService = {
    walletId: 'w9',
    removalPlan: vi.fn(async () => (typeof plan === 'function' ? plan() : plan)),
    removeWallet: vi.fn(async () => result),
    settings: { wallet: () => WALLET },
  };
  const $userService = { removeUser: vi.fn(async () => ({})) };
  const m = mountView(Component, {
    store: makeStore({ user: {} }),
    props: { wallet: WALLET, name: NAME, folderMissing },
    services: { configService, $userService },
  });
  if (settle) await flushPromises();
  return { ...m, configService, $userService };
}

const radios = (w) => w.findAll('input[type=radio]');
const radio = (w, mode) => w.find('input[type=radio][value=' + mode + ']');
const confirmButton = (w, key) => button(w, t(key));

describe.each([
  { name: 'Classic', Component: ClassicDialog },
  { name: 'Modern', Component: ModernDialog },
])('Remove wallet dialog ($name)', ({ Component }) => {
  test('opens as a modal with the wallet\'s name, the lead and three choices', async () => {
    const { wrapper } = await setup(Component);
    expect(wrapper.find('dialog').element.open).toBe(true);
    const text = wrapper.text();
    expect(text).toContain(t('msg.removal.title', [NAME]));
    expect(text).toContain(t('msg.removal.lead'));
    expect(text).toContain(t('msg.removal.ready'));
    expect(radios(wrapper).map((r) => r.element.value)).toEqual(['list', 'app', 'everything']);
    expect(text).toContain(t('msg.removal.list_label'));
    expect(text).toContain(t('msg.removal.list_hint'));
    expect(text).toContain(t('msg.removal.app_label'));
    expect(text).toContain(t('msg.removal.app_hint', [WALLET.dataDir]));
    expect(text).toContain(t('msg.removal.all_label'));
    expect(text).toContain(t('msg.removal.all_hint', [WALLET.configDir]));
  });

  test('asks which choices this wallet allows; until it knows, none can be picked', async () => {
    let answer;
    const { wrapper, configService } = await setup(Component, { plan: () => new Promise((r) => { answer = r; }), settle: false });
    await flushPromises();
    expect(configService.removalPlan).toHaveBeenCalledWith('w1', { openId: '', folderMissing: false });
    expect(wrapper.text()).toContain(t('msg.removal.checking'));
    expect(radios(wrapper).every((r) => r.element.disabled)).toBe(true);
    expect(confirmButton(wrapper, 'msg.removal.button_list').element.disabled).toBe(true);
    answer(ALL_OK);
    await flushPromises();
    expect(radios(wrapper).some((r) => r.element.disabled)).toBe(false);
  });

  test('"from the list only" is picked first; confirm removes it from the list, keeps the contacts, reports done', async () => {
    const { wrapper, configService, $userService, $toast } = await setup(Component);
    expect(radio(wrapper, 'list').element.checked).toBe(true);
    await confirmButton(wrapper, 'msg.removal.button_list').trigger('click');
    await flushPromises();
    expect(configService.removeWallet).toHaveBeenCalledTimes(1);
    expect(configService.removeWallet).toHaveBeenCalledWith('w1', 'list', { openId: '', folderMissing: false });
    expect($userService.removeUser).not.toHaveBeenCalled();
    expect($toast.success).toHaveBeenCalledWith(t('msg.removal.done_list', [NAME]));
  });

  test('"this app\'s files" removes them and the wallet\'s contacts', async () => {
    const { wrapper, configService, $userService, $toast } = await setup(Component);
    await radio(wrapper, 'app').setValue(true);
    await confirmButton(wrapper, 'msg.removal.button_app').trigger('click');
    await flushPromises();
    expect(configService.removeWallet).toHaveBeenCalledWith('w1', 'app', { openId: '', folderMissing: false });
    expect($userService.removeUser).toHaveBeenCalledWith('w1');
    expect($toast.success).toHaveBeenCalledWith(t('msg.removal.done_app', [NAME]));
  });

  test('"everything" warns, and stays disabled until the exact name is typed and the checkbox ticked', async () => {
    const { wrapper, configService } = await setup(Component);
    await radio(wrapper, 'everything').setValue(true);
    expect(wrapper.text()).toContain(t('msg.removal.danger_title'));
    expect(wrapper.text()).toContain(t('msg.removal.danger_text'));
    expect(wrapper.text()).toContain(t('msg.removal.type_label', [NAME]));
    const go = () => confirmButton(wrapper, 'msg.removal.button_all');
    expect(go().element.disabled).toBe(true);

    const nameInput = wrapper.find('input[type=text]');
    await nameInput.setValue('Mai');
    expect(wrapper.text()).toContain(t('msg.removal.type_mismatch'));
    await wrapper.find('input[type=checkbox]').setValue(true);
    expect(go().element.disabled).toBe(true);

    await nameInput.setValue('Main');
    expect(wrapper.text()).not.toContain(t('msg.removal.type_mismatch'));
    expect(go().element.disabled).toBe(false);
    await go().trigger('click');
    await flushPromises();
    expect(configService.removeWallet).toHaveBeenCalledWith('w1', 'everything', { openId: '', folderMissing: false });
  });

  test('the name and the checkbox are asked again after switching away from "everything"', async () => {
    const { wrapper } = await setup(Component);
    await radio(wrapper, 'everything').setValue(true);
    await wrapper.find('input[type=text]').setValue('Main');
    await wrapper.find('input[type=checkbox]').setValue(true);
    await radio(wrapper, 'list').setValue(true);
    await radio(wrapper, 'everything').setValue(true);
    expect(wrapper.find('input[type=text]').element.value).toBe('');
    expect(confirmButton(wrapper, 'msg.removal.button_all').element.disabled).toBe(true);
  });

  test('Cancel closes it and removes nothing', async () => {
    const { wrapper, configService, $userService } = await setup(Component);
    await radio(wrapper, 'app').setValue(true);
    await button(wrapper, t('msg.cancel')).trigger('click');
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('done')).toBeUndefined();
    expect(configService.removeWallet).not.toHaveBeenCalled();
    expect($userService.removeUser).not.toHaveBeenCalled();
  });

  test('Esc closes it and removes nothing', async () => {
    const { wrapper, configService } = await setup(Component);
    wrapper.find('dialog').element.dispatchEvent(new Event('cancel', { cancelable: true }));
    await flushPromises();
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(configService.removeWallet).not.toHaveBeenCalled();
  });

  test('a choice this wallet does not allow is disabled with the reason', async () => {
    const plan = { canList: true, canAppFiles: true, canEverything: false, reasons: { everything: { key: 'legacy', path: '/home/u/.epic' } } };
    const { wrapper } = await setup(Component, { plan });
    expect(radio(wrapper, 'everything').element.disabled).toBe(true);
    expect(wrapper.text()).toContain(t('msg.removal.reason_legacy', ['/home/u/.epic']));
    expect(wrapper.text()).toContain(t('msg.removal.all_hint_off'));
    expect(wrapper.text()).not.toContain(t('msg.removal.all_hint', [WALLET.configDir]));
  });

  test('its folder is gone (Unlock): no "everything" choice, the app-files hint names the config folder', async () => {
    const { wrapper, configService } = await setup(Component, { folderMissing: true });
    expect(configService.removalPlan).toHaveBeenCalledWith('w1', { openId: '', folderMissing: true });
    expect(radios(wrapper).map((r) => r.element.value)).toEqual(['list', 'app']);
    expect(wrapper.text()).toContain(t('msg.removal.app_hint_missing', [WALLET.configDir]));
  });

  test('a removal that failed says why', async () => {
    const { wrapper, $toast } = await setup(Component, { result: { ok: false, reason: 'running' } });
    await confirmButton(wrapper, 'msg.removal.button_list').trigger('click');
    await flushPromises();
    expect($toast.error).toHaveBeenCalledWith(t('msg.removal.failed', [t('msg.removal.reason_running', [WALLET.configDir])]));
    expect(wrapper.emitted('done')[0][0]).toEqual({ ok: false, reason: 'running' });
  });

  test('done is emitted with the result once the removal ran', async () => {
    const { wrapper } = await setup(Component);
    await confirmButton(wrapper, 'msg.removal.button_list').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('done')[0][0]).toEqual(DONE);
  });
});
