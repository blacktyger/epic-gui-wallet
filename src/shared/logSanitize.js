/*
 * Clean logs before they leave the computer ("no metadata"): support reports (supportReport.js) and
 * scripts/clean-logs.mjs. Plain ESM without app imports (tests/logSanitize.test.js).
 *
 * What is removed or masked:
 *   - exact secrets the caller knows (the unlocked wallet's password) → <redacted>
 *   - slatepacks, slates (JSON with participant data or a transaction) → one placeholder line part
 *   - a run of 12+ recovery-phrase words → [recovery phrase removed]
 *   - values after password / secret / token / seed / mnemonic / phrase / key / Authorization… → <redacted>
 *   - URL user:password@ → dropped
 *   - home folders (the user's own and any other C:\Users\…, /home/…, /Users/…, UNC …\Users\…) → ~;
 *     the user name and the computer's name where they appear alone → <user>, <host>
 *   - IP addresses → <ip> (not loopback); host names in URLs → <host> unless a well-known public
 *     node / Epicbox / service host (KNOWN_PUBLIC_HOSTS or their domains)
 *   - Epicbox addresses and other long base58 keys, onion addresses → prefix…suffix
 *   - long hex (commitments, kernel excess, keys) → prefix…suffix; long base64 blobs → <blob>
 *
 * Kept on purpose: amounts, tx and slate ids (UUIDs), heights, times, ports, versions, error texts.
 * The report is encrypted to the developer, and a send/receive problem can't be diagnosed without
 * knowing which transaction and how much; an id or an amount alone doesn't say who the user is.
 * Commitments and kernels are masked because they are on the public chain: with them, a log line
 * points at the user's outputs.
 *
 * Every pattern is linear (no nested quantifiers over the same characters), so a log of a few MB is
 * cleaned in well under a second; cleaning twice changes nothing more.
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
const SECRET_KEY = /\b((?:wallet[_ ]?)?(?:pass(?:word|phrase)?|secret|api[_-]?secret|owner[_-]?api[_-]?secret|token|seed|mnemonic|recovery[_ ]phrase|phrase|private[_ ]?key|priv[_ ]?key|secret[_ ]?key|blind(?:ing)?(?:[_ ]?factor)?|nonce|authorization|cookie))(\s*["']?\s*[:=]\s*|\s+(?=["']))(?!["']?<redacted>|(?:Basic|Bearer) <redacted>)("[^"\r\n]*"|'[^'\r\n]*'|[^\s"',;})\]]+)/gi;
const PASS_ARG = /(--pass(?:word)?(?:\s+|=))(?!<redacted>)("[^"]*"|'[^']*'|\S+)/g;
const AUTH = /\b(Basic|Bearer)\s+(?!<redacted>)[A-Za-z0-9+/=._~-]{6,}/g;
const USERINFO = /\b([a-z][a-z0-9+.-]{1,15}:\/\/)[^/\s@"'<>]{1,200}@/gi;
const URL_HOST = /\b([a-z][a-z0-9+.-]{1,15}:\/\/)(\[[0-9A-Fa-f:.]+\]|[^/\s:?#"'<>\][]+)/gi;
const SLATEPACK = /BEGINSLATEPACK\.[\s\S]{0,200000}?ENDSLATEPACK\.?/g;
//a line holding a slate: from its first { to the end of the line
const SLATE_LINE = /\{[^\r\n]*?"(?:participant_data|num_participants|part_sig|public_blind_excess|blinding_factor|sta|tx|offset|kernels)"\s*:[^\r\n]*/g;
//Windows/macOS/Linux home folders; the user name segment may hold spaces only before a \ (Windows)
const WIN_HOME = /(?:\b[A-Za-z]:|\\\\[^\\/\s"'<>|]+\\{1,2}[^\\/\s"'<>|]+)?(\\{1,2}|\/)(?:Users|Documents and Settings)(?:\\{1,2}|\/)(?!<user>)(?:[^\\/"'<>|*?\r\n:]{1,64}?(?=\\)|[^\\/\s"'<>|*?:,;)\]]+)/g;
const UNIX_HOME = /(?<![\w.~-])\/(?:home|Users)\/(?!<user>)[^/\s"'<>|*?:,;)\]]+/g;
const UNC = /\\\\(?!<host>)([A-Za-z0-9][A-Za-z0-9._$-]{0,62})(?=\\)/g;
const ONION = /\b([a-z2-7]{6})[a-z2-7]{46}([a-z2-7]{4})(\.onion)?\b/g;
//Epicbox addresses and other base58 keys (no 0 O I l), with or without @domain[:port]
const BASE58 = /(?<![\w…])([1-9A-HJ-NP-Za-km-z]{6})[1-9A-HJ-NP-Za-km-z]{36,}([1-9A-HJ-NP-Za-km-z]{4})(?![\w…])(@[A-Za-z0-9.-]+(?::\d+)?)?/g;
const HEX = /(?<![\w…])([0-9a-fA-F]{8})[0-9a-fA-F]{20,}([0-9a-fA-F]{4})(?![\w…])/g;
const BASE64 = /(?<![\w+/…])[A-Za-z0-9+/]{48,}={0,2}(?![\w+/=…])/g;
const WORDRUN = /\b[a-z]{3,8}(?:[ \t,]+[a-z]{3,8}){11,}\b/g;

/*
 * opts: {home, username, hostname, keepHosts: [], secrets: []} (all optional)
 * → {text, counts: {secrets, blocks, phrases, paths, users, ips, hosts, addresses, hex}}
 */
export function sanitizeText(input, opts = {}) {
  let t = String(input == null ? '' : input);
  const counts = { secrets: 0, blocks: 0, phrases: 0, paths: 0, users: 0, ips: 0, hosts: 0, addresses: 0, hex: 0 };
  const keep = new Set((opts.keepHosts || KNOWN_PUBLIC_HOSTS).map((h) => String(h).toLowerCase()));
  const sub = (re, kind, fn) => {
    t = t.replace(re, (...m) => {
      const r = fn(...m);
      if (r !== m[0]) counts[kind]++;
      return r;
    });
  };

  //1. exact secrets first, before anything can cut them apart
  for (const s of opts.secrets || []) {
    if (typeof s === 'string' && s.length >= 4) sub(new RegExp(escapeRe(s), 'g'), 'secrets', () => '<redacted>');
  }

  //2. whole blocks: slatepacks, slates, recovery phrases
  sub(SLATEPACK, 'blocks', () => '[slatepack removed]');
  sub(SLATE_LINE, 'blocks', () => '[slate removed]');
  sub(WORDRUN, 'phrases', (m) => maskPhrase(m));

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

  //5. addresses: onion, Epicbox / base58 keys (with their domain), then IPs and URL hosts
  sub(ONION, 'addresses', (m, a, b, onion) => a + '…' + b + (onion || ''));
  sub(BASE58, 'addresses', (m, a, b, at) => {
    //all digits or all letters is not a key (a long number, a word)
    if (/^[0-9]+$/.test(m) || /^[A-Za-z]+$/.test(m.replace(/@.*/, ''))) return m;
    let dom = '';
    if (at) {
      const [host, port] = at.slice(1).split(':');
      dom = '@' + (isKnownHost(host, keep) ? host : '<host>') + (port ? ':' + port : '');
    }
    return a + '…' + b + dom;
  });
  //an IP in a URL is left to the IP rules below (which keep loopback)
  sub(URL_HOST, 'hosts', (m, scheme, host) => isKnownHost(host.replace(/^\[|\]$/g, ''), keep) || /^<[a-z]+>$/.test(host) || host.includes('…')
    || /^[\d.]+$|^\[/.test(host) ? m : scheme + '<host>');
  sub(IPV4, 'ips', (m) => /^(127\.|0\.0\.0\.0$)/.test(m) ? m : '<ip>');
  sub(IPV6, 'ips', (m) => {
    const colons = (m.match(/:/g) || []).length;
    const ip = m.includes('::') ? /[0-9a-f]/i.test(m) || m === '::' : colons >= 5 && /[a-f]/i.test(m) || colons === 7;
    if (!ip || m === '::1' || m === '::' || /^[0-9:]+$/.test(m) && !m.includes('::')) return m;
    return '<ip>';
  });

  //6. long hex and blobs
  sub(HEX, 'hex', (m, a, b) => a + '…' + b);
  sub(BASE64, 'secrets', (m) => /[0-9]/.test(m) && /[A-Za-z]/.test(m) ? '<blob>' : m);

  return { text: t, counts };
}

/* a run of words: the 12+ consecutive recovery-phrase words in it go, other words stay */
function maskPhrase(run) {
  const parts = run.split(/([ \t,]+)/);
  const out = [];
  let i = 0;
  while (i < parts.length) {
    let j = i, n = 0;
    while (j < parts.length && BIP39_SET.has(parts[j])) { n++; j += 2; }
    if (n >= 12) {
      out.push('[recovery phrase removed]');
      i = j;
      if (i < parts.length) out.push(parts[i - 1]);
    } else {
      out.push(parts[i]);
      if (i + 1 < parts.length) out.push(parts[i + 1]);
      i += 2;
    }
  }
  return out.join('');
}
