/*
 * Starting the wallet's tor from the page (walletService.startTor, tor-616 §5), safe against a
 * lock or wallet switch while it runs: the HTTP listener can take seconds, and by then another
 * wallet may be open. After every await the start checks it still belongs to the session that
 * began it (isCurrent); if not, it stops only what it started itself (its own listener pid, the
 * tor of its own walletId) and touches nothing of the wallet now open.
 *
 * A listener that can't start because the node doesn't answer (httpListener.js listenerNodeDown)
 * does not stop Tor: tor starts with waitListener (sending works, the error says `node` once
 * bootstrapped, the onion is added when the listener runs) and the caller retries the listener
 * (waitListener: true in the answer). Any other listener failure is `listener`, as before.
 *
 *   startTorFor({walletId, isCurrent, startListen, torAddress, start, stop, stopPid, log})
 *     startListen() → the listener result ({success, pid?}: a pid only when this call started it)
 *     torAddress() → '<56>.onion' | ''; start(walletId, onion, {waitListener}) → main's answer;
 *     stop(walletId): the main process's per-wallet stop; stopPid(pid)
 *   → {ok, status, onion, listener, listenerPid, waitListener} | {ok: false, error, listener?} | {stale: true}
 *
 * Plain ESM: tests/torSession.test.js.
 */
import { listenerNodeDown } from './httpListener.js';

export async function startTorFor({ walletId, isCurrent, startListen, torAddress, start, stop, stopPid, log = () => {} }) {
  const current = () => { try { return !!isCurrent(); } catch (e) { return false; } };
  let listener = null;
  //this call's own listener (startListen gives a pid only for one it started)
  const ownPid = () => (listener && listener.pid) || 0;
  const abandon = async (startedTor) => {
    log('[tor] start of an earlier session dropped');
    if (startedTor) await Promise.resolve(stop(walletId)).catch(() => {});
    if (ownPid()) await Promise.resolve(stopPid(ownPid())).catch(() => {});
    return { stale: true };
  };

  listener = await startListen();
  if (!current()) return abandon(false);
  const waitListener = listenerNodeDown(listener);
  if ((!listener || !listener.success) && !waitListener) {
    log('[tor] not started: the http listener did not start');
    return { ok: false, error: 'listener', listener };
  }
  if (waitListener) log('[tor] the http listener waits for the node: tor starts for sending');
  const onion = await torAddress();
  if (!current()) return abandon(false);
  if (!onion) {
    log('[tor] not started: no proof address from the wallet');
    return { ok: false, error: 'keys', listener };
  }
  const r = await start(walletId, onion, { waitListener });
  if (!current()) return abandon(true);
  log('[tor] start: ' + (r && r.ok ? (r.status && r.status.state) : 'refused (' + (r && r.error) + ')'));
  return Object.assign({ listener, onion, listenerPid: ownPid(), waitListener }, r || { ok: false, error: 'start' });
}
