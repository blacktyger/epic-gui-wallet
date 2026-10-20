/*
 * Flows for the 6.1.5 confirmation spec (specs/confirm615.js), both interfaces: Settings › Wallet
 * (another wallet, the removal dialog), a real epic-wallet holding a wallet folder, the app menu's
 * Lock wallet, and a page-text scan for English leftovers and clipped text.
 * Selectors from src/components/modern/views/settings/SettingsAccount.vue, src/components/Account.vue
 * and the two RemoveWalletDialog.vue; strings from src/lang/removal.js and src/lang/wallets.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { waitFor, redact, addSecrets } = require('./harness');
const U = require('./ui');

const WALLET_PAGE = { modern: ['This wallet', '/account', null, 'stg'], classic: ['Profile', '/account', null, 'gear'] };
const WALLETS_PAGE = { modern: ['All wallets', '/wallets', null, 'stg'], classic: ['All wallets', '/wallets', null, 'gear'] };
const openWalletSettings = (w, ui) => U.nav(w, ui, WALLET_PAGE[ui]);
const openAllWallets = async (w, ui) => {
  //a refused Add an existing wallet leaves its full-screen page: Back first (the Settings menu isn't there)
  if (ui === 'modern' && /add-existing|\/found/.test(await U.route(w))) await w.getByRole('link', { name: 'Back' }).first().click({ timeout: 5000 }).catch(() => {});
  return U.nav(w, ui, WALLETS_PAGE[ui]);
};

/** Settings › All wallets › Create a new wallet: a second wallet; Unlock chooses it, it is unlocked
    with the password just set, so it is the open one. */
async function addWallet(w, ui, password) {
  await openAllWallets(w, ui);
  const { words } = await U.createOnly(w, password);
  await U.submitPassword(w, password);
  await w.waitForURL(/dashboard/, { timeout: 90000 });
  return words.length + ' words (not logged); second wallet open';
}

/** Settings › All wallets › Add an existing wallet › Choose a folder… (the picker answered by the spec). */
async function addFromFolder(w, ui) {
  await openAllWallets(w, ui);
  await U.clickable(w, 'Add an existing wallet').first().click({ timeout: 10000 });
  await w.getByRole('button', { name: 'Choose a folder…' }).first().click({ timeout: 10000 });
}

/** Remove… on another wallet's row (Settings › All wallets): the open dialog, its checks done. */
async function openRemoval(w, ui, name) {
  await openAllWallets(w, ui);
  await w.getByRole('button', { name: `Remove ${name}…` }).first().click({ timeout: 10000 });
  const dlg = w.locator('dialog[open]').last();
  await dlg.waitFor({ state: 'visible', timeout: 10000 });
  const done = await waitFor(async () => !/Checking this wallet/.test(await dlg.innerText()), { timeout: 30000 });
  if (!done) throw new Error('the dialog kept checking the files');
  return dlg;
}
/** The dialog's choices: [{mode, disabled, text}] (label + hint + reason). */
const removalChoices = (dlg) => dlg.locator('input[type=radio]').evaluateAll((els) => els.map((e) => ({
  mode: e.value, disabled: e.disabled,
  text: (e.closest('.rm-choice') || e.closest('label')).innerText.replace(/\s+/g, ' ').trim(),
})));
async function closeRemoval(w) {
  const dlg = w.locator('dialog[open]').last();
  if (await dlg.count()) await dlg.getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: 5000 });
  await w.locator('dialog[open]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
}

/* ---------- real Epic programs in the sandbox ---------- */
const BIN = (appDir, name) => path.join(appDir, 'resources', 'bin', 'linux', name);
const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

/**
 * Run the bundled epic-wallet on a pseudo-terminal (util-linux `script`): every password prompt is
 * answered on its stdin, so the password is never on a command line or in a log. Resolves when
 * `ready` matches the output or the program exits. → {proc, output(), exited, stop()}
 */
async function ptyRun(args, { password, ready, timeout = 60000, log }) {
  const cmd = args.map(q).join(' ');
  const p = spawn('script', ['-qfec', cmd, '/dev/null'], { stdio: ['pipe', 'pipe', 'pipe'], detached: true });
  let out = ''; let answered = 0;
  const onData = (d) => {
    out += d;
    //"Password:", "New Password:", "Confirm Password:": one answer each
    const prompts = Math.min((out.match(/Password:/g) || []).length, 4);
    while (answered < prompts) { answered++; p.stdin.write(password + '\n'); }
  };
  p.stdout.on('data', onData); p.stderr.on('data', onData);
  const output = () => redact(out.replace(/\r/g, ''));
  await waitFor(() => (ready && ready.test(out)) || p.exitCode !== null || p.signalCode !== null ? true : null, { timeout, interval: 250 });
  if (log) fs.writeFileSync(log, output());
  return {
    proc: p, output, exited: () => p.exitCode !== null || p.signalCode !== null,
    stop: async () => {
      try { process.kill(-p.pid, 'SIGTERM'); } catch (e) { /* gone */ }
      const gone = await waitFor(() => p.exitCode !== null || p.signalCode !== null, { timeout: 10000 });
      if (!gone) { try { process.kill(-p.pid, 'SIGKILL'); } catch (e) { /* gone */ } }
      if (log) fs.writeFileSync(log, output());
      return gone ? 'stopped' : 'killed';
    },
  };
}

/** A throwaway wallet made by the CLI itself (`epic-wallet init`), as a user of the command line would. */
async function cliInit({ appDir, dir, network = 'mainnet', password, log }) {
  fs.mkdirSync(dir, { recursive: true });
  const net = network === 'mainnet' ? [] : ['--' + network];
  const r = await ptyRun([BIN(appDir, 'epic-wallet'), ...net, '-c', dir, 'init'], { password, ready: /Command 'init' completed|failed/i });
  await waitFor(() => r.exited(), { timeout: 15000 });
  //init prints the recovery phrase (the line before "Please back-up these words"): a secret from here on
  const m = r.output().match(/((?:[a-z]+ ){11,23}[a-z]+)\s*\n+\s*Please back-up these words/);
  if (m) addSecrets({ words: m[1].trim().split(/\s+/) });
  if (log) fs.writeFileSync(log, r.output());
  if (!m) throw new Error('could not find the phrase epic-wallet init printed, so nothing of it is logged');
  if (!fs.existsSync(path.join(dir, 'wallet_data', 'wallet.seed'))) throw new Error('epic-wallet init made no seed');
  return `${m[1].trim().split(/\s+/).length}-word phrase printed (kept secret), seed in ${path.join(path.basename(dir), 'wallet_data')}`;
}

/**
 * Another program holding a wallet folder: `epic-wallet owner_api` on it, with a copy of its toml in
 * workDir on its own port (the folder itself is not touched). → {stop(), output()}
 */
async function holdWallet({ appDir, walletDir, workDir, network = 'mainnet', port, password, log }) {
  fs.mkdirSync(workDir, { recursive: true });
  const toml = fs.readFileSync(path.join(walletDir, 'epic-wallet.toml'), 'utf8')
    .replace(/(owner_api_listen_port\s*=\s*)\d+/, '$1' + port).replace(/(\bapi_listen_port\s*=\s*)\d+/, '$1' + (port + 5));
  fs.writeFileSync(path.join(workDir, 'epic-wallet.toml'), toml);
  for (const f of ['.owner_api_secret', '.api_secret']) if (fs.existsSync(path.join(walletDir, f))) fs.copyFileSync(path.join(walletDir, f), path.join(workDir, f));
  const net = network === 'mainnet' ? [] : ['--' + network];
  const r = await ptyRun([BIN(appDir, 'epic-wallet'), ...net, '-c', workDir, '-t', walletDir, '--offline_mode', 'owner_api'],
    { password, ready: /Owner API|listening on|started/i, timeout: 30000, log });
  if (r.exited()) throw new Error('the epic-wallet holder exited: ' + r.output().slice(-400));
  return r;
}

/** The bundled epic node (floonet, offline) on <dir>/chain_data, ports away from the stub's. */
async function startNode({ appDir, dir, log }) {
  fs.mkdirSync(dir, { recursive: true });
  const toml = fs.readFileSync(path.join(appDir, 'resources', 'epic-server.toml'), 'utf8')
    .replace(/^db_root = .*$/m, `db_root = "${path.join(dir, 'chain_data')}"`)
    .replace(/^api_http_addr = .*$/m, 'api_http_addr = "127.0.0.1:23413"')
    .replace(/^chain_type = .*$/m, 'chain_type = "Floonet"')
    .replace(/^host = .*$/m, 'host = "127.0.0.1"').replace(/^port = 3414$/m, 'port = 23414')
    .replace(/^stratum_server_addr = .*$/m, 'stratum_server_addr = "127.0.0.1:23416"')
    .replace(/^log_file_path = .*$/m, `log_file_path = "${path.join(dir, 'epic-server.log')}"`);
  const conf = path.join(dir, 'epic-server.toml');
  fs.writeFileSync(conf, toml);
  const out = fs.openSync(log, 'w');
  const p = spawn(BIN(appDir, 'epic'), ['--floonet', 'server', '--config_file', conf, 'run'], { cwd: dir, stdio: ['ignore', out, out], detached: true });
  const ok = await waitFor(() => fs.existsSync(path.join(dir, 'chain_data', 'txhashset', 'rangeproof', 'pmmr_hash.bin')) && fs.existsSync(path.join(dir, 'chain_data', 'header', 'header_head', 'pmmr_hash.bin')), { timeout: 30000 });
  if (!ok || p.exitCode !== null) throw new Error('the epic node did not set up its chain data: ' + fs.readFileSync(log, 'utf8').slice(-400));
  return {
    pid: p.pid,
    stop: async () => {
      try { process.kill(-p.pid, 'SIGTERM'); } catch (e) { /* gone */ }
      const gone = await waitFor(() => p.exitCode !== null || p.signalCode !== null, { timeout: 15000 });
      if (!gone) { try { process.kill(-p.pid, 'SIGKILL'); } catch (e) { /* gone */ } }
      return gone ? 'stopped' : 'killed';
    },
  };
}

/** sha256 of every file under dir: {relative path: hash}. */
function hashTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out[path.relative(dir, p)] = require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    }
  };
  walk(dir);
  return out;
}
function hashDiff(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => a[k] !== b[k]).map((k) => `${k}: ${!a[k] ? 'new' : !b[k] ? 'gone' : 'changed'}`);
}

/*
 * A real key press on the sandbox's X server (XTest, through python3's ctypes: no xdotool here), so
 * native menu accelerators see it; Playwright's keys go to the page only. The pointer is moved onto
 * the window first (no window manager: focus follows the pointer). keys: X keysym names.
 */
const XTEST = `
import ctypes, sys, time
x = ctypes.cdll.LoadLibrary('libX11.so.6'); t = ctypes.cdll.LoadLibrary('libXtst.so.6')
x.XOpenDisplay.restype = ctypes.c_void_p; x.XStringToKeysym.restype = ctypes.c_ulong
d = x.XOpenDisplay(None)
if not d: sys.exit('no display')
d = ctypes.c_void_p(d)
t.XTestFakeMotionEvent(d, -1, 640, 400, 0); x.XFlush(d); time.sleep(0.2)
codes = [x.XKeysymToKeycode(d, ctypes.c_ulong(x.XStringToKeysym(k.encode()))) for k in sys.argv[1:]]
for c in codes: t.XTestFakeKeyEvent(d, c, True, 0)
for c in reversed(codes): t.XTestFakeKeyEvent(d, c, False, 0)
x.XFlush(d); time.sleep(0.2); x.XCloseDisplay(d)
`;
function realKey(...keys) {
  require('child_process').execFileSync('python3', ['-c', XTEST, ...keys], { env: process.env, timeout: 10000 });
  return 'XTest ' + keys.join('+');
}

/** The app menu's Lock wallet item: {label, accelerator, enabled, aboveQuit}. */
const menuLock = (app) => app.evaluate(({ Menu }) => {
  const m = Menu.getApplicationMenu(); if (!m) return null;
  const items = m.items[0].submenu.items; const it = m.getMenuItemById('lock');
  const li = items.findIndex((i) => i.id === 'lock'); const qi = items.findIndex((i) => i.id === 'quit');
  return it && { label: it.label, accelerator: it.accelerator, enabled: it.enabled, aboveQuit: qi === li + 1 };
});

/* ---------- page text: English leftovers, clipped text ---------- */
/** Visible leaf texts of the page (elements with a text node of their own), deduplicated. */
const leafTexts = (w) => w.evaluate(() => {
  const out = new Set();
  for (const e of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'svg', 'path'].includes(e.tagName)) continue;
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (!own) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || getComputedStyle(e).visibility === 'hidden') continue;
    out.add(own);
  }
  for (const e of document.querySelectorAll('input[placeholder], textarea[placeholder]')) if (e.getBoundingClientRect().width > 0) out.add('placeholder: ' + e.placeholder);
  for (const e of document.querySelectorAll('[aria-label]')) if (e.getBoundingClientRect().width > 0) out.add('aria-label: ' + e.getAttribute('aria-label'));
  return [...out];
});

//the same in every language: names (people, operators from src/shared/epicboxDirectory.js), units,
//technical words, language names (and anything without a word of 3+ letters)
const SAME_EVERYWHERE = /^(Epic( Cash)?|EPIC|Epicbox|HTTP|HTTPS|Tor|Dandelion\+\+|BT Labs|btlabs|Johannes Hahn|Cypher Stack|mainnet|floonet|usernet|Mainnet|Floonet|Usernet|GitHub|Polski|English|Deutsch|Česko|България|فارسی|हिन्दी|OK|QR|ID|URL|API|Wallet \d+|v?\d[\d.,]*|[A-Z]{2,5})$/;
/**
 * Texts of the Polish page that are also on the English one. names: what the user typed (wallet
 * labels); data: text that is data, not interface (the page's Epic address: it is shown in parts).
 */
function englishLeft(englishTexts, texts, { names = [], data = '' } = {}) {
  const en = new Set(englishTexts);
  return texts.filter((s) => en.has(s)).filter((s) => {
    const bare = s.replace(/^(placeholder|aria-label): /, '').trim();
    if (names.includes(bare) || (data && !/\s/.test(bare) && data.includes(bare))) return false;
    //host names and paths are data too
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(bare) || /^[~/]/.test(bare)) return false;
    return /[A-Za-z]{3,}/.test(bare) && !/@|:\/\/|^[a-z0-9]{30,}$/i.test(bare) && !SAME_EVERYWHERE.test(bare);
  });
}

/** Text that doesn't fit its box: buttons, labels, headings, tags, table cells, menu items. */
const clippedText = (w) => w.evaluate(() => {
  const out = [];
  const sel = 'button, a, label, h1, h2, h3, th, td, legend, summary, .e-btn, .button, .tag, .e-tag, .e-svc, .navbar-item, .menu-list a, .e-stg-nav a, dt, dd, b';
  for (const e of document.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect();
    //visually hidden on purpose (screen reader text: 1 px boxes)
    if (r.width < 3 || r.height < 3 || e.closest('.e-sr-only, .sr-only, .is-sr-only')) continue;
    const t = e.innerText.replace(/\s+/g, ' ').trim();
    if (!t || !/\s/.test(t) && t.length > 28) continue; //addresses and paths are cut on purpose
    if (e.closest('.e-truncate, .e-mono, code, [translate=no]')) continue;
    const s = getComputedStyle(e);
    const cut = e.scrollWidth > e.clientWidth + 1 && s.overflowX !== 'visible';
    const spills = e.scrollWidth > e.clientWidth + 2 && s.overflowX === 'visible' && s.display !== 'inline' && s.whiteSpace === 'nowrap';
    const outside = r.right > innerWidth + 1;
    if (cut || spills || outside) out.push(`${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''} "${t.slice(0, 60)}" (${cut ? 'cut' : spills ? 'spills out' : 'past the window'}: ${e.scrollWidth}>${e.clientWidth})`);
  }
  return [...new Set(out)];
});

module.exports = { WALLET_PAGE, openWalletSettings, addWallet, openRemoval, removalChoices, closeRemoval, ptyRun, cliInit, holdWallet, startNode, hashTree, hashDiff,
  realKey, menuLock, leafTexts, englishLeft, clippedText , openAllWallets, addFromFolder };
