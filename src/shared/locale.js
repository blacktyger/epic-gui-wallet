/*
 * <html lang> and dir for the app's language (QA T26): screen readers, hyphenation and fonts follow lang,
 * and Persian is laid out right-to-left. Plain ESM (tests/i18n.test.js).
 */

//the app's codes that are not the standard ones: Czech is 'cs'
const BCP47 = { cz: 'cs' };
const RTL = ['fa'];

/* locale: the app's code ('fa'), or the system's before one is chosen ('fa-IR', 'en-US') */
export function localeAttrs(locale) {
  const l = locale || 'en';
  const base = l.split('-')[0];
  return { lang: BCP47[l] || l, dir: RTL.includes(base) ? 'rtl' : 'ltr' };
}

/* set them on <html> */
export function applyLocale(doc, locale) {
  const { lang, dir } = localeAttrs(locale);
  doc.documentElement.setAttribute('lang', lang);
  doc.documentElement.setAttribute('dir', dir);
}
