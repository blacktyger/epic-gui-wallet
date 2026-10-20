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
 * labels: {lock, quit, menu, source, application, edit, undo, …} (DEFAULT_LABELS) in the app's language (the
 * renderer sends them, English until then)
 */
export const DEFAULT_LABELS = { lock: 'Lock wallet', quit: 'Quit', menu: 'Menu', source: 'Source on GitHub',
  application: 'Application', edit: 'Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste',
  selectAll: 'Select All' };
export const LOCK_ACCELERATOR = 'CmdOrCtrl+L';

const label = (labels, key) => {
  const v = labels && typeof labels[key] === 'string' ? labels[key].trim() : '';
  return v && v.length <= 60 ? v : DEFAULT_LABELS[key];
};

export function menuTemplate({ platform = process.platform, labels = {}, unlocked = false, onLock = () => {}, onQuit = () => {}, onSource = () => {} } = {}) {
  const mac = platform === 'darwin';
  return [
    {
      label: label(labels, 'menu'),
      submenu: [
        ...(mac ? [{ label: 'About Application', selector: 'orderFrontStandardAboutPanel:' }] : []),
        { label: label(labels, 'source'), click: () => onSource() },
        { type: 'separator' },
        { id: 'lock', label: label(labels, 'lock'), accelerator: LOCK_ACCELERATOR, enabled: !!unlocked, click: () => onLock() },
        { id: 'quit', label: label(labels, 'quit'), accelerator: 'CmdOrCtrl+Q', click: () => onQuit() },
      ],
    },
    {
      label: label(labels, 'application'),
      submenu: [
        {
          label: label(labels, 'edit'),
          submenu: [
            { label: label(labels, 'undo'), accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
            { label: label(labels, 'redo'), accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
            { type: 'separator' },
            { label: label(labels, 'cut'), accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
            { label: label(labels, 'copy'), accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
            { label: label(labels, 'paste'), accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
            { label: label(labels, 'selectAll'), accelerator: 'CmdOrCtrl+A', selector: 'selectAll:' },
          ],
        },
      ],
    },
  ];
}

/* what the renderer may report: {unlocked, labels: {the keys of DEFAULT_LABELS}}; anything else is dropped */
export function menuState(data) {
  const d = data && typeof data === 'object' ? data : {};
  const labels = {};
  for (const k of Object.keys(DEFAULT_LABELS)) labels[k] = label(d.labels, k);
  return { unlocked: d.unlocked === true, labels };
}
