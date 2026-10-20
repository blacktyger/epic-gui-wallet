import { createI18n } from 'vue-i18n'
import en from './lang/en';
import de from './lang/de';
import fa from './lang/fa';
import bg from './lang/bg';
import cz from './lang/cz';
import hi from './lang/hi';
import pl from './lang/pl';
import { pluralRules } from './shared/plural';

//the languages offered (configService.langs); ru and zh are no longer offered (lang/ru.js, lang/zh.js are kept)
export const messages = {
  bg,
  cz,
  de,
  en,
  fa,
  hi,
  pl,
}

export const i18n = createI18n({
  locale: 'en',
  fallbackLocale: 'en',
  messages,
  //Polish and Czech: one | few | many (shared/plural.js)
  pluralRules,
});
