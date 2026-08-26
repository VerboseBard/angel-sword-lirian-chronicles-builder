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
- Every executor's final report is saved VERBATIM to
  `BETA_2.5_TASKS/reports/NNN-short-name-report.md` (the coordinator saves it
  if the executor cannot). Reports must include a **work narrative**: what
  was examined, what was tried, dead ends included — written so the owner
  can review the agent's actual work, not just its conclusions. (Raw
  harness transcripts are not reliably retrievable — verified empty on
  disk — so the verbatim report + narrative IS the reviewable record, and
  the owner can interrogate a still-running agent through the coordinator.)
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

1. **WS2 — staging publish pipeline**: emit an uploadable folder with
   absolute manifest URLs baked for a configurable base URL, both
   extensions, deploy-simulation check. Host choice (GitHub Pages test repo
   vs Cloudflare Pages) = owner's. Note: static hosts must not send COOP
   headers (severs window.opener; GitHub Pages sends none).
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
