/*
 * The Modern form fields (TextField, PasswordField) render a bare <input> without an id, so a
 * <label for> cannot point at it. A wrapper marked data-input-id="x" gets that id on its first
 * input after each render; the label then uses for="x".
 */
function apply(root) {
  (root || document).querySelectorAll('[data-input-id]').forEach(wrap => {
    const input = wrap.querySelector('input, textarea');
    if (input && input.id !== wrap.dataset.inputId) input.id = wrap.dataset.inputId;
  });
}

export const inputIds = {
  mounted() { apply(document); },
  updated() { apply(document); },
};
