# Release notes

## 6.1.6

Tor is back as part of the new Direct transactions, plus a new Status card, thin service icons and calmer buttons in the BT Labs Theme interface; Classic is unchanged.

**New**

- Direct transactions: peer to peer transactions between wallets, without Epicbox in between (both wallets have to be online). One block in Settings › Receiving replaces the HTTP listener row and the Tor row: one switch (off by default, per wallet), and while it is on, HTTP and Tor as two chips you can pick on their own or together. Each shows its address, Tor its connection progress under "Tor details", with "Start with the wallet" as a small checkbox. Your earlier choice carries over: HTTP with the wallet becomes Direct with HTTP, Tor on becomes Direct with Tor.
- Tor, rebuilt from the ground up (it was removed in 6.1.3 because it never worked with epic-wallet 4.x). Your wallet gets a private .onion address: other wallets can pay you there without opening any ports, and you can send to theirs. Receive shows the Tor address next to your Epic address, with Copy and a QR code, as soon as Tor is ready; Contacts keep a Tor address again; Send accepts one and offers "Turn on Tor" when it's off. Connecting takes about 15–30 seconds; progress and any problem are shown in plain words. With Tor alone, the wallet's HTTP receiver runs on this computer only, behind the onion.
- Receive from the internet: the HTTP address can be made public. "Reachable: Local only / From the internet" and a "?" open a short guide: Local only vs Public, "Make it public" (the wallet then listens on all interfaces, like the CLI's --external; only the receiving API /v2/foreign is exposed, the owner API stays on this computer), how to forward the port on your router with your LAN and public address, and Tor as the no-setup alternative. The choice is kept until you switch back; Receive then shows the public address. Windows Firewall asks once; allow it. The public address is looked up at api.ipify.org, only while this is open or Public is on.
- The wallet runs its own Tor 0.4.9.14 (Tor Expert Bundle 15.0.25), checked against Tor's signing key when the app is built, on private ports, so a Tor already running on your computer doesn't get in the way. Your Tor address is the same one the epic-wallet CLI shows and stays the same after a restore from your recovery phrase.
- Over Tor, the wallet passes the transaction to the other wallet itself and then sends it to your node as usual. Epicbox, node checks and the built-in node don't use Tor.
- Settings lists every section in its menu: Node, Receiving and Appearance are their own pages.
- Settings › Node and Receiving: the node and the Epicbox server are each one field. Open it to pick from My nodes and the public nodes (with their status), or type an address: it is checked as you type, and ☆ keeps it in My nodes. A pick applies at once.
- Epicbox says when its server isn't responding and offers the healthiest other server in one click. It never switches by itself. Send uses the same words.
- The sidebar shows Node and Receiving with their icon, a status dot and one word; hover for the details, click to open the right page.
- Overview › Status: one aligned row per service (node, Epicbox, and HTTP and Tor while they are on) with new thin outline icons; colour is only in the small status dot, details are in the tooltips, and one "Receive options" button opens Settings › Receiving.
- The Epicbox server shows as its domain only (stackwallet.com) in the Status card, the sidebar card and Settings › Receiving; the full name is in the tooltip, the picker and your address.
- The node and Epicbox pickers show each server's latency on the right, as measured by the server status site, not from your computer.
- After a send goes through, the wallet opens Overview, where the new transaction shows.

**Changed**

- Every Settings page uses the same row layout, with shorter descriptions and the buttons lined up.
- The node's status is one icon (ready, syncing, not responding), its height with a small meter, and the time of the last block. The version only shows when it is too old.
- "default" next to the factory default server is a small grey word, not a badge.
- Buttons come in three sizes: a small inline action next to text (Retry, Copy, Change, Try again), regular for a row's control, and large only for the main actions (Send, Unlock, Create wallet, Make it public). Notices, status lines and rows no longer carry big buttons.
- The "Built-in node" row in the node picker has its icon in the status column, and the pickers never show a horizontal scrollbar, also in a small window at 150 %.
- Payments a scan found without a record of their own show as "Found by scan" instead of "Restore".
- Contacts: cleaner rows; Send, Edit and Delete are in the contact's details.
- Send: the amount field is the same size as the other fields, and "Available" fills in the whole amount.
- The start and end of an Epicbox address are marked the same way on Receive, Send and Contacts.

**Fixed**

- After an Epicbox server change, Epicbox sometimes stayed off when the node briefly said it was syncing. It now tries again.
- Epicbox no longer stays on "Connecting…" after the node briefly fell behind: it shows "Paused (waiting for the node)" while epic-wallet holds payments, and "Listening" again as soon as it carries on.
- Overview's Status card uses the same words as the sidebar: node, Epicbox listening, connecting, paused or not responding, and HTTP and Tor rows while they are on.
- A node that is slow to answer the version check reads "The node didn't answer in time. Try again." (after one more try), not "Not an Epic node".
- Long server names in the node and Epicbox fields end in "…" in a narrow window instead of being cut off.
- With no internet, Tor says "Can't reach the Tor network" after its second failed start (about 2 minutes) and keeps trying in the background.
- Payments a scan found now really read "Found by scan": epic-wallet stores "Restore" as their address, which is no longer shown as one.

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
- The node's status is one icon in the sidebar and on Overview: green when the node is ready, yellow while it syncs, red when it doesn't answer (with the reason). The details (version, height, response time) are in Settings › Node.
- Receiving over HTTP is off until you turn it on (Receive, or Settings with "Start with the wallet"). Epicbox and files work as before. The Receive page says plainly that HTTP is reachable only from this computer unless you set it up yourself.
- One name, "Epicbox server", everywhere (it was also called "relay" or "domain").
- Removing a wallet: "Remove everything, including the wallet seed" (the app never stores your recovery phrase).
- WALLET.txt in each wallet's folder is easier to read and never holds secrets.
- A sent transaction's arrow is gold, and the start and end of an address are marked the same way on every page.
- Tor and payment proofs are removed for now. They didn't work reliably (proofs never worked over Epicbox). A proof already on a transaction still shows in its details.
- Smaller downloads.

**Fixed**

- Windows: the receiving programs sometimes kept running after Lock, a wallet switch or Quit.
- Nodes that keep their status API private now work.
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
