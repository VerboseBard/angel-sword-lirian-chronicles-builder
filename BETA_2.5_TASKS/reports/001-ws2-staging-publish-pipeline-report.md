# Report — Task 001: WS2 staging publish pipeline (emit + deploy-sim)

## 1. Outcome vs the verification checklist

- [x] `npm run build` — **skipped, by the brief's own rule.** No `src/js/*` file was
  touched (only new `scripts/*.mjs` files plus `package.json`/`.gitignore`), and the
  brief says pure `scripts/*` additions don't need it. `npm start`/`npm run build`'s
  own `build-owlbear.mjs` step is exercised anyway, because `publish-staging.mjs`
  shells out to it before every emit.
- [x] `npm run test:vtt` — **green.** 109 adapter checks + 48 opener-bridge checks +
  Playwright panel phase + bridge phase all passed, unchanged from the documented
  baseline in `BETA_2.5_PROJECT_STATE.md`.
- [x] `npm run test:dice-skins` — **green.** "Dice promotion, shared-core, registry,
  and routing tests passed." No dice files were touched by this task; ran to confirm
  no regression as instructed.
- [x] Fresh emit with a dummy base URL (`https://staging.invalid/as`) → deploy-sim
  check green — **green.** `node scripts/test-staging-deploy.mjs` (also wired as
  `npm run test:staging`) performed a from-scratch emit and reported: "Checked 46
  condition(s) covering 2 manifests and 28 closure files. PASS - deploy-simulation
  green for base URL https://staging.invalid/as."
- [x] Emit is deterministic enough to rerun cleanly — **green.** Verified directly:
  injected a stray file (`dist-staging/STALE_MARKER.txt`) and a stray subdirectory
  (`dist-staging/owlbear/stale-subdir/junk.js`) into a prior emit, reran
  `publish-staging.mjs`, and confirmed both were gone afterward (the script does a
  full `rm -rf` of the output directory before every emit, so reruns can't
  double-nest or leave stale files by construction). File count was stable at 36
  across two consecutive runs.

All required checks are green. Nothing was uploaded anywhere; no dev server or sim
server was left running (verified via `Get-NetTCPConnection` after the fact — the
project's dev server on :4176 was already running before this task started, at
10:21 AM, many hours before this session; this task never started it and left it
untouched).

## 2. Work narrative

**Context reading.** Read `BETA_2.5_PROJECT_STATE.md`, the task brief, then
`BETA_2.5_ONLINE_CONVERSION_PLAN.md` §§1-2, `scripts/build-owlbear.mjs`,
`scripts/server.mjs`, both `manifest.json` files, and searched the repo for any
prior "deploy simulation" description before designing anything, per the brief's
instruction. Found `scripts/test-cross-browser.mjs` already has a `DEPLOY_TEMP_DIR`
("deploy-temp-dist") pattern that copies `index.html` + `assets/` + `owlbear/` (not
`owlbear-dice/` — it predates the dice extension) and serves it through the *real*
`server.mjs` (via `LYRIAN_PROJECT_ROOT` override) rather than a dumb static server.
That script rewrites manifests exactly the way local dev does, i.e. it does **not**
prove the artifact works without serve-time rewriting, which is the specific gap
this task closes. I deliberately named my output directory `dist-staging/` (not
`deploy-temp-dist/`) to avoid any collision with that other script's directory, and
did not modify or run `test-cross-browser.mjs` (not in this task's required suite
list, and its scope — the whole builder app — is explicitly out of scope here).
Also read `BETA_3_OWLBEAR_RELEASE_ROADMAP_2026-08-23.md`; it describes staging as a
release *gate* to pass, not a pipeline shape, so it added context but not a design.

**Reading `scripts/server.mjs`'s serve-time behavior (the thing to bake instead).**
`serveStatic()` special-cases requests matching `owlbear(-dice)?/manifest.json`:
it parses the JSON, computes `base = http://<host>/<extDir>/`, and rewrites exactly
four fields — `icon`, `background_url`, `action.icon`, `action.popover` — via
`new URL(value, base).href`. Everything else is served byte-for-byte with a MIME
lookup and either `no-store` or `public, max-age=60` cache-control, plus permissive
CORS on `/owlbear*` paths. Only the manifest rewrite has no static-hosting
equivalent; that is the one behavior this pipeline bakes at emit time
(`absolutizeManifest()` in the new shared lib mirrors this function's logic
exactly). Cache-control/CORS are serve-time conveniences a real static host either
supplies itself or doesn't need for this check; the brief's "no COOP dependence"
line is the one hosting-header constraint that's load-bearing, and it's a host
choice, not something the emitted artifact can enforce.

**Working out what "everything the extension pages load at runtime" actually
means, by reading the real pages instead of guessing.** Read every HTML/JS file
under `owlbear/` and `owlbear-dice/`. Key findings:
- `owlbear/panel.html` and `owlbear/background.html` only ever load their own
  `dist/*.js` bundle plus `icon.svg` — no dependency outside the `owlbear/` folder
  besides `fetch("/api/vtt-relay/events")`, which is the already-shipped (WS1,
  live-verified) dev-relay fast path — it's wrapped in try/catch with an explicit
  "local builder server may be offline; keep trying quietly" comment, so it's
  already tolerant of 404s on static hosting. Deliberately **not** part of the
  asset closure — it's an API call the sim server is not meant to implement
  ("no relay endpoints" is explicit in the brief).
- `owlbear-dice/panel.html` and `owlbear-dice/overlay.html` each carry an inline
  loader `<script>` that pulls the dice engine from **outside** their own folder:
  `../assets/dice/promoted-dice-skins.registry.js`, `../assets/vendor/three.min.js`,
  `../assets/vendor/GLTFLoader.js`, and eight `../assets/dice-3d/*.js` files, plus
  whatever sidecars the registry names. This is why the emitted folder can't just
  be "owlbear/ + owlbear-dice/, self-contained": the dice pages are hard-wired to
  a sibling `assets/` directory one level up, so the emit has to reproduce that
  same relative layout (`<out>/assets/...` next to `<out>/owlbear-dice/...`), which
  it does.
- `owlbear-dice/background.js` opens `overlay.html` at runtime via
  `new URL("overlay.html", window.location.href)` — this page is **not** referenced
  by `manifest.json` or by any other HTML file's markup, so a pure
  manifest-plus-markup crawl would silently miss it. Found by reading
  `background.js` directly, not by assumption. Recorded as `EXTRA_ENTRY_HTML` in
  the shared crawler with a comment explaining why it can't be auto-discovered
  (it lives inside a minified `dist/background.js` bundle at runtime; regex-crawling
  minified bundles for `new URL(...)` targets was judged not worth the fragility
  for one well-understood exception).
- Token images (`buildImage`/`buildImageUpload` in `owlbear/panel.js`) are all
  client-supplied data URLs from the postMessage handoff, not bundled files —
  confirmed by reading every call site, so nothing else needed adding there.
- **Important, deliberately-scoped finding:** `owlbear/panel.js`'s
  `resolveBuilderUrl()` is `new URL("..", window.location.href).href` — i.e. it
  opens the character sheet at *one directory above wherever `owlbear/panel.html`
  itself is hosted*, with no override. This means the "Open My Character Sheet"
  button only works if the full builder app (`index.html`, `assets/app.bundle.js`,
  `src/js/*`, etc.) is hosted at the *same base URL* as the two extension folders
  this pipeline emits — the builder is not emitted by this pipeline. This is
  exactly the situation the brief anticipated and told me not to expand scope
  around; flagged below as a question rather than acted on.

**Sizing the closure instead of copying `assets/` wholesale.** `assets/dice-3d/`
alone is 48MB and `assets/dice/` is 22MB, but most of `assets/dice/` is QA
screenshots (`assets/dice/qa-rolls/*`, ~50 PNG/JPG files) and glamour/preview
renders that nothing in `owlbear-dice/` ever references — confirmed by grepping
`owlbear-dice/panel.js`'s `<select>`-building code, which only sets `option.value`/
`option.textContent` from the registry's `id`/`name` strings, no thumbnail image.
Also found `assets/dice-3d/promoted/` has **six** files
(`asari-d20.js`, `asari-full-set-draft.js`, `exact-reference-test.js`,
`leaflit-full-set.js`, `my-custom-dice-set.js`, `rana-full-set.js`) but the
promoted registry's `faceArtScript` field only names **three** of them
(`asari-full-set-draft.js`, `leaflit-full-set.js`, `rana-full-set.js` — the other
three are unpromoted dev/test artifacts). A "copy the whole `dice-3d` folder"
approach would have shipped roughly double the necessary sidecar weight and stale
test data. The crawler instead parses the registry's real `faceArtScript` entries
and copies exactly those. The resulting real closure is 14 shared files totaling
45MB — in the same range as the "~42MB dice payload" already recorded in the
project state, which cross-checks that the crawl is neither too narrow nor
accidentally pulling in unrelated weight.

**Design and implementation.** Built one shared module,
`scripts/lib/owlbear-staging-assets.mjs`, used by both the emit and the verifier so
they can't drift apart:
- `crawlExtensionAssets(rootDir)` — seeds from each manifest's four URL fields plus
  `EXTRA_ENTRY_HTML`, crawls each HTML seed for further `script`/inline-loader
  references via a two-step regex (grab every quoted token with no embedded
  quote/whitespace, then keep only the ones that both end in a known asset
  extension and look like a relative path — deliberately split into two simple
  checks instead of one clever regex, to avoid greedy-quantifier/backtracking
  edge cases and stay easy to verify by inspection), then parses any
  `promoted-dice-skins.registry.js` it finds for `faceArtScript` sidecar paths.
  Runs identically against the live source tree (for the emit) or the *staged*
  output tree (for the verifier's independent re-check).
- `manifestValueToExtRelative()` handles the one asymmetry between those two runs:
  a source manifest's `icon` field reads `"icon.svg"` (relative), but a staged
  manifest's now reads an absolute URL — the function detects an absolute URL and
  extracts the extension-relative path back out of its `pathname` instead of
  naively path-joining a URL string. Caught this while designing (an early sketch
  would have silently produced garbage paths when the verifier re-crawled the
  staged tree) and fixed it before ever running the script.
- `absolutizeManifest()` mirrors `server.mjs`'s per-request rewrite, baked once.

`scripts/publish-staging.mjs` (also `npm run publish:staging`): requires a base URL
(`--base-url=`, a bare positional arg, or `LYRIAN_STAGING_BASE_URL` env — no
default, so no host is ever favored, per the brief); rebuilds the esbuild bundles
first (`build-owlbear.mjs`) so the emit can never ship a stale `dist/`; wipes and
recreates `dist-staging/`; copies `owlbear/` and `owlbear-dice/` wholesale
(cheap — 208KB and 231KB respectively); copies exactly the crawled shared assets;
rewrites both staged `manifest.json` files in place.

`scripts/test-staging-deploy.mjs` (also `npm run test:staging`): calls
`publishStaging()` directly (no subprocess) for a guaranteed-fresh emit, defaulting
the base URL to `https://staging.invalid/as` — the brief's own example, on the
IANA/RFC 2606 `.invalid` TLD reserved for addresses guaranteed not to resolve, so
this default can't be read as favoring a real host; `publish-staging.mjs`'s own
CLI has no such default. Starts a hand-rolled static server bound to an ephemeral
port (`listen(0, "127.0.0.1")`) that serves only files that exist, sets exactly one
header (`content-type`), and does nothing else — no CORS, no cache-control, no
COOP/COEP, no `/api/*` handling. Then: fetches both manifests and checks each is
valid JSON; checks every URL-bearing field is an absolute http(s) URL prefixed by
the given base URL (and that `homepage_url` was *not* rewritten); maps each field
back to a local path and confirms it resolves HTTP 200; independently re-crawls the
**staged** tree (not the emit step's in-memory list) and confirms every file in the
closure resolves HTTP 200. Closes the server in a `finally` block regardless of
outcome.

**Manual verification beyond the checklist.** Ran the emit once and read the
printed absolute URLs by eye (all four fields, both manifests, correctly
`https://staging.invalid/as/<ext>/<file>`). Listed every file under `dist-staging/`
and hand-checked the set against the known reference list built while reading the
source (registry + 3 sidecars + 8 dice-3d core files + 2 vendor files = 14; owlbear
= 6 closure files; owlbear-dice = 8 closure files — the script's own reported
counts, "14 shared dice asset(s)" and "28 closure files", matched this by-hand
count exactly, as did the "46 conditions" figure once worked out by hand
(2 manifest fetches + 2 extensions × 4 fields × 2 checks each + 28 closure fetches
= 46)). This cross-check gave much higher confidence than trusting a single green
exit code. Also deliberately broke the rerun (stale marker file/dir) to prove
idempotency rather than assuming it from reading the `rm -rf` line.

**Dead ends / things considered and rejected:**
- First instinct was one combined regex
  (`((?:\.\.\/)*[\w.-]+(?:\/[\w.-]+)*\.(?:js|...))`) to pull asset paths out of HTML
  in a single pass. Talked myself out of it before writing it: proving to myself
  by hand-tracing that greedy-quantifier backtracking would still terminate
  correctly on filenames with embedded dots (e.g.
  `new-angelsword-dice-face-art.384-webp.js`) was possible but fragile to reason
  about and to maintain. Replaced with the two-step "grab any quoted token, then
  filter by extension + path shape" approach actually shipped — easier to verify
  by inspection and just as correct.
  Also considered reconstructing the `?v=...` cache-busting suffix that
  `panel.html`/`overlay.html` append at runtime (`"...js" + V`), until noticing
  both `server.mjs`'s own `safeStaticPath` and the sim server I was about to write
  strip query strings before resolving a file — so the suffix is irrelevant to
  both copying (filesystem paths never have query strings) and to the HTTP 200
  check (a bare path is sufficient proof the file is servable). Dropped the extra
  parsing entirely rather than build something unneeded.
- Considered copying `assets/` wholesale for simplicity and just accepting the
  extra ~20MB+ of unrelated QA screenshots as "fat is fine." Rejected once the
  `assets/dice-3d/promoted/` six-vs-three-files finding came up: wholesale copying
  would have shipped two unpromoted/stale dice sets
  (`exact-reference-test.js`, `my-custom-dice-set.js`) *and* an orphaned
  `asari-d20.js` alongside the real three, which is worse than "fat" — it's
  shipping test data nothing loads. The brief's own instruction to "crawl... rather
  than guess a copy list" is what surfaced this, so I followed it literally instead
  of taking the simpler-looking shortcut.

## 3. Files touched + commit hash

Commit `5384bce` on branch `agent/beta-2-5-online` (local only, not pushed):

- `scripts/lib/owlbear-staging-assets.mjs` (new) — shared crawler + manifest
  absolutize helpers.
- `scripts/publish-staging.mjs` (new) — the emit step; also exports
  `publishStaging()` for reuse.
- `scripts/test-staging-deploy.mjs` (new) — the deploy-simulation check.
- `package.json` (modified) — added `publish:staging` and `test:staging` scripts.
- `.gitignore` (modified) — added `dist-staging/`.

Not staged/committed: `BETA_2.5_PROJECT_STATE.md` (was already modified in the
working tree before this task started, by someone/something else — left
completely untouched, per the brief's explicit instruction and confirmed by diff
that my commit carries none of that file's changes), and the two task-brief files
under `BETA_2.5_TASKS/` (pre-existing, not mine to stage). `git add` was run with
explicit paths only — never `-A`.

## 4. Deviations from the sketch

- **Script names differ slightly:** shipped `publish-staging.mjs` /
  `test-staging-deploy.mjs` and npm scripts `publish:staging` / `test:staging` —
  the brief said naming was mine to choose "along the lines of" its suggestion, so
  this is a naming choice, not a deviation in behavior.
- **Added a shared `scripts/lib/` module** the sketch didn't mention, so the emit
  and the verifier crawl assets with the literal same function instead of two
  hand-maintained lists that could silently drift apart. This directly serves the
  sketch's own "crawl... rather than guess" instruction by making the crawl a
  single source of truth.
- **The asset closure is crawled programmatically, not hand-listed**, including
  for the fixed inline-loader script array — the sketch allowed either approach
  ("verify the known manifest + entry-page graph... document what is checked vs
  copied-wholesale"); I chose the fuller crawl because the six-vs-three-file
  `promoted/` finding showed a hand-listed/wholesale copy would have shipped wrong
  data, not just extra data.
- **`overlay.html` is a manually-declared exception** (`EXTRA_ENTRY_HTML`) rather
  than purely auto-discovered, since it's opened from inside a minified JS bundle
  at runtime (`new URL("overlay.html", ...)` in `background.js`) rather than
  declared in a manifest or linked from markup. Documented in-code and here rather
  than silently hard-coded.
- **Did not touch or run `scripts/test-cross-browser.mjs`** even though it has a
  superficially similar "deployment artifact" concept — it's not in this task's
  required suite list, its `DEPLOY_TEMP_DIR` approach still routes through the real
  rewriting `server.mjs` (the opposite of what this task needed to prove), and it
  doesn't cover `owlbear-dice/` at all. Left entirely alone; flagging its
  `owlbear-dice` gap as a possible (separate, small) follow-up below rather than
  editing it under this task's scope.

No DECIDED item was found to be impossible against the real code — the design
table's plan matched what `server.mjs` and the manifests actually do closely enough
that no stop-and-report was triggered.

## 5. Questions parked for the owner

1. **Builder-hosting story for the "Open My Character Sheet" button (the brief
   asked me to flag this rather than act on it):** `owlbear/panel.js`'s
   `resolveBuilderUrl()` always opens the sheet at "one directory above wherever
   `owlbear/panel.html` is hosted," with no configuration point. That means
   whatever host serves this pipeline's emitted `owlbear/` + `owlbear-dice/`
   folders must *also* serve the full builder app (`index.html`, `assets/`,
   `src/js/*`, the ~ tens-of-MB app bundle, etc.) at that same base URL for the
   panel's primary button to do anything — this pipeline does not emit the
   builder app, only the two extensions, per the brief's explicit scope. Whether
   that's the intended shape (one combined static site) or whether
   `resolveBuilderUrl()` itself needs a configuration point added later (a WS2
   follow-up, not done here) is an open design question for whoever picks the
   actual host.
2. **Repeating a still-open item from the work log:** the staging host choice
   itself (unlisted GitHub Pages test repo vs Cloudflare Pages) remains the
   owner's, unaffected by anything in this task.
3. (Not a question, a note): `scripts/test-cross-browser.mjs`'s own
   `copyDeploymentArtifact()`/`assertOwlbearDeploymentArtifact()` still only knows
   about `owlbear/`, not `owlbear-dice/`, and still relies on the real
   rewriting `server.mjs` rather than a dumb static host. It wasn't in this task's
   required suite and I left it untouched, but it's now the one place in the repo
   whose "deployment artifact" story is out of step with what this task just
   built. Worth a small follow-up task if the owner wants that suite brought in
   line — not urgent, and explicitly not done here to avoid scope creep on a file
   this task wasn't asked to touch.
