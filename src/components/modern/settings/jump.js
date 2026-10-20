/*
 * Sidebar links into Settings › General (#node, #epicbox). The hash names the section; the page
 * scrolls it into view, flashes it briefly and moves focus into it, also when Settings is already
 * open (the same hash again fires JUMP_EVENT, a repeated router push does nothing).
 */
export const JUMP_EVENT = 'e-settings-jump';

//hash -> the section element and what takes focus inside it
const TARGETS = {
  node: { section: 'stg-sec-node', focus: 'stg-node-h' },
  epicbox: { section: 'stg-sec-epicbox', focus: 'stg-relay' },
};

export function jumpTo(hash, doc = document) {
  const target = TARGETS[String(hash || '').replace(/^#/, '')];
  const section = target && doc.getElementById(target.section);
  if (!section) return false;
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  const el = doc.getElementById(target.focus);
  if (el) el.focus({ preventScroll: true });
  section.classList.remove('e-jump-flash');
  void section.offsetWidth;
  section.classList.add('e-jump-flash');
  setTimeout(() => section.classList.remove('e-jump-flash'), 1800);
  return true;
}

/* Router push that also fires JUMP_EVENT when the target is the page already open */
export async function openSettingsSection(router, to) {
  const here = router.currentRoute.value.fullPath;
  await router.push(to);
  if (router.currentRoute.value.fullPath === here) window.dispatchEvent(new Event(JUMP_EVENT));
}
