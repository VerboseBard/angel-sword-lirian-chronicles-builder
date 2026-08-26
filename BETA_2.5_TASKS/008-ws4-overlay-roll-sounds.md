# Task 008 — WS4: wire roll sounds into the warm overlay

<!-- Executor: treat DECIDED as final, SKETCH as hints to verify against
     real source. If a DECIDED item is impossible against the real code:
     STOP AND REPORT. Do not improvise. -->

## Goal (DECIDED)
After this task, the Owlbear dice overlay plays the builder's existing
roll/impact sound(s) when a roll lands — today the extension is silent;
sounds only exist in the builder's own dice tray. The per-viewer replay
toggle (already governs re-showing animations in the warm-overlay wave)
also mutes/unmutes this audio, and a persistent (survives reload) mute
setting exists. Green = sound wired with no regression to the existing
visual overlay contract (chips, camera, face orientation, dots — none of
that changes here).

## Context the executor reads first
- `BETA_2.5_PROJECT_STATE.md` (rules + current state — mandatory)
- `BETA_2.5_ONLINE_CONVERSION_PLAN.md` §4 (Overlay roll sounds)
- `src/js/ui.js` and `src/js/constants.js` — grep hits for sound-related
  code in the builder; this is almost certainly where the existing
  roll/impact sound asset(s) and their playback trigger live today
- `owlbear-dice/overlay.html` and whatever JS backs the warm persistent
  overlay (built in the "dice presentation wave" — locate the actual
  controller file; it owns the interrupt-and-stack chip logic and the
  replay toggle)
- `owlbear/core.js` (shared event schema) only if you find the roll event
  itself needs a sound-relevant field threaded through — check before
  assuming

## Design decisions (DECIDED)

| Decision | Value / rule |
|---|---|
| Sound source | Reuse the builder's existing roll/impact sound asset(s) as-is. Do not add new sounds or change sound content/timing/design. |
| Trigger | Sound plays when the overlay's roll animation lands/settles (result becomes visible), once per roll. Matches "new roll cuts the old animation": a new roll's sound plays even while the previous roll's chip is still visible/fading. |
| Mute source of truth | The existing per-viewer replay toggle also silences this audio when off. |
| Persistent mute | A mute setting for roll sound specifically, persisted across reload (localStorage or whatever mechanism this codebase already uses for per-viewer overlay prefs — reuse the existing pattern rather than inventing a new one). Defaults to unmuted. |
| No visual changes | Chips, camera behavior, face orientation, ambiguity dots — untouched. |
| Concurrency | You are the ONLY writer in this worktree during this task. A read-only dice-engine scout (task 009) and a read-only cache-buster memo (task 010) may be reading files concurrently — expected and fine. Do not touch `../Dice Builder Workshop` or the frozen `...Public Beta 2.20` sibling. Do not leave any server running when you finish. |
| Git discipline | Local commits only, never push, never `git add -A` — stage explicit paths. |
| State file | Do NOT edit `BETA_2.5_PROJECT_STATE.md` — the coordinator holds the work log this session. |

## Implementation sketch (SKETCH — verify against real source)
- Confirm the actual audio asset path(s) in `src/js/ui.js` / `constants.js`
  and how playback is triggered today (e.g. `new Audio(...).play()`, a
  shared sound-manager function, etc.).
- Find where the warm overlay's roll actually "lands" — that's the trigger
  point for playback.
- Figure out whether the sound asset(s) are already reachable from
  `owlbear-dice/`'s served files, or need to be added to its asset set.
  Tasks 001/007 (staging closure) may be informative for what "reachable"
  means in this codebase's build/serve model — worth a quick look, not a
  deep dive.
- For persistence: check whether the replay toggle (or any other
  per-viewer overlay preference) is already persisted anywhere, and mirror
  that mechanism for the new mute setting rather than adding a second one.

## Out of scope (DECIDED)
- WS3 slimming, WS5 compat contract, WS6 registry gate, staging/host work.
- Any dice-core face/orientation/placement logic, any Workshop art changes.
- Adding new sounds or changing sound content.
- Changing the replay toggle's visual behavior beyond also gating audio.
- If the sketch turns out to require touching the shared dice core /
  Workshop-synced files: STOP AND REPORT instead of proceeding — that
  changes this task's audit shape and needs a coordinator call first.

## Verification (all must be green before commit)
- [ ] `npm run build` (bump the relevant `?v=` cache-busters for any
      touched overlay/src files — see the hub's cache-buster warning)
- [ ] `npm run test:vtt`
- [ ] `npm run test:dice-skins` + `npm run dice:core:check` — only if you
      end up touching anything dice-core/Workshop-synced (expected NOT;
      see Out of scope)
- [ ] Structural check that the sound asset is present/loadable from the
      built overlay page (grep the built output or a headless load check)
      — you cannot literally listen to it, say so plainly in the report;
      audible correctness is an owner-only check

## Report requirements (DECIDED)
Write your own final report to
`BETA_2.5_TASKS/reports/008-ws4-overlay-roll-sounds-report.md`. Must
contain:
1. Outcome vs the verification checklist (each item: green/red/skipped+why).
2. **Work narrative**: what was examined, what was tried, dead ends
   included — written so the owner can review the actual work.
3. Files touched + commit hash(es).
4. Deviations from the sketch and why.
5. Questions parked for the owner (or "none").
Your final chat message back to the coordinator is a **digest only**
(≤15 lines: verdict, key numbers, worst finding, commits, parked
questions, report path) — never the full report. Do not edit
`BETA_2.5_PROJECT_STATE.md`.

## Owner live-check (keep under 5 minutes)
1. Roll twice back to back — sound plays each time and cuts cleanly like
   the visual chip does.
2. Toggle replay off — confirm silence.
3. Reload the room tab — confirm persistent mute (if set) holds.

## On green
Commit message suggestion: `008: WS4 overlay roll sounds` (local only —
never push).
