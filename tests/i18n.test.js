// Every offered language has every English string (QA T10): the same keys, placeholders, plural forms and
// HTML tags, and every message compiles in vue-i18n. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { baseCompile } from '@intlify/message-compiler';
import { createI18n } from 'vue-i18n';
import en from '../src/lang/en.js';
import bg from '../src/lang/bg.js';
import cz from '../src/lang/cz.js';
import de from '../src/lang/de.js';
import fa from '../src/lang/fa.js';
import hi from '../src/lang/hi.js';
import pl from '../src/lang/pl.js';
import { pluralRules, formsFor } from '../src/shared/plural.js';
import { localeAttrs } from '../src/shared/locale.js';

const LANGS = { bg, cz, de, fa, hi, pl };

/* keys a language may leave to the English fallback, with the reason. Empty: everything is translated. */
const FALLBACK = {};

const flat = (o, p = '', r = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const q = p ? p + '.' + k : k;
    if (v && typeof v === 'object') flat(v, q, r); else r[q] = v;
  }
  return r;
};
const EN = flat(en);
const placeholders = s => [...new Set(String(s).match(/\{[^}]*\}/g) || [])].sort().join(' ');
const tags = s => (String(s).match(/<\/?[a-zA-Z][a-zA-Z0-9]*/g) || []).sort().join(' ');
const forms = s => String(s).split('|').length;

test('the language picker offers exactly the languages that have messages', () => {
  const src = fs.readFileSync(new URL('../src/shared/configService.js', import.meta.url), 'utf8');
  const langs = Object.keys(JSON.parse(src.match(/this\.langs = (\{[^}]*\})/)[1].replace(/'/g, '"')));
  assert.deepEqual(langs.sort(), ['en', ...Object.keys(LANGS)].sort());
  const i18n = fs.readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
  for (const l of langs) assert.match(i18n, new RegExp(`import ${l} from './lang/${l}'`), l + ' is loaded in i18n.js');
  const help = fs.readFileSync(new URL('../src/help/help.js', import.meta.url), 'utf8');
  for (const l of langs) assert.match(help, new RegExp(`import ${l} from './help_${l}'`), l + ' has help texts');
});

for (const [lang, messages] of Object.entries(LANGS)) {
  const T = flat(messages);
  const allowed = FALLBACK[lang] || {};

  test(`${lang}: every English key is there (or on the documented fallback list)`, () => {
    const missing = Object.keys(EN).filter(k => !(k in T) && !(k in allowed));
    assert.deepEqual(missing, []);
    for (const k of Object.keys(allowed)) assert.ok(!(k in T), `${k} is translated now: take it off the fallback list`);
  });

  test(`${lang}: placeholders, plural forms and HTML tags match the English`, () => {
    const bad = [];
    for (const [k, e] of Object.entries(EN)) {
      if (!(k in T)) continue;
      const t = T[k];
      if (typeof t !== 'string') { bad.push(`${k}: not a string`); continue; }
      if (String(e).trim() && !t.trim()) bad.push(`${k}: empty`);
      if (placeholders(t) !== placeholders(e)) bad.push(`${k}: placeholders ${placeholders(t)} vs ${placeholders(e)}`);
      if (forms(t) !== formsFor(lang, forms(e))) bad.push(`${k}: ${forms(t)} plural forms, want ${formsFor(lang, forms(e))}`);
      if (tags(t) !== tags(e)) bad.push(`${k}: HTML tags differ`);
    }
    assert.deepEqual(bad, []);
  });

  test(`${lang}: every message compiles in vue-i18n`, () => {
    const bad = [];
    for (const [k, t] of Object.entries(T)) {
      if (!(k in EN)) continue;
      baseCompile(String(t), { onError: e => bad.push(`${k}: ${e.message}`) });
    }
    assert.deepEqual(bad, []);
  });
}

test('the English messages compile too', () => {
  const bad = [];
  for (const [k, t] of Object.entries(EN)) baseCompile(String(t), { onError: e => bad.push(`${k}: ${e.message}`) });
  assert.deepEqual(bad, []);
});

test('Polish plurals: one | few | many, with the zero form first when there is one', () => {
  const r = pluralRules.pl;
  assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 112, 122].map(n => r(n, 3)), [0, 1, 1, 2, 2, 2, 2, 2, 1, 2, 2, 1]);
  assert.deepEqual([0, 1, 3, 7].map(n => r(n, 4)), [0, 1, 2, 3]);
});

test('the app\'s Polish and Czech plurals render through vue-i18n with these rules', () => {
  const i18n = createI18n({ legacy: false, locale: 'pl', fallbackLocale: 'en', pluralRules, messages: { en, pl, cz } });
  const t = (l, k, n) => { i18n.global.locale.value = l; return i18n.global.t(k, n); };
  //found_title: "{n} wallet | {n} wallets" in English, one | few | many here
  for (const [l, msgs] of [['pl', flat(pl)], ['cz', flat(cz)]]) {
    const form = (i, n) => msgs['msg.wallets.found_title'].split('|')[i].trim().replace('{n}', n);
    assert.equal(t(l, 'msg.wallets.found_title', 1), form(0, 1));
    assert.equal(t(l, 'msg.wallets.found_title', 3), form(1, 3));
    assert.equal(t(l, 'msg.wallets.found_title', 5), form(2, 5));
  }
  assert.equal(t('pl', 'msg.wallets.found_title', 22), flat(pl)['msg.wallets.found_title'].split('|')[1].trim().replace('{n}', 22));
  //English keeps its own rule
  assert.equal(t('en', 'msg.wallets.found_title', 2), 'We found 2 wallets from an older Epic Wallet');
});

test('Czech plurals: few is exactly 2-4', () => {
  const r = pluralRules.cz;
  assert.deepEqual([1, 2, 4, 5, 22].map(n => r(n, 3)), [0, 1, 1, 2, 2]);
  assert.deepEqual([0, 1, 2, 5].map(n => r(n, 4)), [0, 1, 2, 3]);
});

test('<html lang> and dir follow the language: Persian is right-to-left, Czech is "cs"', () => {
  assert.deepEqual(localeAttrs('fa'), { lang: 'fa', dir: 'rtl' });
  assert.deepEqual(localeAttrs('cz'), { lang: 'cs', dir: 'ltr' });
  assert.deepEqual(localeAttrs('pl'), { lang: 'pl', dir: 'ltr' });
  assert.deepEqual(localeAttrs(''), { lang: 'en', dir: 'ltr' });
  //the system's language before one is chosen
  assert.deepEqual(localeAttrs('fa-IR'), { lang: 'fa-IR', dir: 'rtl' });
});
