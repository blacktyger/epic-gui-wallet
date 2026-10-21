/*
 * Starting the wallet's tor from the page (walletService.startTor, tor-616 §5), safe against a
 * lock or wallet switch while it runs: the HTTP listener can take seconds, and by then another
 * wallet may be open. After every await the start checks it still belongs to the session that
 * began it (isCurrent); if not, it stops only what it started itself (its own listener pid, the
 * tor of its own walletId) and touches nothing of the wallet now open.
 *
 *   startTorFor({walletId, isCurrent, startListen, torAddress, start, stop, stopPid, log})
 *     startListen() → the listener result ({success, pid?}: a pid only when this call started it)
 *     torAddress() → '<56>.onion' | ''; start(walletId, onion) → main's answer; stop(walletId):
 *     the main process's per-wallet stop; stopPid(pid)
 *   → {ok, status, onion, listener, listenerPid} | {ok: false, error, listener?} | {stale: true}
 *
 * Plain ESM: tests/torSession.test.js.
 */
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
  if (!listener || !listener.success) {
    log('[tor] not started: the http listener did not start');
    return { ok: false, error: 'listener', listener };
  }
  const onion = await torAddress();
  if (!current()) return abandon(false);
  if (!onion) {
    log('[tor] not started: no proof address from the wallet');
    return { ok: false, error: 'keys', listener };
  }
  const r = await start(walletId, onion);
  if (!current()) return abandon(true);
  log('[tor] start: ' + (r && r.ok ? (r.status && r.status.state) : 'refused (' + (r && r.error) + ')'));
  return Object.assign({ listener, onion, listenerPid: ownPid() }, r || { ok: false, error: 'start' });
}
