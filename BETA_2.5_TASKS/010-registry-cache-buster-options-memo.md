# Task 010 — Memo: registry cache-buster fix options (READ-ONLY, no fix)

<!-- Executor: treat DECIDED as final, SKETCH as hints to verify against
     real source. If a DECIDED item is impossible against the real code:
     STOP AND REPORT. Do not improvise. This task is READ-ONLY: no code
     changes, no commits except your one report file. -->

## Goal (DECIDED)
Produce a short options memo enumerating 2-3 concrete fix shapes for the
registry cache-buster bug (owner-parked question 7 in the hub), each with
what it changes, what it costs, and what it risks — grounded in the real
code you actually read, not speculation — so the owner can pick one
instead of choosing blind. READ-ONLY: no code changes except your report.

## Context the executor reads first
- `BETA_2.5_PROJECT_STATE.md` — owner-decision ledger, the parked
  question's framing, and the "cache-busters matter" hard rule
  (`?v=` params + ROLLER_VERSION)
- `scripts/promote-dice-skin.mjs` — writes
  `assets/dice/promoted-dice-skins.registry.js` and bumps a `?v=`
  cache-buster somewhere (confirmed present near a
  `` `?v=${cacheKey}` `` reference) — find EXACTLY which consumer file(s)
  it edits to bump that token
- `index.html`, `owlbear-dice/panel.html`, `owlbear-dice/overlay.html` —
  all three reference `promoted-dice-skins.registry.js` (confirmed by
  search). Establish precisely which of these get their reference's
  cache-buster bumped by `promote-dice-skin.mjs` today and which don't —
  the hub's claim is "only index.html does"; verify this exactly rather
  than trusting the summary.
- `runtime-loader.js` and the `ROLLER_VERSION` convention referenced in the
  hub's hard rules — how cache-busting is conventionally done elsewhere in
  this codebase, as prior art for your options.
- `BETA_2.5_TASKS/reports/004-ws2-pipeline-audit-report.md`, finding M9:
  panel.html and overlay.html carry DIFFERENT `?v=` tokens for the same
  ~45MB of dice files today, causing a duplicate download. Treat this as
  part of the same underlying problem, not a separate one — your memo
  should say whether one fix shape solves both or if they need separate
  answers.

## Design decisions (DECIDED)

| Decision | Value / rule |
|---|---|
| Scope | Options + tradeoffs only. Do NOT implement any fix. Do not modify any file except your report. |
| Must cover | (a) the "new sets silently don't appear in the picker" bug (stale registry reference in whichever of panel.html/overlay.html isn't bumped today), AND (b) the M9 double-download issue. State plainly whether one fix shape resolves both. |
| Candidate shapes — evaluate at minimum | 1) `promote-dice-skin.mjs` bumps the SAME cache-buster value into all consumer pages (index.html, panel.html, overlay.html). 2) A dedicated registry-only cache-buster token, separate from the general dice-payload `?v=`, so a promotion invalidates only the small registry file rather than the ~42MB asset payload. 3) Any other real option you find evidence for in this codebase's existing conventions. For each: what changes, what a promotion author has to remember (or not) if this isn't fixed, and what breaks if forgotten. |
| Evidence bar | Every claim about current behavior must cite the actual file/line you read it from. |
| Concurrency | A writer (task 008) and another read-only scout (task 009) may be running concurrently in this same worktree — expected and fine since you make no changes. |

## Out of scope (DECIDED)
- Implementing anything.
- WS3, WS4 (task 008), WS6, staging/host work.
- Any dice-core or Workshop repo changes.

## Verification
Not applicable (read-only, nothing changes, no suites to run).

## Report requirements (DECIDED)
Write your own final report to
`BETA_2.5_TASKS/reports/010-registry-cache-buster-options-memo-report.md`,
with the options table as its centerpiece. Must also contain:
1. **Work narrative**: what was examined, exact files/lines read, dead
   ends included.
2. The verified-exact current behavior (which pages get bumped today,
   which don't) — do not repeat the hub's summary without checking it.
3. Your own lean, if you have one, clearly labeled as opinion, not decision.
4. Questions parked for the owner (or "none").
Your final chat message back to the coordinator is a **digest only**
(≤15 lines: report path, the options in one line each, your lean if any).
Do not edit `BETA_2.5_PROJECT_STATE.md`.

## Owner live-check
None (memo only).

## On green
If your only change is the report file, a small commit for just that file
is fine: `010: registry cache-buster options memo (diagnosis only)` (local
only — never push).
