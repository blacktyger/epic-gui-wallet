// Every channel the preload invokes has a handler in the main process. A missing one fails only at
// run time, in the renderer ("No handler registered for 'quit'": the settings-error Quit, feedback #31).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const src = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', 'src', f), 'utf8');
const channels = (text, re) => new Set([...text.matchAll(re)].map(m => m[1]));

//the main-process files that register handlers
const MAIN = ['background.js', 'legacyProfile.js', 'shared/sessionIpc.js'];

test('each ipcRenderer.invoke channel in preload.js has an ipcMain.handle in the main process', () => {
  const invoked = channels(src('preload.js'), /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g);
  const handled = new Set(MAIN.flatMap(f => [...channels(src(f), /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g)]));
  assert.ok(invoked.size > 10, 'found the invoked channels');
  assert.ok(invoked.has('quit'), 'the settings-error Quit channel');
  const missing = [...invoked].filter(c => !handled.has(c));
  assert.deepEqual(missing, [], 'invoked but never handled: ' + missing.join(', '));
});
