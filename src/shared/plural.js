/*
 * Plural rules for vue-i18n (src/i18n.js pluralRules). English has two forms ("1 wallet | 2 wallets", or
 * three with a zero form first); Polish and Czech have three: one | few | many, plus the zero form where
 * the English has one. Other languages keep the English rule. Plain ESM (tests/i18n.test.js).
 */

//few: 2-4, 22-24, 32-34 … but not 12-14
export const polishFew = n => n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14);
//few: exactly 2-4
export const czechFew = n => n >= 2 && n <= 4;

/* vue-i18n calls it with the count and the number of forms in the message */
export function slavicRule(few) {
  return (choice, choicesLength) => {
    const n = Math.abs(Number(choice) || 0);
    const zero = choicesLength >= 4;
    if (zero && n === 0) return 0;
    const i = (n === 1 ? 0 : few(n) ? 1 : 2) + (zero ? 1 : 0);
    return Math.min(i, choicesLength - 1);
  };
}

export const pluralRules = {
  pl: slavicRule(polishFew),
  cz: slavicRule(czechFew),
};

/* how many forms a message of the language has where English has `enForms` (1 = no plural) */
export function formsFor(locale, enForms) {
  return pluralRules[locale] && enForms > 1 ? enForms + 1 : enForms;
}
