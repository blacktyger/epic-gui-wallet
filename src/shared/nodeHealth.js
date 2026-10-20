/*
 * Is the node at the network tip? The node's status compared with the public node list
 * (shared/nodeDirectory.js, status.btlabs.uk). Pure functions, no Electron or DOM imports, so they
 * run under `node --test` (tests/nodeHealth.test.js).
 *
 * Nodes (public ones often) report sync_status 'awaiting_peers' while at the tip with plenty of
 * peers; the wallet then showed "Syncing 0%" and kept Epicbox off. And a node can say no_sync while
 * far below the tip. The list gives the network tip to check both against.
 */

//a node at most this many blocks below the network tip is at the tip (a block a minute)
export const NODE_TIP_TOLERANCE = 2;
//the median of this many highest healthy nodes is the network tip: one bad entry can't move it
export const REFERENCE_TOP = 3;
//checks in a row behind before the wallet says so (no flicker on a block or two of delay)
export const BEHIND_CONFIRMATIONS = 2;

//states in which a node says it is done (or only waiting), not syncing with its own progress
const SETTLED_STATES = ['no_sync', 'awaiting_peers'];

const height = (v) => (Number.isSafeInteger(v) && v > 0 ? v : 0);

/*
 * The network tip from a node list (parseDirectory's shape): the median of the REFERENCE_TOP
 * highest heights of healthy nodes (of two, the lower), else the list's own network tip_height,
 * else 0 (unknown).
 */
export function directoryReferenceHeight(dir){
  if(!dir || typeof dir !== 'object'){
    return 0;
  }
  const heights = (Array.isArray(dir.nodes) ? dir.nodes : [])
    .filter((n) => n && n.state === 'healthy')
    .map((n) => height(n.height))
    .filter((h) => h > 0)
    .sort((a, b) => b - a)
    .slice(0, REFERENCE_TOP);
  if(heights.length){
    return heights[Math.floor(heights.length / 2)];
  }
  return height(dir.tipHeight);
}

/*
 * A node status (GET /v1/status shape, built from the foreign API: nodeVersion.js) checked against the network tip referenceHeight (0: unknown).
 *  - at the tip (at most NODE_TIP_TOLERANCE below) with peers (or a peer count unknown), whatever
 *    it says: sync_status 'no_sync', the reported one kept in reported_sync_status;
 *  - clearly below it while it says no_sync or awaiting_peers: behind_blocks = how far. sync_status
 *    is not changed, so nothing that worked before stops (sending keys on it);
 *  - tip unknown: awaiting_peers with peers (connections > 0) and a tip above 0 is 'no_sync';
 *    anything else as it is.
 * A syncing node (header_sync, body_sync, txhashset_*) below the tip shows its own progress.
 * Returns a new object when something changes; no status (false, null, {error}) as it is.
 */
export function assessNodeStatus(status, {referenceHeight = 0} = {}){
  if(!status || typeof status !== 'object' || status.error){
    return status;
  }
  const tip = status.tip ? Number(status.tip.height) || 0 : 0;
  const peers = Number(status.connections) || 0;
  const reference = Number(referenceHeight) || 0;
  //ready_for_txs (the foreign API, nodeVersion.js) is the node's own word: false is syncing, however
  //close the height is; the blocks to the network tip are what is left to do
  if(status.ready_for_txs === false){
    return reference > tip && tip > 0 ? {...status, behind_blocks: reference - tip} : status;
  }
  const synced = (s) => (s.sync_status === 'no_sync' ? s : {...s, sync_status: 'no_sync', reported_sync_status: s.sync_status});

  if(reference > 0 && tip > 0){
    if(tip >= reference - NODE_TIP_TOLERANCE){
      //with no peers it relays nothing: as it says (connections null: unknown, via get_tip)
      return status.connections === 0 ? status : synced(status);
    }
    if(SETTLED_STATES.includes(status.sync_status)){
      return {...status, behind_blocks: reference - tip};
    }
    return status;
  }
  if(reference <= 0 && status.sync_status === 'awaiting_peers' && peers > 0 && tip > 0){
    return synced(status);
  }
  return status;
}

/*
 * Debounce for the "node is behind" line: update(behindBlocks) after each counted check returns the
 * blocks to show, 0 until BEHIND_CONFIRMATIONS checks in a row were behind; one check not behind
 * clears it. Only the regular status poll counts (nodeService), so two checks are a poll apart.
 * current(): what update last returned, for the other status reads. reset(): a new node.
 */
export function createBehindTracker({confirmations = BEHIND_CONFIRMATIONS} = {}){
  let streak = 0;
  let shown = 0;
  return {
    update(behindBlocks){
      const n = Number(behindBlocks) || 0;
      streak = n > 0 ? streak + 1 : 0;
      shown = streak >= confirmations ? n : 0;
      return shown;
    },
    current(){
      return shown;
    },
    reset(){
      streak = 0;
      shown = 0;
    },
  };
}
