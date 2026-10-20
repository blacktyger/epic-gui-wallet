# Proposal: offering the Epic blockchain bootstrap in the GUI wallet

Status: proposal, nothing implemented. Researched 2026-10-20. "Unverified" marks what I could not confirm.

## Summary and recommendation

An official bootstrap exists: `https://bootstrap.epiccash.com/bootstrap.zip`, 4.04 GB, rebuilt about daily, from the node's `chain_data`. It has **no checksum or signature** that I could find. The epic node 4.1.0 source **does not re-verify what it opens**: a tampered or wrong `chain_data` is trusted at startup (details below).

**Recommendation: offer it, but only as an explicit opt-in, never automatic, and only under these conditions:**

1. The built-in node has no chain data of its own, or has been reset ("Download the blockchain again"). Never offered over existing data silently.
2. The user is told plainly it is a large download (4 GB, about 5 GB on disk once unpacked) from the Epic project's server, and that the coins are never at risk: a wallet's coins live in its seed, and the wallet checks outputs against the node it talks to.
3. Integrity is addressed before the first release. Choose one (see open questions): (a) the Epic team publishes a `.sha256` next to the zip and the wallet reads it from a second host (GitHub release or epiccash.com), or (b) the wallet pins the hash of a snapshot it has itself verified, or (c) after unpacking, the wallet lets the node re-validate (`validate` is not run by the node on startup; it would need an epic change or a node run flag, which does not exist today: unverified).
   Without (a)–(c), the honest position is "downloaded over HTTPS from the project's own server": that is the same trust as downloading the node itself, and the download is only a head start, the node still follows the longest valid chain from peers.
4. Ship as Settings-only first (both interfaces), behind the existing chain-data offer. Do not put it in first-run screens until testers say the plain P2P sync is too slow.

Don't offer it if free space is under ~12 GB on the drive holding the app root, or if a wallet is open and syncing from this node mid-send.

## Findings

### The official bootstrap (checked 2026-10-20)

| | |
|---|---|
| URL | `https://bootstrap.epiccash.com/bootstrap.zip` (HTTP/2 200, nginx, `Accept-Ranges: bytes`) |
| Size | `Content-Length: 4044191468` (4.04 GB) |
| Fresh | `Last-Modified: Tue, 20 Oct 2026 00:16:48 GMT`, about 8 hours old at the check. Cadence unknown (probably a cron; unverified) |
| ETag | `"6ad6b2f0-f10d76ec"` (not a content hash) |
| Checksum / signature | `bootstrap.zip.sha256`, `.sha256sum`, `.md5`, `.sig`, `.asc`, `sha256sums.txt` all return 403. Directory index also 403. Nothing found on GitHub (EpicCash org repos searched) or epiccash.com. **None.** |
| Where it is referenced | Only `EpicCash/epic-node-docker/entrypoint.sh`: `wget --no-check-certificate https://bootstrap.epiccash.com/bootstrap.zip`, `rm -R ~/.epic/main/chain_data`, `unzip … -d ~/.epic/main` ([source](https://github.com/EpicCash/epic-node-docker/blob/master/entrypoint.sh), cloned 2026-10-20). Note `--no-check-certificate`: the project's own script does not even verify TLS. No mention in EpicCash/documentation or the epic repo. No producer script found in any EpicCash repo (unverified how it is made). |

Format: plain zip (deflate), 29 entries, no zip64 needed. I read the central directory by range request (last 300 KB only; the full file was not downloaded). A single top folder `chain_data/` holds the layout the app already knows (`legacyScan.js`: `lmdb`, `header`, `txhashset`):

```
chain_data/lmdb/data.mdb               2.61 GB unpacked (2.16 GB zipped)  + lock.mdb
chain_data/header/header_head/…        ~0.57 GB   (pmmr_hash.bin 241 MB, pmmr_data.bin 335 MB)
chain_data/header/sync_head/…          ~0.57 GB
chain_data/txhashset/kernel/…          ~0.77 GB   (kernel pmmr_data.bin 468 MB, pmmr_hash.bin 263 MB)
chain_data/txhashset/output/…          ~0.05 GB
chain_data/txhashset/rangeproof/…      ~0.25 GB
chain_data/peer/                       empty folder
```

Unpacked total about 4.8 GB (my sum of central-directory sizes). The header hash file is 240.7 MB; at the app's ~64 bytes per header that is on the order of 3.7 million headers (rough, unverified against an explorer). There is no height marker file and no `epic.lock`.

Other sources: no wallet or miner in the EpicCash org mentions it other than the docker script (old GUI `epic-gui-wallet` has no bootstrap code). Community mentions: none verified (web search was unavailable from this machine).

### Trust model: what the node does with an existing `chain_data`

Read from EpicCash/epic master (commit `2a8aa1f`, 2026-10-17), `chain/src/chain.rs` and `chain/src/txhashset/txhashset.rs`:

- On start, `Chain::init` calls `setup_head` (chain.rs:1569). With a head in the store it loads the head header from lmdb, rewinds the MMRs to it and runs only `extension.validate_roots(&header)` (chain.rs:1596): the MMR roots must match the **stored** header. If the head has no stored `block_sums`, it recomputes kernel sums (`validate_kernel_sums`, chain.rs:1611). Bootstrap data carries block sums, so that heavy step is skipped.
- It does **not** re-check proof of work of stored headers, does not verify rangeproofs or kernel signatures (`verify_rangeproofs`, `verify_kernel_signatures`, only inside `TxHashSet::validate(fast_validation=false)`, txhashset.rs:1278), and does not compare the stored chain to the genesis hash.
- Full `validate` is called only (a) after downloading a txhashset from a peer (state sync, chain.rs:1068, `fast_validation = false`), and (b) every so often as `validate(true)` (fast: no rangeproofs/signatures) after processing blocks, which panics on failure (`adapters.rs:806`).
- So a P2P sync by the node verifies everything itself; a bootstrap is trusted wholesale. A corrupted zip is caught by zip CRC; a corrupted or truncated unpack by `setup_head` (it falls back block by block, or errors). A *deliberately* forged `chain_data` (fake headers with high stored difficulty, or an inflated supply that still has consistent roots) would not be detected on open. Real risk comes from a compromised server or a TLS-stripping network; with TLS verified it equals the risk of the download page being hijacked.
- What it cannot do: steal coins. Coins are the wallet's seed; a forged chain could mislead about balance, confirmations, or make a send fail, not move funds. Mitigation worth stating in the UI: after the node reaches the network tip, peers' longer valid chain replaces a shorter forged one (normal fork choice, unverified for a forged high-difficulty chain).
- Other risks: **stale snapshot** (harmless: node syncs the rest from peers, which is the point), **wrong fork** (the chain-data offer note in `chainOffer.js` shows the node keeps syncing from older main chains; a testnet/floonet zip placed on mainnet is not detected by `setup_head`, so the wallet must only offer mainnet's file for mainnet), **zip-slip** (the extractor must reject names that leave the target after normalising, absolute names, drive letters, `..`, symlink entries, and anything not under `chain_data/`; also reject entry names with `:` on Windows because of NTFS alternate streams), **disk exhaustion** (zip bomb or full disk: check the declared sizes against free space first, stop at actual bytes written > declared + margin).

### Plain P2P sync vs download

No measured figures; I did not time a sync. By the numbers: 4.04 GB at 25 / 100 Mbps is about 22 / 5.5 minutes plus unpacking 4.8 GB (a few minutes on an SSD, much longer on a hard disk or with antivirus scanning each file). The node's own sync downloads all headers (the 480 MB of header files above are about that), then a txhashset zip from a peer, then validates it with the full rangeproof/signature pass, which on a laptop CPU is the slow part (measure before quoting a figure). Unmeasured: the actual time of a fresh 4.1.0 sync on the test rig. **Open item: time a fresh built-in-node sync on Windows and Linux to decide whether this feature earns its complexity.** Keep that to plain "how long it took" from the testers (see the message at the end).

### Fit with the existing chain-data offer

`chainOffer.js` offers *existing local* chain data once when the built-in node is switched on in Settings (`shouldCheck` returns false if the node has its own `chain_data/lmdb`, uses `nodeChainDir`, or the answer is recorded in `settings.json` under `node.<net>.chainOffer`). `foundPlan.js` states chain data is **not** part of the found screen. `chaindata.js` has `offer_*` and `reset*` strings; "Download fresh" and "Download the blockchain again" now mean "let the node sync from the network".

Proposed placement (nothing else changes):
1. **Settings › built-in node, no data found** (today: offer is skipped, the node simply syncs). Add: "Download a head start" as a second choice beside "Download fresh". Mainnet only.
2. **"Download the blockchain again" confirmation**: add the same choice there.
3. **Node far behind** (a later phase, once testers confirm): if height is more than a threshold behind the tip, show a one-time toggletip suggestion, never a blocking dialog. Needs a node height source (`nodeHealth.js`/`walletSync.js` already track it; the threshold is an open question).
4. Not on Welcome or the found screen.

New settings record next to `chainOffer`: `node.<net>.bootstrap = { checkedAt, answer: 'used' | 'declined' | 'failed', at, bytes }`.

## UX (exact English copy)

Both interfaces share the strings in `src/lang/chaindata.js` (`bootstrap_*`); the other six languages need translations (the i18n test fails without them, per the 6.1.4 note). Modern uses a card with the wallet's usual button pair; Classic uses the same dialog-style block the chain-data offer uses. Same words, same two actions in both.

**Choice (Settings, where the offer appears, or inside "Download again")**

- Title: `Get a head start`
- Lead: `The built-in node can start from a copy of the blockchain made by the Epic project. This is faster than downloading it all from other computers.`
- Facts (list): `Download: about 4 GB` · `Space needed: about 12 GB free until it finishes, 5 GB afterwards` · `Copy made: {0}` (from the server's date; hidden if unknown)
- Note (with an info button, toggletip like the wallet-folder one): `The copy comes from the Epic project's server. Your coins are not stored in it and cannot be taken by it. The node keeps checking new blocks as it catches up. If you'd rather not trust a downloaded copy, choose “Download fresh”: it takes longer but checks everything itself.`
- Buttons: primary `Download the head start`, secondary `Download fresh` (same meaning as today).

**Not enough room**: `There is not enough free space on {0}. Free about {1} GB, or choose Download fresh.` The primary button is off until fixed.

**Progress** (Modern: card with a bar; Classic: the same text with the native bar):
- `Downloading… {0} of {1}` (with a Cancel button) → `Checking the download…` → `Unpacking…` → `Starting the node…`
- Line under it: `You can keep using the wallet. The node is not running until this finishes.` (wallet screens that need the node show their existing “node not ready” state)
- Cancel: `Cancel` → `Stop the download? You can start it again later and it continues where it stopped.`

**Failure** (one calm sentence + the action; detail in the log, not in the screen):
- Download: `The download stopped. Check your internet connection and try again.` Buttons `Try again`, `Download fresh`.
- Damaged: `The downloaded file is damaged. It was not used.` Buttons `Download again`, `Download fresh`.
- Unpack/disk: `The copy could not be unpacked, so it was not used.` Buttons same.
- In every failure the old chain data is untouched.

**Done**: `The head start is ready. The node is starting and will catch up with the newest blocks.`

## Implementation outline

Modules (all pure/injectable, tested with `node --test`, like `chainOffer.js` and `appPaths.js`):

- `shared/bootstrapPlan.js` (pure): constants (URL, `chain_data/` prefix, margin), `shouldOffer(settings, network, ownChainExists, platform)`, `spaceNeeded(archiveBytes, unpackedBytes)` (archive + unpacked + 1 GB; free ≥ both at once), `safeEntry(name, targetRoot, pathMod)` (the zip-slip rules above), record builders.
- `shared/bootstrapFetch.js`: HEAD for size/date, Range-resumable download to `<root>/node/main/bootstrap.zip.part` (same drive as the target so the final step is a rename, not a copy; avoids the OS temp folder, which may be on a small drive), `If-Range`/ETag check on resume, size must equal `Content-Length`, progress events, user cancel, atomic rename to `bootstrap.zip` on success. TLS must be verified (no `--no-check-certificate` equivalent).
- `shared/bootstrapUnpack.js`: streaming unzip into `<root>/node/main/chain_data.new/`. Zip reading is not in the app today (no zip dependency in `package.json`). Options: add one small, well-known pure-JS reader (`yauzl`) and write the entry loop myself (so `safeEntry` is applied to each name, plus a running byte count against the declared sizes); or shell out to `tar.exe` (bsdtar, in Windows 10 1803+, also reads zip) which reduces control over entry names. Recommend yauzl: one dependency, same behaviour on all three systems. PowerShell `Expand-Archive` is not advised (very slow on a 4 GB file, buffers).
- `shared/bootstrapVerify.js`: CRC per entry (zip does it), the expected file list present (`lmdb/data.mdb`, `header/header_head/pmmr_hash.bin`, `txhashset/{kernel,output,rangeproof}/pmmr_hash.bin`), sizes sane, plus the hash check from the open questions when a hash is available.
- Service in `background.js` + IPC, with the renderer showing the state machine `idle → choose → downloading → verifying → unpacking → swapping → starting → done | failed`.

Steps and ordering:
1. Check mainnet only; the node for this network must be **stopped** (the app already stops it for chain-dir changes; the node refuses a second run on the folder: "epic server already running?").
2. Free-space check on the drive of `<root>` (and the temp drive if different) for archive + unpacked + margin.
3. Download to `.part` (resumable, tolerant of the app being closed; resume on next offer, show “continue”).
4. Verify download (size, CRC while unpacking, hash if available).
5. Unpack to `chain_data.new`, verify file list.
6. Swap: if an old `chain_data` exists, rename it to `chain_data.old-<date>` (never delete automatically; the user can delete it later, mention it in the reset flow as the existing text does), then rename `chain_data.new` → `chain_data`, write the `bootstrap` settings record, delete `bootstrap.zip` (ask? keep default: delete), start the node. If the rename fails, rename back and report.
7. On failure at any step: delete only the files this flow created, by exact path (`.part`, `chain_data.new`); old data untouched.

Windows: root is `%USERPROFILE%\.epic-gui\node\main\chain_data` (appPaths.js). The longest entry is `…\.epic-gui\node\main\chain_data.new\txhashset\rangeproof\pmmr_leaf.bin.efef608ac9bf`, well under 260 characters unless the root is moved by `location.json`; check that `root.length + 80 < 260` or use the `\\?\` prefix. Antivirus can slow or lock files while unpacking: retry renames a few times with backoff and say `An antivirus program may be checking the files. This can take a few minutes.` in the progress note if unpacking is slow. `data.mdb` is 2.6 GB: write with streams and no whole-file buffers.

Tests: pure planning (offer rules, space math, entry-name rules including `..`, absolute, `C:\`, `a:b`, symlink flags, outside-prefix), the resume logic against a local test HTTP server with Range, a tiny generated zip for unpack, swap and rollback on injected failures, a truncated/corrupt zip, a full-disk simulation (fs injected), translation parity for the new `bootstrap_*` strings. Manual: a real run on the Windows rig and Linux, with timings.

## Open questions

1. **Integrity.** Will the Epic team publish a hash/signature (or an `X-Checksum` header) with each snapshot? Without it the feature relies on server and TLS alone. Is a hash from another host acceptable to the user as a compromise?
2. **Who produces it, how often, from what node version (3.x or 4.1.0)?** The file list matches what 4.1.0 reads; the "same store since 3.0.0" evidence in `chainOffer.js` covers older producers.
3. **Is the URL stable and willing to carry traffic from every GUI user?** A 4 GB download per fresh install is heavy for one nginx host. Ask the Epic team before shipping; consider also a mirror.
4. Threshold for "node far behind" and whether to offer at all there.
5. Disk-space numbers: confirm the 12 GB figure (4 + 4.8 + margin) is not too conservative for small laptops.
6. Should the old `chain_data` be kept (renamed) or removed after success? Plan keeps it, with the existing “nothing is deleted” wording.
7. Measured P2P sync time on current mainnet, to justify the feature.

## Message for testers

Hi all, we're thinking about adding an optional "head start" for the built-in node in the Epic wallet. When you turn the node on for the first time, or choose “Download the blockchain again”, you would be able to download a ready-made copy of the blockchain from the Epic project's server (about 4 GB), instead of letting the node fetch everything from other computers. It could save a lot of waiting, but it needs about 12 GB of free space while it works, and the copy is trusted as it comes (the project does not publish a checksum yet), though your coins are never in it and the node keeps checking new blocks. “Download fresh” would stay as it is. Would you use it? How long did a fresh node sync take you, and on what kind of computer and connection? Anything about “trusting a copy” that would make you uneasy?
