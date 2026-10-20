/*
 * The HTTP listener (port 3415 on mainnet) apart from Epicbox (QA W01). Another program on its port
 * stopped it, yet the status said "Receiving … · HTTP": the GUI had one flag for both. Its own state
 * (store.state.httpListener) comes from walletService.startListen's result, and the status lines
 * mention HTTP only while it runs. Plain ESM (tests/httpListener.test.js).
 */

//epic-wallet's own words when it can't bind its port: Linux (os error 98), macOS (48), Windows (10048).
//preload.js errorLines keeps these lines of the listener's output: change both together.
const ADDR_IN_USE = /address already in use|addrinuse|only one usage of each socket address|os error (98|48|10048)\b/i;

export function isAddrInUse(text) {
  return ADDR_IN_USE.test(String(text || ''));
}

//the listener asks the node whether it is ready (ready_for_txs) before it listens, and stops when the
//node doesn't answer; preload.js execListen answers 'node not synced' for that line
const NODE_FAILED = /^node not synced$|failed to check node sync status/i;

export const HTTP_OFF = Object.freeze({ state: 'off', port: 0, reason: '' });

/* does the HTTP listener start with the wallet (unlock, Receive › Start listener)? Modern: only with
   the wallet's http_listener_autostart on (default off; turned on by hand otherwise). Classic is
   frozen and starts it as it always did. config: the wallet's config; ui: 'modern' | 'classic' */
export function httpAutostart(config, ui) {
  if (ui === 'classic') return true;
  return !!(config && config.http_listener_autostart === true);
}

/* startListen's answer -> store.state.httpListener: {state: 'on'|'failed'|'off', port, reason: ''|'port_in_use'|'node'|'error'}
   ('node': the node did not answer the listener at its start; Try again works once it does) */
export function httpListenerState(res, port) {
  if (res && res.success) return { state: 'on', port, reason: '' };
  if (res && (res.portInUse || isAddrInUse(res.msg))) return { state: 'failed', port: res.portInUse || port, reason: 'port_in_use' };
  if (res && NODE_FAILED.test(String(res.msg || ''))) return { state: 'failed', port, reason: 'node' };
  return { state: 'failed', port, reason: 'error' };
}

/* What the receiving status says about HTTP: 'on' (mention it), 'failed' (say it failed and why) or
   'off' (leave it out). From the HTTP listener's own state only (reset on Stop and lock), not from
   walletListenerService: Epicbox alone turns that on, and a late Epicbox start used to leave it off. */
export function httpShown(http) {
  const s = http && http.state;
  return s === 'on' || s === 'failed' ? s : 'off';
}
