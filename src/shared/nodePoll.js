/*
 * How often the app asks the node for its status (App.vue startRefreshNode). A public node serves
 * every wallet out there, so a remote node is asked less often than one on this computer, less
 * again while the window is hidden or minimized, and a node that does not answer is asked less and
 * less often (a node out of connections or file handles gets no extra load from us).
 * Epic makes a block a minute: every 30 s still sees each new block in time for the refresh it
 * triggers. Plain ESM (tests/nodePoll.test.js).
 */

export const NODE_POLL = {
  remote: { visible: 30 * 1000, hidden: 2 * 60 * 1000 },
  //the built-in node (or one on this computer): its sync progress and the stall check want it often
  local: { visible: 10 * 1000, hidden: 60 * 1000 },
};
//the longest wait between two tries of a node that does not answer
export const NODE_POLL_MAX_BACKOFF = 5 * 60 * 1000;

/* the delay before the next status poll.
   local: the node is on this computer; hidden: the window is hidden or minimized;
   failures: polls in a row that got no status (0 after one that did) */
export function nextNodePollDelay({ local = false, hidden = false, failures = 0 } = {}) {
  const p = local ? NODE_POLL.local : NODE_POLL.remote;
  const base = hidden ? p.hidden : p.visible;
  const n = Math.max(0, Math.floor(Number(failures) || 0));
  if (!n) return base;
  //twice as long after each failure in a row, never over the cap (nor under the normal delay)
  return Math.max(base, Math.min(base * 2 ** Math.min(n - 1, 10), NODE_POLL_MAX_BACKOFF));
}
