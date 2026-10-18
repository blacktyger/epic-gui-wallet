/*
 * Display helpers shared by the first-run screens. They add nothing to the behaviour of the
 * Classic component they wrap.
 */

/*
 * Runs fn (a Classic method that reports its failures with $toast.error) and returns the first
 * error message it showed, or ''. The toast still appears, exactly as in the Classic interface;
 * the Modern screen shows the same message beside the form or the progress.
 */
export async function captureToast(vm, fn) {
  const toast = vm.$toast;
  const original = toast.error;
  let message = '';
  toast.error = function (...args) {
    if (!message) {
      const first = args[0];
      message = typeof first == 'string' ? first : (first && first.message) || String(first);
    }
    return original.apply(this, args);
  };
  try {
    await fn();
  } finally {
    toast.error = original;
  }
  return message;
}

/*
 * The Classic form fields (Modern/form/*) draw only the control, so a label cannot point at
 * them with `for`. Mixed into a view, this gives each `<label class="e-label" data-field>` the id
 * of the first input, select or textarea next to it (inside the same .e-field).
 */
let seq = 0;
export const fieldLabels = {
  mounted() { this.linkFieldLabels(); },
  updated() { this.linkFieldLabels(); },
  methods: {
    linkFieldLabels() {
      const root = this.$el;
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('label.e-label[data-field]').forEach((label) => {
        const control = label.parentElement && label.parentElement.querySelector('input:not([type=hidden]), select, textarea');
        if (!control) return;
        if (!control.id) control.id = 'e-fld-' + (++seq);
        if (label.htmlFor != control.id) label.htmlFor = control.id;
      });
    },
  },
};
