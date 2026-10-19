/*
 * fetch for the node checks (shared/nodeVersion.js), through the main process (background.js
 * 'node-fetch', limited by shared/security.js nodeRequest). The page itself only talks to the
 * wallet API on this machine (its Content-Security-Policy): a node is any host the user types, on
 * http or https, and its replies (a 401 too) carry no CORS headers the page could rely on.
 *
 * bridge(req) → Promise<{ok, status, redirected, text} | {error}>; the reply is shaped like the
 * part of a fetch Response nodeVersion reads: ok, status, type, json(). An aborted signal rejects
 * with an AbortError, as fetch does.
 */
export function bridgedFetch(bridge) {
  return (url, opts = {}) => new Promise((resolve, reject) => {
    const signal = opts.signal;
    const abortError = () => {
      const e = new Error('The operation was aborted.');
      e.name = 'AbortError';
      return e;
    };
    if (signal && signal.aborted) return reject(abortError());
    const onAbort = () => reject(abortError());
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(bridge({
      url: String(url),
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: opts.body,
      redirect: opts.redirect,
      timeoutMs: opts.timeoutMs,
    })).then((r) => {
      if (!r || r.error) {
        const e = new TypeError('Failed to fetch' + (r && r.error ? ': ' + r.error : ''));
        if (r && r.timeout) e.name = 'TimeoutError';
        throw e;
      }
      const status = Number(r.status) || 0;
      resolve({
        ok: status >= 200 && status < 300,
        status,
        type: status >= 300 && status < 400 ? 'opaqueredirect' : 'basic',
        json: async () => JSON.parse(r.text),
        text: async () => r.text,
      });
    }).catch(reject).finally(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
    });
  });
}

/* in the app: the main process's; elsewhere (tests, a page without the preload) the global fetch */
export function defaultNodeFetch() {
  const api = typeof window !== 'undefined' && window.api;
  if (api && typeof api.nodeFetch === 'function') return bridgedFetch(api.nodeFetch);
  return (...args) => fetch(...args);
}
