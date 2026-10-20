// Classic page titles and the node's sync state in the app's language (6.1.4 left them English), and
// the help texts' fixes (no screenshot of the recovery words, the offline file comes from the sender).
// `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NODE_STATES, nodeStateKey, nodeStateText } from '../src/shared/nodeState.js';
import en from '../src/lang/en.js';
import helpEn from '../src/help/help_en.js';
import helpBg from '../src/help/help_bg.js';
import helpCz from '../src/help/help_cz.js';
import helpDe from '../src/help/help_de.js';
import helpFa from '../src/help/help_fa.js';
import helpHi from '../src/help/help_hi.js';
import helpPl from '../src/help/help_pl.js';

//src/help/help.js imports these without extensions (webpack), so the test loads them itself
const help = { en: helpEn, bg: helpBg, cz: helpCz, de: helpDe, fa: helpFa, hi: helpHi, pl: helpPl };

const src = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', 'src', f), 'utf8');
const get = (o, key) => key.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), o);

test('every sync state the store sets has an English message; an unknown one is shown as it is', () => {
  const store = src('store/index.js');
  const set = [...store.matchAll(/payload\.sync_status = '([^']+)'/g)].map(m => m[1]);
  assert.ok(set.length >= 8, 'found the store\'s states');
  for (const s of set) {
    assert.ok(NODE_STATES[s], 'mapped: ' + s);
    assert.equal(typeof get(en, nodeStateKey(s)), 'string', 'en has ' + nodeStateKey(s));
  }
  assert.equal(nodeStateKey('compacting'), '');
  assert.equal(nodeStateKey('toString'), '');
  const t = (k) => 'T:' + k;
  assert.equal(nodeStateText(t, 'synced'), 'T:msg.node_state.synced');
  assert.equal(nodeStateText(t, 'compacting'), 'compacting');
  assert.equal(nodeStateText(t, undefined), '');
});

test('Classic: every page with the header bar has a translated title key that exists in English', () => {
  const router = src('router/index.js');
  const routes = router.split(/\n  \{\n/).slice(1);
  const withHeader = routes.filter(r => /headerbar: HeaderBar/.test(r));
  assert.ok(withHeader.length >= 12);
  for (const r of withHeader) {
    const name = (r.match(/name: '([^']+)'/) || [])[1];
    const key = (r.match(/titleKey: '([^']+)'/) || [])[1];
    assert.ok(key, name + ' has a titleKey');
    assert.equal(typeof get(en, key), 'string', name + ': ' + key + ' is in en');
  }
  assert.match(src('components/HeaderBar.vue'), /route\.meta\.titleKey \? \$t\(route\.meta\.titleKey\)/);
  assert.match(src('components/HeaderBar.vue'), /nodeState\(store\.state\.nodeStatus\.sync_status\)/);
});

test('help: no language tells people to screenshot the recovery words; offline files: the right sender', () => {
  const langs = Object.keys(help);
  for (const l of langs) assert.match(src('help/help.js'), new RegExp(`import ${l} from './help_${l}'`));
  const enTopics = help.en.length;
  for (const l of langs) {
    const all = help[l].map(t => t.title + '\n' + t.text).join('\n');
    assert.equal(help[l].length, enTopics, l + ': the same topics as English');
    assert.ok(!/screenshot|ngrok/i.test(all.replace(/never keep them\s+as a photo, screenshot or file/i, '')), l + ': no screenshot advice, no Ngrok');
  }
  const en = help.en;
  const imp = en.find(t => t.title === 'Import offline transaction');
  assert.match(imp.text, /received from the sender/);
  assert.doesNotMatch(imp.text, /provided by the receiver/);
  assert.ok(en.some(t => t.title === 'Recovery phrase'));
  assert.ok(!en.some(t => /mnemonic/i.test(t.title)));
});
