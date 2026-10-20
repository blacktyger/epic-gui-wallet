// One name for Epicbox (tester feedback #10): the UI calls it "Epicbox" / "Epicbox server" in every
// language and both interfaces, never a "relay", a "receiving server", a "web address" or a "domain".
// Help (src/help) may explain in plain words what Epicbox does, so it is not checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import en from '../src/lang/en.js';
import bg from '../src/lang/bg.js';
import cz from '../src/lang/cz.js';
import de from '../src/lang/de.js';
import fa from '../src/lang/fa.js';
import hi from '../src/lang/hi.js';
import pl from '../src/lang/pl.js';

const LANGS = { en, bg, cz, de, fa, hi, pl };
//the words for a relay (and the old Epicbox field names) in each language, as translators used them
const BANNED = {
  en: /\brelay|receiving server|epicbox web address|epicbox domain|domain of the/i,
  bg: /реле|препредав|ретранслат|домейн/i,
  cz: /relé|přenosov|zprostředkovatel|doména|doménu/i,
  de: /relay|weiterleit|vermittlungsserver|domain|webadresse/i,
  fa: /رله|واسط|دامنه/,
  hi: /रिले|डोमेन/,
  pl: /przekaźnik|przekaznik|domena|domenę|adres internetowy/i,
};

const flat = (o, p = '', r = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const q = p ? p + '.' + k : k;
    if (v && typeof v === 'object') flat(v, q, r); else r[q] = v;
  }
  return r;
};

for (const [lang, messages] of Object.entries(LANGS)) {
  test(`${lang}: no relay wording for Epicbox in the UI strings`, () => {
    const bad = Object.entries(flat(messages))
      .filter(([, v]) => typeof v === 'string' && BANNED[lang].test(v.replace(/\{[^}]*\}/g, '')))
      .map(([k, v]) => `${k}: ${v.slice(0, 90)}`);
    assert.deepEqual(bad, []);
  });
}

test('the Epicbox setting and the setup review row are called "Epicbox server"', () => {
  const m = flat(en);
  assert.equal(m['msg.settings.epicbox_domain'], 'Epicbox server');
  assert.equal(m['msg.setupwizard.epicbox_domain'], 'Epicbox server');
  assert.equal(m['msg.modern.unlock.review_relay'], 'Epicbox server');
});

test('no hard-coded relay wording in the templates either', () => {
  const root = new URL('../src/components/', import.meta.url).pathname;
  const files = [];
  const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : p.endsWith('.vue') && files.push(p); } };
  walk(root);
  const bad = [];
  for (const f of files) {
    const tpl = (fs.readFileSync(f, 'utf8').match(/<template>[\s\S]*<\/template>/) || [''])[0];
    //visible text only: drop tags, attributes and {{ }} bindings, then look for the word
    const text = tpl.replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/<[^>]*>/g, ' ');
    if (/\brelay/i.test(text)) bad.push(path.relative(root, f));
  }
  assert.deepEqual(bad, []);
});
