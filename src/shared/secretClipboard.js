'use strict';

/*
 * Copy a secret (the recovery phrase) to the clipboard and take it off again. Marked so clipboard
 * managers skip it where the OS supports that; wiped after `ms` (60 s) only if the clipboard still
 * holds it; and on wipe() (lock, logout, quit). Main process only; the Electron clipboard and the
 * timers are injected, so it is unit-tested (tests/secretClipboard.test.js).
 */
const DWORD_0 = () => Buffer.alloc(4);

/* [format, bytes] the OS wants besides the text; written first, the text last so it is never lost */
export function hintFormats(platform) {
  if (platform === 'win32') {
    return [
      ['ExcludeClipboardContentFromMonitorProcessing', Buffer.alloc(1)],
      ['CanIncludeInClipboardHistory', DWORD_0()],
      ['CanUploadToCloudClipboard', DWORD_0()],
    ];
  }
  if (platform === 'linux') return [['x-kde-passwordManagerHint', Buffer.from('secret')]];
  return [];
}

export function createSecretClipboard({ clipboard, platform, setTimer = setTimeout, clearTimer = clearTimeout, ms = 60000 }) {
  let held = null;
  let timer = null;

  function wipe() {
    if (timer) { clearTimer(timer); timer = null; }
    const was = held;
    held = null;
    if (was === null) return false;
    let now = '';
    try { now = clipboard.readText(); } catch (e) { return false; }
    if (now !== was) return false;
    clipboard.clear();
    return true;
  }

  function copy(text) {
    wipe();
    const value = String(text);
    for (const [format, buffer] of hintFormats(platform)) {
      try { clipboard.writeBuffer(format, buffer); } catch (e) { /* the OS may not take it */ }
    }
    clipboard.writeText(value);
    held = value;
    timer = setTimer(wipe, ms);
    if (timer && timer.unref) timer.unref();
    return true;
  }

  return { copy, wipe };
}
