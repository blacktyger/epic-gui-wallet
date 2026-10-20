/*
 * The node as one icon in the Modern main views (sidebar, Overview): three states, from the
 * node's foreign ready_for_txs alone (shared/nodeVersion.js; an older node without it: the sync
 * state from its failover). No height, version, peers or response time here: those are in
 * Settings › Node. Plain ESM (tests/nodeBadge.test.js).
 *
 * status: store nodeStatus; problem: store nodeProblem (kind 'not_epic' | 'too_old' | 'unreachable'...)
 * returns {state, tone, icon, key, why, code, behind}
 *   state  'online' (green: ready) | 'syncing' (yellow: not ready yet) | 'offline' (red: no answer,
 *          timeout, an HTTP or TLS error, not an Epic node, too old) | 'connecting' (before the first answer)
 *   tone   'ok' | 'warn' | 'risk' | 'busy' (the sidebar's e-is-* classes)
 *   key    the tooltip's message under msg.modern; why/code: a short reason after it (red only)
 *   behind true when "Switch node" is offered (not ready, or down)
 */
const red = (why, code = '') => ({ state: 'offline', tone: 'risk', icon: 'alertc', key: 'node_tip_down', why, code, behind: true });

/* the short reason for a status read that failed (nodeVersion.js failReason / 'HTTP n' / redirects) */
export function failWhy(reason) {
  const r = String(reason || '');
  const http = r.match(/HTTP (\d+)/);
  if (http) return ['node_why_http', http[1]];
  if (/no reply within/.test(r)) return ['node_why_timeout', ''];
  if (/redirect/.test(r)) return ['node_why_redirect', ''];
  return ['node_why_unreachable', ''];
}

export function nodeBadge(status, problem) {
  const s = status || {};
  const kind = problem && problem.kind;
  if (kind == 'not_epic') return red('node_why_not_epic');
  if (kind == 'too_old') return red('node_why_old');
  if (s.error) return red(...failWhy(s.reason));
  if (!s.user_agent && !(s.tip && s.tip.height > 0)) return { state: 'connecting', tone: 'busy', icon: 'sync', key: 'node_tip_connecting', why: '', code: '', behind: false };
  //ready_for_txs, else (an older node) the sync state its failover gave
  const ready = typeof s.ready_for_txs === 'boolean' ? s.ready_for_txs : s.sync_status == 'synced';
  if (!ready) return { state: 'syncing', tone: 'warn', icon: 'sync', key: 'node_tip_syncing', why: '', code: '', behind: true };
  return { state: 'online', tone: 'ok', icon: 'check', key: 'node_tip_ok', why: '', code: '', behind: false };
}

/* the tooltip: "Node not responding: no reply in time"; t: vue-i18n's t */
export function nodeBadgeText(b, t) {
  const main = t('msg.modern.' + b.key);
  return b.why ? main + ': ' + t('msg.modern.' + b.why, { code: b.code }) : main;
}
