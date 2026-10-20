/*
 * The app under test: a Linux unpacked build (EpicWallet + resources/bin/linux) in
 * tests/e2e/out/build/linux-unpacked, built from this checkout only when the sources changed.
 *
 *   node tests/e2e/build-app.js [--force]   prints the unpacked dir on its last line
 *
 * The same two halves as `vue-cli-service electron:build --linux dir`, but with the output in the
 * ignored tests/e2e/out instead of build/ (the release output): the plugin replaces its whole
 * electron-builder config when given -c.directories.output, so the packaging step is called here
 * with vue.config.js's builderOptions plus that one directory.
 * The reuse stamp is HEAD plus the uncommitted changes of everything that goes into the package.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out', 'build');
const APPDIR = path.join(OUT, 'linux-unpacked');
const STAMP = path.join(OUT, 'stamp.txt');
//what ends up in the package; tests/ and docs/ don't
const INPUTS = ['src', 'public', 'resources', 'scripts/afterPack.js', 'vue.config.js', 'babel.config.js', 'package.json', 'package-lock.json'];

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });

function sourceStamp() {
  const h = crypto.createHash('sha256');
  h.update(git(['rev-parse', 'HEAD']));
  h.update(git(['diff', 'HEAD', '--binary', '--', ...INPUTS]));
  //untracked files in the inputs count too (their content, not just the name)
  for (const f of git(['ls-files', '--others', '--exclude-standard', '--', ...INPUTS]).split('\n').filter(Boolean)) {
    h.update(f);
    h.update(fs.readFileSync(path.join(ROOT, f)));
  }
  return h.digest('hex');
}

const exists = () => fs.existsSync(path.join(APPDIR, 'EpicWallet')) && fs.existsSync(path.join(APPDIR, 'resources', 'bin', 'linux', 'epic-wallet'));

async function build({ force = false, log = console.log } = {}) {
  const stamp = sourceStamp();
  if (!force && exists() && fs.existsSync(STAMP) && fs.readFileSync(STAMP, 'utf8').trim() === stamp) {
    log(`[build] reusing ${path.relative(ROOT, APPDIR)} (sources unchanged)`);
    return { appDir: APPDIR, built: false, ms: 0 };
  }
  const t0 = Date.now();
  log('[build] bundling (vue-cli-service electron:build --skipElectronBuild)');
  execFileSync(process.execPath, [require.resolve('@vue/cli-service/bin/vue-cli-service', { paths: [ROOT] }), 'electron:build', '--skipElectronBuild'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], timeout: 600000, env: { ...process.env, NODE_ENV: 'production' } });
  log(`[build] packaging linux dir into ${path.relative(ROOT, OUT)}`);
  const builder = require(require.resolve('electron-builder', { paths: [ROOT] }));
  const merge = require(require.resolve('lodash.merge', { paths: [path.join(ROOT, 'node_modules', 'vue-cli-plugin-electron-builder')] }));
  const opts = require(path.join(ROOT, 'vue.config.js')).pluginOptions.electronBuilder.builderOptions;
  //the plugin's defaults (vue-cli-plugin-electron-builder index.js), then vue.config.js, then the output dir
  const config = merge({ directories: { output: 'dist_electron', app: 'dist_electron/bundled' }, files: ['**'], extends: null }, opts, { directories: { output: OUT } });
  if (fs.existsSync(STAMP)) fs.unlinkSync(STAMP);
  const cwd = process.cwd();
  process.chdir(ROOT);
  try {
    await builder.build({ targets: builder.Platform.LINUX.createTarget('dir', builder.Arch.x64), config, publish: 'never' });
  } finally {
    process.chdir(cwd);
  }
  if (!exists()) throw new Error('build finished but ' + APPDIR + ' has no EpicWallet / resources/bin/linux/epic-wallet');
  fs.writeFileSync(STAMP, stamp + '\n');
  const ms = Date.now() - t0;
  log(`[build] done in ${Math.round(ms / 1000)} s`);
  return { appDir: APPDIR, built: true, ms };
}

module.exports = { build, APPDIR, ROOT };

if (require.main === module) {
  build({ force: process.argv.includes('--force') }).then(r => console.log(r.appDir), (e) => { console.error(e); process.exit(1); });
}
