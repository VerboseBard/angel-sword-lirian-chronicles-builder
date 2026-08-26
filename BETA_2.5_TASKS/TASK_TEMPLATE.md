# Task NNN — <short imperative title>

<!-- Save as BETA_2.5_TASKS/NNN-short-name.md. The executor (Claude
     sub-agent or ChatGPT/Codex) treats DECIDED sections as final and
     SKETCH sections as suggestions to verify against real source.
     If a DECIDED item is impossible against the real code: STOP AND
     REPORT. Do not improvise. -->

## Goal (DECIDED)
One paragraph: what exists after this task that didn't before, and how
we'll know it works.

## Context the executor reads first
- `BETA_2.5_PROJECT_STATE.md` (rules + current state — mandatory)
- Relevant plan sections: `BETA_2.5_ONLINE_CONVERSION_PLAN.md` §…
- Relevant source files: …

## Design decisions (DECIDED)
Owner rulings and coordinator decisions already made. Not re-litigated.

| Decision | Value / rule |
|---|---|
|  |  |

## Implementation sketch (SKETCH — verify against real source)
Files to touch, functions to add/change. Line numbers and API claims here
are hints, not facts — confirm them in the actual code first.

## Out of scope (DECIDED)
What this task deliberately does NOT do.

## Verification (all must be green before commit)
- [ ] `npm run build` (if src/js touched) — and bump the relevant ?v=
      cache-busters
- [ ] `npm run test:vtt`
- [ ] `npm run test:dice-skins` + `npm run dice:core:check` (if dice core
      touched — and sync the Workshop copy, committing ONLY the core file
      there)
- [ ] <task-specific checks / audit instruments>

## Report requirements (DECIDED)
The final report is saved verbatim to
`BETA_2.5_TASKS/reports/NNN-short-name-report.md` and must contain:
1. Outcome vs the verification checklist (each item: green/red/skipped+why).
2. **Work narrative**: what was examined, what was tried, dead ends
   included — written so the owner can review the actual work, not just
   conclusions.
3. Files touched + commit hash(es).
4. Deviations from the sketch and why.
5. Questions parked for the owner (or "none").
The executor (or coordinator) also appends a work-log entry to
`BETA_2.5_PROJECT_STATE.md`.

## Owner live-check (keep under 5 minutes)
The human feel-test steps, if any:
1. …

## On green
Commit message suggestion: `NNN: <title>` (local only — never push).
