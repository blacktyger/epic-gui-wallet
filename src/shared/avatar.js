/*
 * A contact's automatic avatar: up to two initials on a colour picked from the name, the same colour
 * every time (the list, the detail, the Send picker and the form's live preview agree). Pure
 * functions, unit-tested in tests/avatar.test.js.
 *
 * The palette has a tone per theme (Modern dark and light; Classic is dark): a soft background and a
 * strong text colour of the same hue, so it reads like the app's tags. Every pair keeps the initials
 * at 4.5:1 or more (WCAG 1.4.3), which the test checks.
 */

export const AVATAR_PALETTE = [
  { id: 'gold', dark: { bg: '#3a3220', fg: '#f6d471' }, light: { bg: '#f3e6d0', fg: '#6e4a17' } },
  { id: 'coral', dark: { bg: '#3d2424', fg: '#f4a2a2' }, light: { bg: '#f8dcda', fg: '#8e2a22' } },
  { id: 'green', dark: { bg: '#203421', fg: '#93dd93' }, light: { bg: '#d9eedd', fg: '#1d6633' } },
  { id: 'blue', dark: { bg: '#1e2b3f', fg: '#9cc3f5' }, light: { bg: '#d9e6f7', fg: '#1d4f8f' } },
  { id: 'violet', dark: { bg: '#2e2540', fg: '#c7b2f2' }, light: { bg: '#e6def5', fg: '#56399a' } },
  { id: 'teal', dark: { bg: '#18322f', fg: '#86d8cd' }, light: { bg: '#d3ece9', fg: '#14615b' } },
  { id: 'rose', dark: { bg: '#3a2231', fg: '#f2a6cb' }, light: { bg: '#f5dbe7', fg: '#8a2f5a' } },
  { id: 'slate', dark: { bg: '#272a31', fg: '#c3c8d2' }, light: { bg: '#e2e4e9', fg: '#454b57' } },
];

const fold = (s) => String(s == null ? '' : s).trim().toLocaleLowerCase();

/* FNV-1a over the UTF-16 code units: small, stable across runs and machines */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* the palette entry of a contact (or a name): the same name, any case or spacing, the same colour */
export function avatarColor(contactOrName) {
  const name = typeof contactOrName == 'object' && contactOrName ? contactOrName.name : contactOrName;
  return AVATAR_PALETTE[hash(fold(name)) % AVATAR_PALETTE.length];
}

/* the user-visible characters of s (an emoji with a skin tone or a flag stays one) */
function graphemes(s) {
  if (typeof Intl != 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment);
  }
  return Array.from(s);
}

const LETTER = /[\p{L}\p{N}]/u;
const ARABIC = /\p{Script=Arabic}/u;

/* the first letter or digit of a word ("@bob" → "b", "(Café)" → "C"), or its first character */
function firstOf(word) {
  const g = graphemes(word);
  return g.find((c) => LETTER.test(c)) || g[0] || '';
}

/* "Mara Okafor" → "MO", "Café Lumen Bar" → "CB", "Juno" → "J", "" → "" (the avatar shows a person
   glyph then). Scripts without case (Persian, Hindi) keep their letters as they are. */
export function avatarInitials(name) {
  const words = String(name == null ? '' : name).trim().split(/\s+/).filter((w) => w && LETTER.test(w));
  if (!words.length) {
    const g = graphemes(String(name == null ? '' : name).trim());
    return g.length ? g[0] : '';
  }
  //one word, one letter (as a messaging app shows "Juno")
  if (words.length == 1) return firstOf(words[0]).toLocaleUpperCase();
  const a = firstOf(words[0]), b = firstOf(words[words.length - 1]);
  //Arabic-script letters would join into one shape (a word, not two initials): a zero-width non-joiner keeps them apart
  const join = ARABIC.test(a) && ARABIC.test(b) ? '\u200c' : '';
  return (a + join + b).toLocaleUpperCase();
}

/* WCAG relative luminance contrast of two #rrggbb colours (for the palette test) */
export function contrastRatio(a, b) {
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
