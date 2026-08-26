# Task 009 — Scout: dice engine face-mismatch bug (READ-ONLY, diagnosis only)

<!-- Executor: treat DECIDED as final, SKETCH as hints to verify against
     real source. If a DECIDED item is impossible against the real code:
     STOP AND REPORT. Do not improvise. This task is READ-ONLY: no code
     changes, no commits except your one report file. -->

## Goal (DECIDED)
Produce a grounded diagnosis (NOT a fix) of a pre-existing bug: the dice
engine sometimes shows a face that doesn't match the rolled/registered
result value (owner-observed on the Rana set's d10s/d20s — example: a
registered 17 showing a different face). Deliverable is a report
identifying the root cause (or ranked candidates with evidence) plus a
concrete, minimal repro if you can get one. This predates the online
conversion and affects the sheet and Owlbear equally.

## Context the executor reads first
- `BETA_2.5_PROJECT_STATE.md` (rules + current state — mandatory)
- `BETA_2.5_ONLINE_CONVERSION_PLAN.md` — 2026-08-25 status log, item (b)
  under "Logged, deliberately not in this pass": the exact owner-reported
  symptom and the plan's own candidate approach (automated forced-result
  face-verification screenshots across all sets via the existing browser
  matrix harness).
- `scripts/test-dice-browser-matrix.mjs` (exists in this repo — read what
  it already does before assuming anything needs to be built; you are NOT
  writing new scripts, this is read-only)
- `scripts/dice-face-audit.mjs`, `dice-topdown-audit.mjs`,
  `dice-anchor-legend.mjs` and `DICE_FACE_AUDIT_2026-08-25.md` if present —
  these already proved the 280 static face ASSIGNMENTS/orientations are
  correct in all four sets. Read enough to NOT re-derive that; this bug is
  different in kind (see next section).
- The shared dice engine/core used by both the sheet and Owlbear (find it —
  the hub's Workshop-sync rule names the canonical file as
  `dice roller/dice-roller-core.js` in the sibling `../Dice Builder
  Workshop` repo; find THIS repo's consuming copy/reference to it by
  searching how it's loaded, not by guessing a path)

## Design decisions (DECIDED)

| Decision | Value / rule |
|---|---|
| Scope | Diagnosis only. Do not modify any file except your own report. Do not touch `../Dice Builder Workshop` or the frozen `...Public Beta 2.20` sibling. |
| Distinguish from the placement/orientation audits | Those proved static face assignment/orientation correct. THIS bug is about runtime behavior — does the engine's random-selection/settle logic actually land on and display the face matching the number it reports as the result? Don't conflate the two. |
| Repro priority | Rana set d10 and d20 first (owner's own sighting), then check whether other sets show it too. |
| Evidence bar | A concrete repro (forced-result test, or a precise read of the settle/selection code showing the defect) beats speculation. If you cannot reproduce it, say so plainly and report exactly what you checked and ruled out. |
| Concurrency | A writer (task 008, overlay sounds) and another read-only memo (task 010) may be running concurrently in this same worktree — expected and fine since you make no changes. |

## Investigation sketch (SKETCH — verify against real source)
- Trace how a roll's result NUMBER maps to a physical face index/orientation
  at settle time — likely near (but distinct from) whatever
  `dice-face-audit.mjs` reads for its static 280-face grid.
- Candidate desync causes to check: off-by-one in a face-index array, a
  per-set face-order override applied inconsistently between sets,
  floating-point/nearest-face selection at physics settle landing on an
  adjacent face instead of the intended one, or a display layer reading a
  stale/different value than what was actually rolled.
- If you build a throwaway repro script to test a hypothesis, delete it
  before finishing (worktree stays clean besides your report) — or if you
  deliberately leave one, say exactly why in the report.

## Out of scope (DECIDED)
- Any fix or code/dice-core edit.
- Any Workshop repo access or changes.
- WS4 (task 008), WS2/staging, registry/cache-buster work (task 010).

## Verification
Not applicable (read-only). If you ran any manual/scripted repro, describe
exactly what you ran and its output in the report instead of a checklist.

## Report requirements (DECIDED)
Write your own final report to
`BETA_2.5_TASKS/reports/009-dice-face-mismatch-scout-report.md`. Must
contain:
1. **Reproduced? yes/no** — and exactly how, or exactly what you tried.
2. **Work narrative**: what was examined, what was tried, dead ends
   included — written so the owner can review the actual work.
3. Best-evidence root cause, or ranked candidates with your confidence in
   each and the evidence for it.
4. A proposed minimal fix approach for a FUTURE task — describe it, do not
   apply it.
5. Which sets/dice you found affected vs checked-and-clean.
6. Questions parked for the owner (or "none").
Your final chat message back to the coordinator is a **digest only**
(≤15 lines: reproduced y/n, best-evidence cause, confidence, report path).
Do not edit `BETA_2.5_PROJECT_STATE.md`.

## Owner live-check
None (diagnosis only).

## On green
If your only change is the report file, a small commit for just that file
is fine: `009: dice face-mismatch scout (diagnosis only)` (local only —
never push).
