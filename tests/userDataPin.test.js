'use strict'

//The profile folder (contacts, settings) must never move again: 6.0.0 renamed package.json and every
//5.x user started with an empty address book. run: npm test
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { pinUserDataDir, migrateFromEpicWallet, USERDATA_DIR_NAME } = require('../src/userDataMigration')

const quiet = { info() {}, error() {} }

function fakeApp(appData, name) {
  const paths = { appData, userData: path.join(appData, name) }
  return {
    paths,
    getPath: (k) => paths[k],
    setPath: (k, v) => { paths[k] = v },
  }
}

test('the profile folder name is frozen at epic-desktop-wallet', () => {
  //changing this loses every user's address book and settings: add a migration instead
  assert.equal(USERDATA_DIR_NAME, 'epic-desktop-wallet')
})

test('userData is pinned whatever package.json is called', () => {
  const app = fakeApp('/appdata', 'some-renamed-package')
  assert.equal(pinUserDataDir(app, quiet), path.join('/appdata', 'epic-desktop-wallet'))
  assert.equal(app.paths.userData, path.join('/appdata', 'epic-desktop-wallet'))
})

test('pinning is a no-op for the current name', () => {
  const app = fakeApp('/appdata', 'epic-desktop-wallet')
  const logged = []
  pinUserDataDir(app, { info: (m) => logged.push(m), error() {} })
  assert.equal(app.paths.userData, path.join('/appdata', 'epic-desktop-wallet'))
  assert.equal(logged.length, 0)
})

test('the 5.x migration then copies into the pinned folder', () => {
  const app = fakeApp('/nonexistent-appdata-root', 'renamed')
  pinUserDataDir(app, quiet)
  //no old dir there: the migration looks at <appData>/EpicWallet and targets the pinned dir
  assert.equal(migrateFromEpicWallet(app, quiet), 'no-old-dir')
})

test('a failing app.setPath is logged and does not throw', () => {
  const errors = []
  const app = { getPath: () => { throw new Error('not ready') }, setPath() {} }
  assert.equal(pinUserDataDir(app, { info() {}, error: (m) => errors.push(m) }), null)
  assert.equal(errors.length, 1)
})

test('package.json name still matches, so dev runs and packaged builds agree', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  assert.equal(pkg.name, USERDATA_DIR_NAME)
})

test('background.js pins userData before the migration and before anything else reads it', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8')
  const pin = src.indexOf('pinUserDataDir(app')
  const migrate = src.indexOf('migrateFromEpicWallet(app')
  assert.ok(pin > 0, 'pinUserDataDir(app, ...) is called')
  assert.ok(migrate > pin, 'the migration runs after pinning')
  const firstUserDataUse = src.search(/getPath\(\s*['"]userData['"]\s*\)/)
  assert.ok(firstUserDataUse === -1 || firstUserDataUse > pin, 'nothing reads userData before it is pinned')
  assert.ok(src.indexOf("app.on('ready'") > pin, 'pinned before the app is ready')
})
