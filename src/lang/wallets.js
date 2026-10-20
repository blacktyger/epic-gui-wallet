//GUI 6.1 fresh start: wallet list, first start, found screen, Welcome › Advanced, Unlock (msg.wallets.*).
//Used by the Classic and the Modern screens; other languages fall back to English.
export default {
  //a wallet without a label, by its place in the list
  wallet_n: 'Wallet {0}',
  wallet: 'Wallet',
  wallets: 'Wallets',
  label: 'Label',
  label_hint: 'Only shown in this app, to tell your wallets apart.',
  optional: 'optional',
  no_label: 'None',

  //settings.json can't be read
  error_title: 'The settings can’t be read',
  error_text: 'This file exists but could not be read:',
  error_reason: 'Reason: {0}',
  error_fix: 'Fix the file or remove it, then try again. Until then the app writes nothing, so your wallet list is kept.',
  error_backup: 'settings.json.bak in the same folder holds the version before the last change.',
  open_folder: 'Open folder',
  copy_path: 'Copy path',
  copied: 'Copied',
  quit: 'Quit',
  try_again: 'Try again',
  continue: 'Continue',

  //found screen
  title_found: 'Older wallets',
  found_looking: 'Looking for wallets from an older Epic Wallet…',
  found_title: 'We found {n} wallet from an older Epic Wallet | We found {n} wallets from an older Epic Wallet',
  found_lead: 'Use it here? Your coins and recovery phrase stay the same. | Use them here? Your coins and recovery phrase stay the same.',
  found_note: 'Close the older Epic Wallet first. Unlock with the password you had there.',
  found_later: 'You can import it later in Settings. | You can import them later in Settings.',
  found_list: 'Wallets found',
  found_legacy_db: 'Made with an older wallet version: the balance comes back with a rescan, older history may not show.',
  found_use: 'Use selected wallet | Use selected wallets',
  found_not_now: 'Not now',
  //below the found wallets: the Welcome screen's two ways
  found_or: 'Or:',
  found_or_create: 'Create a new wallet',
  found_or_restore: 'Restore from recovery phrase',
  found_last_used: 'last used {0}',
  found_contacts: 'no contacts | {n} contact | {n} contacts',
  found_app: 'Epic Wallet {0}',
  found_failed_title: '{n} wallet wasn’t imported | {n} wallets weren’t imported',
  found_failed_lead: 'The older wallet is not changed. You can try again later: Add a wallet › Add an existing wallet.',
  found_some_imported: '{n} wallet was imported. | {n} wallets were imported.',
  found_none_title: 'Nothing found',
  found_none_text: 'No wallets from an older Epic Wallet are left to import on this computer.',
  found_search_again: 'Search again',
  found_scan_failed: 'The search failed: {0}',

  //welcome
  welcome_lead: 'Add your first wallet.',
  back_to_unlock: 'Back to unlock',
  advanced: 'Advanced',
  open: 'Open',

  //Add a wallet: the same three ways on Welcome, Unlock › Add a wallet and Settings › All wallets.
  //Each one adds a new wallet to the list; none replaces a wallet
  add_title: 'Add a wallet',
  add_lead: 'Each option adds a new wallet. Your other wallets stay as they are.',
  add_lead_open: 'Each option adds a new wallet; this one stays as it is. Then this wallet locks and you unlock the new one.',
  add_create: 'Create a new wallet',
  add_create_hint: 'A new wallet with a new recovery phrase.',
  add_existing: 'Add an existing wallet',
  add_existing_hint: 'A wallet already on this computer: from an older Epic Wallet or from its folder.',
  add_restore: 'Restore from recovery phrase',
  add_restore_hint: 'Bring a wallet back with its recovery words.',
  //Add an existing wallet
  existing_title: 'Add an existing wallet',
  existing_lead: 'The wallet stays in its folder and is added to the list. No wallet is replaced.',
  existing_older: 'From an older Epic Wallet',
  existing_older_hint: 'Looks for wallets an older Epic Wallet left on this computer.',
  existing_older_go: 'Look for wallets',
  existing_folder: 'From a wallet folder',
  existing_folder_hint: 'Choose the folder with wallet_data inside, for example .epic/main in your home folder. A folder above it works too: the app finds the wallets in it.',
  existing_folder_go: 'Choose a folder…',
  folder_dialog_title: 'Choose the wallet folder to add',
  //Unlock, right after a wallet was added
  added_unlock: '{0} was added. Enter its password to unlock it.',
  network: 'Network',
  network_hint: 'Mainnet holds real EPIC. Floonet and Usernet are test networks.',
  network_chosen: 'New wallets are made on this test network.',
  network_wallet: 'A wallet on a test network, not for real EPIC',
  //Welcome › Advanced: where the app keeps its data (only while no wallet is listed)
  root_title: 'App data folder',
  root_hint: 'Where the app keeps wallets, settings and the blockchain.',
  root_more: 'More about this',
  root_more_text: 'Choose a new, empty folder. The app restarts, makes its folders there and keeps using it. “Use the default folder” goes back to the usual place.',
  root_locked: 'It can be changed only before the first wallet is added.',
  root_choose: 'Keep app data in another folder',
  root_default: 'Use the default folder',
  root_confirm: 'The app keeps its data in {0} from now on. It restarts to use the new folder.',
  root_failed: 'That folder can’t be used. Choose a folder you can write to.',
  root_legacy: 'That folder belongs to an older Epic Wallet. Choose a new, empty folder.',
  root_wallet: 'That is a wallet folder. Choose a new, empty folder.',
  root_notempty: 'That folder isn’t empty. Choose a new, empty folder.',
  restart_now: 'Restart now',

  //adding a wallet from its folder
  folder_noseed: 'No wallet in {0}: it has no wallet_data/wallet.seed.',
  folder_inuse: 'Another Epic program is using this folder. Close it and try again.',
  folder_listed: 'This wallet is already in the list.',
  folder_network: 'Which network is this wallet on?',
  settings_readonly: 'The settings file can’t be read, so no wallet can be added.',
  folder_failed: 'This folder could not be opened ({0}).',

  //create and restore
  create_lead: 'The password unlocks this wallet on this computer. It can’t recover your coins; the recovery phrase on the next step does that.',
  create_failed: 'The wallet could not be created.',
  restore_failed: 'The wallet could not be restored.',
  restore_password: 'Set the password that unlocks this wallet on this computer.',
  stage_restore: 'Restoring the wallet',
  stage_lock: 'Locking the open wallet',
  written_continue: 'I’ve written it down, continue',

  //unlock
  check_failed: 'The wallet’s files could not be prepared ({0}).',
  open_failed: 'The wallet did not open.',
  missing: 'This wallet’s folder is missing: {0}',
  missing_title: 'This wallet’s folder is missing',
  missing_lead: 'It was at',
  remove_from_list: 'Remove from list',
  remove_named: 'Remove {0} from the list',
  remove_title: 'Remove {0} from the list?',
  remove_text: 'Only the entry in this app’s list goes. The wallet’s files are not touched; add it back with Add a wallet › Add an existing wallet.',
  removed: '{0} was removed from the list.',

  //switching: lock this wallet, then Unlock with the picker
  switch: 'Switch wallet',

  //settings › wallet (the open wallet only)
  wallet_folder: 'Wallet folder',
  wallet_folder_hint: 'This wallet’s own folder: its seed and database.',
  wallet_folder_imported: 'This wallet’s own folder, where the older app kept it.',
  //opens the open wallet's own folder in the file manager
  open_this_folder: 'Open wallet folder',
  this_wallet_only: 'This page is about the open wallet. Other wallets, and adding one:',
  config_folder: 'Config folder',
  config_folder_hint: 'This app’s files for the wallet: epic-wallet.toml, API secrets, log.',
  imported_from: 'Imported from {0}.',
  //settings › all wallets
  all_wallets: 'All wallets',
  other_wallets_hint: 'Lock this wallet to switch to another one.',
  open_now: 'Open now',
  //that wallet's own folder in the file manager
  show_in_folder: 'Show in folder',
  show_in_folder_named: 'Show {0} in folder',
};
