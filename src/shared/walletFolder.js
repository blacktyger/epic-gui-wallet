/*
 * Open a wallet folder: what the user picked in the folder dialog, worked out to the wallet
 * folder(s) it means. Users pick the folder they remember (~/.epic, wallet_data, chain_data),
 * not always the one that holds wallet_data/wallet.seed. Read only. Plain ESM, fs and path
 * passed in (tests/walletFolder.test.js runs the Windows rules on Linux).
 *
 *   the folder itself              it holds wallet_data/wallet.seed
 *   a folder inside a wallet       wallet_data, chain_data, wallet_tor, wallet_data/db, …: that wallet
 *   ~/.epic or an older userhomedir its main / floo / user folders, and the accounts in them (3.0
 *                                  layout <net>/<account>, 4.x layout <account>/<net>)
 *   chain_data alone               chainOnly: blockchain data, not a wallet; the wallet next to it, if any
 */
import { netFromShort } from './appPaths.js';
import { tomlNetwork } from './walletToml.js';

const SHORTS = ['main', 'floo', 'user'];
//folders a wallet keeps inside its own folder: picking one of them means the wallet
const WALLET_PARTS = ['wallet_data', 'chain_data', 'wallet_tor'];
//how far up a picked folder may be inside a wallet (wallet_data/db/sqlite is 3)
const UP_LEVELS = 4;
//folders read below the picked one, at most: a picked drive root must never stall the dialog
const READ_LIMIT = 400;

function tryDo(fn, fallback) {
  try { return fn(); } catch (e) { return fallback; }
}

/*
 * fs: node's fs (sync calls); pathMod: path for the platform; picked: the folder from the dialog.
 * → { canceled: false, picked, wallets: [{dir, network}], chainOnly }
 * network is '' when neither the folder names nor the wallet's toml tell it (Open then asks).
 */
export function resolveWalletFolder({ fs, pathMod, picked }) {
  const win = pathMod.sep === '\\';
  const norm = (p) => win ? p.toLowerCase() : p;
  const isWallet = (d) => tryDo(() => fs.existsSync(pathMod.join(d, 'wallet_data', 'wallet.seed')), false);
  const isChain = (d) => tryDo(() => fs.existsSync(pathMod.join(d, 'lmdb')), false);
  let reads = 0;
  const subdirs = (d) => {
    if (++reads > READ_LIMIT) return [];
    return tryDo(() => fs.readdirSync(d, { withFileTypes: true }), [])
      .filter(e => e.isDirectory()).map(e => pathMod.join(d, e.name));
  };

  const dir = pathMod.resolve(String(picked || ''));
  const wallets = [];
  const seen = new Set();
  const add = (d) => {
    const key = norm(tryDo(() => fs.realpathSync(d), d));
    if (seen.has(key)) return;
    seen.add(key);
    wallets.push({ dir: d, network: networkOf(fs, pathMod, d) });
  };
  const base = norm(pathMod.basename(dir));

  //chain_data (or any folder with lmdb/ and no wallet): say what it is, offer the wallet next to it
  if (!isWallet(dir) && (base === 'chain_data' || isChain(dir))) {
    const parent = pathMod.dirname(dir);
    if (parent !== dir && isWallet(parent)) add(parent);
    return { canceled: false, picked: dir, wallets, chainOnly: true };
  }

  if (isWallet(dir)) {
    add(dir);
    return { canceled: false, picked: dir, wallets, chainOnly: false };
  }

  //~/.epic, an older app's userhomedir, a folder of wallets: the wallets one and two levels down
  //(two only through a network folder, the layouts the older apps used)
  if (!WALLET_PARTS.includes(base)) {
    for (const child of subdirs(dir)) {
      const name = norm(pathMod.basename(child));
      if (isWallet(child)) add(child);
      for (const grand of subdirs(child)) {
        if ((SHORTS.includes(name) || SHORTS.includes(norm(pathMod.basename(grand)))) && isWallet(grand)) add(grand);
      }
    }
    if (wallets.length) return { canceled: false, picked: dir, wallets, chainOnly: false };
  }

  //a folder inside a wallet (wallet_data, wallet_data/db, wallet_tor, …): the nearest wallet above it
  let d = dir;
  for (let i = 0; i < UP_LEVELS; i++) {
    const up = pathMod.dirname(d);
    if (up === d) break;
    d = up;
    if (isWallet(d)) {
      add(d);
      break;
    }
  }
  return { canceled: false, picked: dir, wallets, chainOnly: false };
}

/* the network a wallet folder is on: its name or its parent's (main, floo, user), else its toml */
function networkOf(fs, pathMod, dir) {
  const short = [pathMod.basename(dir), pathMod.basename(pathMod.dirname(dir))].find(n => SHORTS.includes(n));
  return (short && netFromShort(short))
    || tomlNetwork(tryDo(() => fs.readFileSync(pathMod.join(dir, 'epic-wallet.toml'), 'utf8'), ''));
}
