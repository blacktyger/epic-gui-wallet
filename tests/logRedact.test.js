'use strict'

//The wallet password must never reach a log file. npm test
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { redactString, redactValue, redactHook, installLogRedaction, REDACTED } = require('../src/logRedact')

const PW = 'S3cret pass'

test('a logged epic-wallet command line loses its password', () => {
  assert.equal(redactString('/x/epic-wallet --pass hunter2 -t /w owner_api'), '/x/epic-wallet --pass <redacted> -t /w owner_api')
  assert.equal(redactString('epic-wallet --pass "' + PW + '" listen'), 'epic-wallet --pass <redacted> listen')
  assert.equal(redactString("epic-wallet --password='" + PW + "' x"), 'epic-wallet --password=<redacted> x')
  assert.equal(redactString('nothing to hide'), 'nothing to hide')
})

test('find-process results, arrays and errors as they are logged when old processes are stopped', () => {
  const proc = { pid: 4242, ppid: 1, name: 'epic-wallet', cmd: '/a/epic-wallet --floonet --pass hunter2 -t /w owner_api', bin: '/a/epic-wallet' }
  const out = redactValue(proc)
  assert.equal(out.cmd, '/a/epic-wallet --floonet --pass <redacted> -t /w owner_api')
  assert.equal(out.pid, 4242)
  assert.equal(proc.cmd.includes('hunter2'), true, 'the original object is not changed')
  assert.deepEqual(redactValue(['--pass', PW, 'listen']), ['--pass', REDACTED, 'listen'])
  assert.equal(redactValue({ password: PW }).password, REDACTED)
  const e = redactValue(new Error('spawn failed: epic-wallet --pass hunter2'))
  assert.ok(e instanceof Error && !e.message.includes('hunter2'))
})

test('the hook rewrites every argument and is installed once', () => {
  const msg = { level: 'info', data: ['process kill all configService', { pid: 1, cmd: 'epic-wallet --pass hunter2 listen' }] }
  const out = redactHook(msg)
  assert.equal(JSON.stringify(out).includes('hunter2'), false)
  const log = { hooks: [] }
  installLogRedaction(log); installLogRedaction(log)
  assert.equal(log.hooks.length, 1)
})

test('with the real electron-log: nothing with the password reaches a transport', () => {
  const log = require('electron-log')
  const seen = []
  const saved = { file: log.transports.file.level, console: log.transports.console.level }
  log.transports.file.level = false
  log.transports.console.level = false
  log.transports.test = (m) => seen.push(m)
  log.transports.test.level = 'silly'
  try {
    installLogRedaction(log)
    log.info('process kill all walletService', { pid: 7, cmd: '/b/epic-wallet --pass ' + PW.split(' ')[0] + ' owner_api' })
  } finally {
    delete log.transports.test
    log.transports.file.level = saved.file
    log.transports.console.level = saved.console
  }
  assert.equal(seen.length, 1)
  assert.equal(JSON.stringify(seen[0].data).includes('S3cret'), false)
})

test('plain console output (main process stdout) is redacted too', () => {
  const out = []
  const con = { log: (...a) => out.push(a), info: (...a) => out.push(a) }
  const { installConsoleRedaction } = require('../src/logRedact')
  installConsoleRedaction(con); installConsoleRedaction(con)
  con.log('process kill all background', { pid: 9, cmd: '/c/epic-wallet --pass hunter2 listen' })
  con.info('epic-wallet --pass hunter2')
  assert.equal(JSON.stringify(out).includes('hunter2'), false)
  assert.equal(out.length, 2)
})
