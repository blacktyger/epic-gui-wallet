/*
 * Tor in the Modern screens (spec docs/plans/tor-616.md §6/§7): what to say for the state in
 * store.state.tor, which message an error code gets, the sidebar card line and how Send reads an
 * onion recipient. Pure functions, no Vue: unit-tested in tests/torUi.test.js.
 *
 * store.state.tor: { enabled, state: 'off'|'starting'|'publishing'|'ready'|'failed', progress,
 *                    onion: '' | '<56>.onion', error: '' | code, detail }
 */
import { parseOnion } from './onion.js';
import { isOnionAddress } from './sendForm.js';

const MSG = 'msg.modern.settings.tor.';

/* the error codes (§5/§6) that have a message of their own; others get err_other */
const ERROR_CODES = ['unreachable', 'invalid', 'broken', 'auth', 'not_epic', 'too_old', 'refused', 'finalize', 'post', 'missing', 'start', 'network', 'clock', 'keys', 'listener', 'tor_off'];

export function torPhase(tor) {
  if (!tor || !tor.enabled) return 'off';
  return ['starting', 'publishing', 'ready', 'failed'].includes(tor.state) ? tor.state : 'starting';
}

/* the progress as a whole percent, 0 to 100 */
export function torPercent(tor) {
  const n = Math.round(Number(tor && tor.progress));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/* the message key (full vue-i18n path) for an error code, and its parameters */
export function torErrorKey(code) {
  return MSG + 'err_' + (ERROR_CODES.includes(code) ? code : 'other');
}
export function torErrorText(t, code, detail) {
  return t(torErrorKey(code), { msg: detail || '', detail: detail || '' });
}

/* the status line of the Settings row: { tone: 'busy'|'ok'|'warn'|'', key, params } or null while off */
export function torStatus(tor) {
  switch (torPhase(tor)) {
    case 'off': return null;
    case 'starting': return { tone: 'busy', key: MSG + 'connecting', params: { n: torPercent(tor) } };
    case 'publishing': return { tone: 'busy', key: MSG + 'publishing', params: {} };
    case 'ready': return { tone: 'ok', key: MSG + 'ready', params: {} };
    default: return { tone: 'warn', key: torErrorKey(tor.error), params: { msg: tor.detail || '', detail: tor.detail || '' } };
  }
}

/* the sidebar card's extra line ("Tor: Ready"), null while Tor is off (ServiceStatus.vue's lines are
   plain strings: `const tor = torCardLine(state.tor, t); if (tor) lines.push(tor)`) */
export function torCardLine(tor, t) {
  const phase = torPhase(tor);
  if (phase === 'off') return null;
  const detail = phase === 'ready' ? t(MSG + 'card_ready')
    : phase === 'failed' ? t(MSG + 'card_failed')
      : t(MSG + 'card_connecting', { n: torPercent(tor) });
  return t(MSG + 'title') + ': ' + detail;
}

/* what Send makes of the recipient text:
     'none'    not a Tor address
     'typo'    looks like one but fails the checksum
     'tor_off' a good Tor address while Tor is off (offer "Turn on Tor")
     'wait'    a good one, Tor is on but has not connected yet: the send waits for it
     'failed'  a good one, Tor is on but not working (the error is on the row)
     'ok'      a good one, Tor can carry it */
export function onionVerdict(text, tor) {
  if (!isOnionAddress(text)) return 'none';
  if (!parseOnion(text).valid) return 'typo';
  const phase = torPhase(tor);
  if (phase === 'off') return 'tor_off';
  if (phase === 'failed') return 'failed';
  return phase === 'publishing' || phase === 'ready' ? 'ok' : 'wait';
}

/* the progress line of a Send over Tor, from the step sendOverTor reports: 'connect' | 'sign' | 'post' */
export function torSendStepKey(step) {
  return MSG + 'send_' + (['connect', 'sign', 'post'].includes(step) ? step : 'connect');
}

/* the error of a failed sendOverTor ({ok: false, code, detail}) as text */
export function torSendError(t, res) {
  return torErrorText(t, res && res.code, res && res.detail);
}

/* the onion field of a contact is shown when Tor is on or the contact already has an onion address */
export function showOnionField(tor, contact) {
  return torPhase(tor) !== 'off' || !!String((contact && contact.onion) || '').trim();
}

/* a contact's onion field: '' (empty is fine), 'typo' or 'format' (not an onion address at all) */
export function onionProblem(text) {
  const v = String(text == null ? '' : text).trim();
  if (!v) return '';
  const p = parseOnion(v);
  if (p.valid) return '';
  return isOnionAddress(v) ? 'typo' : 'format';
}
