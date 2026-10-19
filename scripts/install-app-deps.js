#!/usr/bin/env node
/*
 * npm postinstall / postuninstall: rebuild the native dependencies for Electron, except node-pty.
 *
 * This replaces `electron-builder install-app-deps`, which has no way to leave a module out and
 * rebuilt node-pty from source. On Windows that needs the MSVC Spectre-mitigated libraries, so a
 * plain `npm ci` failed without them. node-pty 1.x is N-API (ABI stable, no Electron rebuild
 * needed) and ships win32/darwin prebuilds, which it loads from prebuilds/<platform>-<arch>.
 * node-pty's own npm `install` script uses the prebuild when there is one and compiles
 * (node-gyp) when there is none (Linux), so it is built exactly once, by npm.
 *
 * Everything else is rebuilt the same way electron-builder does (@electron/rebuild, the
 * production dependencies of the app, for the installed Electron version).
 */
'use strict';
const path = require('path');

const IGNORE = ['node-pty'];
const root = path.join(__dirname, '..');

function load(name, from) {
  try { return require(require.resolve(name, { paths: [from] })); } catch (e) { return null; }
}

async function main() {
  const electron = load('electron/package.json', root);
  if (!electron) { console.log('install-app-deps: electron is not installed, nothing to rebuild'); return; }
  //@electron/rebuild comes with electron-builder (app-builder-lib), it is not a direct dependency
  const appBuilderLib = path.dirname(require.resolve('app-builder-lib/package.json', { paths: [root] }));
  const rebuilder = load('@electron/rebuild', appBuilderLib) || load('@electron/rebuild', root);
  if (!rebuilder) throw new Error('@electron/rebuild not found (comes with electron-builder)');
  console.log('install-app-deps: rebuilding native dependencies for electron ' + electron.version +
    ' (skipping ' + IGNORE.join(', ') + ')');
  await rebuilder.rebuild({
    buildPath: root,
    projectRootPath: root,
    electronVersion: electron.version,
    arch: process.arch,
    platform: process.platform,
    mode: 'sequential',
    ignoreModules: IGNORE,
    disablePreGypCopy: true,
  });
  console.log('install-app-deps: done');
}

main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
