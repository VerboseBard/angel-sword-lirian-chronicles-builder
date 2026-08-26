# Report — Task 005: Staging pipeline hardening (closes the 004 audit)

Executor: Claude Sonnet 5 sub-agent, 2026-08-25. Scope: the three staging
scripts named in the brief. `package.json` was NOT touched (no new npm
script was needed — the new CLI flags are reachable as
`npm run test:staging -- --no-emit ...`). `BETA_2.5_PROJECT_STATE.md` and
all `BETA_2.5_TASKS/*` files were left untouched, per the brief, for the
entire session (the coordinator committed its own session-record update to
those files concurrently, commit `2ce4815`, while this task was in
progress — unrelated to this diff, confirmed by inspection, see §4).

## 0. Headline

All four DECIDED fixes (M1, M2 HIGH; M3, M4 MEDIUM) are implemented and
proven closed by rerunning the 004 audit's own attacks — pre-fix confirmed
still-vulnerable, post-fix confirmed refused/red, using the audit's own
commands and mutation recipes wherever practical, plus two isolated
fixtures (never the real worktree) for the deletion and path-escape proofs.
Two additional LOW items (M6, M8) were fixed alongside them: both are small,
mechanical, and the audit's own text explicitly groups them with the
DECIDED items ("same task as M4", "same task as M1"). M5, M7, M9, M10 were
left as proposed-not-done, per the brief's own instruction to defer
structural/debatable items. All required suites are green. Commit:
see §3 (created after this report was drafted; hash filled in below).

**Tally:** 4/4 DECIDED fixes closed + proven both directions. 2/6 remaining
M-items also fixed (M6, M8). 4/6 remaining M-items deliberately deferred
(M5, M7, M9, M10) with reasons below. Zero regressions: `test:staging` and
`test:vtt` green; `test:dice-skins` green as a bonus check.

## 1. Checklist outcomes (brief's own checklist)

- [x] Each DECIDED attack reproduced: FAILS pre-fix, PASSES (refuses/red)
      post-fix, using the 004 report's own commands/mutations — §2.
- [x] `npm run test:staging` green on a clean default run — PASS, 53/53
      conditions (was 46/46 pre-fix; +7 = 4 pinned sentinels + 3
      independently-read registry sidecars), 28 closure files (unchanged —
      confirms M4/M6 have zero effect on today's real closure, as expected
      since no audio/font/query-string-literal files exist in the shipped
      pages yet).
- [x] Verify-in-place mode: PASS 53/53 on an intact artifact via
      `--no-emit` (log shows no "Building.../Emitting..." lines — no
      re-emit occurred); FAIL/exit 1, 7 problems, on the audit's own
      3-part mutation (see M2 below); restored via a fresh
      `npm run test:staging`, `dist-staging/` left in the same clean
      PASS/53 state a normal run leaves it in.
- [x] `npm run test:vtt` green — 109 adapter checks + 48 opener-bridge
      checks + `[OWLBEAR PANEL TEST SUCCESS]` + `[OWLBEAR BRIDGE TEST
      SUCCESS]`, unchanged from before this task.
- [x] No servers left running — `Get-NetTCPConnection -State Listen` +
      `Get-Process node` after all work: only PID 22928 listening on
      :4176 (the owner's pre-existing dev server, `StartTime 8/25/2026
      10:21:14 AM` — the exact PID/timestamp the 004 report itself
      recorded; never started, stopped, or used by this task). A handful
      of unrelated node.exe processes exist with older start times and
      are not listening on any port — not mine, not touched.
      `git status` clean apart from this task's own 3-file diff (see §4
      for the concurrent coordinator commit that is not part of this
      diff).

## 2. Fix-by-fix detail

### M1 (HIGH) — `--out=` was an unanchored recursive-delete target — FIXED

**Where:** new `assertSafeOutDir(absOutDir, projectRoot)` in
`scripts/publish-staging.mjs`, called as the very first `await` inside
`publishStaging()` — before the build step, before the `fs.rm`. Checks, in
order: (1) resolved outDir is not the worktree root itself; (2) resolved
outDir must be strictly inside the worktree root (`startsWith` a
separator-terminated boundary); (3) the outDir's path relative to root must
not pass through a literal `.git` segment — added because `--out=.git`
passes checks 1–2 (it IS strictly inside root and IS NOT the root itself)
yet would wipe the actual git metadata; (4) defense in depth — if the
resolved target already exists and itself contains a `.git` entry (looks
like a nested repo/worktree), refuse even though its own path doesn't say
".git" anywhere. No override flag, per DECIDED. `copyDirWholesale`'s own
independent `fs.rm` inherits this safety transitively (its `dest` is always
`path.join(absOutDir, extDir)`, and `absOutDir` is now anchored before
either function runs).

**Proof — pre-fix baseline (real, unmodified script, scratchpad-only
target):**
```
node scripts/publish-staging.mjs --base-url=https://hostile.invalid/x --skip-build --out=<scratchpad>/deletion-proof
```
Pre-existing `IMPORTANT.txt` and `precious-subdir/nested.txt` in the
scratchpad canary dir were silently deleted (mirrors the 004 report's own
demo exactly).

**Proof — post-fix, isolated fixture (real, imported `publishStaging()`,
never reproduced code):** built a throwaway "fake worktree" under
scratchpad with its own `.git` file, canary files at three nesting levels,
and a nested `vendored-repo/.git` (simulating an accidentally-checked-out
repo). Called the real function with `projectRoot` pointed at the fixture
for `outDir` = `.`, `""`, `..`, `../..`, `.git`, `sub/.git`, `vendored-repo`
— **all seven threw**, with the specific message identifying which check
fired, before any delete; every canary at every nesting level **survived**.
The legitimate `outDir: "dist-staging"` case passed the guard cleanly
(it only failed later on an unrelated, expected ENOENT since the minimal
fixture has no real `owlbear/` directory to copy — proving the guard does
not over-block the real default path).

**Proof — post-fix, real worktree (real function, real project root, the
audit's own named targets):** called `publishStaging()` against the actual
project root for `.`, `""`, `..`, `../..`, `../../..`, `../Angel Sword
Lirian Chronicles Public Beta 2.20`, `C:\Windows`, `E:\`, `.git` — **all
nine threw**. `git status --porcelain` and a directory listing of the
frozen sibling folder afterward confirmed nothing was touched.

### M2 (HIGH) — verifier re-emitted before checking, so it could not validate an artifact — FIXED

**Where:** `scripts/test-staging-deploy.mjs` — new `--no-emit` flag (paired
with the existing `--out=`) and `--artifact=<dir>` (self-sufficient, implies
`--no-emit`); when set, `main()` skips `publishStaging()` entirely and
verifies whatever is already on disk, after a friendly
`assertArtifactLooksStaged()` pre-check (clear error instead of a raw
ENOENT if the directory doesn't exist). Orthogonal to that — runs in BOTH
modes — a new pinned-sentinel phase: `PINNED_SENTINEL_ASSETS` (exported
from `owlbear-staging-assets.mjs`) is a **fixed** list —
`assets/dice-3d/dice-3d-embedded.js`, `assets/vendor/three.min.js`,
`assets/vendor/GLTFLoader.js`, `assets/dice/promoted-dice-skins.registry.js`
— sourced by reading `owlbear-dice/panel.html` and `overlay.html` directly,
**not** derived from whatever the staged pages' own markup currently says.
Plus an independent fresh read of the STAGED registry's `faceArtScript`
sidecars via the now-exported `extractRegistrySidecars()`, called directly
against the pinned registry path rather than only through the HTML-driven
crawl. Rationale spelled out in code comments: the normal closure crawl
derives its ground truth FROM the staged pages, so a corruption that also
damaged the referencing HTML would shrink the checklist right along with
the missing file and never flag it — the pinned list and the direct
registry read are independent of that self-reference.

**Proof — pre-fix baseline (audit's exact mutation, real
`npm run test:staging`, only mode that existed):** fresh run → PASS 46/46.
Deleted `dist-staging/assets/dice-3d/dice-3d-embedded.js` (2.8MB) and
`dist-staging/assets/dice/promoted-dice-skins.registry.js`, corrupted
`dist-staging/owlbear/manifest.json`'s `icon` → `"icon.svg"` and
`action.popover` → `"panel.html"`. Reran `npm run test:staging` →
**still PASS 46/46** (byte-for-byte reproduction of the audit's finding).

**Proof — post-fix:** fresh `npm run test:staging` → PASS **53/53**.
`node scripts/test-staging-deploy.mjs --no-emit --base-url=https://staging.invalid/as`
against the untouched artifact → PASS 53/53, log shows no
"Building.../Emitting..." lines (confirmed no re-emit ran). Applied the
**identical** three-part mutation to the same artifact, reran the same
`--no-emit` command → **FAIL, exit 1, 7 problems**:
```
owlbear/manifest.json: field "icon" is not an absolute URL: "icon.svg"
owlbear/manifest.json: field "action.popover" is not an absolute URL: "panel.html"
assets/dice-3d/dice-3d-embedded.js: expected HTTP 200 ... got 404
assets/dice/promoted-dice-skins.registry.js: expected HTTP 200 ... got 404
assets/dice-3d/dice-3d-embedded.js: pinned sentinel asset expected HTTP 200 ... got 404
assets/dice/promoted-dice-skins.registry.js: pinned sentinel asset expected HTTP 200 ... got 404
assets/dice/promoted-dice-skins.registry.js: no faceArtScript sidecars could be read ...
```
(the deleted engine file and registry are each caught by *two or three*
independent mechanisms — the ordinary closure derivation, the pinned
sentinel, and for the registry, the direct sidecar re-read — exactly the
redundancy the fix is meant to provide). Also ran the audit's literal
command `node scripts/test-staging-deploy.mjs "--base-url=https://staging.invalid/as?x=1"`
(full default mode, not `--no-emit`) — now fails fast with a clear
`normalizeBaseUrl` error before any emit touches `dist-staging/` (see M3).
Restored via a fresh `npm run test:staging`; `dist-staging/` left at the
standard PASS/53 state.

### M3 (MEDIUM) — `normalizeBaseUrl` silently mishandled query/fragment/dot-segments — FIXED (+1 beyond-the-four)

**Where:** `normalizeBaseUrl()` in `publish-staging.mjs`, now exported (was
private; test-staging-deploy.mjs needed it for `--no-emit`'s expected-prefix
check, and the 004 audit had to reproduce it verbatim to test it at all —
this closes that incidental gap too). Refuses on non-empty `parsed.search`,
non-empty `parsed.hash`, and a new `rawPathSegments()` helper that inspects
the **raw** candidate string's path (before `new URL()` silently collapses
`.`/`..`) for literal dot-segments. **Beyond the brief's four DECIDED
checks:** also refuses embedded credentials (`user:pass@host`) — small,
mechanical, and the audit's own item-4 evidence table already flagged it
("credentials baked into a public manifest") without being one of the four
explicitly-decided fixes. The return value changed from
`candidate.replace(/\/+$/, "")` (the raw input string) to
`parsed.href.replace(/\/+$/, "")` (the URL-parser-normalized form) — this
is what actually fixes the dot-segment case (`new URL()` had already
resolved `.`/`..` away when producing `parsed`, which is exactly why the
old code's use of the raw string produced a mismatch downstream), and as a
side effect fixes the audit's secondary finding that a mixed-case or
space-containing base URL baked correctly but made the verifier's own
prefix comparison falsely red (both sides now derive from the same
normalized form).

**Proof — pre-fix baseline (real emits):** query string, fragment,
dot-segment, and credential-embedded base URLs were all silently accepted;
baked `icon` fields showed the `/as` subpath dropped for the first three,
and `https://user:pw@staging.invalid/as/owlbear/icon.svg` for the fourth
(credentials baked verbatim into what would be a public manifest).

**Proof — post-fix:** the same four inputs now each throw a specific,
readable error (e.g. `Base URL "..." must not include a query string
("?x=1"): it would be silently dropped...`); confirmed via `--no-emit`
that `dist-staging/` was untouched by any of the four failed attempts.
Legit-subpath survival proven with two real emits: trailing slash
(`https://staging.invalid/as/`) and a deep subpath with a port
(`https://staging.invalid:8443/deep/sub/path`) both bake the full subpath
into every manifest field. Bonus: a full `test:staging` run with
`HTTPS://STAGING.INVALID/As` now PASSes 53/53 (previously would have gone
falsely red per the audit's own item-4 finding).

### M4 (MEDIUM) — crawler allow-list had no audio/font types — FIXED

**Where:** `ASSET_EXT_RE` in `owlbear-staging-assets.mjs` extended with
`mp3|ogg|wav|m4a|woff2?|ttf|otf`. Companion (not separately requested, but
obviously part of the same intent): `MIME_TYPES` in
`test-staging-deploy.mjs` given real content-types for the same 8
extensions, so the sim server doesn't fall back to
`application/octet-stream` for files a real static host would serve
correctly typed (doesn't change pass/fail, just keeps the sim honest).

**Proof:** built a synthetic `owlbear-dice/panel.html` fixture with
`<link>`/`<script>` literals for a `.mp3` and a `.woff2` file, ran the
real, unmodified `crawlExtensionAssets()` against it — both now appear in
`sharedAssets` (confirmed they would NOT have under the original regex by
reading it before editing: `/\.(?:js|mjs|css|svg|png|jpg|jpeg|webp|json)$/i`
has no audio/font alternation at all). Confirmed **zero effect on the real
project today**: `npm run test:staging` still reports exactly the same 28
closure files, since no such files exist in the shipped pages yet — this
change is purely forward cover for WS4.

### Beyond the four, applied (small, mechanical, and the audit's own text bundles them with DECIDED items)

**M6 (LOW)** — a quoted literal that already carried its own `?v=...` (as
opposed to the current pages' `"...js" + V` string concatenation) failed
`PATH_LIKE_RE` (which rejects `?`) and vanished from the closure with no
warning. Fix: `extractAssetLiterals()` now strips the query before testing
and storing the literal — mirrors what `extractRegistrySidecars` already
did for `faceArtScript`. The audit's own text says "Same task as M4."
**Proof:** same fixture as M4 — a literal
`"../assets/dice-3d/foo.js?v=123"` is now captured as
`assets/dice-3d/foo.js` (query stripped) by the real `crawlExtensionAssets()`.
Zero effect on the real project today (current pages never write an inline
`?` in a literal).

**M8 (LOW)** — `resolveRelative()` can in principle produce a
`../`-escaping relative path that `copySharedAsset()` would then follow
unchecked on both the read side (`projectRoot`) and the write side
(`outDir`). Fix: new `assertWithinRoot()` boundary check, called for both
`src` and `dest` inside `copySharedAsset()`. The audit's own text says
"same task as M1." **Proof, three parts:**
1. Reproduced the *original* (pre-fix) `copySharedAsset` verbatim in a
   scratchpad script (quoted directly from the file as read before
   editing) and ran it against a fixture whose synthetic panel.html
   contained a `"../../way-outside.js"` literal, with a real sentinel file
   placed at the exact location that literal resolves to one level above
   the fixture root. It genuinely copied the sentinel one level above the
   fixture's output directory — real exfiltration, not a theoretical
   string.
2. Quoted the real, shipped `assertWithinRoot()` verbatim and confirmed it
   throws for the identical input.
3. End-to-end, real function: ran the actual unmodified `publishStaging()`
   (imported, not reproduced) against the fixture, with `outDir` placed
   *inside* the fixture root (so the M1 guard passes cleanly and doesn't
   mask this test) — it threw exactly the expected boundary-escape error:
   `Refusing to copy shared asset "../way-outside.js": its source path
   resolves to ..., which escapes ...`.

### Left as proposed-not-done (per the brief's own "M-items beyond the four" guidance: small+safe → do; structural/debatable → list)

- **M5** (only `faceArtScript` is read out of the registry; a future
  URL-bearing registry key would be missed silently) — the audit's own
  text recommends folding this into the WS6 registry-gate task. Not
  touched.
- **M7** (HTML refs resolve against the extension's top-level directory,
  not the containing file's own directory — dormant unless a page moves
  into a subfolder) — a correct fix needs to change
  `extractHtmlAssetRefs`'s signature and the crawl loop that calls it
  (pass the seed's own directory through, not assume it equals `extDir`),
  which is a real crawler-semantics change, not a one-line fix like M6.
  Zero present-day impact (every current HTML file lives directly in its
  extension's top-level directory, so `path.posix.dirname(seed) === extDir`
  holds for all real seeds today). Judged this closer to "structural" than
  "small and obviously safe" given it touches the same resolution logic
  all of this task's other proofs depend on — deferred rather than risk a
  subtle crawler regression for a scenario that doesn't exist yet.
- **M9** (the two dice pages carry different `?v=` cache-buster tokens for
  the same ~45MB, doubling a real user's download) — explicitly out of
  scope per the brief: "the `?v=` token design (owner question)."
- **M10** (~60KB of unminified, un-bundled extension source ships because
  extension directories are copied wholesale) — explicitly framed by the
  audit as an owner product decision ("acceptable, or prune to the crawled
  closure? Natural fit with WS3 slimming"), not a guard-rail bug. Not
  touched.

## 3. Files changed / commit

- `scripts/lib/owlbear-staging-assets.mjs` (+35/-3: extended `ASSET_EXT_RE`;
  query-stripping in `extractAssetLiterals`; exported
  `extractRegistrySidecars`; added exported `REGISTRY_RELATIVE_PATH` +
  `PINNED_SENTINEL_ASSETS`)
- `scripts/publish-staging.mjs` (+145/-2: hardened + exported
  `normalizeBaseUrl`; added `assertSafeOutDir` + its call site; added
  `assertWithinRoot` + its two call sites in `copySharedAsset`)
- `scripts/test-staging-deploy.mjs` (+99/-8: `--no-emit`/`--artifact=`
  flags; `assertArtifactLooksStaged`; mode branch in `main()`; pinned
  sentinel + independent registry-sidecar assertion phase; 8 new MIME
  types)
- Total: 3 files changed, 279 insertions(+), 13 deletions(-).

`package.json` untouched — no new npm script needed. `.gitignore`
untouched. No other tracked file modified.

Committed as explicit paths (never `git add -A`):
```
git add scripts/lib/owlbear-staging-assets.mjs scripts/publish-staging.mjs scripts/test-staging-deploy.mjs
git commit -m "005: staging pipeline hardening (004 audit fixes)"
```
Commit hash: **6f767ff3a545669aa04f38917dbec0552359258e** (short: `6f767ff`),
branch `agent/beta-2-5-online`, local only. `git status --porcelain`
immediately after the commit shows only this report file itself as
untracked (left for the coordinator's own session-records sweep, matching
how task 001's report was handled — see commit `4448c44`'s history).

## 4. Work narrative

**Reading order:** `BETA_2.5_PROJECT_STATE.md` → brief 005 → the full 004
audit report (findings M1–M10, all repro commands and code line numbers) →
the three shipped scripts in full (`Read`, not excerpts) → `package.json`
→ confirmed no other file imports the three staging scripts or the lib
(`Grep` across the whole worktree — only the staging scripts, package.json,
and the task/report docs reference them, so the blast radius of this
change is fully contained).

**Ground-truth checks before writing any fix:** read
`owlbear-dice/panel.html` and `overlay.html` directly to get the exact
project-root-relative paths for the pinned-sentinel list (`assets/dice-3d/
dice-3d-embedded.js`, `assets/vendor/three.min.js`, `assets/vendor/
GLTFLoader.js`), and read `assets/dice/promoted-dice-skins.registry.js`
directly to confirm the `faceArtScript` field shape the existing
`extractRegistrySidecars` already parses. Probed the WHATWG `URL` parser's
actual behavior for 10 edge-case base URLs in a scratchpad Node one-off
*before* writing `normalizeBaseUrl`'s fix, specifically to confirm (a) dot
segments really are silently collapsed by `new URL()` itself (so the bug
was in the OLD code's use of the raw string, not something `new URL` needed
help with), and (b) `.search`/`.hash` cleanly separate out for the
refuse-on-query/fragment checks. This shaped the fix (return `parsed.href`,
not `candidate`) before any code was written, rather than trial-and-error.

**Order of work:** established pre-fix baselines for M1 (real canary
deletion), M2 (real mutate-then-rerun, byte-for-byte matching the audit),
and M3 (real emits showing subpath loss / credential leakage for four
hostile inputs) — all against the *unmodified* shipped code, before editing
anything. Then implemented all four DECIDED fixes plus M6/M8 in the three
files. Then re-ran every pre-fix probe post-fix to get the paired
before/after evidence in §2, using three different rigor levels depending
on risk:
  - For M1 and M8 (both mutate/delete real files), built **isolated
    scratchpad fixtures** — a fake worktree with canaries at every
    dangerous level, a fake extension tree with a real sentinel file placed
    exactly where an escaping literal resolves — and drove the REAL,
    imported, unmodified functions (`publishStaging`, `crawlExtensionAssets`)
    against those fixtures. This means the proof exercises the actual
    shipped code, not a reproduction, while guaranteeing that even a bug in
    my own fix could only ever touch scratchpad, never the real worktree or
    the frozen sibling. Only after the fixture proof succeeded did I run one
    final confirming pass with the real project root and the audit's exact
    named hostile targets (`../Angel Sword Lirian Chronicles Public Beta
    2.20`, `C:\Windows`, `E:\`, etc.) — safe to do for real at that point
    specifically *because* the fixture had already proven the guard fires
    before any filesystem mutation.
  - For M2, M3, M4, M6 the real worktree and its actual `dist-staging/`
    output were used directly (mutating/restoring the STAGED artifact, not
    source), since none of those paths involve a delete of anything outside
    `dist-staging/`, which is disposable and gitignored.

**Dead ends / corrections along the way:**
  - First attempt at the M8 sentinel placement made the fixture's "source"
    and "destination" escape targets resolve to the *same* path (both
    fixture dirs were siblings under the same parent, and the literal's
    `..` depth escaped both by the same amount), which would have made the
    proof a meaningless self-copy. Recomputed the exact resolved paths with
    a small script first, then restructured the destination fixture one
    level deeper so the two escape targets are provably distinct locations
    — the "PRE-FIX COPIED THE SENTINEL to ... out-holder\way-outside.js"
    evidence in §2 is from the corrected layout.
  - First `node -e` inline one-liner for path computation mangled backslash
    escaping through the Bash-tool-over-PowerShell boundary and printed a
    garbled path (`C:..\..\way-outside.js`); switched to writing tiny
    `.mjs` script files for every path computation from then on, which also
    left them as quotable, rerunnable evidence rather than throwaway shell
    lines.
  - Checked for lingering servers with `Get-NetTCPConnection` through the
    Bash tool first; PowerShell's `$_` was being mis-expanded across that
    tool's shell boundary (produced a bogus `unsetenv.LocalPort` token).
    Switched to the native PowerShell tool for that specific check, which
    ran cleanly.
  - Mid-task, `git status` unexpectedly showed the state file and task docs
    as clean when they had been modified/untracked at task start. Traced
    this to a **concurrent commit** (`2ce4815`, "Session records 2...",
    `Co-Authored-By: Claude Fable 5`) landed by the coordinator's own
    thread while this task was in progress — confirmed via `git show
    2ce4815 --stat` and a full diff read that it touches only
    `BETA_2.5_PROJECT_STATE.md` and `BETA_2.5_TASKS/*` files (state-file
    updates, the Digest rule, a model-protocol note, and the 003/004 audit
    landings), none of which conflicts with or was caused by this task's
    work. Confirmed my own diff (`git diff --stat`) still shows only the
    three intended script files. Not a deviation on my part — flagged here
    for the record since the brief's stated starting commit (`4448c44` +
    uncommitted coordinator files) became stale mid-task through no action
    of mine.

**Final state left behind:** `dist-staging/` freshly emitted via a plain
`npm run test:staging` (base `https://staging.invalid/as`, PASS 53/53,
36 files, matching the shape every prior session left it in). No servers
of mine running (verified via `Get-Process`/`Get-NetTCPConnection`). All
scratchpad fixtures deleted after use except the small standalone probe
scripts (kept only in the session scratchpad, never under the project
root). `git status --porcelain` in the project shows exactly this task's
three-file diff plus whatever the coordinator's own concurrent commit
already absorbed — nothing else.

## 5. Deviations from the brief (for the record, none block or contradict a DECIDED item)

1. Added credentials-rejection (`user:pass@`) to `normalizeBaseUrl`, beyond
   the four DECIDED base-URL checks — small, mechanical, and the audit's
   own item-4 table already named it as a real problem.
2. Added 8 MIME-type entries to the sim server's map as a direct companion
   to M4 (not separately requested, but the sim serving future WS4 sound
   files as `application/octet-stream` when a real host wouldn't seemed
   worth the 8 extra lines).
3. Fixed M6 and M8 alongside the four DECIDED items — both are LOW severity
   and the audit's own text explicitly bundles each with a DECIDED item
   ("same task as M4" / "same task as M1"); judged as squarely inside the
   brief's "apply any remaining fix that is small and obviously safe"
   allowance.
4. `--no-emit` was implemented as two accepted spellings
   (`--no-emit`, paired with the pre-existing `--out=`; and a
   self-sufficient `--artifact=<dir>` that implies `--no-emit`) rather than
   picking exactly one of the brief's two suggested names — the brief's own
   "(e.g. `--no-emit` / `--artifact=<dir>`)" phrasing offered both, so both
   are supported (~4 extra lines) to avoid guessing which the owner or a
   future caller will reach for.
5. Did NOT implement M5, M7, M9, or M10 — see §2's "left as
   proposed-not-done" for the specific reasoning per item; none are
   DECIDED items and the brief explicitly permits deferring
   structural/debatable ones.

## 6. Questions parked for the owner

None new from this task. M7's deferral could become a small standalone
follow-up task if the owner wants the crawler's HTML-resolution semantics
correctness fixed proactively (currently zero live impact); M5/M9/M10 are
already tracked as owner-gated by the 004 audit itself (M5 → fold into
WS6; M9 → cache-buster token design question already on the ledger; M10 →
WS3 slimming candidate already on the ledger) and this task did not change
their status.
