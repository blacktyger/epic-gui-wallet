'use strict'

import { app, protocol, net, session, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } from 'electron'
import contextMenu from 'electron-context-menu'
import { menuTemplate, menuState } from './shared/appMenu'
import { execFile, spawn } from 'child_process'
import { pathToFileURL } from 'url'
import { createDirectory } from './shared/nodeDirectory'
import { createAddressLookup } from './shared/netAddresses'
import { networkInterfaces } from 'os'
import { createReleaseLink } from './shared/releaseLink'
import { createProcessRegistry, createPidCheck } from './shared/processOwnership'
import { createWinFindProcess } from './shared/winProcessList'
import { resolveRoot, layout, legacyPaths } from './shared/appPaths'
import { scanLegacy, scanChains, resolveWalletFolder } from './shared/legacyScan'
import { createFolderLock, KINDS as LOCK_KINDS } from './shared/folderLock'
import { readLegacyProfiles } from './legacyProfile'
import { cleanLeftoverImport, cleanImportNow, importCopyNames, spawnAfterExitCleaner } from './shared/tmpCleanup.js'
import { createPtyHost } from './shared/ptyHost'
import { createSessionSecret } from './shared/sessionSecret'
import { createShutdown, SIGNALS } from './shared/shutdown'
import { createSecretClipboard } from './shared/secretClipboard'
import { registerSessionIpc, wipeWithWindow, wipeWithApp } from './shared/sessionIpc'
import { httpUrl, isAppUrl, isInside, nodeRequest, contentSecurityPolicy } from './shared/security'
import { portOffset, ownerApiPort } from './shared/testPorts'
import { createSupport, intakeResult } from './shared/supportReport'
import { SUPPORT_PUBLIC_KEY, supportUrl } from './shared/supportKey'
import { sanitizeText, KNOWN_PUBLIC_HOSTS } from './shared/logSanitize'
import { createTorManager } from './shared/torManager'
import { ensureOnionKey, KEYS_DIR } from './shared/torKeys'
import { torTimingsFromEnv } from './shared/torTestTimings'
import { checkForeignRequest, foreignCall } from './shared/torForeign'
import { parseOnion } from './shared/onion'
import { networkPorts } from './shared/walletToml'


const isDevelopment = process.env.NODE_ENV !== 'production'
const path = require('path')
const ps = require('ps-node');
//Windows: our own list (JSON); find-process's text parse broke long command lines (shared/winProcessList.js)
const findProcess = process.platform === 'win32'
  ? createWinFindProcess({ env: process.env,
    run: (file, args, opts) => new Promise((resolve, reject) => {
      execFile(file, args, { ...opts, windowsHide: true }, (err, stdout) => err ? reject(err) : resolve({ stdout }));
    }) })
  : require('find-process');
const os = require('os');
const fs = require('fs');

//GUI 6.1 keeps everything under its own folder (shared/appPaths.js), Electron's userData and logs
//too: set before anything (electron-log, electron-updater, the session, IndexedDB) reads them.
//electron-log asks for app.getPath('logs') when it is loaded, and Electron creates that folder
//(~/.config/epic-desktop-wallet/logs) unless setAppLogsPath came first: so it is required below.
const rootInfo = resolveRoot({ platform: process.platform, env: process.env, home: os.homedir(), pathMod: path,
  readFile: (f) => fs.readFileSync(f, 'utf8') });
const appLayout = layout(rootInfo.root, path);
app.setPath('userData', appLayout.userData);
app.setAppLogsPath(appLayout.logsDir);

//one app at a time: a second start hands over to the first (second-instance below) and quits at
//once, before it opens a window, scans or stops any process
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) {
  app.exit(0);
}

fs.mkdirSync(appLayout.logsDir, { recursive: true });
const log = require('electron-log');
log.transports.file.resolvePath = () => path.join(appLayout.logsDir, 'main.log');
//on by default at debug, bounded: 2 MiB, then main.log becomes main.old.log (one archive)
log.transports.file.level = 'debug';
log.transports.file.maxSize = 2 * 1024 * 1024;
//no wallet password in any log line (src/logRedact.js)
require('./logRedact').installLogRedaction(log);
require('./logRedact').installConsoleRedaction(console);

const {autoUpdater} = require("electron-updater");
autoUpdater.channel = "latest";
//setting the channel turns on downgrades: an older release would be offered as an update
autoUpdater.allowDowngrade = false;
autoUpdater.allowPrerelease = false;
autoUpdater.autoDownload = false;
let win;
let noderuninbackground = false;

//requests from the main process (the node list, node checks) and the page don't name the app or
//its version: a plain browser user agent, as the preload's price and IP lookups send
app.userAgentFallback = 'Mozilla/5.0';

//the dev server in development (electron:serve), else '' (the app is served on app://)
const devServer = process.env.WEBPACK_DEV_SERVER_URL || '';
//a test run's ports (EPIC_GUI_TEST + EPIC_GUI_TEST_PORT_OFFSET, shared/testPorts.js); nothing in normal use
if (portOffset()) console.log('test run: ports moved by ' + portOffset() + ', owner API ' + ownerApiPort())
const csp = contentSecurityPolicy({ dev: !!devServer, devServer: devServer ? new URL(devServer).origin : '' });


contextMenu({
	showSaveImageAs: true
});

//-------------------------------------------------------------------
// Logging
//
// THIS SECTION IS NOT REQUIRED
//
// This logging setup is not required for auto-updates to work,
// but it sure makes debugging easier :)
//-------------------------------------------------------------------
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'debug';
//what support needs to place a log: versions and the system, never a path or a name
log.info('App starting: ' + app.getVersion() + (app.isPackaged ? '' : ' (dev)') + ', electron ' + process.versions.electron
  + ', ' + process.platform + ' ' + os.release() + ' ' + process.arch + ', folder: ' + rootInfo.source);


async function kill(pid){
  return new Promise(function(resolve, reject) {
    let iskilled;
    if (process.platform === 'win32') {
        //no cmd.exe and no console window
        execFile('taskkill', ['/pid', String(Number(pid)), '/f', '/t'], {windowsHide: true}, function( err ) {
           if (err) {
             resolve(false);
           }
           else {

             resolve(true);
           }
       });

    }else{
      //check if 3 seconds for node server is to short and makes problems
      ps.kill(pid, {timeout: 3},function( err ) {
          if (err) {
            resolve(false);
          }
          else {

            resolve(true);
          }
      });
    }
  });
}


//the processes the app started, recorded by the preload (see shared/processOwnership.js)
const ownProcesses = createProcessRegistry({
  fs,
  file: appLayout.processesFile,
  findProcess,
  kill,
  win: process.platform === 'win32',
  //a record missing from a scan is forgotten only once this says its pid is gone
  pidAlive: createPidCheck({win: process.platform === 'win32', processKill: process.kill.bind(process), execFile}),
  warn: (msg) => log.warn(msg),
  selfPid: process.pid,
});

/*
 * The wallet password of the unlocked session (shared/sessionSecret.js): set by the renderer once
 * after an unlock, never sent back; wiped at lock, logout, wallet switch, quit, reload and crash.
 * The listeners and init/recover run on a pseudo-terminal here (shared/ptyHost.js), which answers
 * their password prompt with it.
 */
const sessionSecret = createSessionSecret();

/* node-pty, not bundled: from resources/node-pty in the installed app (vue.config.js ptyExtra),
   from node_modules in development */
function loadPty(){
  /* global __non_webpack_require__ */
  return __non_webpack_require__(app.isPackaged ? path.join(process.resourcesPath, 'node-pty') : 'node-pty');
}

//only the app's own epic-wallet in resources/bin (as the preload finds it) is started on the pty
const bundledBinDir = path.resolve(!process.env.NODE_ENV || process.env.NODE_ENV === 'production'
  ? process.resourcesPath : path.join(__dirname, '../resources/'), 'bin') + path.sep;
function isBundledWallet(cmd){
  const b = path.resolve(String(cmd || ''));
  const win = process.platform === 'win32';
  const inside = win ? b.toLowerCase().startsWith(bundledBinDir.toLowerCase()) : b.startsWith(bundledBinDir);
  return inside && /^epic-wallet(\.exe)?$/i.test(path.basename(b));
}

const ptyHost = createPtyHost({
  loadPty,
  isAllowedBin: isBundledWallet,
  spawn: require('child_process').spawn,
  killTree: kill,
  win: process.platform === 'win32',
  log: { info: (m) => log.info(m), warn: (m) => log.warn(m) },
  env: process.env,
});

/* ---- Tor (docs/plans/tor-616.md): the open wallet's own tor, run by this process (shared/torManager.js) ----
   The bundle is in resources/bin/<platform>/tor-bundle (scripts/fetch-tor.mjs); without it the
   state is failed: missing. Paths and ports come from the wallet's record in settings.json, never
   from the page. */
const isWin = process.platform === 'win32';
const binPlatform = isWin ? 'win' : process.platform === 'darwin' ? (process.arch === 'arm64' ? 'macsilicon' : 'mac') : 'linux';
const torBundleDir = path.join(bundledBinDir, binPlatform, 'tor-bundle');
const nodeNet = require('net');
const nodeCrypto = require('crypto');
function torBin(){
  const f = path.join(torBundleDir, isWin ? 'tor.exe' : 'tor');
  try { return fs.statSync(f).isFile() ? f : ''; } catch (e) { return ''; }
}
/* does something answer on 127.0.0.1:port (the wallet's HTTP listener) */
function portAnswers(port){
  return new Promise((resolve) => {
    const s = nodeNet.connect({ host: '127.0.0.1', port });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(3000, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}
function freePort(){
  return new Promise((resolve, reject) => {
    const srv = nodeNet.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}
/* a wallet as settings.json records it, or null */
function walletRecord(walletId){
  try {
    const s = JSON.parse(fs.readFileSync(appLayout.settingsFile, 'utf8'));
    const w = (Array.isArray(s && s.wallets) ? s.wallets : []).find(x => x && x.id === walletId);
    if (!w || typeof w.configDir !== 'string' || typeof w.dataDir !== 'string' || !path.isAbsolute(w.configDir)
      || !path.isAbsolute(w.dataDir) || !['mainnet', 'floonet', 'usernet'].includes(w.network)) return null;
    return w;
  } catch (e) {
    return null;
  }
}
const torManager = createTorManager({
  spawn, connect: (o) => nodeNet.connect(o), fs, join: path.join,
  sha512: (b) => nodeCrypto.createHash('sha512').update(b).digest(),
  kill, record: (pid, cmd, args) => ownProcesses.record(pid, cmd, args), forget: (pid) => ownProcesses.forget(pid),
  torBin, libDir: torBundleDir, win: isWin, ownerPid: process.pid, checkPort: portAnswers, env: process.env,
  //test runs only (EPIC_GUI_TEST=1): shorter watchdogs for the e2e gate; {} otherwise
  timings: torTimingsFromEnv(process.env),
  onStatus: (s) => { if (win && !win.isDestroyed()) win.webContents.send('tor-status', s); },
  log: { info: (m) => log.info(m), warn: (m) => log.warn(m) },
});

/* what a one-shot key run (shared/torKeys.js) left after a crash: its epic-wallet (recorded, role
   listen in <configDir>/tor-keys; quit stops it with the other listeners) and its toml with
   use_tor_listener = true. walletId: only that wallet's, else every wallet's (the app's start) */
async function cleanTorKeysLeftovers(walletId){
  let wallets = [];
  try {
    const s = JSON.parse(fs.readFileSync(appLayout.settingsFile, 'utf8'));
    wallets = (Array.isArray(s && s.wallets) ? s.wallets : []).filter(w => w && typeof w.configDir === 'string'
      && path.isAbsolute(w.configDir) && (!walletId || w.id === walletId));
  } catch (e) { /* no settings yet */ }
  for (const w of wallets) {
    const keysDir = path.join(w.configDir, KEYS_DIR);
    try {
      const left = await ownProcesses.list(['listen'], { dir: keysDir });
      if (left.length) {
        await ownProcesses.stop(left);
        log.info('tor keys: stopped a leftover key run ' + left.map(p => p.pid).join(', '));
      }
    } catch (e) { /* the scan failed */ }
    try { fs.unlinkSync(path.join(keysDir, 'epic-wallet.toml')); } catch (e) { /* not there */ }
  }
}

/* on quit: stop the wallet, listener (and the short-lived one that checks an old Epicbox server),
   scan and node processes the app started, except the node when it runs in the background, the
   wallet's tor, and a Tor an older version's listener left. Nothing the app did not start. */
async function stopOwnProcesses(){
  sessionSecret.wipe();
  await torManager.stop().catch(() => {});
  const roles = ['owner_api', 'listen', 'scan', 'epicbox',
    ...(noderuninbackground ? [] : ['node'])];
  try{
    const owned = await ownProcesses.list(roles, {tor: true});
    const results = await ownProcesses.stop(owned);
    log.info('quit: stopped ' + owned.map((p, i) => p.pid + ' ' + p.name + (results[i] ? '' : ' (failed)')).join(', '));
  }catch(e){
    log.info('quit: could not stop the app processes: ' + (e && e.message));
  }
  //init / recover still running (they are not in the process record)
  await ptyHost.killAll().catch(() => {});
}

//stopOwnProcesses once, on every way out (shared/shutdown.js): quit events and signals
const shutdown = createShutdown({ stop: stopOwnProcesses, quit: () => app.quit(), exit: (c) => app.exit(c),
  log: (m) => log.info(m) });
if (primaryInstance) {
  app.on('before-quit', (event) => shutdown.onQuitEvent(event));
  app.on('will-quit', (event) => shutdown.onQuitEvent(event));
  for (const signal of SIGNALS) process.on(signal, () => shutdown.onSignal(signal));
}

//[13088:0215/073859.040:ERROR:gpu_init.cc(454)] Passthrough is not supported, GL is disabled, ANGLE is
app.disableHardwareAcceleration();

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])


//serve the app files on app:// (replaces the plugin's createProtocol, which uses the deprecated registerBufferProtocol)
function createProtocol(scheme){
  protocol.handle(scheme, async (req) => {
    let reqPath = path.normalize(new URL(req.url).pathname);
    if(reqPath === '/' || reqPath === '\\'){
      reqPath = '/index.html';
    }
    const filePath = path.join(__dirname, reqPath);
    if(!filePath.startsWith(__dirname + path.sep)){
      return new Response(null, {status: 404});
    }
    //every file with the page's Content-Security-Policy (shared/security.js)
    const res = await net.fetch(pathToFileURL(filePath).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', csp);
    return new Response(res.body, {status: res.status, statusText: res.statusText, headers});
  });
}

/*
 * The window shows the app and nothing else: no navigation away from it (a link without a handler,
 * a redirect), no new windows, no <webview>, no permission prompts (camera, notifications...).
 * An http(s) link goes to the system browser instead (openExternal below).
 */
function openExternal(url){
  const u = httpUrl(url);
  if (!u) {
    log.info('open-external: refused a link that is not http(s)');
    return false;
  }
  shell.openExternal(u).catch((e) => log.info('open-external failed: ' + (e && e.message)));
  return true;
}
app.on('web-contents-created', (event, contents) => {
  const guard = (e, url) => {
    if (isAppUrl(url, devServer)) return;
    e.preventDefault();
    openExternal(url);
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.on('will-attach-webview', (e) => e.preventDefault());
  //a link that would open a new app window (target=_blank, middle-click, window.open) opens in the
  //browser instead; the new window would have this window's preload and powers
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
});

/* the page's Content-Security-Policy on the dev server's files too (app:// sets it in createProtocol);
   no permission is ever granted to the page (it asks for none: the clipboard goes through IPC) */
function secureSession(ses){
  if (devServer) {
    const origin = new URL(devServer).origin;
    ses.webRequest.onHeadersReceived({ urls: [origin + '/*'] }, (details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
    });
  }
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
}

async function createWindow() {
  // Create the browser window.

  win = new BrowserWindow({
    width: 1044,
    height: 768,
    minWidth: 1044,
    maxWidth: 1600,
    title: "Epiccash Wallet",//fix in index.html
    //the window colour before the first paint, the same near-black in both interfaces
    backgroundColor: '#08080a',
    webPreferences: {
      icon: path.join(__dirname, '../public/favicon.ico'),
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: false,
      contextIsolation: true,
      /* not sandboxed: the preload is the app's process layer. It starts and stops epic, epic-wallet
         and keeps the record of them (shared/processOwnership.js), reads and writes the
         settings and the wallets' tomls for configService (sync calls, all through the renderer),
         checks ports and writes the log file: a sandboxed preload has no Node.js modules for any of
         that. Turning the sandbox on means moving all of it into this process behind IPC.
         What the page can reach instead is limited: the preload exposes no child_process and no
         plain fs (window.nodeFs is limited to the app's folders, shared/security.js), starts only
         the app's own binaries, and the page can only run the app's own code (CSP below, no
         navigation, no new windows, no remote content) */
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
    }
  });

  //a reload (the interface switch) or a crashed renderer: that session is over
  wipeWithWindow(win.webContents, sessionSecret);
  //and its tor: the page that turned it on is gone
  for (const e of ['did-navigate', 'render-process-gone', 'destroyed']) win.webContents.on(e, () => { torManager.stop().catch(() => {}); });

  //minimized or hidden: the page polls the node less (shared/nodePoll.js). The window's own events,
  //because the page's document.hidden does not change on every desktop (Linux: QA lanes, some WMs)
  const sendHidden = (hidden) => { if (win && !win.isDestroyed()) win.webContents.send('window-hidden', hidden); };
  win.on('minimize', () => sendHidden(true));
  win.on('hide', () => sendHidden(true));
  win.on('restore', () => sendHidden(false));
  win.on('show', () => sendHidden(win.isMinimized()));


  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')
    //a missing or unreadable feed means no update, without a notice
    autoUpdater.checkForUpdates().catch((err) => log.info('update check failed: ' + (err && err.message)));

  }



  if (!isDevelopment) {
    setAppMenu();
  }else{
    console.log(win);
  }
  return win;
}



// Quit when all windows are closed.
app.on('window-all-closed', async() => {

  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {

    if (primaryInstance) await shutdown.run();
    app.quit()
  }

});

/*autoUpdater.on('checking-for-update', () => {

  sendStatusToWindow('Checking for update...');
})*/
autoUpdater.on('update-available', (info) => {

  const dialogOpts = {
        type: 'info',
        buttons: ['Ok'],
        title: 'Update available.',
        message: 'Version ' + info.version,
        detail: 'A New Version is available for download.\nhttps://github.com/EpicCash/epic-gui-wallet/releases/latest'
  }

  dialog.showMessageBox(dialogOpts);

  //sendStatusToWindow('Update available.');
})
autoUpdater.on('update-not-available', (info) => {
  console.log("no update available");
  //sendStatusToWindow('Update not available.');
})
autoUpdater.on('error', (err) => {
  log.info('update check error: ' + (err && err.message));
});
/*autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  sendStatusToWindow(log_message);
})*/
/*autoUpdater.on('update-downloaded', (info) => {

  const dialogOpts = {
        type: 'info',
        buttons: ['Restart', 'Not Now. On next Restart'],
        title: 'Update',
        message: process.platform === 'win32' ? releaseNotes : releaseName,
        detail: 'A New Version has been Downloaded. Restart Now to Complete the Update.'
    }

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) autoUpdater.quitAndInstall()
    })

  //sendStatusToWindow('Update downloaded');
});*/


//the importer's temp copy (<root>/tmp/import): removed now; what the reading session still locks
//(Windows, until this process exits) a detached cleaner removes right after the exit, else the next start.
//After a read the cleaner runs even when the copy is gone now: Chromium flushes the reading session's
//caches into it again as the app exits (Linux too). The cleaner removes only the copies named to it
//(this run's, and any left now), never one a next start of the app is reading
const importCopies = new Set();
app.on('will-quit', () => {
  //once the processes are stopped (shutdown holds the first will-quit until then)
  if (!primaryInstance || !shutdown.done) return;
  try {
    const left = importCopyNames({ fs, path, root: appLayout.root });
    if (!cleanImportNow({ fs, path, root: appLayout.root }) || importCopies.size) {
      log.info('import temp copy: removed after the exit');
      spawnAfterExitCleaner({ spawn, execPath: process.execPath, pid: process.pid, root: appLayout.root,
        names: [...new Set([...importCopies, ...left])], env: process.env, log: (m) => log.info(m) });
    }
  } catch (e) { /* never holds up the quit */ }
});

//someone started the app again: show this window instead
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (primaryInstance && BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async (event) => {
  if (!primaryInstance) return;
  secureSession(session.defaultSession);
  //a temp copy of an old profile that couldn't be removed at quit (Windows file locks: the reading
  //session holds its leveldb until the app exits); a scan waits for this, so a retry never meets a new copy
  leftoverImportCleanup = cleanLeftoverImport({ fs, path, root: appLayout.root, log: (m) => log.info(m) }).catch(() => false);
  cleanTorKeysLeftovers().catch(() => {});
  //console.log('app', noderuninbackground);
  console.log('noderuninbackground', noderuninbackground);

  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    setTimeout(() => {
      try {

        //loaded here, in development only: on import it reads app.getPath('userData') before
        //background.js has set it, which creates ~/.config/epic-desktop-wallet
        const { default: installExtension, VUEJS3_DEVTOOLS } = require('electron-devtools-installer');
        installExtension(VUEJS3_DEVTOOLS) .then(name => {
          console.log(`Added Extension: ${name}`)
          // get main window
          const win = BrowserWindow.getFocusedWindow()
          if (win) {
            win.webContents.on('did-frame-finish-load', () => {
              win.webContents.once('devtools-opened', () => {
                win.webContents.focus()
              })
              // open electron debug
              console.log('Opening dev tools')
              win.webContents.openDevTools()
            })
          }
        })
        .catch(err => {
          console.log('An error occurred: ', err)
        })

      } catch (e) {
        console.error('Vue Devtools failed to install:', e.toString())
      }
    }, 250)
  }

  createWindow()
})


// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  }
  //SIGTERM: shutdown above
}


ipcMain.handle('show-save-dialog', async (event, title, message, defaultPath) => {
    if (!fromAppWindow(event)) return { canceled: true };
    let responce = await dialog.showSaveDialog({
      title: title,
      message: message,
      defaultPath: defaultPath
    });
    return responce;
});

ipcMain.handle('show-open-dialog', async (event, title, message, defaultPath) => {
    if (!fromAppWindow(event)) return { canceled: true, filePaths: [] };
    let responce = await dialog.showOpenDialog({
      properties:["openDirectory", "showHiddenFiles", "createDirectory"]
    });
    return responce;
});

//the folders, for the preload (sync: it needs them before the page loads)
ipcMain.on('app-paths', (event) => {
  event.returnValue = {
    root: appLayout.root,
    source: rootInfo.source,
    defaultRoot: rootInfo.defaultRoot,
    settingsFile: appLayout.settingsFile,
    walletsDir: appLayout.walletsDir,
    userData: appLayout.userData,
    logsDir: appLayout.logsDir,
    processesFile: appLayout.processesFile,
    //older GUIs' files, read only by the importer
    legacy: legacyPaths({ platform: process.platform, env: process.env, home: os.homedir(), appData: app.getPath('appData'), pathMod: path }),
  };
});

//the removal of a leftover <root>/tmp/import at start (app 'ready')
let leftoverImportCleanup = Promise.resolve(true);

//first start, or Advanced > Import: find older GUIs' wallets and read their profiles (read only).
//The renderer passes only `known` (dirs to skip); every path that is read is worked out here.
//one scan at a time: a second one would remove the first one's copy at its start
let legacyScanRunning = Promise.resolve();
ipcMain.handle('legacy-scan', (event, args) => {
  if (!fromAppWindow(event)) return { wallets: [], chains: [], profiles: [] };
  const run = legacyScanRunning.catch(() => {}).then(() => legacyScan(args));
  legacyScanRunning = run;
  return run;
});
async function legacyScan({ known, chainsOnly } = {}){
  await leftoverImportCleanup;
  const legacy = legacyPaths({ platform: process.platform, env: process.env, home: os.homedir(), appData: app.getPath('appData'), pathMod: path });
  //Settings, the built-in node switched on: only the chain data, no wallets and no profile copy
  //each with inUse: another Epic program holds its lock ('locked'), or it couldn't be checked ('unknown')
  if (chainsOnly) {
    const chains = scanChains({ fs, pathMod: path, legacy });
    return { chains: await Promise.all(chains.map(async c => ({ ...c, inUse: (await folderLock.check('chain', c.dir)).state }))) };
  }
  const scan = scanLegacy({ fs, pathMod: path, legacy, known: Array.isArray(known) ? known.filter(k => typeof k === 'string') : [] });
  //the old IndexedDB is read (from a copy) only when there is something to import
  const profiles = scan.wallets.length ? await readLegacyProfiles({ session, BrowserWindow, fs, path, root: appLayout.root,
    tmpDir: path.join(appLayout.root, 'tmp', 'import'), profiles: legacy.profiles, log: (m) => log.info(m), onCopy: (n) => importCopies.add(n) }) : [];
  return { ...scan, profiles };
}

//Open a wallet folder: the dialog starts in ~/.epic when there is one, and what was picked is worked
//out here to the wallet folder(s) it means (shared/walletFolder.js). title: the renderer's, localized
//→ {canceled, picked, wallets: [{dir, network}], chainOnly}
ipcMain.handle('pick-wallet-folder', async (event, title) => {
  if (!fromAppWindow(event)) return { canceled: true, wallets: [] };
  const { epicDir } = legacyPaths({ platform: process.platform, env: process.env, home: os.homedir(), appData: app.getPath('appData'), pathMod: path });
  const res = await dialog.showOpenDialog({
    title: typeof title === 'string' && title ? title.slice(0, 200) : undefined,
    defaultPath: fs.existsSync(epicDir) ? epicDir : undefined,
    properties: ['openDirectory', 'showHiddenFiles'],
  });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { canceled: true, picked: '', wallets: [], chainOnly: false };
  return resolveWalletFolder({ fs, pathMod: path, picked: res.filePaths[0] });
});

//Is another program using a folder (shared/folderLock.js: tries the lock the epic node and epic-wallet
//hold while they run)? kind 'wallet' (holds wallet_data) | 'chain' (a chain_data folder). Nothing is
//created, written or kept locked. → {state: 'free' | 'locked' | 'unknown', files: [{file, state}], via}
const folderLock = createFolderLock({ fs, pathMod: path, platform: process.platform, env: process.env,
  log: (m) => log.warn(m),
  run: (file, args, opts) => new Promise((resolve, reject) => {
    execFile(file, args, { ...opts, windowsHide: true, maxBuffer: 64 * 1024 }, (err, stdout) => err ? reject(err) : resolve({ stdout }));
  }) });
ipcMain.handle('folder-lock', async (event, kind, dir) => {
  if (!fromAppWindow(event) || !LOCK_KINDS.includes(kind)) return { state: 'unknown', files: [], via: 'none' };
  if (typeof dir !== 'string' || !dir || dir.length > 4096 || dir.includes('\0') || !path.isAbsolute(dir)) return { state: 'unknown', files: [], via: 'none' };
  const r = await folderLock.check(kind, dir);
  if (r.state !== 'free') log.info('folder-lock ' + kind + ' ' + r.state + ' (' + r.via + '): ' + r.files.filter(f => f.state !== 'free').map(f => f.file).join(', '));
  return r;
});

//Quit from the renderer (the settings-error screen, which has no wallet and no menu of its own): the
//same way out as the menu's Quit, own processes stopped first (feedback #31: there was no handler)
ipcMain.handle('quit', async (event) => {
  if (!fromAppWindow(event)) return;
  await shutdown.run();
  app.quit();
});

//start again, after another app folder was chosen (it is read only at start)
ipcMain.handle('app-relaunch', async (event) => {
  if (!fromAppWindow(event)) return;
  await shutdown.run();
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('locale', async() => {
  return await app.getLocale();
});
//after switching between the Modern and Classic interface: start the renderer again at index.html
//(a reload of the current history-mode path would not resolve under app://)
ipcMain.handle('reload-ui', (event) => {
  if (!fromAppWindow(event)) return;
  if (process.env.WEBPACK_DEV_SERVER_URL) win.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
  else win.loadURL('app://./index.html');
});

ipcMain.handle('version', () => {
  let currentVersion = '';
  if (process.env.NODE_ENV === 'development') {
     currentVersion = require('../package.json').version;
   } else {
     currentVersion = app.getVersion();
   }
   return currentVersion;

});



//public node list from status.btlabs.uk (shared/nodeDirectory.js): a plain GET of public data from
//the main process, short timeout, short cache; always resolves, to the list or null
const nodeDirectory = createDirectory({ fetch: (url, opts) => net.fetch(url, opts), timeoutMs: 4000 });
ipcMain.handle('node-directory', async (event, chain) => {
  try {
    return await nodeDirectory.get(String(chain));
  } catch (e) {
    return null;
  }
});

//this computer's LAN and public address for Settings › Receiving › Receive from the internet
//(shared/netAddresses.js): read-only; the public one from a fixed URL, cached
const addressLookup = createAddressLookup({ fetch: (url, opts) => net.fetch(url, opts), interfaces: networkInterfaces });
ipcMain.handle('direct-addresses', async (event) => {
  if (!fromAppWindow(event)) return { lan: [], public: '' };
  try {
    return await addressLookup.get();
  } catch (e) {
    return { lan: [], public: '' };
  }
});

//only the app's own window may ask the main process to open things, send requests, show dialogs,
//write the clipboard or restart (there is no other window: new windows and webviews are refused)
const fromAppWindow = (event) => !!win && !win.isDestroyed() && event.sender === win.webContents;

//the app menu (shared/appMenu.js): Lock wallet is enabled while the renderer reports an unlocked
//wallet; its click locks the way the Lock button does (the renderer's app.logout)
let menuStateNow = menuState({});
function setAppMenu() {
  if (isDevelopment) return;
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate({
    platform: process.platform,
    labels: menuStateNow.labels,
    unlocked: menuStateNow.unlocked,
    onLock: () => { if (win && !win.isDestroyed()) win.webContents.send('menu-lock'); },
    onQuit: async () => { await shutdown.run(); app.quit(); },
    onSource: () => shell.openExternal('https://github.com/EpicCash/epic-gui-wallet'),
    onSupport: () => { if (win && !win.isDestroyed()) win.webContents.send('open-support'); },
  })));
}
ipcMain.on('menu-state', (event, data) => {
  if (!fromAppWindow(event)) return;
  const next = menuState(data);
  if (JSON.stringify(next) === JSON.stringify(menuStateNow)) return;
  menuStateNow = next;
  setAppMenu();
});

/* ---- support reports (docs/support/DESIGN.md): preview, then send or save on the user's click ----
   The logs are cleaned here (shared/logSanitize.js) and sealed to the developer's public key
   (shared/supportBundle.js); the page only ever sees the cleaned text it shows the user. */
const support = createSupport({
  fs, path, logsDir: appLayout.logsDir, root: appLayout.root,
  wallets: () => {
    try {
      const s = JSON.parse(fs.readFileSync(appLayout.settingsFile, 'utf8'));
      return Array.isArray(s && s.wallets) ? s.wallets : [];
    } catch (e) {
      return [];
    }
  },
  app: () => supportApp,
  sanitize: (text, { ids, description } = {}) => {
    const base = { home: os.homedir(), username: os.userInfo().username, hostname: os.hostname(), keepHosts: KNOWN_PUBLIC_HOSTS, ids };
    //the user's own description: not checked against the password (the preview would tell the page
    //whether a guess was the password)
    if (description) return sanitizeText(text, base);
    //the unlocked wallet's password, should it ever be in a log line: removed as it is
    const pw = sessionSecret.copy();
    try {
      return sanitizeText(text, Object.assign(base, { secrets: pw && pw.length >= 4 ? [pw.toString('utf8')] : [] }));
    } finally {
      if (pw) pw.fill(0);
    }
  },
  publicKey: SUPPORT_PUBLIC_KEY,
  //only the sealed bundle leaves this computer (description, contact and logs are all inside it), and
  //the app version beside it, so the developer's ping can say which version sent the report
  post: async (bytes) => {
    const url = supportUrl(process.env, { packaged: app.isPackaged });
    if (!url) return { ok: false, error: 'no-endpoint' };
    const res = await net.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ v: 2, bundle: bytes.toString('base64'), app: app.getVersion() }), redirect: 'error', signal: AbortSignal.timeout(60000) });
    return intakeResult(res.status, await res.text().catch(() => ''));
  },
  randomToken: () => require('crypto').randomBytes(16).toString('hex'),
});
let supportApp = {};
const short = (v) => String(v == null ? '' : v).replace(/[^\w .:/()-]/g, '').slice(0, 40);
ipcMain.handle('support-preview', (event, opts) => {
  if (!fromAppWindow(event)) return null;
  const o = opts && typeof opts === 'object' ? opts : {};
  supportApp = { version: app.getVersion(), electron: process.versions.electron, platform: process.platform,
    release: os.release(), arch: process.arch, locale: app.getLocale(), ui: short(o.ui), lang: short(o.lang) };
  const p = Object.assign(support.preview({ attachLogs: o.attachLogs === true, description: typeof o.description === 'string' ? o.description : '' }),
    { canSend: !!supportUrl(process.env, { packaged: app.isPackaged }) });
  log.info('support: preview, ' + p.files.length + ' log(s), ' + Math.round(p.totalBytes / 1024) + ' KiB');
  return p;
});
ipcMain.handle('support-send', async (event, req) => {
  if (!fromAppWindow(event)) return { ok: false, error: 'server' };
  const r = req && typeof req === 'object' ? req : {};
  const res = await support.send({ token: r.token, description: r.description, contact: r.contact });
  log.info('support: send ' + (res.ok ? 'ok, report ' + res.id : 'failed: ' + res.error));
  return res;
});
ipcMain.handle('support-save', async (event, req) => {
  if (!fromAppWindow(event)) return { ok: false, error: 'server' };
  const r = req && typeof req === 'object' ? req : {};
  const res = await support.save({ token: r.token, description: r.description, contact: r.contact }, async (bytes) => {
    const day = new Date().toISOString().slice(0, 10);
    const pick = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), 'epic-wallet-report-' + day + '.epicsupport'),
      filters: [{ name: 'Epic Wallet report', extensions: ['epicsupport'] }] });
    if (pick.canceled || !pick.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(pick.filePath, bytes, { mode: 0o600 });
      return { ok: true, path: pick.filePath };
    } catch (e) {
      return { ok: false, error: 'write' };
    }
  });
  log.info('support: save ' + (res.ok ? 'ok' : res.canceled ? 'canceled' : 'failed: ' + res.error));
  return res;
});

//a link from the page (About, Credits, the node notice and list): http(s) only, in the system browser
ipcMain.handle('open-external', (event, url) => fromAppWindow(event) && openExternal(url));

//a folder from the page (the wallet location, Settings): an existing folder of the app or of a
//listed wallet, in the file manager. Never a file: shell.openPath would run a program
ipcMain.handle('open-folder', async (event, dir) => {
  if (!fromAppWindow(event) || typeof dir !== 'string' || !path.isAbsolute(dir)) return false;
  const known = [appLayout.root, rootInfo.defaultRoot, appLayout.logsDir];
  try {
    const s = JSON.parse(fs.readFileSync(appLayout.settingsFile, 'utf8'));
    for (const w of Array.isArray(s && s.wallets) ? s.wallets : []) {
      for (const d of [w && w.configDir, w && w.dataDir]) if (typeof d === 'string' && d) known.push(d);
    }
  } catch (e) { /* no settings yet: the app's folders only */ }
  const target = path.resolve(dir);
  let isDir = false;
  try { isDir = fs.statSync(target).isDirectory(); } catch (e) { /* not there */ }
  //a macOS bundle is a folder that openPath would launch, not show
  const bundle = target.split(/[\\/]/).some(part => /\.(app|bundle|framework|plugin|prefpane|kext|workflow|action|saver|qlgenerator|mdimporter|appex)$/i.test(part));
  if (!isDir || bundle || !known.some(d => isInside(target, d, path))) {
    log.info('open-folder: refused a path that is not an app or wallet folder');
    return false;
  }
  const err = await shell.openPath(target);
  return !err;
});

/* Tor for the unlocked wallet (docs/plans/tor-616.md §4):
     tor-start {walletId, onion}: only the wallet whose password the session holds; its dirs, network
       and listener port from settings.json; the onion from the page (get_public_proof_address), which
       only selects which of the wallet's own key files is used (torManager checks the key is that
       onion's); waitListener: the page's listener is down because of the node, tor bootstraps and
       waits for it (torManager error node). → {ok, status} | {ok: false, error}
     tor-stop {walletId} (only that wallet's tor; '' any), tor-retry → status; 'tor-status' events carry every change
     tor-foreign {onion, method, params, isolation}: check_version / receive_tx to the onion's
       /v2/foreign over the wallet's tor (shared/torForeign.js) → {ok, result} | {ok: false, code, detail} */
ipcMain.handle('tor-start', async (event, req) => {
  if (!fromAppWindow(event) || !req || typeof req !== 'object') return { ok: false, error: 'refused' };
  const wallet = walletRecord(String(req.walletId || ''));
  if (!wallet) return { ok: false, error: 'no wallet' };
  if (!sessionSecret.has() || path.resolve(sessionSecret.dir()) !== path.resolve(wallet.dataDir)) return { ok: false, error: 'locked' };
  const onion = parseOnion(req.onion);
  if (!onion.valid) return { ok: false, error: 'invalid' };
  //a tor this wallet's earlier session left (a crash): it holds the data dir's lock
  try {
    const left = (await ownProcesses.list(['tor'], { dir: wallet.configDir })).filter(p => p.pid !== torManager.pid());
    if (left.length) {
      await ownProcesses.stop(left);
      log.info('tor: stopped a leftover tor ' + left.map(p => p.pid).join(', '));
    }
  } catch (e) { /* the scan failed: tor says so itself if its data dir is busy */ }
  await cleanTorKeysLeftovers(wallet.id).catch(() => {});
  const settings = wallet.settings || {};
  const nodeUrl = /^https?:\/\//.test(String(settings.check_node_api_http_addr || '')) ? settings.check_node_api_http_addr : '';
  let template = '';
  try { template = fs.readFileSync(path.join(bundledBinDir, '..', 'epic-wallet.toml'), 'utf8'); } catch (e) { /* keys fail with the reason */ }
  const status = await torManager.start({
    walletId: wallet.id, configDir: wallet.configDir, dataDir: wallet.dataDir, onion: onion.host,
    listenerPort: networkPorts(wallet.network).walletListener, waitListener: req.waitListener === true,
    ensureKey: ({ socksPort, signal }) => ensureOnionKey({ ptyHost, password: () => sessionSecret.copy(), signal,
      record: (pid, cmd, args) => ownProcesses.record(pid, cmd, args), forget: (pid) => ownProcesses.forget(pid),
      bin: path.join(bundledBinDir, binPlatform, isWin ? 'epic-wallet.exe' : 'epic-wallet'), fs, join: path.join, freePort,
      template, wallet: { network: wallet.network, configDir: wallet.configDir, dataDir: wallet.dataDir, nodeUrl }, onion: onion.host, socksPort,
      log: (m) => log.info(m) }),
  });
  return { ok: true, status };
});
ipcMain.handle('tor-stop', async (event, req) => {
  if (!fromAppWindow(event)) return null;
  //a late stop of a wallet that is no longer open leaves the open one's tor alone
  return torManager.stop({ walletId: String((req && req.walletId) || '') });
});
ipcMain.handle('tor-retry', async (event) => {
  if (!fromAppWindow(event)) return null;
  return torManager.retry();
});
ipcMain.handle('tor-foreign', async (event, req) => {
  if (!fromAppWindow(event)) return { ok: false, code: 'refused', detail: '' };
  if (!sessionSecret.has()) return { ok: false, code: 'tor_off', detail: 'locked' };
  const r = checkForeignRequest(req);
  if (r.error) return { ok: false, code: r.error === 'invalid' ? 'invalid' : 'refused', detail: r.error };
  const started = Date.now();
  const res = await foreignCall({ connect: (o) => nodeNet.connect(o), socksPort: torManager.socksPort(), onion: r.onion, body: r.body,
    user: r.user || 'epic-' + nodeCrypto.randomBytes(8).toString('hex') });
  //the method and the outcome only: never the slate, never the address
  log.info('tor: ' + req.method + ' ' + (res.ok ? 'answered' : 'failed: ' + res.code + (res.detail ? ' (' + res.detail + ')' : ''))
    + ' in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
  return res;
});

//a node API call for the page (shared/nodeFetch.js; what may be sent: shared/security.js
//nodeRequest). The page's own CSP allows the wallet API on this machine only
const NODE_REPLY_MAX = 1024 * 1024;
ipcMain.handle('node-fetch', (event, req) => {
  if (!fromAppWindow(event)) return { error: 'not allowed' };
  const r = nodeRequest(req);
  return r.error ? { error: r.error } : nodeHttp(r);
});

/* {status, text} | {error, timeout}. net.request, not net.fetch: net.fetch rejects a redirect it is
   told not to follow, net.request reports its status, so a node behind a redirect (http -> https)
   reads as one (nodeVersion.js 'redirects elsewhere'), not as a node that doesn't answer */
function nodeHttp(r){
  return new Promise((resolve) => {
    let settled = false;
    let req = null;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => {
      finish({ error: 'timeout', timeout: true });
      try { req.abort(); } catch (e) { /* done */ }
    }, r.timeoutMs);
    try {
      //a request with the local node's secret never follows a redirect, wherever it points
      const manual = r.redirect !== 'follow' || 'Authorization' in r.headers;
      req = net.request({ url: r.url, method: r.method, redirect: manual ? 'manual' : 'follow', credentials: 'omit', useSessionCookies: false, cache: 'no-store' });
      for (const [k, v] of Object.entries(r.headers)) req.setHeader(k, v);
      //emitted in 'follow' mode too, where it is followed by itself
      req.on('redirect', (statusCode) => {
        if (!manual) return;
        finish({ status: statusCode, text: '' });
        req.abort();
      });
      req.on('response', (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size <= NODE_REPLY_MAX) chunks.push(c);
        });
        res.on('end', () => finish({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', () => finish({ error: 'not reachable', timeout: false }));
      });
      req.on('error', () => finish({ error: 'not reachable', timeout: false }));
      req.end(r.body);
    } catch (e) {
      finish({ error: 'not reachable', timeout: false });
    }
  });
}

//the public IP (the Receive page's http address) and the EPIC price (the header): fixed URLs, asked
//from here so the page's CSP needs neither host and the request carries no Origin, cookie or app
//name (userAgentFallback above). The JSON reply, else false
const LOOKUPS = {
  ip: 'https://api.ipify.org?format=json',
  price: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=epic-cash',
};
ipcMain.handle('lookup', async (event, which) => {
  if (!fromAppWindow(event) || !Object.prototype.hasOwnProperty.call(LOOKUPS, which)) return false;
  try {
    const res = await net.fetch(LOOKUPS[which], { headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000), credentials: 'omit', cache: 'no-store' });
    return res.ok ? await res.json() : false;
  } catch (e) {
    return false;
  }
});

//the version number's link (shared/releaseLink.js): this version's GitHub release page when it
//exists, else the releases page; one HEAD request to github.com on the first click, cached
const releaseLink = createReleaseLink({ fetch: (url, opts) => net.fetch(url, opts), timeoutMs: 3000 });
ipcMain.handle('release-url', async (event) => {
  if (!fromAppWindow(event)) return false;
  const version = process.env.NODE_ENV === 'development' ? require('../package.json').version : app.getVersion();
  return await releaseLink.get(version);
});

//the clipboard module is not available in renderer processes since Electron 44
ipcMain.handle('clipboard-write-text', (event, text) => {
  if (!fromAppWindow(event)) return;
  return clipboard.writeText(String(text));
});

//the recovery phrase: marked sensitive, wiped after 60 s if unchanged, and on lock and quit (shared/secretClipboard.js)
const secretClipboard = createSecretClipboard({ clipboard, platform: process.platform });
ipcMain.handle('clipboard-copy-secret', (event, text) => fromAppWindow(event) && secretClipboard.copy(String(text)));
ipcMain.handle('clipboard-wipe-secret', (event) => fromAppWindow(event) && secretClipboard.wipe());
app.on('will-quit', () => secretClipboard.wipe());
//app.exit() (relaunch after a new app folder, the shutdown's grace exit) skips will-quit
process.on('exit', () => secretClipboard.wipe());

ipcMain.handle('resize', (event, width, height) => {
  if (!fromAppWindow(event)) return;

  let browserWindow = BrowserWindow.fromWebContents(event.sender)
  browserWindow.setSize(width,height);
});

ipcMain.on('scan-stdout', (event, data) => {
  event.reply('scan-stdout', { data });
});

ipcMain.on('firstscan-stdout', (event, data) => {
  event.reply('firstscan-stdout', { data });
});

ipcMain.on('scan-finish', (event, data) => {
  event.reply('scan-finish', { data });
});
ipcMain.on('scan-error', (event, data) => {
  event.reply('scan-error', { data });
});

ipcMain.on('walletCreated', (event, data) => {
  event.reply('walletCreated', { data });
});

ipcMain.on('walletExisted', (event, data) => {
  event.reply('walletExisted', {  });
});

ipcMain.on('walletCreateFailed', (event, data) => {
  event.reply('walletCreateFailed', {  });
});

ipcMain.on('nodeBackground', (event, data) => {
  if (!fromAppWindow(event)) return;
  noderuninbackground = data;
});


/* ---- session password and the pseudo-terminal processes (shared/sessionIpc.js, ptyHost.js) ---- */
//only the app's own window may hand over or use the password
registerSessionIpc({
  ipcMain,
  session: sessionSecret,
  ptyHost,
  isAppWindow: (event) => !!win && !win.isDestroyed() && event.sender === win.webContents,
});
wipeWithApp({ app, proc: process, session: sessionSecret });
