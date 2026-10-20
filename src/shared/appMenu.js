/*
 * The app menu (background.js, packaged builds only): Menu › Lock wallet above Quit (feedback #36),
 * and Application › Edit. Plain ESM, no electron: the caller passes the actions and builds the menu
 * from the template (tests/appMenu.test.js).
 *
 * Lock wallet does what the Lock button and Ctrl+L do (the renderer's app.logout): main sends
 * 'menu-lock' to the window. It is enabled only while a wallet is unlocked (the renderer reports it
 * with 'menu-state'), so a disabled item's Ctrl+L does nothing on the Welcome or Unlock screen.
 * Ctrl+L in the page and in the menu may both arrive; logging out twice is harmless (App.logoutApp).
 *
 * Help › Get help / Report a problem… opens the support report (docs/support/DESIGN.md) wherever the
 * user is, locked or not: main sends 'open-support' to the window. Nothing is sent from the menu.
 *
 * labels: {lock, quit, help, support} in the app's language (the renderer sends them, English until then)
 */
export const DEFAULT_LABELS = { lock: 'Lock wallet', quit: 'Quit', help: 'Help', support: 'Get help / Report a problem…' };
export const LOCK_ACCELERATOR = 'CmdOrCtrl+L';

const label = (labels, key) => {
  const v = labels && typeof labels[key] === 'string' ? labels[key].trim() : '';
  return v && v.length <= 60 ? v : DEFAULT_LABELS[key];
};

export function menuTemplate({ platform = process.platform, labels = {}, unlocked = false, onLock = () => {}, onQuit = () => {}, onSource = () => {}, onSupport = () => {} } = {}) {
  const mac = platform === 'darwin';
  return [
    {
      label: 'Menu',
      submenu: [
        ...(mac ? [{ label: 'About Application', selector: 'orderFrontStandardAboutPanel:' }] : []),
        { label: 'Source on GitHub', click: () => onSource() },
        { type: 'separator' },
        { id: 'lock', label: label(labels, 'lock'), accelerator: LOCK_ACCELERATOR, enabled: !!unlocked, click: () => onLock() },
        { id: 'quit', label: label(labels, 'quit'), accelerator: 'CmdOrCtrl+Q', click: () => onQuit() },
      ],
    },
    {
      label: 'Application',
      submenu: [
        {
          label: 'Edit',
          submenu: [
            { label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
            { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
            { type: 'separator' },
            { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
            { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
            { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
            { label: 'Select All', accelerator: 'CmdOrCtrl+A', selector: 'selectAll:' },
          ],
        },
      ],
    },
    {
      label: label(labels, 'help'),
      ...(mac ? { role: 'help' } : {}),
      submenu: [
        { id: 'support', label: label(labels, 'support'), click: () => onSupport() },
      ],
    },
  ];
}

/* what the renderer may report: {unlocked, labels: {lock, quit, help, support}}; anything else is dropped */
export function menuState(data) {
  const d = data && typeof data === 'object' ? data : {};
  const labels = {};
  for (const k of Object.keys(DEFAULT_LABELS)) labels[k] = label(d.labels, k);
  return { unlocked: d.unlocked === true, labels };
}
