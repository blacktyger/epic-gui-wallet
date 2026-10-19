/*
 * Reading epic-wallet's output on a pseudo-terminal and answering its prompts (used by
 * shared/ptyHost.js in the main process). Plain ESM without app imports, so it runs under
 * `node --test` (tests/ptyPrompt.test.js). It never sees a secret: it says which answer is due
 * ('password', 'phrase') and the host writes it.
 *
 * epic-wallet 4.1.0 asks for a missing password on its terminal only (rpassword: /dev/tty, CONIN$):
 *   listen (http, epicbox):  "Password: "
 *   init:                    "New Password: ", "Confirm Password: "
 *   init -r:                 "Please enter your recovery phrase:" / "phrase> ", then the two above
 * The password is not echoed; the recovery phrase is (its line editor), so that line is dropped.
 * On a terminal the output has colours and cursor codes and \r\n: they are removed, so the lines
 * read the same as on a pipe.
 */

/* eslint-disable no-control-regex -- terminal escape codes are control characters */

//a password prompt at the end of the output (no newline after it yet)
const PASSWORD_PROMPT = /(?:^|\s)(?:New |Confirm )?Password:\s*$/;
const PHRASE_REQUEST = 'Please enter your recovery phrase';
const PHRASE_PROMPT = /phrase>\s*$/;
export const PHRASE_INVALID = 'Recovery word phrase is invalid.';

/* a whole line that is only a prompt */
function isPromptLine(line) {
  const t = line.trim();
  return /^(?:New |Confirm )?Password:$/.test(t) || /^phrase>/.test(t);
}

/*
 * Terminal output → plain text: OSC (window title) and other escape sequences removed, cursor
 * forward (ConPTY writes it for runs of spaces) as spaces, cursor positioning as a line break,
 * \r dropped. Text split inside an escape sequence: the caller keeps the unfinished end (rest).
 */
export function cleanPtyText(input) {
  let s = String(input == null ? '' : input);
  let rest = '';
  //an escape sequence cut off at the end of this chunk: kept for the next one
  const cut = s.match(/\x1b(?:\][^\x07\x1b]*(?:\x1b)?|\[[0-9;?]*|[()#][0-9A-Za-z]?)?$/);
  if (cut && cut[0]) {
    rest = cut[0];
    s = s.slice(0, s.length - rest.length);
  }
  s = s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[(\d*)C/g, (m, n) => ' '.repeat(Math.min(Number(n || 1), 500)))
    .replace(/\x1b\[\d*(?:;\d*)?[Hf]/g, '\n')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()#][0-9A-Za-z]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/[\x07\x08\x00]/g, '')
    .replace(/\r/g, '');
  return { text: s, rest };
}

/*
 * One process's output, fed in chunks as it comes:
 *   passwords: how many password prompts to answer (listen 1, init 2; 0: none expected)
 *   phrase:    answer the recovery phrase prompt (init -r)
 *   isSecret(line): the host's check for a line that holds what it wrote (an echo)
 * feed(chunk) → {lines, answers, fail}: the complete lines to pass on (prompts and echoes left
 * out), the answers due now in order, and why to stop the process ('invalid_phrase', or
 * 'unexpected_prompt': asked again after the answers were given, which would wait forever).
 * end() → {lines}: what is left once the process ended.
 */
export function createPromptAnswerer({ passwords = 0, phrase = false, isSecret = () => false } = {}) {
  let tail = '';
  let esc = '';
  let passwordsGiven = 0;
  let phraseAsked = false;
  let phraseGiven = false;
  //the line after an answer: its echo (the phrase) or the bare newline
  let afterAnswer = false;
  //the phrase was written: its echo follows on the prompt's line, no prompt is read there
  let echoing = false;
  let failed = null;

  function keep(line, out) {
    if (afterAnswer) {
      afterAnswer = false;
      if (!line.trim() || isSecret(line) || isPromptLine(line)) return;
    }
    if (isPromptLine(line) || isSecret(line)) return;
    if (phrase && line.includes(PHRASE_REQUEST)) phraseAsked = true;
    out.lines.push(line);
    if (phrase && line.includes(PHRASE_INVALID)) out.fail = failed = 'invalid_phrase';
  }

  //a prompt at `text` (the unfinished last line, or a whole line when the terminal moved the
  //cursor after it, as ConPTY may): answer it, or say why to stop. true when it was a prompt
  function prompt(text, out) {
    if (PASSWORD_PROMPT.test(text)) {
      if (passwordsGiven < passwords) {
        passwordsGiven++;
        out.answers.push('password');
        afterAnswer = true;
      } else {
        out.fail = failed = 'unexpected_prompt';
      }
      return true;
    }
    if (phrase && phraseAsked && PHRASE_PROMPT.test(text)) {
      if (!phraseGiven) {
        phraseGiven = true;
        out.answers.push('phrase');
        //the phrase is echoed after the prompt: that line is dropped
        afterAnswer = true;
      } else {
        //asked again: the phrase was not accepted
        out.fail = failed = 'invalid_phrase';
      }
      return true;
    }
    return false;
  }

  function feed(chunk) {
    const out = { lines: [], answers: [], fail: null };
    if (failed) return out;
    const c = cleanPtyText(esc + String(chunk == null ? '' : chunk));
    esc = c.rest;
    tail += c.text;
    let nl;
    while (!failed && (nl = tail.indexOf('\n')) >= 0) {
      const line = tail.slice(0, nl);
      tail = tail.slice(nl + 1);
      if (echoing) {
        //the end of the line the phrase was echoed on
        echoing = false;
        continue;
      }
      if (prompt(line, out)) continue;
      keep(line, out);
    }
    if (failed) {
      tail = '';
      return out;
    }
    //the rest of the echoed phrase comes with the next chunks: no prompt is read there
    if (!echoing && prompt(tail, out)) {
      if (!failed && out.answers[out.answers.length - 1] === 'phrase') {
        echoing = true;
        afterAnswer = false;
      }
      tail = '';
    }
    if (failed) tail = '';
    return out;
  }

  function end() {
    const out = { lines: [], answers: [], fail: null };
    if (!failed && tail) keep(tail, out);
    tail = '';
    return { lines: out.lines };
  }

  return {
    feed,
    end,
    /* all answers given: nothing more will be written */
    get done() { return passwordsGiven >= passwords && (!phrase || phraseGiven); },
  };
}
