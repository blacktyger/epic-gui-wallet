/* Is the balance on screen checked against the node (store walletSync), and when to refresh next.
   walletSync: 'loading' (nothing read yet), 'synced' (the wallet refreshed from the node),
   'local' (only the wallet's last known state), 'error' (wallet API unreachable). */

//an owner API call of the refresh loop that has not answered by then has failed: without a limit one
//stuck call stopped the loop for good and the balance stayed "last known" until the next login
export const REFRESH_CALL_TIMEOUT = 120 * 1000;
export const REFRESH_INTERVAL = 60 * 1000;
//a refresh that could not reach the node or the wallet, or a pending transaction: try again soon
export const REFRESH_RETRY_INTERVAL = 15 * 1000;
//the window hidden or minimized: a new block still refreshes it at once (App.nodeStatus)
export const REFRESH_HIDDEN_INTERVAL = 5 * 60 * 1000;
//a wallet the node could not update is tried again after 15 s, 30 s, 1 min, then every 2 min
export const NODE_RETRY_MAX = 2 * 60 * 1000;
//a refresh at the same tip reads the wallet's own state; the node is asked again after this anyway
export const NODE_REFRESH_MAX_AGE = 10 * 60 * 1000;

/* the node status (store nodeStatus) has been checked: synced, syncing or unreachable.
   {} while App.nodeStart checks it again, e.g. right after Settings were saved */
export function nodeStatusKnown(node){
  return !!(node && (node.error || node.sync_status));
}

/* walletSync after retrieve_summary_info answered.
   refreshed: its first value (the wallet updated from the node); askedNode: refresh_from_node was set */
export function walletSyncAfterSummary(current, refreshed, askedNode, node){
  if(refreshed){
    return 'synced';
  }
  //a read that did not ask the node because its status was being checked again (Settings or the
  //Setup Assistant saved) says nothing about the node: the balance is still the one it confirmed
  if(!askedNode && !nodeStatusKnown(node) && current == 'synced'){
    return 'synced';
  }
  return 'local';
}

/* the balance is not confirmed by the node yet while the node is synced: refresh again as soon
   as the node check sees it (App.nodeStatus) */
export function needsNodeRefresh(walletSync, node){
  return walletSync == 'local' && !!node && !node.error && node.sync_status == 'synced';
}

/* does this refresh ask the node (refresh_from_node)? Each one makes epic-wallet fetch every output
   of the wallet from the node (get_outputs in batches), so only when that can tell something new:
   the node is synced and its tip moved since the last refresh that updated from it, or that one is
   NODE_REFRESH_MAX_AGE old, or force (the user asked). Coins only change state with a new block;
   what the listener receives or a send creates is in the wallet already, a local read shows it.
   node: store nodeStatus; last: {tip, at} of the last refresh the node answered, or null */
export function refreshFromNode({ node, last, now = Date.now(), force = false }){
  if(!node || node.error || node.sync_status != 'synced'){
    return false;
  }
  const tip = node.tip ? Number(node.tip.height) || 0 : 0;
  if(force || !last || !tip || last.tip !== tip){
    return true;
  }
  return !(now - last.at < NODE_REFRESH_MAX_AGE);
}

/* delay before the next refresh. failed: the last refresh got no answer from the wallet;
   hidden: the window is hidden or minimized; nodeRetries: refreshes in a row the node could not
   update (needsNodeRefresh), each one a full output query, so they back off */
export function nextRefreshDelay({ walletSync, node, failed, pendingTx, hidden = false, nodeRetries = 0 }){
  if(failed){
    return REFRESH_RETRY_INTERVAL;
  }
  if(needsNodeRefresh(walletSync, node)){
    const n = Math.max(0, Math.floor(Number(nodeRetries) || 0));
    return Math.min(REFRESH_RETRY_INTERVAL * 2 ** Math.min(Math.max(n - 1, 0), 10), NODE_RETRY_MAX);
  }
  //a pending transaction: local reads (refreshFromNode), the tip moving asks the node
  if(pendingTx){
    return REFRESH_RETRY_INTERVAL;
  }
  return hidden ? REFRESH_HIDDEN_INTERVAL : REFRESH_INTERVAL;
}
