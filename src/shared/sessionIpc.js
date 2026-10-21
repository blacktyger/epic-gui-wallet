/*
 * The main process side of the session password and the pseudo-terminal processes: the IPC
 * handlers and when the password is wiped (background.js). Plain ESM with Electron's objects
 * passed in (tests/sessionIpc.test.js).
 *
 *   session-password-set (password, dir)  after a successful unlock of the wallet in dir; kept in
 *                                    memory, never sent back; listeners of other dirs don't get it
 *   session-password-clear           lock, logout, wallet switch
 *   session-password-has             → boolean
 *   pty-start {token, cmd, args, kind, password?, phrase?, cwd?}
 *       a listener (listen, epicbox) gets the session password; init / recover get theirs with
 *       the request, for that one process. Output goes back as 'pty-data' {token, lines} and
 *       'pty-exit' {token, code, signal, fail}. Resolves {ok, pid, mode, id} or {ok: false,
 *       noSession?, error}: never a password. Only the kind's own command of the app's binary
 *       (ptyHost, walletArgs.checkPtyArgs). cwd: the process's working dir, the args' -c dir
 *       (ptyHost refuses anything else).
 * Only the app's window is served. Wiped also when the window reloads or navigates (the interface
 * switch), when its renderer is gone (crash) or the window is closed, at quit and when the
 * process exits.
 */

export function registerSessionIpc({ ipcMain, session, ptyHost, isAppWindow }) {
  ipcMain.handle('session-password-set', (event, password, dir) => {
    if (!isAppWindow(event) || typeof password !== 'string' || typeof dir !== 'string' || !dir) return false;
    return session.set(password, dir);
  });
  ipcMain.handle('session-password-clear', (event) => {
    //anyone may lock
    session.wipe();
    return true;
  });
  ipcMain.handle('session-password-has', (event) => isAppWindow(event) && session.has());

  ipcMain.handle('pty-start', (event, req) => {
    if (!isAppWindow(event) || !req || typeof req !== 'object') return { ok: false, error: 'refused' };
    //the one-shot onion key run is the main process's own (background.js tor-start), never the page's
    if (req.kind === 'torkeys') return { ok: false, error: 'refused' };
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
        //checked by ptyHost: absolute, an existing directory, the -c dir
        cwd: req.cwd === undefined ? undefined : req.cwd,
        //a listener only for the unlocked wallet
        dir: listener ? session.dir() : undefined,
        onLines: (lines) => send('pty-data', { lines }),
        onExit: (e) => send('pty-exit', { code: e.code, signal: e.signal, fail: e.fail }),
      });
      return { ok: r.pid > 0, pid: r.pid, mode: r.mode, id: r.id };
    } catch (e) {
      password.fill(0);
      return { ok: false, error: e && e.message ? e.message : 'start failed' };
    }
  });
}

/* the window's session ends with its page: a reload, a crashed renderer, the window closed
   (macOS keeps the app running then) */
export function wipeWithWindow(webContents, session) {
  webContents.on('did-navigate', () => session.wipe());
  webContents.on('render-process-gone', () => session.wipe());
  webContents.on('destroyed', () => session.wipe());
}

/* and with the app */
export function wipeWithApp({ app, proc, session }) {
  app.on('before-quit', () => session.wipe());
  app.on('will-quit', () => session.wipe());
  proc.on('exit', () => session.wipe());
}
