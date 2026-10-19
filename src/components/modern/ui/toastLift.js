/*
 * v-toast-lift: while the element is on the page, the bottom toasts (@meforma/vue-toaster) sit
 * above it instead of over it. For a bar pinned to the bottom of the window, such as Settings'
 * unsaved-changes bar: a "Settings saved" toast must not cover its Save button.
 *
 * Sets --e-toast-lift on <html> to the space from the element's top edge to the bottom of the
 * window (_bridge.scss adds it to the toast container's bottom padding), measured again when the
 * element or the window changes size (interface scale, wrapping on a narrow window) and when the
 * page scrolls (a short page leaves the bar higher up). Removed with the element.
 */
const PROP = '--e-toast-lift';
const state = new WeakMap();

function measure(el) {
  const rect = el.getBoundingClientRect();
  const lift = Math.max(0, Math.ceil(window.innerHeight - rect.top));
  document.documentElement.style.setProperty(PROP, lift + 'px');
}

export const toastLift = {
  mounted(el) {
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; measure(el); });
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    if (observer) observer.observe(el);
    window.addEventListener('resize', update);
    //capture: the scrolling element is the page's content pane, not the window
    document.addEventListener('scroll', update, { capture: true, passive: true });
    state.set(el, { observer, update, cancel: () => frame && cancelAnimationFrame(frame) });
    measure(el);
  },
  unmounted(el) {
    const s = state.get(el);
    if (s) {
      if (s.observer) s.observer.disconnect();
      window.removeEventListener('resize', s.update);
      document.removeEventListener('scroll', s.update, { capture: true });
      s.cancel();
      state.delete(el);
    }
    document.documentElement.style.removeProperty(PROP);
  },
};
