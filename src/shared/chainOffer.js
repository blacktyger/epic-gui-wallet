/*
 * The one-time offer of existing blockchain data when the built-in node is switched on in
 * Settings (both interfaces): "Existing blockchain data found … Use this data / Download fresh".
 * Plain ESM, no fs: the caller passes what it found (tests/chainOffer.test.js).
 *
 * settings.json keeps the answer per network, so the offer (and its scan) happens once:
 *   node.<net>.chainOffer = { checkedAt, answer: 'used' | 'declined' | 'none', dir }
 * 'none': nothing usable was found (no prompt was shown). 'used' also sets node.<net>.chainDir,
 * which the node's toml reads (db_root), the way the found screen reuses chain data.
 *
 * Which chain data the bundled node (epic 4.1.0) can use: see USABLE below.
 */

export const ANSWERS = ['used', 'declined', 'none'];

/*
 * USABLE: what is offered.
 * - lmdb/ and txhashset/ both present (shared/legacyScan.js scanChains checks that).
 * - mainnet: at least MIN_MAINNET_TXHASHSET bytes in txhashset/. A node that stopped right after it
 *   started has a few KB there; a synced mainnet chain has hundreds of MB. lmdb/data.mdb is not a
 *   measure: on Windows LMDB sizes the file to its map size, empty or not. Floonet and usernet
 *   chains are small: any txhashset data counts.
 * - older nodes' data: see the notes in the report of this change (docs in the commit); every
 *   chain_data an older GUI or CLI (epic 2.x–4.x) wrote is offered, the node upgrades it in place.
 */
export const MIN_MAINNET_TXHASHSET = 1024 * 1024;

export function usableChain(chain, network) {
  if (!chain || typeof chain.dir !== 'string' || !chain.dir || chain.network !== network) return false;
  const tx = Number(chain.txhashsetBytes) || 0;
  return network === 'mainnet' ? tx >= MIN_MAINNET_TXHASHSET : tx > 0;
}

/*
 * Whether to look for chain data now: the built-in node of this network has no data of its own
 * (ownChainExists: <root>/node/<net>/chain_data/lmdb exists), uses no other folder (chainDir) and
 * the offer was never made. settings: shared/settingsStore.js (nodeChainDir, chainOffer).
 */
export function shouldCheck(settings, network, ownChainExists) {
  if (!settings || !network || ownChainExists) return false;
  if (settings.nodeChainDir(network)) return false;
  const done = settings.chainOffer(network);
  return !(done && ANSWERS.includes(done.answer));
}

/*
 * The chain data to offer for a network, or null: the most recently written usable one, the larger
 * one when two were written at the same time. others: how many more usable ones there are.
 * → { chain: {dir, network, bytes, modified}, others } | null
 */
export function pickOffer(chains, network) {
  const list = (Array.isArray(chains) ? chains : []).filter(c => usableChain(c, network));
  if (!list.length) return null;
  list.sort((a, b) => ((Number(b.modified) || 0) - (Number(a.modified) || 0)) || ((Number(b.bytes) || 0) - (Number(a.bytes) || 0)));
  return { chain: list[0], others: list.length - 1 };
}

/* what settings.json keeps: answer 'used' | 'declined' | 'none'; dir: the chain data shown */
export function offerRecord(answer, dir = '', now = new Date()) {
  if (!ANSWERS.includes(answer)) throw new Error('unknown answer ' + answer);
  return { checkedAt: now.toISOString(), answer, dir: answer === 'none' ? '' : String(dir || '') };
}
