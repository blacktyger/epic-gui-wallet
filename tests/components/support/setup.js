/*
 * Runs before every component spec: modules that need Electron or the real app (store, router,
 * theme settings) are replaced, the preload's window.* APIs are fresh fakes for each test, and
 * whatever a test mounted is unmounted after it.
 */
import { vi, beforeEach, afterEach } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import useFormValidation from '@/modules/useFormValidation';
import { i18n } from '@/i18n';
import { installWindowFakes } from './windowFakes.js';

vi.mock('@/store', () => import('./fakeStore.js'));

vi.mock('@/router', () => ({
  default: { push: () => {} },
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

//theme.js reads the app's settings file through the preload at call time: fixed values here
vi.mock('@/shared/theme', () => ({
  UI_MODERN: 'modern',
  UI_CLASSIC: 'classic',
  SCALES: [90, 100, 110, 125, 150],
  getUi: () => 'classic',
  getScheme: () => 'dark',
  getScale: () => 100,
  saveUi: () => true,
  saveScheme: () => true,
  saveScale: () => true,
  resetNotice: () => {},
  applyTheme: () => {},
  applyScale: () => {},
}));

//module-level `const fs = window.nodeFs` in some components needs these before the first import
installWindowFakes();

enableAutoUnmount(afterEach);

beforeEach(() => {
  installWindowFakes();
  i18n.global.locale = 'en';
});

afterEach(() => {
  //the form errors live in one module-level object shared by every field
  useFormValidation().resetFormErrors();
  vi.useRealTimers();
});
