/*
 * The wallet list of GUI 6.1 (configService.settings, shared/settingsStore.js) as the screens
 * show it, and the logic the first-run screens share: opening a wallet with its password,
 * opening a wallet folder, removing a wallet from the list. Used by the Classic components;
 * their Modern reskins inherit it.
 */
import { i18n, messages } from '@/i18n';
import { pendingUser } from '@/shared/unlockResult';
import { displayLabel } from '@/shared/walletLabel';
import WalletFolderPick from '@/components/form/WalletFolderPick.vue';

const t = (...a) => i18n.global.t(...a);

/* the wallets in the list, [] while the settings can't be read */
export function walletList(configService) {
  try {
    return configService && configService.settings ? configService.settings.wallets() : [];
  } catch (e) {
    return [];
  }
}

//every language's default name ('Wallet {0}', 'Portfel {0}', …)
const defaultNames = Object.values(messages).map(m => m.msg && m.msg.wallets && m.msg.wallets.wallet_n).filter(Boolean);

/* a stored label as shown: one that is a default name ("Wallet 2", saved while the app was in English)
   in the current language ("Portfel 2"), a typed one as it is (shared/walletLabel.js) */
export function labelShown(label) {
  return displayLabel(label, defaultNames, n => t('msg.wallets.wallet_n', [n]));
}

/* what a wallet is called: its label, else "Wallet 1", "Wallet 2"… by its place in the list */
export function walletName(wallet, list) {
  if (!wallet) return '';
  if (wallet.label && String(wallet.label).trim()) return labelShown(wallet.label);
  const i = (list || []).findIndex(w => w.id === wallet.id);
  return t('msg.wallets.wallet_n', [i >= 0 ? i + 1 : 1]);
}

/* the network as a badge: nothing for mainnet */
export function networkBadge(network) {
  return network && network !== 'mainnet' ? network.charAt(0).toUpperCase() + network.slice(1) : '';
}

/* a wallet's own folder, the one Open wallet folder and Show in folder open: where its seed is
   (<root>/wallets/<id> for a wallet made here; the older app's folder for an imported or added one) */
export function walletFolderOf(wallet) {
  return (wallet && (wallet.dataDir || wallet.configDir)) || '';
}

/* where the add flows come back to: Settings › All wallets with a wallet open, else Welcome */
export function addBackRoute(from, store) {
  return from === 'settings' && isLoggedIn(store) ? { name: 'wallets' } : { name: 'new' };
}

/* a folder for a secondary line: its last segments, '…/' in front when shortened */
export function folderTail(dir, segments = 3) {
  const parts = String(dir || '').split(/[\\/]+/).filter(Boolean);
  return (parts.length > segments ? '…/' : '') + parts.slice(-segments).join('/');
}

/* a folder as one line: under the user's home as ~/… (the home is the folder that holds .epic),
   then shortened in the middle to at most max characters (the full path goes in a title) */
export function shortFolder(dir, configService, max = 46) {
  let s = String(dir || '');
  const epicDir = configService && configService.paths && configService.paths.legacy && configService.paths.legacy.epicDir;
  const home = epicDir ? epicDir.replace(/[\\/]\.epic[\\/]?$/, '') : '';
  if (home && home !== epicDir && s.startsWith(home) && /[\\/]/.test(s.charAt(home.length))) {
    s = '~' + s.slice(home.length);
  }
  if (s.length <= max) return s;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.4);
  return s.slice(0, head) + '…' + s.slice(s.length - (keep - head));
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return (i === 0 ? String(v) : v.toFixed(v < 10 ? 1 : 0)) + ' ' + units[i];
}

/* a date (ISO string or ms) as the user's locale writes it; '' when unknown */
export function formatDate(value, locale) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(locale || undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return d.toISOString().slice(0, 10);
  }
}

/* the first-start scan App.vue ran, handed to the found screen so it does not scan twice */
let firstRunScan = null;
export function keepScan(scan) { firstRunScan = scan; }
export function takeScan() { const s = firstRunScan; firstRunScan = null; return s; }

/* a wallet is open in this window (the store holds its User row) */
export function isLoggedIn(store) {
  const u = store && store.state && store.state.user;
  return !!(u && Object.keys(u).length);
}

/* a wallet just added to the list starts with no IndexedDB rows: its id may have been used before
   (settings.json lost or deleted by hand while <root>/app survived), and a new wallet must never show
   that wallet's contacts. Create, Restore and Open a wallet folder call it (the importer does the same
   itself); a failure is logged only, the wallet is listed and works. → true when cleared */
export async function clearStaleUser(userService, walletId) {
  try {
    const n = await userService.removeUser(walletId);
    if (n && n.User) console.log('[wallets] ' + walletId + ': rows of an earlier wallet with this id removed ' + JSON.stringify(n));
    return true;
  } catch (e) {
    console.log('[wallets] ' + walletId + ': old rows not removed: ' + (e && e.message ? e.message : e));
    return false;
  }
}

/* the language a new User row gets: the app's choice, else the language the window runs in */
export function appLocale(configService) {
  try {
    const app = configService.settings.app();
    if (app && app.locale) return app.locale;
  } catch (e) { /* settings unreadable */ }
  return i18n.global.locale || 'en';
}

/*
 * Opening a wallet with its password: Login, and Create / Restore right after they made the
 * wallet. The stages show in store.state.loginStage (StartupProgress, StageList).
 */
export const walletOpen = {
  data() {
    //old wallet processes were found and are being closed: show that step too
    //walletOpened: the owner API took the password (a failure after it is not a wrong password)
    return { closingProcesses: false, walletOpened: false };
  },
  computed: {
    //what has to happen before the dashboard; the node, listeners and balance refresh follow in the background
    stages() {
      return [
        { key: 'check', label: this.$t('msg.login.stage_check') },
        { key: 'processes', label: this.$t('msg.login.stage_processes') },
        ...(this.closingProcesses ? [{ key: 'closing', label: this.$t('msg.login.stage_closing') }] : []),
        { key: 'wallet', label: this.$t('msg.login.stage_wallet') },
        { key: 'unlock', label: this.$t('msg.login.stage_unlock') },
      ];
    },
  },
  methods: {
    /* check the wallet's files, close leftover processes, then open the wallet.
       'opened' | 'missing' (its folder is gone) | 'failed' (the reason was shown in a toast) */
    async openWallet(walletId, password) {
      const started = performance.now();
      const lap = (step) => console.log('[login] ' + step + ' +' + Math.round(performance.now() - started) + ' ms');
      const store = this.$store;
      this.closingProcesses = false;
      this.walletOpened = false;

      store.commit('loginStage', 'check');
      const action = await this.configService.startCheck(walletId);
      lap('config checked: ' + action);
      if (action === 'missing') {
        store.commit('loginStage', '');
        return 'missing';
      }
      if (action !== 'login') {
        store.commit('loginStage', '');
        throw new Error(this.$t('msg.wallets.check_failed', [action]));
      }

      //App has started - first close running wallet and node server process
      store.commit('loginStage', 'processes');
      const processKilled = await this.configService.killEpicProcess();
      lap('process scan');
      //no owner_api is left, so walletService.start can skip its own scan: nothing was found, or
      //everything found was killed and its ports are free; otherwise (kept or not killed) it scans again
      let knownNotRunning = processKilled === null;
      if (processKilled) {
        //wait until the closed processes released their ports, not a fixed 5 s
        this.closingProcesses = true;
        store.commit('loginStage', 'closing');
        const portsFree = await this.configService.waitForKilledPorts();
        knownNotRunning = this.configService.allKilled && portsFree;
        lap('old processes closed');
      }

      //the User row (store, contacts) of this wallet, made on its first login: written only once
      //the password is verified. Until then the store holds it unsaved (the start reads nodeInternal)
      const cfg = this.configService.config || {};
      const wallet = this.configService.wallet || {};
      const userFields = {
        name: wallet.label || '',
        language: appLocale(this.configService),
        nodeInternal: !!cfg.nodeInternal,
        epicbox_domain: cfg.epicbox_domain || '',
      };
      const userBefore = store.state.user;
      store.commit('user', pendingUser(walletId, await this.$userService.getUser(walletId), userFields));

      const saveUser = async () => {
        const user = await this.$userService.ensureUser(walletId, userFields);
        if (user) store.commit('user', user);
      };
      let opened = false;
      try {
        opened = await this.startWallet(password, knownNotRunning, lap, saveUser);
      } finally {
        //a wrong password (or any failure) leaves the store as it was
        if (!opened) store.commit('user', userBefore || {});
      }
      if (!opened) return 'failed';
      //the wallet used last is the one Unlock offers next time
      try {
        if (this.configService.settings.defaultWalletId() !== walletId) this.configService.settings.setDefaultWallet(walletId);
      } catch (e) { /* the list changed meanwhile: keep the old default */ }
      return 'opened';
    },

    /* start the node and the wallet api, then log in.
       Only opening the wallet is waited for: the node check, the listeners and the first balance
       refresh run after the dashboard is shown, with their status there (App.vue).
       opened: run once the password is verified, before the dashboard (openWallet saves the User row) */
    async startWallet(password, knownNotRunning, lap = () => {}, opened = async () => {}) {
      const store = this.$store;
      //the node starts (or is checked) alongside, it is not waited for
      this.emitter.emit('app.nodeStart');

      store.commit('loginStage', 'wallet');
      const canLogin = await this.$walletService.start(password, false, knownNotRunning, (stage) => {
        store.commit('loginStage', stage);
        lap('wallet service started');
      });
      lap(canLogin && canLogin.success ? 'wallet opened' : 'wallet not opened');
      store.commit('loginStage', '');

      if (canLogin && canLogin.success) {
        this.walletOpened = true;
        try {
          await opened();
        } catch (e) {
          //open but not logged in: close it again, the main process forgets the password
          await window.nodeChildProcess.clearSessionPassword().catch(() => {});
          //stopped before a retry can meet the owner API still stopping
          await Promise.resolve(this.$walletService.stopWallet()).catch(() => {});
          this.$walletService.token = undefined;
          throw e;
        }
        this.emitter.emit('app.accountLoggedIn');
        //HTTP listener, then Epicbox once the node has synced (the main process has the password)
        this.emitter.emit('app.startListeners');
        return true;
      }
      this.$walletService.stopWallet();
      const msg = canLogin && canLogin.msg;
      this.$toast.error(canLogin && canLogin.portInUse ? this.$t('msg.login.port_in_use', [canLogin.portInUse])
        : (msg && msg.message ? msg.message : String(msg || this.$t('msg.wallets.open_failed'))));
      return false;
    },

    /* a wallet is open (Settings › Add a wallet): close it the way Lock does, staying on this page */
    logoutCurrent() {
      if (!isLoggedIn(this.$store)) return Promise.resolve();
      return new Promise((resolve) => this.emitter.emit('app.logout', { stay: true, done: resolve }));
    },

    /* a wallet was added (Create, Restore, a wallet folder, an older Epic Wallet's wallet): the wallet
       open now is locked first, as Lock does (its processes stopped), the new one becomes the default
       and Unlock opens with it chosen. Every way of adding lists a new wallet next to the others:
       nothing in the list is replaced (configService.registerWallet) */
    async unlockAdded(walletId) {
      await this.logoutCurrent();
      try {
        if (this.configService.settings.defaultWalletId() !== walletId) this.configService.settings.setDefaultWallet(walletId);
      } catch (e) {
        console.log('[wallets] ' + walletId + ' not made the default: ' + (e && e.message ? e.message : e));
      }
      this.$router.push({ name: 'login', query: { wallet: walletId, added: '1' } });
    },
  },
};

/*
 * Add an existing wallet › From a wallet folder (AddExisting.vue): pick a folder, which the
 * main process works out to the wallet folder(s) it means (shared/walletFolder.js); one wallet opens
 * at once (configService.openExistingWallet), several or none show WalletFolderPick (a choice, or
 * what a wallet folder is). When a wallet's network can't be told, ask for it and try again.
 * folderOpened(wallet) is called on success (each screen decides where to go).
 */
export const walletFolder = {
  components: { WalletFolderPick },
  data() {
    return {
      folderError: '',
      //the folder whose network has to be chosen: {dir}
      folderAsk: null,
      folderNetwork: 'mainnet',
      folderBusy: false,
      //what was picked when it isn't exactly one wallet: {picked, wallets: [{dir, network}], chainOnly}
      folderPick: null,
    };
  },
  methods: {
    async pickWalletFolder() {
      this.folderError = '';
      this.folderAsk = null;
      //Choose another folder: the picker closes, so focus goes back to the screen's button
      const hadPick = !!this.folderPick;
      this.folderPick = null;
      let r;
      try {
        r = await window.api.pickWalletFolder(t('msg.wallets.folder_dialog_title'));
      } catch (e) {
        this.folderError = e && e.message ? e.message : String(e);
        if (hadPick) this.focusFolderButton();
        return;
      }
      if (!r || r.canceled) {
        if (hadPick) this.focusFolderButton();
        return;
      }
      const wallets = Array.isArray(r.wallets) ? r.wallets.filter(w => w && typeof w.dir === 'string' && w.dir) : [];
      if (wallets.length === 1 && !r.chainOnly) {
        await this.openWalletFolder(wallets[0].dir, wallets[0].network || undefined);
        return;
      }
      this.folderPick = { picked: String(r.picked || ''), wallets, chainOnly: !!r.chainOnly };
    },
    /* WalletFolderPick's Cancel */
    folderPickCancel() {
      this.folderPick = null;
      this.focusFolderButton();
    },
    /* the screen's From a wallet folder button (ref folderButton) */
    focusFolderButton() {
      this.$nextTick(() => {
        const b = this.$refs.folderButton;
        if (b && b.focus) b.focus();
      });
    },
    /* WalletFolderPick: the wallet chosen from what was picked */
    async folderPicked(w) {
      this.folderPick = null;
      if (w && w.dir) await this.openWalletFolder(w.dir, w.network || undefined);
    },
    async openWalletFolder(dir, network) {
      this.folderBusy = true;
      this.folderError = '';
      try {
        const r = await this.configService.openExistingWallet(dir, network);
        if (r && r.ok && r.wallet) {
          this.folderAsk = null;
          await clearStaleUser(this.$userService, r.wallet.id);
          await this.folderOpened(r.wallet);
          return;
        }
        const reason = r && r.reason || '';
        if (reason === 'network' && !network) {
          this.folderAsk = { dir };
          return;
        }
        this.folderError = this.folderReason(reason, dir);
      } catch (e) {
        this.folderError = e && e.message ? e.message : String(e);
      } finally {
        this.folderBusy = false;
      }
    },
    folderWithNetwork() {
      if (this.folderAsk) this.openWalletFolder(this.folderAsk.dir, this.folderNetwork);
    },
    folderReason(reason, dir) {
      switch (reason) {
        case 'noseed': return this.$t('msg.wallets.folder_noseed', [dir]);
        case 'listed': return this.$t('msg.wallets.folder_listed');
        case 'inuse': return this.$t('msg.wallets.folder_inuse');
        case 'network': return this.$t('msg.wallets.folder_network');
        case 'readonly': return this.$t('msg.wallets.settings_readonly');
        default: return this.$t('msg.wallets.folder_failed', [reason || '?']);
      }
    },
    //override in the screen
    async folderOpened() {},
  },
};
