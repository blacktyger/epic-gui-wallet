# Release notes

## Next version (after 6.1.5)

- Settings › Node › External node: the address is checked while you type it (from a tester's request for a "test the connection" button). A short moment after you stop typing, or at once when you paste, a line under the field says whether an Epic node answers there: Online or Syncing, its version, its block height against the network ("at tip" or "N behind"), its peers and how fast it replied; or, in plain words, why not: it doesn't answer, it's slow, something answers but it isn't an Epic node, or it redirects. Tips cover the usual mistakes: https:// instead of http:// (and the other way round for a node on your own network) and the port (Epic nodes use 3413). The check never blocks typing or Save, and Save still checks the address itself, as before. Nodes from the public list keep their own status from status.btlabs.uk and aren't asked again.
- My nodes: "Add to my nodes" next to the address field saves the address with a label of your own (optional). The dialog checks the address too, but you can save a node that is offline right now. The same node can't be added twice, however it's written (a trailing "/", capital letters, the default port). Saved nodes are listed under the field with their live status (state, at tip, ms), checked when you open the page and every few minutes while it stays open. Each one has Use (puts the address in the field; Save applies it), Edit and Remove (asks first, in the row).
  - The list is kept in the app's settings (settings.json, "myNodes"), one list per network, for all your wallets: a node serves every wallet on its network. Older 6.1 versions keep the list untouched if you go back.
  - Privacy: only addresses you typed or saved are asked, through the same path as the app's other node checks, with a timeout, over http(s) only. The node's API secret is never sent by these checks.

## 6.1.5

- Removing a wallet: "Remove everything, including the recovery phrase" is now "Remove everything, including the wallet seed". The app never stores your recovery phrase; this option deletes the wallet's seed file, and the wallet can then be restored only with the recovery phrase you wrote down. The confirmation says the same (feedback #29).
- In use by another program: before it offers blockchain data, opens or adds a wallet folder, or deletes a wallet's files, the app now checks whether another Epic program (a node or a command-line wallet) is using that folder, by trying the same lock that program holds, and says "Another Epic program is using this folder." A lock file that is merely left on disk no longer counts, and the app never creates or deletes lock files in folders it doesn't own (feedback #33).
  - What is refused while another program holds the folder: deleting the wallet's files ("Remove from the list only" still works), opening or importing that wallet, and using that blockchain data (the offer shows the message and comes back later).
  - If the check itself can't run, files are not deleted ("This app couldn’t check…"), while opening a wallet still works. On Windows the check runs through PowerShell and can take a few seconds the first time.
- Settings › Wallets: the button that adds an existing wallet is now called "Add a wallet from a folder…" (it was "Open a wallet folder", which sounded like it would open the wallet's own folder). Each wallet in the list has a new "Show in folder" button that opens that wallet's own folder in your file manager (feedback #34).
- WALLET.txt (in each wallet's folder) is easier to read: what the file is, then a "YOUR WALLET DETAILS" block with label, created date, network, wallet id and data folder; the data folder is listed once. It is updated when you rename the wallet. It never holds secrets (feedback #35).
- Menu › Lock wallet (Ctrl+L), above Quit: locks the open wallet, like the Lock button (feedback #36).
- Help and translations:
  - The help no longer suggests taking a screenshot of your recovery words: write them down on paper.
  - "Import offline transaction": the file comes from the sender (the help said the receiver).
  - The help pages in Bulgarian, Czech, German, Persian and Hindi now cover the same topics as the English (old Ngrok topics removed, mixed-in English translated), with "recovery phrase" instead of "mnemonic words".
  - Classic: page titles (e.g. "Dashboard") and the node's status ("synced", "downloading blocks"…) are translated; the Modern overview shows the node's sync state in your language too.
- Classic, dark mode: the remove-wallet dialog is dark like the rest; its Cancel button was white on white and a disabled Delete button red on red.
- A proposal for an optional blockchain download ("head start") from the Epic project's server is in docs/plans/bootstrap.md, for testers to comment on. Nothing of it is in this version (feedback #30).

## 6.1.4

- Languages: the Modern interface is translated into every language of the app (Bulgarian, Czech, German, Persian, Hindi), and Polish is new in both interfaces, help texts included. Until now Modern was English-only. Each language was translated and then reviewed separately against the English; the Classic strings got the same terms (e.g. "recovery phrase" instead of the older "mnemonic words").
  - Persian shows right-to-left, and the page's language is set for screen readers (QA T10, T26).
- Fixes:
  - Settings › Node: an address like `http://192.168.0.1:3413` showed as `http: /192…` on Windows: one slash went missing. The address font's "//" ligature drew the first slash in the empty space before it, and Windows dropped that slash. The bundled font has no ligatures now, so addresses, paths and amounts show every character as typed. The saved address was always right.
  - Receive: your Epic address stays visible (dimmed) while receiving is off, and Copy and its QR code keep working. Payments sent to it wait on Epicbox until you start receiving again. It used to say "Epicbox not available. Wait for the Node to be synced…" (QA T09).
  - "Send all" no longer stays "Waiting for confirmations" forever. The wallet confirms a send when it sees the send's change on chain, and a send of everything has no change. For that case only (a posted send, no change, nothing left in the wallet), the app asks the node once a minute where the transaction is (its kernel, a public lookup), then shows it as sent with its confirmations. It is shown only, never written to the wallet; if the node doesn't answer, it keeps waiting. Sends with change are unchanged (QA T03).
  - Receiving over HTTP when another program uses port 3415: the app said "Receiving · HTTP" though HTTP wasn't running. Now HTTP shows as failed, with the reason ("Port 3415 is used by another program") and a Try again button. Epicbox keeps working (QA W01).

## 6.1.3

- Tor removed. Receiving and sending over Tor didn't work in the current form. It needs a rework and is postponed, with no ETA.
- Payment proofs removed from Send and Receive. They weren't fully working (never over Epicbox) and were very niche. A proof already on a transaction still shows in its details. The command-line wallet still has proofs (they barely work there too).
- Fixes:
  - The Quit button on the settings-error screen quits again (it did nothing) and stops the wallet's background processes (feedback #31).
  - Open a wallet folder: only the wallet folders the app finds become readable, not the whole folder you picked (feedback #32).
  - Send: a recipient that is no address at all ("hello world") is refused; an amount larger than your balance says "Not enough balance" instead of "must be a number".
  - Contacts: a contact needs a name and an address, and an Epicbox address must be a real one (empty or nonsense contacts used to be saved).
  - Create/Restore: "The passwords don't match" instead of "The password2 must be equal".
  - Recovery phrase page: a wrong password says so under the field instead of "Lifecycle: Error opening wallet seed file".
  - Receive (Modern): "Connecting…" instead of an empty "Listening via " while the Epicbox connection starts.
- Smaller downloads: the app no longer ships its development files (node_modules and source maps in app.asar), only the Chromium languages it uses, and stripped Linux helpers. Every release is now built with one scripted, checked flow.
