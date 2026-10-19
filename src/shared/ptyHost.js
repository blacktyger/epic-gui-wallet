/*
 * Runs epic-wallet's listeners (http, Epicbox, the old-server check) and init / init -r on a
 * pseudo-terminal (node-pty), in the Electron main process (background.js), and answers their
 * password prompt itself (shared/ptyPrompt.js): the password is in no command line and never
 * goes back to the renderer. The preload starts them over IPC and gets their output as lines.
 *
 * Fallback: when node-pty can't be loaded or can't start a process on this platform, the process
 * is started as before, with --pass (walletArgs.withPassArg), and that is logged once, without
 * the arguments. The wallet keeps working either way.
 *
 * The recorded pid (shared/processOwnership.js) is the epic-wallet process itself: on Linux and
 * macOS node-pty forks and execs it, on Windows (ConPTY, or winpty before Windows 10 1903) its pid
 * is the process it created, not the console host. Processes are stopped by pid (the process
 * registry's kill: SIGTERM, taskkill /t), never with the pty's kill(): on Windows that forks a
 * helper that attaches to the console (conpty_console_list_agent), which can fail or show a window.
 *
 * Plain ESM with its I/O passed in (tests/ptyHost.test.js):
 *   loadPty() → node-pty (may throw); spawn: child_process.spawn; killTree(pid) → Promise
 *   win: Windows; log: {info, warn}; env: the environment for the child
 */
import { createPromptAnswerer, PHRASE_INVALID } from './ptyPrompt.js';
import { PTY_KINDS, hasPassArg, withPassArg } from './walletArgs.js';

const CR = Buffer.from('\r');
const WALLET_BIN = /^epic-wallet(\.exe)?$/i;

function baseName(p) {
  return String(p || '').split(/[\\/]/).pop();
}

/* the phrase as words: an echo of it may be wrapped or spaced differently */
function words(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).join(' ');
}

export function createPtyHost({ loadPty, spawn, killTree, win = false, log = {}, env = {}, cwd } = {}) {
  const info = log.info || (() => {});
  const warn = log.warn || (() => {});
  let pty;
  let ptyError = null;
  let fallbackLogged = false;
  let nextId = 1;
  //id → {pid, mode, kill()}
  const live = new Map();

  function ptyModule() {
    if (pty || ptyError) return pty;
    try {
      pty = loadPty();
      if (!pty || typeof pty.spawn !== 'function') throw new Error('node-pty has no spawn');
    } catch (e) {
      ptyError = e;
      pty = null;
    }
    return pty;
  }

  function logFallback(why) {
    if (fallbackLogged) return;
    fallbackLogged = true;
    warn('pseudo-terminal not available (' + String(why || 'unknown').slice(0, 200) + '): epic-wallet listeners and init are started with the password argument');
  }

  /*
   * start({cmd, args, kind, password, phrase, onLines, onExit}) → {id, pid, mode: 'pty'|'pipe'}
   *   kind: listen | epicbox | init | recover (walletArgs.PTY_KINDS); args without a password
   *   password: Buffer (the host's copy: zeroed here once written or at exit); phrase: init -r only
   *   onLines(lines): output lines (stdout and stderr together), prompts and echoes left out
   *   onExit({code, signal, fail}): fail 'invalid_phrase' | 'unexpected_prompt' | null
   * Throws on a bad request (nothing is started).
   */
  function start({ cmd, args, kind, password, phrase, onLines = () => {}, onExit = () => {} }) {
    const spec = PTY_KINDS[kind];
    if (!spec) throw new Error('unknown kind ' + kind);
    if (!WALLET_BIN.test(baseName(cmd))) throw new Error('not the epic-wallet binary');
    if (!Array.isArray(args) || args.some(a => typeof a !== 'string')) throw new Error('args must be strings');
    if (hasPassArg(args)) throw new Error('args must not carry a password');
    if (!Buffer.isBuffer(password)) throw new Error('no password');
    if (spec.phrase && !words(phrase)) throw new Error('no recovery phrase');

    let pw = password;
    let phraseWords = spec.phrase ? words(phrase) : '';
    const wipe = () => {
      if (pw) pw.fill(0);
      pw = null;
      phraseWords = '';
    };
    const isSecret = (line) => {
      if (phraseWords && words(line).includes(phraseWords)) return true;
      //an echoed password would be a line of its own
      return !!pw && pw.length > 0 && Buffer.from(line.trim(), 'utf8').equals(pw);
    };

    const id = nextId++;
    let fail = null;
    let exited = false;
    let pid = 0;
    const stop = () => {
      if (pid > 0) Promise.resolve(killTree(pid)).catch(() => {});
    };
    const finish = (code, signal, lines) => {
      if (exited) return;
      exited = true;
      if (lines && lines.length) onLines(lines);
      wipe();
      live.delete(id);
      onExit({ code: code == null ? null : code, signal: signal || null, fail });
    };

    const p = ptyModule();
    if (p) {
      const answerer = createPromptAnswerer({ passwords: spec.passwords, phrase: spec.phrase, isSecret });
      let term = null;
      try {
        //wide, so ConPTY doesn't wrap the log lines; cwd and env as the other spawns
        term = p.spawn(cmd, args, { name: 'xterm', cols: 400, rows: 40, cwd: cwd || process.cwd(), env, useConptyDll: false });
      } catch (e) {
        ptyError = e;
        term = null;
      }
      if (term && term.pid > 0) {
        pid = term.pid;
        const write = (what) => {
          if (what === 'password' && pw) {
            const data = Buffer.concat([pw, CR]);
            term.write(data);
            //POSIX: written from a copy at once; Windows: the socket may still hold it a moment
            if (win) setTimeout(() => data.fill(0), 5000); else data.fill(0);
          } else if (what === 'phrase' && phraseWords) {
            term.write(phraseWords + '\r');
          }
        };
        term.onData((d) => {
          const r = answerer.feed(d);
          if (r.lines.length) onLines(r.lines);
          for (const a of r.answers) write(a);
          //all prompts answered: nothing is written any more, the password goes (the phrase is
          //kept until the end, to keep it out of the output)
          if (r.answers.length && answerer.done && pw) {
            pw.fill(0);
            pw = null;
          }
          if (r.fail && !fail) {
            fail = r.fail;
            wipe();
            stop();
          }
        });
        term.onExit(({ exitCode, signal }) => finish(exitCode, signal, answerer.end().lines));
        live.set(id, { pid, mode: 'pty' });
        return { id, pid, mode: 'pty' };
      }
    }

    //fallback: a pipe, the password as an argument (as before node-pty)
    logFallback(ptyError ? ptyError.message : 'spawn failed');
    const fullArgs = withPassArg(args, pw.toString('utf8'));
    const child = spawn(cmd, fullArgs, { shell: false, windowsHide: true });
    fullArgs.fill('');
    //given: only the phrase may still be needed
    pw.fill(0);
    pw = null;
    pid = child.pid || 0;
    //no prompt is expected: --pass answers them. The phrase goes to stdin when it is asked for
    const answerer = createPromptAnswerer({ passwords: 0, phrase: false, isSecret });
    let phraseSent = false;
    const onData = (d) => {
      const r = answerer.feed(d);
      for (const line of r.lines) {
        if (spec.phrase && line.includes(PHRASE_INVALID) && !fail) {
          fail = 'invalid_phrase';
        }
      }
      if (r.lines.length) onLines(r.lines);
      if (spec.phrase && !phraseSent && phraseWords && r.lines.some(l => l.includes('Please enter your recovery phrase'))) {
        phraseSent = true;
        child.stdin.write(phraseWords + '\n');
      }
      if ((r.fail || fail) && !child.killed) {
        fail = fail || r.fail;
        wipe();
        stop();
      }
    };
    if (child.stdout) { child.stdout.setEncoding('utf8'); child.stdout.on('data', onData); }
    if (child.stderr) { child.stderr.setEncoding('utf8'); child.stderr.on('data', onData); }
    child.on('error', (e) => finish(null, null, ['spawn failed: ' + (e && e.code ? e.code : 'error')]));
    child.on('exit', (code, signal) => finish(code, signal, answerer.end().lines));
    if (!pid) {
      return { id, pid: 0, mode: 'pipe' };
    }
    live.set(id, { pid, mode: 'pipe' });
    return { id, pid, mode: 'pipe' };
  }

  /* stop one (init / recover cleanup); listeners are stopped through the process registry */
  function kill(id) {
    const l = live.get(Number(id));
    if (!l) return Promise.resolve(false);
    return Promise.resolve(killTree(l.pid)).then(() => true, () => false);
  }

  /* quit: whatever still runs */
  function killAll() {
    return Promise.all([...live.values()].map(l => Promise.resolve(killTree(l.pid)).catch(() => false)));
  }

  return {
    start,
    kill,
    killAll,
    pids: () => [...live.values()].map(l => l.pid),
    /* is a pseudo-terminal used (false: the --pass fallback) */
    available: () => !!ptyModule(),
  };
}
