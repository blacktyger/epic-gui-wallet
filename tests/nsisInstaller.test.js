'use strict'

//run: npm test (node --test, no extra dependencies)
//Static checks of the custom NSIS include (resources/nsis/installer.nsh). Nothing here can run the
//installer (that needs Windows); these pin what it may delete and when.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const NSH = path.join(__dirname, '..', 'resources', 'nsis', 'installer.nsh')
const src = fs.readFileSync(NSH, 'utf8')
//code only: drop comment lines and trailing comments outside strings (the file has none of the latter)
const code = src.split('\n').filter((l) => !/^\s*[#;]/.test(l)).join('\n')

function macro(name) {
  const m = code.match(new RegExp(`^!macro ${name}\\b[^\\n]*\\n([\\s\\S]*?)^!macroend`, 'm'))
  assert.ok(m, `macro ${name} not found`)
  return m[1]
}

function block(text, start, end) {
  const i = text.indexOf(start)
  assert.ok(i >= 0, `${start} not found`)
  const j = text.indexOf(end, i)
  assert.ok(j > i, `${end} not found after ${start}`)
  return text.slice(i, j + end.length)
}

//every file or folder delete in the file: [command, flags, path]
function deletes(text) {
  const out = []
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(RMDir|Delete)\b\s*((?:\/\w+\s+)*)"([^"]*)"/i)
    if (m) out.push([m[1], m[2].trim(), m[3]])
    else assert.ok(!/^\s*(RMDir|Delete)\b/i.test(line), `unparsed delete: ${line}`)
  }
  return out
}

const EXPECTED_DELETES = [
  ['RMDir', '/r', '$APPDATA\\epic-desktop-wallet'],
  ['RMDir', '/r', '$APPDATA\\EpicWallet'],
  ['RMDir', '/r', '$LOCALAPPDATA\\epic-desktop-wallet-updater'],
  ['RMDir', '/r', '$LOCALAPPDATA\\epicwallet-updater'],
  ['Delete', '', '$PROFILE\\.epic\\epic_3-0-0_config.json'],
  ['Delete', '', '$PROFILE\\.epic\\gui_processes.json'],
  ['Delete', '', '$PROFILE\\.epic\\log\\????_??_*.log'],
  ['RMDir', '', '$PROFILE\\.epic\\log'],
  ['RMDir', '/r', '$PROFILE\\.epic-gui\\app'],
  ['RMDir', '/r', '$PROFILE\\.epic-gui\\logs'],
  ['Delete', '', '$PROFILE\\.epic-gui\\gui_processes.json'],
]

//the only recursive deletes in the profile: GUI 6.1's own Chromium profile and log folder
const EPIC_GUI_RECURSIVE = ['$PROFILE\\.epic-gui\\app', '$PROFILE\\.epic-gui\\logs']

test('the uninstaller option is a separate section, unchecked by default', () => {
  const body = macro('customUnInstallSection')
  const sections = body.match(/^\s*Section\b.*$/gm)
  assert.equal(sections.length, 1)
  assert.match(sections[0], /^\s*Section \/o "un\.Also remove app settings \(wallets are never removed\)"/)
})

test('the option never deletes in a silent or update uninstall', () => {
  const section = block(macro('customUnInstallSection'), 'Section /o', 'SectionEnd')
  //no delete in the section itself: all of it is in the function, reached only through the gate
  assert.deepEqual(deletes(section), [])
  const gate = section.indexOf('${If} $R1 == "1"\n      ${If} ${UAC_IsInnerInstance}')
  assert.ok(gate > 0, 'gate before the delete call not found')
  const before = section.slice(0, gate)
  //$R1 starts at 1 and each guard sets it to 0
  assert.match(before, /StrCpy \$R1 "1"/)
  assert.match(before, /\$\{GetOptions\} \$R0 "\/KEEP_APP_DATA" \$R0\s*\n\s*\$\{IfNot\} \$\{Errors\}\s*\n\s*StrCpy \$R1 "0"/)
  assert.match(before, /\$\{If\} \$\{Silent\}\s*\n\s*\$\{OrIf\} \$\{isUpdated\}\s*\n\s*StrCpy \$R1 "0"/)
  //the confirmation answers No when silent
  assert.match(before, /MessageBox MB_YESNO[^`]*\/SD IDNO IDYES`\s*\n\s*StrCpy \$R1 "0"/)
  //the only way to the deletes is after the gate
  const calls = section.match(/un\.epicRemoveAppSettings/g)
  assert.equal(calls.length, 2)
  assert.equal(before.indexOf('un.epicRemoveAppSettings'), -1)
})

test('the delete list is exactly the app settings, caches and logs', () => {
  assert.deepEqual(deletes(code), EXPECTED_DELETES)
  const fn = block(macro('customUnInstallSection'), 'Function un.epicRemoveAppSettings', 'FunctionEnd')
  assert.deepEqual(deletes(fn), EXPECTED_DELETES)
  //per-user folders even in a per-machine uninstall
  assert.match(fn, /^\s*SetShellVarContext current\s*$/m)
  assert.ok(fn.indexOf('SetShellVarContext current') < fn.indexOf('RMDir'))
})

test('no recursive delete under .epic or of a wallet; 6.1 never-paths kept', () => {
  for (const [cmd, flags, p] of deletes(code)) {
    const lower = p.toLowerCase()
    if (cmd === 'RMDir' && flags.includes('/r') && !EPIC_GUI_RECURSIVE.includes(p)) {
      assert.ok(!lower.includes('.epic'), `recursive delete under .epic: ${p}`)
      assert.ok(!lower.includes('$profile'), `recursive delete in the profile: ${p}`)
      assert.ok(!lower.includes('$instdir'), `recursive delete of the install dir: ${p}`)
      assert.ok(!/[*?]/.test(p), `wildcard in a recursive delete: ${p}`)
    }
    for (const word of ['wallets', 'wallet_data', 'chain_data', 'seed', '\\main', '\\floo', '\\user']) {
      assert.ok(!lower.includes(word), `${p} contains ${word}`)
    }
    //6.1's root (%USERPROFILE%\.epic-gui): only app, logs and gui_processes.json (6.1 branch), never
    //its wallets, chain data, wallet list or location file, never the root itself
    if (lower.includes('.epic-gui')) {
      assert.ok(epicGuiPathAllowed(p), `${p} is a 6.1 path that must never be deleted`)
    }
    //every delete is anchored in a per-user folder, never a bare or relative path
    assert.match(p, /^\$(APPDATA|LOCALAPPDATA|PROFILE)\\/)
  }
  //in .epic (the old GUIs' and the CLI's folder) only files, plus the log folder without /r
  const inEpic = deletes(code).filter(([, , p]) => p.includes('.epic\\'))
  assert.deepEqual(inEpic.filter(([cmd]) => cmd === 'RMDir'), [['RMDir', '', '$PROFILE\\.epic\\log']])
  //in .epic-gui exactly the 6.1 app profile and logs recursively, and the process record
  const inEpicGui = deletes(code).filter(([, , p]) => p.toLowerCase().includes('.epic-gui'))
  assert.deepEqual(inEpicGui.map(([, , p]) => p), [...EPIC_GUI_RECURSIVE, '$PROFILE\\.epic-gui\\gui_processes.json'])
  //each base folder is checked for empty before use (an empty $APPDATA would mean the drive root)
  const fn = block(code, 'Function un.epicRemoveAppSettings', 'FunctionEnd')
  for (const base of ['APPDATA', 'LOCALAPPDATA', 'PROFILE']) {
    assert.match(fn, new RegExp(`\\$\\{If\\} \\$${base} != ""`))
  }
})

//UUID v5 (RFC 4122), written out so the test doesn't trust the library it checks against
function uuidV5(name, namespace) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const h = crypto.createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}
//app-builder-lib NsisTarget: UUID.v5(appId, ELECTRON_BUILDER_NS_UUID), the same in 22.14.13 (3.0.1) and 26.x
const ELECTRON_BUILDER_NS_UUID = '50e065bc-3134-11e6-9bab-38c9862bdaf3'

test('the 3.0.1 GUID is electron-builder\'s GUID for appId "epic.tech"', () => {
  const m = code.match(/^!define EPIC_OLD_APPID_GUID "([0-9a-f-]+)"/m)
  assert.ok(m)
  assert.equal(m[1], uuidV5('epic.tech', ELECTRON_BUILDER_NS_UUID))
  assert.equal(m[1], '2fde87fb-9fe9-5ca6-bb40-4478d1e6f36e')
  //same answer from electron-builder's own implementation
  const { UUID } = require('builder-util-runtime')
  assert.equal(m[1], UUID.v5('epic.tech', UUID.parse(ELECTRON_BUILDER_NS_UUID)))
  //and it is not this app's GUID
  const appId = require('../vue.config.js').pluginOptions.electronBuilder.builderOptions.appId
  assert.notEqual(m[1], uuidV5(appId, ELECTRON_BUILDER_NS_UUID))
  assert.match(code, /^!if "\$\{APP_GUID\}" == "\$\{EPIC_OLD_APPID_GUID\}"\s*\n\s*!error/m)
})

test('the 3.0.1 cleanup only removes its registry entries and never runs its uninstaller', () => {
  const body = macro('epicRemoveOldAppIdEntry')
  assert.deepEqual(deletes(body), [])
  assert.ok(!/\b(Exec|ExecWait|ExecShell|ExecShellWait|nsExec::|CopyFiles|Rename)\b/i.test(body), 'runs or moves something')
  const keys = body.match(/^\s*DeleteRegKey\b.*$/gm).map((l) => l.trim())
  assert.deepEqual(keys, [
    'DeleteRegKey ${ROOT} "${EPIC_OLD_UNINSTALL_KEY}"',
    'DeleteRegKey ${ROOT} "${EPIC_OLD_INSTALL_KEY}"',
  ])
  assert.ok(!/DeleteRegValue|WriteReg/.test(body))
  assert.match(code, /^!define EPIC_OLD_UNINSTALL_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\\$\{EPIC_OLD_APPID_GUID\}"$/m)
  assert.match(code, /^!define EPIC_OLD_INSTALL_KEY "Software\\\$\{EPIC_OLD_APPID_GUID\}"$/m)
  //both registry roots, from the install section
  assert.deepEqual(macro('customInstall').trim().split('\n').map((l) => l.trim()), [
    '!insertmacro epicRemoveOldAppIdEntry HKEY_CURRENT_USER',
    '!insertmacro epicRemoveOldAppIdEntry HKEY_LOCAL_MACHINE',
  ])
  //nothing else in the file touches the registry
  assert.equal((code.match(/DeleteRegKey|DeleteRegValue|WriteReg/g) || []).length, 2)
})

test('the include is wired into the build and lives outside the build output', () => {
  const nsis = require('../vue.config.js').pluginOptions.electronBuilder.builderOptions.nsis
  assert.equal(nsis.include, 'resources/nsis/installer.nsh')
  assert.equal(nsis.oneClick, false)
  assert.equal(path.resolve(__dirname, '..', nsis.include), NSH)
})

//a path under 6.1's root that the uninstaller option may delete: exactly app, logs or gui_processes.json
function epicGuiPathAllowed(p) {
  const lower = p.toLowerCase()
  const rest = lower.slice(lower.indexOf('.epic-gui') + '.epic-gui'.length).replace(/^\\/, '')
  return !/[*?]/.test(p) && /^(app|logs|gui_processes\.json)$/.test(rest)
}

test('the 6.1 never-paths rule rejects what it must', () => {
  for (const bad of ['$PROFILE\\.epic-gui', '$PROFILE\\.epic-gui\\', '$PROFILE\\.epic-gui\\wallets', '$PROFILE\\.epic-gui\\wallets\\alpha',
    '$PROFILE\\.epic-gui\\node', '$PROFILE\\.epic-gui\\settings.json', '$PROFILE\\.epic-gui\\settings.json.bak',
    '$PROFILE\\.epic-gui\\location.json', '$PROFILE\\.epic-gui\\app\\..\\wallets', '$PROFILE\\.epic-gui\\*']) {
    assert.equal(epicGuiPathAllowed(bad), false, bad)
  }
  for (const good of ['$PROFILE\\.epic-gui\\app', '$PROFILE\\.epic-gui\\logs', '$PROFILE\\.epic-gui\\gui_processes.json']) {
    assert.equal(epicGuiPathAllowed(good), true, good)
  }
})
