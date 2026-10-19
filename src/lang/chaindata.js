//Existing blockchain data for the built-in node, and opening an older wallet's folder (msg.chaindata.*).
//Used by the Classic and the Modern screens; other languages fall back to English.
export default {
  //Open a wallet folder (components/wallets.js walletFolder, form/WalletFolderPick.vue)
  folder_dialog_title: 'Choose your older wallet’s folder',
  folder_several: 'This folder holds more than one wallet. Which one do you want to open?',
  folder_wallets: 'Wallets in this folder',
  folder_chain_only: 'That folder holds blockchain data (chain_data), not a wallet.',
  folder_chain_wallet: 'The wallet that uses it is in the folder above it:',
  folder_none: 'No wallet was found in {0}.',
  folder_none_what: 'A wallet’s folder holds a folder named wallet_data, with a file named wallet.seed in it.',
  folder_none_where: 'Older Epic Wallets keep their wallets in {0}, or in a folder next to it.',
  folder_open: 'Open this wallet',
  folder_try_again: 'Choose another folder',

  //Settings: the built-in node switched on, and older chain data was found (shared/chainOffer.js)
  checking: 'Looking for blockchain data on this computer…',
  offer_title: 'Existing blockchain data found',
  offer_lead: 'This computer already has Epic blockchain data that the built-in node can use.',
  offer_folder: 'Folder',
  offer_size: 'Size',
  offer_modified: 'Last updated',
  offer_others: 'Other copies were found too ({0}). This one was updated most recently.',
  offer_question: 'Use it? That saves downloading and syncing the whole blockchain.',
  offer_older_app: 'An older Epic Wallet that uses this folder may need to sync again after this. Your coins are not affected.',
  offer_use: 'Use this data',
  offer_fresh: 'Download fresh',
  offer_not_saved: 'Your choice could not be saved. The built-in node will download the blockchain.',
  offer_cancelled: 'Settings not saved. Press Save again and choose Use this data or Download fresh.',

  //Settings: the built-in node uses an older app's chain data (settingsStore nodeChainDir)
  in_use_label: 'Blockchain data',
  in_use_hint: 'The built-in node uses blockchain data from this folder, which an older Epic Wallet made.',
  reset: 'Download the blockchain again',
  reset_confirm: 'The built-in node will use its own folder and download the whole blockchain again. The data in the folder above stays where it is: nothing is deleted.',
  reset_go: 'Download again',
  reset_done: 'The built-in node will download the blockchain again. The older data stays in {0}.',
  reset_failed: 'The settings could not be saved, so the built-in node still uses this folder.',
};
