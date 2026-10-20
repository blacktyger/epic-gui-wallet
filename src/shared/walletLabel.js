/*
 * A wallet's stored label as the screens show it. Adding a wallet fills its label in with the default
 * name in the language of that moment ("Wallet 2", msg.wallets.wallet_n), and that text is saved as
 * the label. After a switch to another language it showed in the old one ("Wallet 2" in Polish), so a
 * label that is exactly some language's default name is shown as the default name of the current
 * language, with its own number. A label the user typed is shown as typed. Plain ESM
 * (tests/walletLabel.test.js).
 *
 * templates: every language's wallet_n ('Wallet {0}', 'Portfel {0}', …)
 */

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* the number in a label that is a default name ("Portfel 2" → 2), else 0 */
export function defaultLabelNumber(label, templates) {
  const s = String(label || '').trim();
  if (!s) return 0;
  for (const tpl of templates || []) {
    if (typeof tpl !== 'string' || !tpl.includes('{0}')) continue;
    //exactly the default name, spacing and case as the app wrote it: "WALLET 3" or "Wallet3" was typed
    const [before, after] = tpl.split('{0}').map(escape);
    const m = s.match(new RegExp('^' + before + '(\\d{1,4})' + after + '$', 'u'));
    if (m && Number(m[1]) > 0) return Number(m[1]);
  }
  return 0;
}

/* the label to show: a default name in the current language (format(n): its wallet_n), a typed label as it is */
export function displayLabel(label, templates, format) {
  const n = defaultLabelNumber(label, templates);
  return n ? format(n) : String(label || '').trim();
}

/* the letters of a name for Classic's avatar: "Jan Kowalski" → "JK", "Portfel 2" → "PO", "Savings" → "S" (as the
   store worked it out before; now also from the name as shown) */
export function avatarLetters(name) {
  const s = String(name || '');
  if (!s.trim()) return null;
  const filtered = s.replace(/^\s*([a-zA-Z]).*\s+([a-zA-Z])\S+$/g, '$1$2');
  return filtered.slice(0, (s.split(' ').length > 1 ? 2 : 1)).toUpperCase();
}
