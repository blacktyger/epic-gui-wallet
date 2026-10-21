/*
 * Direct transactions (6.1.7, Settings › Receiving): wallet to wallet over HTTP, Tor or both, without
 * Epicbox. One switch runs it; the HTTP and Tor chips say which ways are offered (at least one).
 * Tor needs the HTTP listener, so the listener runs whenever Direct is on; with Tor alone it stays on
 * 127.0.0.1 behind the onion and is not offered as an HTTP address. Public mode (bot #67) lets the
 * listener take connections from other computers (api_listen_interface = "0.0.0.0", the CLI's
 * --external), only while the HTTP chip is on. Plain ESM (tests/directTx.test.js).
 *
 * Per wallet settings (settings.json wallets[].settings):
 *   direct_on         the switch: Direct runs now and, with direct_autostart, after the next unlock
 *   direct_http       the HTTP chip
 *   direct_tor        the Tor chip
 *   direct_autostart  "Start with the wallet"
 *   direct_public     Reachable: From the internet (kept until switched back)
 * They replace 6.1.6's http_listener_autostart and tor_enabled (migrateDirect).
 */

export const DIRECT_DEFAULTS = Object.freeze({
  direct_on: false,
  direct_http: false,
  direct_tor: true,
  direct_autostart: true,
  direct_public: false,
});

//6.1.6's settings, read once by migrateDirect and then dropped
export const LEGACY_DIRECT_KEYS = Object.freeze(['http_listener_autostart', 'tor_enabled']);

export const LOCAL_INTERFACE = '127.0.0.1';
export const PUBLIC_INTERFACE = '0.0.0.0';

/*
 * A wallet's stored settings (as read from the file) -> the Direct settings. Settings that already
 * have direct_on are kept as they are; 6.1.6's become: HTTP on with the wallet -> Direct on + HTTP,
 * Tor on -> Direct on + Tor, both -> both. Neither: the defaults (off, Tor chosen).
 */
export function migrateDirect(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  if (typeof s.direct_on === 'boolean') {
    const out = {};
    for (const k of Object.keys(DIRECT_DEFAULTS)) out[k] = typeof s[k] === 'boolean' ? s[k] : DIRECT_DEFAULTS[k];
    return { ...out, ...chips(out.direct_http, out.direct_tor) };
  }
  const http = s.http_listener_autostart === true;
  const tor = s.tor_enabled === true;
  if (!http && !tor) return { ...DIRECT_DEFAULTS };
  return { ...DIRECT_DEFAULTS, direct_on: true, direct_autostart: true, direct_http: http, direct_tor: tor };
}

/* the chips as stored: at least one on (none -> Tor, the one that works from anywhere) */
function chips(http, tor) {
  return http || tor ? { direct_http: !!http, direct_tor: !!tor } : { direct_http: false, direct_tor: true };
}

/*
 * A chip pressed: {http, tor} -> {http, tor} with `which` ('http' | 'tor') set to `on`. The last chip
 * that is on can't be turned off: the answer is then the same selection.
 */
export function setChip(sel, which, on) {
  const cur = { http: !!(sel && sel.http), tor: !!(sel && sel.tor) };
  if (which !== 'http' && which !== 'tor') return cur;
  const next = { ...cur, [which]: !!on };
  return next.http || next.tor ? next : cur;
}

/* can this chip be turned off now? (no: it is the only one on) */
export function chipLocked(sel, which) {
  const s = { http: !!(sel && sel.http), tor: !!(sel && sel.tor) };
  return s[which] && !(which === 'http' ? s.tor : s.http);
}

/* the listener's interface for epic-wallet.toml: public only while HTTP is offered */
export function listenInterface(settings) {
  const s = settings || {};
  return s.direct_public === true && s.direct_http === true ? PUBLIC_INTERFACE : LOCAL_INTERFACE;
}

/*
 * What should run for these settings: {listener, tor, iface}. on: the switch (the session's own
 * state; at unlock: direct_on && direct_autostart).
 */
export function directPlan(settings, on) {
  const s = settings || {};
  const run = !!on && (s.direct_http === true || s.direct_tor === true);
  return { listener: run, tor: run && s.direct_tor === true, iface: listenInterface(s) };
}

/* does Direct start at unlock? */
export function directAtUnlock(settings) {
  const s = settings || {};
  return s.direct_on === true && s.direct_autostart === true && (s.direct_http === true || s.direct_tor === true);
}

/*
 * The steps from what runs now to the plan:
 *   now:  {listener: bool, tor: bool, iface: '127.0.0.1' | '0.0.0.0' | ''}  ('' unknown: as plan)
 *   plan: directPlan()
 * -> ordered list of 'stopTor' | 'stopListener' | 'writeToml' | 'startTor' | 'startListener'.
 * startTor brings the listener up itself (walletService.startTor), so it is never paired with
 * startListener. A listener on the wrong interface is restarted after the toml is written.
 */
export function directSteps(now, plan) {
  const n = now || {};
  const steps = [];
  const ifaceChanged = !!n.iface && n.iface !== plan.iface;
  if (n.tor && !plan.tor) steps.push('stopTor');
  const restart = n.listener && plan.listener && ifaceChanged;
  if (n.listener && (!plan.listener || restart)) steps.push('stopListener');
  if (ifaceChanged || (plan.listener && !n.listener)) steps.push('writeToml');
  const listenerUp = n.listener && !restart;
  //Tor kept while the listener restarts forwards to the same port: it only needs the listener back
  if (plan.tor && !n.tor) steps.push('startTor');
  else if (plan.listener && !listenerUp) steps.push('startListener');
  return steps;
}

/* store.state.direct from a wallet's settings and the switch */
export function directState(settings, on) {
  const s = settings || {};
  return { on: !!on, http: s.direct_http === true, tor: s.direct_tor === true, public: listenInterface(s) === PUBLIC_INTERFACE, wantPublic: s.direct_public === true };
}

/* is HTTP offered as an address (the Status card, Receive)? Direct on with the HTTP chip */
export function httpOffered(direct) {
  return !!(direct && direct.on && direct.http);
}

/* is Tor part of Direct now? */
export function torOffered(direct) {
  return !!(direct && direct.on && direct.tor);
}

/* "stackwallet.com" for "epicbox.stackwallet.com" (the status rows show the domain only; the full
   host stays in the tooltip, the picker and the address). An IP or a bare name is kept as it is. */
export function epicboxDomainLabel(host) {
  const h = String(host || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/[/:].*$/, '').toLowerCase();
  if (!h || /^[\d.]+$/.test(h) || h.indexOf('.') < 0) return h;
  const parts = h.split('.');
  return parts[0] === 'epicbox' && parts.length > 2 ? parts.slice(1).join('.') : h;
}
