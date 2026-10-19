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
 * USABLE: what is offered. Evidence (checked 2026-10-19, EpicCash/epic source and runs of the Linux
 * nodes older GUIs bundled: 3.0.0 in 4.0–5.0, 3.3.2/3.4.0 in 5.1, 3.4.0/3.5.0 in 5.2, 3.6.0 in
 * 5.3–6.0, 4.1.0-1 in 6.1):
 * - The chain store is the same in 3.0.0 and 4.1.0-1 (chain/src/store.rs keys unchanged, the one
 *   migration migrate_db_v1_v2 in every version). 4.1.0-1 opened chains made by 3.0.0, 3.3.2,
 *   3.4.0, 3.5.0 and 3.6.0; a mainnet chain went 3.6.0 → 4.1.0 → 3.6.0 → 4.1.0 and kept syncing.
 *   No file tells which node wrote a chain, and none has to: every one is offered.
 * - Nodes 3.0.0 and 3.3.2 had a fork at 2,600,000 that 3.4.0 moved; their chains stop near there.
 *   That part is still the main chain, so 4.1.0 syncs on from it.
 * - The layout every node writes: lmdb/data.mdb, header/header_head/pmmr_hash.bin and
 *   txhashset/{kernel,output,rangeproof} (shared/legacyScan.js scanChains requires them).
 * - Mainnet: at least MIN_MAINNET_HEADERS bytes of header hashes (about 64 bytes a header), so a node
 *   stopped right after it started isn't offered. Floonet and usernet: any headers.
 *   lmdb/data.mdb is not a measure: on Windows LMDB sizes the file to its map size, empty or not.
 *   An empty txhashset (headers only) is still offered: the headers alone save most of the sync.
 * - chain_data/epic.lock stays on disk after the node exits, so it says nothing; a node still
 *   running on the folder is refused by the node itself ("epic server already running?").
 * Not verified: a full txhashset written by an old node, and old chains on Windows or macOS.
 */
export const MIN_MAINNET_HEADERS = 64 * 1000;

export function usableChain(chain, network) {
  if (!chain || typeof chain.dir !== 'string' || !chain.dir || chain.network !== network) return false;
  const headers = Number(chain.headerBytes) || 0;
  return network === 'mainnet' ? headers >= MIN_MAINNET_HEADERS : headers > 0;
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
