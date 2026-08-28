# Task 011 — Wire the Workshop composer to the real per-shape placement offsets

<!-- Executor: treat DECIDED as final, SKETCH as hints to verify against
     real source. If a DECIDED item is impossible against the real code:
     STOP AND REPORT. Do not improvise. -->

## Goal (DECIDED)
The Dice Builder Workshop's skin composer (uncommitted WIP, ~17 days old)
already supports "flat artwork, numbers added afterward" — but its
placement math is a crude, incomplete guess: a fixed 30%-of-the-way
corner-to-centroid lerp for d4, a blanket -2% fudge for d8/d20 only, and
NOTHING for d6/d10/d100/d12. Meanwhile the Beta 2.5 project already
measured real per-shape placement offsets from the actual art family
(2026-08-25 audit). After this task, the Workshop composer uses those six
real measured offsets — one per die shape — as its default placement for
ALL shapes, replacing the current guesswork. This is a data/logic fix
only: no new art, no change to any existing promoted set's appearance
unless it's re-exported through the fixed tool.

## Context the executor reads first
- `BETA_2.5_PROJECT_STATE.md` (rules — mandatory)
- `BETA_2.5_ONLINE_CONVERSION_PLAN.md`, "Design tokens derived" backlog
  section — background/history on why these offsets exist. This prose is
  NOT the source of truth for the actual numbers; treat it as motivation
  only.
- `scripts/dice-numeral-placement-audit.mjs` (Beta 2.5 builder repo,
  354 lines) — READ-ONLY reference. This is how "design offset" is
  actually computed and measured against. You MUST understand its exact
  geometric meaning (which axis, what it's a percentage of, sign
  convention, how it treats d4's 3-corner-numerals-per-face case
  differently from the single-number dice) before writing the composer
  equivalent — getting the semantics backwards would silently reintroduce
  the same bug this task fixes.
- `qa-test-results/dice-face-audit/numeral-placement.json` (Beta 2.5
  builder repo — this file exists on disk, ~93KB, generated 2026-08-25; it
  is gitignored/not committed, so read it directly from the filesystem).
  Its top-level `designOffsets` key is the actual per-shape numbers to
  use. Its `faces` key (per-individual-face corrections) is OUT OF SCOPE
  for this task — do not use it here.
- Dice Builder Workshop repo (`E:\Chat gpt Codex\Angels sword\Dice
  Builder Workshop`): `dice roller/dice-skin-composer.js` (the file to
  fix — read its current on-disk content; it's uncommitted, there is no
  clean git baseline to diff against for it since it's a new file),
  `dice roller templates/skin-pack-builder.html` (calls into the
  composer — check whether it passes anything shape-specific that your
  change needs to plug into), `dice roller/dice-geometry.js` (shared
  geometry helpers — consider whether the offset table belongs here
  instead of in the composer file), `scripts/test-dice-skin-workflow.cjs`
  (existing test harness — currently asserts which digits get drawn, not
  where; extend it to also assert position if it doesn't already).

## Design decisions (DECIDED)

| Decision | Value / rule |
|---|---|
| Data source | `qa-test-results/dice-face-audit/numeral-placement.json`'s `designOffsets` key (Beta 2.5 builder repo, 2026-08-25 snapshot) is the ONLY source for the six per-shape default numbers. Do not invent, guess, or re-derive them. |
| Scope: shape-level only | Wire the SIX per-shape defaults (one offset per die type: d6, d8, d10, d100, d12, d20) into the composer, replacing ALL of its current ad-hoc logic (the 30% lerp, the ±2% fudge, and the missing cases). Per-INDIVIDUAL-face corrections (the `faces` key) and per-SET-family adjustments (e.g. "this one set's entire d20 sits low") are explicitly OUT OF SCOPE — future follow-up tasks, once there's real exported output to measure. |
| Semantic fidelity | Apply the offset with the EXACT SAME geometric meaning the audit script measures it with. Read that script first; replicate its math, don't reinvent it. |
| Not yet owner-blessed | These specific percentages are real measurements but the owner's formal blessing (parked question 1 in the hub) is still pending. Use them anyway — they are strictly better than the current crude/missing logic — but store them as ONE clearly-labeled, easily-editable constant (with a source/date comment) so a future blessing-driven change is a one-line edit, not a re-implementation. |
| Land existing WIP first | The Workshop repo has ~17-day-old uncommitted work (the composer, `dice-reference-face-extractor.js`, `dice-skin-pack-io.js`, the two "Promote Dice Skin" scripts, and the README/`skin-pack-builder.html`/`skin-studio.js`/`local-server.cjs`/`dice-geometry.js` changes) that has never been committed. Before making YOUR changes, commit that pre-existing work AS-IS in its own commit — a clean checkpoint of what already existed vs. what you change. Do not "clean up" or alter that pre-existing work beyond what your actual task requires. |
| Repos involved | Code changes happen in the Dice Builder Workshop repo (commit there). Your report file goes in the Beta 2.5 builder repo's `BETA_2.5_TASKS/reports/` as usual (commit there separately, that repo's working tree must stay clean otherwise). Do not touch the frozen `...Public Beta 2.20` sibling. The builder repo's audit script is READ-ONLY reference — do not modify it. |
| Concurrency | You are the only agent expected to be active. If you find evidence another process is mid-edit in either repo, STOP AND REPORT rather than proceeding. |
| Git discipline | Both repos: local commits only, never push, never `git add -A` — stage explicit paths. |
| State file | Do NOT edit `BETA_2.5_PROJECT_STATE.md` — the coordinator holds the work log. |

## Implementation sketch (SKETCH — verify against real source)
- Likely touches `drawPresentation` / `drawD4Numbers` in
  `dice-skin-composer.js`, replacing the hardcoded `-size * 0.02` fudge
  and the fixed `0.3` corner-to-centroid lerp with a lookup keyed by die
  type, populated from the six real values.
- A hardcoded constant table (with a source-and-date comment) is probably
  simplest — avoid inventing a new cross-repo sync mechanism for six
  numbers; use judgment but keep it simple.
- d4 has 3 numerals per face (corners), not 1 — confirm exactly what the
  audit script's "design offset" means for d4 before assuming it reuses
  the single-number case's formula unchanged.

## Out of scope (DECIDED)
- Per-face corrections (`faces` key in numeral-placement.json).
- Per-set-family adjustments (e.g. an entire set's d20 sitting low).
- Any new art, any Rana d4 re-bake, any actual re-promotion of any set.
- Any change to the promotion pipeline, registry, or the frozen Beta 2.20
  folder.
- Any change to the builder repo's audit script (read-only reference).

## Verification (all must be green before commit)
- [ ] `scripts/test-dice-skin-workflow.cjs` (Workshop repo) green —
      extend it to assert the new offsets are actually applied
      (measured position, not just which digits get drawn) if it
      doesn't already do this
- [ ] Programmatic check: render one sample face per die type
      (d4/d6/d8/d10/d100/d12/d20) through the fixed composer and confirm
      the numeral's measured position matches the intended per-shape
      offset within a small tolerance
- [ ] Confirm (and state in the report) that the Beta 2.5 builder repo's
      own code and suites are untouched — you're only reading reference
      files there, plus writing your report
- [ ] No dev server left running in either repo

## Report requirements (DECIDED)
Write your own final report to
`BETA_2.5_TASKS/reports/011-workshop-composer-real-placement-offsets-report.md`
(in the Beta 2.5 builder repo, same as always). Must contain:
1. Outcome vs the verification checklist (each item: green/red/skipped+why).
2. **Work narrative**: what was examined (incl. exactly what the audit
   script's design-offset math means), what was tried, dead ends included.
3. Files touched + commit hash(es) — note which commits are in which repo.
4. Deviations from the sketch and why.
5. Questions parked for the owner (or "none").
Your final chat message back to the coordinator is a **digest only**
(≤15 lines: verdict, the six offset values used, worst finding, commit
hashes per repo, parked questions, report path). Do not edit
`BETA_2.5_PROJECT_STATE.md`.

## Owner live-check (keep under 5 minutes)
Open the Workshop, start (or continue) a test set choosing "Flat
artwork" for one die of each shape, and eyeball that the auto-placed
numeral looks sensible — especially d4 (3 corners) and d20 (historically
the most-off single-number shape).

## On green
Two commits in the Workshop repo — (1) landing the pre-existing
composer/promotion WIP as-is, (2) the actual placement-offset fix — plus
the usual report commit in the builder repo. Suggested messages:
`Land existing composer/promotion WIP (uncommitted since ~2026-08-09)`
and `011: wire composer numeral placement to real per-shape design
offsets`. Local only — never push, either repo.
