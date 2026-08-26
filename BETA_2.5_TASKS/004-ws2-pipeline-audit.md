# Task 004 — Cross-audit Task 001's staging pipeline (find misses, don't redo)

<!-- Executor: adversarial verification of another agent's shipped code,
     per the project's cross-audit discipline. Mostly read-only; the ONLY
     writes permitted are into the gitignored dist-staging/ output via the
     pipeline's own scripts. -->

## Goal (DECIDED)
A verdict on commit `5384bce` (the WS2 staging publish pipeline) and its
report `BETA_2.5_TASKS/reports/001-ws2-staging-publish-pipeline-report.md`:
does the pipeline actually deliver what the report claims, and what did the
executor miss? You hunt for holes; you do not rewrite, refactor, or
re-implement anything. Findings become follow-up fix tasks, not edits.

## Context the executor reads first
- `BETA_2.5_PROJECT_STATE.md` (rules — mandatory)
- The brief that was executed: `BETA_2.5_TASKS/001-ws2-staging-publish-pipeline.md`
- The report under audit: `BETA_2.5_TASKS/reports/001-ws2-staging-publish-pipeline-report.md`
- The shipped code: `scripts/lib/owlbear-staging-assets.mjs`,
  `scripts/publish-staging.mjs`, `scripts/test-staging-deploy.mjs`
- For cross-reference: `scripts/server.mjs` (the serve-time behavior the
  emit bakes), `owlbear/*.html`, `owlbear-dice/*.html`, and the inline
  loader arrays inside the dice pages

## Permissions (DECIDED)
- Read anything in the worktree; mutating git commands FORBIDDEN.
- You MAY run: `node scripts/publish-staging.mjs ...`,
  `node scripts/test-staging-deploy.mjs`, `npm run test:staging`,
  `npm run publish:staging ...` — these write only the gitignored
  `dist-staging/` and rebuild extension `dist/` bundles, which is accepted.
- You MAY hand-mutate files INSIDE `dist-staging/` to prove the verifier
  actually fails when it should.
- NO edits to any tracked file. NO other npm scripts (001 already ran the
  main suites green; rerunning Playwright adds collision risk with the
  owner's live dev server on :4176). NO servers left running afterward.
  Never touch the frozen 2.20 sibling or the Workshop repo.
- Another read-only agent (task 003) may still be reading this tree —
  irrelevant to you; proceed.

## Audit checklist (DECIDED — cover ALL)
1. **Deletion safety (highest priority).** The emit wipes its output dir
   before every run. Prove the deletion target is hard-anchored inside the
   worktree and cannot be redirected by cwd, arguments, env, or a hostile
   base URL into deleting anything else. Quote the exact path construction.
2. **Closure completeness.** Build your own reference list by reading the
   real pages (both extensions' HTML, inline loader arrays, manifests,
   `background.js`'s runtime `overlay.html` open) and diff it against what
   the emit actually copies. Specifically confirm `dice-3d-embedded.js`
   (~2.8 MB, still in both dice pages' chains) and every sidecar named by
   the registry's `faceArtScript` entries are present in `dist-staging/` —
   the loader chains are strictly sequential, so ONE missing file kills
   the dice engine. Also check: CSS, `icon.svg`s, fonts, anything
   referenced by `owlbear/background.html`.
3. **Query-string handling.** `faceArtScript` values embed `?v=...`. Verify
   the crawler strips them before filesystem copy AND that the staged
   registry's runtime references still resolve on a dumb static host that
   ignores query strings.
4. **Manifest rewrite parity.** The staged manifests rewrite exactly the
   four fields `server.mjs` rewrites (`icon`, `background_url`,
   `action.icon`, `action.popover`), leave `homepage_url` and everything
   else untouched, and produce correct URLs for awkward base inputs: with
   and without trailing slash, with a subpath, with a port. Actually run
   emits with such base URLs and inspect the output.
5. **Verifier honesty.** `test-staging-deploy.mjs` must fail when it
   should. Prove by mutation: delete one closure file from a staged tree →
   red; corrupt one manifest field to a relative path → red. (Mutations in
   `dist-staging/` only; re-emit afterward.) Also confirm its static server
   sends no CORS/COOP/cache headers, binds ephemeral 127.0.0.1, and closes
   in `finally`.
6. **Windows correctness.** Path joins vs URL slashes: staged files land
   where the URL paths expect on win32; no backslashes leak into URLs.
7. **Report accuracy.** Spot-check the report's claims: 46-condition
   arithmetic, "28 closure files", the six-vs-three promoted-sidecar
   finding, `resolveBuilderUrl()` behavior in `owlbear/panel.js` (the
   builder-must-be-co-hosted question), and that no dev/sim server is
   left running after your own runs (verify port state at the end).
8. **Bounded miss-hunt.** In the three shipped scripts plus the two dice
   HTML pages only: any runtime-loaded asset pattern the crawler cannot
   see (dynamic imports, fetch of JSON/audio, CSS url(...) references)?
   List what you find; do not fix.

## Out of scope (DECIDED)
- Any tracked-file edit or fix; any re-design; performance opinions.
- The old `.github/workflows/deploy-pages.yml` gap and `test-cross-browser.mjs`
  follow-up (already parked/queued by the coordinator).
- The main test suites (001 ran them; your reruns are the staging ones only).

## Verification
- [ ] Every checklist item has a verdict with evidence (file:line or
      command output).
- [ ] `dist-staging/` left in a clean, freshly-emitted state; no servers
      running; `git status` shows no tracked-file changes from you.

## Report requirements (DECIDED)
Your final chat message IS the report, verbatim — the coordinator saves it
to `BETA_2.5_TASKS/reports/004-ws2-pipeline-audit-report.md`. Include:
1. Verdict per checklist item (PASS / FAIL / NUANCED + evidence).
2. Misses found (or "none") — each with severity and a one-line suggested
   follow-up task, NOT a patch.
3. Overall: is 5384bce safe to build WS2 staging on?
4. Work narrative (brief).

## On green
No commit — audit task.
