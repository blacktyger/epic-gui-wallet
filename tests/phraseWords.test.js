// Tests for src/shared/phraseWords.js, a pasted recovery phrase split into words: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPhrase } from '../src/shared/phraseWords.js';

const W = ['abandon', 'ability', 'able', 'about'];

test('one line, separated by spaces', () => {
  assert.deepEqual(splitPhrase('abandon ability able about'), W);
});

test('extra spaces, tabs, new lines and Windows line ends', () => {
  assert.deepEqual(splitPhrase('  abandon\tability\r\nable \n\n about  '), W);
});

test('commas and semicolons', () => {
  assert.deepEqual(splitPhrase('abandon,ability, able;about'), W);
});

test('numbered lists', () => {
  assert.deepEqual(splitPhrase('1. abandon\n2. ability\n3) able\n4: about'), W);
  assert.deepEqual(splitPhrase('1.abandon 2.ability 3.able 4.about'), W);
});

test('upper case and stray punctuation', () => {
  assert.deepEqual(splitPhrase('Abandon ABILITY "able" about.'), W);
});

test('empty or missing text', () => {
  assert.deepEqual(splitPhrase(''), []);
  assert.deepEqual(splitPhrase('   \n '), []);
  assert.deepEqual(splitPhrase(undefined), []);
});
