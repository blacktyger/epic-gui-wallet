'use strict';
// The log cleaner for support reports (src/shared/logSanitize.js): nasty samples from Windows, Linux
// and macOS, epic-wallet and GUI lines. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText, KNOWN_PUBLIC_HOSTS } from '../src/shared/logSanitize.js';

const clean = (t, o) => sanitizeText(t, o).text;
const ADDR = 'esZ4kWhq7ZrNA6k3qbvtmaHzMxXhF3EFh5vyKQNeHbgmyzEQGpJ2c';
const PHRASE = 'abandon ability able about above absent absorb abstract absurd abuse access accident';

test('the user\'s home: Windows, JSON-escaped, forward slashes, UNC, file URLs, Linux, macOS → ~', () => {
  const win = { home: 'C:\\Users\\Paweł Żółć', username: 'Paweł Żółć', hostname: 'DESKTOP-7QK2' };
  assert.equal(clean('dir C:\\Users\\Paweł Żółć\\.epic-gui\\logs', win), 'dir ~\\.epic-gui\\logs');
  assert.equal(clean('"C:\\\\Users\\\\Paweł Żółć\\\\.epic-gui"', win), '"~\\\\.epic-gui"');
  assert.equal(clean('file:///C:/Users/Paweł Żółć/.epic-gui/x', win), 'file:///~/.epic-gui/x');
  assert.equal(clean('c:\\users\\PAWEŁ ŻÓŁĆ\\x', win), '~\\x');
  assert.equal(clean('host DESKTOP-7QK2 user Paweł Żółć ok', win), 'host <host> user <user> ok');
  //another user's folder, no user name given: still masked
  assert.equal(clean('copied from D:\\Users\\Ann Lee\\.epic\\main and C:\\Users\\bob\\x'), 'copied from ~\\.epic\\main and ~\\x');
  assert.equal(clean('\\\\NAS-01\\share\\Users\\kasia\\.epic\\main'), '~\\.epic\\main');
  assert.equal(clean('\\\\NAS-01\\backups\\epic'), '\\\\<host>\\backups\\epic');
  const lin = { home: '/home/jan.kowalski', username: 'jan.kowalski', hostname: 'jk-laptop' };
  assert.equal(clean('/home/jan.kowalski/.epic-gui/wallets/w1/epic-wallet.log', lin), '~/.epic-gui/wallets/w1/epic-wallet.log');
  assert.equal(clean('/home/jan.kowalskiego/x', lin), '~/x');
  assert.equal(clean('/Users/marta/Library/Application Support/x'), '~/Library/Application Support/x');
  //a user name that is a common word stays a word elsewhere; its home is still masked
  assert.equal(clean('/home/user/.epic and the user clicked', { home: '/home/user', username: 'user' }), '~/.epic and the user clicked');
});

test('IPs masked (not loopback), public node hosts kept, other hosts and URL credentials dropped', () => {
  assert.equal(clean('peer 85.214.12.7:3414 connected, 127.0.0.1:3413 and 0.0.0.0:3415 local'), 'peer <ip>:3414 connected, 127.0.0.1:3413 and 0.0.0.0:3415 local');
  assert.equal(clean('from 2001:db8:85a3::8a2e:370:7334 and fe80::1ff:fe23:4567:890a%eth0, [::1]:3413'), 'from <ip> and <ip>%eth0, [::1]:3413');
  assert.equal(clean('20251020 12:34:56.789 DEBUG epic_wallet::api::owner - ok at 2026-10-20T12:00:00Z'), '20251020 12:34:56.789 DEBUG epic_wallet::api::owner - ok at 2026-10-20T12:00:00Z');
  assert.equal(clean('node https://node.epiccash.com:3413 and http://mynode.kowalski.pl:3413/v2/owner'), 'node https://node.epiccash.com:3413 and http://<host>:3413/v2/owner');
  assert.equal(clean('http://admin:hunter2@10.0.0.5:3413'), 'http://<ip>:3413');
  assert.equal(clean('wss://epicbox.epic.tech:443 epicbox.stackwallet.com'), 'wss://epicbox.epic.tech:443 epicbox.stackwallet.com');
  assert.equal(clean('http://[2001:db8::1]:3413/v2'), 'http://[<ip>]:3413/v2');
  assert.ok(KNOWN_PUBLIC_HOSTS.includes('node.epiccash.com'));
});

test('addresses: Epicbox (with its domain), onion → prefix…suffix', () => {
  assert.equal(clean('listening as ' + ADDR + '@epicbox.epiccash.com'), 'listening as esZ4kW…pJ2c@epicbox.epiccash.com');
  assert.equal(clean('to ' + ADDR + '@epicbox.myhome.net:443'), 'to esZ4kW…pJ2c@<host>:443');
  assert.equal(clean('"address":"' + ADDR + '"'), '"address":"esZ4kW…pJ2c"');
  assert.equal(clean('http://fxe3rdb2b3fhq7anbfz5spsqeisubdqgbn3cgr4dhr6ehp2bdyhq3xid.onion/v2'), 'http://fxe3rd…3xid.onion/v2');
});

test('secrets: values after secret-looking keys, auth headers, --pass, the known password, blobs', () => {
  const pw = 'Zaq1@WSX gęś';
  assert.equal(clean('unlock with ' + pw + ' failed', { secrets: [pw] }), 'unlock with <redacted> failed');
  assert.equal(clean('password=abc123 api_secret: "s3cr3t" token=x9 Seed = deadbeef'), 'password=<redacted> api_secret: "<redacted>" token=<redacted> Seed = <redacted>');
  assert.equal(clean('{"password":"p@ss w0rd","owner_api_secret":"abc"}'), '{"password":"<redacted>","owner_api_secret":"<redacted>"}');
  assert.equal(clean('Authorization: Basic ZXBpYzpzZWNyZXQ= and Bearer abc.def.ghi'), 'Authorization: Basic <redacted> and Bearer <redacted>');
  assert.equal(clean('epic-wallet --pass hunter2 listen'), 'epic-wallet --pass <redacted> listen');
  assert.equal(clean('use_tor_listener = false, password set: true'), 'use_tor_listener = false, password set: true');
  assert.equal(clean('cert ' + 'QUJD'.repeat(10) + 'MTIz' + 'eHl6'.repeat(4) + '=='), 'cert <blob>');
});

test('slates, slatepacks and recovery phrases are removed whole; other words stay', () => {
  assert.equal(clean('BEGINSLATEPACK. 4H1qx1wHe668tFW yC2gfL8PPd8kSgv\npqXscdCrBHW ENDSLATEPACK. done'), '[slatepack removed] done');
  assert.equal(clean('DEBUG slate: {"version_info":{"version":3},"num_participants":2,"id":"0f1e"} end'), 'DEBUG slate: [slate removed]');
  assert.equal(clean('Your recovery phrase is: ' + PHRASE + ' Please back-up these words'),
    'Your recovery phrase is: [recovery phrase removed] Please back-up these words');
  assert.equal(clean(PHRASE.split(' ').join(', ')), '[recovery phrase removed]');
  //24 words with line breaks in between are two runs of 12
  const p24 = PHRASE + ' ' + PHRASE;
  assert.equal(clean(p24), '[recovery phrase removed]');
  //11 words is a sentence, not a phrase
  const eleven = PHRASE.split(' ').slice(0, 11).join(' ');
  assert.equal(clean(eleven), eleven);
});

test('kept for support: amounts, tx/slate ids (UUIDs), heights, versions, ports; chain hex masked', () => {
  const line = 'tx 3f0e1d2c-4b5a-4968-8776-a5b4c3d2e1f0 sent 1.23456789 EPIC (fee 0.008) at height 2145012, v4.1.0, port 3415';
  assert.equal(clean(line), line);
  assert.equal(clean('kernel excess 08a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9012'),
    'kernel excess 08a1b2c3…9012');
  assert.equal(clean('commit: 09' + 'ab'.repeat(32)), 'commit: 09ababab…abab');
});

test('idempotent, and linear on a few MB', () => {
  const sample = [
    'C:\\Users\\Jan\\.epic-gui ' + ADDR + '@epicbox.epiccash.com 85.214.12.7 http://u:p@my.host:3413',
    'password=x ' + PHRASE, 'Basic ZXBpYzpzZWNyZXQ=', 'tx 3f0e1d2c-4b5a-4968-8776-a5b4c3d2e1f0 1.5 EPIC',
  ].join('\n');
  const once = clean(sample, { home: 'C:\\Users\\Jan', username: 'Jan' });
  assert.equal(clean(once, { home: 'C:\\Users\\Jan', username: 'Jan' }), once);
  const counts = sanitizeText(sample, { home: 'C:\\Users\\Jan', username: 'Jan' }).counts;
  assert.ok(counts.paths >= 1 && counts.addresses >= 1 && counts.ips >= 1 && counts.secrets >= 2 && counts.phrases === 1);
  //a 4 MB log of nasty lines, and some pathological ones
  const big = (sample + '\n').repeat(Math.ceil(4e6 / sample.length))
    + 'a:'.repeat(50000) + '\n' + '/home/'.repeat(20000) + '\n' + 'x'.repeat(200000) + '\n' + 'abandon '.repeat(30000);
  const t0 = Date.now();
  const out = clean(big, { home: 'C:\\Users\\Jan', username: 'Jan', hostname: 'jan-pc' });
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, 'took ' + ms + ' ms');
  assert.ok(!out.includes('C:\\Users\\Jan'));
  assert.ok(!out.includes('85.214.12.7'));
});
