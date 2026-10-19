/*
 * Interface theme.
 *
 *   ui:    'modern' (the redesign, default for new installs and after an upgrade) | 'classic' (the
 *          Bulma interface as it was up to 6.0)
 *   theme: 'dark' (default) | 'light' | 'system', modern only; Classic has only its dark skin
 *
 * Both are app-wide, in the app section of GUI 6.1's settings file (<root>/settings.json, see
 * shared/settingsStore.js), so support can change them by hand. A missing key means the default.
 * main.js reads them synchronously before the first render, sets data-ui and data-theme on <html>
 * and loads only that interface's stylesheet (src/ui/classic.js or src/ui/modern.js). Switching the
 * interface therefore needs a reload (reloadUi), the colour scheme does not.
 *
 * The settings store is the one configService uses (sharedSettings), so neither writes the other's
 * old values back. The configService arguments below are kept for the callers and not needed.
 */
import { sharedSettings } from './configService.js';

export const UI_MODERN = 'modern';
export const UI_CLASSIC = 'classic';
export const UIS = [UI_MODERN, UI_CLASSIC];
export const SCHEMES = ['dark', 'light', 'system'];
/* interface scale, percent of the base text size; both interfaces size their text in rem */
export const SCALES = [90, 100, 110, 125, 150];
/* the BT Labs Theme's base text is a little larger than Classic's 16 px root (17 px) */
const MODERN_BASE = 1.0625;

function readAppConfig() {
  return sharedSettings().app();
}

/* false when the settings file can't be read (then nothing is written, see settingsStore) */
function writeAppSetting(key, value) {
  const ok = sharedSettings().setApp({ [key]: value });
  if (!ok) console.error('theme: the settings file could not be read, not saving', key);
  return ok;
}

export function getUi() {
  const v = readAppConfig().ui;
  return UIS.includes(v) ? v : UI_MODERN;
}

export function getScheme() {
  const v = readAppConfig().theme;
  return SCHEMES.includes(v) ? v : 'dark';
}

export function getScale() {
  const v = Number(readAppConfig().scale);
  return SCALES.includes(v) ? v : 100;
}

/* the root font size for an interface and scale: everything in rem follows it */
export function applyScale(scale, ui) {
  const html = document.documentElement;
  const u = ui || html.dataset.ui || UI_MODERN;
  const pct = (SCALES.includes(scale) ? scale : 100) * (u === UI_MODERN ? MODERN_BASE : 1);
  html.style.fontSize = Math.round(pct * 100) / 100 + '%';
  html.dataset.scale = String(scale);
}

/* saves and applies the interface scale at once */
export function saveScale(scale) {
  const v = Number(scale);
  if (!SCALES.includes(v)) return false;
  const ok = writeAppSetting('scale', v);
  applyScale(v);
  return ok;
}

export function resolvedScheme(scheme) {
  if (scheme !== 'system') return scheme;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/* data-ui and data-theme on <html>. Classic keeps its own html.is-dark-mode-active class (App.vue). */
export function applyTheme(ui, scheme) {
  const html = document.documentElement;
  html.dataset.ui = ui;
  html.dataset.theme = ui === UI_MODERN ? resolvedScheme(scheme) : 'dark';
}

/* saves the interface; it takes effect on reloadUi() */
export function saveUi(ui) {
  if (!UIS.includes(ui)) return false;
  return writeAppSetting('ui', ui);
}

/* saves and applies the colour scheme at once (modern only) */
export function saveScheme(scheme) {
  if (!SCHEMES.includes(scheme)) return false;
  const ok = writeAppSetting('theme', scheme);
  applyTheme(document.documentElement.dataset.ui || UI_MODERN, scheme);
  return ok;
}

/* one-time notices of the Modern interface (e.g. 'upgraded', the "this is the new look" note on
   Overview), remembered in the app settings as ui_notices: { key: true } */
export function noticeSeen(key) {
  const n = readAppConfig().ui_notices;
  return !!(n && n[key]);
}

export function markNoticeSeen(key) {
  const n = Object.assign({}, readAppConfig().ui_notices, { [key]: true });
  return writeAppSetting('ui_notices', n);
}

/* a restart into another interface in progress: remembered over the reload (sessionStorage
   survives loadURL in the same window) so the new interface can finish the overlay */
const RESTART_KEY = 'epic.uiRestart';
export function markRestart(ui) {
  try { window.sessionStorage.setItem(RESTART_KEY, ui); } catch (e) { /* the overlay just ends */ }
}
export function takeRestart() {
  try {
    const v = window.sessionStorage.getItem(RESTART_KEY);
    window.sessionStorage.removeItem(RESTART_KEY);
    return v;
  } catch (e) {
    return null;
  }
}

/* forget a one-time notice, so it shows again (Settings › Show the tour again) */
export function resetNotice(key) {
  const n = Object.assign({}, readAppConfig().ui_notices);
  delete n[key];
  return writeAppSetting('ui_notices', n);
}

/* reload the renderer at index.html (a history-mode reload of the current path would 404 under
   app://). The caller logs out first, so no wallet process is left behind. */
export function reloadUi() {
  if (window.api && window.api.reloadUi) window.api.reloadUi();
  else window.location.assign('/');
}

/* follow the OS while the scheme is 'system' */
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const onChange = () => {
    const html = document.documentElement;
    if (html.dataset.ui === UI_MODERN && getScheme() === 'system') applyTheme(UI_MODERN, 'system');
  };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
}
