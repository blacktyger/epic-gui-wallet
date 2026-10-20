/*
 * The e2e gate: `npm run test:e2e`. Builds the Linux app from this checkout (or reuses the last build
 * when the sources are unchanged, or takes E2E_APPDIR=<linux-unpacked>), then runs every spec in
 * specs/ once per interface, each in its own sandbox, in parallel:
 *
 *   bwrap --unshare-net (loopback only: no network at all) --unshare-pid, private /tmp, and a fresh
 *   scratch HOME bound over $HOME; inside, a private Xvfb (sandbox.sh), the stub node and the spec.
 *
 * Output: tests/e2e/out/run-<stamp>/ (ignored): summary.json, junit.xml, and per case
 * <spec>-<ui>/ result.json, console.log, app.stdout.log, stub-node.log, logs/, shots/ (failures).
 * Exit 0 only when no step failed; known-bug steps are listed but don't fail the gate.
 *
 *   node tests/e2e/run.js [--spec smoke,errors] [--ui modern|classic] [--rebuild] [--quarantine] [--keep-home] [-j N]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { build } = require('./build-app');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const HOME = os.homedir();
const CASE_TIMEOUT = Number(process.env.E2E_CASE_TIMEOUT || 300);

function args() {
  const a = process.argv.slice(2); const o = { spec: null, ui: ['modern', 'classic'], rebuild: false, quarantine: false, keepHome: false, jobs: Number(process.env.E2E_JOBS || 4) };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--spec') o.spec = a[++i].split(',');
    else if (a[i] === '--ui') o.ui = a[++i].split(',');
    else if (a[i] === '--rebuild') o.rebuild = true;
    else if (a[i] === '--quarantine') o.quarantine = true;
    else if (a[i] === '--keep-home') o.keepHome = true;
    else if (a[i] === '-j') o.jobs = Number(a[++i]);
    else { console.error('unknown argument ' + a[i]); process.exit(2); }
  }
  return o;
}

function specs(o) {
  const list = [];
  const dirs = [['specs', false]].concat(o.quarantine ? [['quarantine', true]] : []);
  for (const [d, q] of dirs) {
    const dir = path.join(__dirname, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
      const name = (q ? 'quarantine/' : '') + f.replace(/\.js$/, '');
      if (o.spec && !o.spec.includes(f.replace(/\.js$/, '')) && !o.spec.includes(name)) continue;
      //in its first lines a spec may say `// e2e-ui: modern` (one interface only), `// e2e-gate: off`
      //(not in the default run, only when --spec names it) and `// e2e-timeout: 600` (seconds per case)
      const head = fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 800);
      if (/e2e-gate:\s*off/.test(head) && !o.spec) continue;
      const only = (head.match(/e2e-ui:\s*(\w+)/) || [])[1];
      const timeout = Number((head.match(/e2e-timeout:\s*(\d+)/) || [])[1]) || CASE_TIMEOUT;
      for (const ui of o.ui) if (!only || only === ui) list.push({ name, file: path.join(dir, f), ui, timeout });
    }
  }
  return list;
}

/** Directories the sandbox must still see under the scratch HOME (it hides the real one). */
function underHome(p) { return p === HOME || p.startsWith(HOME + path.sep); }
function nodeRoot() { return path.dirname(path.dirname(process.execPath)); }

function runCase(c, appDir, runDir, o) {
  const caseDir = path.join(runDir, `${c.name.replace(/\//g, '-')}-${c.ui}`);
  const home = path.join(caseDir, 'home');
  fs.mkdirSync(home, { recursive: true });
  const binds = ['--ro-bind', ROOT, ROOT, '--bind', OUT, OUT];
  if (underHome(nodeRoot())) binds.push('--ro-bind', nodeRoot(), nodeRoot());
  if (!appDir.startsWith(ROOT + path.sep) && underHome(appDir)) binds.push('--ro-bind', appDir, appDir);
  const bw = ['-k', '10', String(c.timeout), 'bwrap', '--unshare-net', '--unshare-pid', '--die-with-parent',
    '--dev-bind', '/', '/', '--proc', '/proc', '--tmpfs', '/tmp', '--bind', home, HOME, ...binds,
    '--unsetenv', 'DBUS_SESSION_BUS_ADDRESS', '--unsetenv', 'XDG_RUNTIME_DIR', '--unsetenv', 'WAYLAND_DISPLAY', '--unsetenv', 'DISPLAY',
    '--unsetenv', 'SSH_AUTH_SOCK', '--unsetenv', 'ELECTRON_RUN_AS_NODE', '--unsetenv', 'NODE_OPTIONS',
    '--setenv', 'HOME', HOME, '--setenv', 'TMPDIR', '/tmp', '--setenv', 'TMP', '/tmp', '--setenv', 'TEMP', '/tmp',
    '--setenv', 'E2E_APPDIR', appDir, '--setenv', 'E2E_CASE_DIR', caseDir, '--setenv', 'E2E_UI', c.ui,
    '--chdir', ROOT, 'sh', path.join(__dirname, 'sandbox.sh'), process.execPath, c.file];
  const log = fs.openSync(path.join(caseDir, 'driver.log'), 'w');
  const t0 = Date.now();
  return new Promise((resolve) => {
    const p = spawn('timeout', bw, { stdio: ['ignore', 'pipe', 'pipe'] });
    const pipe = (d) => { fs.writeSync(log, d); for (const l of String(d).split('\n')) if (/^\[(modern|classic)\]/.test(l)) process.stdout.write(`  ${c.name} ${l}\n`); };
    p.stdout.on('data', pipe); p.stderr.on('data', pipe);
    p.on('close', (code) => {
      fs.closeSync(log);
      let r = null;
      try { r = JSON.parse(fs.readFileSync(path.join(caseDir, 'result.json'), 'utf8')); } catch (e) { /* none: crashed or timed out */ }
      if (!r) {
        const tail = (fs.readFileSync(path.join(caseDir, 'driver.log'), 'utf8').trim().split('\n').slice(-6)).join(' | ');
        r = { spec: c.name, ui: c.ui, status: 'fail', pass: 0, fail: 1, 'known-bug': 0, steps: [{ name: 'case', status: 'fail',
          error: (code === 124 || code === 137 || Date.now() - t0 >= c.timeout * 1000 ? `timed out after ${c.timeout} s` : `exit ${code}, no result.json`) + ' :: ' + tail, ms: Date.now() - t0 }] };
      }
      r.exitCode = code; r.wallMs = Date.now() - t0; r.dir = path.relative(ROOT, caseDir);
      //the scratch HOME holds a throwaway wallet and Chromium's profile: kept only when the case failed
      if (r.status === 'pass' && !o.keepHome) fs.rmSync(home, { recursive: true, force: true });
      resolve(r);
    });
  });
}

const xml = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
function junit(results) {
  const suites = results.map((r) => {
    const cases = r.steps.map((s) => `    <testcase classname="e2e.${xml(r.spec)}.${r.ui}" name="${xml(s.name)}" time="${((s.ms || 0) / 1000).toFixed(2)}">` +
      (s.status === 'fail' ? `<failure message="${xml((s.error || '').split('\n')[0])}">${xml(s.error)}</failure>` : '') +
      (s.status === 'known-bug' ? `<skipped message="known bug ${xml(s.knownBug)}: ${xml((s.error || '').split('\n')[0])}"/>` : '') + '</testcase>');
    return `  <testsuite name="e2e.${xml(r.spec)}.${r.ui}" tests="${r.steps.length}" failures="${r.fail}" skipped="${r['known-bug']}" time="${((r.wallMs || 0) / 1000).toFixed(1)}">\n${cases.join('\n')}\n  </testsuite>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n${suites.join('\n')}\n</testsuites>\n`;
}

async function main() {
  const o = args();
  const t0 = Date.now();
  for (const tool of ['bwrap', 'Xvfb', 'ps', 'timeout']) {
    try { execFileSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' }); } catch (e) { console.error(`e2e: ${tool} is needed (apt install bubblewrap xvfb procps)`); process.exit(2); }
  }
  let appDir = process.env.E2E_APPDIR ? path.resolve(process.env.E2E_APPDIR) : null; let buildMs = 0; let built = false;
  if (appDir) {
    if (!fs.existsSync(path.join(appDir, 'EpicWallet'))) { console.error('E2E_APPDIR has no EpicWallet: ' + appDir); process.exit(2); }
    console.log('[build] E2E_APPDIR=' + appDir);
  } else {
    const b = await build({ force: o.rebuild }); appDir = b.appDir; buildMs = b.ms; built = b.built;
  }
  const list = specs(o);
  if (!list.length) { console.error('no specs matched'); process.exit(2); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = path.join(OUT, 'run-' + stamp);
  fs.mkdirSync(runDir, { recursive: true });
  //older runs: the newest E2E_KEEP_RUNS (10) stay
  const runs = fs.readdirSync(OUT).filter((d) => /^run-\d{4}-/.test(d)).sort();
  for (const d of runs.slice(0, Math.max(0, runs.length - Number(process.env.E2E_KEEP_RUNS || 10)))) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
  console.log(`[e2e] ${list.length} case(s), ${Math.min(o.jobs, list.length)} at a time -> ${path.relative(ROOT, runDir)}`);
  const results = []; const queue = [...list];
  await Promise.all(Array.from({ length: Math.max(1, Math.min(o.jobs, list.length)) }, async () => {
    while (queue.length) { const c = queue.shift(); results.push(await runCase(c, appDir, runDir, o)); }
  }));
  results.sort((a, b) => (a.spec + a.ui).localeCompare(b.spec + b.ui));
  const fails = results.filter((r) => r.status !== 'pass');
  const known = results.flatMap((r) => r.steps.filter((s) => s.status === 'known-bug').map((s) => ({ case: `${r.spec}/${r.ui}`, step: s.name, knownBug: s.knownBug, error: s.error })));
  const fixedKnown = results.flatMap((r) => r.steps.filter((s) => s.note).map((s) => ({ case: `${r.spec}/${r.ui}`, step: s.name, note: s.note })));
  const summary = { status: fails.length ? 'fail' : 'pass', appDir, built, buildMs, totalMs: Date.now() - t0, runDir: path.relative(ROOT, runDir),
    cases: results.map((r) => ({ spec: r.spec, ui: r.ui, status: r.status, pass: r.pass, fail: r.fail, knownBug: r['known-bug'], seconds: Math.round((r.wallMs || 0) / 1000), dir: r.dir,
      failures: r.steps.filter((s) => s.status === 'fail').map((s) => ({ step: s.name, error: s.error, shot: s.shot ? path.join(r.dir, s.shot) : null })), stubNodeUnknown: r.stubNodeUnknown || [] })),
    knownBugs: known, knownBugsNotReproduced: fixedKnown };
  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(runDir, 'junit.xml'), junit(results));
  fs.writeFileSync(path.join(OUT, 'last-summary.json'), JSON.stringify(summary, null, 2));

  console.log('\n[e2e] results');
  for (const c of summary.cases) {
    console.log(`  ${c.status === 'pass' ? 'PASS' : 'FAIL'}  ${c.spec}/${c.ui}  ${c.pass} pass, ${c.fail} fail, ${c.knownBug} known-bug  ${c.seconds} s`);
    for (const f of c.failures) console.log(`        x ${f.step}: ${(f.error || '').split('\n')[0].slice(0, 240)}${f.shot ? '  [' + f.shot + ']' : ''}`);
    if (c.stubNodeUnknown.length) console.log(`        (stub node had no answer for: ${[...new Set(c.stubNodeUnknown.map((u) => u.path + ' ' + u.method))].join(', ')})`);
  }
  for (const k of known) console.log(`  known bug ${k.knownBug}  ${k.case}: ${k.step}`);
  for (const k of fixedKnown) console.log(`  NOTE ${k.case}: ${k.step}: ${k.note}`);
  console.log(`[e2e] ${summary.status.toUpperCase()} in ${Math.round(summary.totalMs / 1000)} s (build ${built ? Math.round(buildMs / 1000) + ' s' : 'reused'}); ${path.relative(ROOT, runDir)}/summary.json`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
