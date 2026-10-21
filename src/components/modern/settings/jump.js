/*
 * Sidebar links into Settings › Node (#node) and Settings › Receiving (#epicbox). The hash names the section; the page
 * scrolls it into view, flashes it briefly and moves focus into it, also when Settings is already
 * open (the same hash again fires JUMP_EVENT, a repeated router push does nothing).
 */
export const JUMP_EVENT = 'e-settings-jump';

//hash -> the section element and what takes focus inside it
const TARGETS = {
  node: { section: 'stg-sec-node', focus: 'stg-node-h' },
  epicbox: { section: 'stg-sec-epicbox', focus: 'stg-rcv-h' },
  direct: { section: 'stg-direct', focus: 'stg-direct-sw' },
};

export function jumpTo(hash, doc = document) {
  const target = TARGETS[String(hash || '').replace(/^#/, '')];
  const section = target && doc.getElementById(target.section);
  if (!section) return false;
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  settle(section, doc);
  const el = doc.getElementById(target.focus);
  if (el) el.focus({ preventScroll: true });
  section.classList.remove('e-jump-flash');
  void section.offsetWidth;
  section.classList.add('e-jump-flash');
  setTimeout(() => section.classList.remove('e-jump-flash'), 1800);
  return true;
}

/* Sections above the target can still grow after the jump (the public node list, the node's details
   arrive a moment later) and push the target down. For a short while, put it back at the top unless
   the user scrolls, clicks or types meanwhile. */
const SETTLE_MS = [450, 900, 1500, 2400];
function settle(section, doc) {
  let stop = false;
  const off = () => { stop = true; };
  const events = ['wheel', 'touchstart', 'keydown', 'mousedown'];
  events.forEach((e) => doc.addEventListener(e, off, { once: true, passive: true, capture: true }));
  SETTLE_MS.forEach((ms, i) => setTimeout(() => {
    if (!stop && section.isConnected) {
      const top = section.getBoundingClientRect().top;
      const view = section.closest('main') || doc.documentElement;
      const viewTop = view === doc.documentElement ? 0 : view.getBoundingClientRect().top;
      if (Math.abs(top - viewTop) > 48) section.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
    if (i === SETTLE_MS.length - 1) events.forEach((e) => doc.removeEventListener(e, off, { capture: true }));
  }, ms));
}

/* Router push that also fires JUMP_EVENT when the target is the page already open */
export async function openSettingsSection(router, to) {
  const here = router.currentRoute.value.fullPath;
  await router.push(to);
  if (router.currentRoute.value.fullPath === here) window.dispatchEvent(new Event(JUMP_EVENT));
}
