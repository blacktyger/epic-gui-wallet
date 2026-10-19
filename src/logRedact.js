'use strict'

//Keep the wallet password out of the log files. Up to 6.0.x the GUI starts epic-wallet with
//`--pass <password>` and logs the process list it finds (pid, name and the whole command line) when
//it stops old processes, so the password went into ~/.epic/log/<date>.log. 6.1 no longer passes the
//password on the command line; this hook is the safety net for every line that is logged.
//An electron-log hook: it rewrites each message before any transport (file, console) writes it.

const PASS_ARG = /(--pass(?:word)?(?:\s+|=))("[^"]*"|'[^']*'|\S+)/g
const REDACTED = '<redacted>'

function redactString(s) {
  return s.replace(PASS_ARG, (m, flag) => flag + REDACTED)
}

//strings anywhere in a logged value (objects such as find-process results, arrays, errors)
function redactValue(value, depth = 0) {
  if (typeof value === 'string') return redactString(value)
  if (!value || typeof value !== 'object' || depth > 6) return value
  if (value instanceof Error) {
    const e = new Error(redactString(String(value.message)))
    e.name = value.name
    if (value.stack) e.stack = redactString(String(value.stack))
    return e
  }
  if (Array.isArray(value)) {
    //a split command line: ['--pass', '<password>', ...]
    return value.map((v, i) => (i > 0 && /^--pass(word)?$/.test(value[i - 1]) && typeof v === 'string')
      ? REDACTED : redactValue(v, depth + 1))
  }
  const out = {}
  for (const key of Object.keys(value)) {
    out[key] = /^pass(word)?$/i.test(key) ? REDACTED : redactValue(value[key], depth + 1)
  }
  return out
}

function redactHook(message) {
  if (message && Array.isArray(message.data)) {
    return Object.assign({}, message, { data: message.data.map((d) => redactValue(d)) })
  }
  return message
}

//add the hook once to an electron-log instance
function installLogRedaction(log) {
  if (log && Array.isArray(log.hooks) && !log.hooks.includes(redactHook)) {
    log.hooks.push(redactHook)
  }
  return log
}

//the same for plain console output (stdout of the main process: a desktop launcher sends it to the
//journal or ~/.xsession-errors). Patches console.log/info/warn/error/debug once
function installConsoleRedaction(con) {
  if (!con || con.__epicRedacted) return con
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const orig = con[level]
    if (typeof orig !== 'function') continue
    con[level] = function (...args) { return orig.apply(this, args.map((a) => redactValue(a))) }
  }
  Object.defineProperty(con, '__epicRedacted', { value: true })
  return con
}

module.exports = { redactString, redactValue, redactHook, installLogRedaction, installConsoleRedaction, REDACTED }
