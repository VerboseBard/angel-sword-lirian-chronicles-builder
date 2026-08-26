# Beta 2.5 Online — PROJECT STATE (read this FIRST, every session, every AI)

This is the ground-truth operations hub for the Beta 2.5 online conversion,
modeled on the owner's Stellar Verge agent system. Any AI working here —
Claude (any model), ChatGPT/Codex, or a sub-agent of either — reads this file
before doing anything, follows the rules in it, and APPENDS TO THE WORK LOG
at the bottom before finishing. That append is not optional; it is how the
next session (and the owner) knows what happened without a handoff chat.

## Identity and hard rules

- This folder is a **git worktree** of `.publish-public`, branch
  `agent/beta-2-5-online`. The sibling `...Public Beta 2.20` folder is FROZEN
  (known-working local build, tag `beta-2.2-locked`) — never edit it.
- **Nothing is pushed. Ever.** All commits are local; the owner holds
  publishing. The eventual public release name is **Beta 3**.
- Never `git add -A` (multiple AIs share these trees; stage explicit paths).
- The plan of record is `BETA_2.5_ONLINE_CONVERSION_PLAN.md` (workstreams,
  status log, owner decisions, art-QC backlog). This file is the ops hub;
  that file is the plan. Read both.
- The `../Dice Builder Workshop` repo carries OTHER uncommitted WIP — when
  syncing the dice core there, commit ONLY `dice roller/dice-roller-core.js`.
- Dev server: `npm start` (builds extensions, serves on :4176; falls forward
  if busy — the Owlbear extension install links REQUIRE localhost:4176).
- Cache-busters matter: bump `?v=` params (runtime-loader.js, overlay.html,
  index.html) and ROLLER_VERSION when their files change, or browsers serve
  stale code — this burned a whole debugging session once.

## Operating model: coordinator + sub-agents (owner directive 2026-08-25)

The main chat is a thin COORDINATOR. It writes task briefs, dispatches
sub-agents, reviews their reports, holds owner decisions, and only touches
code directly for trivial glue or live interactive loops with the owner.
Heavy reading, broad audits, and scoped builds go to sub-agents with fresh
contexts.

- Task briefs are FILES: `BETA_2.5_TASKS/NNN-short-name.md`, using
  `BETA_2.5_TASKS/TASK_TEMPLATE.md`. Briefs survive chats and are executor-
  agnostic (Claude sub-agent or ChatGPT/Codex can run one).
- **DECIDED vs SKETCH (the core rule):** sections marked DECIDED are final —
  the executor does not re-litigate, soften, or "improve" them. If a DECIDED
  item is impossible against the real code, STOP AND REPORT. Do not
  improvise. Sections marked SKETCH must be verified against real source
  before use.
- Every brief has an explicit **Out of scope** list and a **Verification**
  section naming the exact commands that must be green.
- Every executor WRITES ITS OWN final report to
  `BETA_2.5_TASKS/reports/NNN-short-name-report.md` — even read-only tasks,
  for which the report file is their ONE permitted write. Reports must
  include a **work narrative**: what was examined, what was tried, dead
  ends included — written so the owner can review the agent's actual work,
  not just its conclusions. (Raw harness transcripts are not reliably
  retrievable — verified empty on disk — so the report + narrative IS the
  reviewable record, and the owner can interrogate a still-running agent
  through the coordinator.)
- **Digest rule (owner budget directive 2026-08-25):** the executor's final
  chat message back to the coordinator is a DIGEST of at most ~15 lines
  (verdict, key numbers, worst finding, commits, parked questions, report
  path) — NEVER the full report. Big text lives on disk; main-thread tokens
  are the scarce resource no matter which model drives. Coordinator saves a
  report verbatim only in the rare case an executor truly cannot write files.
- **Model protocol (owner directive 2026-08-25, v3):** main thread /
  coordinator = Opus 5 (Sonnet 5 fallback if all-models tightens); workers
  = Sonnet 5 (mechanical) or Opus 5 (judgment) by fit, cross-audited by the
  other; **Fable = final-audit-only subagent** — a short pass on substantial
  jobs (repo-mutating / decision-shaping) that reads worker + audit reports
  from disk and returns a ≤15-line digest; skipped on small errands or when
  the Fable weekly bucket is capped (note the skip, never block). On any
  model's cap: switch models, never buy top-ups.
- Concurrency: one writer per file set at a time. Never two agents editing
  the same files or driving the same live resource (dev server instance,
  Owlbear room, Workshop tree) simultaneously. Parallel agents get disjoint
  scopes or read-only roles.
- Per-task local commits with real messages; suites green before commit.
- Owner gates stay small and explicit: anything needing the owner's eye or
  decision is parked as a clearly-marked question in the work log — never
  guessed at.

## ChatGPT / Codex: standing permissions and obligations

ChatGPT, when you pick this project up: you have the owner's standing
PERMISSION to audit anything in this project as part of your work — code,
art, tests, prior AI work including Claude's. You follow the same rules
above: read this file first, honor DECIDED items, stop-and-report on
conflicts, verify with the named suites, and APPEND YOUR WORK LOG ENTRY
below before you finish, automatically, every session. That log entry is
how Claude and the owner review your work; write it like you'd want theirs
written for you.

The owner also directs: feel free to spin up your own sub-agents under this
same brief/report/log discipline where your tooling supports it — you work
with one model rather than several, which is fine; the discipline is what
matters, not the model count. **Acknowledge this instruction explicitly in
your first work-log entry after reading this file.**

## Verification commands (the green gates)

- `npm run test:vtt` — 109 adapter checks + 48 opener-bridge checks +
  Playwright panel + bridge phase (dev relay blocked, BroadcastChannel
  removed — proves the postMessage bridge alone carries data).
- `npm run test:dice-skins` — dice promotion/core/registry integration.
- `npm run dice:core:check` — Workshop core sync gate.
- `npm run build` — required after ANY `src/js/*` edit (npm start alone
  rebuilds only the extensions' dist).
- Audit instruments (rerun after dice-affecting changes):
  `node scripts/dice-face-audit.mjs` (280-face evidence grids),
  `node scripts/dice-topdown-audit.mjs` (distortion-free orientation check),
  `node scripts/dice-numeral-placement-audit.mjs` (placement vs geometric
  anchors + design offsets), `node scripts/dice-dot-audit.mjs` (6/9 dots),
  `node scripts/dice-d4-audit.mjs` (d4 corners),
  `node scripts/dice-anchor-legend.mjs` (what the marks mean).
  Output: `qa-test-results/dice-face-audit/` (not committed).

## Where the project stands (2026-08-25, end of day)

**Workstream 1 (online transport) — DONE and owner-live-verified.** The
Companion panel opens the sheet via `window.open`; `window.opener`
postMessage carries characters and rolls both ways (works on static
hosting; dev relay is now optional local fast path). Live-verified in a
fresh room: auto-loaded character, two-tab guard, rolls with panel closed,
F5 auto-reconnect, reverse direction into the sheet's Combat Log.

**Dice presentation wave — DONE per owner decisions:**
- The face you see IS the result: settled d8/d10/d100/d12/d20 aim the rolled
  face at the viewer, numeral upright (d4 corner-read, d6 top, unchanged).
  Camera never moves (a settle-camera lift was tried and rejected as
  "bait-and-switch").
- Warm persistent overlay: new roll cuts the old animation; results persist
  as up-to-3 stacked chips (who + GM badge via Owlbear role + label + total
  + breakdown), fading by overflow and ~30s age; popover self-closes idle;
  expand-before-roll fix killed the stretch distortion.
- Structured `dice:[{sides,value}]` on the wire (2d10-showed-one-die fixed).
- 6/9 ambiguity dots: lone 6/9 on d10/d12/d20 only (owner rulings: no dot
  where no 9 exists; multi-digit self-identifies), each dot tracking its own
  numeral's measured position; Angel d10 keeps its painted originals.
- 280-face audit verdict: all mappings/orientations CORRECT in all four
  sets; misreads were camera/legibility. Placement audit v3 measures every
  numeral against the owner's corner-vector anchors + per-shape design
  offsets (d6 +0.5, d8 -2.9, d10 -2.8, d100 -2.5, d12 +0.5, d20 -5.0 %,
  negative = above centroid) — **owner blessing of these tokens still
  pending**; 117 faces flagged with exact {dx, dy, scale} corrections in
  `qa-test-results/dice-face-audit/numeral-placement.json`.
- **Rana d4: engine pixel-surgery attempted three ways and REVERTED** (it
  broke the integrated filigree; owner caught every version at full zoom).
  Standing lesson: NO procedural pixel surgery on integrated painted
  artwork — regenerate at the source. Original art renders untouched;
  Workshop re-bake of those four faces is top of the art pass.

**Commit tips:** builder repo `dd1adf4` (branch agent/beta-2-5-online),
Workshop repo `f92d7b8` (master). Both local-only.

## Task queue (coordinator seeds briefs from here)

1. **WS2 — staging publish pipeline**: ✅ BUILT 2026-08-25 (task 001,
   commit 5384bce, all suites + new deploy-sim green; Opus cross-audit =
   task 004, pending). `npm run publish:staging -- --base-url=<url>` emits
   `dist-staging/` (both extensions + crawled 45MB asset closure, absolute
   manifest URLs); `npm run test:staging` = deploy-sim proof on a dumb
   static server. Remaining for WS2: host choice (owner's) + actual upload
   + the builder-co-hosting question (panel's Open-Sheet button resolves
   the builder at `../` of wherever the panel is hosted — see owner Q8).
   **Host requirement is a PAIR (task 006 finding):** COOP absent AND
   `Access-Control-Allow-Origin` present on `/owlbear*` — Owlbear fetches
   the manifest from a browser, and the dev server has always sent CORS
   there (the deploy-sim's headerless proof is Node-side only, so it is
   blind to this). GitHub Pages gives both by default; Cloudflare Pages
   needs a `_headers` file. Verify at staging with task 007's target mode.
   **Pipeline is BUILT + AUDITED + HARDENED (001/004/005/006/007) and
   judged sound to stage on.** Owner's upload ritual, in order:
   (1) `npm run publish:staging -- --base-url=<real url>`;
   (2) `npm run test:staging -- --no-emit` on the exact bytes to upload;
   (3) upload `dist-staging/` (read `STAGING-HOST-NOTES.md` inside it);
   (4) `node scripts/test-staging-deploy.mjs --target=<real url>` to prove
   the live host — including COOP absent / ACAO present.
2. **WS4 — overlay roll sounds**: wire the builder's existing roll sounds
   into the warm overlay; replay toggle also mutes; persistent mute.
3. **WS5 — version-compat contract test**: extensions accept same-or-older
   schemaVersions, ignore unknown fields; pin in test:vtt.
4. **WS6 — new-set regression gate**: promoted registry entries resolve
   loadable sidecars; extension picker picks up new sets with zero code.
5. **Promote-time placement gate**: run the numeral-placement measurement
   inside dice:promote validation (uses the blessed offsets — blocked on
   owner blessing).
6. **WS3 remainder — dice slimming**: per-set lazy sidecar loading (~42MB →
   per-set), drop dice-3d-embedded.js from pages where the legacy path is
   disabled, optional smaller re-encode.
7. **Workshop art pass (owner-paced)**: Rana d4 four-face re-bake (top);
   baseline/size normalization for the 117 flagged faces (work order =
   numeral-placement.json + placement--*.png sheets).
8. **Carried test gaps** (staging covers): second player, real .aschar
   imports, phones/tablets, other browsers, private browsing.

## Owner-decision ledger (DECIDED — do not re-litigate)

- Nothing goes live/pushed without the owner. Release name Beta 3.
- Sheet↔room connection is Owlbear-first (panel button opens the sheet);
  paste-the-invitation stays; go-to-room = same-tab navigation (no orphan
  tabs, autosave flushed first). Direct-link-first gap: BroadcastChannel is
  dead across partitions (measured); "symmetric connect" remains a parked
  candidate only.
- Panel-open roll-relay constraint accepted (no catch-up queue) — softened
  in practice by hidden-not-destroyed popovers + auto-reconnect.
- The manual token flow (Download Token Image → add to Owlbear library →
  Place My Token) is final; never redesign it.
- Dice: viewer-facing contract; no camera moves at settle; dots per rulings
  above; no pixel surgery on integrated art; multi-digit faces get no dots.
- Overlay: interrupt-and-stack chips (max 3, fade by overflow + age); GM
  badge from Owlbear's role system.

## WORK LOG (append-only, newest first — every session, every AI)

Format per entry:
```
### YYYY-MM-DD HH:MM — <actor: Claude <model> | ChatGPT/Codex | subagent via <coordinator>>
- Did: ...
- Commits: <hashes + repo>
- Reports: BETA_2.5_TASKS/reports/... (if sub-agents ran)
- Questions parked for owner: ... (or "none")
```

### 2026-08-26 (afternoon) — Claude Sonnet 5 (coordinator session; entry updated as results land)
- Did: session opened per operating model (state file + plan + git log
  read; worktree clean at ca3b94f at session start — the ChatGPT
  handoff-verification entry below landed mid-session, discovered via a
  stale-file guard when this entry was first written; reconciled cleanly,
  see that entry, no conflict). Owner asked for a full punch-list +
  who-does-what + audit plan before any dispatch; compiled one from the
  hub, the plan, and reports 004/005 (grepped for the deferred M-items'
  exact text rather than trusting the summary). Owner approved dispatching
  the three items that need no owner decision. Authored and dispatched
  three briefs in parallel: 008 WS4 overlay roll sounds (writer, Sonnet 5),
  009 dice engine face-mismatch scout (read-only, Opus 5 — diagnosis only,
  distinct from the already-proven-correct static face-assignment audits),
  010 registry cache-buster options memo (read-only, Sonnet 5 — lays out
  fix shapes for parked question 7, implements nothing). One writer + two
  read-only roles per the concurrency rule. Coordinator running as
  Sonnet 5 this session (protocol v3's documented fallback); owner
  notified, no change requested.
- Update ~16:45: Task 010 LANDED — report saved verbatim to
  BETA_2.5_TASKS/reports/010-registry-cache-buster-options-memo-report.md,
  commit e4f2a52 verified (329 insertions, report file only). Confirmed
  the hub's own claim exactly: promote-dice-skin.mjs bumps ONLY
  index.html's registry `?v=`; panel.html/overlay.html's shared version
  token is never touched. NEW finding: prune-dice-catalog.mjs
  (`dice:publish-clean`) independently duplicates the identical gap — two
  scripts carry the bug, not one. Also found index.html's own load chain
  already has a live version-skew instance: runtime-loader.js requests
  shared-dice-roller-core.js at a newer token than its 8 sibling files.
  Three fix options laid out (same token everywhere / dedicated
  registry-only token / never-cache the registry); only the
  broadly-scoped first option also fixes the related M9 double-download
  finding, at the cost of busting the full ~42-45MB engine cache on every
  promotion. Executor's own lean: dedicated registry-only token + a
  one-time manual sync for M9.
- Commits: e4f2a52 (task 010, by its executor); 317fdaa (session records:
  briefs 008-010, coordinator).
- Reports: 010 on disk (executor wrote its own per Digest rule). 008/009
  still in flight.
- Questions parked for owner: (from task 010, refining existing question
  7) (9) fix the cache-buster gap in one script (promote-dice-skin.mjs)
  or both (it + prune-dice-catalog.mjs)?; (10) is the M9 double-download
  worth fixing now, given WS3 dice-slimming may reshape this whole area
  anyway? Tasks 008 (overlay sounds) and 009 (dice face-mismatch scout)
  still IN FLIGHT — results to follow in this same entry.

### 2026-08-26 13:39 — ChatGPT/Codex (handoff verification)
- Did: accepted the Beta 2.5 Online handoff and read `AGENTS.md`, this state
  hub, `BETA_2.5_ONLINE_CONVERSION_PLAN.md`, and the task template in full.
  Verified that `c324b5b` created the coordinator system, while the clean
  `agent/beta-2-5-online` branch now stands at `ca3b94f` after the recorded
  WS2 staging-pipeline task/audit chain. No application code, build output,
  deployment, or frozen Beta 2.20 file was changed. I explicitly acknowledge
  the owner's standing ChatGPT/Codex audit permission and the matching
  obligations: read state/plan first, honor DECIDED versus SKETCH, use scoped
  task briefs/reports for any sub-agents, stage explicit paths only, never
  push, run the required verification gates for implementation work, and log
  every session here.
- Commits: this work-log-only commit (hash recorded in the repository history;
  local only, no push).
- Reports: none (no sub-agents ran).
- Questions parked for owner: none added; the existing decision ledger remains
  authoritative.

### 2026-08-25 19:25 — Claude Fable 5 (coordinator session; entry updated as results land)
- Did: session open per operating model (state file + plan read; worktree
  clean at c324b5b; no ChatGPT activity since hub creation). Authored and
  dispatched two briefs: 001 WS2 staging publish pipeline (writer, Sonnet 5
  sub-agent — host-agnostic per plan §2, host choice stays parked) and
  002 WS5/WS6 read-only contract scout (Opus 5 sub-agent, grounds the next
  briefs). One writer + one reader per the concurrency rule. IN FLIGHT —
  results, audit, and commits will be appended to this entry.
- Update 19:45: Task 002 scout LANDED — report saved verbatim to
  BETA_2.5_TASKS/reports/002-ws5-ws6-contract-scout-report.md. Headlines:
  schemaVersion is stamped in 4 places and READ IN ZERO (normalizeRollEvent
  even overwrites incoming versions); a second undocumented wire version
  (VTT_RELAY_VERSION, two unpinned copies) exists; 17 message types cross
  the builder↔extension boundary, none version-checked; sheet Combat Log
  consumes room rolls un-normalized (ui.js:23656). WS6 side: dice:promote
  bumps the registry cache-buster ONLY in index.html — both extension pages
  keep a stale registry after a promotion (new sets won't appear in the
  picker); ~4.8MB of orphan sidecars ship unreferenced; the OLD public
  deploy workflow never deploys owlbear-dice/ at all. Cross-audit of the
  scout's claims dispatched as Task 003 (brief on disk; find-misses-not-redo).
  WS5/WS6 briefs NOT written yet — scout's parked question 1 (drop vs
  passthrough) gates the WS5 DECIDED contract.
- Update 19:55: Task 001 LANDED — WS2 staging pipeline built and committed
  `5384bce` (3 new scripts + package.json + .gitignore; nothing else).
  `publish:staging` emits dist-staging/ with both extensions, a crawled
  45MB asset closure (caught that 3 of 6 promoted/ sidecars are orphans —
  independently corroborating the 002 scout), and server.mjs-parity
  absolute manifest URLs; `test:staging` re-crawls the STAGED tree and
  proved 46 conditions green against a dummy https://staging.invalid/as
  base. All required suites green (109+48 vtt checks, dice-skins).
  Executor wrote its own verbatim report; coordinator verified the commit
  contents match it. Opus cross-audit dispatched as task 004 (deletion
  safety, closure completeness incl. dice-3d-embedded.js, verifier
  fails-when-it-should, hostile base URLs). Coordinator committed session
  records (briefs 001-003 + reports 001-002) as `4448c44`.
- Commits: 5384bce (task 001, by its executor), 4448c44 (session records,
  coordinator). Local only, as always.
- Update ~20:05: owner flagged weekly usage at 79% (resets Sat 21:00) —
  coordinator KILLED both in-flight audits (003 Sonnet mid-run, 004 Opus
  just-started) to conserve budget. Briefs 003/004 remain on disk;
  re-dispatch post-reset or on owner ask. Audits are safety-net only:
  001's code is green+committed, 002's findings feed briefs that are
  owner-gated anyway. No agents running. Session in lean mode.
- Update ~20:15: owner clarified — all-models weekly is at 43% (fine); it's
  the SEPARATE Fable-only bucket at 79%. So sub-agents (Sonnet/Opus)
  continue; the coordinator thread is what must stay lean. Adopted the
  **Digest rule** (now in the operating model + TASK_TEMPLATE): executors
  write their own report files (read-only tasks get that ONE write) and
  return ≤15-line digests — full reports never flow through the
  coordinator again. Audits 003 (Sonnet) + 004 (Opus) RELAUNCHED fresh
  under the new rule.
- Update ~20:45: BOTH audits landed (digest-only — rule works). 003: the
  002 scout report is SAFE — 11/12 claims CONFIRMED, 0 refuted, ~60-70
  citations all exact; one nuance (table row 12: relayed room-rolls do NOT
  carry `v` — normalizeRollEvent strips it; changes no recommendation).
  004 on the WS2 pipeline: artifact itself correct and complete (closure
  independently re-derived, 001's report factually clean), BUT two HIGH
  guard-rail holes: (a) `--out=` is an unvalidated recursive delete —
  `--out=.` would eat the worktree, `..\...Public Beta 2.20` reachable
  (proven on a scratchpad canary); (b) `test:staging` re-emits before
  verifying, so it can't validate an existing artifact and its closure
  check is near-tautological (deleted 2.8MB engine file + corrupted
  manifests → still 46/46 PASS; manifest-field checks do fire). Plus
  normalizeBaseUrl silently drops subpath bases, and the crawler
  allow-list has no audio/font types (would silently strand WS4's sounds).
  Coordinator rulings (fix shapes, not product calls): refuse out-of-
  worktree delete targets (no override flag); verify-in-place mode with
  staged-tree-derived closure + pinned sentinels; reject query/fragment
  base URLs, preserve subpaths; add audio/font extensions now. Unminified
  source in artifact = accepted; `?v=` token doubling the 45MB download =
  folded into owner Q7. Task 005 (staging hardening, Sonnet) DISPATCHED
  with those rulings; must prove fixes by rerunning 004's own attacks.
- Update ~21:00: owner adopted model-protocol v3 (decided in a parallel
  chat, already in cross-session memory): coordinator seat moves Fable →
  OPUS 5; Fable becomes a final-audit-only subagent on substantial jobs.
  Hub's operating model updated to match (see Model protocol above). This
  Fable session hands over after this entry; task 005 (in flight) is
  unaffected — its notification lands in the same conversation for the
  Opus coordinator to process (verify 005's commit + report, run the Fable
  final-audit pass on the 001→004→005 chain if budget allows, then the
  batched records commit for 005's brief/report). Session records through
  004 committed now so the handoff is durable.
- Update ~21:30 (coordinator now OPUS 5 — owner flipped the model selector
  mid-session; protocol v3 live): Task 005 LANDED GREEN, commit `6f767ff`
  (3 staging scripts only, +279/-13 — coordinator verified contents match
  the report). All four DECIDED fixes closed and proven BOTH directions
  with 004's own attack commands: (M1) `assertSafeOutDir` refuses hostile
  `--out` values — 7 on an isolated fixture with surviving canaries, 9 on
  the real worktree incl. `.`, `..`, the frozen 2.20 sibling, `.git`; no
  override flag; (M2) `--no-emit`/`--artifact=` verify-in-place with a
  pinned sentinel list + independent staged-registry re-read — 004's exact
  3-part mutation that silently passed 46/46 now fails with 7 specific
  problems; (M3) base URLs with query/fragment/dot-segments/credentials
  refused, legit subpaths still bake correctly (plus a mixed-case false-red
  fixed); (M4) audio/font extensions added to the crawler so WS4's roll
  sounds can't silently vanish from staging. Bonus: M6 (query-string
  literal) and M8 (`copySharedAsset` boundary — real pre-fix exfiltration
  proved, post-fix refused). Deferred by the brief's own guidance: M5→WS6,
  M7 (structural, zero live impact), M9/M10 (owner-gated). Suites:
  test:staging 46→53/53 green, test:vtt 109+48 unchanged green,
  test:dice-skins green. FABLE FINAL-AUDIT pass dispatched over the whole
  001→004→005 chain (protocol v3: substantial repo-mutating job).
- Update ~21:50: FABLE FINAL AUDIT (task 006) landed — **WS2 pipeline is
  SOUND TO STAGE ON** once a host is chosen. Reports agree; 005 did not
  quietly redefine 004 (verified against the real code at 6f767ff). M2
  verify-in-place judged genuinely sound. Three things all prior passes
  missed: (a) the guards compare paths CASE-SENSITIVELY on NTFS, so
  `--out=.GIT` slips past the `.git` check — and unlike the boundary
  checks, this one fails DANGEROUS; (b) the deploy-sim's "needs no
  headers" proof is Node-side and therefore blind to CORS — the real host
  requirement is COOP-absent AND ACAO-present (recorded on queue item 1);
  (c) nothing can run the checks against the REAL host after upload, and
  the checks are presence-only so a truncated file would pass. Ship
  caveats recorded: pre-upload ritual = run verify-in-place on the exact
  bytes being uploaded (a default run only proves the emit); owner Q8
  still gates the Open-Sheet button; 45MB downloads twice until WS3.
  Task 007 (case-safe guards + size checks + read-only verify-against-host
  mode + STAGING-HOST-NOTES.md in the artifact) DISPATCHED on Sonnet.
- Update ~23:15: Task 007 LANDED GREEN, commit `80e48c5` (3 staging
  scripts, +406/-40 — coordinator verified). Closes every 006 finding:
  win32 case-folding in `assertSafeOutDir`/`assertWithinRoot` (19/19
  mixed-case hostiles refused incl. a real `.GIT` against the real `.git`
  pointer, canaries intact, legit paths not over-blocked); explicit
  fail-safe try/catch on the guard's error path — and an errno probe
  showed the pre-fix bug was **cleanly dangerous on this Windows/Node**,
  not "saved by luck" as 006 hedged; `STAGING-INTEGRITY.json` (size +
  sha256 for 37 files) written at emit and checked on every fetch, proven
  red on truncation AND on same-size hash corruption; `--target=<url>`
  read-only GET mode proven against an independently started/stopped
  ephemeral server through green→truncated→removed→restored→simulated-COOP
  →missing-ACAO-warns; `STAGING-HOST-NOTES.md` now ships inside the
  artifact stating the COOP/ACAO requirement for whoever uploads. Suites:
  test:staging 53→99/99 (default + `--no-emit`), test:vtt unchanged green,
  test:dice-skins green.
- **Fable final-audit pass on 007: DELIBERATELY SKIPPED** (protocol v3
  skip clause). Reason: owner's Fable bucket at 81% with reset Sat 21:00,
  and 007 is the closure of Fable's OWN 006 findings, each proven in both
  directions with 006's spec as the test list; coordinator (Opus) verified
  the commit contents instead. Available on owner request.
- **New known nit (NOT fixed, low severity, typo-only risk):** `--out=`
  pointed at an existing NON-git *file* inside the worktree silently
  deletes and replaces it (guards cover the root, `.git`, and outside-tree
  targets, but not "this is a file someone cares about"). Found by 007
  outside its own scope. Tracked-file damage is git-recoverable. Queue as
  a micro-task with M7 whenever the pipeline is next touched.
- Reports: 001-007 all on disk (executors write their own per Digest rule).
- Queue: item 1 (WS2 pipeline) marked BUILT in the queue above; added
  follow-up candidate — test-cross-browser.mjs's deployment-artifact phase
  predates owlbear-dice/ and still routes through the rewriting dev server
  (001's report §5.3); small task, not urgent, not seeded yet.
- Questions parked for owner: (1) bless the placement design offsets;
  (2) WS2 staging host choice. NEW from the 002 scout (details + evidence in
  its report, Part 4): (3) compat semantics — old extension DROPS unknown
  fields (today) vs PASSES THEM THROUGH (bigger change) — gates WS5;
  (4) orphan sidecars: gate fails/warns/ignores + delete the three now?;
  (5) WS6 scope: filesystem-only gate vs + Playwright picker proof;
  (6) owlbear-dice/ absent from the old public deploy workflow — deliberate
  or oversight? (input to WS2); (7) registry cache-buster fix shape —
  separate registry-only token so promotions don't invalidate ~42MB of
  cached art. NEW from task 001: (8) builder co-hosting — the panel's
  Open-My-Character-Sheet button resolves the builder at `../` of wherever
  the panel is hosted (no config point), so the staging host must serve the
  FULL builder app at the same base URL as the extensions, or
  resolveBuilderUrl() needs a config point (small follow-up task) — which
  shape does the owner want? None of these block in-flight work.

### 2026-08-25 evening — Claude (Sonnet 5 session, coordinator setup)
- Did: created this operations hub, BETA_2.5_TASKS/ structure, TASK_TEMPLATE,
  and AGENTS.md entry point per the owner's Stellar-Verge-derived directive;
  seeded the task queue and decision ledger from the day's work. Full day
  summary above ("Where the project stands").
- Commits: (this commit) builder repo, branch agent/beta-2-5-online.
- Reports: none this entry (structure setup).
- Questions parked for owner: (1) bless or adjust the per-shape placement
  design offsets so the promote gate can be built; (2) WS2 staging host
  choice when staging begins (GitHub Pages test repo vs Cloudflare Pages).
