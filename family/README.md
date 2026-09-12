# FLYFAMILY live extension

This directory adds a shared read-only Chromium feed, confirmed market event queue, measured-output naming, repeatable PONS deployments and a family ledger to fruitflydev/flycoinrh. Original MIT LICENSE and NOTICE remain in the repository. MaleCNS data requires its separate CC-BY attribution.

## Run

Use Node 24 and the upstream Python scientific dependencies. In `family/`, run `npm ci` and `npx playwright install chromium`. Set the variables in `.env.example` in the process environment, then `node server.mjs`. It serves only read-only `/state` and `/frame.jpg` on 127.0.0.1:5190. A configured authenticated publisher sends snapshots to the FLYFAMILY frontend backend. All viewers see the same capture; the public browser cannot control the operator or wallet.

The normal run prepares deployments but does not sign. An operator may enable `--execute` with FAMILY_SIGNER_KEY_FILE after reviewing the policy. The total ceiling is 0.02 ETH including reconciled earlier transactions. No initial purchase. Creator tax is not added on top of PONS defaults. Secret keys never enter the browser, public snapshot, or repository. Use persistent storage and a single process; a restart resumes the confirmed-chain cursor and pending receipt. If a process is killed abruptly, verify its PID is no longer running before removing its process.lock.

## Mechanism v2

### Windows operation

`powershell -File family/manage.ps1 -Action Status -Config C:\path\family-runtime.json` checks the worker without exposing publisher secrets. The JSON contains the same non-secret environment values/secret-file paths as `.env.example`. Use `Start` to launch a hidden, logged preparation-only worker, or `Stop` for a graceful shutdown after the current model window. The launcher never enables signing, will not create a second worker, and leaves the ledger intact. It is not a cloud service or an automatic Windows startup task; the computer must stay awake. If an old worker predates the stop-file support, stop it from its owning terminal once before using this launcher.

`Start` also launches `keep-awake.ps1`: a process-scoped Windows execution request prevents idle system sleep while that exact Node process remains alive. Display sleep is still allowed; permanent Windows power settings are unchanged. PID plus process creation time identify the worker, and a named mutex prevents duplicate helpers. The helper exits within 15 seconds of worker exit, or when a file named `<its status JSON path>.stop` is created. Manual sleep, shutdown, network loss and Windows restarts can still interrupt the stream. Existing workers may attach the helper explicitly with `-WorkerId` and `-StatusFile`.

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

## External FLYBRAIN pilot (in progress)

`external-flybrain.json` pins the requested token's graduated Uniswap V4 PoolId, factory, hook, manager and GOOGL quote asset. `inspect-v4.mjs` selects a recent confirmed swap. `lib/v4-input.mjs` checks the canonical receipt, deployed code and factory registration; V4 positive target delta is a buy. External replays are labelled as tests and excluded from the founder's live volume baseline.

`pilot.mjs` prepares one deterministic test child from a measured two-seed assay and simulates deployment under the cumulative 0.02 ETH ceiling. Its direct `--execute` path is disabled: the requested execution must come from the actual PONS page. `browser-pilot.mjs` opens a dedicated local Chrome profile, fills the fixed metadata as host assistance, then applies the upstream FlyPilot cursor decoder. Its wallet provider exposes no key. A page transaction request is captured for the separate local signer; the provider returns only the resulting transaction hash. Personal terms must be accepted by the operator. There is no fallback click if the neural stop gate does not fire.

`cursor.py` uses the upstream untrained gain of 1.0 and a 12 ms decoder window; it also accepts 0.3 for an explicit comparison. The measured naming assay retains gain 0.3. These are separate parameterised trials, neither a calibrated brain nor learned language. The host selects and confines the cursor to the launch/confirmation control. Neural displacement and the DNp09 stop gate determine recorded motion and click timing. This assistance is logged in `build/external-pilot/cursor-steps.jsonl` and is not autonomous visual target discovery.

### One-time local credential import

Run `powershell.exe -NoProfile -STA -File family/key-import.ps1 -Config C:\path\family-runtime.json`. The form verifies the wallet address and saves Windows current-user DPAPI ciphertext in `%LOCALAPPDATA%\FlyFamily\signer.dpapi`. The directory permits only the current Windows user and SYSTEM. Permission and encryption checks run before requesting a key. DACL updates do not change the directory owner or require taking ownership. No key enters command-line arguments, logs, the browser, Git or Vercel.

After import, `auto-sign.mjs` waits for a fresh real PONS request and invokes `browser-sign.mjs --auto`. Scope is bound to the current test birth, chain 4663, one launch, a seven-day expiry and the cumulative 0.02 ETH ceiling. It verifies metadata, uploaded image, factory code, fees, caller, nonce reconciliation and simulation before signing. Decryption occurs only in local process memory. The signed transaction is persisted before broadcast so ambiguous outcomes resume the same transaction. Confirmation requires verified on-chain receipts. A failed check stops the signer; an expired browser request waits for a fresh request. This is a local process, not an automatic Windows startup service. General unattended reproduction beyond the one test child is not enabled by this import.
