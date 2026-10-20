# Release notes

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
