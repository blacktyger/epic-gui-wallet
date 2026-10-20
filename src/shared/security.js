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
 * copyFileSync copies from copyFrom (the resources: foundation.json) or within the write folders
 * (settingsStore's settings.json.bak), never from a read-only folder or a picked file.
 * A write must also stay inside by where it really lands: a symlink or junction already in an app
 * folder doesn't lead a write out of it (the page can't make one; something else may have).
 * No file is left executable: a mode loses its x bits, and a written or copied file that has them
 * (a copy keeps its source's) is made 0o666 & mode (a page could otherwise make a program and point
 * a toml, or a macOS .app, at it). A refused call throws like fs does, with code EACCES.
 */
export function createScopedFs({ fs, pathMod, dirs, copyFrom = [] }) {
  const refuse = (op, p) => {
    const e = new Error('EACCES: not an app folder, ' + op + " '" + p + "'");
    e.code = 'EACCES';
    throw e;
  };
  //paths as strings only: no file descriptors, Buffers or URLs
  const str = (p) => (typeof p === 'string' ? p : '');
  const canRead = (p) => { const d = dirs(); return insideAny(p, [...d.read, ...d.write], pathMod); };
  //p with its nearest existing folder resolved through symlinks (the rest isn't there yet)
  const realOf = (p) => {
    let dir = pathMod.resolve(p);
    const tail = [];
    for (;;) {
      try {
        if (fs.existsSync(dir)) return pathMod.join(fs.realpathSync(dir), ...tail);
      } catch (e) { /* unreadable: as written */ }
      const up = pathMod.dirname(dir);
      if (up === dir) return pathMod.resolve(p);
      tail.unshift(pathMod.basename(dir));
      dir = up;
    }
  };
  const canWrite = (p) => {
    const write = dirs().write;
    if (!insideAny(p, write, pathMod)) return false;
    const real = realOf(p);
    return write.some(d => isInside(real, realOf(d), pathMod));
  };
  const dropExec = (p) => {
    try {
      const m = fs.statSync(p).mode & 0o7777;
      if (m & 0o111) fs.chmodSync(p, m & 0o666);
    } catch (e) { /* written; its mode as it is */ }
  };
  const reading = (op) => (p, ...rest) => (canRead(str(p)) ? fs[op](str(p), ...rest) : refuse(op, p));
  const writing = (op) => (p, ...rest) => (canWrite(str(p)) ? fs[op](str(p), ...rest) : refuse(op, p));
  //options: an encoding string, or {encoding, mode, flag}
  const noExec = (o) => (o && typeof o === 'object' && o.mode != null ? { ...o, mode: Number(o.mode) & 0o666 } : o);
  const twoWrites = (op) => (from, to, ...rest) => (canWrite(str(from)) && canWrite(str(to)) ? fs[op](str(from), str(to), ...rest) : refuse(op, from));
  return {
    existsSync: (p) => fs.existsSync(str(p)),
    realpathSync: (p, ...rest) => fs.realpathSync(str(p), ...rest),
    readFileSync: reading('readFileSync'),
    //a plain object: a Stats' methods (on its prototype) would not cross the context bridge
    lstatSync: (p) => {
      if (!canRead(str(p))) return refuse('lstatSync', p);
      const st = fs.lstatSync(str(p));
      const is = { isFile: st.isFile(), isDirectory: st.isDirectory(), isSymbolicLink: st.isSymbolicLink() };
      return { size: st.size, mtimeMs: st.mtimeMs, isFile: () => is.isFile, isDirectory: () => is.isDirectory, isSymbolicLink: () => is.isSymbolicLink };
    },
    //names only: a Dirent or Buffer list would not cross the context bridge as it is
    readdirSync: (p) => (canRead(str(p)) ? fs.readdirSync(str(p)) : refuse('readdirSync', p)),
    writeFileSync: (p, data, o) => {
      if (!canWrite(str(p))) return refuse('writeFileSync', p);
      fs.writeFileSync(str(p), data, noExec(o));
      dropExec(str(p));
    },
    mkdirSync: writing('mkdirSync'),
    rmSync: writing('rmSync'),
    rmdirSync: writing('rmdirSync'),
    unlinkSync: writing('unlinkSync'),
    renameSync: twoWrites('renameSync'),
    copyFileSync: (from, to, ...rest) => {
      if (!(insideAny(str(from), copyFrom, pathMod) || canWrite(str(from))) || !canWrite(str(to))) return refuse('copyFileSync', to);
      fs.copyFileSync(str(from), str(to), ...rest);
      dropExec(str(to));
    },
  };
}

/*
 * A request the renderer sends to a node through the main process (background.js 'node-fetch',
 * for shared/nodeVersion.js): only the node API calls the GUI makes, to an http(s) address: GET
 * /v1/version or /v1/status, or POST /v2/owner or /v2/foreign with one of the JSON-RPC calls
 * nodeVersion sends (no params), so nothing else can be carried to a host of the page's choice;
 * an Authorization header only to a node on this machine (the node's api secret never goes to a
 * remote node). Returns {url, method, headers, body, redirect, timeoutMs} or {error}.
 */
export const NODE_API_PATHS = ['/v1/version', '/v1/status', '/v2/owner', '/v2/foreign'];
const NODE_RPC = { '/v2/owner': ['get_status'], '/v2/foreign': ['get_version', 'get_tip', 'ready_for_txs', 'get_kernel', 'get_header'] };
/* a call's params, rebuilt, or null when they are not what the call takes: none, except get_header [a height, null, null] and get_kernel
   [excess (a commitment, 33 bytes hex), min_height (a height or null), null] (shared/sendAllKernel.js) */
function nodeRpcParams(method, params) {
  if (!Array.isArray(params)) return null;
  if (method === 'get_header') {
    return params.length === 3 && Number.isSafeInteger(params[0]) && params[0] >= 0 && params[1] === null && params[2] === null
      ? [params[0], null, null] : null;
  }
  if (method !== 'get_kernel') return params.length === 0 ? [] : null;
  const [excess, min, max] = params;
  const okMin = min === null || (Number.isSafeInteger(min) && min >= 0);
  return params.length === 3 && typeof excess === 'string' && /^[0-9a-f]{66}$/.test(excess) && okMin && max === null
    ? [excess, min, null] : null;
}
//the body as the main process sends it (rebuilt, not passed on), '' when it is not such a call
function nodeRpcBody(path, body) {
  let b;
  try { b = JSON.parse(body); } catch (e) { return ''; }
  const keys = b && typeof b === 'object' ? Object.keys(b).sort().join(',') : '';
  const ok = keys === 'id,jsonrpc,method,params' && b.jsonrpc === '2.0' && Number.isInteger(b.id)
    && (NODE_RPC[path] || []).includes(b.method);
  const params = ok ? nodeRpcParams(b.method, b.params) : null;
  return params ? JSON.stringify({ jsonrpc: '2.0', id: b.id, method: b.method, params }) : '';
}
export function nodeRequest(req) {
  const r = req && typeof req === 'object' ? req : {};
  const url = httpUrl(r.url);
  if (!url) return { error: 'not an http(s) address' };
  const u = new URL(url);
  const path = u.pathname.replace(/\/+$/, '');
  if (!NODE_API_PATHS.includes(path) || u.search || u.hash) return { error: 'not a node API call' };
  const method = String(r.method || 'GET').toUpperCase();
  if (method !== (NODE_RPC[path] ? 'POST' : 'GET')) return { error: 'method not allowed' };
  let body;
  if (method === 'POST') {
    body = nodeRpcBody(path, String(r.body == null ? '' : r.body).slice(0, 1024));
    if (!body) return { error: 'not a node API call' };
  }
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
