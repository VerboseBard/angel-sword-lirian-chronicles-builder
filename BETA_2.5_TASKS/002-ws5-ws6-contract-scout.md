# Task 002 — Read-only scout: ground the WS5 compat-contract and WS6 registry-gate briefs

<!-- Executor: treat DECIDED as final, SKETCH as hints to verify against
     real source. This task is STRICTLY READ-ONLY. -->

## Goal (DECIDED)
A findings report — no code changes — that lets the coordinator write
accurate DECIDED-grade briefs for WS5 (version-compatibility contract test)
and WS6 (new-dice-set regression gate). Every claim in the report cites the
real file and line range it came from.

## Context the executor reads first
- `BETA_2.5_PROJECT_STATE.md` (rules + current state — mandatory)
- `BETA_2.5_ONLINE_CONVERSION_PLAN.md` §5 and §6
- `owlbear/core.js` (schema versions live here per the plan)
- `src/js/vtt-relay.js`, `owlbear/opener-bridge.js`, the panel + dice
  extension entry pages
- `scripts/test-vtt-adapters.mjs`, `scripts/test-owlbear-opener-bridge.mjs`,
  `scripts/test-owlbear-panel.mjs` (how test:vtt is structured)
- `promoted-dice-skins.registry.js` (wherever it lives), `scripts/promote-dice-skin.mjs`,
  `scripts/test-dice-skin-integration.mjs`

## Hard constraint (DECIDED)
**READ-ONLY.** No file writes, no edits, no `npm` commands, no builds, no
servers, no test runs, no git commands that mutate anything (`git log`/`git show`
fine). A writer agent (task 001) owns this worktree concurrently — your only
output is your report text. Do not touch the frozen 2.20 folder or the
Workshop repo beyond reading if a path leads there.

## Questions the report must answer

### WS5 — version-compat contract
1. Exact inventory of version fields: `schemaVersion`, `ROLL_SCHEMA_VERSION`,
   `CHARACTER_SCHEMA_VERSION` — current values, where defined, where stamped
   onto outgoing events/payloads, where (if anywhere) checked on receive.
2. Today's actual tolerance behavior on the receiving ends (panel, dice
   overlay, sheet): what happens right now with a NEWER version, an OLDER
   version, an unknown extra field, a missing field? Trace the real code
   paths — don't assume.
3. Every message type crossing the builder↔extension boundary (bridge
   messages, roll events, character handoffs, room-roll events): a table of
   type → producer → consumer → versioned or not.
4. Where a contract-test phase would pin into `test:vtt` (which script, what
   harness pattern the existing phases use, how they build fake events).
5. The minimal code changes WS5 would need (accept same-or-older, ignore
   unknown fields) — list the exact functions that would change, but DO NOT
   change them.

### WS6 — new-set regression gate
6. The promoted-set flow as it really is: what `dice:promote` writes, the
   registry's shape (one real entry quoted), how the extension picker reads
   the registry at load, how a set's face-art sidecar is resolved and
   fetched.
7. What "every registry entry resolves a loadable sidecar" concretely means
   in this codebase: the path/URL scheme, what file(s) must exist per set,
   what "loadable" should assert (exists? parses? size? version field?).
8. Where that regression test naturally lives (extend
   `test-dice-skin-integration.mjs` vs new script pinned into a suite) and
   what pattern neighboring tests use.
9. Any landmine the briefs should warn about (path assumptions that differ
   between dev server and static hosting, cache-buster interactions,
   places WS3's future lazy-loading would change the answer).

## Out of scope (DECIDED)
- Any modification anywhere. Any npm/build/server/test execution.
- Re-litigating DECIDED items (the contract direction is set by the plan §5;
  you're mapping terrain, not redesigning).

## Verification
- [ ] Every factual claim carries a `file:line` citation.
- [ ] Both question blocks fully answered or explicitly marked
      "not determinable by reading" with why.

## Report requirements (DECIDED)
Your final chat message IS the report, verbatim — the coordinator saves it
to `BETA_2.5_TASKS/reports/002-ws5-ws6-contract-scout-report.md`. Include:
1. Findings, organized by the numbered questions above.
2. **Work narrative**: what was read, in what order, dead ends included.
3. Recommended DECIDED lines for the WS5 and WS6 briefs (short bullet list
   each) + anything that must stay SKETCH and why.
4. Questions parked for the owner (or "none").

## On green
No commit — read-only task.
