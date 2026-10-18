/* Is the balance on screen checked against the node (store walletSync), and when to refresh next.
   walletSync: 'loading' (nothing read yet), 'synced' (the wallet refreshed from the node),
   'local' (only the wallet's last known state), 'error' (wallet API unreachable). */

//an owner API call of the refresh loop that has not answered by then has failed: without a limit one
//stuck call stopped the loop for good and the balance stayed "last known" until the next login
export const REFRESH_CALL_TIMEOUT = 120 * 1000;
export const REFRESH_INTERVAL = 60 * 1000;
//a refresh that could not reach the node or the wallet, or a pending transaction: try again soon
export const REFRESH_RETRY_INTERVAL = 15 * 1000;

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

/* delay before the next refresh. failed: the last refresh got no answer from the wallet */
export function nextRefreshDelay({ walletSync, node, failed, pendingTx }){
  if(failed || pendingTx || needsNodeRefresh(walletSync, node)){
    return REFRESH_RETRY_INTERVAL;
  }
  return REFRESH_INTERVAL;
}
