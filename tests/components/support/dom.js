/*
 * What a user does, for the specs: find a button by its text, type key by key, press Enter.
 */

/* the button whose visible text is (or, with partial, contains) text; throws when there is none */
export function button(wrapper, text, { partial = false } = {}) {
  const found = wrapper.findAll('button').filter((b) => {
    const s = b.text().replace(/\s+/g, ' ').trim();
    return partial ? s.includes(text) : s === text;
  });
  if (!found.length) throw new Error('no button "' + text + '" in: ' + wrapper.text().slice(0, 300));
  return found[0];
}

/* types text into an input one character at a time, as a user would (an input event per key) */
export async function typeKeys(input, text) {
  let value = String(input.element.value || '');
  for (const ch of text) {
    value += ch;
    await input.setValue(value);
  }
}

/*
 * Enter in a form field. happy-dom has no implicit submission, so this does what the HTML spec
 * says a browser does: a keydown Enter at the field and, unless that is cancelled, a click on the
 * form's default button (its first submit button), which then submits the form.
 */
export async function pressEnter(input) {
  const el = input.element;
  const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  if (ev.defaultPrevented || !el.form) return;
  const def = [...el.form.elements].find((e) => e.type === 'submit');
  if (def && !def.disabled) def.click();
}
