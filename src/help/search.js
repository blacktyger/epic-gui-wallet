/*
 * Help search (both interfaces): instant, over each topic's title, one-line answer and detail, in the
 * language the help is shown in. Pure functions, so tests/helpSearch.test.js runs them in node.
 *
 * Matching ignores case and accents ("zrodlo" finds "źródło", "Uberweisung" finds "Überweisung") and,
 * for Persian, the Arabic forms of yeh and kaf and the zero-width non-joiner. Every word of the query
 * must appear in the topic (in any of its parts); each word is highlighted wherever it appears.
 *
 * Topic texts are our own HTML (src/help/help_<lang>.js: <p>, <ul>, <li>, <b>, <h4>, no attributes
 * that need searching). highlightHtml() wraps matches in the text between tags only, so the markup
 * stays valid.
 */

export const MIN_QUERY = 2;

const MARKS = /[\u0300-\u036f]/g;
//letters NFD does not split, and Persian/Arabic variants a user may type with either keyboard
const FOLD = { 'ł': 'l', 'ß': 'ss', 'đ': 'd', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', '\u200c': '', '\u0640': '' };

function foldChar(ch) {
  const low = ch.toLowerCase();
  if (low in FOLD) return FOLD[low];
  return low.normalize('NFD').replace(MARKS, '');
}

/* the folded text and, for every folded code unit, the index of the source character it came from */
export function fold(text) {
  let out = '';
  const map = [];
  let i = 0;
  for (const ch of String(text)) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) map.push(i);
    out += f;
    i += ch.length;
  }
  map.push(i);
  return { text: out, map };
}

/* the query's words, folded, longest first (so "send file" marks "file" inside "send" ranges right) */
export function queryWords(query) {
  const words = String(query || '').trim().split(/\s+/).map(w => fold(w).text).filter(Boolean);
  if (words.join('').length < MIN_QUERY) return [];
  return [...new Set(words)].sort((a, b) => b.length - a.length);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: '\u00a0' };
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, e) => ENTITIES[e]);
export const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const INLINE = /<\/?(b|i|em|strong|mark|a|span|code)\b[^>]*>/gi;

/* the text of a help HTML fragment: inline tags dropped, the others (p, li, br…) become spaces */
export function plainText(html) {
  return decode(String(html || '').replace(INLINE, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/* source ranges [start, end) of every word in text, merged where they overlap */
export function findRanges(text, words) {
  if (!words.length) return [];
  const { text: f, map } = fold(text);
  const ranges = [];
  for (const w of words) {
    let at = f.indexOf(w);
    while (at !== -1) {
      ranges.push([map[at], map[at + w.length - 1] + 1]);
      at = f.indexOf(w, at + w.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  //a range must end after a whole character (a surrogate pair or a letter with its marks)
  return merged.map(([a, b]) => {
    while (b < text.length && (/[\u0300-\u036f]/.test(text[b]) || /[\udc00-\udfff]/.test(text[b]))) b++;
    return [a, b];
  });
}

/* plain text → HTML with every match in <mark> */
export function highlightText(text, words) {
  const s = String(text || '');
  let out = '';
  let pos = 0;
  for (const [a, b] of findRanges(s, words)) {
    out += escapeHtml(s.slice(pos, a)) + '<mark>' + escapeHtml(s.slice(a, b)) + '</mark>';
    pos = b;
  }
  return out + escapeHtml(s.slice(pos));
}

/* help HTML → the same HTML with every match in the text between tags in <mark> */
export function highlightHtml(html, words) {
  const src = String(html || '');
  if (!words.length) return src;
  return src.split(/(<[^>]*>)/).map(part => (part.startsWith('<') ? part : highlightText(decode(part), words))).join('');
}

const has = (text, w) => fold(text).text.includes(w);

/*
 * The topics that match query, best first: a word in the title counts most, then in the one-line
 * answer, then in the detail; ties keep the topics' own order. Each result says where the words
 * were found (inBody: the detail must be unfolded to show them). An empty or too short query: [].
 */
export function searchTopics(topics, query) {
  const words = queryWords(query);
  if (!words.length) return [];
  const results = [];
  topics.forEach((topic, order) => {
    const parts = { title: topic.title || '', short: topic.short || '', body: plainText(topic.body) };
    if (!words.every(w => has(parts.title, w) || has(parts.short, w) || has(parts.body, w))) return;
    let score = 0;
    for (const w of words) {
      if (has(parts.title, w)) score += 100;
      if (has(parts.short, w)) score += 10;
      if (has(parts.body, w)) score += 1;
    }
    results.push({ topic, order, score, inBody: words.some(w => has(parts.body, w)) });
  });
  return results.sort((a, b) => b.score - a.score || a.order - b.order);
}
