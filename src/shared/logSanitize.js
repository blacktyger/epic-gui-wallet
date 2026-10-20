/*
 * Clean logs before they leave the computer ("no metadata"): support reports (supportReport.js) and
 * scripts/clean-logs.mjs. Plain ESM without app imports (tests/logSanitize.test.js).
 *
 * What is removed or masked:
 *   - lines longer than MAX_LINE are cut first (no pattern runs on more than that)
 *   - exact secrets the caller knows (the unlocked wallet's password) → <redacted>
 *   - slatepacks, slates (JSON with participant data or a transaction) → one placeholder line part
 *   - a run of 12+ recovery-phrase words, in any case and with any separators, one typo allowed
 *     → [recovery phrase removed] (looksLikePhrase: 8+ words, for the report's description)
 *   - values after password / secret / token / seed / mnemonic / phrase / key / Authorization… → <redacted>
 *   - URL user:password@ → dropped
 *   - home folders (the user's own and any other C:\Users\…, /home/…, /Users/…, UNC …\Users\…) → ~;
 *     the user name and the computer's name where they appear alone → <user>, <host>
 *   - IP addresses → <ip-n> (not loopback); host names in URLs, before a :port and local network
 *     names → <host-n>, unless a well-known public node / Epicbox / service host
 *     (KNOWN_PUBLIC_HOSTS or their domains); email addresses → <email-n>
 *   - Epicbox addresses and other long base58 keys, onion addresses → <address-n>, <onion-n>
 *   - long hex (commitments, kernel excess, keys) → <hex-n>; long base64 blobs → <blob>
 *   The -n names are pseudonyms for one report: the same address is the same name in every file,
 *   and no character of it is kept (a few characters of an address or a commitment would still
 *   identify it on the chain).
 *
 * Kept on purpose: amounts, tx and slate ids (UUIDs), heights, times, ports, versions, error texts.
 * The report is encrypted to the developer, and a send/receive problem can't be diagnosed without
 * knowing which transaction and how much; an id or an amount alone doesn't say who the user is.
 * Commitments and kernels are masked because they are on the public chain: with them, a log line
 * points at the user's outputs.
 *
 * Slatepacks and phrases are found by plain scans, slates line by line, and every other pattern
 * starts only at a word boundary on lines of at most MAX_LINE: a log of a few MB is cleaned in well
 * under a second (tests/logSanitize.test.js has the pathological cases). Cleaning twice changes
 * nothing more.
 */
import { words as BIP39 } from './words.js';

export const KNOWN_PUBLIC_HOSTS = Object.freeze([
  'node.epiccash.com', 'epicbox.epiccash.com', 'epiccash.com',
  'epicbox.epic.tech', 'explorer.epic.tech', 'epic.tech',
  'epicbox.epicnet.us', 'epicnet.us',
  'epicbox.stackwallet.com', 'stackwallet.com',
  'flooepicbox.btlabs.uk', 'status.btlabs.uk', 'btlabs.uk',
  'github.com', 'api.github.com', 'objects.githubusercontent.com',
  'api.coingecko.com', 'api.ipify.org',
]);

//a host is kept when it is, or is under, one of these
const KEEP_DOMAINS = ['epiccash.com', 'epic.tech', 'epicnet.us', 'stackwallet.com', 'btlabs.uk', 'github.com',
  'githubusercontent.com', 'coingecko.com', 'ipify.org'];

const BIP39_SET = new Set(BIP39);

const COMMON_NAMES = new Set(['user', 'users', 'admin', 'administrator', 'test', 'server', 'root', 'home', 'epic', 'wallet',
  'node', 'owner', 'guest', 'default', 'public', 'pc', 'desktop', 'laptop', 'local', 'localhost', 'main', 'info', 'debug',
  'error', 'warn', 'app', 'data', 'log', 'logs', 'system', 'windows', 'linux', 'mac', 'host']);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function isKnownHost(host, keep) {
  const h = String(host).toLowerCase().replace(/\.$/, '');
  if (['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'].includes(h) || /^127\./.test(h)) return true;
  if (keep.has(h)) return true;
  return KEEP_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
}

/* a path as it may be written: as is, with \ doubled (JSON), with / instead of \ */
function pathVariants(p) {
  const s = String(p || '').replace(/[\\/]+$/, '');
  if (s.length < 3) return [];
  const v = new Set([s]);
  if (s.includes('\\')) {
    v.add(s.replace(/\\/g, '\\\\'));
    v.add(s.replace(/\\/g, '/'));
  }
  return [...v].sort((a, b) => b.length - a.length);
}

const IPV4 = /(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\w.]*\d)/g;
//candidates: hex groups with colons; checked in code (a time like 12:34:56 is not one)
const IPV6 = /(?<![\w:])(?:[0-9A-Fa-f]{0,4}:){2,7}(?:[0-9A-Fa-f]{1,4}|:)?(?![\w:])/g;
const SECRET_KEY = /\b((?:wallet[_ ]?)?(?:pass(?:word|phrase)?|secret|api[_-]?secret|owner[_-]?api[_-]?secret|token|seed|mnemonic|recovery[_ ]phrase|phrase|private[_ ]?key|priv[_ ]?key|secret[_ ]?key|blind(?:ing)?(?:[_ ]?factor)?|nonce|authorization|cookie))(\s*["']?\s*[:=]\s*|\s+(?=["']))(?!["']?<redacted>|(?:Basic|Bearer) <redacted>)("(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|[^\s"',;})\]]+)/gi;
const PASS_ARG = /(--pass(?:word)?(?:\s+|=))(?!<redacted>)("[^"]*"|'[^']*'|\S+)/g;
const AUTH = /\b(Basic|Bearer)\s+(?!<redacted>)[A-Za-z0-9+/=._~-]{6,}/g;
const USERINFO = /\b([a-z][a-z0-9+.-]{1,15}:\/\/)[^/\s@"'<>]{1,200}@/gi;
const URL_HOST = /\b([a-z][a-z0-9+.-]{1,15}:\/\/)(\[[0-9A-Fa-f:.]+\]|[^/\s:?#"'<>\][]+)/gi;
//a slate's keys: a line holding one loses everything from its first { (lines are checked one by one)
const SLATE_KEYS = /"(?:participant_data|num_participants|part_sig|public_blind_excess|blinding_factor|sta|tx|offset|kernels)"\s*:/;
//Windows/macOS/Linux home folders; the user name segment may hold spaces only before a \ (Windows)
const WIN_HOME = /(?:\b[A-Za-z]:|\\\\[^\\/\s"'<>|]+\\{1,2}[^\\/\s"'<>|]+)?(\\{1,2}|\/)(?:Users|Documents and Settings)(?:\\{1,2}|\/)(?!<user>)(?:[^\\/"'<>|*?\r\n:]{1,64}?(?=\\)|[^\\/\s"'<>|*?:,;)\]]+)/g;
const UNIX_HOME = /(?<![\w.~-])\/(?:home|Users|var\/home)\/(?!<user>)[^/\s"'<>|*?:,;)\]]+|(?<![\w.~-])\/root(?=\/|\b)/g;
const UNC = /\\\\(?!<host>)([A-Za-z0-9][A-Za-z0-9._$-]{0,62})(?=\\)/g;
const ONION = /\b[a-z2-7]{56}(\.onion)?\b/g;
//Epicbox addresses and other base58 keys (no 0 O I l), with or without @domain[:port]
const BASE58 = /(?<![\w…<-])[1-9A-HJ-NP-Za-km-z]{46,}(?![\w…])(@[A-Za-z0-9.-]+(?::\d+)?)?/g;
const HEX = /(?<![\w…<-])[0-9a-fA-F]{32,}(?![\w…])/g;
const BASE64 = /(?<![\w+/…<])[A-Za-z0-9+/]{48,}={0,2}(?![\w+/=…])/g;
const EMAIL = /(?<![\w.%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}\b/g;
//a host name outside a URL: before a :port, or a local network name (.lan, .local, …)
const HOST_PORT = /(?<![\w.@/<-])((?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,24})(?=:\d{2,5}\b)/g;
const LOCAL_HOST = /(?<![\w.@/<-])[A-Za-z0-9-]{1,63}\.(?:lan|local|home|internal|localdomain)\b/gi;
//longer lines are cut first, so that no pattern ever works on more than this at once
const MAX_LINE = 8000;

/*
 * opts: {home, username, hostname, keepHosts: [], secrets: [], ids: Map} (all optional). ids: the
 * pseudonyms of one report (<address-1>, <ip-2>…), shared by all its files so the same address is
 * the same name everywhere; a new Map per call when not given.
 * → {text, counts: {secrets, blocks, phrases, paths, users, ips, hosts, addresses, hex}}
 */
export function sanitizeText(input, opts = {}) {
  let t = String(input == null ? '' : input);
  const counts = { secrets: 0, blocks: 0, phrases: 0, paths: 0, users: 0, ips: 0, hosts: 0, addresses: 0, hex: 0 };
  const keep = new Set((opts.keepHosts || KNOWN_PUBLIC_HOSTS).map((h) => String(h).toLowerCase()));
  const ids = opts.ids instanceof Map ? opts.ids : new Map();
  //the same value, the same name in one report; nothing of the value itself is kept
  const alias = (kind, value) => {
    const key = kind + ' ' + value.toLowerCase();
    if (!ids.has(key)) ids.set(key, '<' + kind + '-' + ([...ids.keys()].filter((k) => k.startsWith(kind + ' ')).length + 1) + '>');
    return ids.get(key);
  };
  const sub = (re, kind, fn) => {
    t = t.replace(re, (...m) => {
      const r = fn(...m);
      if (r !== m[0]) counts[kind]++;
      return r;
    });
  };

  //0. no pattern works on more than MAX_LINE characters at once
  t = t.replace(new RegExp('[^\\r\\n]{' + MAX_LINE + '}[^\\r\\n]+', 'g'), (m) => {
    counts.blocks++;
    return m.slice(0, MAX_LINE) + ' [rest of a long line left out]';
  });

  //1. exact secrets first, before anything can cut them apart
  for (const s of opts.secrets || []) {
    if (typeof s === 'string' && s.length >= 4) sub(new RegExp(escapeRe(s), 'g'), 'secrets', () => '<redacted>');
  }

  //2. whole blocks: slatepacks, slates, recovery phrases
  t = cutSlatepacks(t, () => counts.blocks++);
  t = t.replace(/[^\r\n]*\{[^\r\n]*/g, (line) => {
    if (!SLATE_KEYS.test(line)) return line;
    counts.blocks++;
    return line.slice(0, line.indexOf('{')) + '[slate removed]';
  });
  t = cutPhrases(t, 12, () => counts.phrases++);

  //3. secret-looking values
  sub(PASS_ARG, 'secrets', (m, flag) => flag + '<redacted>');
  sub(AUTH, 'secrets', (m, kind) => kind + ' <redacted>');
  sub(SECRET_KEY, 'secrets', (m, key, sep, value) => /^["']?(?:true|false|null|none|set|unset|\*+|<[a-z]+>)["']?$/i.test(value) ? m
    : key + sep + (/^["']/.test(value) ? value[0] + '<redacted>' + value[0] : '<redacted>'));
  sub(USERINFO, 'secrets', (m, scheme) => scheme);

  //4. home folders and names
  const homes = [];
  if (opts.home) homes.push(...pathVariants(opts.home));
  for (const h of homes) sub(new RegExp(escapeRe(h) + '(?![\\w\\u00C0-\\uFFFF])', opts.home && /^[A-Za-z]:|\\/.test(opts.home) ? 'gi' : 'g'), 'paths', () => '~');
  sub(WIN_HOME, 'paths', () => '~');
  sub(UNIX_HOME, 'paths', () => '~');
  sub(UNC, 'hosts', () => '\\\\<host>');
  for (const [name, mark, kind] of [[opts.username, '<user>', 'users'], [opts.hostname, '<host>', 'hosts']]) {
    const n = String(name || '').trim();
    if (n.length < 3 || COMMON_NAMES.has(n.toLowerCase())) continue;
    sub(new RegExp('(?<![\\p{L}\\p{N}_<])' + escapeRe(n) + '(?![\\p{L}\\p{N}_>])', 'giu'), kind, () => mark);
  }

  //5. addresses: onion, Epicbox / base58 keys (with their domain), emails, then IPs and hosts
  const host = (h) => (isKnownHost(h, keep) ? h : alias('host', h));
  sub(ONION, 'addresses', (m, onion) => alias('onion', m.replace(/\.onion$/, '')) + (onion || ''));
  sub(BASE58, 'addresses', (m, at) => {
    const key = at ? m.slice(0, m.length - at.length) : m;
    //all digits or all letters is not a key (a long number, a word)
    if (/^[0-9]+$/.test(key) || /^[A-Za-z]+$/.test(key)) return m;
    let dom = '';
    if (at) {
      const [h, port] = at.slice(1).split(':');
      dom = '@' + host(h) + (port ? ':' + port : '');
    }
    return alias('address', key) + dom;
  });
  sub(EMAIL, 'addresses', (m) => alias('email', m));
  //an IP in a URL is left to the IP rules below (which keep loopback)
  sub(URL_HOST, 'hosts', (m, scheme, h) => isKnownHost(h.replace(/^\[|\]$/g, ''), keep) || /^<[a-z]+(-\d+)?>$/.test(h)
    || /^[\d.]+$|^\[/.test(h) ? m : scheme + alias('host', h));
  sub(HOST_PORT, 'hosts', (m) => (/^[\d.]+$/.test(m) ? m : host(m)));
  sub(LOCAL_HOST, 'hosts', (m) => alias('host', m));
  sub(IPV4, 'ips', (m) => /^(127\.|0\.0\.0\.0$)/.test(m) ? m : alias('ip', m));
  sub(IPV6, 'ips', (m) => {
    const colons = (m.match(/:/g) || []).length;
    const ip = m.includes('::') ? /[0-9a-f]/i.test(m) || m === '::' : colons >= 5 && /[a-f]/i.test(m) || colons === 7;
    if (!ip || m === '::1' || m === '::' || /^[0-9:]+$/.test(m) && !m.includes('::')) return m;
    return alias('ip', m);
  });

  //6. long hex (commitments, kernels, keys: on the chain, so they would point at the user's outputs) and blobs
  sub(HEX, 'hex', (m) => alias('hex', m));
  sub(BASE64, 'secrets', (m) => /[0-9]/.test(m) && /[A-Za-z]/.test(m) ? '<blob>' : m);

  return { text: t, counts };
}

/* BEGINSLATEPACK. … ENDSLATEPACK. blocks out, in one pass (an unclosed one: to the end of its line) */
function cutSlatepacks(t, count) {
  const B = 'BEGINSLATEPACK.', E = 'ENDSLATEPACK.';
  let out = '', at = 0;
  for (let i = t.indexOf(B); i >= 0; i = t.indexOf(B, at)) {
    const e = t.indexOf(E, i + B.length);
    const nl = t.indexOf('\n', i);
    let end;
    //closed: to its end, as long as no other BEGIN comes first
    const next = t.indexOf(B, i + B.length);
    if (e >= 0 && (next < 0 || e < next)) end = e + E.length;
    else end = nl >= 0 ? nl : t.length;
    out += t.slice(at, i) + '[slatepack removed]';
    count();
    at = end;
  }
  return out + t.slice(at);
}

/*
 * Runs of recovery-phrase (BIP39) words, in any case, separated by anything that is not a letter
 * (spaces, line breaks, commas, "1." numbering, quotes, hyphens), with at most one other word
 * inside (a typo): [start, end, words] for each run of at least min phrase words. One pass.
 */
export function phraseRuns(text, min = 12) {
  const s = String(text == null ? '' : text);
  const runs = [];
  const re = /[A-Za-z]+/g;
  let run = null;
  const close = () => {
    //a typo inside the run counts as one of its words; one after its end does not
    const n = run ? run.words + (run.typo ? 1 : 0) : 0;
    if (n >= min) runs.push([run.start, run.end, n]);
    run = null;
  };
  let m, prevEnd = 0;
  while ((m = re.exec(s))) {
    const w = m[0].toLowerCase();
    const gap = s.slice(prevEnd, m.index);
    prevEnd = m.index + m[0].length;
    //a long gap (a new paragraph of other text) ends a run
    if (run && gap.length > 12) close();
    if (BIP39_SET.has(w)) {
      if (!run) run = { start: m.index, end: prevEnd, words: 0, misses: 0, typo: false };
      if (run.misses) run.typo = true;
      run.words++;
      run.end = prevEnd;
    } else if (run && run.misses === 0 && w.length >= 3 && w.length <= 8) {
      run.misses++;
    } else {
      close();
    }
  }
  close();
  return runs;
}

/* does a text hold what looks like a recovery phrase (8+ phrase words in a row)? The report's
   description is refused then: it is posted readable */
export function looksLikePhrase(text, min = 8) {
  return phraseRuns(text, min).length > 0;
}

function cutPhrases(t, min, count) {
  const runs = phraseRuns(t, min);
  if (!runs.length) return t;
  let out = '', at = 0;
  for (const [a, b] of runs) {
    out += t.slice(at, a) + '[recovery phrase removed]';
    count();
    at = b;
  }
  return out + t.slice(at);
}
