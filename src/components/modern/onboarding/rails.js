/*
 * The step rail of the first-run screens. `flow` is the wizard the user is in ('create', 'restore'
 * or 'setup'), `current` the key of the step shown. The "Set up" group follows the create and
 * restore groups: it opens on the first login (SetupWizard), after the unlock.
 */
const STEPS = {
  create: ['create', 'phrase'],
  restore: ['phrase', 'account'],
  setup: ['prefs', 'node', 'receive', 'review'],
};

export function railGroups(t, flow, current) {
  const build = (name) => {
    const keys = STEPS[name];
    const at = name == flow ? keys.indexOf(current) : -1;
    return {
      title: t('msg.modern.unlock.rail_' + name),
      items: keys.map((key, i) => ({
        key: name + '-' + key,
        label: t('msg.modern.unlock.step_' + key),
        //steps of an earlier group are all done, of a later group all still to come
        state: name == flow ? (i < at ? 'done' : i == at ? 'now' : 'todo') : 'todo',
      })),
    };
  };
  return flow == 'setup' ? [build('setup')] : [build(flow), build('setup')];
}
