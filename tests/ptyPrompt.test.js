// Tests for src/shared/ptyPrompt.js: `npm test`. The samples are epic-wallet 4.1.0 output on a pty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPtyText, createPromptAnswerer } from '../src/shared/ptyPrompt.js';

const PHRASE = 'must warfare knock circle mother rigid radio divert jar keen arrive rival broccoli minute skin feed winter baby maple chest bird grain child birth';

//feed chunks, collect lines and answers
function run(chunks, opts) {
  const a = createPromptAnswerer(opts);
  const lines = [];
  const answers = [];
  let fail = null;
  for (const c of chunks) {
    const r = a.feed(c);
    lines.push(...r.lines);
    answers.push(...r.answers);
    fail = fail || r.fail;
  }
  lines.push(...a.end().lines);
  return { lines, answers, fail, done: a.done };
}

test('colours, cursor codes, the window title and \\r are removed', () => {
  assert.equal(cleanPtyText('2026-10-19 14:47:53.250 \u001b[0;32mINFO\u001b[0m log4rs\r\n').text, '2026-10-19 14:47:53.250 INFO log4rs\n');
  //ConPTY: title, cursor hide, clear, home, runs of spaces as cursor forward
  assert.equal(cleanPtyText('\u001b]0;C:\\epic\\epic-wallet.exe\u0007\u001b[?25l\u001b[2J\u001b[m\u001b[HStarting\u001b[1Cepicbox').text, '\nStarting epicbox');
  //an escape sequence cut at the end of a chunk is kept for the next one
  const c = cleanPtyText('INFO\u001b[0;3');
  assert.equal(c.text, 'INFO');
  assert.equal(c.rest, '\u001b[0;3');
});

test('listen: the password prompt is answered once, then nothing more is written', () => {
  const r = run([
    '2026-10-19 14:48:06.031 \u001b[0;32mINFO\u001b[0m Connecting to the node: https://node.epiccash.com:3413 ...\r\n',
    '2026-10-19 14:48:06.498 \u001b[0;32mINFO\u001b[0m Node is synced, proceeding...\r\n',
    'Password: ',
    '\r\n',
    '2026-10-19 14:48:06.780 \u001b[0;33mWARN\u001b[0m Starting HTTP Foreign listener API server at 127.0.0.1:3515.\r\n',
    '2026-10-19 14:48:06.780 \u001b[0;33mWARN\u001b[0m HTTP Foreign listener started.\r\n',
  ], { passwords: 1 });
  assert.deepEqual(r.answers, ['password']);
  assert.equal(r.fail, null);
  assert.ok(r.done);
  assert.ok(!r.lines.some(l => /Password:/.test(l)), 'the prompt line is left out');
  assert.ok(r.lines.includes('2026-10-19 14:48:06.780 WARN HTTP Foreign listener started.'));
  assert.ok(r.lines.includes('2026-10-19 14:48:06.498 INFO Node is synced, proceeding...'));
});

test('listen: the prompt split over chunks is still found', () => {
  const r = run(['...proceeding...\r\nPass', 'word', ': '], { passwords: 1 });
  assert.deepEqual(r.answers, ['password']);
});

test('listen: a wrong password is the plain epic-wallet error line', () => {
  const r = run(['Password: ', '\r\n', '2026-10-19 14:48:05.847 \u001b[0;31mERROR\u001b[0m Wallet command failed: Lifecycle Error: Error opening wallet (is password correct?)\r\n'], { passwords: 1 });
  assert.deepEqual(r.answers, ['password']);
  assert.deepEqual(r.lines, ['2026-10-19 14:48:05.847 ERROR Wallet command failed: Lifecycle Error: Error opening wallet (is password correct?)']);
});

test('a prompt after the answers were given stops the process (it would wait forever)', () => {
  const r = run(['Password: ', '\r\n', 'Password: '], { passwords: 1 });
  assert.deepEqual(r.answers, ['password']);
  assert.equal(r.fail, 'unexpected_prompt');
  //no prompt is expected at all (the fallback)
  assert.equal(run(['Password: '], { passwords: 0 }).fail, 'unexpected_prompt');
});

test('init: new and confirm password, the recovery phrase line passes', () => {
  const r = run([
    'Please enter a password for your new wallet\r\nNew Password: ',
    '\r\n',
    'Confirm Password: ',
    '\r\n',
    '2026-10-19 14:47:25.026 \u001b[0;32mINFO\u001b[0m File /home/bt/w1/epic-wallet.toml configured and created\r\n',
    'Your recovery phrase is:\r\n\r\n' + PHRASE + '\r\n\r\nPlease back-up these words in a non-digital format.\r\n',
  ], { passwords: 2 });
  assert.deepEqual(r.answers, ['password', 'password']);
  assert.ok(r.done);
  assert.ok(r.lines.includes(PHRASE), 'the new phrase is shown to the user');
  assert.ok(!r.lines.some(l => /Password:/.test(l)));
});

test('init -r: the phrase is answered at its prompt, its echo is left out, then the passwords', () => {
  const isSecret = (line) => line.split(/\s+/).join(' ').includes(PHRASE);
  const r = run([
    'Please enter your recovery phrase:\r\n',
    '\u001b[?2004h',
    '\u001b[?2026h\r\u001b[Kphrase> \r\u001b[8C\u001b[?2026l',
    'must warfare k',
    'nock circle mother rigid radio divert jar keen arrive rival broccoli minute skin feed winter baby ma',
    'ple chest bird grain child birth\u001b[?2004l\r\n',
    'Please provide a new password for the recovered wallet\r\nNew Password: ',
    '\r\n',
    'Confirm Password: ',
    '\r\n',
    'Your recovery phrase is:\r\n\r\n' + PHRASE + '\r\n\r\nPlease back-up these words in a non-digital format.\r\n',
    "2026-10-19 14:47:34.116 \u001b[0;32mINFO\u001b[0m Command 'init' completed successfully\r\n",
  ], { passwords: 2, phrase: true, isSecret });
  assert.deepEqual(r.answers, ['phrase', 'password', 'password']);
  assert.equal(r.fail, null);
  assert.ok(!r.lines.some(l => l.includes('must warfare') || l.includes('chest bird')), 'no line has the phrase');
  assert.ok(!r.lines.some(l => /phrase>/.test(l)));
  assert.ok(r.lines.includes("2026-10-19 14:47:34.116 INFO Command 'init' completed successfully"));
});

test('init -r: an invalid phrase stops it, the re-prompt (with the phrase in it) is not passed on', () => {
  const r = run([
    'Please enter your recovery phrase:\r\nphrase> ',
    'foo bar\r\n',
    '\r\nRecovery word phrase is invalid.\r\n\r\nphrase> foo bar',
  ], { passwords: 2, phrase: true });
  assert.deepEqual(r.answers, ['phrase']);
  assert.equal(r.fail, 'invalid_phrase');
  assert.ok(r.lines.includes('Recovery word phrase is invalid.'));
  assert.ok(!r.lines.some(l => l.includes('foo bar')));
});

test('the line after a password answer is dropped only when it is blank or the echo', () => {
  //Windows may print no newline after the hidden input: the next log line stays
  const r = run(['Password: ', '2026-10-19 WARN HTTP Foreign listener started.\r\n'], { passwords: 1 });
  assert.deepEqual(r.lines, ['2026-10-19 WARN HTTP Foreign listener started.']);
  //an echo of the answer (isSecret) is dropped
  const e = run(['Password: ', 'hunter22\r\n', 'next\r\n'], { passwords: 1, isSecret: (l) => l.trim() === 'hunter22' });
  assert.deepEqual(e.lines, ['next']);
});

test('ConPTY: a prompt followed by cursor moves (a line of its own) is still answered', () => {
  const r = run(['\u001b[?25l\u001b[2J\u001b[m\u001b[HINFO Node is synced, proceeding...\r\nPassword: \u001b[3;1H\u001b[?25h', '\r\nWARN HTTP Foreign listener started.\r\n'], { passwords: 1 });
  assert.deepEqual(r.answers, ['password']);
  assert.ok(r.lines.includes('WARN HTTP Foreign listener started.'));
  assert.ok(!r.lines.some(l => /Password/.test(l)));
  //the phrase prompt as a whole line, its echo on the next one
  const isSecret = (l) => l.trim() === 'foo bar baz';
  const p = run(['Please enter your recovery phrase:\r\nphrase> \u001b[5;1H', 'foo bar baz\r\n', 'New Password: '], { passwords: 2, phrase: true, isSecret });
  assert.deepEqual(p.answers, ['phrase', 'password']);
  assert.ok(!p.lines.some(l => l.includes('foo bar')));
});
