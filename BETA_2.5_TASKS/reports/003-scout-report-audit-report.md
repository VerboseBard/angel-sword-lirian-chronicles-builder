# Task 003 — Cross-audit of the Task 002 scout report

**Executor:** Claude Sonnet 5 sub-agent, 2026-08-25 (fresh run; a prior attempt at this
task was killed mid-run for budget reasons and produced no report)
**Worktree:** `E:\Chat gpt Codex\Angels sword\Angel Sword Lirian Chronicles Beta 2.5 Online`
(branch `agent/beta-2-5-online`, HEAD `4448c44`)
**Mode:** strictly read-only. No writes except this report, no `npm`, no builds, no
servers, no test runs, no mutating git. Used `git status` / `git log` only.
**Tree state observed:** clean at `4448c44` plus the expected coordinator drift —
`BETA_2.5_PROJECT_STATE.md` and `BETA_2.5_TASKS/TASK_TEMPLATE.md` modified,
`BETA_2.5_TASKS/004-ws2-pipeline-audit.md` untracked. None of these are files any of
the 12 claims cite, so no `git show HEAD:<path>` fallback was needed anywhere.

Subject of audit: `BETA_2.5_TASKS/reports/002-ws5-ws6-contract-scout-report.md`
(Opus 5 scout, WS5/WS6 grounding survey).

---

## 1. Verdict sheet (12 claims)

**1. `schemaVersion` written at `core.js:83,133,191,264`, read nowhere, `:264` overwrites incoming values.**
**CONFIRMED.** Read `owlbear/core.js` in full. All four line numbers are exact:
`:83` in `normalizeBuilderState`, `:133` in `normalizeAschar`, `:191` in
`createBindingRecord`, `:264` in `normalizeRollEvent` — every one an unconditional
`schemaVersion: CHARACTER_SCHEMA_VERSION` / `ROLL_SCHEMA_VERSION` assignment inside a
fresh object literal, never a comparison. `normalizeRollEvent` (`:253-283`) never reads
`event.schemaVersion` before overwriting it. Whole-repo grep for `schemaVersion`
(excluding `dist-staging/` and other build mirrors) hit only these four sites plus prose
in `BETA_2.5_ONLINE_CONVERSION_PLAN.md`, `BETA_2.5_PROJECT_STATE.md`, and the two task
002/003 files — confirming "read nowhere" independently of the scout's own grep.

**2. `VTT_RELAY_VERSION` is two independent literals, stamped, never read, not pinned by the spec-drift phase.**
**CONFIRMED.** `src/js/vtt-relay.js:18` and `owlbear/opener-bridge.js:25` are separate
`const`/`export const VTT_RELAY_VERSION = 1` declarations (no shared import — the file
header even documents why). Read both files in full: `v: VTT_RELAY_VERSION` is stamped
at `vtt-relay.js:185,309,336` and `opener-bridge.js:68`; every receive-side handler in
both files (`handleOpenerMessage`, `handleChannelMessage`, `handleMessage`) checks
`.kind`, `.relaySource`, `.source`, `.origin` but never `.v`. Read
`scripts/test-owlbear-opener-bridge.mjs` in full: `testSpecDrift()` at exactly
`:97-108` pins the 4 `OPENER_BRIDGE_KIND` strings and 2 of 3 `OPENER_BRIDGE_TIMING`
values — `VTT_RELAY_VERSION` does not appear anywhere in that file, nor anywhere else
under `scripts/` (whole-directory grep, zero hits).

**3. Sheet's room-roll consumer (`ui.js:23656-23667`) reads wire fields with no normalize/guard; `vtt-relay.js` must not import `core.js` (isolation at `test-vtt-adapters.mjs:288`).**
**CONFIRMED**, one small nuance. Read `ui.js:23630-23674`: the `subscribeVttRoomEvents`
callback spans exactly `:23656-23667` and reads `event.character`, `.label`,
`.formula`, `.breakdown`, `.total`, `.playerName` directly — it never calls
`normalizeRollEvent` or any schema-aware normalizer. Nuance: it isn't reading with
*zero* processing — `cleanText()` and `Number.isFinite(Number(...))` are applied per
field — but there is no schemaVersion check, no shape validation, no dedup at this
layer (dedup already happened upstream in `vtt-relay.js`'s `handleChannelMessage`).
"No normalize" is accurate in the sense the report clearly intends (no pass through
`core.js`'s normalizer); "no guard" is slightly strong but the substance — a malformed
or newer room event reaches the log — holds. Isolation check: read `vtt-relay.js` in
full — it has zero `import` statements, confirmed independently of the test. The exact
assertion text at `test-vtt-adapters.mjs:288` is
`check("relay imports nothing (stays dependency-light)", !/^import /m.test(source));`
— verbatim match to what the scout quoted.

**4. `normalizeRollEvent` (`core.js:253-283`): only `total` mandatory; missing `id` synthesized (defeats id-dedup); unknown fields dropped by rebuild.**
**CONFIRMED**, exact line range. `:257-260` rejects (`return null`) only when
`Number(event.total)` isn't finite — every other field defaults. `:261-262` synthesizes
a random `id` when `text(event.id, 120)` is falsy. The return statement `:263-282`
is a fixed-key object literal (16 named keys) built from scratch — any field on the
input `event` outside that list is silently absent from the output. "Defeats
id-dedup" is a correct inference: `panel.js:135`, `background.js:69` (via `remember`),
`overlay.js:205`, and `core.js:291` (`mergeRollLog`) all dedup by comparing `id` fields,
and two id-less deliveries of "the same" event would each get a different random id
and both survive dedup.

**5. `normalizeCharacterExport` (`core.js:168-181`) duck-types `fields`+`play` vs `format`/`race`+`mainStats`, throws otherwise; rejection surfaces as the misleading "not linked to a game room" message (`ui.js:23418`).**
**CONFIRMED**, exact line ranges throughout the whole chain, not just the two cited
points. `core.js:168-181` matches verbatim (builder-shape check `:172`, official-shape
check `:175-176`, throw `:180`). Traced the full failure path beyond what the claim
required, all exact: thrown error caught at `panel.js:265-268`
(`applyHandoff`'s try/catch, returns `false`) → `onHandoff` result feeds
`ok = onHandoff(event) !== false` at `opener-bridge.js:169-177` → ack posted with
`ok:false` → sheet's `sendHandoffViaOpener` resolves `Boolean(ack?.ok)` at
`vtt-relay.js:290-293` → `sent = false` in `ui.js` → confirmed `link` (the
pasted-room-link text field, `ui.js:23383`) is empty in the primary Owlbear-panel-opened
flow, since that flow never asks the user to paste a link → falls to the `else` branch
at `ui.js:23418`, text matches verbatim: *"This sheet is not linked to a game room
yet…"*.

**6. Message-type table rows 12-14: room rolls re-tagged `owlbear-room` reach the sheet un-normalized; overlay BroadcastChannel messages are as described.**
**NUANCED** — the consumption claim is correct; one cell of row 12's description is not.
Confirmed exactly: `opener-bridge.js:258` (`return post({ ...event, relaySource:
"owlbear-room" });`), `background.js:131` (`localChannel?.postMessage({ ...event,
relaySource: "owlbear-room" });`), `vtt-relay.js:220-223`
(`if (event.relaySource === "owlbear-room") { … handleChannelMessage({ data: event }); }`)
all match verbatim, and I independently confirmed the sheet-side consumer
(`ui.js:23656`) does not normalize these. Rows 13-14 confirmed exact:
`overlay.js:48` and `:281` are the bare `"overlay-alive"` / `"overlay-ready"` string
posts; `owlbear-dice/background.js:60-74` is exactly the listener bounds;
`owlbear-dice/background.js:71` is exactly `{ kind: "roll-replay", events: … }`;
`overlay.js:270-275` is exactly the consumer.
**The nuance:** row 12's "Version-tagged?" cell says *"`v` and `schemaVersion` carried
through by spread."* I traced every producer that can reach this hop — grepped all
`sendMessage(ROLL_CHANNEL, …)` call sites project-wide and found exactly three:
`background.js:73`, `panel.js:447`, `owlbear-dice/panel.js:162` — and all three
broadcast the *output* of `normalizeRollEvent(...)`, never the raw event. Since
`normalizeRollEvent`'s fixed-key return object (the same one claim 4 describes) has no
`v` key at all, nothing reaching `panel.js:557`'s `OBR.broadcast.onMessage(ROLL_CHANNEL,
…)` — and therefore nothing reaching `sendRoomRollToSheet`'s spread at
`opener-bridge.js:258`, or `background.js:131`'s equivalent — can carry a `v` field
forward. Only `schemaVersion` is present, and it isn't really "carried through" either;
it was freshly overwritten by whichever `normalizeRollEvent` call ran upstream (the
same overwrite behavior claim 1 already documents). This is a narrow, low-stakes
inaccuracy in one table cell — it does not affect any of the WS5 recommendations in
Part 3 of the scout report, none of which assume `v` is present on relayed room rolls.

**7. `dice:promote` writes five outputs; `updateRegistryCacheBuster` touches only `index.html`; the three registry `?v=` values across the three pages differ/are-stale.**
**CONFIRMED**, exact line-for-line. Read `scripts/promote-dice-skin.mjs` in full
(272 lines). The five writes are at exactly `:246-250` in that order (sidecar, registry
JSON, registry JS, manifest, index.html); `buildSidecarScript` is exactly `:131-134`;
`buildRegistryScript` is exactly `:169-173`; manifest assembly is exactly `:212-233`;
`updateRegistryCacheBuster` is exactly `:161-167` and its regex has no `g` flag as
claimed; it is applied to `INDEX_HTML` only (`:250`) — the script contains no reference
to `panel.html` or `overlay.html` anywhere. De-dup/sort at `:201-203` and dry-run
short-circuit at `:243` both exact. Confirmed the three cited values directly:
`index.html:457` → `?v=20260811-srgb-dice-v1`; `owlbear-dice/panel.html:74`
(`var V = "?v=20260811-srgb-dice-v1";`, consumed one line later at `:75`) → same value
as index.html; `owlbear-dice/overlay.html:50` (`var V = "?v=20260825-numeral-dots-v3";`)
→ a newer, different value. All three line numbers and values exact.

**8. `test-dice-skin-integration.mjs` hardcodes id arrays (`:122,:128`) and full-set assertions (`:135-136`); uses `node:assert/strict`.**
**CONFIRMED**, exact. Read the file in full (200 lines). Line 1 is
`import assert from "node:assert/strict";`. The three-id array
`["asari-full-set-draft", "leaflit-full-set", "rana-full-set"]` is exactly at `:122`
inside an `assert.deepEqual` at `:120-124`; the four-id manifest array is exactly at
`:128` inside `:126-130`. `:135-136` are exactly
`assert.equal(registryEntry.faceCount, 70)` and
`assert.deepEqual(registryEntry.availableDice, Object.keys(DIE_FACE_KEYS))`. Confirmed
the "would fail" reasoning holds: a fourth promoted set of any shape breaks the
hardcoded id arrays (actual length would no longer match); a d20-only pack would
additionally fail `:135-136` if it were ever run through `assertDeployedFullSet`. The
same file's own `d20Only` fixture (`:94-104`) proves single-die packs are a
legitimately supported `validatePack` shape, and `docs/dice-skin-promotion.md:9`
("A D20-only pack therefore contains 20/20 D20 faces...") independently confirms the
doc "advertises" this — exact line match.

**9. The three orphan sidecars (`asari-d20.js`, `exact-reference-test.js`, `my-custom-dice-set.js`, ~4.8 MB) are truly unreferenced by the registry.**
**CONFIRMED.** Directory listing of `assets/dice-3d/promoted/` shows 6 files;
`promoted-dice-skins.json`'s three `packs` entries (per claim 8's own hardcoded-array
evidence) are `asari-full-set-draft`, `leaflit-full-set`, `rana-full-set` — leaving
`asari-d20.js` (2,439,528 B), `exact-reference-test.js` (1,765,683 B), and
`my-custom-dice-set.js` (650,392 B) unaccounted for. Grepped
`promoted-dice-skins.registry.js`, `promoted-dice-skins.json`, and
`dice-pack-manifest.json` for all three filenames: zero matches in any of the three.
Sizes match the report's figures exactly under decimal-MB rounding (2.44, 1.77, 0.65 →
"2.4 MB", "1.8 MB", "0.65 MB"; sum 4,855,603 B ≈ 4.8 MB).

**10. `.github/workflows/deploy-pages.yml` rsync list omits `owlbear-dice/`.**
**CONFIRMED.** Read the file in full (59 lines). The "Prepare static site" step
(`:38-46`) rsyncs `index.html`, `manifest.webmanifest`, `assets/`, `owlbear/`, and
`src/css/main.css` — `owlbear-dice/` appears nowhere in the file. (Minor: the report's
range `:41-46` brackets the block correctly but line 41 is the `mkdir` and line 46 is
`touch .nojekyll`, not rsync lines themselves — not worth listing as a correction since
the block and the omission it documents are both exactly right.) Also independently
confirmed the report's separate citation `:33-36` = the "Build static runtimes" step
(`npm ci` / `npm run build`), exact.

**11. A missing sidecar rejects the whole sequential loader chain in all three surfaces; an incomplete sidecar silently falls back to procedural faces.**
**CONFIRMED**, exact citations. `overlay.html:71-80` and `panel.html:95-105` both
bound the `list.reduce(...).then(...).catch(...)` chains that dispatch
`asd-dice-runtime-error` on any load failure — confirmed line-for-line.
`owlbear-dice/panel.js:244-247` is exactly the `asd-dice-runtime-error` listener
setting `statusChip.textContent = "Engine failed"`. `overlay.js:268` is exactly
`window.addEventListener("asd-dice-runtime-error", closeOverlay);`. Builder side:
`runtime-loader.js:92-107` is exactly `ensureDiceRuntimeLoaded`'s
`loadScriptsInOrder([...]).catch(...)`, and `loadScriptsInOrder` (`:34-38`) awaits
each script serially, so one rejection stops the chain. For the fallback claim: read
`shared-dice-roller-core.js:1-30` — lines 15-16 are the header comment verbatim:
*"Texture sources, in order: imported skin pack art (via DiceSkinStudio), otherwise a
procedural fallback face with the number drawn on."* `getFaceArtSpec` spans `:562-580`
(the cited `:562-578` stops two lines short of the closing brace but both pinpointed
calls, `:572` and `:578`, are exact matches for the two
`window.DiceSkinStudio?.getFaceImage?.(...) || ""` sites that go silently empty on a
missing key).

**12. WS5 harness anchor points exist as described: `check()`/`main()` in `test-vtt-adapters.mjs`; `createHarness().deliver(...)` in `test-owlbear-opener-bridge.mjs`; hand-written `v: 1` envelopes in `test-owlbear-panel.mjs:105,125`.**
**CONFIRMED**, exact down to the single-line placement suggestion. `test-vtt-adapters.mjs`
`main()` (`:367-...`) calls `testOwlbearCore()` at exactly `:369` and `testRollDice()`
at exactly `:370` — the scout's suggested insertion point for a new
`testVersionCompat()` phase is precisely between those two real lines.
`createHarness` in `test-owlbear-opener-bridge.mjs` spans exactly `:69-95` with
`deliver` defined at exactly `:92-93`. In `test-owlbear-panel.mjs` (read in full,
167 lines): line 105 is exactly `v: 1,` inside the character-handoff postMessage
payload (`:103-117`); line 125 is exactly `v: 1,` inside the `rollEvent` literal
(`:124-135`). Also independently confirmed the surrounding claims: dev server fork
`:12-28` (report says `:12-29`, off by one at the tail — the block's last content line
is 28, line 29 is blank), CORS assertion exactly `:30-35`, dev-relay abort exactly
`:82`, `BroadcastChannel` removal exactly `:83-85` — and confirmed it is applied to a
browser *context* (`bridgeContext.addInitScript`), so "in both pages" is accurate
since both `panelPage` and the `sheetPopup` it opens inherit that context.

---

## 2. Citation corrections

**None.** Every pinpoint line citation I checked (dozens, across all 12 claims) landed
on exactly the code described. Two multi-line block citations were loose by one line at
a boundary (`deploy-pages.yml:41-46` includes the surrounding `mkdir`/`touch` lines;
`test-owlbear-panel.mjs:12-29` includes one trailing blank line) — both still correctly
bound the block being described and point a reader to the right place, so I'm not
listing them as corrections, just noting them for completeness.

## 3. Misses found in the bounded hunt

Scope: in the files cited for claims 1-6 (`owlbear/core.js`, `owlbear/opener-bridge.js`,
`src/js/vtt-relay.js`, `owlbear/panel.js`, `owlbear/background.js`,
`owlbear-dice/background.js`, `owlbear-dice/overlay.js`, `owlbear-dice/panel.js`,
`scripts/test-owlbear-opener-bridge.mjs`, `scripts/test-vtt-adapters.mjs`, `src/js/ui.js`),
is there any other receive-side gate or version read the scout didn't mention?

**No other gate or version read found.** I read every one of those files in full (or,
for `ui.js`, the specific handoff/roll-consumer regions plus a full-file grep) and ran
project-wide greps for `schemaVersion`, `VTT_RELAY_VERSION`, and generic
version-comparison patterns (`> ROLL_SCHEMA_VERSION`, `event.v ===`, etc.). Beyond the
four `core.js` stamp sites and the report's own text, the only other hits were an
unrelated `sheet[address].v` in `src/js/io.js` (a spreadsheet-cell-object property from
a totally different subsystem, not a version field) and the build mirror
`dist-staging/owlbear/core.js` (an artifact of task 001's staging pipeline, byte-identical
to the source). Also traced every producer onto `ROLL_CHANNEL`
(`background.js:73`, `panel.js:447`, `owlbear-dice/panel.js:162` — exhaustive, grepped)
to confirm none of them bypasses `normalizeRollEvent`. That tracing is what surfaced
the one real finding of this audit — reported under claim 6 above, not here, since it's
a description-accuracy issue on an already-cited row rather than an unmentioned gate.

**Net effect on WS5 recommendations: none.** The claim-6 nuance doesn't change any of
the scout's Part 3 recommended DECIDED lines — they're built on the `schemaVersion`
overwrite behavior and the un-normalized sheet consumer, both independently confirmed
solid.

## 4. Overall verdict

**Yes — safe to base DECIDED brief lines on.** Of 12 claims: 11 CONFIRMED outright, 1
(claim 6) CONFIRMED on substance with one narrow, low-stakes description error in a
single table cell that doesn't touch any recommendation. Zero REFUTED. Zero citation
corrections needed. The bounded miss-hunt found no additional gate, guard, or version
read anywhere in the cited files. This is an unusually well-sourced scout report —
every file:line pointer I checked (on the order of 60-70 distinct citations across the
12 claims) resolved to exactly the code described, including several multi-hop causal
chains (e.g., claim 5's handoff-rejection-to-misleading-message path across four files)
that held up exactly as narrated when traced independently. The coordinator can treat
Part 3's "Recommended DECIDED lines" and "Must stay SKETCH" sections as grounded.

## 5. Work narrative

Read `BETA_2.5_PROJECT_STATE.md` and the task 003 brief first, per protocol, then the
full 393-line scout report under audit. Worked the 12 claims in the brief's given order,
reading each cited source file in full (not just the cited line ranges) so that
line-shifted or context-dependent claims would surface if wrong:

1. `owlbear/core.js` (293 lines, full) → claims 1, 4, 5 core logic.
2. `src/js/vtt-relay.js` (379 lines, full) and `owlbear/opener-bridge.js` (307 lines,
   full) → claim 2, plus the isolation half of claim 3.
3. `scripts/test-owlbear-opener-bridge.mjs` (311 lines, full) → claim 2's spec-drift
   phase and claim 12's harness anchor.
4. `src/js/ui.js` at `:23360-23440` and `:23630-23674` → claims 3 and 5's surfaced
   message text; grepped the four `publishVttEvent` call sites project-wide and got
   exact hits at `:8589,8682,8763,8986`, matching message-table rows 6-9 exactly.
5. `scripts/test-vtt-adapters.mjs` at `:1-40` and `:270-310`, plus `:360-380` →
   claim 3's isolation assertion (verbatim match) and claim 12's `main()` placement.
6. `owlbear/background.js` (full) and `owlbear-dice/background.js` (full) → claim 6
   rows 12-14 producer side.
7. `owlbear-dice/overlay.js` (full, read in two passes covering all 285 lines) → claim
   6 rows 13-14 consumer side, and claim 11's overlay-side fallback wiring.
8. `owlbear/panel.js` in five passes (`:1-60`, `:149-215`, `:395-460`, `:460-575`) →
   confirmed the `appendRoll` dedup (`:135`), `renderRoomLog` (`:152-154`), binding
   read/write sites (`:178, 185, 188, 206-208, 408-411`), `sendTestRoll`
   (`:435-445`), and the `sheetBridge` wiring (`:470-484`) that claim 6's row-12
   tracing depended on.
9. `scripts/promote-dice-skin.mjs` (272 lines, full) → claim 7 in its entirety; every
   cited line number checked against the real file simultaneously.
10. Grepped `index.html`, `owlbear-dice/panel.html`, `owlbear-dice/overlay.html` for
    the registry reference, then read the surrounding 20-40 lines of the two extension
    HTML files to find where their `?v=` literals are actually declared (one line above
    where the naive grep hit landed) — confirmed the scout's citations were pointing at
    the *declaration* site, not the *usage* site, and were exactly right.
11. `scripts/test-dice-skin-integration.mjs` (200 lines, full) and
    `docs/dice-skin-promotion.md:1-20` → claim 8.
12. `ls -la assets/dice-3d/promoted/` and three targeted greps against the registry/
    manifest files → claim 9.
13. `.github/workflows/deploy-pages.yml` (59 lines, full) → claim 10.
14. `owlbear-dice/panel.html:85-110`, `owlbear-dice/overlay.html:60-85`,
    `owlbear-dice/panel.js:225-255`, `src/js/runtime-loader.js` (full),
    `shared-dice-roller-core.js:1-35` and `:555-585` → claim 11.
15. `scripts/test-owlbear-panel.mjs` (167 lines, full) → claim 12's remaining anchors.
16. **The one real find of this audit:** while re-tracing claim 6's row 12 for the
    bounded miss-hunt, grepped every `sendMessage(ROLL_CHANNEL, …)` call site
    project-wide (three total, all in files already open for other claims) and noticed
    all three broadcast a `normalizeRollEvent(...)` *output*, which has no `v` key by
    construction (same fixed-key object claim 4 already describes). That means row
    12's "`v` … carried through by spread" cannot be literally true for this hop — an
    inaccuracy the original scout's per-claim citation checking wouldn't have caught,
    since each cited line is individually correct; only cross-referencing the *shape*
    of the object flowing between them surfaces it. Rechecked `owlbear-dice/panel.js:162`
    to make sure it wasn't a fourth, different-shaped producer — it isn't; same
    `normalizeRollEvent` pattern. Recorded under claim 6 rather than as a "miss" since
    it corrects an existing row rather than surfacing an unmentioned one.
17. Final project-wide greps (`schemaVersion`, `VTT_RELAY_VERSION`, version-comparison
    operator patterns) across the whole tree to close out the bounded miss-hunt with
    an exhaustive negative result rather than a sampled one.

No dead ends worth recording separately — the scout's citations were accurate often
enough that verification mostly meant "read the file, find the line, confirm it says
what's claimed," which is a faster process than the scout's own from-scratch survey.
