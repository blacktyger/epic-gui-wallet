//Get help / Report a problem (msg.support.*): the report dialog both interfaces share
//(components/layout/SupportReportModalBox.vue, modern/dialogs/SupportDialog.vue), its entry points
//(Help pages, the unlock screen, the app menu) and the Modern tour step. docs/support/DESIGN.md.
//For translators: the description is NOT encrypted (the developer reads it and may post it in the
//testers' Telegram group); the contact and the logs are encrypted so only the developer can read
//them. Keep that difference clear.
export default {
  //the app menu (main process): Help › Get help / Report a problem…
  menu_help: 'Help',
  menu_item: 'Get help / Report a problem…',

  //the entry card on the Help page, and a small link on the unlock screen
  open: 'Report a problem',
  entry_title: 'Something not working?',
  entry_text: 'Describe the problem and send it to the developer, with the app’s logs if you agree. The logs are cleaned and encrypted on this computer: only the developer can read them.',
  unlock_link: 'Having trouble? Report a problem',

  //step 1: write
  title: 'Report a problem',
  lead: 'Tell us what happened. The developer reads every report.',
  description_label: 'What happened?',
  description_hint: 'What you did, what you expected and what you saw instead. Error messages help.',
  //{n}: characters typed, {max}: the limit (2000)
  description_counter: '{n} / {max}',
  description_required: 'Please describe the problem first.',
  //under the description field, always shown
  never_secrets: 'Never write your recovery phrase or password here.',
  //shown instead of the review when the description holds what looks like a recovery phrase
  phrase_refused: 'This looks like a recovery phrase. Never send your recovery phrase to anyone, the developer included: remove it, then review again.',
  contact_label: 'Contact (optional)',
  contact_hint: 'A Telegram name or an email address, if you would like a direct reply.',
  //{'@'} is how vue-i18n writes a plain @ (keep it as it is)
  contact_placeholder: "{'@'}telegram or email",
  attach_label: 'Attach logs (recommended)',
  attach_hint: 'Logs show what the app and the wallet did. Without them we can usually only guess.',
  privacy: 'Before anything leaves this computer, the logs are cleaned (your user name, home folder, IP addresses and wallet addresses are removed) and encrypted. Only the developer can read them.',
  review: 'Review what will be sent',

  //step 2: review, exactly what is sent
  review_title: 'What will be sent',
  preparing: 'Collecting and cleaning the logs…',
  preview_failed: 'The logs could not be collected. Go back and send the report without logs, or try again.',
  public_label: 'Not encrypted: your description',
  public_note: 'The developer reads it and may post it in the GUI testers’ Telegram group, so other testers can help too.',
  private_label: 'Encrypted: only the developer can read it',
  private_note: 'Your contact, the app and system versions, and the logs below.',
  private_note_no_logs: 'Your contact and the app and system versions. No logs.',
  //{version}: e.g. 6.1.6; {system}: e.g. win32 10.0.26100 x64
  app_line: 'Epic Wallet {version} · {system}',
  no_contact: 'No contact given.',
  //{n}: number of log files attached (plural: one | other; pl/cz: one | few | many)
  files_count: '{n} log file, cleaned | {n} log files, cleaned',
  //after a file's name and size, when only its end is attached
  file_cut: 'last part only',
  removed: 'Removed or masked: {list}',
  //the kinds counted in "removed" (the cleaner's counts)
  kind_paths: 'home folders',
  kind_users: 'user names',
  kind_hosts: 'computer and server names',
  kind_ips: 'IP addresses',
  kind_addresses: 'wallet addresses',
  kind_secrets: 'passwords and keys',
  kind_phrases: 'recovery phrases',
  kind_blocks: 'transaction data',
  kind_hex: 'keys and cryptographic data',
  send: 'Send report',
  save: 'Save encrypted report to a file',
  no_send: 'Sending from the app is not available in this version: save the report to a file and send it in the GUI testers’ Telegram group.',
  back: 'Back',
  sending: 'Sending…',
  saving: 'Saving…',

  //step 3: the result
  sent_title: 'Report sent',
  //{id}: the report's number, e.g. r7k2m9q4
  sent_text: 'Report {id} has reached the developer. Thank you! Replies come in the Telegram group, or to your contact if you gave one.',
  saved_title: 'Report saved',
  //{path}: where the file was saved
  saved_text: 'Saved as {path}. Send this file to the developer, for example in the GUI testers’ Telegram group. It is encrypted: only the developer can open it.',
  err_offline: 'The report could not be sent: no connection. Save it to a file and send it later.',
  err_rate: 'Too many reports from this connection just now. Try again later, or save the report to a file.',
  err_too_big: 'The report is too big to send. Save it to a file instead.',
  err_server: 'The report service did not take the report. Save it to a file and send it yourself.',
  err_no_endpoint: 'Sending from the app is not available in this version. Save the report to a file instead.',
  err_write: 'The file could not be saved there. Try another folder.',
  err_expired: 'This preview is too old: it was prepared again. Check it and send.',
  open_logs: 'Open the logs folder',
  close: 'Close',

  //the Modern first-unlock tour: one step, on the Settings item
  tour_t: 'Help is here',
  tour: 'Something not working? Settings › Help › Report a problem. Logs are encrypted: only the developer reads them.',
};
