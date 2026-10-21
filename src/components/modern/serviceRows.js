/*
 * The Node and Receiving status as the Modern screens show it: a dot (shape and colour), one word,
 * and the detail lines. One source for the sidebar rows and their hover cards (shell/ServiceStatus.vue)
 * and the Overview Status card, so the two say the same. Plain ESM (tests/serviceRows.test.js).
 *
 * glyph: the e-st dot class: 'ok' | 'sync' | 'pause' | 'busy' | 'down' | 'off'
 */
import { nodeBadge, nodeBadgeText } from './nodeBadge.js';
import { httpShown } from '../../shared/httpListener.js';
import { torCardLine, torPhase, torPercent, torErrorText } from '../../shared/torUi.js';
import { httpOffered, torOffered, epicboxDomainLabel } from '../../shared/directTx.js';

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
    //the Status card and hover cards: "Synced" (+ the height) while online
    synced: b.state == 'online' ? t('msg.modern.svc_synced') : '',
    height,
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

/* "mk7ca5…luyd.onion" for the 56-character name, so the row never wraps */
export function onionShort(onion) {
  const name = String(onion || '').replace(/\.onion$/i, '');
  return name.length > 12 ? name.slice(0, 6) + '…' + name.slice(-4) + '.onion' : name ? name + '.onion' : '';
}

/*
 * The service rows of the Overview Status card and the sidebar hover cards, one source (icon, dot, label,
 * value, tooltip lines). Returns [{key: 'node'|'epicbox'|'http'|'tor', icon, glyph, err, label, value,
 * hoverValue, mono, tip: [lines]}]; value is the card's (right-aligned, muted), hoverValue the shorter
 * one of the hover card.
 *   node: nodeRow() of the screen; health, domain: the Epicbox; direct: store.state.direct;
 *   httpListener, listenerStarting, tor: from the store; httpAddr: 'host:port' of the listener.
 */
export function serviceRows({ node, health, domain = '', direct, httpListener, listenerStarting = false, tor, httpAddr = '' } = {}, t) {
  const rows = [];
  const n = node || {};
  const nodeWord = n.synced || n.word;
  rows.push({
    key: 'node', icon: 'svc-node', glyph: n.glyph || 'busy', err: n.glyph == 'down', label: t('msg.modern.svc_node'),
    value: [nodeWord, n.height].filter(Boolean).join(' · '), hoverValue: nodeWord, mono: false, tip: n.lines || [],
  });
  const h = health || { state: 'off' };
  const host = h.server || domain;
  const dom = epicboxDomainLabel(host);
  let ebGlyph = epicboxGlyph(h.state);
  let ebWord = '';
  if (h.state == 'down') ebWord = t('msg.modern.svc_no_answer');
  else if (h.state == 'connecting') ebWord = t('msg.modern.eb_connecting');
  else if (h.state == 'paused') ebWord = t('msg.modern.eb_paused');
  if (listenerStarting && h.state == 'off') { ebGlyph = 'sync'; ebWord = t('msg.modern.eb_connecting'); }
  const ebOff = h.state == 'off' && !listenerStarting;
  rows.push({
    key: 'epicbox', icon: 'svc-epicbox', glyph: ebGlyph, err: h.state == 'down', label: t('msg.modern.svc_epicbox'),
    value: ebOff ? t('msg.modern.eb_off') : [dom, ebWord].filter(Boolean).join(' · '), hoverValue: ebOff ? t('msg.modern.eb_off') : dom, mono: false,
    tip: [ebOff ? t('msg.modern.svc_epicbox_off') : t('msg.modern.svc_epicbox_line', { server: host, state: epicboxStateText(h, t) })],
  });
  if (httpOffered(direct)) {
    const shown = httpShown(httpListener);
    const addr = String(httpAddr || '').replace(/^https?:\/\//, '');
    rows.push({
      key: 'http', icon: 'svc-http', glyph: shown == 'on' ? 'ok' : shown == 'failed' ? 'down' : 'sync', err: shown == 'failed', label: t('msg.modern.svc_http'),
      value: addr, hoverValue: addr, mono: true,
      tip: [shown == 'failed' ? t('msg.modern.svc_http_failed_line') : t(direct.public ? 'msg.modern.svc_http_tip_public' : 'msg.modern.svc_http_tip_local')],
    });
  }
  if (torOffered(direct)) {
    const phase = torPhase(tor);
    const failed = phase == 'failed';
    const ready = phase == 'ready';
    const pct = torPercent(tor);
    rows.push({
      key: 'tor', icon: 'svc-tor', glyph: ready ? 'ok' : failed ? 'down' : 'busy', err: failed, label: t('msg.modern.settings.tor.title'),
      value: ready ? onionShort(tor.onion) || t('msg.modern.svc_on') : failed ? t('msg.modern.settings.tor.card_failed') : phase == 'publishing' ? t('msg.modern.svc_tor_publishing') : t('msg.modern.svc_tor_starting', { n: pct }),
      hoverValue: ready ? t('msg.modern.svc_on') : failed ? t('msg.modern.settings.tor.card_failed') : t('msg.modern.settings.tor.card_connecting', { n: pct }),
      mono: ready, tip: [ready && tor.onion ? tor.onion : '', failed ? torErrorText(t, tor.error, tor.detail) : torCardLine(tor, t)].filter(Boolean),
    });
  }
  return rows;
}
