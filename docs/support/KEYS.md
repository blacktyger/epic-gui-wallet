# The support key

Support reports are sealed to one X25519 key pair (src/shared/supportBundle.js).

| | Where |
|---|---|
| Private key | `~/.config/epic-gui-support/support-<keyId>.pem` on bt-asus (dir 700, file 600). Never in git, never in the app, never on the bot's server. |
| Public key | `src/shared/supportKey.js` (`SUPPORT_PUBLIC_KEY`, `SUPPORT_KEY_ID`), embedded in the app; a copy in `support-<keyId>.pub` next to the private key. |
| Current key id | `d9749febd701c2fe` (created 2026-10-20) |

**Back it up.** Without the private key no report can be opened. Keep an offline copy (e.g. an encrypted USB
stick or a password manager attachment), not a cloud folder synced in clear.

## Opening a report

```sh
npm run support:decrypt -- r7k2m9q4            # a report id from the bot: fetched over the tailnet (gfb token)
npm run support:decrypt -- report.epicsupport  # a file a user sent by hand
```

It writes `~/epic-support-reports/<name>/report.txt` and `logs/` (mode 700/600); `--print` also prints the
summary, `-o <dir>` picks another folder, `-k <key.pem>` another key. The key is chosen by the key id in the
report's header, so reports made with an older key still open as long as its `.pem` is kept.

## Rotating the key (if it may have leaked, or on a schedule)

1. Make a new pair on bt-asus:
   ```sh
   node --no-warnings -e "import('./src/shared/supportBundle.js').then(m => { const k = m.generateKeyPair(); \
     const d = require('os').homedir() + '/.config/epic-gui-support/'; \
     require('fs').writeFileSync(d + 'support-' + k.keyId + '.pem', k.privatePem, { mode: 0o600, flag: 'wx' }); \
     require('fs').writeFileSync(d + 'support-' + k.keyId + '.pub', k.publicKey + '\n', { mode: 0o600, flag: 'wx' }); \
     console.log(k.keyId, k.publicKey) })"
   ```
2. Put the new public key and key id in `src/shared/supportKey.js`; `npm test` checks they match.
3. Add the new key id to the bot's accepted list (`SUPPORT_KEY_IDS`, docs/support/INTAKE.md) **before**
   the release ships; keep the old id there until no tester runs a release with the old key.
4. Keep the old `.pem` (older reports and older app versions still use it). Delete it only after a leak, and
   then remove its id from the bot so it refuses new reports sealed to it.
5. Release notes: nothing for users to do.
