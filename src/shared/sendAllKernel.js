/*
 * A send of everything ("Send all") stays "Waiting for confirmations" in epic-wallet (QA T03): it marks
 * a send confirmed when its change output shows up on chain, and a send-all has none. For that case
 * only, the GUI asks the node's public foreign API where the tx's kernel is (get_kernel) and shows the
 * tx as mined at that height. Display only: nothing is written to the wallet, and when the node can't
 * answer the tx keeps waiting. Plain ESM (tests/sendAllKernel.test.js).
 */
import { defaultNodeFetch } from './nodeFetch.js';

//at most one lookup per tx this often (the Activity refresh runs more often)
export const KERNEL_RECHECK_MS = 60 * 1000;
//how far before the send the lookup starts, in blocks (a minute each): a day, for clock and tip differences
const MIN_HEIGHT_MARGIN = 1440;

/* the wallet holds nothing spendable or on its way: every output is spent, or locked by a send */
export function walletEmpty(outputs) {
  return !(outputs || []).some(o => o && (o.status === 'Unspent' || o.status === 'Unconfirmed'));
}

/*
 * The one case the lookup is for: a posted send epic-wallet still shows as waiting (TxSentMempool,
 * not confirmed), with a kernel to look up, no output of its own (no change), and nothing left in the
 * wallet after it. A send with change keeps epic-wallet's status.
 */
export function needsKernelCheck(tx, outputs) {
  if (!tx || tx.tx_type !== 'TxSentMempool' || tx.confirmed) return false;
  if (!/^[0-9a-f]{66}$/.test(String(tx.kernel_excess || ''))) return false;
  const own = (outputs || []).some(o => o && o.tx_log_entry !== null && o.tx_log_entry !== undefined && Number(o.tx_log_entry) === Number(tx.id));
  return !own && walletEmpty(outputs);
}

/* the txs to look up now: in the case above, not found in a block yet, not looked up in the last minute */
export function kernelsDue(txs, outputs, { found = {}, checked = {}, now = Date.now() } = {}) {
  return (txs || []).filter(tx => needsKernelCheck(tx, outputs)
    && !(Number(found[tx.id]) > 0)
    && !(now - (checked[tx.id] || 0) < KERNEL_RECHECK_MS));
}

/* the lowest height to search from: the send's time counted back from the tip, a day earlier still */
export function minHeightFor(tx, tip, now = Date.now()) {
  const t = Date.parse(tx && tx.creation_ts);
  const h = Number(tip) || 0;
  if (!(h > 0) || isNaN(t)) return null;
  const blocks = Math.max(0, Math.ceil((now - t) / 60000));
  return Math.max(0, h - blocks - MIN_HEIGHT_MARGIN);
}

/* get_kernel's reply -> the height the kernel is in, 0 when it is not in a block (yet), null when the
   node gave no usable answer */
export function kernelHeight(reply) {
  const r = reply && reply.result;
  if (!r) return null;
  if (r.Err === 'NotFound') return 0;
  const h = r.Ok && Number(r.Ok.height);
  return h > 0 ? h : null;
}

/* ask the node: the height, 0 (not in a block) or null (no answer) */
export async function fetchKernelHeight(address, excess, minHeight, { fetch: fetchFn = defaultNodeFetch(), timeoutMs = 10000 } = {}) {
  const base = String(address || '').replace(/\/+$/, '');
  try {
    const res = await fetchFn(base + '/v2/foreign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, timeoutMs,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_kernel', params: [excess, minHeight, null] }),
    });
    if (!res.ok) return null;
    return kernelHeight(await res.json());
  } catch (e) {
    return null;
  }
}
