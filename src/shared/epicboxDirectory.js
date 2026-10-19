/*
 * Public Epicbox servers and whether they are up, for the Epicbox server field (Settings and the
 * first-run setup, both interfaces).
 *
 * The status site (status.btlabs.uk) checks the public Epicbox relays every few minutes and lists
 * them in the same status.json as the nodes (its "epicbox" array), so the list comes with the node
 * directory: one request from the main process, cached there (shared/nodeDirectory.js), no extra
 * connection from the app. When the site can't be reached, the known servers are listed without a
 * status, so the choice is still there.
 *
 * The field holds a domain only (port 443, wss, as the wallet's defaults), so only servers on wss
 * port 443 are listed: picking one must connect to what the status site checked.
 *
 * No Electron or DOM imports, so it runs under `node --test` (tests/epicboxDirectory.test.js).
 */
import { DEFAULT_DOMAIN, PORT_SECURE, serverFromUrl } from './epicboxConfig.js';

const MAX_SERVERS = 30;
const STATES = { healthy: 0, degraded: 1, down: 2, unknown: 3 };

/* the servers listed when the status site can't be reached; state unknown */
export const KNOWN_SERVERS = {
  mainnet: [
    { domain: DEFAULT_DOMAIN, operator: 'Epic Cash', listing: 'official' },
    { domain: 'epicbox.epicnet.us', operator: 'epicnet.us', listing: 'official' },
    { domain: 'epicbox.stackwallet.com', operator: 'Cypher Stack', listing: 'community' },
  ],
  floonet: [
    { domain: 'flooepicbox.btlabs.uk', operator: 'btlabs', listing: 'official' },
  ],
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function cleanText(v, max) {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  return s && s.length <= max ? s : null;
}
function fraction(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
}
function latency(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 600000 ? Math.round(v) : null;
}

/* a domain the field accepts: letters, digits, dots and dashes, with a dot */
export function cleanDomain(v) {
  if (typeof v !== 'string') return '';
  const d = v.trim().toLowerCase();
  return d.length <= 253 && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : '';
}

/* one server as the app shows it, or null */
function server(fields) {
  const domain = cleanDomain(fields.domain);
  if (!domain) return null;
  return {
    domain,
    state: fields.state in STATES ? fields.state : 'unknown',
    label: cleanText(fields.label, 64),
    operator: cleanText(fields.operator, 64),
    listing: fields.listing === 'official' || fields.listing === 'community' ? fields.listing : null,
    latencyMs: latency(fields.latencyMs),
    uptime24h: fraction(fields.uptime24h),
    country: typeof fields.country === 'string' && /^[A-Z]{2}$/.test(fields.country) ? fields.country : null,
    isDefault: domain === DEFAULT_DOMAIN,
  };
}

/* The wallet's default first, then: online, degraded, offline, unknown; official; lowest latency. */
export function compareServers(a, b) {
  const lat = (s) => (s.latencyMs === null ? Infinity : s.latencyMs);
  return (Number(b.isDefault) - Number(a.isDefault))
    || (STATES[a.state] - STATES[b.state])
    || (Number(b.listing === 'official') - Number(a.listing === 'official'))
    || (lat(a) - lat(b))
    || (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0);
}

/* The "epicbox" array of a status.json document → the servers, sorted ([] when there are none). */
export function parseEpicboxServers(json) {
  if (!isPlainObject(json) || !Array.isArray(json.epicbox)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of json.epicbox.slice(0, 200)) {
    if (!isPlainObject(raw) || (raw.kind !== undefined && raw.kind !== 'epicbox')) continue;
    const at = serverFromUrl(raw.endpoint);
    if (!at || at.unsecure || at.port !== PORT_SECURE) continue;
    const loc = isPlainObject(raw.location) ? raw.location : {};
    const up = isPlainObject(raw.uptime) ? raw.uptime : {};
    const s = server({
      domain: at.domain, state: raw.state, label: raw.label, operator: raw.operator, listing: raw.listing,
      latencyMs: raw.latency_ms, uptime24h: up['24h'], country: loc.country,
    });
    if (!s || seen.has(s.domain)) continue;
    seen.add(s.domain);
    out.push(s);
  }
  return out.sort(compareServers).slice(0, MAX_SERVERS);
}

/* the fallback list of a chain, state unknown */
export function knownServers(chain) {
  return (KNOWN_SERVERS[chain] || []).map(server).filter(Boolean).sort(compareServers);
}

/*
 * What the renderer shows, from the main process's directory (window.api.nodeDirectory):
 * {servers, live}. live: the states come from the status site; otherwise the known servers.
 * Everything from IPC is checked again.
 */
export function epicboxServerList(dir, chain) {
  const raw = isPlainObject(dir) && Array.isArray(dir.epicbox) ? dir.epicbox : [];
  const seen = new Set();
  const servers = [];
  for (const s of raw.slice(0, MAX_SERVERS)) {
    const c = isPlainObject(s) ? server(s) : null;
    if (!c || seen.has(c.domain)) continue;
    seen.add(c.domain);
    servers.push(c);
  }
  if (servers.length) return { servers: servers.sort(compareServers), live: true };
  return { servers: knownServers(chain), live: false };
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/* The renderer side: the servers of this chain, live when the status site answered. Never throws. */
export async function loadEpicboxServers(api, chain, timeoutMs = 6000) {
  let dir = null;
  try {
    if (api && typeof api.nodeDirectory === 'function' && (chain === 'mainnet' || chain === 'floonet')) {
      dir = await withTimeout(Promise.resolve(api.nodeDirectory(chain)), timeoutMs);
    }
  } catch (e) {
    dir = null;
  }
  return epicboxServerList(dir, chain);
}

/* the server in the list with this domain, or null */
export function findServer(servers, domain) {
  const d = cleanDomain(domain);
  return d && Array.isArray(servers) ? servers.find((s) => s.domain === d) || null : null;
}
