'use strict'

//run: npm test (node --test, no extra dependencies)
const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { migrateUserData, MARKER } = require('../src/userDataMigration')

const quiet = { info() {}, error() {} }
let root, oldDir, newDir

function write(file, content = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

//what a 5.3.1 profile looks like on disk
function seedOld() {
  write(path.join(oldDir, 'IndexedDB/app_._0.indexeddb.leveldb/000003.log'), 'contacts')
  write(path.join(oldDir, 'IndexedDB/app_._0.indexeddb.leveldb/CURRENT'), 'MANIFEST-000001\n')
  write(path.join(oldDir, 'Local Storage/leveldb/000003.log'), 'ls')
  write(path.join(oldDir, 'Preferences'), '{"old":true}')
  write(path.join(oldDir, 'Cache/Cache_Data/index'), 'cache')
  write(path.join(oldDir, 'Code Cache/js/index'), 'cache')
  write(path.join(oldDir, 'GPUCache/data_0'), 'cache')
  write(path.join(oldDir, 'Crashpad/settings.dat'), 'crash')
  write(path.join(oldDir, 'logs/main.log'), 'old log')
  write(path.join(oldDir, 'DevToolsActivePort'), '9333')
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'udm-'))
  oldDir = path.join(root, 'EpicWallet')
  newDir = path.join(root, 'epic-desktop-wallet')
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

test('copies the old profile, skips caches, keeps the old dir, writes the marker', () => {
  seedOld()
  assert.equal(migrateUserData({ oldDir, newDir, log: quiet }), 'migrated')

  assert.equal(fs.readFileSync(path.join(newDir, 'IndexedDB/app_._0.indexeddb.leveldb/000003.log'), 'utf8'), 'contacts')
  assert.ok(fs.existsSync(path.join(newDir, 'Local Storage/leveldb/000003.log')))
  assert.ok(fs.existsSync(path.join(newDir, 'Preferences')))
  for (const skipped of ['Cache', 'Code Cache', 'GPUCache', 'Crashpad', 'logs', 'DevToolsActivePort']) {
    assert.ok(!fs.existsSync(path.join(newDir, skipped)), skipped + ' should not be copied')
  }
  assert.ok(fs.existsSync(path.join(newDir, MARKER)))
  assert.ok(!fs.existsSync(newDir + '.migrating'), 'staging dir removed')
  //the old dir is untouched
  assert.ok(fs.existsSync(path.join(oldDir, 'IndexedDB/app_._0.indexeddb.leveldb/000003.log')))
  assert.ok(fs.existsSync(path.join(oldDir, 'Cache/Cache_Data/index')))
})

test('runs once: with the marker present a second run changes nothing', () => {
  seedOld()
  assert.equal(migrateUserData({ oldDir, newDir, log: quiet }), 'migrated')
  write(path.join(newDir, 'IndexedDB/app_._0.indexeddb.leveldb/000003.log'), 'edited in 6.x')
  fs.rmSync(path.join(newDir, 'Local Storage'), { recursive: true })
  assert.equal(migrateUserData({ oldDir, newDir, log: quiet }), 'already-done')
  assert.equal(fs.readFileSync(path.join(newDir, 'IndexedDB/app_._0.indexeddb.leveldb/000003.log'), 'utf8'), 'edited in 6.x')
  assert.ok(!fs.existsSync(path.join(newDir, 'Local Storage')))
})

test('never overwrites a new dir that already has IndexedDB data', () => {
  seedOld()
  write(path.join(newDir, 'IndexedDB/app_._0.indexeddb.leveldb/000003.log'), 'new data')
  assert.equal(migrateUserData({ oldDir, newDir, log: quiet }), 'new-dir-in-use')
  assert.equal(fs.readFileSync(path.join(newDir, 'IndexedDB/app_._0.indexeddb.leveldb/000003.log'), 'utf8'), 'new data')
  assert.ok(!fs.existsSync(path.join(newDir, 'Preferences')))
  assert.ok(fs.existsSync(path.join(newDir, MARKER)))
})

test('never overwrites a new dir that already has Local Storage data', () => {
  seedOld()
  write(path.join(newDir, 'Local Storage/leveldb/000005.log'), 'new ls')
  assert.equal(migrateUserData({ oldDir, newDir, log: quiet }), 'new-dir-in-use')
  assert.ok(!fs.existsSync(path.join(newDir, 'IndexedDB')))
})

test('migrates into a new dir that holds only what a fresh start creates, keeping its files', () => {
  seedOld()
  write(path.join(newDir, 'logs/main.log'), 'new log')
  write(path.join(newDir, 'Preferences'), '{"new":true}')
  fs.mkdirSync(path.join(newDir, 'IndexedDB'), { recursive: true }) //empty dir is not data
  assert.equal(migrateUserData({ oldDir, newDir, log: quiet }), 'migrated')
  assert.equal(fs.readFileSync(path.join(newDir, 'Preferences'), 'utf8'), '{"new":true}')
  assert.equal(fs.readFileSync(path.join(newDir, 'logs/main.log'), 'utf8'), 'new log')
  assert.equal(fs.readFileSync(path.join(newDir, 'IndexedDB/app_._0.indexeddb.leveldb/000003.log'), 'utf8'), 'contacts')
})

test('does nothing without an old dir, and writes no marker so a later 5.x profile still migrates', () => {
  assert.equal(migrateUserData({ oldDir, newDir, log: quiet }), 'no-old-dir')
  assert.ok(!fs.existsSync(newDir))
})

test('does nothing when old and new are the same dir', () => {
  seedOld()
  assert.equal(migrateUserData({ oldDir, newDir: oldDir, log: quiet }), 'same-dir')
  assert.ok(!fs.existsSync(path.join(oldDir, MARKER)))
})

test('skips symlinks such as SingletonLock', { skip: process.platform === 'win32' }, () => {
  seedOld()
  fs.symlinkSync('host-1234', path.join(oldDir, 'SingletonLock'))
  fs.symlinkSync(path.join(oldDir, 'Preferences'), path.join(oldDir, 'link-to-prefs'))
  assert.equal(migrateUserData({ oldDir, newDir, log: quiet }), 'migrated')
  assert.throws(() => fs.lstatSync(path.join(newDir, 'SingletonLock')))
  assert.throws(() => fs.lstatSync(path.join(newDir, 'link-to-prefs')))
})

test('a failing copy is logged, leaves no partial profile or marker, and does not throw', { skip: process.platform === 'win32' || process.getuid() === 0 }, () => {
  seedOld()
  const locked = path.join(oldDir, 'IndexedDB/app_._0.indexeddb.leveldb/CURRENT')
  fs.chmodSync(locked, 0o000)
  const errors = []
  try {
    const r = migrateUserData({ oldDir, newDir, log: { info() {}, error: (m) => errors.push(m) } })
    assert.equal(r, 'error')
  } finally {
    fs.chmodSync(locked, 0o644)
  }
  assert.equal(errors.length, 1)
  assert.ok(!fs.existsSync(path.join(newDir, 'IndexedDB')))
  assert.ok(!fs.existsSync(path.join(newDir, MARKER)))
  assert.ok(!fs.existsSync(newDir + '.migrating'))
  //and the next start tries again
  assert.equal(migrateUserData({ oldDir, newDir, log: quiet }), 'migrated')
})
