# Task 001 — Build the WS2 staging publish pipeline (emit + deploy-simulation)

<!-- Executor: treat DECIDED as final, SKETCH as hints to verify against
     real source. If a DECIDED item is impossible against the real code:
     STOP AND REPORT. Do not improvise. -->

## Goal (DECIDED)
After this task, one command emits an uploadable static folder containing
BOTH Owlbear extensions (`owlbear` panel + `owlbear-dice`) with absolute
manifest URLs baked for a configurable base URL, and a deploy-simulation
check proves that folder works when served by a dumb static file server
(no dev server, no URL rewriting, no relay). Nothing is uploaded anywhere;
the staging host choice is the owner's and is still parked. Green = the
new check passes on a fresh emit AND the existing suites stay green.

## Context the executor reads first
- `BETA_2.5_PROJECT_STATE.md` (rules + current state — mandatory)
- `BETA_2.5_ONLINE_CONVERSION_PLAN.md` §2 (Staging publish pipeline) and §1
  (what the transport needs from hosting: window.opener postMessage)
- `scripts/build-owlbear.mjs` (how the extensions are built today)
- `scripts/server.mjs` (what the dev server serves and rewrites today —
  everything it rewrites at serve time is exactly what the emit step must
  bake instead)
- `owlbear/manifest.json`, `owlbear-dice/manifest.json`
- `BETA_3_OWLBEAR_RELEASE_ROADMAP_2026-08-23.md` if present (search the
  repo docs for any prior "deploy simulation" description before inventing
  the shape)

## Design decisions (DECIDED)

| Decision | Value / rule |
|---|---|
| Base URL | Pipeline input (CLI arg and/or env var), e.g. `https://example.test/angel-sword-staging`. No host is chosen, hardcoded, or favored. |
| Both extensions | The emitted folder serves both manifests at stable paths (mirroring today's `/owlbear/manifest.json` + `/owlbear-dice/manifest.json` shape under the base URL). |
| Absolute URLs | Manifest fields that Owlbear fetches cross-origin get absolute base-URL-prefixed values — at minimum `icon`, `background_url`, `action.icon`, `action.popover` (verify the real manifests for any further URL-bearing fields and cover those too). |
| Complete artifact | The folder must contain EVERYTHING the extension pages load at runtime (html, js, css, dice core, promoted dice registry + sidecars, sounds, images). Fat is fine (~42MB dice payload ships as-is; slimming is WS3, not this task). |
| Deploy-simulation check | A script serves the emitted folder with a plain static server (no rewriting, no relay endpoints) on an ephemeral port and verifies: both manifests parse, every URL-bearing manifest field is absolute under the base URL, and every asset referenced by the manifests and extension HTML/JS entry pages resolves (HTTP 200). Wire it as an npm script. |
| No COOP dependence | The emitted artifact must not require any custom response headers to function; the sim server sends none. (Chosen host must not send COOP headers — that severs window.opener; recorded for the owner's host decision, not solvable here.) |
| Dev flow untouched | `npm start` local behavior (localhost:4176 install links, dev relay fast path) keeps working exactly as today. |
| Git discipline | Local commits only, never push, never `git add -A` — stage explicit paths. Per-task commit with a real message once green. |
| State file | Do NOT edit `BETA_2.5_PROJECT_STATE.md` — the coordinator holds the work log this session. |
| Concurrency | You are the ONLY writer in this worktree during this task. A read-only scout may be reading files concurrently; that is expected and fine. Do not touch the frozen `...Public Beta 2.20` sibling or the `../Dice Builder Workshop` repo. Do not leave any server running when you finish. |

## Implementation sketch (SKETCH — verify against real source)
- Likely shape: new `scripts/publish-staging.mjs` that reuses
  `build-owlbear.mjs` output, copies the runtime-served tree into e.g.
  `dist-staging/` (gitignored), and rewrites the two manifests with the
  base URL. Check first what `server.mjs` does at request time (manifest
  rewriting? path aliasing? `?v=` handling?) — every serve-time behavior
  needs a bake-time equivalent or an explicit note that static hosting
  doesn't need it.
- Deploy-sim: new `scripts/test-staging-deploy.mjs` + npm scripts along the
  lines of `publish:staging` and `test:staging` (naming is yours; make it
  discoverable). Use node's http with a strict static handler — serving
  only files that exist under the emitted folder, correct content-types,
  zero custom headers.
- Asset closure: crawl what the extension pages actually reference
  (script/link/img tags, registry sidecar paths, sound files, runtime-loader
  `?v=` URLs) rather than guessing a copy list. If the closure is
  impractical to compute perfectly, verify the known manifest + entry-page
  graph and document what is checked vs copied-wholesale.
- Add `dist-staging/` (or chosen name) to `.gitignore`.
- If the sheet/builder side must also be hosted for the panel's
  open-the-sheet flow, note the builder's own staging story explicitly in
  the report (likely: builder ships separately; extensions only here) —
  do not expand scope to the whole builder app without flagging it as a
  question instead.

## Out of scope (DECIDED)
- Choosing a host, uploading, or configuring GitHub/Cloudflare anything.
- WS3 slimming (lazy sidecars, re-encode, dropping dice-3d-embedded.js).
- WS4 overlay sounds, WS5 compat contract, WS6 registry gate.
- Any dice art, dice core, or Workshop changes.
- Changing dev-server/local behavior beyond what emit reuse requires.

## Verification (all must be green before commit)
- [ ] `npm run build` (only if `src/js/*` touched — then bump the relevant
      `?v=` cache-busters too; pure `scripts/*` additions don't need it)
- [ ] `npm run test:vtt`
- [ ] `npm run test:dice-skins` (run once to prove no dice regression even
      though dice files should be untouched)
- [ ] Fresh emit with a dummy base URL (e.g. `https://staging.invalid/as`)
      → new deploy-sim check green
- [ ] Emit is deterministic enough to rerun cleanly (second run doesn't
      double-nest or leave stale files)

## Report requirements (DECIDED)
Final report saved verbatim to
`BETA_2.5_TASKS/reports/001-ws2-staging-publish-pipeline-report.md`
(write it yourself; the coordinator will double-check it landed) and must
contain:
1. Outcome vs the verification checklist (each item: green/red/skipped+why).
2. **Work narrative**: what was examined, what was tried, dead ends
   included — written so the owner can review the actual work.
3. Files touched + commit hash(es).
4. Deviations from the sketch and why.
5. Questions parked for the owner (or "none").
Your final chat message = the same report text, verbatim.

## Owner live-check (keep under 5 minutes)
None required yet (nothing is uploaded until the host is chosen). Optional:
run the emit + sim server and click both manifest URLs in a browser to
eyeball the baked absolute URLs.

## On green
Commit message suggestion: `001: WS2 staging publish pipeline (emit + deploy-sim)` (local only — never push).
