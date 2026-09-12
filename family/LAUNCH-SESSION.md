# Bounded launch session

The operator resumed issuance on 2026-09-12 with a **0.2 ETH cumulative session cap**, including launch value and gas. Historical wallet spending is reconciled into a canonical baseline and is not charged to this session. Failed transaction gas counts. Developer buy remains zero; only the existing attested PONS launch call is permitted.

`authorize-launch-session.mjs` is read-only by default. `--activate` requires observation mode, no unresolved birth, complete outgoing nonce reconciliation, the expected chain and factory bytecode, and an available launch configuration. It writes a local session allowance and expires no later than the current stream deadline or 30 hours. It never reads the signing credential. The local history file only supplies candidate transaction hashes; RPC receipts and canonical blocks verify them all.

The session ID must be explicitly passed through the runtime configuration. Both deployment preparation and the final browser signer enforce the cap. The signer repeats preparation immediately before signing. An unresolved nonce, insufficient wallet balance, or a maximum transaction cost exceeding the remaining allowance stops issuance. Manual transactions made by the operator after the baseline are not silently ignored: they require reconciliation before automated signing continues. Changing the runtime flag alone cannot renew an expired or exhausted session.

Fresh confirmed input from the bound source CA is required. Old queued trades are retained as expired, not replayed. The existing per-birth state, saved raw transaction and same-nonce recovery continue to prevent duplicate deployment. A replacement must fit the remaining budget as its full maximum cost; it does not receive a second independent allowance.

The public health/state endpoints expose `execution`, the cap, expiry and last reconciled spending. This is a software signing limit; it does not constrain transactions independently signed by the operator in another application. Observation and streaming continue when the launch allowance pauses. The watchdog reports degraded live sessions without killing a potentially active signer.

Checks: `node --test family/launch-session.test.mjs family/wallet-spend.test.mjs family/live-authorization.test.mjs family/browser-wallet.test.mjs family/policy.test.mjs`.
