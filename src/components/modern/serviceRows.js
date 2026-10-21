/*
 * The Node and Receiving status as the Modern screens show it: a dot (shape and colour), one word,
 * and the detail lines. One source for the sidebar rows and their hover cards (shell/ServiceStatus.vue)
 * and the Overview Status card, so the two say the same. Plain ESM (tests/serviceRows.test.js).
 *
 * glyph: the e-st dot class: 'ok' | 'sync' | 'pause' | 'busy' | 'down' | 'off'
 */
import { nodeBadge, nodeBadgeText } from './nodeBadge.js';
import { httpShown } from '../../shared/httpListener.js';
import { torCardLine } from '../../shared/torUi.js';

const NODE_GLYPH = { online: 'ok', syncing: 'sync', offline: 'down' };
const EB_GLYPH = { listening: 'ok', connecting: 'sync', paused: 'pause', down: 'down', off: 'off' };

/* the dot of an Epicbox state (shared/epicboxHealth.js) */
export function epicboxGlyph(state) {
  return EB_GLYPH[state] || 'sync';
}

/* the Epicbox state in words: "Paused (waiting for the node)" */
export function epicboxStateText(health, t) {
  const h = health || {};
  return t('msg.modern.eb_' + h.state) + (h.why ? ' (' + t('msg.modern.eb_why_' + h.why) + ')' : '');
}

/*
 * status, problem: store nodeStatus, nodeProblem; internal: the built-in node; addr: the node's
 * address for people; locale: for the height. Returns {state, glyph, word, lines, behind}.
 */
export function nodeRow({ status, problem, internal = false, addr = '', locale } = {}, t) {
  const b = nodeBadge(status, problem);
  const s = status || {};
  const height = s.tip && s.tip.height > 0 && !s.error ? Number(s.tip.height).toLocaleString(locale) : '';
  const lines = [[internal ? t('msg.modern.settings.node_builtin') : addr, height].filter(Boolean).join(' · ')];
  if (b.state != 'online') lines.push(nodeBadgeText(b, t));
  return {
    state: b.state,
    glyph: NODE_GLYPH[b.state] || 'busy',
    word: { online: t('msg.mynodes.state_online'), syncing: t('msg.mynodes.state_syncing'), offline: t('msg.mynodes.state_offline') }[b.state] || t('msg.modern.eb_connecting'),
    lines: lines.filter(Boolean),
    behind: b.behind,
  };
}

/*
 * health: shared/epicboxHealth.js epicboxHealth(); domain: the saved Epicbox server; httpListener,
 * listenerStarting, tor: from the store. Returns {glyph, word, lines}: Epicbox, the HTTP listener,
 * and Tor only while it is on.
 */
export function receivingRow({ health, domain = '', httpListener, listenerStarting = false, tor } = {}, t) {
  const h = health || { state: 'off' };
  //HTTP only while its listener runs, "failed" when it couldn't start (shared/httpListener.js)
  const http = httpShown(httpListener);
  const epicLine = h.state == 'off' ? t('msg.modern.svc_epicbox_off')
    : t('msg.modern.svc_epicbox_line', { server: h.server || domain, state: epicboxStateText(h, t) });
  const httpLine = t(http == 'on' ? 'msg.modern.svc_http_on' : http == 'failed' ? 'msg.modern.svc_http_failed_line' : 'msg.modern.svc_http_off');
  let glyph = epicboxGlyph(h.state);
  let word = t('msg.modern.eb_' + h.state);
  if (h.state == 'listening') word = t('msg.modern.svc_on');
  if (h.state == 'off' && http == 'on') { glyph = 'ok'; word = t('msg.modern.svc_http_only_word'); }
  if (h.state == 'listening' && http == 'failed') glyph = 'sync';
  if (listenerStarting && h.state == 'off') { glyph = 'sync'; word = t('msg.modern.eb_connecting'); }
  const torLine = torCardLine(tor, t);
  return { glyph, word, lines: torLine ? [epicLine, httpLine, torLine] : [epicLine, httpLine] };
}
