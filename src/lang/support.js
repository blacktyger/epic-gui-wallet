//Get help / Report a problem (msg.support.*): the report dialog both interfaces share
//(components/layout/SupportReportModalBox.vue, modern/dialogs/SupportDialog.vue), its entry points
//(Help pages, the unlock screen, the app menu) and the Modern tour step. docs/support/DESIGN.md.
//For translators: keep every string as short as the English. The whole report (description, contact,
//logs) is encrypted and goes to the Epic GUI Wallet developer only; the screen says so once
//(attach_note). Never name a channel, group or service in these strings.
export default {
  //the app menu (main process): Help › Get help / Report a problem…
  menu_help: 'Help',
  menu_item: 'Get help / Report a problem…',

  //the button on the Help page and the link under the unlock screen
  open: 'Report a problem',
  //above that button on the Help page
  entry_title: 'Something not working?',

  //the dialog
  title: 'Report a problem',
  //the description field's placeholder (and its label for screen readers)
  description_label: 'What happened?',
  description_required: 'Describe the problem first.',
  contact_label: 'Contact (optional)',
  attach_label: 'Attach logs (recommended)',
  //the only line about privacy on the screen
  attach_note: 'Encrypted. Only the developer can read them.',
  //a collapsed toggle with the report's content
  show: 'Show what’s sent',
  preparing: 'Preparing…',
  preview_failed: 'Couldn’t collect the logs.',
  //{version}: e.g. 6.1.6; {system}: e.g. win32 10.0.26100 x64
  app_line: 'Epic Wallet {version} · {system}',
  open_logs: 'Open logs folder',
  send: 'Send',
  save: 'Save to file',
  sent: 'Sent. Thank you.',
  //{path}: where the file was saved
  saved: 'Saved: {path}',
  phrase_refused: 'This looks like a recovery phrase. Remove it: never send it to anyone.',
  err_offline: 'No connection. Try again or save to file.',
  err_rate: 'Too many reports. Try again later or save to file.',
  err_too_big: 'Too big to send. Save to file instead.',
  err_server: 'Couldn’t send. Try again or save to file.',
  err_write: 'Couldn’t save the file.',

  //the Modern first-unlock tour: one step, on the Settings item
  tour_t: 'Need help?',
  tour: 'Settings › Help › Report a problem.',
};
