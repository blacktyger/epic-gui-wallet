/*
 * The node as one icon in the Modern main views (sidebar, Overview): its state, the icon, the tone
 * and the short tooltip text. No height, version, peers or response time here: those are in
 * Settings › Node. Plain ESM (tests/nodeBadge.test.js).
 *
 * status: store nodeStatus; problem: store nodeProblem (kind 'not_epic' | 'too_old' | 'unreachable'...)
 * returns {state, tone, icon, key, n, behind}
 *   state  'online' | 'syncing' | 'offline' | 'not_epic' | 'old' | 'connecting'
 *   tone   'ok' | 'warn' | 'risk' | 'busy' (the sidebar's e-is-* classes)
 *   key    the message under msg.modern for the tooltip; n: blocks behind for it
 *   behind true when the node is behind the network tip or down: "Switch node" is offered
 */
export function nodeBadge(status, problem) {
  const s = status || {};
  const kind = problem && problem.kind;
  if (kind == 'not_epic') return { state: 'not_epic', tone: 'risk', icon: 'alertc', key: 'node_tip_not_epic', n: 0, behind: true };
  if (kind == 'too_old') return { state: 'old', tone: 'warn', icon: 'alert', key: 'node_tip_old', n: 0, behind: true };
  if (s.error) return { state: 'offline', tone: 'risk', icon: 'alertc', key: 'node_tip_down', n: 0, behind: true };
  if (!s.user_agent && !(s.tip && s.tip.height > 0)) return { state: 'connecting', tone: 'busy', icon: 'sync', key: 'node_tip_connecting', n: 0, behind: false };
  //behind the network tip (nodeService.assessStatus), once seen twice in a row
  if (s.node_behind > 0) return { state: 'syncing', tone: 'warn', icon: 'sync', key: 'node_tip_behind', n: s.node_behind, behind: true };
  if (s.sync_status != 'synced') return { state: 'syncing', tone: 'warn', icon: 'sync', key: 'node_tip_syncing', n: 0, behind: false };
  return { state: 'online', tone: 'ok', icon: 'check', key: 'node_tip_ok', n: 0, behind: false };
}
