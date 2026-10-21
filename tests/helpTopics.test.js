// Settings › Help topics (src/help/topics_<lang>.js) are complete in every language: the same sections,
// topics, terms, page labels and diagram steps as the English, every [[term]] known, the same HTML tags; and nothing the wallet no longer does is promised (6.1.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { helpTopics as help, topicsFor } from '../src/help/topics.js';
import { plainText } from '../src/help/search.js';

const EN = help.en;
const LANGS = Object.keys(help).filter(l => l !== 'en');
const flat = (o, p = '', r = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const q = p ? p + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, q, r); else r[q] = v;
  }
  return r;
};
const tags = s => (String(s).match(/<\/?[a-z][a-z0-9]*/gi) || []).sort().join(' ');
const terms = s => (String(s).match(/\[\[[a-z_]+\]\]/g) || []).sort().join(' ');
const placeholders = s => (String(s).match(/\{[a-z]+\}/g) || []).sort().join(' ');

test('the help offers the seven languages of the app', () => {
  assert.deepEqual(Object.keys(help).sort(), ['bg', 'cz', 'de', 'en', 'fa', 'hi', 'pl']);
});

test('en: the task-based topics, each with a title, a one-line answer and a detail', () => {
  const ids = EN.topics.map(t => t.id);
  for (const id of ['receive-first', 'send', 'send-file', 'both-sides', 'confirmations', 'phrase', 'backups', 'nodes', 'epicbox', 'fees', 'troubleshooting', 'getting-help']) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  const sections = EN.sections.map(s => s.id);
  for (const t of EN.topics) {
    assert.ok(sections.includes(t.section), `${t.id}: section ${t.section}`);
    assert.ok(t.title && t.short && t.body, `${t.id}: title, short and body`);
    assert.ok(!/<|\n/.test(t.short) && plainText(t.short).length <= 160, `${t.id}: the answer is one plain line`);
  }
  assert.ok(EN.topics.some(t => t.visual === 'handshake'), 'the handshake diagram is shown');
});

test('every [[term]] exists, in every language; topics come in section order', () => {
  for (const [lang, data] of Object.entries(help)) {
    for (const t of topicsFor(data)) {
      for (const part of ['title', 'short', 'body']) assert.doesNotMatch(t[part], /\[\[/, `${lang}/${t.id}.${part}`);
    }
    const order = data.sections.map(s => s.id);
    const seen = data.topics.map(t => order.indexOf(t.section));
    assert.deepEqual(seen, [...seen].sort((a, b) => a - b), `${lang}: topics are grouped by section, in order`);
  }
});

for (const lang of LANGS) {
  const L = help[lang];

  test(`${lang}: the same sections, topics, visuals and order as the English`, () => {
    assert.deepEqual(L.sections.map(s => s.id), EN.sections.map(s => s.id));
    assert.deepEqual(L.topics.map(t => [t.id, t.section, t.visual || '']), EN.topics.map(t => [t.id, t.section, t.visual || '']));
    for (const s of L.sections) assert.ok(s.title, `${lang}: section ${s.id} has a title`);
  });

  test(`${lang}: every topic is translated, with the English tags and terms`, () => {
    L.topics.forEach((t, i) => {
      const e = EN.topics[i];
      for (const part of ['title', 'short', 'body']) {
        assert.ok(String(t[part] || '').trim(), `${lang}/${t.id}.${part} is empty`);
        assert.equal(tags(t[part]), tags(e[part]), `${lang}/${t.id}.${part}: HTML tags`);
        assert.equal(terms(t[part]), terms(e[part]), `${lang}/${t.id}.${part}: [[terms]]`);
      }
      assert.ok(!/<|\n/.test(t.short), `${lang}/${t.id}: the answer is one plain line`);
    });
  });

  test(`${lang}: the page labels, terms and diagram steps are all there`, () => {
    const eu = flat(EN.ui), lu = flat(L.ui);
    assert.deepEqual(Object.keys(lu).sort(), Object.keys(eu).sort());
    for (const [k, v] of Object.entries(eu)) {
      if (Array.isArray(v)) {
        assert.equal(lu[k].length, v.length, `${lang}: ui.${k} has ${v.length} items`);
        lu[k].forEach(s => assert.ok(String(s).trim(), `${lang}: ui.${k} item empty`));
      } else {
        assert.ok(String(lu[k]).trim(), `${lang}: ui.${k} empty`);
        assert.equal(placeholders(lu[k]), placeholders(v), `${lang}: ui.${k} placeholders`);
      }
    }
    assert.deepEqual(Object.keys(L.terms).sort(), Object.keys(EN.terms).sort(), `${lang}: terms`);
    for (const [k, v] of Object.entries(L.terms)) assert.ok(String(v).trim(), `${lang}: terms.${k}`);
  });
}

test('en: only what 6.1.6 does — no payment proofs, never a photo or screenshot of the phrase as advice', () => {
  for (const t of EN.topics) {
    const text = [t.title, t.short, plainText(t.body)].join(' ');
    assert.doesNotMatch(text, /payment proof/i, t.id);
    for (const m of text.matchAll(/[^.]*\b(screenshot|photo)[^.]*\./gi)) {
      assert.match(m[0], /\b(never|not|don't|no)\b/i, `${t.id}: "${m[0].trim()}"`);
    }
  }
});

test('the topics mention Epicbox by name, and "relay" only as an explanation', () => {
  const ep = EN.topics.find(t => t.id === 'epicbox');
  assert.match(ep.title, /Epicbox/);
  for (const t of EN.topics) assert.doesNotMatch(t.title, /relay/i, `${t.id}: a title is a name, not an explanation`);
});
