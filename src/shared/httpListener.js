/*
 * The HTTP listener (port 3415 on mainnet) apart from Epicbox (QA W01). Another program on its port
 * stopped it, yet the status said "Receiving … · HTTP": the GUI had one flag for both. Its own state
 * (store.state.httpListener) comes from walletService.startListen's result, and the status lines
 * mention HTTP only while it runs. Plain ESM (tests/httpListener.test.js).
 */

//epic-wallet's own words when it can't bind its port: Linux (os error 98), macOS (48), Windows (10048)
const ADDR_IN_USE = /address already in use|addrinuse|only one usage of each socket address|os error (98|48|10048)\b/i;

export function isAddrInUse(text) {
  return ADDR_IN_USE.test(String(text || ''));
}

export const HTTP_OFF = Object.freeze({ state: 'off', port: 0, reason: '' });

/* startListen's answer -> store.state.httpListener: {state: 'on'|'failed'|'off', port, reason: ''|'port_in_use'|'error'} */
export function httpListenerState(res, port) {
  if (res && res.success) return { state: 'on', port, reason: '' };
  if (res && (res.portInUse || isAddrInUse(res.msg))) return { state: 'failed', port: res.portInUse || port, reason: 'port_in_use' };
  return { state: 'failed', port, reason: 'error' };
}

/* What the receiving status says about HTTP: 'on' (mention it), 'failed' (say it failed and why) or
   'off' (leave it out). listening: store.state.walletListenerService (receiving is on at all);
   Epicbox alone turns it on, so it no longer means HTTP runs. */
export function httpShown(listening, http) {
  const s = http && http.state;
  return listening && (s === 'on' || s === 'failed') ? s : 'off';
}
