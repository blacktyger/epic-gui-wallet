/*
 * Unlock decisions that need no window (components/wallets.js openWallet, the Modern unlock
 * screen): unit-tested in tests/unlockResult.test.js.
 *
 * The password is checked by the owner API (walletService.start: open_wallet) before anything
 * of the wallet is saved. The first unlock of a wallet (new, imported from an older GUI, a
 * folder opened, added from Settings) goes through the same check: 6.1 has no Setup Assistant
 * step on the way in, a wrong password always comes back to the unlock screen.
 */

/*
 * What the unlock screen shows after a failed unlock:
 *   'password' the wrong-password message at the password field (epic-wallet refused it while
 *              starting, or open_wallet did: the 'unlock' step)
 *   'field'    the message at the password field: it failed before any step started
 *   'stage'    the step list with the step that failed and the message
 * startFailure: walletService.lastStartFailure; lastStage: the last store.state.loginStage seen;
 * opened: the owner API took the password (what fails after that, e.g. saving the User row, is
 * shown at its step, never as a wrong password).
 */
export function unlockFailure({ startFailure = '', lastStage = '', opened = false } = {}) {
  if (!opened && (startFailure === 'password' || lastStage === 'unlock')) return 'password';
  if (!lastStage) return 'field';
  return 'stage';
}

/*
 * The User row the store holds while the wallet is being unlocked, before the password is known
 * to be right: the saved row if there is one, with this wallet's settings over it, else just
 * those settings. Nothing is saved: the row is written (userService.ensureUser) only once the
 * wallet is open. The start reads it (App.vue nodeStart: user.nodeInternal).
 */
export function pendingUser(walletId, rows, fields = {}) {
  const saved = Array.isArray(rows) && rows.length ? rows[0] : null;
  const set = {};
  for (const k of ['name', 'language', 'epicbox_domain']) {
    if (fields[k] !== undefined && fields[k] !== null) set[k] = String(fields[k]);
  }
  if (fields.nodeInternal !== undefined) set.nodeInternal = !!fields.nodeInternal;
  return { ...(saved || { account: walletId }), ...set };
}
