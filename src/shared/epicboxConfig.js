/*
 * The Epicbox settings of a wallet: read from epic-wallet.toml, compared, and what to do when they
 * change while the listener runs.
 *
 * epic-wallet 4.1.0 reads [epicbox] once, when a process starts: a running `listen -m epicbox`
 * stays connected to the server it started with, and the owner API keeps the config it got at
 * start (used for the sender's own address in init_send_tx) until set_epicbox_config is called.
 * Slates wait on the server the sender posted them to, and a listener only gets the ones queued
 * on its own server. So after a server change the app restarts its own listener, tells the owner
 * API, and checks the old server once for slates that were sent to the old address.
 *
 * Plain ESM without app imports, so it runs under `node --test` (tests/epicboxConfig.test.js).
 */

export const DEFAULT_DOMAIN = 'epicbox.epiccash.com';
export const PORT_SECURE = 443;
export const PORT_UNSECURE = 80;

function unquote(v) {
  const s = String(v).trim();
  return (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) ? s.slice(1, -1) : s;
}

/* the value of a toml line without a trailing comment (outside quotes) */
function tomlValue(raw) {
  let out = '';
  let quote = '';
  for (const ch of String(raw)) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#') {
      break;
    }
    out += ch;
  }
  return unquote(out);
}

/* the [epicbox] section of an epic-wallet.toml as {domain, port, unsecure, index}; null fields are not set */
export function parseEpicboxToml(text) {
  const out = { domain: null, port: null, unsecure: null, index: null };
  let inSection = false;
  for (const line of String(text || '').split(/\r?\n/)) {
    const l = line.trim();
    if (l.startsWith('[')) {
      inSection = /^\[\s*epicbox\s*\]/.test(l);
      continue;
    }
    if (!inSection || !l || l.startsWith('#')) continue;
    const m = l.match(/^([A-Za-z_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = tomlValue(m[2]);
    if (m[1] === 'epicbox_domain') out.domain = v;
    else if (m[1] === 'epicbox_port') out.port = Number(v);
    else if (m[1] === 'epicbox_protocol_unsecure') out.unsecure = v === 'true';
    else if (m[1] === 'epicbox_address_index') out.index = Number(v);
  }
  return out;
}

/* a complete config with the wallet's defaults (EpicboxConfig::default in 4.1.0) for what is not set */
export function normalizeEpicbox(cfg) {
  const c = cfg || {};
  const unsecure = c.unsecure === true;
  const port = Number.isInteger(Number(c.port)) && Number(c.port) > 0 && Number(c.port) < 65536 ? Number(c.port) : (unsecure ? PORT_UNSECURE : PORT_SECURE);
  const index = Number.isInteger(Number(c.index)) && Number(c.index) >= 0 ? Number(c.index) : 0;
  const domain = c.domain == null ? DEFAULT_DOMAIN : String(c.domain).trim().toLowerCase();
  return { domain, port, unsecure, index };
}

/* the same server: domain, port and protocol (what the listener connects to) */
export function sameServer(a, b) {
  if (!a || !b) return false;
  const x = normalizeEpicbox(a);
  const y = normalizeEpicbox(b);
  return x.domain === y.domain && x.port === y.port && x.unsecure === y.unsecure;
}

/* the same config, address index included (what the owner API holds) */
export function sameConfig(a, b) {
  return sameServer(a, b) && normalizeEpicbox(a).index === normalizeEpicbox(b).index;
}

/* the url the wallet connects to, as it logs it: wss://domain:port */
export function serverUrl(cfg) {
  const c = normalizeEpicbox(cfg);
  return (c.unsecure ? 'ws' : 'wss') + '://' + c.domain + ':' + c.port;
}

/* "wss://epicbox.epiccash.com:443" → {domain, port, unsecure}; null for anything else */
export function serverFromUrl(url) {
  const m = String(url || '').trim().match(/^(wss?):\/\/([A-Za-z0-9.-]+)(?::(\d+))?\/?$/);
  if (!m) return null;
  const unsecure = m[1] === 'ws';
  return { domain: m[2].toLowerCase(), port: m[3] ? Number(m[3]) : (unsecure ? PORT_UNSECURE : PORT_SECURE), unsecure };
}

/* for people: the domain, with the port and protocol only when they are not the usual ones */
export function serverLabel(cfg) {
  if (!cfg) return '';
  const c = normalizeEpicbox(cfg);
  if (!c.domain) return '';
  const usual = c.port === (c.unsecure ? PORT_UNSECURE : PORT_SECURE);
  return (c.unsecure ? 'ws://' : '') + c.domain + (usual ? '' : ':' + c.port);
}

/* the params of the owner API's set_epicbox_config (epic-wallet 4.1.0, owner_rpc_s.rs) */
export function ownerApiEpicboxParams(cfg) {
  const c = normalizeEpicbox(cfg);
  return {
    epicbox_config: {
      epicbox_domain: c.domain,
      epicbox_port: c.port,
      epicbox_protocol_unsecure: c.unsecure,
      epicbox_address_index: c.index,
    },
  };
}

function tomlString(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/*
 * The toml text with its [epicbox] section set to cfg (domain, port, protocol), for the short-lived
 * listener that checks the old server: it reads its config from its own dir (-c), its wallet from
 * the wallet dir (-t). Everything else stays as it is.
 */
export function withEpicboxSection(text, cfg) {
  const c = normalizeEpicbox(cfg);
  const want = {
    epicbox_domain: tomlString(c.domain),
    epicbox_port: String(c.port),
    epicbox_protocol_unsecure: String(c.unsecure),
  };
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex(l => /^\s*\[\s*epicbox\s*\]/.test(l));
  if (start < 0) {
    return lines.join('\n').replace(/\n*$/, '\n') + '\n[epicbox]\n' + Object.entries(want).map(([k, v]) => k + ' = ' + v).join('\n') + '\n';
  }
  let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
  if (end < 0) end = lines.length;
  const seen = new Set();
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^\s*([A-Za-z_]+)\s*=/);
    if (m && Object.prototype.hasOwnProperty.call(want, m[1])) {
      lines[i] = m[1] + ' = ' + want[m[1]];
      seen.add(m[1]);
    }
  }
  const missing = Object.keys(want).filter(k => !seen.has(k)).map(k => k + ' = ' + want[k]);
  lines.splice(start + 1, 0, ...missing);
  return lines.join('\n');
}

/*
 * What to do after the Epicbox settings were saved.
 *   saved:    the config before the save (what the owner API was given)
 *   next:     the config now in epic-wallet.toml
 *   listener: the server the running listener of this wallet is on (null: none runs; {unknown: true}:
 *             one runs, but on a server the app does not know, e.g. started by an older version)
 * Returns {setOwnerConfig, restart, checkOld, start}:
 *   setOwnerConfig: tell the owner API (set_epicbox_config)
 *   restart:        stop the running listener (it is on another server than next)
 *   checkOld:       the server to check once for slates sent to the old address, or null
 *   start:          start a listener on next afterwards (not when Epicbox was turned off)
 */
export function epicboxSwitchPlan({ saved, next, listener }) {
  const enabled = !!(next && String(next.domain || '').trim());
  const setOwnerConfig = enabled && !sameConfig(saved, next);
  if (!listener) {
    return { setOwnerConfig, restart: false, checkOld: null, start: false };
  }
  const known = !listener.unknown;
  const restart = !known || !enabled || !sameServer(listener, next);
  if (!restart) {
    return { setOwnerConfig, restart: false, checkOld: null, start: false };
  }
  //the old server: the one the listener is on, else (unknown) the one the settings had
  const old = known ? listener : (saved && String(saved.domain || '').trim() ? saved : null);
  //Epicbox turned off: nothing is received any more, the old server neither
  const checkOld = enabled && old && !sameServer(old, next) ? normalizeEpicbox(old) : null;
  return { setOwnerConfig, restart: true, checkOld, start: enabled };
}
