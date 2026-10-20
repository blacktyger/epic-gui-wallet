# Release notes

## 6.1.5

Everything since 6.1.2. The new features are in the BT Labs Theme interface; Classic gets fixes only.

**New**

- Settings › Help: short topics for people new to Epic Cash (receiving your first EPIC, sending with a file, confirmations, fees, your recovery phrase, troubleshooting), with search and a picture of how a transaction travels between two wallets. In all seven languages.
- Report a problem: in Settings › Help, the Help menu and the Unlock screen. Describe what happened and keep "Attach logs" ticked. The report is encrypted on your computer so that only the developer can read it, and your user name, folders, addresses and anything that looks like a password or key are removed first. "Show what's sent" shows exactly what goes out. You can also save it to a file instead.
- Logs are on by default and limited in size, and they never contain passwords, recovery phrases or keys.
- Contacts, redesigned: click a contact to open Send with their address filled in, or pick one from the new Contacts button on Send. Contacts show a picture or initials, a short address and when you last sent to or received from them, and each has a "…" menu (details, copy, edit, delete).
- Adding a wallet: Create a new wallet, Add an existing wallet, or Restore from recovery phrase, the same on the Welcome screen, the Unlock screen and the new Settings › All wallets page. Adding a wallet never replaces one you have. Afterwards the Unlock screen opens with the new wallet chosen.
- Settings › This wallet is about the open wallet only, and its "Open wallet folder" button opens that wallet's own folder.
- Settings › Node: the address is checked as you type (online or syncing, version, blocks behind, response time), with tips for the usual mistakes. "Add to my nodes" keeps a list of your own nodes with their live status.
- The sidebar's wallet name, Node and Receiving open their part of Settings.
- Polish, and the BT Labs Theme in every language of the app (Bulgarian, Czech, German, Persian, Hindi). Persian shows right to left.
- Menu › Lock wallet (Ctrl+L).

**Changed**

- Less load on the node: the wallet asks the node for its status less often, much less often while the window is minimized or hidden, and backs off when the node doesn't answer.
- Receiving over HTTP is off until you turn it on (Receive, or Settings with "Start with the wallet"). Epicbox and files work as before. The Receive page says plainly that HTTP is reachable only from this computer unless you set it up yourself.
- One name, "Epicbox server", everywhere (it was also called "relay" or "domain").
- Removing a wallet: "Remove everything, including the wallet seed" (the app never stores your recovery phrase).
- WALLET.txt in each wallet's folder is easier to read and never holds secrets.
- A sent transaction's arrow is gold, and the start and end of an address are marked the same way on every page.
- Tor and payment proofs are removed for now. They didn't work reliably (proofs never worked over Epicbox). A proof already on a transaction still shows in its details.
- Smaller downloads.

**Fixed**

- Windows: the receiving programs sometimes kept running after Lock, a wallet switch or Quit.
- Nodes that keep their status API private now work: the wallet reads their height and whether they are synced from the public API the wallet itself uses.
- Windows: a node address like `http://192.168.0.1:3413` lost a slash on screen.
- "Send all" no longer stays "Waiting for confirmations" forever.
- The app checks that no other Epic program is using a folder before it opens, adds or deletes a wallet there or uses its blockchain data.
- Receive explains why HTTP couldn't start (the port is in use, or the node didn't answer) and Try again works.
- Your Epic address stays visible on Receive while receiving is off.
- Quit on the settings-error screen works again.
- Opening a wallet folder gives the app access to the wallet folders it finds only, not the whole folder you picked.
- Send refuses a recipient that isn't an address and says "Not enough balance" when it is so. Contacts need a name and a real address.
- Clearer messages for mismatched passwords and a wrong password on the recovery-phrase page.
- Help: write your recovery words on paper (no screenshots); the offline-transaction file comes from the sender.
- Translations: the remaining English text in Polish and the other languages, translated page titles and node states, and a second wallet's default name in your language.
- Classic: Ctrl+L locks from the page, and the remove-wallet dialog is readable in dark mode.
