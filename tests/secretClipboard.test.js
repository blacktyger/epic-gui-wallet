// Tests for src/shared/secretClipboard.js: copy, wipe after 60 s only if unchanged: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSecretClipboard, hintFormats } from '../src/shared/secretClipboard.js';

function rig(platform = 'linux') {
  const state = { text: '', formats: [], cleared: 0 };
  const clipboard = {
    writeText: (t) => { state.text = t; },
    readText: () => state.text,
    clear: () => { state.text = ''; state.cleared++; },
    writeBuffer: (f, b) => { state.formats.push([f, b]); },
  };
  const timers = [];
  const sc = createSecretClipboard({
    clipboard, platform,
    setTimer: (fn, ms) => { const t = { fn, ms, off: false }; timers.push(t); return t; },
    clearTimer: (t) => { t.off = true; },
  });
  return { state, timers, sc };
}

test('copy writes the text and schedules a wipe in 60 s', () => {
  const { state, timers, sc } = rig();
  sc.copy('a b c');
  assert.equal(state.text, 'a b c');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 60000);
});

test('the timer wipes the clipboard when it still holds the phrase', () => {
  const { state, timers, sc } = rig();
  sc.copy('a b c');
  timers[0].fn();
  assert.equal(state.text, '');
  assert.equal(state.cleared, 1);
});

test('the timer leaves the clipboard alone when something else was copied', () => {
  const { state, timers, sc } = rig();
  sc.copy('a b c');
  state.text = 'something else';
  timers[0].fn();
  assert.equal(state.text, 'something else');
  assert.equal(state.cleared, 0);
});

test('wipe() (lock, quit) clears now, once, and cancels the timer', () => {
  const { state, timers, sc } = rig();
  sc.copy('a b c');
  assert.equal(sc.wipe(), true);
  assert.equal(state.text, '');
  assert.equal(timers[0].off, true);
  assert.equal(sc.wipe(), false);
});

test('wipe() with nothing copied does not touch the clipboard', () => {
  const { state, sc } = rig();
  state.text = 'mine';
  assert.equal(sc.wipe(), false);
  assert.equal(state.text, 'mine');
});

test('a second copy restarts the timer', () => {
  const { timers, sc } = rig();
  sc.copy('a');
  sc.copy('b');
  assert.equal(timers[0].off, true);
  assert.equal(timers.length, 2);
});

test('platform hints: Windows history/cloud formats as DWORD 0, Linux KDE hint, macOS none', () => {
  const win = Object.fromEntries(hintFormats('win32'));
  assert.deepEqual(win.CanIncludeInClipboardHistory, Buffer.alloc(4));
  assert.deepEqual(win.CanUploadToCloudClipboard, Buffer.alloc(4));
  assert.ok('ExcludeClipboardContentFromMonitorProcessing' in win);
  assert.equal(hintFormats('linux')[0][0], 'x-kde-passwordManagerHint');
  assert.equal(hintFormats('linux')[0][1].toString(), 'secret');
  assert.deepEqual(hintFormats('darwin'), []);
});

test('the hint formats are written before the text', () => {
  const { state, sc } = rig('win32');
  sc.copy('x');
  assert.equal(state.formats.length, 3);
  assert.equal(state.text, 'x');
});
