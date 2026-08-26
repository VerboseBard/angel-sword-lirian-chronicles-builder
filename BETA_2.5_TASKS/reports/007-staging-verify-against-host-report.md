# Report — Task 007: Case-safe guards + verify-against-host mode

Executor: Claude Sonnet 5 sub-agent, 2026-08-25/26. Scope: the three staging
scripts named in the brief (`scripts/publish-staging.mjs`,
`scripts/test-staging-deploy.mjs`, `scripts/lib/owlbear-staging-assets.mjs`).
`package.json` was not touched (no new npm script was needed — `--target=`
is reachable as `node scripts/test-staging-deploy.mjs --target=<url>`, same
pattern as the existing `--no-emit`/`--artifact=`). `BETA_2.5_PROJECT_STATE.md`
and all `BETA_2.5_TASKS/*` files were left untouched for the entire session.

## 0. Headline

All three DECIDED gaps from the 006 audit are closed and proven both
directions (pre-fix vulnerable / post-fix refused or caught), using the
audit's own named attacks plus new mixed-case and truncation/target-mode
proofs of my own. Two additional small items bundled into the same fix
table (the fail-safe error-handling wording, and the header-reality
reporting + host-notes file) are also implemented and verified. All
required suites are green. Commit: `80e48c5` (3 files, +406/-40).

**Tally:** 5/5 fix-table rows closed. Mixed-case battery: 19/19 hostile
cases refused (12 on an isolated fixture, 7 confirming on the real
worktree), 0 false-refusals of a legit path, all canaries intact.
Truncation + same-size hash corruption: both caught, both directions
(red→restore→green), in `--no-emit` mode. Target mode: proven against a
genuinely independent local HTTP server (not the tool's own sim) that I
wrote, started, and stopped myself — green on intact, red on truncated,
red on removed, red on simulated COOP, warn-not-fail on missing ACAO, green
after restore, server always stopped. One out-of-scope residual finding
(an existing-plain-file collision at `--out=`, unrelated to git protection)
was discovered during testing and flagged via `spawn_task` rather than
folded into this diff — see §6.

## 1. Fix-by-fix detail (brief's fix table, in order)

### Row 1 — Case-sensitivity (fails DANGEROUS today) — FIXED

**Where:** `comparablePath(p)` in `publish-staging.mjs` — `p.toLowerCase()`
on win32, identity elsewhere — applied to every containment/segment compare
in `assertSafeOutDir` (checks 1–3: root-equality, boundary-prefix, `.git`
segment membership) and in `assertWithinRoot` (the M8 copy-boundary guard).
Check 4 (`fs.stat` for a nested `.git`) needed no code change: NTFS already
resolves that filesystem call case-insensitively at the OS level: the bug
was only in the earlier STRING comparisons, never in that stat call.

**Proof — isolated fixture** (`case-battery.mjs`, scratchpad-only worktree +
sibling "Frozen Sibling Fixture" analog, real imported unmodified
`publishStaging()`, never a reproduction): 12 hostile `outDir` values, all
refused with a guard-shaped message:
- `.GIT`, `.Git`, `SUB/.GIT` — the audit's named bypass and two more case
  variants, now caught by check 3 (previously would have fallen through to
  the fragile check 4).
- `.`, `""`, `..`, `../..`, `.git`, `sub/.git`, `vendored-repo` — 005's
  original same-case battery, re-run to confirm zero regression.
- An ABSOLUTE, fully case-flipped spelling of the fixture worktree root
  itself → refused at check 1 ("resolves to the worktree root itself").
- An ABSOLUTE, fully case-flipped spelling of the sibling "frozen" analog →
  refused at check 2 ("outside the worktree root").

A 13th case (`outDir: "dist-staging"`, the legit relative default) passed
the guard cleanly and failed later only on the fixture's missing `owlbear/`
source (ENOENT) — proving the guard doesn't over-block. All 7 canaries
(root file, nested file, the fixture's own `.git`, `sub/.git`,
`vendored-repo/.git` + its own file, the frozen-sibling file) were
byte-identical before and after. Full PASS.

**Proof — real worktree, non-mutating confirming pass**
(`case-battery-real-root.mjs`): `assertSafeOutDir` is the first `await`
inside `publishStaging()` — a thrown error there guarantees the later
`fs.rm` is unreached, so (as 005 did) this is safe to run for real only
*after* the fixture proof already established the logic is sound. 7 cases
against the REAL project root: `.GIT`, `.Git`, `dist-staging\.GIT` (mixed
case nested under the real default out-dir name), a fully case-flipped
spelling of the real worktree root, a fully case-flipped spelling of the
real frozen `...Public Beta 2.20` sibling, plus the exact-case sibling path
and its `..\...` relative form as a regression check — **all 7 refused**,
including the audit's exact named `.GIT` bypass against the real `.git`
worktree-pointer file. Confirmed after: `git status --porcelain` unchanged,
frozen sibling folder present, `.git` pointer file content unchanged
(`gitdir: E:/Chat gpt Codex/Angels sword/.publish-public/.git/worktrees/...`).

**Errno finding worth recording:** report 006 speculated the pre-fix danger
for `--out=.GIT` depended on which errno Windows returned at check 4
("ENOENT → guard passes [dangerous] ... ENOTDIR → refused by accident").
I probed this directly (disposable scratchpad-only file, two path shapes:
file as the final component before appending `.git`, and file as a
non-final/intermediate component) — **both produced ENOENT** on this real
Windows + Node 24 combination, never ENOTDIR. That means the pre-fix bug
was not "sometimes saved by luck" on this platform — it was a clean, fully
reachable danger every time, and check 3's case-fold (not check 4's error
handling) is what actually closes it. Worth knowing before assuming any
Windows/Node combination behaves differently.

### Row 2 — Undesigned error path — FIXED

**Where:** check 4 in `assertSafeOutDir` now wraps its `fs.stat` (via a new
`pathExists()` helper that only swallows `ENOENT`) in an explicit
`try/catch` that converts ANY other error into a clear, dedicated
"Failing safe: recursive delete refused" message naming the underlying
error code, instead of letting an uninterpreted exception propagate as an
accident of normal JS control flow.

**Verification:** by code inspection (the try/catch is unconditional and
covers the only I/O call in the guard that can fail unpredictably) plus the
errno probe above. I attempted to force a genuine non-`ENOENT` stat error
twice (see Row 1's finding) and got `ENOENT` both times on this filesystem,
so I did not get a live "goes through the NEW explicit branch" proof — the
19-case battery above only ever needed the ENOENT branch or the earlier
string checks. Forcing a real non-ENOENT OS error (permission-denied being
the realistic one) would need mutating ACLs on a test path, which I judged
disproportionate/riskier than its value for this narrow defense-in-depth
branch — the safety property was never actually in question either way
(an *uncaught* error here already aborted `publishStaging()` before its
`fs.rm`, by ordinary `await` propagation); this task's change is entirely
about turning that into a deliberate, clearly-worded contract instead of
an accident, which is verifiable by reading the code.

### Row 3 — Presence-only checks — FIXED

**Where:** `buildFileManifest(rootDir)` (new, in the shared lib) walks the
entire emitted artifact recursively after every copy and manifest rewrite
is done, recording `{path, bytes, sha256}` for every real file (excluding
its own filename — a file can't hash itself before it exists). Written to
`STAGING-INTEGRITY.json` at the artifact root by `publishStaging()`, as its
last write. Never added as a manifest seed, `EXTRA_ENTRY_HTML` page, or
pinned sentinel, and `crawlExtensionAssets()` never walks the raw
filesystem (only reference graphs from manifests/HTML) — so it can't be
mistaken for something a page must load, per the brief's "keep this out of
the closure's own must-be-referenced logic."

On the verify side, `test-staging-deploy.mjs` now fetches
`STAGING-INTEGRITY.json` from the same `origin` as everything else (so in
target mode this itself proves the integrity file made the trip), builds a
`path → {bytes, sha256}` map, and a new `checkIntegrity()` helper asserts
every subsequently-fetched file's actual byte length and sha256 against it
— for both manifests, every manifest-field-referenced asset, every closure
file, every pinned sentinel, and every registry sidecar. `fetchLocal` was
renamed `fetchBytes` and now always reads the full body (needed to hash
it), returning `null` buffer on non-200 so call sites still short-circuit
the same way.

**Proof (in `--no-emit` mode, real worktree, real artifact):**
- Truncated `assets/dice-3d/dice-3d-embedded.js` from 2,780,150 to 1,000
  bytes → RED, caught independently by both the ordinary closure check and
  the pinned-sentinel check: `"served 1000 byte(s), but 2780150 was
  recorded at emit time -- looks truncated or corrupted."` Restored →
  green (99/99).
- Same-size corruption (flipped one byte in the middle of the same file,
  length unchanged at 2,780,150) → RED via the hash branch specifically:
  `"byte count matches (2780150) but its sha256 differs from the value
  recorded at emit time -- content corrupted."` This is the concrete case
  proving the hash catches what a byte-count-only check would miss.
  Restored → green (99/99) again.
- `npm run test:staging` (fresh emit) went from 53/53 (pre-fix baseline,
  captured first) to 99/99 post-fix on a clean run — no false positives
  from the new checks on an untouched artifact.

### Row 4 — No post-upload proof — FIXED

**Where:** new `--target=<base-url>` flag on `test-staging-deploy.mjs`
(implies `--no-emit`, same as `--artifact=`). In target mode, `origin` is
set to the normalized target URL itself instead of a freshly-started local
sim server (no server is started at all in this mode) — every existing
fetch call site is origin-agnostic already, so the exact same check list
(both manifests, every field, the crawled closure, pinned sentinels,
registry sidecars, and the new size/hash checks) runs unchanged, just
against real HTTP. The local artifact directory (default `dist-staging/`,
or `--out=`) is still read to derive the reference graph (which files
*should* exist) — only the byte fetches go to the real host; this
asymmetry is called out explicitly in the code comments and the report.
Every request is a plain `fetch(url)` (GET, default method, no credentials,
no body) — grepped the whole diff for any other HTTP method: none exist.

**Proof — genuinely independent host, not the tool's own sim:** wrote a
~70-line standalone GET/HEAD-only static file server
(`scratchpad/task007/ephemeral-static-server.mjs`, kept out of the repo —
this is a disposable test rig, not a pipeline file), started it myself on
an OS-assigned ephemeral port, pointed `publish-staging.mjs` at that exact
URL to bake matching manifests, then ran `test-staging-deploy.mjs --target=`
against it:
- **Green on intact:** 101/101 conditions, 2 informational ACAO warnings
  (see Row 5), exit code 0.
- **Red on truncated:** shrank the served `assets/vendor/three.min.js` from
  653,451 to 500 bytes (server re-reads from disk per request, no restart
  needed) → 2 failures (closure + pinned-sentinel), exit code 1.
- **Red on removed:** deleted `dist-staging/owlbear/icon.svg` outright → 404
  on both manifest fields that reference it plus the closure check, exit
  code 1.
- **Restore → green:** re-emitted fresh for the same URL → 101/101, exit 0.
- Ephemeral server stopped via `taskkill` after every port change;
  confirmed via `netstat` that none of my ports (51354, 64300, 55876) were
  left listening, and that the owner's pre-existing `:4176` dev server
  (PID 22928, unchanged `StartTime` from what 004/005/006 already
  recorded) was never touched.

### Row 5 — Header reality (record, don't enforce) — FIXED

**Where:** in target mode only (the local sim deliberately sends zero
headers by design, so checking there would be meaningless noise), each
manifest fetch now reads `Cross-Origin-Opener-Policy` and
`Access-Control-Allow-Origin` from the real response and prints both,
always, as informational output. COOP present → pushed to `failures`
(fails the run). ACAO absent → pushed to a new, separate `warnings` list
that prints loudly but does **not** set `process.exitCode`. `
buildStagingHostNotes()` (new, in the shared lib) generates
`STAGING-HOST-NOTES.md`, written into the artifact root at emit time,
stating both requirements in plain language with GitHub Pages / Cloudflare
Pages specifics and the `--target=` command to self-check after upload.

**Proof:** against the plain ephemeral server (sends no headers at all) —
COOP correctly reported `(absent)`, no failure; ACAO correctly reported
`(absent)`, exactly one WARN per manifest, exit code confirmed **0**
(warnings alone never fail the run). Then added a `SIMULATE_COOP=1` env
toggle to the *test rig only* (not the pipeline) to send
`cross-origin-opener-policy: same-origin`; re-ran target mode → both
manifests correctly reported the header value and FAILED with
`"host sent Cross-Origin-Opener-Policy: \"same-origin\" -- this severs
window.opener..."`, exit code confirmed **1**.

## 2. Verification checklist (brief's own list)

- [x] Mixed-case refusal battery — §1 Row 1: 19/19 hostile cases refused
      (12 fixture + 7 real-worktree confirming), 0 over-blocks, all
      canaries intact.
- [x] Truncation caught — §1 Row 3: both plain truncation and same-size
      hash corruption caught in `--no-emit`; restore → green both times.
- [x] Target mode proven without a real host — §1 Row 4: my own
      independently-started/stopped ephemeral server, green/red/red/green,
      no server left running.
- [x] `npm run test:staging` green, default AND `--no-emit` — 99/99 both,
      confirmed post-commit too.
- [x] `npm run test:vtt` green — 109 adapter + 48 opener-bridge checks +
      `[OWLBEAR PANEL TEST SUCCESS]` + `[OWLBEAR BRIDGE TEST SUCCESS]`,
      byte-identical to the pre-task baseline (this task touches none of
      those files).
- [x] `git status` clean apart from the commit — confirmed: only
      `BETA_2.5_PROJECT_STATE.md` (pre-existing, not mine) and the
      pre-existing untracked brief/report docs remain; `dist-staging/` left
      freshly emitted for the standard `https://staging.invalid/as` base
      (36 real files + 2 new artifact-metadata files = 37 recorded in
      `STAGING-INTEGRITY.json`), matching the shape every prior session
      left it in.

Bonus, not required but run for extra confidence: `npm run test:dice-skins`
green, unaffected (this task touches none of the dice-skin files).

## 3. Files changed / commit

- `scripts/lib/owlbear-staging-assets.mjs` (+106/-0): `crypto` import;
  `STAGING_INTEGRITY_FILENAME`, `STAGING_HOST_NOTES_FILENAME` constants;
  `listFilesRecursive`, `buildFileManifest`, `buildStagingHostNotes`.
- `scripts/publish-staging.mjs` (+111/-18): `comparablePath`/`pathExists`
  helpers; case-folded `assertSafeOutDir` (checks 1–3) and
  `assertWithinRoot`; explicit fail-safe wrap on check 4; writes
  `STAGING-HOST-NOTES.md` then `STAGING-INTEGRITY.json` as the last two
  steps of `publishStaging()`; CLI summary mentions both new files + the
  `--target=` follow-up command.
- `scripts/test-staging-deploy.mjs` (+189/-22): `crypto` import;
  `--target=` flag (implies `--no-emit`); `fetchLocal` → `fetchBytes`
  (reads full body); new `checkIntegrity()`; integrity-manifest fetch +
  map-build; per-file integrity assertions on every existing fetch site;
  target-mode COOP/ACAO reporting + `warnings` list; usage/doc comments
  updated.
- Total: 3 files changed, 406 insertions(+), 40 deletions(-).
  `package.json` untouched (no new npm script needed).

Committed as explicit paths (never `git add -A`):
```
git add scripts/lib/owlbear-staging-assets.mjs scripts/publish-staging.mjs scripts/test-staging-deploy.mjs
git commit -m "007: case-safe guards + verify-against-host mode" ...
```
Commit hash: **80e48c5f56b73fb1dc9015676246412969b5b621** (short `80e48c5`),
branch `agent/beta-2-5-online`, local only. `git status --porcelain`
immediately after shows only the pre-existing coordinator docs (state file
+ this task's brief + reports 005/006, all left exactly as found).

## 4. Work narrative

**Reading order:** `BETA_2.5_PROJECT_STATE.md` → brief 007 → report 006 in
full (its items 2 and 3 are the spec) → reports 004 and 005 for the attack
history and current guard shapes → all three shipped scripts, in full, at
commit `6f767ff` → `package.json` (confirmed `test:staging`/`publish:staging`
wiring, no other script touches these files) → `.gitignore` (confirmed
`dist-staging/` already ignored). Baseline run of `npm run test:staging`
before touching anything: 53/53 PASS, matching 005's report exactly, and
`git status`/`git log -1` confirmed HEAD = `6f767ff` with the exact expected
untracked/modified docs before I changed anything.

**Design decisions made while implementing (SKETCH-level details the brief
left to the executor):**
- Case-folding scope: gated on `process.platform === "win32"` per the
  brief's literal wording ("compares case-insensitively on win32"), applied
  to every comparison in both `assertSafeOutDir` and `assertWithinRoot`
  (not just the specific `.git`-segment check the audit named) — the brief's
  fix-table row said "every path-segment / path-containment comparison in
  the guards," and I read "the guards" as both M1-guard functions, not just
  the one check the audit happened to name. Did NOT extend this to the sim
  server's `safeResolve()` in `test-staging-deploy.mjs`: report 006
  explicitly noted that one "fails safe" already (over-refuses rather than
  under-refuses), so it wasn't a bug needing this task's fix, and the brief
  scoped item 1 to "the delete guard" specifically.
- Integrity file design: recorded byte size + sha256 for the ENTIRE emitted
  tree (not just the crawled closure), because it's cheap (~45MB hashes in
  well under a second) and because the verify side only ever looks up paths
  it's already fetching for other reasons — a superset costs nothing and
  means any future check that starts fetching a new path automatically
  gets integrity coverage for free. Placed at the artifact ROOT (sibling to
  `owlbear/`, `owlbear-dice/`, `assets/`) so it resolves at `<base-url>/
  STAGING-INTEGRITY.json` after upload, matching how everything else in the
  artifact resolves.
- Target mode's origin: reused the existing `--base-url=`-equivalent
  semantics for `--target=` rather than inventing a second URL concept —
  `--target=<url>` IS the base URL the artifact should already be baked
  against (the brief's own example, `--target=<base-url>`, confirms this),
  so the exact same `expectedPrefix` field-matching logic that already
  existed needed zero changes; only the fetch origin and whether a local
  server starts needed to branch.
- Header checks scoped to target mode only, and ACAO-absent as a `warnings`
  list separate from `failures` so it cannot flip `process.exitCode` — both
  directly from the brief's own wording ("pass/fail on COOP present = fail;
  ACAO missing = loud warning").

**Verification order and rigor:**
1. Mixed-case battery on an isolated scratchpad fixture FIRST (never the
   real worktree), using the real imported `publishStaging()` — same
   discipline 005 used for M1/M8. Iterated once: my first fixture also
   included a plain "some-file.txt" meant to force check 4 into a
   non-ENOENT branch for a fail-safe proof; it did not (see the errno
   finding in §1 Row 1), and — more importantly — because the guard has no
   check for "the target already exists as a non-git file," `publishStaging`
   proceeded past the guard and its own `fs.rm`+`fs.mkdir` silently deleted
   and replaced that fixture file with a directory, corrupting my own
   canary set for the final comparison (a `readFileSync` on a now-directory
   threw `EISDIR`, crashing the test script). This was a genuine, if
   narrow and out-of-scope, discovery — flagged via `spawn_task`
   (`task_4885dae3`) rather than silently worked around or folded into this
   diff. I then reverted that specific fixture addition and re-ran the
   clean 12-case battery to a full PASS (the version quoted in §1).
2. Confirming pass against the REAL worktree, non-mutating by construction
   (guard throws before `fs.rm`), only after the fixture proof succeeded —
   same order 005 used.
3. Truncation + hash-corruption proofs directly against the real
   `dist-staging/` artifact in `--no-emit` mode (disposable, gitignored,
   restorable by a fresh emit) — backed up the one file I mutated to
   scratchpad first each time, restored via a fresh `npm run test:staging`
   at the end.
4. Target mode: wrote the standalone ephemeral server, hit an early bug of
   my own (see Dead ends below), fixed it, then ran the full green/red
   sequence against it, plus the COOP-simulation variant.
5. Full suites (`test:staging` both modes, `test:vtt`, `test:dice-skins`)
   run fresh post-implementation and again post-commit.

**Dead ends / corrections along the way:**
- The ENOTDIR fail-safe proof (described above) — did not reproduce as
  designed; pivoted to a direct, safe, disposable-directory errno probe
  instead (two path shapes, both gave ENOENT), which turned out to be more
  informative than the original plan (it corrects report 006's "either way"
  hedge with a real answer for this platform).
- First attempt at starting the ephemeral server passed it a Git-Bash-style
  POSIX path (`/e/Chat gpt Codex/...`) as the root directory argument.
  Native Windows Node has no concept of `/e/` as drive `E:` — it resolved
  as a literal folder named `e` under the current drive's root instead, so
  every request 403'd (the server's own boundary check compared a
  backslash-normalized resolved path against a never-normalized,
  forward-slash `root` string and never matched). Fixed by passing a
  drive-lettered path (`E:/Chat gpt Codex/...` — forward slashes are fine
  with a drive letter) and adding `path.resolve()` normalization inside the
  throwaway server script itself for robustness.
- One background-process check (`kill <bash-reported-pid>`) silently did
  nothing because the Bash tool's job-control PID didn't match the actual
  Windows PID holding the port; switched to finding the real PID via
  `netstat -ano` and stopping it with `taskkill //PID <n> //F`, which is
  what I used for every subsequent stop.
- A combined "start in background, poll a log file, cat it" one-liner
  occasionally raced ahead of the file being flushed; separated the start
  and the poll into distinct steps and it was reliable from then on.

**Final state left behind:** `dist-staging/` freshly emitted via a plain
`npm run test:staging` (base `https://staging.invalid/as`, PASS 99/99, 37
files recorded in `STAGING-INTEGRITY.json`). No servers of mine running —
verified via `netstat`/`tasklist` that the only high-port listener besides
the owner's pre-existing `:4176` (PID 22928, untouched) was Steam
(PID 13604, the user's own unrelated background process, not started or
touched by me). `git status --porcelain` shows only the pre-existing
coordinator docs, exactly as instructed.

## 5. Deviations from the brief (for the record, none contradict a DECIDED item)

1. Did not extend the win32 case-fold to `test-staging-deploy.mjs`'s
   `safeResolve()` (the local sim server's traversal guard) — out of this
   task's stated scope ("the delete guard"), and report 006 already noted
   it fails safe, not dangerous.
2. `--target=` also accepts (and requires) a URL the same way `--base-url=`
   does, rather than a bare host/flag — read as the natural interpretation
   of the brief's own `--target=<base-url>` example.
3. `STAGING-INTEGRITY.json` covers every emitted file, not only the crawled
   closure — a superset judged strictly more useful at negligible cost (see
   §4).
4. Found and did NOT fix an out-of-scope residual gap (existing-plain-file
   collision at `--out=`) — flagged via `spawn_task` instead, per this
   task's explicit out-of-scope list ("any tracked file beyond the three
   staging scripts...") and the brief's DECIDED-items-only mandate.

## 6. Questions / follow-ups parked (none block this task's own verdict)

1. **Spawned as a background suggestion** (`task_4885dae3`, not a blocking
   question): `assertSafeOutDir` has no check for "the resolved out-dir
   already exists as a plain file" — such a target silently gets deleted
   and replaced with an empty directory by the normal emit flow. Low
   severity (requires pointing `--out=` at an existing unrelated file, which
   is an unusual thing to do given the tool's "disposable directory"
   contract), unrelated to git protection specifically, discovered by
   accident while building this task's own test fixture. Full repro +
   suggested fix shape are in the spawned task's prompt.
2. Everything else from 004/005/006's owner-decision ledger is unchanged by
   this task (host choice, builder co-hosting/Q8, placement-offset
   blessing, `?v=` cache-buster unification, etc.) — none of it gated or
   touched this work.
