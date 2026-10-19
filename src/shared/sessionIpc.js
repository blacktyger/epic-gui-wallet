/*
 * The main process side of the session password and the pseudo-terminal processes: the IPC
 * handlers and when the password is wiped (background.js). Plain ESM with Electron's objects
 * passed in (tests/sessionIpc.test.js).
 *
 *   session-password-set (password)  after a successful unlock; kept in memory, never sent back
 *   session-password-clear           lock, logout, wallet switch
 *   session-password-has             → boolean
 *   pty-start {token, cmd, args, kind, password?, phrase?}
 *       a listener (listen, epicbox) gets the session password; init / recover get theirs with
 *       the request, for that one process. Output goes back as 'pty-data' {token, lines} and
 *       'pty-exit' {token, code, signal, fail}. Resolves {ok, pid, mode, id} or {ok: false,
 *       noSession?, error}: never a password.
 *   pty-kill (id)                    init / recover only; listeners are stopped by pid
 * Wiped also when the window reloads or navigates (the interface switch), when its renderer is
 * gone (crash), at quit and when the process exits.
 */

export function registerSessionIpc({ ipcMain, session, ptyHost, isAppWindow }) {
  ipcMain.handle('session-password-set', (event, password) => {
    if (!isAppWindow(event) || typeof password !== 'string') return false;
    return session.set(password);
  });
  ipcMain.handle('session-password-clear', () => {
    session.wipe();
    return true;
  });
  ipcMain.handle('session-password-has', () => session.has());

  ipcMain.handle('pty-start', (event, req) => {
    if (!isAppWindow(event) || !req || typeof req !== 'object') return { ok: false, error: 'refused' };
    const sender = event.sender;
    const token = String(req.token || '');
    const listener = req.kind === 'listen' || req.kind === 'epicbox';
    const password = listener ? session.copy() : (typeof req.password === 'string' ? Buffer.from(req.password, 'utf8') : null);
    if (!password) {
      return { ok: false, noSession: listener, error: listener ? 'locked' : 'no password' };
    }
    const send = (channel, payload) => {
      if (!sender.isDestroyed()) sender.send(channel, Object.assign({ token }, payload));
    };
    try {
      const r = ptyHost.start({
        cmd: String(req.cmd || ''),
        args: req.args,
        kind: req.kind,
        password,
        phrase: req.kind === 'recover' ? req.phrase : undefined,
        onLines: (lines) => send('pty-data', { lines }),
        onExit: (e) => send('pty-exit', { code: e.code, signal: e.signal, fail: e.fail }),
      });
      return { ok: r.pid > 0, pid: r.pid, mode: r.mode, id: r.id };
    } catch (e) {
      password.fill(0);
      return { ok: false, error: e && e.message ? e.message : 'start failed' };
    }
  });

  ipcMain.handle('pty-kill', (event, id) => (isAppWindow(event) ? ptyHost.kill(id) : false));
}

/* the window's session ends with its page: a reload or a crashed renderer */
export function wipeWithWindow(webContents, session) {
  webContents.on('did-navigate', () => session.wipe());
  webContents.on('render-process-gone', () => session.wipe());
}

/* and with the app */
export function wipeWithApp({ app, proc, session }) {
  app.on('before-quit', () => session.wipe());
  app.on('will-quit', () => session.wipe());
  proc.on('exit', () => session.wipe());
}
