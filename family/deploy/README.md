# Cloud cutover plan

Prepared for one Ubuntu 24.04 x86-64 VM, initially 2 vCPU / 4 GB RAM / 80 GB disk. This is a starting capacity, not a throughput guarantee; benchmark both founders and browser capture on the actual VM before switching production. No GPU is used by this runtime. The website stays on Vercel.

## Install after the VM is approved

1. Install Node 24 at `/usr/bin/node`, Python 3 with a virtual environment, and the Playwright Chromium system dependencies from their official distribution channels. Create the unprivileged `flyfamily` user.
2. Clone this repository to `/opt/flyfamily`. Create `/opt/flyfamily/venv`, install the upstream pinned scientific requirements, and run `npm ci` inside `family`. Install that package's Chromium version with `PLAYWRIGHT_BROWSERS_PATH=/opt/flyfamily/browsers npx playwright install --with-deps chromium`. Code, browser binaries and graph data should be readable by the service user but not writable by it.
3. Transfer the verified graph and annotations into `/opt/flyfamily/data`. Check the graph SHA-256 against `runtime.env.example`. Keep the MaleCNS CC-BY source attribution. These data files are not in Git.
4. Create `/etc/flyfamily` and `/var/lib/flyfamily`. Put the publisher credentials and prior-transaction reconciliation file under `/etc/flyfamily`, readable only by root and the service account. Copy the example to `runtime.env`. Never put wallet keys or publisher secrets into Git or build artifacts.
5. First run an isolated smoke test **without publisher credentials and without signing**, using a separate temporary state directory: Chromium renders PONS, both graph trials return, RPC chain is 4663, and logs contain no secrets. The production unit intentionally requires publishing/reconciliation files before starting.

## Transfer ownership of the queue

- Stop the Windows worker gracefully and verify its Node, Python and Chromium processes have ended. The currently running older process may need its owning terminal because it predates the stop-file helper.
- Take an SQLite online backup or a clean closed-database copy of `ledger.sqlite`; retain a separate backup. If copying while open, never copy only the `.sqlite` file without accounting for WAL. Move all existing signed transaction artifacts if any exist.
- Copy the database into `/var/lib/flyfamily` and set ownership to `flyfamily`. **Do not copy `process.lock` or `stop.request`.** Keep the existing run ID, revision, confirmed cursor and pending births. Starting with an empty ledger would lose continuity and can be rejected by the ingest API.
- Install `flyfamily.service` under `/etc/systemd/system`, then `systemctl daemon-reload` and `systemctl enable --now flyfamily`. Check `/state` locally and `/api/family` through the public website: same run ID, increasing revision, fresh camera/model timestamps, unchanged birth/transaction history.
- Only one publisher and one deployment worker may own this state. For rollback, stop the VM first, move its latest ledger back, then restart Windows. Never restart an older ledger in parallel.

The worker binds to localhost and publishes outbound HTTPS. No public inbound port 5190 is needed; keep management access restricted to SSH. The unit restarts on process failure, stops the whole process group, and refuses to remove a lock belonging to a live PID. A process that stays alive but loses a model/browser connection still requires operator inspection; a health monitor is separate work.

## Validation status

Deployment templates are prepared. They have not yet been installed or load-tested on a Linux VM. Automatic signing remains off. A successful cloud cutover is not a successful token launch; the latter needs its own verified receipt.
