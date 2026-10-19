/*
 * Where the version number in the sidebar / header leads: the GitHub release of this version on
 * the wallet's repository (tags are "v" + the package version, e.g. v6.0.0), or the releases page
 * when that tag has no page (not published yet, a dev build).
 *
 * The main process (background.js) asks GitHub once, on the first click, with a HEAD request and a
 * short timeout; the renderer only gets the url back and opens it in the browser. No Electron or
 * DOM imports, so it runs under `node --test` (tests/releaseLink.test.js).
 */

export const REPO_URL = 'https://github.com/blacktyger/epic-gui-wallet';
export const RELEASES_URL = REPO_URL + '/releases';

/* "6.1.1" → "v6.1.1"; null for anything that is not a version */
export function releaseTag(version) {
  const v = String(version == null ? '' : version).trim().replace(/^v/i, '');
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]{1,32})?$/.test(v) ? 'v' + v : null;
}

/* the page of that release, or null */
export function releaseTagUrl(version) {
  const tag = releaseTag(version);
  return tag ? RELEASES_URL + '/tag/' + encodeURIComponent(tag) : null;
}

/* The release page when GitHub has it (200), else the releases page. Never throws. */
export async function resolveReleaseUrl(fetchFn, version, { timeoutMs = 3000 } = {}) {
  const url = releaseTagUrl(version);
  if (!url || typeof fetchFn !== 'function') return RELEASES_URL;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  try {
    const res = await Promise.race([
      fetchFn(url, { method: 'HEAD', credentials: 'omit', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }),
      new Promise((resolve) => { timer = setTimeout(() => { if (ctrl) ctrl.abort(); resolve(null); }, timeoutMs); }),
    ]);
    return res && res.status === 200 ? url : RELEASES_URL;
  } catch (e) {
    return RELEASES_URL;
  } finally {
    clearTimeout(timer);
  }
}

/*
 * The main-process side: resolveReleaseUrl with a cache (a found release for good, the fallback for
 * failTtlMs so a later click can find a release published meanwhile) and one request in flight.
 */
export function createReleaseLink({ fetch: fetchFn, now = () => Date.now(), timeoutMs = 3000, failTtlMs = 10 * 60000 } = {}) {
  let hit = null;
  let inflight = null;
  return {
    get(version) {
      if (hit && hit.version === version && (hit.url !== RELEASES_URL || now() - hit.at < failTtlMs)) return Promise.resolve(hit.url);
      if (inflight && inflight.version === version) return inflight.p;
      const p = resolveReleaseUrl(fetchFn, version, { timeoutMs })
        .then((url) => { hit = { version, url, at: now() }; return url; })
        .finally(() => { inflight = null; });
      inflight = { version, p };
      return p;
    },
  };
}

/*
 * The renderer side: ask the main process (window.api.releaseUrl) and open what it says; whatever
 * goes wrong, the releases page. Only github.com urls of this repository are opened.
 */
export async function openRelease(api, open, timeoutMs = 5000) {
  let url = RELEASES_URL;
  try {
    if (api && typeof api.releaseUrl === 'function') {
      let timer;
      const res = await Promise.race([
        Promise.resolve(api.releaseUrl()),
        new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
      ]).finally(() => clearTimeout(timer));
      if (typeof res === 'string' && (res === RELEASES_URL || res.startsWith(RELEASES_URL + '/tag/'))) url = res;
    }
  } catch (e) {
    url = RELEASES_URL;
  }
  if (typeof open === 'function') open(url);
  return url;
}
