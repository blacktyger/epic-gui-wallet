'use strict';

import { isLocalNodeAddress } from './setupDefaults.js';

/*
 * The one-line warning that a heavy action the user starts makes the node work hard (CPU, memory)
 * while it runs. Only when the wallet uses a node on this computer: the built-in one, or an
 * external address that is local. Never with a remote node, and not for normal actions (send,
 * receive, opening screens).
 * action: 'check' (wallet Check / rescan) or 'restore' (the scan after a recovery phrase).
 * node: {internal, address} as saved (user.nodeInternal, config.check_node_api_http_addr).
 */
const HEAVY = ['check', 'restore'];

export function nodeLoadWarning(action, node) {
  if (!HEAVY.includes(action) || !node) return false;
  if (node.internal) return true;
  return !!String(node.address || '').trim() && isLocalNodeAddress(node.address);
}

/* the node of the open wallet as the store and config hold it */
export function savedNode(user, config) {
  return { internal: !!(user && user.nodeInternal), address: config ? config.check_node_api_http_addr : '' };
}
