// The preload/IPC contract, read from the sources (src/preload.js and the main-process files): what
// the page can reach, which channels exist and which handlers check that the call came from the
// app's own window. A new bridge API, channel or unchecked handler fails here until it is added to
// the lists below on purpose (and reviewed): the preload is the wallet's security boundary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const src = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', 'src', f), 'utf8');
const names = (text, re) => [...new Set([...text.matchAll(re)].map(m => m[1]))].sort();
const preload = src('preload.js');
const MAIN = ['background.js', 'legacyProfile.js', 'shared/sessionIpc.js'];
const main = MAIN.map(src).join('\n');

//window.<name> in the page
const EXPOSED = ['api', 'clipboard', 'config', 'debug', 'explorer', 'log', 'nodeAes256gcm', 'nodeChildProcess', 'nodeFs',
  'nodePath', 'nodeQr', 'nodeSecp256k1', 'nodeWebUtils', 'openepichidden', 'openlink', 'support'];

//ipcRenderer.invoke channels (each one has an ipcMain.handle: tests/ipcChannels.test.js)
const INVOKED = ['app-relaunch', 'clipboard-copy-secret', 'clipboard-wipe-secret', 'clipboard-write-text', 'direct-addresses', 'folder-lock', 'legacy-scan',
  'locale', 'lookup', 'node-directory', 'node-fetch', 'open-external', 'open-folder', 'pick-wallet-folder', 'pty-start',
  'quit', 'release-url', 'reload-ui', 'resize', 'session-password-clear', 'session-password-has', 'session-password-set',
  'show-open-dialog', 'show-save-dialog', 'support-preview', 'support-save', 'support-send', 'tor-foreign', 'tor-retry',
  'tor-start', 'tor-stop', 'version'];

//ipcRenderer.on with a fixed channel (besides the validChannels listener)
const LISTENED = ['menu-lock', 'open-support', 'pty-data', 'pty-exit', 'tor-status', 'window-hidden'];

//handlers that do not check the sender, and why that is fine
const UNCHECKED = {
  'app-paths': 'sendSync from the preload before the page loads; returns folder names only',
  'locale': 'read-only: the system language',
  'version': 'read-only: the app version',
  'node-directory': 'read-only: the public node list (fixed URL in the main process)',
  'direct-addresses': 'read-only: the LAN and public IPv4 address (fixed URL in the main process)',
  'session-password-clear': 'can only forget the password (a lock), never read or set it',
  //echoes: they reply to the sender with what it sent
  'scan-stdout': 'echo', 'firstscan-stdout': 'echo', 'scan-finish': 'echo', 'scan-error': 'echo',
  'walletCreated': 'echo', 'walletExisted': 'echo', 'walletCreateFailed': 'echo',
};

test('the preload exposes exactly the reviewed bridge APIs', () => {
  assert.deepEqual(names(preload, /exposeInMainWorld\(\s*['"]([^'"]+)['"]/g), [...EXPOSED].sort());
});

test('the preload invokes exactly the reviewed channels; sends and listens on fixed ones only', () => {
  assert.deepEqual(names(preload, /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g), [...INVOKED].sort());
  assert.deepEqual(names(preload, /ipcRenderer\.send\(\s*['"]([^'"]+)['"]/g), ['firstscan-stdout', 'menu-state', 'nodeBackground']);
  assert.deepEqual(names(preload, /ipcRenderer\.sendSync\(\s*['"]([^'"]+)['"]/g), ['app-paths']);
  //what the main process may push to the page (webContents.send)
  assert.deepEqual(names(preload, /ipcRenderer\.on\(\s*['"]([^'"]+)['"]/g), LISTENED);
  //every ipcRenderer call names its channel, except the one listener behind validChannels
  const dynamic = [...preload.matchAll(/ipcRenderer\.(invoke|send|sendSync|on|once)\(\s*([^'"\s][^,)]*)/g)].map(m => m[1] + ' ' + m[2]);
  assert.deepEqual(dynamic, ['on channel'], 'a channel from a variable: ' + dynamic.join(', '));
  assert.match(preload, /if \(validChannels\.includes\(channel\)\) \{\s*ipcRenderer\.on\(channel,/);
});

test('the page never gets ipcRenderer, require, child_process or plain fs', () => {
  //what goes into exposeInMainWorld(name, value): ipcRenderer itself is never the value
  assert.doesNotMatch(preload, /exposeInMainWorld\([^,]+,\s*(ipcRenderer|require|process|child_process|fs|electron)\s*\)/);
  assert.doesNotMatch(preload, /exposeInMainWorld\([^,]+,\s*require\(\s*['"](child_process|fs|electron|fs-extra)['"]\s*\)/);
  assert.match(preload, /exposeInMainWorld\('nodeFs', scopedFs\)/, 'window.nodeFs is the scoped fs (shared/security.js)');
});

test('every IPC handler checks the sender is the app window, except the reviewed read-only ones', () => {
  const unchecked = [];
  for (const f of MAIN) {
    const text = src(f);
    const at = [...text.matchAll(/ipcMain\.(handle|on)\(\s*['"]([^'"]+)['"]/g)];
    at.forEach((m, i) => {
      const body = text.slice(m.index, i + 1 < at.length ? at[i + 1].index : text.length);
      if (!/(fromAppWindow|isAppWindow)\(event\)/.test(body)) unchecked.push(m[2]);
    });
  }
  assert.deepEqual(unchecked.sort(), Object.keys(UNCHECKED).sort(),
    'a handler without fromAppWindow(event)/isAppWindow(event): add the check or a reviewed UNCHECKED entry');
  //the check is the window's own webContents, not a URL
  assert.match(main, /const fromAppWindow = \(event\) => !!win && !win\.isDestroyed\(\) && event\.sender === win\.webContents;/);
});

test('every main-process channel is used by the preload (no forgotten handler)', () => {
  const handled = names(main, /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g);
  const listened = names(main, /ipcMain\.on\(\s*['"]([^'"]+)['"]/g);
  const used = new Set([...INVOKED, 'firstscan-stdout', 'menu-state', 'nodeBackground', 'app-paths']);
  const validChannels = (preload.match(/const validChannels = \[([^\]]*)\]/) || [])[1] || '';
  for (const c of validChannels.matchAll(/'([^']+)'/g)) used.add(c[1]);
  assert.deepEqual([...handled, ...listened].filter(c => !used.has(c)), []);
});

test('the app window: context isolation, no node integration, web security on', () => {
  const win = main.slice(main.indexOf('webPreferences: {'), main.indexOf('webPreferences: {') + 2000);
  assert.match(win, /nodeIntegration: false/);
  assert.match(win, /contextIsolation: true/);
  assert.match(win, /webSecurity: true/);
  assert.match(win, /allowRunningInsecureContent: false/);
  //the preload needs Node.js (it is the app's process layer): sandbox stays off on purpose, see background.js
  assert.match(win, /sandbox: false/);
  assert.doesNotMatch(main, /nodeIntegration: true|contextIsolation: false|webSecurity: false|enableRemoteModule|nodeIntegrationInSubFrames: true/);
  //the legacy-profile window (reads the 5.x IndexedDB) is fully sandboxed
  assert.match(src('legacyProfile.js'), /contextIsolation: true, sandbox: true, nodeIntegration: false/);
});

test('no navigation, no webviews, no new windows; links go to the system browser', () => {
  const bg = src('background.js');
  assert.match(bg, /contents\.on\('will-navigate', guard\)/);
  assert.match(bg, /contents\.on\('will-redirect', guard\)/);
  assert.match(bg, /contents\.on\('will-attach-webview', \(e\) => e\.preventDefault\(\)\)/);
  assert.match(bg, /setWindowOpenHandler\(\(\{ url \}\) => \{\s*openExternal\(url\);\s*return \{ action: 'deny' \};/);
  assert.match(bg, /if \(isAppUrl\(url, devServer\)\) return;\s*e\.preventDefault\(\);/);
});

test('6.1.6 Tor: window.api.tor has exactly start, stop, retry, foreign, onStatus; tor-start takes no path from the page', () => {
  const block = preload.slice(preload.indexOf('    tor: {'), preload.indexOf('    },', preload.indexOf('    tor: {')));
  assert.deepEqual(names(block, /^ {6}([a-zA-Z]+): /gm), ['foreign', 'onStatus', 'retry', 'start', 'stop']);
  assert.match(block, /invoke\('tor-start', \{ walletId: String\(walletId \|\| ''\), onion: String\(onion \|\| ''\),\s*waitListener: !!\(opts && opts\.waitListener\) \}\)/);
  assert.match(block, /invoke\('tor-stop', \{ walletId: String\(walletId \|\| ''\) \}\)/);
  //the main process takes the dirs from settings.json and allows only the unlocked wallet
  const bg = src('background.js');
  const h = bg.slice(bg.indexOf("ipcMain.handle('tor-start'"), bg.indexOf("ipcMain.handle('tor-stop'"));
  assert.match(h, /walletRecord\(String\(req\.walletId/);
  assert.match(h, /sessionSecret\.dir\(\)\) !== path\.resolve\(wallet\.dataDir\)/);
  assert.doesNotMatch(h, /req\.(configDir|dataDir|dir|path|port|listenerPort|bin)/);
  //tor-foreign goes through the allowlist
  const f = bg.slice(bg.indexOf("ipcMain.handle('tor-foreign'"));
  assert.match(f.slice(0, 600), /checkForeignRequest\(req\)/);
});
