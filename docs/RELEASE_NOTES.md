# Release notes

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
