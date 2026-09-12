# FLYFAMILY live extension

This directory adds a shared read-only Chromium feed, confirmed market event queue, measured-output naming, repeatable PONS deployments and a family ledger to fruitflydev/flycoinrh. Original MIT LICENSE and NOTICE remain in the repository. MaleCNS data requires its separate CC-BY attribution.

## Run

Use Node 24 and the upstream Python scientific dependencies. In `family/`, run `npm ci` and `npx playwright install chromium`. Set the variables in `.env.example` in the process environment, then `node server.mjs`. It serves only read-only `/state` and `/frame.jpg` on 127.0.0.1:5190. A configured authenticated publisher sends snapshots to the FLYFAMILY frontend backend. All viewers see the same capture; the public browser cannot control the operator or wallet.

The normal run prepares deployments but does not sign. An operator may enable `--execute` with FAMILY_SIGNER_KEY_FILE after reviewing the policy. The total ceiling is 0.02 ETH including reconciled earlier transactions. No initial purchase. Creator tax is not added on top of PONS defaults. Secret keys never enter the browser, public snapshot, or repository. Use persistent storage and a single process; a restart resumes the confirmed-chain cursor and pending receipt. If a process is killed abruptly, verify its PID is no longer running before removing its process.lock.

## Mechanism v2

- Only canonical, receipt-verified CurveBuy / CurveSell events after the starting cursor enter the queue; 20-block confirmation buffer. Pool graduation pauses until a verified adapter exists.
- Each buy/sell is a trigger; a minute containing >=4 trades, >=0.001 ETH, >=3x the previous five-minute average and >=5 baseline trades can additionally trigger one surge.
- One egg/deployment at a time, >=60 seconds between eggs, 8 waiting events, expire after 15 minutes. Overflow and expiry are recorded internally. No one-child lifetime limit. Insufficient or unreconciled budget pauses signing.
- Upstream FlyEye maps the current PONS screenshot to measured L1/L2 hex columns; additional central drive is buy→vpoEN, sell→vpoIN, surge→both. Two independent 40ms FlyBrain trials use seeds 17 and 29 and gain 0.3. This is not the earlier matched-control reproduction threshold and is not a validated physiological mating rule.
- Name syllables derive from a canonical SHA-256 of measured two-seed output; timestamps and request IDs are excluded. An ordinal differentiates identical measured names. This is a decoder, not language or intention. A new seed is inherited alongside the same graph/reference parameters. Child token confirmation does not start another brain worker automatically.
- Shared image: assets/flyfamily-logo.jpg; URL https://flyfamily.live/flyfamily-logo.jpg. X: https://x.com/flyfamilyrh. No individual accounts or posts.
- Persist signed transaction hash before broadcasting. Never create another nonce on ambiguous broadcast; receipt reconciliation is mandatory. Factory bytecode, chain, calldata, sender and token bindings are checked. Names/CA are displayed as confirmed only after a verified receipt.

## Visuals and limits

Ambient courtship is illustrative and may run when no trade exists. Actual eggs originate only in the trigger ledger. Browser mode is a shared capture of the dedicated PONS page. The browser prepares visible fields; the bounded deployment adapter creates the token via PONS's factory. The fly is not claimed to autonomously comprehend or complete the UI. The original project's general-purpose wallet browser is not enabled by this entry point.

The frontend shows the latest 100 family records and 30 trades; SQLite retains full history. Only founder-token trades are indexed in this version. Child tokens do not automatically become parents or sources of new trade stimuli. There is no guarantee of demand or liquidity. Runtime needs a persistent computer/container with Chromium, Python, graph data and disk; Vercel hosts the frontend, not this long-running process.

Run `npm test`. `node rehearse.mjs` exercises all three inputs and read-only PONS preparation without publishing a birth or signing. Full genuine launch is not considered tested until a real confirmed receipt is obtained under the operator budget.
