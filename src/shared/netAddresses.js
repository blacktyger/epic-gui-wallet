/*
 * This computer's addresses for "Receive from the internet" (Settings › Receiving, bot #67): the LAN
 * address a router forwards the port to, and the public (internet) address senders use. The main
 * process asks (background.js 'direct-addresses'); the page's CSP allows no outside requests.
 * The public address comes from api.ipify.org (plain text, no key), only while the modal is open or
 * Public mode is on, cached for a few minutes. Plain ESM (tests/netAddresses.test.js).
 */

export const PUBLIC_IP_URL = 'https://api.ipify.org';

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isIpv4(s) {
  return IPV4.test(String(s || ''));
}

/* private ranges a home router hands out, best first */
function lanRank(ip) {
  if (ip.startsWith('192.168.')) return 0;
  if (ip.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 3;
}

/* os.networkInterfaces() -> the IPv4 addresses other devices on the network can reach, private
   ranges first (no loopback, no link-local 169.254.x.x) */
export function lanAddresses(ifaces) {
  const out = [];
  for (const list of Object.values(ifaces && typeof ifaces === 'object' ? ifaces : {})) {
    for (const a of Array.isArray(list) ? list : []) {
      const fam = a && (a.family === 'IPv4' || a.family === 4);
      if (!fam || a.internal || !isIpv4(a.address) || a.address.startsWith('169.254.') || a.address.startsWith('127.')) continue;
      if (!out.includes(a.address)) out.push(a.address);
    }
  }
  return out.sort((x, y) => lanRank(x) - lanRank(y));
}

/* the public IP service's answer -> an IPv4 address, or '' (anything else: HTML, an error page) */
export function parsePublicIp(text) {
  const s = String(text || '').trim();
  return s.length <= 15 && isIpv4(s) ? s : '';
}

/* the HTTP address senders use: http://<ip>:<port>, '' without an ip */
export function httpUrl(ip, port) {
  return ip && port ? 'http://' + ip + ':' + port : '';
}

/*
 * The main-process side: {lan: [..], public: '' | ip}; the public address is cached for ttlMs (a
 * failed lookup for failTtlMs). fetch: net.fetch; interfaces: os.networkInterfaces.
 */
export function createAddressLookup({ fetch: fetchFn, interfaces, now = () => Date.now(), timeoutMs = 4000, ttlMs = 300000, failTtlMs = 30000 } = {}) {
  let cached = null;
  let pending = null;
  async function lookupPublic() {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchFn(PUBLIC_IP_URL, { signal: ctl.signal, redirect: 'error', cache: 'no-store' });
      if (!res || !res.ok) return '';
      return parsePublicIp((await res.text()).slice(0, 64));
    } catch (e) {
      return '';
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async get() {
      const lan = lanAddresses(typeof interfaces === 'function' ? interfaces() : {});
      if (cached && now() < cached.until) return { lan, public: cached.ip };
      if (!pending) {
        pending = lookupPublic().then((ip) => {
          cached = { ip, until: now() + (ip ? ttlMs : failTtlMs) };
          pending = null;
          return ip;
        });
      }
      return { lan, public: await pending };
    },
  };
}
