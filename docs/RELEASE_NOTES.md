# Release notes

## 6.1.3

- Tor removed. Receiving and sending over Tor didn't work in the current form. It needs a rework and is postponed, with no ETA.
- Payment proofs removed from Send and Receive. They weren't fully working (never over Epicbox) and were very niche. A proof already on a transaction still shows in its details. The command-line wallet still has proofs (they barely work there too).
