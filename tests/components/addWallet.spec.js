/*
 * Adding a wallet (tester item #34): every way adds a NEW wallet and never replaces one, the app
 * then locks the open wallet and Unlock opens with the new wallet chosen, and Settings › Wallet's
 * Open wallet folder opens the open wallet's own folder.
 *
 *  1. the list and the files: Create and Restore (walletService.initWallet) and From a wallet
 *     folder (configService.openExistingWallet) on a real folder; the other wallets' records and
 *     files stay byte for byte (the older-app import: tests/importer.test.js)
 *  2. the screens, both interfaces: Create, Restore, Add an existing wallet and the found screen
 *     go to Unlock with the new wallet (locking the open one first, never opening a wallet)
 *  3. Unlock: the new wallet chosen and said to be added
 *  4. Settings › Wallet › Open wallet folder; Add a wallet's three ways on Welcome and in Settings
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import ConfigService from '@/shared/configService';
import WalletService from '@/shared/walletService';
import { layout } from '@/shared/appPaths';
import Create from '@/components/Create.vue';
import CreateView from '@/components/modern/views/CreateView.vue';
import Restore from '@/components/Restore.vue';
import RestoreView from '@/components/modern/views/RestoreView.vue';
import AddExisting from '@/components/AddExisting.vue';
import AddExistingView from '@/components/modern/views/AddExistingView.vue';
import Found from '@/components/Found.vue';
import FoundView from '@/components/modern/views/FoundView.vue';
import Login from '@/components/Login.vue';
import UnlockView from '@/components/modern/views/UnlockView.vue';
import Account from '@/components/Account.vue';
import SettingsAccount from '@/components/modern/views/settings/SettingsAccount.vue';
import Wallets from '@/components/Wallets.vue';
import SettingsWallets from '@/components/modern/views/settings/SettingsWallets.vue';
import New from '@/components/New.vue';
import WelcomeView from '@/components/modern/views/WelcomeView.vue';
import { mountView, t } from './support/mountView.js';
import { makeStore } from './support/fakeStore.js';

//walletService.js takes console.log from the preload's window.log when it is loaded
vi.hoisted(() => {
  const log = console.log.bind(console);
  window.log = { log, info: log, warn: log, error: log, debug: log };
});

//Create and Restore read the route with vue-router's useRoute
const currentRoute = reactive({ path: '/', params: {}, query: {} });
vi.mock('vue-router', async (orig) => ({ ...(await orig()), useRoute: () => currentRoute }));

//the repo (vitest's root, tests/components/vitest.config.mjs): happy-dom's import.meta.url is not a file URL
const REPO = process.cwd();

/* ------------------------------------------------------------------ 1. the list and the files */

/* every file under dir with its sha256, so "unchanged" means byte for byte */
function tree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

describe('every way of adding lists a new wallet; the others stay as they are', () => {
  let tmp, cs, ws, root;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'addwallet-'));
    root = path.join(tmp, '.epic-gui');
    const l = layout(root, path);
    const paths = { root, source: 'default', defaultRoot: root, settingsFile: l.settingsFile, walletsDir: l.walletsDir, userData: l.userData, logsDir: l.logsDir, processesFile: l.processesFile };
    cs = new ConfigService({ emit() {} }, {
      fs, pathMod: path, paths, resourcePath: path.join(REPO, 'resources'), platform: 'linux', arch: 'x64',
      nodeChildProcess: { ownedProcesses: async () => [], stopPids: async () => [] },
      isPortReachable: async () => false, folderLock: async () => ({ state: 'free' }),
    });
    window.nodeFs = fs;
    window.nodePath = path;
    ws = new WalletService({ emit() {}, on() {} }, cs);
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  /* what epic-wallet init does to the folder it is given (-c <dir>): the seed, the db */
  const fakeInit = (seed) => async (cmd, args) => {
    const dir = args[args.indexOf('-c') + 1];
    fs.mkdirSync(path.join(dir, 'wallet_data', 'db'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'wallet_data', 'wallet.seed'), seed);
    fs.writeFileSync(path.join(dir, 'wallet_data', 'db', 'epic.db'), 'db of ' + seed);
    return { success: true, msg: 'word '.repeat(24).trim() };
  };
  const create = (label = '') => ws.initWallet('mainnet', label, 'created', fakeInit('seed-' + label), false);
  const restore = (label = '') => ws.initWallet('mainnet', label, 'restored', fakeInit('seed-' + label), true);
  /* a wallet made by the command line wallet somewhere else */
  const cliWallet = (dir) => {
    fs.mkdirSync(path.join(dir, 'wallet_data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'wallet_data', 'wallet.seed'), 'cli seed ' + dir);
    fs.writeFileSync(path.join(dir, 'epic-wallet.toml'), 'chain_type = "Mainnet"\n');
    return dir;
  };
  const snapshot = () => ({
    records: JSON.parse(JSON.stringify(cs.settings.wallets())),
    files: Object.fromEntries(cs.settings.wallets().map(w => [w.id, { data: tree(w.dataDir), config: tree(w.configDir) }])),
  });
  /* the wallets in `before` are all still listed with the same record and the same files */
  const unchanged = (before) => {
    const now = cs.settings.wallets();
    for (const w of before.records) {
      expect(now.find(x => x.id === w.id), w.id + ' still listed').toEqual(w);
      expect(tree(w.dataDir), w.id + ' data folder').toEqual(before.files[w.id].data);
      expect(tree(w.configDir), w.id + ' config folder').toEqual(before.files[w.id].config);
    }
  };

  test('Create, Restore and From a wallet folder, one after another: four wallets, each in its own folder', async () => {
    const a = await create('A');
    expect(a.success).toBe(true);
    let before = snapshot();

    const b = await create('B');
    expect(b.wallet.id).not.toBe(a.wallet.id);
    unchanged(before);
    before = snapshot();

    //the same phrase again: still a new wallet next to the first, never the first one replaced
    const c = await restore('A');
    expect(c.success).toBe(true);
    expect(c.wallet.id).not.toBe(a.wallet.id);
    unchanged(before);
    before = snapshot();

    const r = await cs.openExistingWallet(cliWallet(path.join(tmp, 'cli', 'main')));
    expect(r.ok).toBe(true);
    unchanged(before);

    const list = cs.settings.wallets();
    expect(list.map(w => w.id)).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(new Set(list.map(w => w.dataDir)).size).toBe(4);
    expect(new Set(list.map(w => w.configDir)).size).toBe(4);
    //the default is still the first wallet: Unlock chooses the new one (screens, below)
    expect(cs.settings.defaultWalletId()).toBe('w1');
  });

  test('a listed wallet\'s folder, in any spelling, is refused and nothing changes', async () => {
    const a = await create('A');
    await cs.openExistingWallet(cliWallet(path.join(tmp, 'cli', 'main')));
    const before = snapshot();
    const settingsBefore = fs.readFileSync(cs.paths.settingsFile, 'utf8');
    for (const dir of [a.wallet.dataDir, a.wallet.dataDir + path.sep, path.join(tmp, 'cli', 'main'), path.join(tmp, 'cli', '.', 'main')]) {
      expect(await cs.openExistingWallet(dir), dir).toEqual({ ok: false, reason: 'listed' });
    }
    unchanged(before);
    expect(fs.readFileSync(cs.paths.settingsFile, 'utf8')).toBe(settingsBefore);
  });

  test('a folder left by a removed wallet is skipped: the new wallet gets an unused id and an empty folder', async () => {
    const a = await create('A');
    //w2's folder holds files (a wallet removed from the list only, a create that failed after init)
    const stale = path.join(root, 'wallets', 'w2');
    cliWallet(stale);
    const staleBefore = tree(stale);
    const before = snapshot();
    const b = await create('B');
    expect(b.wallet.id).toBe('w3');
    expect(tree(stale)).toEqual(staleBefore);
    unchanged(before);
    expect(a.wallet.id).toBe('w1');
  });

  test('a failed create or restore lists nothing and leaves the others as they are', async () => {
    await create('A');
    const before = snapshot();
    const failed = await ws.initWallet('mainnet', '', 'created', async () => ({ success: false, msg: 'init failed' }), false);
    expect(failed.success).toBe(false);
    expect(cs.settings.wallets()).toHaveLength(1);
    unchanged(before);
  });

  test('a record with an id that is already listed is never written over', async () => {
    const a = await create('A');
    const before = snapshot();
    expect(() => cs.registerWallet({ id: a.wallet.id, network: 'mainnet', configDir: path.join(tmp, 'x'), dataDir: path.join(tmp, 'x'), origin: 'opened' })).toThrow(/exists/);
    expect(() => cs.settings.addWallet({ id: a.wallet.id, network: 'mainnet', configDir: path.join(tmp, 'x'), dataDir: path.join(tmp, 'x'), origin: 'opened' })).toThrow(/exists/);
    unchanged(before);
  });
});

/* ------------------------------------------------------------------ 2. the screens */

const W1 = { id: 'w1', label: 'Main', network: 'mainnet', origin: 'created', dataDir: '/home/u/.epic-gui/wallets/w1', configDir: '/home/u/.epic-gui/wallets/w1' };
const W2 = { id: 'w2', label: '', network: 'mainnet', origin: 'created', dataDir: '/home/u/.epic-gui/wallets/w2', configDir: '/home/u/.epic-gui/wallets/w2' };
const W3 = { id: 'w3', label: 'Old', network: 'mainnet', origin: 'imported', dataDir: '/home/u/.epic/main', configDir: '/home/u/.epic-gui/wallets/w3', importedFrom: { app: '5.3.1', account: 'default', dir: '/home/u/.epic/main' } };

function fakeConfig({ wallets = [W1], open = 'w1' } = {}) {
  const list = [...wallets];
  let def = list[0] && list[0].id;
  return {
    walletId: open,
    wallet: list.find(w => w.id === open) || null,
    walletDataDir: '', walletConfigDir: '',
    defaultAccountNetwork: 'mainnet',
    config: { nodeInternal: false, epicbox_domain: 'epicbox.epiccash.com' },
    paths: { root: '/home/u/.epic-gui', source: 'default', legacy: { epicDir: '/home/u/.epic' } },
    canMoveRoot: () => false,
    settings: {
      wallets: () => list,
      wallet: (id) => list.find(w => w.id === id),
      defaultWalletId: () => def,
      setDefaultWallet: vi.fn((id) => { def = id; return true; }),
      isFirstRun: () => false,
      markScanned: () => true,
      readOnly: false,
    },
    list,
    openExistingWallet: vi.fn(async () => { list.push(W2); return { ok: true, wallet: W2 }; }),
    startCheck: vi.fn(async () => 'login'),
    killEpicProcess: vi.fn(async () => null),
  };
}

/* a wallet is open; Lock (App.vue's app.logout) answers done once it closed */
function setup(Component, { loggedIn = true, configService = fakeConfig(), route = {}, wallet = {} } = {}) {
  const store = makeStore({ user: loggedIn ? { id: 1, account: 'w1' } : {} });
  const order = [];
  const $walletService = {
    start: vi.fn(async () => ({ success: true })),
    new: vi.fn(async () => { configService.list.push(W2); return { success: true, msg: 'word '.repeat(24).trim(), wallet: W2 }; }),
    recover: vi.fn(async () => { configService.list.push(W2); return { success: true, wallet: W2 }; }),
    stopWallet: vi.fn(),
    ...wallet,
  };
  const $userService = { removeUser: vi.fn(async () => ({})), getUser: vi.fn(async () => []), ensureUser: vi.fn(async () => ({ id: 1 })) };
  const $importer = { scan: vi.fn(async () => ({ wallets: [{ key: '/home/u/.epic/main', dir: '/home/u/.epic', network: 'mainnet', label: '' }] })), importWallets: vi.fn(async () => { configService.list.push(W3); return { imported: [{ key: '/home/u/.epic/main', walletId: 'w3' }], failed: [] }; }) };
  Object.assign(currentRoute, { path: '/', params: {}, query: {}, ...route });
  const m = mountView(Component, { store, route, services: { $walletService, configService, $userService, $importer }, stubs: { RemoveWalletDialog: true, ERemoveWallet: true } });
  m.emitter.on('app.logout', (o) => {
    order.push('lock');
    store.commit('user', {});
    if (o && o.done) o.done();
  });
  m.$router.push.mockImplementation((r) => { order.push('push'); });
  return { ...m, configService, $walletService, $userService, order };
}

/* what each add flow must end with: the open wallet locked (stay: the page goes on), the new one the
   default, Unlock with it chosen, and no wallet opened with a password */
function expectUnlockWith(s, id, { locked = true } = {}) {
  const logout = s.emitter.emit.mock.calls.filter(c => c[0] === 'app.logout');
  if (locked) {
    expect(logout).toHaveLength(1);
    expect(logout[0][1]).toMatchObject({ stay: true });
  } else {
    expect(logout).toHaveLength(0);
  }
  expect(s.configService.settings.setDefaultWallet).toHaveBeenCalledWith(id);
  expect(s.$router.push).toHaveBeenLastCalledWith({ name: 'login', query: { wallet: id, added: '1' } });
  expect(s.order).toEqual(locked ? ['lock', 'push'] : ['push']);
  expect(s.$walletService.start).not.toHaveBeenCalled();
  expect(s.emitter.emit).not.toHaveBeenCalledWith('app.accountLoggedIn');
  //nothing in the list was replaced: the wallets there before are all still there
  expect(s.configService.list.map(w => w.id)).toEqual(expect.arrayContaining(['w1', id]));
}

const BOTH = (Classic, Modern) => [{ name: 'Classic', C: Classic }, { name: 'Modern', C: Modern }];

describe.each(BOTH(Create, CreateView))('Create ($name)', ({ C }) => {
  async function created(s) {
    await s.wrapper.find('input[name=password]').setValue('pass word 1');
    await s.wrapper.find('input[name=password2]').setValue('pass word 1');
    await s.wrapper.vm.create();
    await flushPromises();
    await s.wrapper.vm.reveal();
    await flushPromises();
  }
  const continueButton = (w) => w.findAll('button').find(b => b.text() === t('msg.wallets.written_continue'));

  test('from Settings: the phrase is written down, the open wallet locks, Unlock opens with the new wallet', async () => {
    const s = setup(C, { route: { query: { add: '1' } } });
    await created(s);
    expect(s.$walletService.new).toHaveBeenCalledTimes(1);
    await continueButton(s.wrapper).trigger('click');
    await flushPromises();
    expectUnlockWith(s, 'w2');
  });

  test('first start (no wallet open): straight to Unlock with the new wallet', async () => {
    const s = setup(C, { loggedIn: false, configService: fakeConfig({ wallets: [], open: '' }) });
    await created(s);
    await continueButton(s.wrapper).trigger('click');
    await flushPromises();
    expect(s.configService.settings.setDefaultWallet).toHaveBeenCalledWith('w2');
    expect(s.$router.push).toHaveBeenLastCalledWith({ name: 'login', query: { wallet: 'w2', added: '1' } });
    expect(s.$walletService.start).not.toHaveBeenCalled();
  });
});

describe.each(BOTH(Create, CreateView).concat(BOTH(Restore, RestoreView)))('Back from $C.name started in Settings', ({ C }) => {
  test('goes back to Settings › All wallets, where the add options are', async () => {
    const s = setup(C, { route: { query: { add: '1' } } });
    s.wrapper.vm.back();
    expect(s.$router.push).toHaveBeenLastCalledWith({ name: 'wallets' });
  });
});

describe('a lock that never reports back', () => {
  test('the add flow still reaches Unlock after 60 s, with the new wallet chosen', async () => {
    vi.useFakeTimers();
    const s = setup(Create, { route: { query: { add: '1' } } });
    s.emitter.all.clear();      //no App.vue: nobody answers app.logout
    s.wrapper.vm.wallet = W2;
    s.wrapper.vm.page = 'created';
    const going = s.wrapper.vm.openNewWallet();
    await flushPromises();
    expect(s.$router.push).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60000);
    await going;
    expect(s.$router.push).toHaveBeenLastCalledWith({ name: 'login', query: { wallet: 'w2', added: '1' } });
  });
});

describe.each(BOTH(Restore, RestoreView))('Restore ($name)', ({ C }) => {
  test('from Settings: restored as a new wallet, the open wallet locks, Unlock opens with it', async () => {
    const s = setup(C, { route: { query: { add: '1' } } });
    //the phrase was entered (24 words): the password step
    s.wrapper.vm.page = 'addPassword';
    await flushPromises();
    await s.wrapper.find('input[name=password]').setValue('pass word 1');
    await s.wrapper.find('input[name=password2]').setValue('pass word 1');
    await s.wrapper.vm.initR();
    await flushPromises();
    expect(s.$walletService.recover).toHaveBeenCalledTimes(1);
    expectUnlockWith(s, 'w2');
  });
});

describe.each(BOTH(AddExisting, AddExistingView))('Add an existing wallet ($name)', ({ C }) => {
  test('From a wallet folder: the folder becomes a new wallet, the open wallet locks, Unlock opens with it', async () => {
    const s = setup(C, { route: { query: { from: 'settings' } } });
    window.api.pickWalletFolder = vi.fn(async () => ({ canceled: false, picked: '/media/usb/main', wallets: [{ dir: '/media/usb/main', network: 'mainnet' }] }));
    await s.wrapper.find('button[aria-describedby]').trigger('click');
    await flushPromises();
    expect(window.api.pickWalletFolder).toHaveBeenCalledWith(t('msg.wallets.folder_dialog_title'));
    expect(s.configService.openExistingWallet).toHaveBeenCalledWith('/media/usb/main', 'mainnet');
    expectUnlockWith(s, 'w2');
  });

  test('a folder whose network can\'t be told opens at once on the Welcome network (Mainnet by default), no question', async () => {
    for (const [query, net] of [[{ from: 'settings' }, 'mainnet'], [{ from: 'new', network: 'floonet' }, 'floonet']]) {
      const s = setup(C, { loggedIn: query.from === 'settings', route: { query } });
      window.api.pickWalletFolder = vi.fn(async () => ({ canceled: false, picked: '/media/usb/w', wallets: [{ dir: '/media/usb/w', network: '' }] }));
      await s.wrapper.find('button[aria-describedby]').trigger('click');
      await flushPromises();
      expect(s.configService.openExistingWallet).toHaveBeenCalledWith('/media/usb/w', net);
      expect(s.wrapper.find('select').exists()).toBe(false);
    }
  });

  test('from Welcome on a test network: the network goes along to the found screen and back to Welcome', () => {
    const s = setup(C, { loggedIn: false, route: { query: { from: 'new', network: 'floonet' } } });
    const links = s.wrapper.findAllComponents({ name: 'RouterLinkStub' }).map(l => l.props('to'));
    expect(links).toContainEqual({ name: 'found', query: { from: 'new', network: 'floonet' } });
    expect(links).toContainEqual({ name: 'new', query: { network: 'floonet' } });
    expect(s.wrapper.vm.folderNetwork).toBe('floonet');
  });

  test('From an older Epic Wallet goes to the found screen; Back goes to Settings › All wallets', () => {
    const s = setup(C, { route: { query: { from: 'settings' } } });
    const links = s.wrapper.findAllComponents({ name: 'RouterLinkStub' }).map(l => l.props('to'));
    expect(links).toContainEqual({ name: 'found', query: { from: 'settings' } });
    expect(links).toContainEqual({ name: 'wallets' });
  });

  test('a listed folder is refused with a message; nothing locks and nothing is added', async () => {
    const configService = fakeConfig();
    configService.openExistingWallet = vi.fn(async () => ({ ok: false, reason: 'listed' }));
    const s = setup(C, { configService, route: { query: { from: 'settings' } } });
    window.api.pickWalletFolder = vi.fn(async () => ({ canceled: false, picked: W1.dataDir, wallets: [{ dir: W1.dataDir, network: 'mainnet' }] }));
    await s.wrapper.find('button[aria-describedby]').trigger('click');
    await flushPromises();
    expect(s.wrapper.text()).toContain(t('msg.wallets.folder_listed'));
    expect(s.emitter.emit).not.toHaveBeenCalledWith('app.logout', expect.anything());
    expect(s.$router.push).not.toHaveBeenCalled();
    expect(configService.list.map(w => w.id)).toEqual(['w1']);
  });
});

describe.each(BOTH(Found, FoundView))('Older Epic Wallet import ($name)', ({ C }) => {
  test('imported: the open wallet locks, Unlock opens with the imported wallet', async () => {
    const s = setup(C, { route: { query: { from: 'settings' } } });
    await flushPromises();
    await s.wrapper.vm.submit();
    await flushPromises();
    expect(s.$importer.importWallets).toHaveBeenCalledTimes(1);
    expectUnlockWith(s, 'w3');
  });
});

/* ------------------------------------------------------------------ 3. Unlock */

describe.each(BOTH(Login, UnlockView))('Unlock after adding ($name)', ({ name, C }) => {
  test('the new wallet is chosen (not the old default) and said to be added, after the page shows', async () => {
    vi.useFakeTimers();
    const configService = fakeConfig({ wallets: [W1, W2], open: '' });
    const s = setup(C, { loggedIn: false, configService, route: { query: { wallet: 'w2', added: '1' } } });
    expect(s.wrapper.vm.selectedId).toBe('w2');
    const checked = s.wrapper.find('select').exists() ? s.wrapper.find('select').element.value : s.wrapper.find('input[type=radio]:checked').element.value;
    expect(checked).toBe('w2');
    //put into its status region after the page is there, so a screen reader announces it
    expect(s.wrapper.find('[data-added]').exists()).toBe(false);
    vi.advanceTimersByTime(200);
    await flushPromises();
    expect(s.wrapper.find('[data-added]').text()).toBe(t('msg.wallets.added_unlock' + (name === 'Modern' ? '_m' : ''), ['Wallet 2']));
  });

  test('without the query the default wallet is chosen and nothing is said', () => {
    const configService = fakeConfig({ wallets: [W1, W2], open: '' });
    const s = setup(C, { loggedIn: false, configService });
    expect(s.wrapper.vm.selectedId).toBe('w1');
    expect(s.wrapper.find('[data-added]').exists()).toBe(false);
  });

  test('Add a wallet leads to the three ways (Welcome)', () => {
    const s = setup(C, { loggedIn: false, configService: fakeConfig({ wallets: [W1, W2], open: '' }) });
    const link = s.wrapper.findAllComponents({ name: 'RouterLinkStub' }).find(l => l.text() === t('msg.wallets.add_title'));
    expect(link.props('to')).toBe('/new');
  });
});

/* ------------------------------------------------------------------ 4. Settings and Welcome */

//the Classic button says "Open wallet folder"; Modern's page is already "This wallet": just "Open folder"
const OPEN_LABEL = { Classic: 'msg.wallets.open_this_folder', Modern: 'msg.modern.settings.open_folder' };

describe.each(BOTH(Account, SettingsAccount))('Settings › Wallet ($name)', ({ name, C }) => {
  test.each([
    ['a wallet made here: <root>/wallets/<id>', W2, W2.dataDir],
    ['an imported wallet: the folder it lives in', W3, W3.dataDir],
  ])('Open folder opens the open wallet\'s own folder: %s', async (_, open, want) => {
    window.openepichidden = { open: vi.fn(async () => true) };
    const s = setup(C, { configService: fakeConfig({ wallets: [W1, W2, W3], open: open.id }) });
    const button = s.wrapper.find('button[data-open=wallet]');
    expect(button.text()).toBe(t(OPEN_LABEL[name]));
    await button.trigger('click');
    await flushPromises();
    expect(window.openepichidden.open).toHaveBeenCalledTimes(1);
    expect(window.openepichidden.open).toHaveBeenCalledWith(want);
    expect(s.$toast.error).not.toHaveBeenCalled();
  });

  test('Modern: the copy icon button copies the wallet folder path', async () => {
    if (name !== 'Modern') return;
    const s = setup(C, { configService: fakeConfig({ wallets: [W1, W2, W3], open: W2.id }) });
    const copy = s.wrapper.find('button[aria-label="' + t('msg.wallets.copy_path') + ': ' + t('msg.wallets.wallet_folder') + '"]');
    expect(copy.exists()).toBe(true);
    await copy.trigger('click');
    await flushPromises();
    expect(window.clipboard.writeText).toHaveBeenCalledWith(W2.dataDir);
  });

  test('no wallet picker and no add buttons on this page', () => {
    window.api.pickWalletFolder = vi.fn();
    const s = setup(C, { configService: fakeConfig({ wallets: [W1, W2], open: 'w1' }) });
    expect(s.wrapper.text()).not.toContain(t('msg.wallets.add_create'));
    expect(s.wrapper.text()).not.toContain(t('msg.wallets.existing_folder_go'));
    expect(s.wrapper.findAll('[data-add]')).toHaveLength(0);
  });
});

/* the three ways, in this order, with where each goes */
function addLinks(wrapper) {
  return wrapper.findAll('[data-add]').map(a => a.attributes('data-add'));
}

describe.each(BOTH(Wallets, SettingsWallets))('Settings › All wallets ($name)', ({ C }) => {
  test('Add a wallet: Create, Add an existing wallet, Restore, all as another wallet', () => {
    const s = setup(C, { configService: fakeConfig({ wallets: [W1, W2], open: 'w1' }) });
    expect(addLinks(s.wrapper)).toEqual(['create', 'existing', 'restore']);
    const to = s.wrapper.findAllComponents({ name: 'RouterLinkStub' }).map(l => l.props('to'));
    expect(to).toContainEqual({ name: 'create', query: { add: '1' } });
    expect(to).toContainEqual({ name: 'restore', query: { add: '1' } });
    expect(to).toContainEqual({ name: 'addExisting', query: { from: 'settings' } });
  });

  test('every wallet listed; the open one marked and not removable; Show in folder opens that wallet\'s folder', async () => {
    window.openepichidden = { open: vi.fn(async () => true) };
    const s = setup(C, { configService: fakeConfig({ wallets: [W1, W3], open: 'w1' }) });
    await flushPromises();
    expect(s.wrapper.findAll('[data-wallet]').map(r => r.attributes('data-wallet'))).toEqual(['w1', 'w3']);
    expect(s.wrapper.find('[data-wallet=w1]').text()).toContain(t('msg.wallets.open_now'));
    expect(s.wrapper.find('[data-wallet=w1]').text()).not.toContain(t('msg.removal.open'));
    await s.wrapper.find('[data-wallet=w3]').findAll('button')[0].trigger('click');
    await flushPromises();
    expect(window.openepichidden.open).toHaveBeenCalledWith(W3.dataDir);
  });
});

describe.each(BOTH(New, WelcomeView))('Welcome ($name)', ({ name, C }) => {
  test('first start: the three ways, back to Welcome', () => {
    const s = setup(C, { loggedIn: false, configService: fakeConfig({ wallets: [], open: '' }) });
    expect(addLinks(s.wrapper)).toEqual(['create', 'existing', 'restore']);
    const to = s.wrapper.findAllComponents({ name: 'RouterLinkStub' }).map(l => l.props('to'));
    expect(to).toContainEqual({ name: 'create', params: { from: 'new' }, query: {} });
    expect(to).toContainEqual({ name: 'addExisting', query: { from: 'new' } });
    expect(s.wrapper.text()).toContain(t(name === 'Modern' ? 'msg.wallets.add_existing_hint_m' : 'msg.wallets.add_create_hint'));
  });

  test('from Unlock (wallets listed): titled Add a wallet, with Back to unlock', () => {
    const s = setup(C, { loggedIn: false, configService: fakeConfig({ wallets: [W1], open: '' }) });
    expect(s.wrapper.find('h1').text()).toBe(t('msg.wallets.add_title'));
    expect(addLinks(s.wrapper)).toEqual(['create', 'existing', 'restore']);
    expect(s.wrapper.text()).toContain(t('msg.wallets.back_to_unlock'));
  });
});
