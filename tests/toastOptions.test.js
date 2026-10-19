// Tests for src/shared/toastOptions.js, toasts always hide by themselves: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toastOptions } from '../src/shared/toastOptions.js';

test('a toast under the pointer does not pause: it hides after its duration', () => {
  assert.equal(toastOptions.pauseOnHover, false);
  assert.equal(typeof toastOptions.duration, 'number');
  assert.ok(toastOptions.duration > 0);
  assert.equal(toastOptions.dismissible, true);
});

test('the toaster is installed with these options', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /app\.use\(Toaster, toastOptions\)/);
});

test('"External Node is online" uses the default duration, like the other success toasts', () => {
  const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
  assert.match(app, /\$toast\.success\(this\.t\("msg\.app\.external_node_online"\)\);/);
});
