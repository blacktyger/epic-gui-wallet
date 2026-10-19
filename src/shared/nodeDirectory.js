/*
 * Public node directory: the live list of public Epic nodes from the status site (status.btlabs.uk).
 *
 * A "shadow feature": helpful when it works, invisible when it doesn't. Nothing here throws to its
 * caller and every failure (timeout, non-200, bad JSON, wrong shape, stale data) ends as `null`,
 * which the UI reads as "show nothing".
 *
 * Used in two places:
 *  - the Electron main process (background.js) runs createDirectory() with net.fetch, so the request
 *    is a plain GET from the main process: no CORS, no cookies, no wallet data;
 *  - the renderer calls loadDirectory(window.api, chain), which asks the main process over IPC.
 *
 * No Electron or DOM imports, so it runs under `node --test` as is (tests/nodeDirectory.test.js).
 */
import { parseEpicboxServers } from './epicboxDirectory.js';

export const STATUS_SITE = 'https://status.btlabs.uk';
export const CHAINS = ['mainnet', 'floonet'];

const MAX_BYTES = 1024 * 1024; //status.json is ~10 kB; anything near this is not it
const MAX_NODES = 50;
const STATES = { healthy: 0, degraded: 1 }; //'down' and anything unknown are left out

export function statusUrl(chain) {
  return STATUS_SITE + '/api/v1/status.json' + (chain === 'floonet' ? '?chain=floonet' : '');
}

/* The node's row on the board. The site has no page per node, its rows carry id="row-<id>". */
export function nodePageUrl(chain, id) {
  const base = STATUS_SITE + '/' + (chain === 'floonet' ? '?chain=floonet' : '');
  return typeof id === 'string' && id ? base + '#row-' + encodeURIComponent(id).replace(/%3A/gi, ':') : base;
}

/*
 * A node address as the wallet stores it: scheme://host[:port], no trailing slash. Returns '' for
 * anything that is not a plain http(s) origin (credentials, a path, a query, another scheme).
 * Without a scheme, https is assumed, as the node field does.
 */
export function normalizeNodeUrl(value) {
  if (typeof value !== 'string') return '';
  let s = value.trim();
  if (!s || s.length > 300) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch (e) { return ''; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  if (u.username || u.password || u.search || u.hash) return '';
  if (u.pathname && u.pathname !== '/') return '';
  if (!u.hostname) return '';
  return u.protocol + '//' + u.host;
}

function cleanText(v, max) {
  if (typeof v !== 'string') return null;
  //no control characters, no bidi overrides
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  return s && s.length <= max ? s : null;
}
function count(v) {
  return Number.isSafeInteger(v) && v >= 0 ? v : null;
}
function fraction(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseNode(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw.kind !== undefined && raw.kind !== 'node') return null;
  if (!(raw.state in STATES)) return null;
  const endpoint = normalizeNodeUrl(raw.endpoint);
  if (!endpoint) return null;
  const host = endpoint.replace(/^https?:\/\//, '');
  const id = typeof raw.id === 'string' && /^[A-Za-z0-9.:[\]-]{1,260}$/.test(raw.id) ? raw.id : host;
  const loc = isPlainObject(raw.location) ? raw.location : {};
  const up = isPlainObject(raw.uptime) ? raw.uptime : {};
  const ns = isPlainObject(raw.node_status) ? raw.node_status : {};
  const version = typeof raw.node_version === 'string' && /^[0-9A-Za-z.+-]{1,32}$/.test(raw.node_version) ? raw.node_version : null;
  const country = typeof loc.country === 'string' && /^[A-Z]{2}$/.test(loc.country) ? loc.country : null;
  const latency = typeof raw.latency_ms === 'number' && Number.isFinite(raw.latency_ms) && raw.latency_ms >= 0 && raw.latency_ms < 600000
    ? Math.round(raw.latency_ms) : null;
  return {
    id,
    host,
    endpoint,
    state: raw.state,
    awaitingPeers: ns.awaiting_peers === true,
    operator: cleanText(raw.operator, 64),
    listing: raw.listing === 'official' || raw.listing === 'community' ? raw.listing : null,
    height: count(raw.height),
    tipLag: count(raw.tip_lag),
    version,
    peers: count(raw.peers),
    latencyMs: latency,
    country,
    provider: cleanText(loc.provider, 64),
    uptime24h: fraction(up['24h']),
    uptime30d: fraction(up['30d']),
  };
}

/* The official Epic Cash node: by its host, or by the operator name the site gives it. */
const OFFICIAL_HOST = 'node.epiccash.com';
const OFFICIAL_OPERATOR = 'epic cash';
export function isOfficialEpicNode(n) {
  if (!n) return false;
  const host = typeof n.host === 'string' ? n.host.toLowerCase().replace(/:\d+$/, '') : '';
  const op = typeof n.operator === 'string' ? n.operator.trim().toLowerCase() : '';
  return host === OFFICIAL_HOST || op === OFFICIAL_OPERATOR;
}

/* The official Epic Cash node first (down nodes are never listed), then: online, at the tip, not
 * waiting for peers, lowest latency, highest uptime. */
export function compareNodes(a, b) {
  const lag = (n) => (n.tipLag === 0 ? 0 : n.tipLag === null ? 2 : 1);
  const lat = (n) => (n.latencyMs === null ? Infinity : n.latencyMs);
  const up = (n) => (n.uptime24h === null ? -1 : n.uptime24h);
  return (Number(isOfficialEpicNode(b)) - Number(isOfficialEpicNode(a)))
    || (STATES[a.state] - STATES[b.state])
    || (lag(a) - lag(b))
    || (Number(a.awaitingPeers) - Number(b.awaitingPeers))
    || (lat(a) - lat(b))
    || (up(b) - up(a))
    || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0);
}

/*
 * The status.json document → { chain, tipHeight, generatedAt, nodes: [...], epicbox: [...] } with
 * only the fields the wallet shows, each checked (epicbox: the public Epicbox servers, see
 * shared/epicboxDirectory.js). null when it has neither nodes nor Epicbox servers for that chain.
 */
export function parseDirectory(json, chain) {
  if (!isPlainObject(json) || !Array.isArray(json.nodes)) return null;
  if (json.stale === true) return null;
  const network = isPlainObject(json.network) ? json.network : {};
  if (network.chain !== undefined && network.chain !== chain) return null;
  const seen = new Set();
  const nodes = [];
  for (const raw of json.nodes.slice(0, 500)) {
    const n = parseNode(raw);
    if (!n || seen.has(n.endpoint)) continue;
    seen.add(n.endpoint);
    nodes.push(n);
  }
  const epicbox = parseEpicboxServers(json);
  if (!nodes.length && !epicbox.length) return null;
  nodes.sort(compareNodes);
  return {
    chain,
    tipHeight: count(network.tip_height),
    generatedAt: typeof json.generated_at === 'string' && json.generated_at.length <= 40 ? json.generated_at : null,
    nodes: nodes.slice(0, MAX_NODES),
    epicbox,
  };
}

function withTimeout(promise, ms, onTimeout) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => { if (onTimeout) onTimeout(); reject(new Error('timeout')); }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/* One GET of status.json → a parsed directory, or null. Never throws. */
export async function fetchDirectory(fetchFn, chain, { timeoutMs = 4000, maxBytes = MAX_BYTES } = {}) {
  if (typeof fetchFn !== 'function' || !CHAINS.includes(chain)) return null;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    const text = await withTimeout((async () => {
      const res = await fetchFn(statusUrl(chain), {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'omit',
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res || res.status !== 200) return null;
      const len = res.headers && typeof res.headers.get === 'function' ? Number(res.headers.get('content-length')) : 0;
      if (len > maxBytes) return null;
      const body = await res.text();
      return typeof body === 'string' && body.length <= maxBytes ? body : null;
    })(), timeoutMs, () => ctrl && ctrl.abort());
    if (text === null) return null;
    return parseDirectory(JSON.parse(text), chain);
  } catch (e) {
    return null;
  }
}

/*
 * The main-process side: fetchDirectory with a short cache per chain (a good result for ttlMs, a
 * failure for failTtlMs so a dead site is not asked again on every screen) and one request in
 * flight per chain. get() always resolves, to a directory or null.
 */
export function createDirectory({ fetch: fetchFn, now = () => Date.now(), timeoutMs = 4000, ttlMs = 60000, failTtlMs = 30000 } = {}) {
  const cache = new Map();
  const inflight = new Map();
  return {
    get(chain) {
      if (!CHAINS.includes(chain)) return Promise.resolve(null);
      const hit = cache.get(chain);
      if (hit && now() - hit.at < (hit.data ? ttlMs : failTtlMs)) return Promise.resolve(hit.data);
      if (inflight.has(chain)) return inflight.get(chain);
      const p = fetchDirectory(fetchFn, chain, { timeoutMs })
        .catch(() => null)
        .then((data) => {
          cache.set(chain, { at: now(), data });
          return data;
        })
        .finally(() => inflight.delete(chain));
      inflight.set(chain, p);
      return p;
    },
  };
}

/*
 * The renderer side: ask the main process (window.api.nodeDirectory) and give up after timeoutMs
 * whatever happens over IPC. Resolves to a directory with at least one node, or null.
 */
export async function loadDirectory(api, chain, timeoutMs = 6000) {
  try {
    if (!api || typeof api.nodeDirectory !== 'function' || !CHAINS.includes(chain)) return null;
    const res = await withTimeout(Promise.resolve(api.nodeDirectory(chain)), timeoutMs);
    if (!isPlainObject(res) || !Array.isArray(res.nodes)) return null;
    const nodes = res.nodes.filter((n) => isPlainObject(n) && typeof n.endpoint === 'string' && normalizeNodeUrl(n.endpoint) === n.endpoint);
    return nodes.length ? Object.assign({}, res, { nodes }) : null;
  } catch (e) {
    return null;
  }
}

/* The node in the directory with this address, or null. */
export function findNode(dir, address) {
  const url = normalizeNodeUrl(address);
  if (!url || !dir || !Array.isArray(dir.nodes)) return null;
  return dir.nodes.find((n) => n.endpoint === url) || null;
}

/* Display helpers shared by both interfaces. */
export function percent(fr, locale) {
  if (typeof fr !== 'number') return '';
  try {
    return new Intl.NumberFormat(locale || undefined, { style: 'percent', maximumFractionDigits: 2 }).format(fr);
  } catch (e) {
    return (Math.round(fr * 10000) / 100) + '%';
  }
}
export function number(n, locale) {
  if (typeof n !== 'number') return '';
  try { return new Intl.NumberFormat(locale || undefined).format(n); } catch (e) { return String(n); }
}
export function flag(country) {
  if (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country)) return '';
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
export function countryName(country, locale) {
  if (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country)) return '';
  try {
    return new Intl.DisplayNames([locale || 'en'], { type: 'region' }).of(country) || country;
  } catch (e) {
    return country;
  }
}
