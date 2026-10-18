/*
 * Interface theme.
 *
 *   ui:    'modern' (the redesign, default for new installs and after an upgrade) | 'classic' (the
 *          Bulma interface as it was up to 6.0)
 *   theme: 'dark' (default) | 'light' | 'system', modern only; Classic has only its dark skin
 *
 * Both are app-wide, stored next to account_dirs in the app config file
 * (~/.epic/epic_3-0-0_config.json), so support can change them by hand. A missing key means the
 * default. main.js reads them synchronously before the first render, sets data-ui and data-theme
 * on <html> and loads only that interface's stylesheet (src/ui/classic.js or src/ui/modern.js).
 * Switching the interface therefore needs a reload (reloadUi), the colour scheme does not.
 */
const path = window.nodePath;
const fs = window.nodeFs;

export const UI_MODERN = 'modern';
export const UI_CLASSIC = 'classic';
export const UIS = [UI_MODERN, UI_CLASSIC];
export const SCHEMES = ['dark', 'light', 'system'];
/* interface scale, percent of the base text size; both interfaces size their text in rem */
export const SCALES = [90, 100, 110, 125, 150];
/* the BT Labs Theme's base text is a little larger than Classic's 16 px root (17 px) */
const MODERN_BASE = 1.0625;

function appConfigFile() {
  return path.join(window.config.getUserHomedir(), '.epic', 'epic_3-0-0_config.json');
}

/* the app config as an object; {} when the file doesn't exist yet; null when it exists but can't be
   read or parsed (then nothing is written, so a hand-edited file with a typo never loses its
   account list) */
function loadAppConfig() {
  const file = appConfigFile();
  try {
    if (!fs.existsSync(file)) return {};
  } catch (e) {
    return null;
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(file, { encoding: 'utf8', flag: 'r' }));
    return cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : null;
  } catch (e) {
    return null;
  }
}

function readAppConfig() {
  return loadAppConfig() || {};
}

/* read-modify-write, so keys written by configService (account_dirs) are kept; the in-memory copy
   configService holds is updated too, or its next updateAppConfig() would write the old value back */
function writeAppSetting(key, value, configService) {
  const file = appConfigFile();
  const cfg = loadAppConfig();
  if (!cfg) {
    console.error('theme: the app config file could not be read, not saving', key);
    return false;
  }
  if (!cfg.account_dirs) cfg.account_dirs = [];
  cfg[key] = value;
  try {
    fs.writeFileSync(file, JSON.stringify(cfg), { encoding: 'utf8', flag: 'w' });
  } catch (e) {
    console.error('theme: could not save', key, e && e.message);
    return false;
  }
  if (configService && configService.appConfig) configService.appConfig[key] = value;
  return true;
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
export function saveScale(scale, configService) {
  const v = Number(scale);
  if (!SCALES.includes(v)) return false;
  const ok = writeAppSetting('scale', v, configService);
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
export function saveUi(ui, configService) {
  if (!UIS.includes(ui)) return false;
  return writeAppSetting('ui', ui, configService);
}

/* saves and applies the colour scheme at once (modern only) */
export function saveScheme(scheme, configService) {
  if (!SCHEMES.includes(scheme)) return false;
  const ok = writeAppSetting('theme', scheme, configService);
  applyTheme(document.documentElement.dataset.ui || UI_MODERN, scheme);
  return ok;
}

/* one-time notices of the Modern interface (e.g. 'upgraded', the "this is the new look" note on
   Overview), remembered in the app config as ui_notices: { key: true } */
export function noticeSeen(key) {
  const n = readAppConfig().ui_notices;
  return !!(n && n[key]);
}

export function markNoticeSeen(key, configService) {
  const n = Object.assign({}, readAppConfig().ui_notices, { [key]: true });
  return writeAppSetting('ui_notices', n, configService);
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
export function resetNotice(key, configService) {
  const n = Object.assign({}, readAppConfig().ui_notices);
  delete n[key];
  return writeAppSetting('ui_notices', n, configService);
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
