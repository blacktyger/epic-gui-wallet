/*
 * A send that is still waiting for the recipient's reply (the slate they sign and send back):
 * created and its coins locked, not finalized, a few minutes old. Over Epicbox the reply can get
 * lost or the recipient may be offline; the tx list then says so, next to its Cancel action.
 * Plain ESM (tests/txWaiting.test.js).
 */

export const REPLY_WAIT_MS = 3 * 60 * 1000;

const SENT_UNFINALIZED = ['TxSent', 'TxSentCreated'];

/* tx: a retrieve_txs entry; now: ms */
export function waitingForReply(tx, now, waitMs = REPLY_WAIT_MS) {
  if (!tx || tx.confirmed || !SENT_UNFINALIZED.includes(tx.tx_type)) return false;
  //finalized (posted, waiting to be mined): the kernel is known
  if (tx.kernel_excess) return false;
  //a file send waits for the response file, which the list already says
  if (tx.address && tx.address.type == 'file') return false;
  const created = Date.parse(tx.creation_ts);
  return Number.isFinite(created) && now - created >= waitMs;
}
