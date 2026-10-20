// The app menu (feedback #36): Lock wallet right above Quit, Ctrl+L, enabled only while a wallet is
// unlocked, its click the renderer's lock; the labels the renderer may send. `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { menuTemplate, menuState, DEFAULT_LABELS, LOCK_ACCELERATOR } from '../src/shared/appMenu.js';

const items = (tpl) => tpl[0].submenu;

for (const platform of ['win32', 'linux', 'darwin']) {
  test(`${platform}: Lock wallet sits directly above Quit, with Ctrl+L`, () => {
    const list = items(menuTemplate({ platform, unlocked: true }));
    const lock = list.findIndex(i => i.id === 'lock');
    const quit = list.findIndex(i => i.id === 'quit');
    assert.ok(lock >= 0 && quit === lock + 1, 'lock right above quit');
    assert.equal(list[lock].label, 'Lock wallet');
    assert.equal(list[lock].accelerator, LOCK_ACCELERATOR);
    assert.equal(list[lock].accelerator, 'CmdOrCtrl+L');
    assert.equal(list[quit].accelerator, 'CmdOrCtrl+Q');
    assert.equal(list.some(i => i.selector === 'orderFrontStandardAboutPanel:'), platform === 'darwin');
  });
}

test('Lock wallet is enabled only while a wallet is unlocked; its click locks, Quit quits', () => {
  const calls = [];
  const opts = { platform: 'linux', onLock: () => calls.push('lock'), onQuit: () => calls.push('quit'), onSource: () => calls.push('source') };
  assert.equal(items(menuTemplate({ ...opts })).find(i => i.id === 'lock').enabled, false);
  assert.equal(items(menuTemplate({ ...opts, unlocked: 'yes' })).find(i => i.id === 'lock').enabled, true);
  const list = items(menuTemplate({ ...opts, unlocked: true }));
  assert.equal(list.find(i => i.id === 'lock').enabled, true);
  list.find(i => i.id === 'lock').click();
  list.find(i => i.id === 'quit').click();
  list.find(i => i.label === 'Source on GitHub').click();
  assert.deepEqual(calls, ['lock', 'quit', 'source']);
});

test('labels in the app\'s language; empty, long or odd ones fall back to English', () => {
  const list = items(menuTemplate({ platform: 'linux', labels: { lock: 'Zablokuj portfel', quit: 'Zakończ' } }));
  assert.equal(list.find(i => i.id === 'lock').label, 'Zablokuj portfel');
  assert.equal(list.find(i => i.id === 'quit').label, 'Zakończ');
  assert.deepEqual(menuState({ unlocked: true, labels: { lock: '  ', quit: 'x'.repeat(61) } }), { unlocked: true, labels: DEFAULT_LABELS });
  assert.deepEqual(menuState(null), { unlocked: false, labels: DEFAULT_LABELS });
  assert.deepEqual(menuState({ unlocked: 1, labels: { lock: 5 } }), { unlocked: false, labels: DEFAULT_LABELS });
});

test('the main process builds its menu from the template and takes the state only from the app window', () => {
  const bg = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'background.js'), 'utf8');
  assert.match(bg, /Menu\.buildFromTemplate\(menuTemplate\(/);
  assert.equal((bg.match(/Menu\.buildFromTemplate\(/g) || []).length, 1, 'one menu, from shared/appMenu.js');
  assert.match(bg, /ipcMain\.on\('menu-state', \(event, data\) => \{\n\s*if \(!fromAppWindow\(event\)\) return;/);
  assert.match(bg, /webContents\.send\('menu-lock'\)/);
  const pre = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'preload.js'), 'utf8');
  assert.match(pre, /ipcRenderer\.send\('menu-state'/);
  assert.match(pre, /ipcRenderer\.on\('menu-lock'/);
  const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'App.vue'), 'utf8');
  assert.match(app, /window\.api\.onMenuLock\(/);
  assert.match(app, /window\.api\.menuState\(/);
  //a lock under way is not started twice, and the guard always clears (review: a 15 s time window
  //swallowed a real Lock wallet after Switch wallet)
  assert.match(app, /if \(this\.loggedIn && !this\.loggingOut\) this\.emitter\.emit\('app\.logout'\)/);
  assert.match(app, /this\.loggingOut = true;\n\s*try \{\n\s*await this\.closeSession\(opts\);\n\s*\} finally \{\n\s*this\.loggingOut = false;/);
});

test('Help › Get help / Report a problem… opens the support report, locked or not; its labels translate', () => {
  for (const unlocked of [false, true]) {
    const calls = [];
    const tpl = menuTemplate({ platform: 'linux', unlocked, onSupport: () => calls.push('support') });
    const help = tpl.find(m => m.label === 'Help');
    const item = help.submenu.find(i => i.id === 'support');
    assert.equal(item.label, 'Get help / Report a problem…');
    assert.notEqual(item.enabled, false);
    item.click();
    assert.deepEqual(calls, ['support']);
  }
  assert.equal(menuTemplate({ platform: 'darwin' }).find(m => m.label === 'Help').role, 'help');
  const pl = menuTemplate({ platform: 'linux', labels: { help: 'Pomoc', support: 'Pomoc / Zgłoś problem…' } });
  assert.equal(pl.find(m => m.label === 'Pomoc').submenu[0].label, 'Pomoc / Zgłoś problem…');
  assert.deepEqual(menuState({ labels: { help: 'Pomoc', support: 'Zgłoś problem…' } }).labels,
    Object.assign({}, DEFAULT_LABELS, { help: 'Pomoc', support: 'Zgłoś problem…' }));
});
