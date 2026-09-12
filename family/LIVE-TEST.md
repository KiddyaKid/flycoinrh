# Bounded live acceptance run

The worker now separates chain collection, brain trials, browser capture and publication. The chain lane targets a 3-second interval; RPC time can lengthen it. A recent-block view exposes provisional transactions, but only receipt-checked canonical events at the existing 20-block depth enter the durable queue. Transactions, triggers and execution journal entries are stored in SQLite.

The optional video-only endpoint on `127.0.0.1:5191/video.mjpeg` streams actual Chromium captures. It exposes no wallet, control API, files or raw transaction payloads. The site's JSON snapshot remains a fallback. The local desktop helper currently uses a temporary Cloudflare Quick Tunnel for this experiment, not a production video distribution service.

## Next live child

The operator's 2026-09-12 instruction authorizes one additional live acceptance birth under the existing cumulative 0.02 ETH limit. `next-live-test.json` in the local credential directory binds that allowance to the first eligible birth from the configured founder token after its start time. It cannot authorize a second birth or an external historical replay. The earlier imported credential and earlier test scope are preserved.

For that birth the worker creates a dedicated `build/live-pilots/<birth-id>` directory and starts the browser and bounded signer. The PONS page must produce `eth_sendTransaction` after a decoder-gated click. The signer checks metadata, factory, chain, fixed-logo content identifier, social links, economics, cumulative spend and wallet nonces. It persists the signed transaction before broadcasting. Recovery reuses the same transaction rather than allocating another nonce.

The browser's form targets are host-selected and clamped. Its displacement and stop gate come from the upstream decoder; intermediate cursor positions are display interpolation to a measured endpoint. These controls do not establish natural mating or language understanding. PONS terms, page changes, absent eligible clicks or receipt failures can still pause the run and require operator investigation.

## Acceptance status

The existing historical external test is confirmed. The new live path is enabled and waiting for a fresh founder-token transaction; no new token is claimed until its verified receipt exists. Unit checks cover identity/deduplication, bounded authorization, logo attestation and independent worker lanes. A browser check verifies the measured cursor endpoint; the public stream test received 122 actual frames in a 10-second observation. Full live transaction-to-receipt acceptance remains pending.

Learning and independent child simulations are not enabled by this change. The two founder measurements remain independent seeded trials.
