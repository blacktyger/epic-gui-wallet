/*
 * The node's sync state in the app's language (Classic header "Status", Modern Overview). The store
 * (store/index.js nodeStatus) turns the node's sync_status into these English values, which the
 * screens compare with 'synced'; each has a message under msg.node_state. Plain ESM
 * (tests/nodeState.test.js).
 */
export const NODE_STATES = {
  'synced': 'synced',
  'Header sync': 'header_sync',
  'Body sync': 'body_sync',
  'Awaiting peers': 'awaiting_peers',
  'Download Txhashset': 'txhashset_download',
  '... processing': 'syncing',
  'Validate rangeproofs': 'txhashset_rangeproofs_validation',
  'Validate block kernels': 'txhashset_kernels_validation',
};

/* the message key for a state, or '' for one the app doesn't know (shown as it is) */
export function nodeStateKey(state) {
  const k = Object.prototype.hasOwnProperty.call(NODE_STATES, state) ? NODE_STATES[state] : '';
  return k ? 'msg.node_state.' + k : '';
}

/* t: vue-i18n's t */
export function nodeStateText(t, state) {
  const k = nodeStateKey(state);
  return k ? t(k) : String(state == null ? '' : state);
}
