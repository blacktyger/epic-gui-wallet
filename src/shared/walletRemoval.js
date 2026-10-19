/*
 * Removing a wallet: what may be removed, and removing exactly that. Plain ESM, fs and path passed
 * in (tests/walletRemoval.test.js runs it on a fake fs, Windows rules via path.win32).
 *
 * Three choices (configService.removeWallet runs them, components/removalPlan.js asks):
 *   'list'        the settings.json entry only; every file stays
 *   'app'         this app's files for it in <root>/wallets/<id> (APP_FILES, *.tmp, wallet_tor/),
 *                 never wallet_data; the folder goes when nothing else is left in it
 *   'everything'  'app' and wallet_data (the seed): <root>/wallets/<id> is gone
 *
 * 'app' and 'everything' need a folder that is provably this app's own (planRemoval); an imported
 * or opened wallet's data folder (an older GUI's or the CLI's) is never touched.
 *
 * fs: only existsSync, lstatSync (isFile, isDirectory, isSymbolicLink: the renderer gets a plain
 * object), readdirSync, unlinkSync, rmdirSync, realpathSync. Symlinks are never followed: a
 * symlink is unlinked, its target stays.
 */

export const MODES = ['list', 'app', 'everything'];

//what this app writes into a wallet's config folder (configService: toml, secrets, WALLET.txt; epic-wallet: log)
export const APP_FILES = ['epic-wallet.toml', '.owner_api_secret', '.api_secret', 'epic-wallet.log', 'WALLET.txt'];
const TOR_DIR = 'wallet_tor';
const DATA_DIR = 'wallet_data';
const SEED = 'wallet.seed';

const tryDo = (f, fallback) => { try { return f(); } catch (e) { return fallback; } };

/* a path as the OS compares it: resolved, through symlinks when it exists, any case on Windows */
function comparer(fs, pathMod) {
  const win = pathMod.sep === '\\';
  const norm = (p) => win ? p.toLowerCase() : p;
  const real = (p) => norm(tryDo(() => fs.realpathSync(pathMod.resolve(p)), pathMod.resolve(p)));
  /* is a the folder b, or inside it */
  const within = (a, b) => {
    const rel = pathMod.relative(b, a);
    return rel === '' || (!rel.startsWith('..') && !pathMod.isAbsolute(rel));
  };
  //equal, inside or containing: the two folders overlap
  const overlaps = (a, b) => within(a, b) || within(b, a);
  return { norm, real, within, overlaps };
}

const lstat = (fs, p) => tryDo(() => fs.lstatSync(p), null);

/*
 * What may be removed for a wallet. Nothing is changed here.
 *   wallet          the record to remove (settingsStore)
 *   wallets         every valid wallet in the list (the one to remove may be in it)
 *   invalidWallets  the records settingsStore could not read (their folders count too)
 *   paths           configService.paths: walletsDir, legacy.epicDir
 *   chainDirs       the built-in node's chain_data folders in use (settings node.<net>.chainDir)
 *   openId          the wallet open in this window ('' when none)
 *   running         our epic processes that use this wallet (ownedProcesses), [] when none
 *   folderMissing   its data folder is gone (Unlock): 'everything' is not offered
 * → { canList, canAppFiles, canEverything, reasons: {appFiles, everything}: {key, path} | null,
 *     appFiles: [exact paths], dir, dirReal, seedFile }
 * reason keys: open, running, notours, shared, legacy, imported, separate, chain, missing
 */
export function planRemoval({ wallet, wallets = [], invalidWallets = [], paths = {}, chainDirs = [], openId = '', running = [], folderMissing = false, fs, pathMod }) {
  const { real, within, overlaps, norm } = comparer(fs, pathMod);
  const plan = {
    canList: !!wallet && wallet.id !== openId,
    canAppFiles: false, canEverything: false,
    reasons: { appFiles: null, everything: null },
    appFiles: [], dir: '', dirReal: '', seedFile: '',
  };
  if (!wallet) return plan;
  const configDir = String(wallet.configDir || ''), dataDir = String(wallet.dataDir || '');
  const fail = (key, path = '') => ({ key, path });

  //the folder this app made for the wallet: exactly <walletsDir>/<id>, a real folder (not a symlink)
  const appReason = (() => {
    if (wallet.id === openId) return fail('open');
    if (running && running.length) return fail('running');
    if (!configDir || !paths.walletsDir || !pathMod.isAbsolute(configDir)) return fail('notours', configDir);
    const expected = pathMod.join(pathMod.resolve(paths.walletsDir), wallet.id);
    if (norm(pathMod.resolve(configDir)) !== norm(expected)) return fail('notours', configDir);
    const st = lstat(fs, configDir);
    if (st && (st.isSymbolicLink() || !st.isDirectory())) return fail('notours', configDir);
    if (st && real(configDir) !== norm(pathMod.join(real(paths.walletsDir), wallet.id))) return fail('notours', configDir);
    const dir = real(configDir);
    //another wallet's folders (also a broken record's) equal, inside or around it
    const others = [...wallets.filter(w => w && w.id !== wallet.id), ...invalidWallets.filter(Boolean)];
    for (const w of others) {
      for (const k of ['configDir', 'dataDir']) {
        if (typeof w[k] === 'string' && w[k] && overlaps(real(w[k]), dir)) return fail('shared', configDir);
      }
    }
    const epicDir = paths.legacy && paths.legacy.epicDir;
    if (epicDir && overlaps(dir, real(epicDir))) return fail('legacy', configDir);
    //an imported or opened wallet's data stays where it is: its folder must not overlap ours
    if (dataDir && real(dataDir) !== dir && overlaps(real(dataDir), dir)) return fail('separate', dataDir);
    if (dataDir && real(dataDir) === dir && !['created', 'restored'].includes(wallet.origin)) return fail('separate', dataDir);
    return null;
  })();

  if (!appReason) {
    plan.canAppFiles = true;
    plan.dir = pathMod.resolve(configDir);
    plan.dirReal = real(configDir);
    const names = tryDo(() => fs.readdirSync(plan.dir), []);
    for (const name of names) {
      const isApp = APP_FILES.includes(name) || /^epic-wallet\.log\./.test(name) || /\.tmp$/.test(name) || name === TOR_DIR;
      if (isApp) plan.appFiles.push(pathMod.join(plan.dir, name));
    }
    plan.appFiles.sort();
  }
  plan.reasons.appFiles = appReason;

  //everything: the seed too, only for a wallet made in this app whose data is in that same folder
  plan.reasons.everything = (() => {
    if (appReason) return appReason;
    if (folderMissing) return fail('missing', dataDir);
    if (!['created', 'restored'].includes(wallet.origin)) return fail('imported', dataDir);
    if (real(dataDir) !== plan.dirReal) return fail('separate', dataDir);
    for (const c of chainDirs || []) {
      if (typeof c === 'string' && c && overlaps(real(c), plan.dirReal)) return fail('chain', c);
    }
    return null;
  })();
  plan.canEverything = !plan.reasons.everything;
  if (plan.canEverything) plan.seedFile = pathMod.join(plan.dir, DATA_DIR, SEED);
  return plan;
}

/*
 * Remove what the plan lists, nothing else. Each path is checked to be inside plan.dir right before
 * it goes. 'everything' removes this app's files first and wallet_data only when they all went, the
 * seed (wallet_data/wallet.seed) as the very last file: until then the wallet still opens (its toml
 * and secrets are written again at the next unlock).
 * → { removed: [paths], failed: [{path, error}], dirRemoved, seedRemoved, entrySafe }
 * entrySafe: the list entry may go. 'list': always. 'app': every listed file went (otherwise the
 * wallet is left whole and listed, so the user can try again). 'everything': the seed is gone (a
 * listed wallet without its seed would only show "folder missing").
 */
export function removeFiles(plan, mode, { fs, pathMod }) {
  const out = { removed: [], failed: [], dirRemoved: false, seedRemoved: false, entrySafe: mode === 'list' };
  if (mode === 'list') return out;
  if (mode === 'app' && !plan.canAppFiles) throw new Error('removal: this app\'s files may not be removed here');
  if (mode === 'everything' && !plan.canEverything) throw new Error('removal: this wallet may not be removed entirely');
  if (mode !== 'app' && mode !== 'everything') throw new Error('removal: unknown mode ' + mode);
  const { real, within } = comparer(fs, pathMod);

  /* strictly inside the planned folder, also after symlinks in the parents are resolved */
  const inside = (p) => {
    const abs = pathMod.resolve(p);
    if (pathMod.relative(plan.dir, abs) === '' || !within(abs, plan.dir)) return false;
    const parent = real(pathMod.dirname(abs));
    return within(parent, plan.dirReal);
  };
  const fail = (p, e) => out.failed.push({ path: p, error: String(e && (e.code || e.message) || e) });

  /* a file or a symlink: unlinked (a symlink to a folder on Windows, a junction: rmdir, which
     removes the link only); a folder: its entries, then the folder. Never follows a symlink */
  const remove = (p, skip = '') => {
    if (!inside(p)) { fail(p, 'outside ' + plan.dir); return false; }
    const st = lstat(fs, p);
    if (!st) return true;
    try {
      if (st.isSymbolicLink()) {
        try { fs.unlinkSync(p); } catch (e) { if (e && (e.code === 'EPERM' || e.code === 'EISDIR')) fs.rmdirSync(p); else throw e; }
      } else if (st.isDirectory()) {
        let ok = true;
        for (const name of fs.readdirSync(p)) {
          const child = pathMod.join(p, name);
          if (child === skip) continue;
          ok = remove(child) && ok;
        }
        //the seed only once everything else in the folder went
        if (skip && ok && lstat(fs, skip)) ok = remove(skip);
        if (!ok) return false;
        fs.rmdirSync(p);
      } else {
        fs.unlinkSync(p);
      }
      out.removed.push(p);
      return true;
    } catch (e) {
      fail(p, e);
      return false;
    }
  };

  let ok = true;
  for (const f of plan.appFiles) ok = remove(f) && ok;
  if (mode === 'everything' && ok) {
    //everything in wallet_data, the seed last (remove() takes `skip` after the rest)
    remove(pathMod.join(plan.dir, DATA_DIR), plan.seedFile);
  }
  out.seedRemoved = mode === 'everything' && !!plan.seedFile && !fs.existsSync(plan.seedFile);
  //not recursive: anything left (wallet_data after 'app', a file of someone else's) keeps the folder
  if (ok) {
    try {
      if (fs.existsSync(plan.dir) && !fs.readdirSync(plan.dir).length) { fs.rmdirSync(plan.dir); out.dirRemoved = true; }
    } catch (e) { /* kept */ }
    if (!fs.existsSync(plan.dir)) out.dirRemoved = true;
  }
  out.entrySafe = mode === 'app' ? out.failed.length === 0 : out.seedRemoved;
  return out;
}
