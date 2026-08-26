# Task 007 — Case-safe guards + verify-against-the-real-host mode

<!-- Executor: DECIDED is final; SKETCH verify against source. If a DECIDED
     item is impossible against the real code: STOP AND REPORT. -->

## Goal (DECIDED)
Three gaps found by the Task 006 final audit are closed: (1) the delete
guard's path-segment checks are case-insensitive on Windows so `.GIT`
cannot slip past, and its error paths fail SAFE; (2) the staging checker
can run its full check list against a REAL host URL after upload, not only
against local files; (3) checks stop being presence-only — a truncated or
corrupted file is caught by size.

## Context the executor reads first
- `BETA_2.5_PROJECT_STATE.md` (rules — mandatory, incl. Digest rule)
- **`BETA_2.5_TASKS/reports/006-final-audit-ws2-chain-report.md`** — the
  audit this task closes; read its items 2 and 3 in full, they are the spec.
- Prior chain for context: reports 004 (the attacks) and 005 (the current
  guards). Code: the three staging scripts at commit `6f767ff`.

## Fix decisions (DECIDED)

| Item | Fix |
|---|---|
| Case-sensitivity (fails DANGEROUS today) | Every path-segment / path-containment comparison in the guards compares case-insensitively on win32 (`.GIT`, `.Git`, mixed-case worktree paths, mixed-case frozen-sibling names). Re-run 005's full refusal battery in mixed case; all must still refuse. |
| Undesigned error path | Any unexpected error while deciding whether a delete target is safe → REFUSE (fail safe), never proceed. Make that explicit, not incidental. |
| Presence-only checks | At emit, record each staged file's byte size (and a cheap hash if trivial) into a small machine-readable file inside the artifact. Verify modes assert size (and hash if present) matches, so truncation/corruption goes red. Keep this file out of the closure's own "must be referenced by a page" logic. |
| No post-upload proof | Add a target mode (e.g. `--target=<base-url>`) that runs the same check list over HTTPS against the real host: both manifests fetched and parsed, every URL-bearing field absolute + resolving, every closure file 200 with matching size. **Read-only HTTP only — GET/HEAD, never any write, never any auth, never a POST.** It must be runnable by the owner right after an upload. |
| Header reality (record, don't enforce) | The deploy-sim's headerless server proves "needs no special headers" only for a Node client. Real Owlbear fetches the manifest from a BROWSER, and the dev server sends CORS on `/owlbear*`. So the host requirement is **COOP absent AND `Access-Control-Allow-Origin` present**. In target mode, report the observed CORS/COOP headers for both manifests as informational output (pass/fail on COOP present = fail; ACAO missing = loud warning, since it may vary by host config). Also emit a short `STAGING-HOST-NOTES.md` into the artifact stating this requirement plainly for whoever uploads. |

## Out of scope (DECIDED)
Choosing/configuring a host; uploading anything; browser-driven smoke
tests; WS3 slimming (the 45MB double-download); WS4/WS5/WS6; the builder
co-hosting question (owner Q8); any tracked file beyond the three staging
scripts + `package.json` (+ the new notes file the emit writes into the
gitignored artifact). Never touch `BETA_2.5_PROJECT_STATE.md`, the frozen
2.20 sibling, or the Workshop repo.

## Verification (all green before commit)
- [ ] Mixed-case refusal battery: `--out=.GIT`, `.Git`, mixed-case
      worktree-root and frozen-sibling paths — all REFUSED, canaries
      intact (use an isolated fixture as 005 did).
- [ ] Truncation caught: shrink one staged file → verify mode goes RED;
      restore → green.
- [ ] Target mode proven WITHOUT a real host: point it at a local static
      server you start and stop yourself on an ephemeral port serving the
      artifact (that is the stand-in for the host); prove green on intact,
      red on a removed/truncated file. Leave no server running.
- [ ] `npm run test:staging` green (default + `--no-emit` modes).
- [ ] `npm run test:vtt` green (collateral).
- [ ] `git status` clean apart from your commit; `dist-staging/` freshly
      emitted.

## Report requirements (DECIDED)
Write your own report to
`BETA_2.5_TASKS/reports/007-staging-verify-against-host-report.md`.
Final chat message = DIGEST ≤15 lines. Commit locally on green, explicit
paths, never `git add -A`, never push:
`007: case-safe guards + verify-against-host mode`.
