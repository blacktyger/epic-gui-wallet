/*
 * The step rail of the first-run screens. `flow` is the wizard the user is in ('create', 'restore'
 * or 'setup'), `current` the key of the step shown. 6.1 opens a new wallet with the default
 * settings, so create and restore end at their own last step; "Set up" is the settings editor
 * (SetupWizard, from the menu).
 */
const STEPS = {
  create: ['create', 'phrase'],
  restore: ['phrase', 'account'],
  setup: ['prefs', 'node', 'receive', 'review'],
};

export function railGroups(t, flow, current) {
  const keys = STEPS[flow];
  const at = keys.indexOf(current);
  return [{
    title: t('msg.modern.unlock.rail_' + flow),
    items: keys.map((key, i) => ({
      key: flow + '-' + key,
      label: t('msg.modern.unlock.step_' + key),
      state: i < at ? 'done' : i == at ? 'now' : 'todo',
    })),
  }];
}
