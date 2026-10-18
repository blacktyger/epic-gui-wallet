/*
 * A Modern view of a Classic component: the same logic, a new template.
 *
 * Vue 3 `extends` merges options (data, computed, methods, watch, lifecycle hooks, components)
 * but not setup(), so it is passed on explicitly. The Modern SFC adds only its template, the
 * components that template uses and, rarely, a computed that formats something for display.
 * Behaviour stays in the Classic component, so both interfaces do exactly the same thing.
 *
 *   import Login from '@/components/Login.vue';
 *   export default reskin(Login, { components: { EIcon } });
 */
export function reskin(Base, extra = {}) {
  return Object.assign({
    name: 'Modern' + (Base.name ? Base.name.replace(/(^|[-_ ])(\w)/g, (m, s, c) => c.toUpperCase()) : 'View'),
    extends: Base,
    setup: Base.setup,
  }, extra);
}
