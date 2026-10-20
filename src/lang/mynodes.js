//strings of the node address field's live check and My nodes (msg.mynodes.*), shared by both interfaces.
//The facts reuse msg.nodedir (at tip, N behind, version, height, peers, ms)
export default {
  //the live check under the field and in the dialog
  status_label: 'Node check',
  checking: 'Checking…',
  recheck: 'Check again',
  state_online: 'Online',
  state_syncing: 'Syncing',
  state_old: 'Old Epic node',
  state_locked: 'Status hidden',
  state_offline: 'Not responding',
  state_not_epic: 'Not an Epic node',
  //{ms}: msg.nodedir.latency_ms, e.g. "120 ms"
  response: 'replied in {ms}',
  height_level: 'Level with the network',
  height_behind: '{n} blocks behind the network',
  height_unknown: 'Network height unknown',
  version_old: 'Version older than {min}',
  problem_timeout: 'No reply in time. The node may be down, or very slow.',
  problem_unreachable: 'Can’t reach this address. Check it for typos, and that the node is running.',
  problem_not_epic: 'Something answers at this address, but it isn’t an Epic node.',
  problem_redirect: 'This address sends the wallet somewhere else, and the wallet doesn’t follow that. Use the final address instead.',
  problem_too_old: 'This Epic node is older than 4.1.0 and may not work well with this wallet.',
  problem_needs_secret: 'This Epic node only answers with its API secret, so the wallet may not work with it.',
  problem_locked: 'This Epic node hides its status, so the wallet can’t tell whether it is up to date.',
  //an HTTP 5xx reply: a web server (often a proxy in front of the node) answers, the node behind it doesn't
  problem_server_error: 'The server at this address answers with an error, so the node behind it may be down. Try again later.',
  hint_try_https: 'Tip: this address may need https:// instead of http://.',
  hint_try_http: 'Tip: a node on your own network usually needs http:// instead of https://.',
  hint_port: 'Tip: Epic nodes usually use port 3413.',

  //the button next to the field, and the list
  add: 'Add to my nodes',
  in_list: 'In my nodes',
  title: 'My nodes',
  use: 'Use',
  selected: 'Selected',
  edit: 'Edit',
  remove: 'Remove',
  //for screen readers: {name} is the label, or the address
  use_named: 'Use {name}',
  edit_named: 'Edit {name}',
  remove_named: 'Remove {name}',
  use_hint: 'Use puts the address in the field above. Save applies it.',
  remove_ask: 'Remove {name} from my nodes?',
  remove_keep: 'Keep',
  remove_yes: 'Remove',

  //the Add / Edit dialog
  add_title: 'Add to my nodes',
  edit_title: 'Edit node',
  dialog_desc: 'Save a node address to find it again later. It can be saved even if it’s offline now.',
  address: 'Node address',
  label: 'Label',
  label_optional: '(optional)',
  label_ph: 'e.g. My home node',
  duplicate: 'This node is already in your list.',
  duplicate_named: 'This node is already in your list as “{name}”.',
  invalid: 'Enter a node address, like https://node.example.com:3413.',
  error_full: 'Your list is full ({n} nodes). Remove one first.',
  error_missing: 'This node is no longer in your list.',
  error_not_saved: 'Couldn’t save your list. Please try again.',
}
