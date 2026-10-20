/*
 * Settings › Help (Modern): the topics, one file per language (topics_<lang>.js), with
 *   ui        the page's own labels (search, the handshake diagram)
 *   terms     where things are in the app; a topic names one as [[key]]
 *   sections  [{ id, title }] in the order shown
 *   topics    [{ id, section, title, short, body, visual? }] in section order: short is the one-line answer,
 *             body the detail behind the fold (our own HTML). visual 'handshake' shows help/HelpHandshake.vue.
 * Every language has the same ids, sections, terms and visuals in the same order (tests/helpTopics.test.js).
 * The Classic interface keeps its own help texts (help.js, help_<lang>.js).
 */
import en from './topics_en.js';
import bg from './topics_bg.js';
import cz from './topics_cz.js';
import de from './topics_de.js';
import fa from './topics_fa.js';
import hi from './topics_hi.js';
import pl from './topics_pl.js';

export const helpTopics = { en, bg, cz, de, fa, hi, pl };

export function useTopics(language) {
  return helpTopics[language] || helpTopics.en;
}

/* [[key]] → the app's name for a place; an unknown key is left as it is (the test catches it) */
export function resolveTerms(text, terms) {
  return String(text || '').replace(/\[\[([a-z_]+)\]\]/g, (m, k) => (terms && k in terms ? terms[k] : m));
}

/* the topics of a language as the page shows them, [[terms]] filled in */
export function topicsFor(data) {
  return data.topics.map(t => ({
    ...t,
    title: resolveTerms(t.title, data.terms),
    short: resolveTerms(t.short, data.terms),
    body: resolveTerms(t.body, data.terms),
  }));
}
