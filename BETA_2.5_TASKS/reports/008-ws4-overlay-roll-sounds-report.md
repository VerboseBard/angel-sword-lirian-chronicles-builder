# Task 008 report — WS4: overlay roll sounds

Executor: Claude subagent (Sonnet 5), dispatched by the coordinator.
Branch: `agent/beta-2-5-online`. Base commit at start: `974c68b`.

## 1. Outcome vs. verification checklist

- [x] `npm run build` — GREEN. `assets/app.bundle.js` unchanged in size
      (730.7kb — no `src/js/*` edits were made); `owlbear-dice/dist/overlay.js`
      62.5kb, `owlbear-dice/dist/panel.js` 61.1kb (both grew from the new
      code); `check-bundle-compat.mjs` passed.
- [x] `npm run test:vtt` — GREEN. 109 adapter checks + 48 opener-bridge
      checks + Playwright panel phase + bridge phase, all passed, unchanged
      from before this task.
- [x] `npm run test:dice-skins` — GREEN (ran anyway as a bonus check even
      though not required — see §4, no dice-core files were touched).
- [x] `npm run dice:core:check` — GREEN, bonus check. Confirms
      `assets/dice-3d/shared-dice-roller-core.js` and
      `assets/dice-3d/dice-geometry.js` are still in sync with the Workshop
      repo (expected — neither was touched).
- [x] Structural check that the sound asset is present/loadable from the
      built overlay page — GREEN, multi-part (see §2.4 for the full method).
      **Audible correctness was not and could not be checked — that is an
      owner-only check per the brief.**

No item is red. No item needed to be skipped.

## 2. Work narrative

### 2.1 Reading the brief's context before writing anything
Read `BETA_2.5_PROJECT_STATE.md` in full (git discipline, cache-buster
convention, the "coordinator + sub-agents" operating model, the owner
decision ledger) and `BETA_2.5_ONLINE_CONVERSION_PLAN.md` §4 ("Overlay roll
sounds" — one paragraph, matches the brief's Goal verbatim). Then located and
read the builder's existing sound code end to end in `src/js/ui.js`
(`stopActiveDiceSounds`, `getDiceAudioContext`/`getDiceNoiseBuffer`/
`playDiceImpact` — a WebAudio-synth fallback — `playDiceAudioElement`,
`fadeOutDiceAudio`, `playDiceAssetRollSounds`, `playDiceRollSounds`, called
once at `ui.js:8354` at the builder's own roll-trigger site) and
`DICE_SOUND_ASSETS` in `src/js/constants.js:341` (two mp3s at
`assets/sounds/dice-roll-bed-142528.mp3` and `assets/sounds/dice-impact-95077.mp3`,
confirmed present on disk, 44544 and 15840 bytes).

### 2.2 Finding the real trigger point (verifying the SKETCH, not trusting it)
The brief's DECIDED trigger row says sound plays "when the overlay's roll
animation lands/settles (result becomes visible)". This phrase is ambiguous
on its face — it could mean "when the roll starts" (matching the builder's
own call site, which fires `playDiceRollSounds` at roll trigger and lets a
~1.8-4.3s bed+impact choreography represent the whole roll-to-landing
process) or "when the 3D animation actually stops moving."

Traced `owlbear-dice/overlay.js`'s `playRoll()` and found it calls
`window.LyrianAccurateDiceRoller.rollDice({...})` (from
`assets/dice-3d/dice-roller-router.js`, which forwards options verbatim to
either the shared or legacy engine). Reading
`assets/dice-3d/lyrian-accurate-dice.js` line 2299 (`function rollDice`)
found it already supports and calls `options.onSettle(lastSettledResults)`
at the exact moment `elapsed >= settleCompleteMs` (line 2470), guarded by a
`recordedSettle` flag so it only ever fires once per roll — i.e. a
genuine, pre-existing "the roll has landed" hook, not something I needed to
invent. Also confirmed `settleCompleteMs` is followed by a 3s hold + 3s fade
(lines 2417-2418) before the dice visually clear, so a sound choreography
starting at settle has several seconds of "hold" to occupy, not an abrupt
mismatch with the already-static dice.

This resolved the ambiguity: "lands/settles" is literal, matches this
codebase's own established vocabulary (also used for the "settle-camera"
work referenced in the project state's dice-presentation-wave section), and
the engine already exposes exactly this hook as a pass-through option. Chose
`onSettle` as the trigger.

Verified the `onSettle` hook is actually reachable for every set this
overlay can play: both `overlay.html` and `panel.html` set
`window.LYRIAN_DISABLE_LEGACY_GLB_DICE = true`; `dice-roller-router.js`'s
`select(setId)` picks the shared engine (the one with `onSettle`) whenever
`usesSharedCore(setId)` is true, which covers `"new-angelsword"` and every
entry in `LYRIAN_PROMOTED_DICE_SKINS`; and `owlbear-dice/panel.js`'s
`populateSets()` only ever offers `DEFAULT_SET` + `LYRIAN_PROMOTED_DICE_SKINS`
as picker options (confirmed the three promoted ids —
`asari-full-set-draft`, `leaflit-full-set`, `rana-full-set` — in
`assets/dice/promoted-dice-skins.json`). So the legacy engine path (not
verified to support `onSettle`) is structurally unreachable from these two
pages; did not need to touch or further audit it.

### 2.3 A real staging-closure gap found and engineered around (not fixed)
The brief flagged tasks 001/007 (WS2 staging closure) as "worth a quick
look" for what "reachable from owlbear-dice/'s served files" means here.
Read `scripts/lib/owlbear-staging-assets.mjs` in full. Its own comment at
line 303-304 states the crawl design explicitly: "One crawl pass over the
HTML seeds is sufficient: nested references discovered here (dist/*.js,
assets/*) are leaf files, not more HTML" — i.e. `extractHtmlAssetRefs` only
regex-scans `.html` file text for quoted asset paths; a bundled `dist/*.js`
file is copied as an already-known leaf once referenced from HTML, but its
own contents are never opened looking for further nested asset references.

This meant the naive implementation — hardcoding the two mp3 paths as plain
string literals inside `owlbear-dice/overlay.js` — would build and run fine
locally (server.mjs serves the whole repo tree regardless of any closure
logic) but would silently fail to be included in a future
`npm run publish:staging` closure, since nothing in an HTML file would ever
mention those paths. This is exactly the "silently vanish from staging"
failure mode task 005/007's audit trail was already worried about for WS4
(their M4 fix only widened `ASSET_EXT_RE` to accept `.mp3`/`.ogg`/`.wav`
etc. — necessary but not sufficient, since the regex only ever runs against
HTML text in the first place).

Worked around this without touching any WS2/staging file (out of scope
per the brief): declared the two sound paths as a small
`window.ASD_DICE_SOUND_ASSETS` global inside `overlay.html`'s existing
inline `<script>` block (HTML text, so the crawler's regex sees it) instead
of as a literal inside `overlay.js` (compiled into `dist/overlay.js`, which
the crawler treats as an opaque leaf). `overlay.js` reads that global at
call time with a hardcoded fallback of the same two literal paths (belt and
suspenders in case the global is ever missing, e.g. a different test
harness). Confirmed script execution order is safe: the inline classic
script runs synchronously before the `type="module"` `dist/overlay.js`
script (modules are deferred by default), so the global is always set
before `overlay.js`'s module body runs.

Manually re-derived what the crawler would see: `PATH_LIKE_RE` and
`ASSET_EXT_RE` both accept `../assets/sounds/dice-roll-bed-142528.mp3`
(hyphens/digits are fine; `.mp3` is in the extension list since task 005's
M4). Did not run `publish:staging`/`test:staging` myself (out of scope,
and no host is chosen yet per the queue) — this is a reasoned-through,
not executed, confirmation, flagged as such below.

### 2.4 Structural verification (cannot listen, so proved reachability instead)
Ran, in order, after `npm run build`:
1. `grep` confirmed both mp3 filenames appear in `owlbear-dice/overlay.html`
   (source, HTML text — crawler-visible).
2. `grep` confirmed the built, minified `owlbear-dice/dist/overlay.js`
   contains `asb.dice.soundMuted.v1`, `ASD_DICE_SOUND_ASSETS`, and
   `onSettle` — proving the new code actually shipped into the bundle
   esbuild produces (property-name/string-literal survive minification
   even though local variable/function names may not).
3. `grep` confirmed `owlbear-dice/dist/panel.js` contains
   `asb.dice.soundMuted.v1` and `sound-mute-toggle`.
4. Confirmed both mp3 files exist on disk at the path the code assumes.
5. Started the real local dev server (`node scripts/server.mjs`,
   background), then used `curl` to fetch, exactly as a browser loading the
   overlay page would: `owlbear-dice/overlay.html` (200), `.../dist/overlay.js`
   (200), `owlbear-dice/panel.html` (200), `.../dist/panel.js` (200), and —
   the actual point of this check — both mp3s at their real served relative
   path (`.../owlbear-dice/../assets/sounds/dice-roll-bed-142528.mp3` and
   `...-impact-95077.mp3`). Both returned **200, `content-type: audio/mpeg`,
   and byte sizes exactly matching the on-disk files** (44544 and 15840
   bytes). This is the strongest available proof that the audio is
   *loadable* without literally listening to it. Stopped the server
   afterward (see §5 — confirmed no server left running).

## 3. Files touched + commit hash(es)

- `owlbear-dice/overlay.html` (+13 lines) — sound-asset paths declared as an
  HTML-visible global, with a comment explaining why (see §2.3).
- `owlbear-dice/overlay.js` (+172/-1) — mute storage key + reader, sound
  asset resolver, ported sound-playback engine (`stopActiveDiceSounds`,
  `playDiceAudioElement`, `fadeOutDiceAudio`, `playRollLandingSound`), and
  three call-site changes inside `playRoll()`: cut old sound immediately
  when a new roll cuts the old animation, and trigger the new roll's sound
  from the engine's `onSettle` hook (generation-guarded against a
  superseded roll).
- `owlbear-dice/panel.html` (+1 line) — a "Mute roll sound" checkbox next to
  the existing replay toggle, same markup pattern.
- `owlbear-dice/panel.js` (+18 lines) — mute checkbox read/write wiring,
  mirroring the existing `replayToggle` code exactly (same localStorage
  try/catch shape, same default-safe fallback).
- No `src/js/*`, `owlbear/*`, `assets/dice-3d/*`, or any Workshop-synced
  file was touched. `git status --porcelain` shows exactly these four
  files changed; `npm run dice:core:check` independently confirms the
  Workshop-synced core file is still in sync.

Commit: `5d6ca6c` — "008: WS4 overlay roll sounds" (local only, branch
`agent/beta-2-5-online`, not pushed). Staged explicitly by path (no
`git add -A`); exactly the four files above, `git status --porcelain`
confirmed clean of anything else before committing. This report file is
deliberately left uncommitted, matching this project's established
pattern (e.g. task 001's code commit `5384bce` held only its own code;
briefs/reports are folded into "session records" commits by the
coordinator afterward).

## 4. Deviations from the sketch, and why

1. **Ported the sound logic instead of importing/sharing it.** The sketch
   said to find "the existing roll/impact sound asset(s) and their
   playback trigger" in `src/js/ui.js`, which reasonably reads as "reuse
   that code." `src/js/ui.js` is an ~8,000-line monolith bundled only for
   the builder (`assets/app.bundle.js`), with many builder-only
   dependencies (`clamp`, `toNumber`, `normalizeRollResults`, etc.) — it is
   not designed as an importable shared module, and the two extension
   bundles (`owlbear/`, `owlbear-dice/`) currently import nothing from
   `src/js/*`, only from the small shared `owlbear/core.js`. Re-implemented
   the same asset(s), the same choreography shape (looping bed + per-die
   staggered impacts), and the same volume/timing formulas verbatim in
   `overlay.js` instead of a cross-bundle import. This satisfies "reuse the
   sound asset(s) as-is" and "don't change sound content/timing/design" at
   the design level without dragging unrelated builder code into the
   extension bundle. Did not port the builder's WebAudio-synthesis fallback
   (used only when `Audio`/the mp3 assets are unavailable) since it is
   dead code in any real browser this overlay runs in.
2. **Sound assets declared in HTML, not in the JS file that uses them** —
   see §2.3. This is a direct, verified consequence of how the WS2 staging
   crawler actually works, not a stylistic choice.
3. **Scoped sound to the overlay only, not the panel's standalone-preview
   roll path.** `owlbear-dice/panel.js`'s `animateResults()` only runs
   locally when `!obrApi` (i.e. the panel is opened outside of Owlbear,
   pure preview mode) — the brief's goal statement is specifically about
   "the Owlbear dice overlay," so left that preview path untouched. The
   panel does still get the new persistent mute *checkbox*, since that's
   the per-viewer prefs surface the replay toggle already lives in and the
   overlay reads the same localStorage key from there.
4. **Did not check `replayEnabled()` a second time inside the new sound
   code.** `playRoll()` already returns immediately, before doing anything
   (no chip, no animation, no `onSettle` ever scheduled), when replay is
   off — so the sound trigger structurally can never fire in that case
   without any extra code. Deliberately did not add a redundant live
   re-check of `replayEnabled()` at the moment sound would play, because
   the existing visual animation is not re-checked mid-flight either (the
   toggle is read once, at roll start) — adding one for audio only would
   make audio *more* reactive to the toggle than video, an inconsistency
   the brief did not ask for. The new `soundMuted()` check *is* read at
   play time (not roll-start), since muting is audio-only and has no
   visual counterpart to stay consistent with.
5. **No `?v=` cache-buster was bumped.** Checked what cache-buster tokens
   exist in this codebase before assuming one applied: `overlay.html` and
   `panel.html` each have exactly one `?v=`-carrying token (a local `V`
   variable), and it only versions the *dice-engine* asset chain (registry,
   three.js, `dice-3d-embedded.js`, `lyrian-accurate-dice.js`, etc.) —
   none of which this task touched. `dist/overlay.js` and `dist/panel.js`
   are loaded via plain `<script type="module" src="dist/....js">` with no
   query-string versioning convention anywhere in this codebase today, so
   there was nothing existing to bump for the files actually changed. The
   sound mp3s themselves are unchanged bytes at unchanged URLs, so they
   need no cache-buster either. Confirmed locally via `server.mjs`, which
   already sends `cache-control: no-store` for `text/html`.

## 5. Concurrency and cleanup

Confirmed via `netstat` before starting that port 4176 was free. Started
`node scripts/server.mjs` in the background solely for the §2.4 fetch
check, identified its exact PID via `netstat -ano | grep 4176`, and
`taskkill`ed only that PID once the check was done. Re-ran `netstat` after:
no `LISTENING` entry remains on 4176 (a few stray `SYN_SENT`/`TIME_WAIT`
rows from an unrelated pre-existing `chrome.exe` process appear in the
list but are not a server and were not started by this task). Did not
touch `../Dice Builder Workshop` or the frozen `...Public Beta 2.20`
sibling. Did not edit `BETA_2.5_PROJECT_STATE.md`.

## 6. Questions parked for the owner

1. **Process note, not a blocker:** the WS2 staging crawler
   (`scripts/lib/owlbear-staging-assets.mjs`) only discovers asset
   references written into `.html` file text; it never opens a referenced
   `dist/*.js` bundle looking for further nested asset paths. Worked around
   this correctly for this task (§2.3/§4.2) by declaring the sound paths in
   `overlay.html` instead of `overlay.js`. This is a real, general limit of
   the current crawler design that could silently strand a *future*
   JS-only asset reference the same way it would have stranded this one —
   worth a small WS2 follow-up someday (extend the crawler to also scan
   referenced `.js` files, or document "declare new JS-triggered asset
   paths in the HTML seed" as the house convention). Not urgent, does not
   block anything in flight.
2. No DECIDED item in the brief was impossible against the real code —
   nothing else parked.
