# English field station

The observation-only browser follows the exact URLs in `lib/field-study.mjs`.
It visits the English reading station, MIT's Sonnet XVIII source, a contrast
scene, a moving light and a family portrait. No random navigation or transaction
clicks occur in this itinerary. The browser locale is `en-US`; a CJK text check
rejects an unexpected source page before the study resumes. New destinations
must be reviewed in the browser before being added to the allowlist.

The host chooses a visible target and holds the field during model sampling.
`brain.py` passes the recorded coordinates to upstream `FlyEye.look`, then runs
both seeds on the same screenshot. Market-input trials retain the matched
no-market-input control. `vision_record.py` exports bounded grayscale thumbnails
and at most 640 samples from each retinal input population. Full input arrays
still drive the model. The image checksum covers decoded normalized grayscale
pixels; the scene and crop are JPEG display derivatives.

Up to 12 recent encounter records live in SQLite metadata `fieldObservations`.
Repeated target/kind pairs replace their previous thumbnail. The public snapshot
keeps the newest entries within a 480 KB budget, below the relay limit.
Every completed observation also retains compact numeric evidence and image
fingerprint in the SQLite `field_observations` table. TX dossiers reference that
visual evidence without repeating thumbnails or retinal arrays. The archive omits dense retinal
point arrays but retains the capture, coordinates, checksum and founder rates.
Full latest telemetry is presented separately. Video is buffered HLS; evidence
panels keep their own exact capture timestamps instead of claiming wall-clock
alignment with buffered video.

Reading notes are curated literary context. Computed findings report measured
differences in activity. This does not add a semantic language model or turn
independent visual trials into online weight training. There are no per-frame
LLM calls. Signing configuration and the bounded launch workflow are unchanged.

Validation: `test_vision_record.py`, plus root workspace
`scripts/verify-field-study.mjs`, `verify-field-model.mjs`, and
`verify-field-ui.mjs`. The UI check uses an actual independent model sample as
a browser-intercept fixture; fixture data is never published as a live sample.
