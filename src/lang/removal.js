//Removing a wallet (msg.removal.*): list only, this app's files, or everything.
//Used by the Classic and the Modern screens; other languages fall back to English.
export default {
  //the button that opens the dialog
  open: 'Remove…',
  open_named: 'Remove {0}…',
  title: 'Remove {0}?',
  lead: 'Choose what to remove. Nothing happens until you press the button below.',
  legend: 'What to remove',
  checking: 'Checking this wallet’s files…',

  list_label: 'Remove from the list only',
  list_hint: 'All files stay where they are. You can add the wallet back later with “Open a wallet folder”.',
  app_label: 'Remove this app’s files for it',
  app_hint: 'Also deletes its settings, its contacts in this app and this app’s files for it. The wallet itself, with its recovery phrase, stays in {0}.',
  app_hint_missing: 'Also deletes its settings, its contacts in this app and this app’s files for it in {0}.',
  all_label: 'Remove everything, including the recovery phrase',
  all_hint: 'Deletes the wallet completely from this computer: {0}',

  //why a choice can't be used
  reason_open: 'This wallet is open. Lock it or switch to another wallet first.',
  reason_running: 'This wallet is still running in the background (wallet service, listener or scan). Lock it or wait until it stops, then try again.',
  reason_notours: 'This wallet’s files are in a folder this app didn’t create: {0}. They stay where they are.',
  reason_shared: 'Another wallet in the list uses this folder: {0}. Its files stay where they are.',
  reason_legacy: 'This folder belongs to an older Epic Wallet: {0}. Its files stay where they are.',
  reason_imported: 'This wallet’s recovery phrase is in a folder this app didn’t create: {0}. It stays where it is.',
  reason_separate: 'This wallet’s recovery phrase is in another folder: {0}. It stays where it is.',
  reason_chain: 'The built-in node keeps its blockchain data in this folder: {0}. Its files stay where they are.',
  reason_missing: 'The wallet’s folder was not found, so its recovery phrase can’t be deleted here.',
  reason_gone: 'This wallet is no longer in the list.',
  reason_readonly: 'The settings file can’t be read, so nothing can be removed.',
  reason_unknown: 'This can’t be removed here.',

  //removing everything: the confirmation
  danger_title: 'This can’t be undone',
  danger_text: 'The coins in this wallet can only be recovered with its recovery phrase. Without the recovery phrase they are lost for good.',
  ack: 'I have my recovery phrase written down',
  type_label: 'To confirm, type the wallet’s name: {0}',
  type_mismatch: 'The name doesn’t match yet.',

  button_list: 'Remove from list',
  button_app: 'Remove files',
  button_all: 'Delete everything',

  done_list: '{0} was removed from the list. Its files were not touched.',
  done_app: '{0} was removed, with this app’s files for it.',
  done_all: '{0} was deleted from this computer.',
  //{0}: how many items, {1}: one of them
  partial_listed: 'Not everything could be removed ({0} left, e.g. {1}). The wallet stays in the list and still opens. Close any program that may use its files and try again.',
  partial_unlisted: 'The wallet was removed, but {0} item(s) could not be deleted, e.g. {1}. You can delete the folder {2} yourself.',
  not_saved: 'The files were removed, but the wallet list could not be saved, so the wallet is still listed. Try again.',
  contacts_failed: 'The wallet was removed, but its contacts could not be deleted from this app.',
  failed: 'The wallet was not removed: {0}',
};
