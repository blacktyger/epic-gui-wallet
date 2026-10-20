// The version the user sees is the version being built: the window title (public/index.html) and
// Classic's About heading are written by hand, so a release bump of package.json alone left them on
// the previous version (6.1.5 showed "v6.1.4"). `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const { version } = JSON.parse(read('package.json'));

//every "v<major>.<minor>.<patch>" in the files that show it by hand
const shown = (f) => [...read(f).matchAll(/\bv(\d+\.\d+\.\d+)\b/g)].map(m => m[1]);

for (const f of ['public/index.html', 'src/components/About.vue']) {
  test(`${f} shows the package.json version (${version})`, () => {
    const v = shown(f);
    assert.ok(v.length > 0, 'a version is shown in ' + f);
    assert.deepEqual([...new Set(v)], [version]);
  });
}
