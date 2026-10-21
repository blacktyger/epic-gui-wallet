/*
 * Epicbox as one status for the Modern screens (#52): listening, connecting or not responding,
 * with the reason, and the healthiest other server to offer when ours doesn't answer. Never a
 * switch by itself: the screens only offer it (one click). Plain ESM (tests/epicboxHealth.test.js).
 *
 * Inputs: store.state.epicbox (our listener's own output, with since/failed from the store),
 * store.state.walletEpicboxService, the saved domain, the public server list (epicboxDirectory.js).
 */
import { epicboxStatus } from './epicboxStatus.js';
import { cleanDomain } from './epicboxDirectory.js';

//connecting this long without an answer counts as not responding
export const NO_ANSWER_MS = 45000;

const LIVE = { healthy: 0, degraded: 1 };

/*
 * returns {state, server, why, since}
 *   state  'listening' | 'connecting' | 'down' | 'off'
 *   server the server for people ('' when unknown)
 *   why    '' | 'no_answer' (still trying after NO_ANSWER_MS) | 'stopped' (gave up after its
 *          retries) | 'status_down' (the status site says the server is down)
 *   since  ms timestamp of the last change, 0 when unknown
 */
export function epicboxHealth({ epicbox, on, domain = '', servers = [], now = Date.now() } = {}) {
  const e = epicbox || {};
  const st = epicboxStatus(e, on);
  const server = st.server || cleanDomain(domain) || '';
  const since = Number(e.since) || 0;
  const listed = (servers || []).find((s) => s && s.domain === cleanDomain(server));
  const listedDown = !!listed && listed.state === 'down';
  if (st.kind == 'listening' && e.state == 'listening') return { state: 'listening', server, why: '', since };
  if (st.kind == 'off') {
    if (e.failed) return { state: 'down', server: server, why: 'stopped', since };
    return { state: 'off', server: '', why: '', since };
  }
  //starting, connecting, paused, checking the old server, or on with no event yet (6.1.5 said "listening")
  if (listedDown) return { state: 'down', server, why: 'status_down', since };
  if (e.state == 'connecting' && since && now - since >= NO_ANSWER_MS) return { state: 'down', server, why: 'no_answer', since };
  return { state: 'connecting', server, why: '', since };
}

/* the healthiest other server of the list (online first, then the fastest), or null */
export function healthiestOther(servers, current) {
  const cur = cleanDomain(current);
  const lat = (s) => (s.latencyMs === null || s.latencyMs === undefined ? Infinity : s.latencyMs);
  const ok = (servers || []).filter((s) => s && s.domain && s.domain !== cur && s.state in LIVE);
  ok.sort((a, b) => (LIVE[a.state] - LIVE[b.state]) || (lat(a) - lat(b)) || (a.domain < b.domain ? -1 : 1));
  return ok[0] || null;
}
