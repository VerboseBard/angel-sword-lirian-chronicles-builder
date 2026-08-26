# Task 005 — Harden the staging pipeline (close the 004 audit findings)

<!-- Executor: DECIDED is final; SKETCH verify against source. If a DECIDED
     item is impossible against the real code: STOP AND REPORT. -->

## Goal (DECIDED)
The two HIGH and two MEDIUM findings from the Task 004 cross-audit are
closed in the staging pipeline (commit 5384bce's scripts), proven closed by
rerunning the audit's own attacks, with everything green. No behavior of
the emitted artifact changes except where a finding requires it.

## Context the executor reads first
- `BETA_2.5_PROJECT_STATE.md` (rules — mandatory, incl. Digest rule)
- **The full audit: `BETA_2.5_TASKS/reports/004-ws2-pipeline-audit-report.md`**
  — findings M1-M10 with repro commands; this brief decides the fix shapes,
  that report is the spec detail.
- The code: `scripts/lib/owlbear-staging-assets.mjs`,
  `scripts/publish-staging.mjs`, `scripts/test-staging-deploy.mjs`

## Fix decisions (DECIDED — coordinator rulings)

| Finding | Fix |
|---|---|
| HIGH: `--out=` is an unvalidated recursive-delete target | The resolved output dir MUST be strictly inside the worktree root, must NOT be the root itself, and must NOT contain a `.git` entry. Violation → refuse with a clear error before ANY delete. No override flag (add later only if the owner asks). `--out=.`, `--out=..`, absolute paths outside, and the frozen `...Public Beta 2.20` sibling must all be impossible — prove each. |
| HIGH: `test:staging` re-emits, so it can't validate an artifact; closure check is near-tautological | Add a verify-in-place mode (e.g. `--no-emit` / `--artifact=<dir>`). Default run may keep emit-then-verify, but the VERIFY phase must derive its closure from the STAGED tree's own pages and STAGED registry (never from re-crawling the source), and additionally assert a pinned sentinel list: `dice-3d-embedded.js`, `three.min.js`, `GLTFLoader.js`, the registry file, and every sidecar the staged registry names. Deleting any staged closure file → red. Corrupting a manifest URL field to a relative path → red. |
| MEDIUM: `normalizeBaseUrl` accepts query/fragment/dot-segments and silently drops subpaths | Query, fragment, or dot-segments in the base URL → refuse with a clear error. A legitimate subpath base (e.g. `https://host.tld/angel-sword`) must survive into every baked URL — prove with an emit. |
| MEDIUM: crawler extension allow-list lacks audio/font types (WS4 sounds would silently vanish) | Add audio (`mp3`, `ogg`, `wav`, `m4a`) and font (`woff`, `woff2`, `ttf`, `otf`) to the allow-list now, so WS4's overlay sounds get crawled the day they land. |
| M-items beyond these four | Read M1-M10; apply any remaining fix that is small and obviously safe; anything structural or debatable → list in your report as proposed-not-done. Explicitly NOT yours: the `?v=` token design (owner question), unminified-source pruning (accepted as-is), `.github/workflows/*`, `test-cross-browser.mjs`. |

## Out of scope (DECIDED)
WS4 itself; any dice art/core; any tracked file outside the three staging
scripts + `package.json` (only if a new script flag needs wiring); the
frozen 2.20 sibling; the Workshop repo; `BETA_2.5_PROJECT_STATE.md`.

## Verification (all green before commit)
- [ ] Each DECIDED attack above reproduced: first confirm it FAILS on the
      pre-fix code path where practical to observe, then PASSES (refuses /
      goes red) post-fix. Use the exact commands from the 004 report.
- [ ] `npm run test:staging` — green on a clean default run.
- [ ] Verify-in-place mode: green on an intact artifact; red on a mutated
      one (restore/re-emit afterward; leave `dist-staging/` clean).
- [ ] `npm run test:vtt` — green (collateral check).
- [ ] No servers left running; `git status` clean apart from your commit.

## Report requirements (DECIDED)
Write your own report to
`BETA_2.5_TASKS/reports/005-staging-pipeline-hardening-report.md`
(checklist outcomes, work narrative, files+commit, deviations, parked
questions). Final chat message = DIGEST ≤15 lines per the template rule.
Commit locally on green with explicit paths (never `git add -A`, never
push): suggested message `005: staging pipeline hardening (004 audit fixes)`.
