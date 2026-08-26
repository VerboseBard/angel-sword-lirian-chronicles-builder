# Task 003 — Cross-audit the Task 002 scout report (find misses, don't redo)

<!-- Executor: STRICTLY READ-ONLY. This is an adversarial verification of
     another agent's report, per the project's cross-audit discipline. -->

## Goal (DECIDED)
A verdict sheet on `BETA_2.5_TASKS/reports/002-ws5-ws6-contract-scout-report.md`:
each load-bearing claim CONFIRMED, REFUTED, or NUANCED against the real
source, so the coordinator can turn the scout's recommendations into
DECIDED brief lines without propagating an error. You are checking the
scout's work, not repeating its survey — do not produce your own map of
the codebase.

## Context the executor reads first
- `BETA_2.5_PROJECT_STATE.md` (rules — mandatory)
- The report under audit: `BETA_2.5_TASKS/reports/002-ws5-ws6-contract-scout-report.md`

## Hard constraint (DECIDED)
**READ-ONLY.** No writes, no `npm`, no builds, no servers, no test runs, no
mutating git (`git log`/`git show`/`git diff` fine). A writer agent (task
001, WS2 staging pipeline) may still be active in this worktree — its files
(new `scripts/publish-staging*`/staging/deploy-sim files, `.gitignore`,
`package.json` script additions, `BETA_2.5_PROJECT_STATE.md` log) are
expected to be in flux; audit the scout's claims against files task 001
does not touch, using `git show HEAD:<path>` if anything seems mid-edit.

## Claims to verify (DECIDED — check ALL of these, in this order)
1. `schemaVersion` is written in four places in `owlbear/core.js` (:83,
   :133, :191, :264) and read nowhere in the runtime codebase; :264
   overwrites an incoming value.
2. `VTT_RELAY_VERSION` exists as two independent literals
   (`src/js/vtt-relay.js:18`, `owlbear/opener-bridge.js:25`), is stamped
   but never read, and is NOT pinned by the spec-drift phase at
   `scripts/test-owlbear-opener-bridge.mjs:97-108`.
3. The sheet's room-roll consumer at `src/js/ui.js:23656-23667` reads wire
   fields with no normalize/guard, and `src/js/vtt-relay.js` must not
   import `owlbear/core.js` (isolation asserted at
   `scripts/test-vtt-adapters.mjs:288` or nearby).
4. `normalizeRollEvent` (`core.js:253-283`): only `total` is mandatory; a
   missing `id` is synthesized (defeating id-dedup); unknown fields are
   dropped by rebuild.
5. `normalizeCharacterExport` (`core.js:168-181`) duck-types on
   `fields`+`play` vs `format`/`race`+`mainStats` and throws otherwise; a
   rejected handoff surfaces to the user as the misleading
   "not linked to a game room" message (`ui.js:23418` or nearby).
6. The message-type table's rows 12-14 specifically: room rolls re-tagged
   `owlbear-room` reach the sheet UN-normalized; the overlay
   BroadcastChannel messages (`overlay-alive`/`overlay-ready`/`roll-replay`)
   are as described.
7. `dice:promote` writes the five outputs listed (sidecar, json, registry,
   pack manifest, index.html cache-buster) and `updateRegistryCacheBuster`
   touches ONLY `index.html`; the three registry `?v=` values across
   `index.html:457`, `owlbear-dice/panel.html:74`,
   `owlbear-dice/overlay.html:50` differ/are-stale as reported.
8. `scripts/test-dice-skin-integration.mjs` hardcodes id arrays (:122,
   :128) and full-set assertions (:135-136) such that a fourth set or a
   single-die pack would fail; the file uses `node:assert/strict`.
9. The three orphan sidecars in `assets/dice-3d/promoted/`
   (`asari-d20.js`, `exact-reference-test.js`, `my-custom-dice-set.js`,
   ~4.8 MB) are truly unreferenced by the registry.
10. `.github/workflows/deploy-pages.yml` rsync list omits `owlbear-dice/`.
11. A missing sidecar rejects the whole sequential loader chain in all
    three surfaces (overlay/panel/builder), while an incomplete sidecar
    silently falls back to procedural faces.
12. The claimed harness anchor points for WS5 tests exist as described:
    `check()` + `main()` phase registration in `test-vtt-adapters.mjs`,
    `createHarness().deliver(...)` in `test-owlbear-opener-bridge.mjs`,
    hand-written `v: 1` envelopes in `test-owlbear-panel.mjs:105,125`.

Then ONE bounded miss-hunt (do not expand into a new survey): in the exact
files the scout cited for claims 1-6, is there any OTHER receive-side gate
or version read it failed to mention that would change the WS5
recommendations? Spot-check, not sweep.

## Out of scope (DECIDED)
- Re-surveying the codebase, auditing the scout's prose style, or checking
  every minor citation — the twelve claims + bounded miss-hunt only.
- Any opinion on the parked owner questions (those are the owner's).
- Any modification anywhere.

## Verification
- [ ] Each of the 12 claims has a verdict line: CONFIRMED / REFUTED /
      NUANCED, with the file:line evidence you checked.
- [ ] Wrong line numbers in otherwise-true claims are listed separately as
      corrections (claim still CONFIRMED, citation fixed).

## Report requirements (DECIDED)
Your final chat message IS the report, verbatim — the coordinator saves it
to `BETA_2.5_TASKS/reports/003-scout-report-audit-report.md`. Include:
1. Verdict sheet (12 rows).
2. Citation corrections (or "none").
3. Misses found in the bounded hunt (or "none").
4. Overall: is the scout report safe to base DECIDED brief lines on?
5. Work narrative (brief — what you checked and how).

## On green
No commit — read-only task.
