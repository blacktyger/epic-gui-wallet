'use strict';

/*
 * A recovery phrase as typed or pasted, split into words: one line with spaces, one word per
 * line, or separated by commas or semicolons. Numbering like "1." "2)" "3:" is dropped, and so is
 * anything that isn't a letter; words come out in lower case.
 */
export function splitPhrase(text) {
  return String(text || '').toLowerCase().split(/[\s,;]+/)
    .map(w => w.replace(/^\d+[.):]?$/, '').replace(/[^a-z]/g, ''))
    .filter(w => w != '');
}
