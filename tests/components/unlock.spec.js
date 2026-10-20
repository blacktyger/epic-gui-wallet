/*
 * Unlock in both interfaces: Classic Login.vue and Modern UnlockView.vue (its reskin). The
 * password goes to walletService.start (epic-wallet's owner API open_wallet); a wrong password
 * comes back as {success:false} with lastStartFailure 'password'.
 */
import { describe, test, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import Login from '@/components/Login.vue';
import UnlockView from '@/components/modern/views/UnlockView.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';
import { pressEnter } from './support/dom.js';

const WALLET = { id: 'w1', label: 'Main', dataDir: '/home/u/.epic-gui/wallets/w1', configDir: '/home/u/.epic-gui/wallets/w1', network: 'mainnet' };
//walletService.start's answer when epic-wallet refuses the password
const WRONG = { success: false, msg: 'Error opening wallet (is password correct?)' };

function fakeConfig(wallets = [WALLET]) {
  return {
    settings: {
      wallets: () => wallets,
      defaultWalletId: () => wallets[0] && wallets[0].id,
      setDefaultWallet: vi.fn(),
    },
    startCheck: vi.fn(async () => 'login'),
    killEpicProcess: vi.fn(async () => null),
    config: { nodeInternal: false, epicbox_domain: 'epicbox.epiccash.com' },
    wallet: WALLET,
  };
}

/* start: what walletService.start does (default: opens the wallet) */
function fakeWallet(start = async () => ({ success: true, msg: 'token' })) {
  const svc = {
    lastStartFailure: '',
    stopWallet: vi.fn(),
    start: vi.fn(async (...args) => {
      const r = await start(...args);
      svc.lastStartFailure = r.success ? '' : (r === WRONG ? 'password' : 'service');
      return r;
    }),
  };
  return svc;
}

function setup(Component, { wallet = fakeWallet(), configService = fakeConfig() } = {}) {
  const store = makeStore({ user: {} });
  const $userService = { getUser: vi.fn(async () => []), ensureUser: vi.fn(async () => ({ id: 7, account: 'w1' })) };
  const m = mountView(Component, {
    store,
    services: { $walletService: wallet, configService, $userService },
    stubs: { RemoveWalletDialog: true, ERemoveWallet: true },
  });
  const password = m.wrapper.find('input[name=password]');
  return { ...m, wallet, configService, $userService, password };
}

const INTERFACES = [
  { name: 'Classic', Component: Login, unlockLabel: () => t('msg.login_') },
  { name: 'Modern', Component: UnlockView, unlockLabel: () => t('msg.modern.unlock.unlock') },
];

const unlockButton = (w) => w.find('button[type=submit]');

describe.each(INTERFACES)('Unlock ($name)', (ui) => {
  test('the Unlock button is the form\'s submit button with its label', () => {
    const { wrapper } = setup(ui.Component);
    expect(unlockButton(wrapper).text()).toBe(ui.unlockLabel());
  });

  test('an empty password is refused without starting the wallet', async () => {
    const { wrapper, wallet } = setup(ui.Component);
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.validators.empty', ['password']));
    expect(wallet.start).not.toHaveBeenCalled();
  });

  test('a password under 4 characters is refused without starting the wallet', async () => {
    const { wrapper, wallet, password } = setup(ui.Component);
    await password.setValue('abc');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.validators.min_length', ['password', 4]));
    expect(wallet.start).not.toHaveBeenCalled();
  });

  test('the right password starts the wallet with it and logs in', async () => {
    const { wrapper, wallet, password, emitter, configService, $userService } = setup(ui.Component);
    await password.setValue('correct horse');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(configService.startCheck).toHaveBeenCalledWith('w1');
    expect(wallet.start).toHaveBeenCalledTimes(1);
    expect(wallet.start.mock.calls[0][0]).toBe('correct horse');
    expect($userService.ensureUser).toHaveBeenCalledWith('w1', expect.any(Object));
    expect(emitter.emit).toHaveBeenCalledWith('app.accountLoggedIn');
  });

  test('Enter in the password field unlocks', async () => {
    const { wallet, password } = setup(ui.Component);
    await password.setValue('correct horse');
    await pressEnter(password);
    await flushPromises();
    expect(wallet.start).toHaveBeenCalledTimes(1);
    expect(wallet.start.mock.calls[0][0]).toBe('correct horse');
  });

  test('while unlocking the button is marked busy and a second press does nothing', async () => {
    let finish;
    const wallet = fakeWallet(() => new Promise((r) => { finish = r; }));
    const { wrapper, password } = setup(ui.Component, { wallet });
    await password.setValue('correct horse');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(wallet.start).toHaveBeenCalledTimes(1);
    expect(unlockButton(wrapper).attributes('aria-disabled')).toBe('true');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(wallet.start).toHaveBeenCalledTimes(1);
    finish({ success: true, msg: 'token' });
    await flushPromises();
    expect(unlockButton(wrapper).attributes('aria-disabled')).not.toBe('true');
  });

  test('a wrong password logs nothing in and the form can be used again', async () => {
    const wallet = fakeWallet(async () => WRONG);
    const { wrapper, password, emitter, $userService, store } = setup(ui.Component, { wallet });
    await password.setValue('wrong one');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(wallet.start).toHaveBeenCalledTimes(1);
    expect(wallet.stopWallet).toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalledWith('app.accountLoggedIn');
    expect($userService.ensureUser).not.toHaveBeenCalled();
    expect(store.state.user).toEqual({});
    expect(unlockButton(wrapper).attributes('aria-disabled')).not.toBe('true');
    expect(unlockButton(wrapper).isVisible()).toBe(true);
  });

  test('the wallet folder is gone: says so with Remove and Try again', async () => {
    const configService = fakeConfig();
    configService.startCheck = vi.fn(async () => 'missing');
    const { wrapper, wallet, password } = setup(ui.Component, { configService });
    await password.setValue('correct horse');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(wallet.start).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(t('msg.removal.open'));
    expect(wrapper.text()).toContain(t('msg.wallets.try_again'));
    expect(wrapper.text()).toContain(WALLET.dataDir);
  });
});

describe('Unlock: how a wrong password is shown', () => {
  test('Classic: the wallet\'s message in a toast', async () => {
    const { wrapper, password, $toast } = setup(Login, { wallet: fakeWallet(async () => WRONG) });
    await password.setValue('wrong one');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect($toast.error).toHaveBeenCalledWith(WRONG.msg);
  });

  test('Modern: "Wrong password" beside the field, no toast, password selected to type over', async () => {
    const { wrapper, password, $toast } = setup(UnlockView, { wallet: fakeWallet(async () => WRONG) });
    await password.setValue('wrong one');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.find('[role=alert]').text()).toBe(t('msg.modern.unlock.wrong_password'));
    expect($toast.error).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(password.element);
  });

  test('Modern: a failure after the password step shows the failed step and its message', async () => {
    const wallet = fakeWallet(async () => ({ success: false, msg: { message: 'Owner API did not start' } }));
    const { wrapper, password } = setup(UnlockView, { wallet });
    await password.setValue('correct horse');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.modern.unlock.unlock_failed_title'));
    expect(wrapper.text()).toContain('Owner API did not start');
    expect(wrapper.text()).not.toContain(t('msg.modern.unlock.wrong_password'));
  });

  test('Modern: a new attempt clears the wrong-password message', async () => {
    let answer = WRONG;
    const { wrapper, password } = setup(UnlockView, { wallet: fakeWallet(async () => answer) });
    await password.setValue('wrong one');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain(t('msg.modern.unlock.wrong_password'));
    answer = { success: true, msg: 'token' };
    await password.setValue('correct horse');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain(t('msg.modern.unlock.wrong_password'));
  });
});

describe('Unlock with several wallets', () => {
  const OTHER = { ...WALLET, id: 'w2', label: 'Savings', dataDir: '/home/u/.epic-gui/wallets/w2' };

  test('Classic: the picked wallet is the one opened', async () => {
    const { wrapper, password, configService } = setup(Login, { configService: fakeConfig([WALLET, OTHER]) });
    await wrapper.find('select#loginWallet').setValue('w2');
    await password.setValue('correct horse');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(configService.startCheck).toHaveBeenCalledWith('w2');
  });

  test('Modern: the picked wallet is the one opened', async () => {
    const { wrapper, password, configService } = setup(UnlockView, { configService: fakeConfig([WALLET, OTHER]) });
    await wrapper.find('input[type=radio][value=w2]').setValue(true);
    await password.setValue('correct horse');
    await unlockButton(wrapper).trigger('click');
    await flushPromises();
    expect(configService.startCheck).toHaveBeenCalledWith('w2');
  });
});
