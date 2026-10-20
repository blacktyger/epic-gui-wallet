/*
 * e2e gate harness, used by every spec. Runs INSIDE the test sandbox (tests/e2e/run.js starts it:
 * bwrap with loopback-only networking, its own pid namespace and a scratch HOME), so the app, the
 * real epic-wallet it starts and the stub node all live in there and nothing reaches the network.
 *
 *   const t = createCase('smoke');           // E2E_UI, E2E_APPDIR, E2E_CASE_DIR come from run.js
 *   await t.launch();                        // the unpacked build, console + page errors captured
 *   await t.step('name', async () => 'what was seen', { knownBug: 'T09' });
 *   await t.finish();                        // writes result.json for the runner
 *
 * A step fails when its function throws, or when the page logged a console error / uncaught error
 * during it that is not on CONSOLE_ALLOW. A step marked knownBug is reported but does not fail the
 * gate. Passwords and recovery words never reach a log, result or screenshot (redact, mask).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { _electron } = require('playwright-core');
const { startStubNode } = require('../stub-node');

const APPDIR = process.env.E2E_APPDIR;
const CASE_DIR = process.env.E2E_CASE_DIR;
const UI = process.env.E2E_UI || 'modern';
const HOME = process.env.HOME;
const NODE_PORT = 13413;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Console errors the gate accepts, each with why. Everything else fails the step it appeared in.
 * The sandbox has no network: only failures of outside services belong here.
 */
const CONSOLE_ALLOW = [
  //placeholder, filled from the first runs
];

/* ---------- secrets ---------- */
const SECRETS = { passwords: [], words: [] };
function addSecrets({ passwords = [], words = [] } = {}) {
  for (const p of passwords) if (p && !SECRETS.passwords.includes(p)) SECRETS.passwords.push(p);
  if (words.length) SECRETS.words = SECRETS.words.concat(words);
}
function redact(s) {
  let out = String(s == null ? '' : s);
  for (const p of SECRETS.passwords) out = out.split(p).join('<password>');
  const w = SECRETS.words;
  for (let i = 0; i + 2 <= w.length; i++) out = out.split(w[i] + ' ' + w[i + 1]).join('<words>');
  //Classic lists them numbered: "1. word 2. word"
  for (const x of w) out = out.replace(new RegExp('\\b(\\d+\\.\\s*)' + x.replace(/[^a-z]/gi, '') + '\\b', 'g'), '$1<word>');
  return out;
}
/** A password for this run only (letters, digits and a dash; never logged). */
function newPassword() {
  const p = 'E2e-' + crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) + '-7';
  addSecrets({ passwords: [p] });
  return p;
}

async function waitFor(fn, { timeout = 30000, interval = 250 } = {}) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) {
    try { last = await fn(); } catch (e) { last = null; }
    if (last) return last;
    await sleep(interval);
  }
  return last;
}
function withTimeout(p, ms, what) {
  let t;
  return Promise.race([Promise.resolve(p).finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timed out after ${ms} ms: ${what}`)), ms); })]);
}

/** Processes of the app under test still running in this sandbox (own pid namespace). */
function appProcesses() {
  const out = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  //by the program each runs (the first word): bwrap's and the driver's own arguments name APPDIR too
  return out.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => {
    const exe = l.replace(/^\d+\s+/, '').split(' ')[0];
    return (APPDIR && exe.startsWith(APPDIR + '/')) || /^(EpicWallet|epic-wallet|epic|chrome_crashpad_handler)$/.test(path.basename(exe));
  });
}

function createCase(spec) {
  if (!APPDIR || !CASE_DIR) throw new Error('run through tests/e2e/run.js (E2E_APPDIR and E2E_CASE_DIR not set)');
  const shots = path.join(CASE_DIR, 'shots');
  fs.mkdirSync(shots, { recursive: true });
  const t0 = Date.now();
  const steps = [];
  const consoleErrs = [];
  const clog = path.join(CASE_DIR, 'console.log');
  const t = { spec, ui: UI, app: null, win: null, node: null, steps, home: HOME, password: null };
  const note = (s) => console.log(redact(s));

  function attach(win) {
    win.on('console', (m) => {
      const line = `[${new Date().toISOString()}] [${m.type()}] ${redact(m.text())}`;
      fs.appendFileSync(clog, line + '\n');
      if (m.type() === 'error') consoleErrs.push({ text: redact(m.text()), url: win.url() });
    });
    win.on('pageerror', (e) => {
      fs.appendFileSync(clog, `[${new Date().toISOString()}] [pageerror] ${redact(e.message)}\n`);
      consoleErrs.push({ text: 'uncaught: ' + redact(e.message), url: win.url() });
    });
  }

  /** The stub node, then the app on an empty HOME (Classic: only settings.json app.ui set). */
  /** env: more environment for the app (e.g. PATH with a fake program first) */
  t.launch = async ({ fresh = true, env: more = {} } = {}) => {
    if (!t.node) {
      const nlog = path.join(CASE_DIR, 'stub-node.log');
      t.node = await startStubNode({ port: NODE_PORT, log: (l) => fs.appendFileSync(nlog, `${new Date().toISOString().slice(11, 23)} ${l}\n`) });
    }
    //E2E_APP_DEBUG=1: the app's own debug mode (a debug.log file in its folder; src/preload.js)
    if (process.env.E2E_APP_DEBUG) { fs.mkdirSync(path.join(HOME, '.epic-gui'), { recursive: true }); fs.writeFileSync(path.join(HOME, '.epic-gui', 'debug.log'), ''); }
    if (fresh && UI === 'classic') {
      //the interface is chosen in settings.json (absent = Modern); nothing else is seeded
      const dir = path.join(HOME, '.epic-gui');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ schema: 1, app: { ui: 'classic', theme: 'dark', scale: 100, locale: '' } }, null, 2));
    }
    const env = { HOME, PATH: process.env.PATH, DISPLAY: process.env.DISPLAY, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8',
      TMPDIR: '/tmp', ELECTRON_DISABLE_SANDBOX: '1', XDG_CONFIG_HOME: path.join(HOME, '.config'), ...more };
    t.app = await _electron.launch({ executablePath: path.join(APPDIR, 'EpicWallet'), args: ['--no-sandbox', '--disable-gpu'], env, timeout: 60000 });
    const out = path.join(CASE_DIR, 'app.stdout.log');
    t.app.process().stdout.on('data', (d) => fs.appendFileSync(out, redact(d)));
    t.app.process().stderr.on('data', (d) => fs.appendFileSync(out, redact(d)));
    t.app.on('window', attach);
    t.win = await t.app.firstWindow({ timeout: 60000 });
    attach(t.win);
    await t.win.waitForLoadState('domcontentloaded');
    return t.win;
  };

  async function screenshot(name) {
    const w = t.win; if (!w || w.isClosed()) return null;
    const file = path.join(shots, `${String(steps.length).padStart(2, '0')}-${name.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 60)}.png`);
    //recovery words and anything that could hold a secret are blurred first
    await w.evaluate(() => {
      const st = document.createElement('style'); st.id = 'e2e-mask';
      st.textContent = 'ol.e-seed li, .e-seed li, .mnemonic-word, .seed, .mnemonic, textarea, input[type=password] { filter: blur(8px) !important; }';
      document.head.appendChild(st);
    }).catch(() => {});
    const leak = await w.evaluate(({ words, pw }) => {
      const s = (document.body.innerText + ' ' + [...document.querySelectorAll('input')].map((e) => e.value).join(' ')).toLowerCase();
      for (let i = 0; i + 2 <= words.length; i++) if (s.includes(words[i] + ' ' + words[i + 1])) return true;
      return pw.some((p) => s.includes(p.toLowerCase()));
    }, { words: SECRETS.words, pw: SECRETS.passwords }).catch(() => true);
    if (leak) await w.evaluate(() => { document.getElementById('e2e-mask').textContent += ' body { filter: blur(12px) !important; }'; }).catch(() => {});
    await w.screenshot({ path: file, timeout: 10000 }).catch(() => {});
    await w.evaluate(() => { const s = document.getElementById('e2e-mask'); if (s) s.remove(); }).catch(() => {});
    return path.relative(CASE_DIR, file);
  }
  t.screenshot = screenshot;

  /**
   * One check. fn returns what was seen (a short string). opts.knownBug: 'T09' / a short id: a
   * failure is reported as known-bug and doesn't fail the gate. opts.allowConsole: regexes of
   * console errors expected in this step only. opts.fatal: stop the case when it fails.
   */
  t.step = async (name, fn, opts = {}) => {
    const s0 = Date.now(); const errsBefore = consoleErrs.length;
    let status = 'pass', actual = null, error = null;
    try {
      actual = await withTimeout(fn(), opts.timeout || 60000, name);
    } catch (e) {
      status = 'fail';
      //Playwright colours its messages
      // eslint-disable-next-line no-control-regex
      error = String((e && e.message) || e).replace(/\u001b\[[0-9;]*m/g, '').split('\n').filter((l) => l.trim()).slice(0, 8).join('\n');
    }
    //console errors are checked after the step's own waits; give late ones a moment
    await sleep(150);
    const allow = [...CONSOLE_ALLOW, ...(opts.allowConsole || []).map((re) => ({ re, why: 'expected in this step' }))];
    const errs = consoleErrs.slice(errsBefore);
    const unexpected = errs.filter((e) => !allow.some((a) => a.re.test(e.text)));
    if (status === 'pass' && unexpected.length) {
      status = 'fail';
      error = 'console errors: ' + unexpected.map((e) => e.text.slice(0, 300)).join(' | ');
    }
    let shot = null;
    if (status === 'fail' || opts.shot) shot = await screenshot(name).catch(() => null);
    if (status === 'fail' && opts.knownBug) status = 'known-bug';
    const rec = { name, status, ms: Date.now() - s0, actual: actual == null ? null : redact(typeof actual === 'string' ? actual : JSON.stringify(actual)).slice(0, 500),
      error: error && redact(error), knownBug: opts.knownBug || null, consoleErrors: errs.map((e) => e.text.slice(0, 300)), shot };
    //opts.intermittent: the bug doesn't show every time, so a pass says nothing
    if (status === 'pass' && opts.knownBug && !opts.intermittent) rec.note = `known bug ${opts.knownBug} did not reproduce: fixed? update the spec`;
    steps.push(rec);
    const tag = { pass: 'ok  ', fail: 'FAIL', 'known-bug': 'KNWN' }[status];
    note(`[${UI}] [${tag}] ${name} (${rec.ms} ms)${rec.error ? ' :: ' + rec.error.split('\n')[0].slice(0, 300) : ''}`);
    if (status === 'fail' && opts.fatal) throw new FatalStep(name);
    return status === 'fail' ? undefined : actual;
  };

  /** The app's own Quit (Menu › Quit, Ctrl+Q): its shutdown stops epic-wallet first. */
  t.quit = async () => {
    const app = t.app; if (!app) return 'not running';
    const proc = app.process();
    const exited = new Promise((r) => { if (proc.exitCode !== null) r(); else proc.once('exit', () => r()); });
    const how = await app.evaluate(({ Menu }) => {
      const find = (items) => { for (const i of items) { if (i.id === 'quit' || i.label === 'Quit') return i; if (i.submenu) { const f = find(i.submenu.items); if (f) return f; } } return null; };
      const m = Menu.getApplicationMenu(); const q = m && find(m.items);
      if (!q) return 'no Quit menu item';
      setTimeout(() => q.click(), 20);
      return 'Menu › Quit';
    }).catch((e) => 'evaluate failed: ' + e.message);
    if (how !== 'Menu › Quit') throw new Error('could not quit through the menu: ' + how);
    const ok = await Promise.race([exited.then(() => true), sleep(45000).then(() => false)]);
    t.app = null; t.win = null;
    if (!ok) throw new Error('the app did not exit within 45 s of Menu › Quit');
    return how;
  };

  /** Nothing of the app left after quitting (polls up to `timeout`). */
  /** Lines of the renderer's log (console.log of this case) since `from` that match `re`. */
  t.logLines = (re, from = 0) => {
    let s = ''; try { s = fs.readFileSync(clog, 'utf8'); } catch (e) { return []; }
    return s.split('\n').slice(from).filter((l) => re.test(l));
  };
  t.logLength = () => { try { return fs.readFileSync(clog, 'utf8').split('\n').length - 1; } catch (e) { return 0; } };
  /** Wait for a line of the renderer's log (e.g. "[login] http listener started"). */
  t.waitLog = async (re, { from = 0, timeout = 30000 } = {}) => {
    const l = await waitFor(() => t.logLines(re, from)[0], { timeout, interval: 250 });
    if (!l) throw new Error(`no log line ${re} within ${timeout} ms`);
    return l.replace(/^\[[^\]]+\] \[\w+\] /, '');
  };

  t.assertNoLeftovers = async ({ timeout = 10000 } = {}) => {
    const left = await waitFor(() => (appProcesses().length ? null : 'none'), { timeout, interval: 300 });
    if (!left) throw new Error('still running ' + Math.round(timeout / 1000) + ' s after quit: ' + appProcesses().join(' ; ').slice(0, 600));
    return 'no EpicWallet / epic-wallet / epic process left';
  };

  t.finish = async (extra = {}) => {
    if (t.app) {
      try { const p = t.app.process(); await t.app.close().catch(() => {}); if (p.exitCode === null) p.kill('SIGKILL'); } catch (e) { /* already gone */ }
    }
    copyLogs();
    if (t.node) await t.node.close().catch(() => {});
    //the gate's own output must never hold the password or the recovery words (the scratch HOME may)
    const leaks = secretLeaks();
    steps.push({ name: 'no password or recovery words in the run output', status: leaks.length ? 'fail' : 'pass', ms: 0,
      actual: leaks.length ? null : 'checked ' + outputFiles().length + ' files', error: leaks.length ? 'found in: ' + leaks.join(', ') : null });
    const counts = { pass: 0, fail: 0, 'known-bug': 0 };
    for (const s of steps) counts[s.status]++;
    const result = { spec, ui: UI, status: counts.fail ? 'fail' : 'pass', ...counts, ms: Date.now() - t0,
      stubNodeUnknown: t.node ? t.node.unknown : [], steps, ...extra };
    fs.writeFileSync(path.join(CASE_DIR, 'result.json'), redact(JSON.stringify(result, null, 2)));
    note(`[${UI}] ${spec}: ${counts.pass} pass, ${counts.fail} fail, ${counts['known-bug']} known-bug in ${Math.round(result.ms / 1000)} s`);
    return result;
  };

  function outputFiles(dir = CASE_DIR, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (p !== path.join(CASE_DIR, 'home') && e.name !== 'shots') outputFiles(p, out); } else out.push(p);
    }
    return out;
  }
  function secretLeaks() {
    const w = SECRETS.words;
    return outputFiles().filter((f) => {
      const s = fs.readFileSync(f, 'utf8');
      if (SECRETS.passwords.some((p) => s.includes(p))) return true;
      for (let i = 0; i + 2 <= w.length; i++) if (s.includes(w[i] + ' ' + w[i + 1])) return true;
      return false;
    }).map((f) => path.relative(CASE_DIR, f));
  }

  /** main.log and the wallet logs from the scratch HOME, redacted. */
  function copyLogs() {
    const dst = path.join(CASE_DIR, 'logs'); fs.mkdirSync(dst, { recursive: true });
    const walk = (d) => {
      let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const e of es) {
        const p = path.join(d, e.name);
        //app/ is Chromium's profile; chain and wallet data hold no logs
        if (e.isDirectory()) { if (!/^(app|chain_data|wallet_data)$/.test(e.name)) walk(p); }
        else if (/\.log(\.\d+)?$/.test(e.name)) {
          try { fs.writeFileSync(path.join(dst, path.relative(HOME, p).replace(/[\\/]/g, '__').replace(/^\./, '')), redact(fs.readFileSync(p, 'utf8'))); } catch (err) { /* unreadable: skipped */ }
        }
      }
    };
    //only the app's own folders: the sandbox also shows the repo under HOME
    walk(path.join(HOME, '.epic-gui')); walk(path.join(HOME, '.epic'));
  }
  return t;
}

class FatalStep extends Error { constructor(name) { super('fatal step failed: ' + name); this.fatal = true; } }

/** Run a spec body; a fatal step or an unexpected error ends it, finish() always runs. */
async function runCase(spec, body) {
  const t = createCase(spec);
  let aborted = null;
  try { await body(t); } catch (e) { aborted = e.fatal ? e.message : 'spec error: ' + redact(e.stack || e.message); console.log(aborted); }
  if (aborted && !t.steps.some((s) => s.status === 'fail')) t.steps.push({ name: 'spec aborted', status: 'fail', error: aborted, ms: 0 });
  const r = await t.finish(aborted ? { aborted } : {});
  process.exit(r.status === 'pass' ? 0 : 1);
}

module.exports = { createCase, runCase, newPassword, addSecrets, redact, waitFor, sleep, appProcesses, UI, NODE_PORT, CONSOLE_ALLOW };
