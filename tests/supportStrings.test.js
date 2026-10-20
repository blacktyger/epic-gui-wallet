'use strict';
// The report strings say only that the report goes to the Epic GUI Wallet developer and that it is
// encrypted: never a channel, group, service or bot, in any language (user decision, 2026-10-20). Also
// short: the dialog says the privacy line once. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import en from '../src/lang/support.js';

const LANGS = ['bg', 'cz', 'de', 'fa', 'hi', 'pl'];
//telegram, tester(s), group in the 7 languages, the bot's names, other channels
const BANNED = /telegram|t\.me\b|tester|testér|testeř|тестер|آزمایش‌کنند|टेस्टर|\bgroups?\b|grupa|grupie|grupy|grupę|gruppe|skupin|група|групата|گروه|समूह|ग्रुप|btlabs|\bbots?\b|(?<!\p{L})бот(?!\p{L})|discord|whatsapp|signal\b|channel|kanał|kanál|kanal|канал|کانال|चैनल|forum|github/iu;

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
async function block(lang) {
  const m = await import('../src/lang/shared/' + lang + '.js');
  return m.default.support;
}

test('support strings name no channel, group, service or bot, in any language', async () => {
  const all = [['en', en]];
  for (const l of LANGS) all.push([l, await block(l)]);
  for (const [lang, s] of all) {
    assert.ok(s && Object.keys(s).length, lang + ': no support block');
    for (const [k, v] of Object.entries(s)) {
      assert.doesNotMatch(String(v), BANNED, lang + ' msg.support.' + k + ': ' + v);
    }
  }
});

test('support strings are short, and the privacy line is said once', async () => {
  for (const [k, v] of Object.entries(en)) assert.ok(v.length <= 80, 'msg.support.' + k + ' is ' + v.length + ' characters');
  //encryption is mentioned by attach_note only
  const enc = Object.entries(en).filter(([, v]) => /encrypt/i.test(v)).map(([k]) => k);
  assert.deepEqual(enc, ['attach_note']);
  for (const l of LANGS) {
    const s = await block(l);
    assert.deepEqual(Object.keys(s), Object.keys(en), l + ': the same keys in the same order as the English');
  }
});

test('the dialogs, help texts and release notes name no channel either', () => {
  const files = ['src/components/layout/SupportReportModalBox.vue', 'src/components/modern/dialogs/SupportDialog.vue',
    'src/components/Help.vue', 'src/components/modern/views/settings/SettingsHelp.vue', 'src/components/modern/onboarding/AuthFoot.vue',
    ...fs.readdirSync(path.join(import.meta.dirname, '..', 'src/help')).map((f) => 'src/help/' + f)];
  for (const f of files) {
    //template text and strings, not code identifiers: telegram, groups, testers, the bot
    assert.doesNotMatch(read(f), /telegram|tester|btlabs_bot|testers’ group|\bthe group\b/i, f);
  }
  const notes = read('docs/RELEASE_NOTES.md').split(/\n## /)[1] || '';
  assert.doesNotMatch(notes, BANNED, 'the newest release notes section');
});
