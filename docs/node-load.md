# Node load: what the GUI and epic-wallet ask a node, and why

Audit of 20 Oct 2026, after node.epiccash.com (behind nginx) ran out of open files. Branch fix/node-load.
Measured with a logging proxy in front of node.btlabs.uk, a throwaway wallet in a QA lane (netns + bwrap
home); harness in the audit report. Numbers are requests per minute for one open wallet.

## Before → after (one open wallet, Modern, external node)

| state (3 min each) | 6.1.5 req/min | fix/node-load req/min | bytes / 3 min | what changed |
|---|---|---|---|---|
| idle, unlocked, window visible, listeners stopped | 23.3 | **9.7** | 1212 → 210 KiB | GET /v1/status 5.7 → 2.0 (30 s poll); refresh from the node 2 → ~1 per block: get_tip 6.0 → 1.0, get_pmmr_indices + get_unspent_outputs 2.0 + 2.0 → 0.3 + 0.3; ready_for_txs 7.7 → 6.0 (epic-wallet's own 10 s thread, can't change) |
| window hidden (win.hide()) | 24.0 | **8.3** | 1243 → 211 KiB | GET /v1/status 6.0 → 0.7 (2 min while hidden), same refresh savings |
| window minimized (QA lane: Xvfb without a window manager, minimize is a no-op) | 23.3 | 11.7 | 1220 → 419 KiB | refresh savings only; on a desktop minimize counts as hidden ('window-hidden' from the main process) |
| Epicbox + HTTP listeners on (6.1.5 default) | 28.7 | ~16 (estimate: the run was stopped before this state) | — | the HTTP listener no longer runs by default: one epic-wallet process less, 6 ready_for_txs a minute less (12 on a node without ready_for_txs, then also 6 /v2/owner) |
| Check / rescan (empty wallet) | 50.6 (199 MB in 4.4 min) | unchanged | — | epic-wallet scan, only when the user starts it |
| locked; app closed | 0; 0 | 0; 0 | — | already silent in 6.1.5 |

Measured against node.btlabs.uk, which answers ready_for_txs. On node.epiccash.com each of epic-wallet's readiness checks
is 2 requests (ready_for_txs, then /v2/owner get_status), so its numbers per process double.

## Where each request comes from

| request | sender | where | how often |
|---|---|---|---|
| GET /v1/status (UA Mozilla/5.0) | GUI node status poll | src/App.vue startRefreshNode, src/shared/nodeVersion.js fetchNodeStatus | 6.1.5: every 10 s, visible or not. Now 30 s, 2 min hidden or minimized, doubling after each failure up to 5 min; a local node keeps 10 s (src/shared/nodePoll.js) |
| GET /v1/status 401 → POST /v2/owner get_status → POST /v2/foreign get_tip | the same poll, on a node whose /v1/status is locked | nodeVersion.js fetchNodeStatus | 6.1.5: all three on every poll. Now the way that worked is used directly; the full chain again every 10 min or when it fails |
| POST /v2/foreign ready_for_txs, then POST /v2/owner get_status when the node lacks ready_for_txs (the 730 B /v2/owner lines) | epic-wallet, every process (owner_api, Epicbox listener, HTTP listener) | epic-wallet v4.1.0 src/cmd/wallet_args.rs:1393-1405 (10 s thread), impls/src/node_clients/http.rs:264-281 | 6 checks a minute per process, forever; 2 requests each on a node without ready_for_txs. 6.1.5 runs 3 processes per open wallet (the HTTP listener by default); now 2 (the HTTP listener only when turned on) |
| get_tip ×3, get_outputs (500 commits a chunk, all chunks at once), get_kernel per unconfirmed tx, get_pmmr_indices + get_unspent_outputs with range proofs for the last 100 blocks (the repeated ~182 KB) | epic-wallet update_wallet_state, on every owner call with refresh_from_node = true | libwallet/src/api_impl/owner.rs:919-1060 (100-block rescan :1020, proofs impls/src/node_clients/http.rs:457) | 6.1.5: on the 60 s timer and on every new block, every 15 s while a tx is pending or the node could not update the wallet. Now once per tip (src/shared/walletSync.js refreshFromNode), local reads in between; retries back off 15 s → 2 min; 5 min hidden |
| get_unconfirmed_transactions (the whole mempool, with proofs) | epic-wallet Epicbox listener after each finalize | impls/src/adapters/epicbox.rs:570-578, libwallet owner.rs:679-743 | 1/s for up to 240 s per Epicbox send. The GUI cannot change it |
| get_pmmr_indices + get_unspent_outputs batches of 1000 with proofs | epic-wallet scan (Check / rescan, restore) | libwallet/src/internal/scan.rs:147-196 | back to back, ~50 req/min and ~45 MB/min on an empty wallet (199 MB for one rescan). Only when the user starts it |

Every request opens a new TCP connection (680 connections for 689 requests in the 6.1.5 run), at most 4 open at
once per wallet: that, times the number of open wallets, is the file-handle cost on the node.

Locked, and closed with "Sync in background" on: no requests at all (6.1.5 already). Trailing slash: 6.1.x strips it
from the saved address; now renderWalletToml strips it too before epic-wallet sees it (epic-wallet would ask
//v2/foreign: impls/src/node_clients/http.rs:130/267/297/366 join with format!("{}{}")).

## HTTP receiving is "this computer only"

resources/epic-wallet.toml:9 sets `api_listen_interface = "127.0.0.1"`, written into every 6.1 wallet's toml, and
epic-wallet's listener binds `api_listen_addr()` = interface:port (v4.1.0 src/cmd/wallet_args.rs:1480,
config/src/types.rs:91). So no other computer can reach port 3415, forwarded or not: 6.1.x Receive's "forward TCP
port 3415" advice and its port check could never be right. fix/node-load says so on Receive and leaves the
interface unchanged; binding 0.0.0.0 while the HTTP listener is on is a decision (firewall prompt, LAN exposure of
the foreign API).

## Notes for epic-wallet maintainers

1. **ready_for_txs fallback doubles every readiness check and lands on /v2/owner.** http.rs:264-281: nodes without
   `ready_for_txs` answer -32601, then `get_status` on /v2/owner follows. Remember "method not found" in the client
   (or check the node version once) and go straight to the fallback; better, add `ready_for_txs` to the node.
2. **A 10 s sync thread runs in every process, with no off switch.** wallet_args.rs:1393-1405 ("adjust interval as
   needed"): 6-12 requests a minute per process forever, also in owner_api with no wallet open and in
   `--offline_mode`. Run it only while a listener needs it, make the interval configurable, back off on errors.
3. **Every refresh rescans the last 100 blocks with range proofs, even at an unchanged tip.** owner.rs:1020 +
   http.rs:457: ~182 KB (about 110 outputs) per refresh, byte-identical until the next block. Skip it when
   `tip.hash == last_scanned_block.hash`; scan from `last_scanned_block.height + 1` with a small reorg window.
4. **Three get_tip per refresh, plus ready_for_txs and get_status.** updater.rs:211/217, owner.rs:987/1194: fetch the
   tip once per update_wallet_state and pass it down.
5. **wait_for_tx_in_mempool polls the whole mempool every second for up to 4 minutes,** after a stem post
   (fluff=false) that the txpool does not show yet. owner.rs:679-743, epicbox.rs:570-578. Ask for the kernel
   (get_kernel) instead, with backoff (1, 2, 4 … s, 60 s cap), off the listener thread (it blocks the listener now).
6. **A failed full scan is not checkpointed** (owner.rs:1000-1045, scan.rs:163-193): a restored wallet re-downloads
   the whole UTXO set (GBs) on every refresh until one scan completes. Save progress per batch; back off on failure.
7. **get_outputs fires all chunks concurrently** (http.rs:369-390): a 5,000-output wallet opens 10 connections per
   refresh. Bound the concurrency.
8. **No connection reuse:** one TCP connection per request (measured), so every client costs the node a file handle
   per call. Use a keep-alive client per HTTPNodeClient.
9. **get_onion_addresses on /v2/owner on every listener finalize, with the node api secret** (epicbox.rs:546,
   http.rs:514-528): only with Tor on, and never send the owner secret to a remote node.
10. **The node client ignores a trailing slash** (http.rs:130/224/267/297/366; the slate sender has the fix at
    adapters/http.rs:167). `trim_end_matches('/')` in `HTTPNodeClient::new`.
11. **start_updater takes milliseconds** (owner_rpc_s.rs:2532, owner_updater.rs:135): clamp it (≥ 30 s) or take seconds.

What the GUI can and cannot do from outside: there are no interval settings in epic-wallet.toml; the only knob is
the env `EPIC_OUTPUT_QUERY_SIZE` (chunk size, not the total). The GUI's levers are the number of processes it runs,
how often it calls refresh_from_node = true, and the node address it writes; all three are used on this branch.

## Not ours

- 155.138.255.56 (python-requests, GET //v1/chain and //v1/blocks/<same hash> every ~5 s): explorer.epiccash.com,
  the Epic team's explorer. Its sync script isn't in any public repo (EpicCash/epic_explorer has none), so the loop
  and the trailing "/" can't be pointed to. Ask them to use their own node, drop the "/", and ask for a block only
  when /v1/chain's tip changed.
- 91.84.105.43 (epic-client /v2/foreign several a second + EpicWallet/5.3.0): an end user on GUI 5.3.0, which
  refreshes from the node with summary, txs and outputs all refresh_from_node = true (3 full refreshes a minute)
  and can stack status loops (App.vue:398 in v5.3.0). Fixed by upgrading; rate-limit /v2/foreign per IP in nginx.
- 68.209.135.135, 5.175.188.98, 159.196.178.10 (/v2/owner about 1/s): other people's epic-wallet processes, the
  10 s thread above times several processes (likely leaked listeners). Not in our code or hosts.
- EpicWallet/5.3.x GET /v1/status every 30 s, one with //v1/status: old GUIs (5.3 joins baseURL + '/v1/status'
  unnormalised, nodeService.js:123). 6.x strips the slash.
- 81.108.135.138 (UA "node"): our dev machine (QA runs and agents' quick checks). Tests use node.btlabs.uk first.
- 147.93.107.186 epic-status: ours, handled separately (hostinger-nginx-harden).
