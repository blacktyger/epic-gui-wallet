/* Display helpers of the Modern interface. Formatting only: no value here is sent anywhere. */

/* An EPIC amount (a number in EPIC, as the store keeps it) split for display, rounded down to
   `decimals` so the screen never shows more than the wallet holds:
   splitEpic(1234.56789) -> { sign: '', int: '1,234', frac: '5678' } */
export function splitEpic(value, { decimals = 4, locale = 'en' } = {}) {
  const n = Number(value) || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const scale = Math.pow(10, decimals);
  //round to 9 places first so 0.29 (0.28999999…) stays 0.29
  const floored = Math.floor(Number(abs.toFixed(9)) * scale + 1e-6) / scale;
  const [i, f = ''] = floored.toFixed(decimals).split('.');
  const int = Number(i).toLocaleString(locale);
  return { sign, int, frac: f };
}

export function formatEpic(value, opts = {}) {
  const { sign, int, frac } = splitEpic(value, opts);
  const dec = Number.isInteger(opts.decimals) ? opts.decimals : 4;
  return sign + int + (dec > 0 ? (1.1).toLocaleString(opts.locale || 'en').charAt(1) + frac : '');
}

/* "esY2rLq8…Wd3k4Qp": keeps both ends, which is what people compare */
export function truncateMid(text, keep = 8) {
  const s = String(text || '');
  if (s.length <= keep * 2 + 1) return s;
  return s.slice(0, keep) + '…' + s.slice(-keep);
}

/* the node's sync progress in percent, the same sources HeaderBar.vue uses */
export function nodeSyncPercent(status, locale = 'en') {
  const i = (status && status.sync_info) || {};
  let p = 0;
  if (i.current_height > 0 && i.highest_height > 0) p = i.current_height / i.highest_height * 100;
  if (i.downloaded_size > 0 && i.total_size > 0) p = i.downloaded_size / i.total_size * 100;
  if (i.rproofs > 0 && i.rproofs_total > 0) p = i.rproofs / i.rproofs_total * 100;
  if (i.kernels > 0 && i.kernels_total > 0) p = i.kernels / i.kernels_total * 100;
  return Math.floor(p).toLocaleString(locale) + '%';
}

/* local date and time for lists and details */
export function formatDateTime(date, locale = 'en', opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d)) return '';
  try { return new Intl.DateTimeFormat(locale, opts).format(d); } catch (e) { return d.toLocaleString(); }
}

/* An Epicbox address for reading out (#47): the first five and last four characters of the key are
   the ones people check, the same split everywhere an address shows in full (Receive, Send review,
   Contacts). {head, mid, tail, rest}; rest is "@domain". A short or other address: all in head. */
export function addressParts(address) {
  const a = String(address || '');
  const at = a.indexOf('@');
  const key = at > 0 ? a.slice(0, at) : a;
  const rest = at > 0 ? a.slice(at) : '';
  if (at <= 0 || key.length <= 9) return { head: a, mid: '', tail: '', rest: '' };
  return { head: key.slice(0, 5), mid: key.slice(5, -4), tail: key.slice(-4), rest };
}
