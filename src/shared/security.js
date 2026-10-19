/*
 * What the renderer may ask the preload and the main process to do on its behalf: open a link,
 * open a folder, touch a file, send a request to a node; and the page's Content-Security-Policy.
 * Plain ESM without app imports, so it runs under `node --test` (tests/security.test.js).
 */

/* an http(s) URL with a host and no user:password@, else '' (the string as it is to be opened) */
export function httpUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) return '';
  let u;
  try { u = new URL(url); } catch (e) { return ''; }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || u.username || u.password) return '';
  return u.href;
}

/* is this address the machine itself (the wallet's and the built-in node's APIs) */
export function isLoopbackUrl(url) {
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
  } catch (e) {
    return false;
  }
}

/* the wallet's owner and foreign API (epic-wallet owner_api, walletService.js): the one place the
   owner API secret may be sent */
export const WALLET_API_ORIGIN = 'http://127.0.0.1:3420';
export function isWalletApiUrl(url) {
  try {
    const u = new URL(url);
    return u.origin === WALLET_API_ORIGIN && ['/v3/owner', '/v2/foreign'].includes(u.pathname);
  } catch (e) {
    return false;
  }
}

/*
 * Is `p` the folder `parent` or inside it, by the path alone (no symlinks followed: the renderer
 * can't make one). pathMod: node's path (path.win32 in tests); on Windows any case.
 */
export function isInside(p, parent, pathMod) {
  if (typeof p !== 'string' || !p || typeof parent !== 'string' || !parent) return false;
  if (p.includes('\0')) return false;
  const win = pathMod.sep === '\\';
  const a = pathMod.resolve(p), b = pathMod.resolve(parent);
  const rel = pathMod.relative(win ? b.toLowerCase() : b, win ? a.toLowerCase() : a);
  return rel === '' || (!rel.startsWith('..') && !pathMod.isAbsolute(rel));
}

export const insideAny = (p, parents, pathMod) => parents.some(d => isInside(p, d, pathMod));

/*
 * The renderer's file system (window.nodeFs): node's fs, sync calls only, limited to
 *   write: the app's own folders (writeDirs: <root>, the default root) and what the user picked
 *          in a dialog (a folder, a file to save to)
 *   read:  those, plus the app's resources (the toml templates) and an older GUI's folders
 *          (the importer, read only)
 *   existsSync, realpathSync: anywhere (a yes/no, a path; never a file's content)
 * dirs(): {read: [...], write: [...]}, asked on every call (a picked folder is added later).
 * A refused call throws like fs does, with code EACCES.
 */
export function createScopedFs({ fs, pathMod, dirs }) {
  const refuse = (op, p) => {
    const e = new Error('EACCES: not an app folder, ' + op + " '" + p + "'");
    e.code = 'EACCES';
    throw e;
  };
  //paths as strings only: no file descriptors, Buffers or URLs
  const str = (p) => (typeof p === 'string' ? p : '');
  const canRead = (p) => { const d = dirs(); return insideAny(p, [...d.read, ...d.write], pathMod); };
  const canWrite = (p) => insideAny(p, dirs().write, pathMod);
  const reading = (op) => (p, ...rest) => (canRead(str(p)) ? fs[op](str(p), ...rest) : refuse(op, p));
  const writing = (op) => (p, ...rest) => (canWrite(str(p)) ? fs[op](str(p), ...rest) : refuse(op, p));
  const twoWrites = (op) => (from, to, ...rest) => (canWrite(str(from)) && canWrite(str(to)) ? fs[op](str(from), str(to), ...rest) : refuse(op, from));
  return {
    existsSync: (p) => fs.existsSync(str(p)),
    realpathSync: (p, ...rest) => fs.realpathSync(str(p), ...rest),
    readFileSync: reading('readFileSync'),
    //names only: a Dirent or Buffer list would not cross the context bridge as it is
    readdirSync: (p) => (canRead(str(p)) ? fs.readdirSync(str(p)) : refuse('readdirSync', p)),
    writeFileSync: writing('writeFileSync'),
    mkdirSync: writing('mkdirSync'),
    rmSync: writing('rmSync'),
    rmdirSync: writing('rmdirSync'),
    unlinkSync: writing('unlinkSync'),
    renameSync: twoWrites('renameSync'),
    //from a template in the resources (foundation.json) to an app folder
    copyFileSync: (from, to, ...rest) => (canRead(str(from)) && canWrite(str(to)) ? fs.copyFileSync(str(from), str(to), ...rest) : refuse('copyFileSync', to)),
  };
}

/*
 * A request the renderer sends to a node through the main process (background.js 'node-fetch',
 * for shared/nodeVersion.js): only the node API calls the GUI makes, GET or POST, to an http(s)
 * address; an Authorization header only to a node on this machine (the node's api secret never
 * goes to a remote node). Returns {url, method, headers, body, redirect, timeoutMs} or {error}.
 */
export const NODE_API_PATHS = ['/v1/version', '/v1/status', '/v2/owner', '/v2/foreign'];
const MAX_BODY = 4096;
export function nodeRequest(req) {
  const r = req && typeof req === 'object' ? req : {};
  const url = httpUrl(r.url);
  if (!url) return { error: 'not an http(s) address' };
  const u = new URL(url);
  if (!NODE_API_PATHS.includes(u.pathname.replace(/\/+$/, '')) || u.search || u.hash) return { error: 'not a node API call' };
  const method = String(r.method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method)) return { error: 'method not allowed' };
  const body = method === 'POST' && r.body != null ? String(r.body) : undefined;
  if (body && body.length > MAX_BODY) return { error: 'body too large' };
  const headers = {};
  for (const [k, v] of Object.entries(r.headers && typeof r.headers === 'object' ? r.headers : {})) {
    const key = String(k).toLowerCase();
    if (key === 'content-type') headers['Content-Type'] = String(v);
    else if (key === 'authorization' && isLoopbackUrl(url)) headers['Authorization'] = String(v);
  }
  const redirect = ['manual', 'error', 'follow'].includes(r.redirect) ? r.redirect : 'follow';
  const timeoutMs = Math.min(Math.max(Number(r.timeoutMs) || 10000, 500), 30000);
  return { url, method, headers, body, redirect, timeoutMs };
}

/*
 * The page's Content-Security-Policy. The page talks to the wallet API on this machine only; node
 * checks, the node list, the price and the public IP go through the preload and the main process.
 * dev: the dev server (eval source maps, its websocket for hot reload).
 */
export function contentSecurityPolicy({ dev = false, devServer = '' } = {}) {
  //the dev server's hot reload socket, on whichever address it announces (localhost or the LAN IP)
  const ws = devServer ? 'ws://*:' + (new URL(devServer).port || '80') : '';
  return [
    "default-src 'self'",
    "script-src 'self'" + (dev ? " 'unsafe-eval'" : ''),
    //Vue's style bindings, and the dev server's injected <style>
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "connect-src 'self' " + WALLET_API_ORIGIN + (dev && devServer ? ' ' + devServer + ' ' + ws : ''),
    //the jsstore IndexedDB worker (a file of the app)
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/* is this URL the app itself: its app:// files, or the dev server in development */
export function isAppUrl(url, devServer = '') {
  try {
    const u = new URL(url);
    if (u.protocol === 'app:') return true;
    return !!devServer && u.origin === new URL(devServer).origin;
  } catch (e) {
    return false;
  }
}
