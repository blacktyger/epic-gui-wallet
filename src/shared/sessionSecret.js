/*
 * The wallet password of the unlocked session, in the Electron main process only (background.js).
 * The renderer hands it over once after a successful unlock and never gets it back; the main
 * process answers the listeners' password prompt with it (shared/ptyHost.js). It is kept in a
 * Buffer that is zeroed when it is replaced or wiped: at lock, wallet switch, logout, quit, a
 * renderer reload or crash. Plain ESM (tests/sessionSecret.test.js).
 */

export function createSessionSecret() {
  let buf = null;

  function wipe() {
    if (buf) buf.fill(0);
    buf = null;
  }

  return {
    /* the password (string or Buffer; a Buffer is copied, the caller zeroes its own) */
    set(value) {
      const next = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value == null ? '' : value), 'utf8');
      wipe();
      //an empty password is a real password for epic-wallet: kept as an empty buffer
      buf = next;
      return true;
    },
    has() {
      return buf !== null;
    },
    /* a copy for one process: the caller zeroes it once written; null when there is none */
    copy() {
      return buf ? Buffer.from(buf) : null;
    },
    wipe,
  };
}
