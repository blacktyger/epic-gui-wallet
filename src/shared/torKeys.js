/*
 * The wallet's onion key, made once per wallet (tor-616 §4 "The onion key"). Its seed comes only
 * from epic-wallet (derived from the wallet key), so when
 * <dataDir>/wallet_tor/onion_service_addresses/<onion>/hs_ed25519_secret_key is missing the main
 * process runs epic-wallet once:
 *
 *   1. <configDir>/tor-keys/epic-wallet.toml (walletToml.renderTorKeysToml): use_tor_listener =
 *      true, socks_proxy_addr = our tor's SOCKS port (so it starts no tor of its own), a free port
 *   2. `epic-wallet --offline_mode -t <dataDir> -c <configDir>/tor-keys listen --method http` on the
 *      pty host (kind torkeys), which answers the password prompt with the session's password
 *   3. once the key file for <onion> is there (96 bytes, its public half the onion's, or a key a
 *      fixed epic-wallet wrote expanded), the process is stopped; 30 s, then it fails (keys)
 *
 * epic-wallet only writes the key when the onion's folder is missing: a folder without a good key
 * file (missing, damaged) is moved aside first (<folder>.bad-<time>, never deleted: user data).
 *
 * The run is recorded (record/forget: the process registry, role listen in <configDir>/tor-keys)
 * and ends early when `signal` aborts (lock, wallet switch, Tor off, quit: torManager's stop);
 * the promise settles only once the kill is done. The toml with use_tor_listener = true is
 * removed afterwards (and at the app's start, background.js, after a crash). Nothing here reads
 * or logs the key.
 * Plain ESM with its I/O passed in (tests/torKeys.test.js).
 */
import { onionKeyPath, readOnionKeyFile, parseOnion } from './onion.js';
import { renderTorKeysToml } from './walletToml.js';
import { torKeysArgs } from './walletArgs.js';

export const KEYS_DIR = 'tor-keys';
export const TIMEOUT_MS = 30000;

/*
 *   ptyHost: shared/ptyHost.js; password(): a Buffer copy of the session password (null: locked)
 *   bin: the app's epic-wallet; fs (sync); join; freePort() → Promise<port>; template: the toml
 *   template's text; wallet: {network, configDir, dataDir, nodeUrl}; onion; socksPort;
 *   signal: an AbortSignal (optional); record(pid, cmd, args) / forget(pid): the process registry
 * → {ok: true} | {ok: false, detail}
 */
export async function ensureOnionKey({ ptyHost, password, bin, fs, join, freePort, template, wallet, onion, socksPort,
  timeoutMs = TIMEOUT_MS, pollMs = 100, log = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, now = () => Date.now(),
  signal = null, record = () => {}, forget = () => {} }) {
  const p = parseOnion(onion);
  if (!p.valid) return { ok: false, detail: 'invalid onion' };
  const keyPath = onionKeyPath(wallet.dataDir, p.host, join);
  const have = () => {
    try { return !!readOnionKeyFile(fs.readFileSync(keyPath)); } catch (e) { return false; }
  };
  if (have()) return { ok: true };
  if (signal && signal.aborted) return { ok: false, detail: 'stopped' };
  const keysDir = join(wallet.configDir, KEYS_DIR);
  const tomlPath = join(keysDir, 'epic-wallet.toml');
  let pw = password();
  if (!pw) return { ok: false, detail: 'locked' };
  //a folder without a good key: epic-wallet would leave it as it is and never write the key
  const onionDir = join(wallet.dataDir, 'wallet_tor', 'onion_service_addresses', p.host.slice(0, -'.onion'.length));
  if (fs.existsSync(onionDir)) {
    const aside = onionDir + '.bad-' + now();
    try {
      fs.renameSync(onionDir, aside);
      log('tor keys: moved a folder without a good key aside');
    } catch (e) {
      pw.fill(0);
      return { ok: false, detail: 'could not move the damaged key folder aside: ' + (e && (e.code || e.message)) };
    }
  }
  let id = null;
  try {
    const port = await freePort();
    fs.mkdirSync(keysDir, { recursive: true });
    fs.writeFileSync(tomlPath, renderTorKeysToml({ template, network: wallet.network, keysDir, dataDir: wallet.dataDir,
      nodeUrl: wallet.nodeUrl, socksPort, listenPort: port }), { mode: 0o600 });
    const args = torKeysArgs({ network: wallet.network, keysDir, dataDir: wallet.dataDir });
    if (signal && signal.aborted) return { ok: false, detail: 'stopped' };
    return await new Promise((resolve) => {
      let done = false;
      let poll = null;
      let pid = 0;
      const lines = [];
      const onAbort = () => finish({ ok: false, detail: 'stopped' });
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimer(poll);
        clearTimer(deadline);
        if (signal) signal.removeEventListener('abort', onAbort);
        //settles once the process is gone: a lock right after must not find it still holding the wallet
        const killed = id !== null ? Promise.resolve(ptyHost.kill(id)).catch(() => {}) : Promise.resolve();
        killed.then(() => {
          if (pid) forget(pid);
          resolve(r);
        });
      };
      const deadline = setTimer(() => finish({ ok: false, detail: 'no key after ' + Math.round(timeoutMs / 1000) + ' s' }), timeoutMs);
      let r;
      try {
        r = ptyHost.start({ cmd: bin, args, kind: 'torkeys', password: pw, dir: wallet.dataDir, cwd: keysDir,
        //the output stays here: only the last lines, as the detail of a failure (ptyHost drops prompts and echoes)
        onLines: (ls) => { lines.push(...ls); lines.splice(0, Math.max(0, lines.length - 5)); },
        onExit: (e) => {
          id = null;
          if (pid) forget(pid);
          //the key may have been written just before it exited
          if (have()) return finish({ ok: true });
          finish({ ok: false, detail: e.fail || ('epic-wallet exited (' + e.code + ')' + (lines.length ? ': ' + lines.at(-1).slice(0, 200) : '')) });
        } });
      } catch (e) {
        return finish({ ok: false, detail: e && e.message });
      }
      //ptyHost owns the password copy now (zeroed once written)
      pw = null;
      id = r.id;
      pid = r.pid || 0;
      if (pid) record(pid, bin, args);
      if (signal) signal.addEventListener('abort', onAbort);
      log('tor keys: one-shot started (' + r.mode + ')');
      const check = () => {
        if (done) return;
        if (have()) return finish({ ok: true });
        poll = setTimer(check, pollMs);
      };
      check();
    });
  } catch (e) {
    return { ok: false, detail: e && e.message };
  } finally {
    if (pw) pw.fill(0);
    try { fs.unlinkSync(tomlPath); } catch (e) { /* not written */ }
  }
}
