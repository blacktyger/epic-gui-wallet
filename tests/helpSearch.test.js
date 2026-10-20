// Help search (src/help/search.js): matching across title, one-line answer and detail, accents and
// case ignored, every match marked, the HTML left valid, and the search runs in the language shown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, queryWords, findRanges, highlightText, highlightHtml, plainText, searchTopics, MIN_QUERY } from '../src/help/search.js';
import { helpTopics as help, topicsFor } from '../src/help/topics.js';

const T = [
  { id: 'a', title: 'Send with a file', short: 'Save a file and pass it on.', body: '<p>The <b>response</b> file comes back.</p>' },
  { id: 'b', title: 'Fees', short: 'A small fee goes to miners.', body: '<p>You see it before you send.</p>' },
  { id: 'c', title: 'Confirmations', short: 'Wait for blocks.', body: '<p>About a minute per block; a file is not needed.</p>' },
];

test('a query shorter than the minimum finds nothing (all topics stay listed)', () => {
  assert.equal(MIN_QUERY, 2);
  assert.deepEqual(searchTopics(T, ''), []);
  assert.deepEqual(searchTopics(T, ' f '), []);
  assert.deepEqual(queryWords('   '), []);
});

test('title matches rank first, then the one-line answer, then the detail; ties keep the order', () => {
  assert.deepEqual(searchTopics(T, 'file').map(r => r.topic.id), ['a', 'c']);
  assert.deepEqual(searchTopics(T, 'send').map(r => r.topic.id), ['a', 'b']);
  const c = searchTopics(T, 'minute')[0];
  assert.equal(c.topic.id, 'c');
  assert.equal(c.inBody, true, 'a match only in the detail opens the fold');
  assert.equal(searchTopics(T, 'fees')[0].inBody, false);
});

test('every word must appear somewhere in the topic, in any order and part', () => {
  assert.deepEqual(searchTopics(T, 'response save').map(r => r.topic.id), ['a']);
  assert.deepEqual(searchTopics(T, 'fee response'), []);
});

test('case, accents and Polish ł are ignored; tags are not searched', () => {
  const pl = [{ id: 'x', title: 'Fraza odzyskiwania', short: 'Zapisz słowa na papierze.', body: '<p>Źródło: <b>Ustawienia</b> › Wyświetl</p>' }];
  assert.equal(searchTopics(pl, 'SLOWA').length, 1);
  assert.equal(searchTopics(pl, 'zrodlo').length, 1);
  assert.equal(searchTopics(pl, 'wyswietl').length, 1);
  assert.equal(searchTopics(T, '<b>').length, 0);
  assert.equal(searchTopics(T, 'p>').length, 0);
});

test('Persian: Arabic yeh/kaf and the zero-width non-joiner match the Persian forms', () => {
  assert.equal(fold('كيف').text, fold('کیف').text);
  assert.equal(fold('می‌شود').text, fold('میشود').text);
  const fa = [{ id: 'f', title: 'کیف پول', short: 'تراکنش‌ها', body: '' }];
  assert.equal(searchTopics(fa, 'كيف').length, 1);
  assert.equal(searchTopics(fa, 'تراکنشها').length, 1);
});

test('Hindi: vowel signs are kept, so different words stay different', () => {
  assert.notEqual(fold('कि').text, fold('क').text);
  const hi = [{ id: 'h', title: 'शुल्क', short: 'नोड', body: '' }];
  assert.equal(searchTopics(hi, 'शुल्क').length, 1);
  assert.equal(searchTopics(hi, 'शल्क').length, 0);
});

test('ranges map back to the original text, whole characters, overlaps merged', () => {
  assert.deepEqual(findRanges('Źródło źródło', ['zrodlo']), [[0, 6], [7, 13]]);
  assert.deepEqual(findRanges('sending', ['send', 'end']), [[0, 4]]);
  assert.deepEqual(findRanges('ab😀cd', ['cd']), [[4, 6]]);
});

test('highlightText escapes the text and marks every match', () => {
  assert.equal(highlightText('Fee <b> fee', ['fee']), '<mark>Fee</mark> &lt;b&gt; <mark>fee</mark>');
  assert.equal(highlightText('nothing', []), 'nothing');
});

test('highlightHtml marks text between tags only and keeps the markup valid', () => {
  const html = '<p>The <b>response</b> file, a <a href="#file">link</a>.</p>';
  const out = highlightHtml(html, ['file', 'response']);
  assert.equal(out, '<p>The <b><mark>response</mark></b> <mark>file</mark>, a <a href="#file">link</a>.</p>');
  assert.equal(highlightHtml(html, []), html);
  assert.equal(plainText(out), plainText(html));
});

test('the search runs over the language shown: a Polish word finds a Polish topic, not the English one', () => {
  const en = topicsFor(help.en);
  const pl = topicsFor(help.pl);
  assert.ok(searchTopics(pl, 'fraza').length > 0, 'pl: "fraza" (recovery phrase)');
  assert.equal(searchTopics(en, 'fraza').length, 0);
  assert.ok(searchTopics(en, 'recovery phrase').length > 0);
  assert.ok(searchTopics(pl, 'potwierdzenia').some(r => r.topic.id === 'confirmations'));
  assert.ok(searchTopics(en, 'confirmations').some(r => r.topic.id === 'confirmations'));
});

test('in every language, each topic is found by its own title', () => {
  for (const [lang, data] of Object.entries(help)) {
    for (const t of topicsFor(data)) {
      const r = searchTopics(topicsFor(data), t.title);
      assert.ok(r.some(x => x.topic.id === t.id), `${lang}: "${t.title}"`);
    }
  }
});
