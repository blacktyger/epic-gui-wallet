// Every message key the code names literally exists in English: a missing one shows the raw key
// ("msg.send.foo") in every language, and tests/i18n.test.js only compares the languages with each other.
// Keys built at run time (t('msg.' + x)) are not checked here. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import en from '../src/lang/en.js';

const SRC = path.join(import.meta.dirname, '..', 'src');
const flat = (o, p = '', r = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const q = p ? p + '.' + k : k;
    r[q] = v;
    if (v && typeof v === 'object') flat(v, q, r);
  }
  return r;
};
const EN = flat(en);

const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (f.name !== 'lang') walk(p); } else if (/\.(vue|js)$/.test(f.name)) files.push(p);
  }
};
walk(SRC);

//$t('a.b'), t("a.b"), $tc / tc / $te / $tm, <i18n-t keypath="a.b">
const KEY = /(?:\$t|\$tc|\$te|\$tm|\bt|\btc|\btm|\bte)\(\s*(['"`])([a-zA-Z0-9_.-]+)\1|keypath=["']([a-zA-Z0-9_.-]+)["']/g;

test('every literal message key in src/ exists in English', () => {
  const missing = [];
  let seen = 0;
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(KEY)) {
      const k = m[2] || m[3];
      //no dot: not a message key; ending in . or _: the start of a key built at run time ('msg.x.' + y)
      if (!k.includes('.') || /[._]$/.test(k)) continue;
      seen++;
      if (!(k in EN)) missing.push(k + '  (' + path.relative(SRC, f) + ')');
    }
  }
  assert.ok(seen > 500, 'found the keys (' + seen + ')');
  assert.deepEqual([...new Set(missing)], [], 'keys used but not in src/lang (English)');
});
