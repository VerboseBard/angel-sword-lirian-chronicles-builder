# Task 002 — Read-only scout report: grounding the WS5 and WS6 briefs

**Executor:** Claude Opus 5 sub-agent, 2026-08-25
**Worktree:** `E:\Chat gpt Codex\Angels sword\Angel Sword Lirian Chronicles Beta 2.5 Online` (branch `agent/beta-2-5-online`, HEAD `c324b5b`)
**Mode:** strictly read-only. No writes, no `npm`, no builds, no servers, no test runs, no mutating git. Only `git status` / `git log` / `git diff --stat` were used.
**Concurrency note:** the task-001 writer agent appended 14 lines to `BETA_2.5_PROJECT_STATE.md` during my run (`git diff --stat`). No source file was mid-change; every citation below is against the committed working-tree content of a file the writer did not touch.

All paths are relative to the project root above.

---

## Part 1 — Findings by question

### WS5 — version-compatibility contract

---

#### Q1. Exact inventory of version fields

**The headline finding: `schemaVersion` is written in four places and read in zero.** A grep for `schemaVersion|SCHEMA_VERSION` across the entire tree (excluding `node_modules/`, the minified `*/dist/` bundles, `assets/app.bundle.js`, and `qa-test-results/`) returns *only* the definitions and the stamp sites in `owlbear/core.js`, plus prose in the two plan documents. There is no comparison, no branch, no guard anywhere.

**a) The two documented constants**

| Constant | Value | Defined | Stamped onto |
|---|---|---|---|
| `CHARACTER_SCHEMA_VERSION` | `1` | `owlbear/core.js:7` | `core.js:83` (`normalizeBuilderState`), `core.js:133` (`normalizeAschar`), `core.js:191` (`createBindingRecord`) |
| `ROLL_SCHEMA_VERSION` | `1` | `owlbear/core.js:8` | `core.js:264` (`normalizeRollEvent`) |

Every stamp is **unconditional assignment**, never a read. `normalizeRollEvent` at `core.js:263-282` constructs a fresh object literal opening with `schemaVersion: ROLL_SCHEMA_VERSION` — so an incoming `schemaVersion: 2` is not rejected, not logged, not preserved: it is **overwritten with `1`** and forwarded.

**b) A second, undocumented wire version the plan does not mention**

The bridge envelope carries `v`, defined **twice** as two independent literals:

- `src/js/vtt-relay.js:18` — `export const VTT_RELAY_VERSION = 1;`
- `owlbear/opener-bridge.js:25` — `const VTT_RELAY_VERSION = 1;`

Stamped at `vtt-relay.js:185` (`makeOpenerEnvelope`), `vtt-relay.js:309` (`publishVttEvent`), `vtt-relay.js:336` (`publishVttHandoff`), and `owlbear/opener-bridge.js:68` (`makeEnvelope`).

Read: **nowhere.** `opener-bridge.js:144-189` (`handleMessage`) validates `event.kind`, `messageEvent.source`, and `messageEvent.origin` and never touches `.v`. `vtt-relay.js:193-224` (`handleOpenerMessage`) and `vtt-relay.js:40-63` (`handleChannelMessage`) likewise.

Critically, the existing spec-drift test **does not pin these two copies against each other**. `scripts/test-owlbear-opener-bridge.mjs:97-108` pins the four `OPENER_BRIDGE_KIND` strings and two of the three `OPENER_BRIDGE_TIMING` values; `VTT_RELAY_VERSION` is absent from that list. The comment at `owlbear/core.js:11-15` explains the duplication policy ("the sheet side cannot import this file, so it repeats these literals; the opener-bridge unit test pins both copies") — the policy exists but this constant slipped through it.

**c) The only real version *check* in the codebase**

`scripts/promote-dice-skin.mjs:96-99`:
```js
const geometryVersion = String(raw?.geometry?.version || "");
if (geometryVersion && geometryVersion !== "2.0.0") {
  errors.push(`geometry contract ${geometryVersion} is not compatible with 2.0.0`);
}
```
Exact equality, not same-or-older — and skipped entirely when the pack declares no version (the `geometryVersion &&` guard). The resulting registry entries all carry `"geometryContract": "2.0.0"` (`assets/dice/promoted-dice-skins.registry.js:10,45,80`) whether or not the source pack ever declared one.

**d) A registry envelope version the browser never sees**

`assets/dice/promoted-dice-skins.json:2-3` carries `"format": "lyrian-promoted-dice-skins", "version": 1`, created at `scripts/promote-dice-skin.mjs:195-196`. But `buildRegistryScript` (`promote-dice-skin.mjs:169-173`) emits only `LYRIAN_PROMOTED_DICE_SKINS` and `LYRIAN_DICE_SKIN_PALETTES` — the `format`/`version` envelope is **dropped from the browser-visible registry**. Runtime code has no way to ask what registry format it loaded.

**e) `.aschar` format/version**

`src/js/aschar.js:16-17` — `ASCHAR_FORMAT = "angelssword-character"`, `ASCHAR_VERSION = 1`; stamped at `:132-133`. `parseAscharFile` (`:142-154`) checks `data.format` but **never `data.version`** — de-facto "accept any version, including newer". `owlbear/core.js:118-166` (`normalizeAschar`) likewise ignores it.

**f) Version-shaped things that are NOT schema versions** (the WS5 brief should say so explicitly, to stop an executor "fixing" the wrong one)

- `ROLLER_VERSION` — `assets/dice-3d/shared-dice-roller-core.js:31` (`"dice-lab-scripted-side-entry-27-rana-d4-reverted"`) and `assets/dice-3d/lyrian-accurate-dice.js:76`. These are **texture-cache keys only** (`shared-dice-roller-core.js:808`, `lyrian-accurate-dice.js:1661`). Also surfaced in `getStatus()` at `:1980` / `:2538`.
- `state.ui.gameVersion` — `src/js/state.js:26`, the Lyrian **rules** version (0.13.1 etc., see `VERSION.txt`).
- `package.json:4` `"version": "2.13.0"` — the builder release line.
- Extension manifest versions: `owlbear/manifest.json` `"0.2.0"`, `owlbear-dice/manifest.json` `"0.1.0"` — Owlbear-facing, never compared by our code.
- `scripts/check-bundle-compat.mjs` — despite the name, a Safari-regex-lookbehind guard, unrelated to schemas.
- Version-by-rename keys: `asb.owlbear.character.v1` etc. (`owlbear/panel.js:17-21`), `asb.dice.selectedSet.v1` / `asb.dice.replayEnabled.v1` (`owlbear-dice/panel.js:4-5`, `overlay.js:21-22`, `owlbear-dice/background.js:18`), and the channel name `asb-dice-overlay.v1` (`owlbear-dice/overlay.js:20`, `background.js:17`). No negotiation — a bump silently abandons old state.

**g) The builder state itself carries no version at all.** The handoff payload is `createStateSnapshot()` = `JSON.parse(JSON.stringify(state))` (`src/js/ui.js:21211-21213`, called at `ui.js:23404`). `createDefaultState()` (`src/js/state.js:15-...`) has no version key. Format discrimination is 100% duck-typing (see Q2).

---

#### Q2. Today's actual tolerance behavior on each receiving end

**Roll events**

*Panel (Companion).* Entry is `opener-bridge.js:144-189`. Gates, in order: `event.kind` must be truthy (`:146`), `messageEvent.source` must be the panel's own popup handle (`:150-152`), `messageEvent.origin` must equal the origin derived from the URL the panel itself opened (`:156`). Then `event.relaySource === "angel-sword-sheet"` routes it to `onSheetRoll` (`:181-187`). **No version inspection at any gate.** `panel.js:478-483` republishes the **raw** event on the BroadcastChannel and, only when outside a room, calls `appendRoll` → `normalizeRollEvent` (`panel.js:134`).

*The normalize contract itself* — `core.js:253-283`:
- **Missing fields:** only `total` is mandatory (`:257-260` → returns `null`). A missing `id` is *synthesized* at `:261-262` — which silently defeats the id-based dedup used at `panel.js:135`, `background.js:69`, `overlay.js:205`, `core.js:291`. Everything else defaults.
- **Unknown extra fields:** the function builds a **new object with a fixed key list**, so unknown fields are **dropped, not passed through**. "Ignore unknown fields" is already true, but *destructively*: a newer builder's new field cannot survive one hop.
- **Newer version:** no effect. `schemaVersion: 2` in → `schemaVersion: 1` out (`:264`), then rebroadcast to the whole room. A v2 event is silently **relabelled as v1**.
- **Older version:** also no effect — with one genuine exception, which is the codebase's only working back-compat mechanism: `extractRollDice` (`core.js:229-251`) prefers structured `event.dice` and falls back to regex-parsing `event.breakdown` "for events from older builds" (`:225-228`), including the count-prefixed `2d10` case. **That fallback is field-presence based, not version based** — a good pattern to name in the WS5 brief as the house style.

*Dice overlay.* `owlbear-dice/overlay.js:194-196` normalizes and null-guards; `:208-211` calls `extractRollDice` on the **raw** event and returns silently if empty — no chip, no animation, no error. `owlbear-dice/background.js:100-105` requires `event.id` and a non-empty `extractRollDice` before it will even open the popover.

*Companion background.* `owlbear/background.js:58-78` skips anything already tagged `owlbear-room` (`:59-61`), normalizes with room-derived defaults (`:62-68`), dedups (`:69`), rebroadcasts and persists (`:73-74`). **This is where a newer builder's new field dies** — before the dice extension ever sees it.

*The sheet's Combat Log — the one receiver that never normalizes.* `src/js/ui.js:23656-23667` reads `event.character`, `event.label`, `event.formula`, `event.breakdown`, `event.total`, `event.playerName` **straight off the wire**. Its upstream, `vtt-relay.js:40-63`, filters only on `relaySource === "owlbear-room"` plus id dedup. A malformed or newer room event reaches the user's log verbatim. This is the weakest link and the natural first WS5 target.

**Character handoffs**

`panel.js:246-248` calls `normalizeCharacterExport(event.character)`. `core.js:168-181` dispatches purely by duck-typing: `data.fields && data.play` → builder shape (`:172`); `data.format === "angelssword-character"` **or** `data.race && data.mainStats` → official shape (`:175-176`); otherwise **throw** (`:180`).

Consequences:
- A newer builder shape that *keeps* `fields` + `play`: **accepted and silently under-read** — `normalizeBuilderState` (`core.js:72-116`) reads a fixed field list, so new content is dropped without a word.
- A newer shape that *renames* either key: **hard reject** with the message "Use Export Character JSON or an official .aschar.json file." (`core.js:180`) → caught at `panel.js:265-268` → ack `ok:false` (`opener-bridge.js:169-177`) → sheet resolves `false` (`vtt-relay.js:290-293`) → the user sees "This sheet is not linked to a game room yet…" (`ui.js:23418`), which would be **actively misleading** under version skew: the link is fine, the payload was rejected.

**Persisted surfaces (the real long-lived skew risk)**

`createBindingRecord` stamps `schemaVersion` (`core.js:191`) into scene-item metadata (`panel.js:185`) and player metadata (`panel.js:188`). Read back at `panel.js:178`, `:206-208`, `:408-411`, and `background.js:48,51` — always by direct field access, **never by version**. Room roll logs go through `mergeRollLog` (`core.js:285-292`), which re-normalizes on write, and `renderRoomLog` (`panel.js:152-153`), which re-normalizes on read. A room's tokens and roll log can hold records written by any past build and read by any future one.

---

#### Q3. Every message type crossing the builder↔extension boundary

| # | Type / `kind` | Producer | Transport | Consumer | Version-tagged? | Version-checked? |
|---|---|---|---|---|---|---|
| 1 | `bridge-hello` | sheet — `vtt-relay.js:236` | `window.opener` postMessage | panel — `opener-bridge.js:159-165` | `v:1` (`vtt-relay.js:185`) | no |
| 2 | `bridge-ping` | panel — `opener-bridge.js:123` | postMessage to popup | sheet — `vtt-relay.js:205-209` | `v:1` (`opener-bridge.js:68`) | no |
| 3 | `bridge-pong` | sheet — `vtt-relay.js:208` | postMessage | panel — `opener-bridge.js:159-165` | `v:1` | no |
| 4 | `bridge-ack` `{inReplyTo, ok, error}` | panel — `opener-bridge.js:177` | postMessage | sheet — `vtt-relay.js:211-219` | `v:1` | no |
| 5 | `character-handoff` | sheet — `vtt-relay.js:334-342`, payload `ui.js:23403-23407` | postMessage (primary) / dev relay (fallback `vtt-relay.js:352-356`) | panel — `opener-bridge.js:168-180` → `panel.js:246` / dev poll `panel.js:286-305` | `v:1` on envelope; **payload has no version at all** | no |
| 6 | roll `dice` | sheet — `ui.js:8589` | postMessage + BroadcastChannel + dev relay (`vtt-relay.js:318-323`) | panel `panel.js:478`, background `background.js:58` | `v:1` envelope; `schemaVersion` added only on normalize | no |
| 7 | roll `action-damage` | sheet — `ui.js:8682` | same | same | same | no |
| 8 | roll `check` | sheet — `ui.js:8763` | same | same | same | no |
| 9 | roll `skill` | sheet — `ui.js:8986` | same | same | same | no |
| 10 | roll `connection-test` | panel — `panel.js:435-445` | OBR broadcast `ROLL_CHANNEL` (`panel.js:447`) | panel feed, dice ext | `schemaVersion:1` via normalize | no |
| 11 | roll `dice` ("Angel Sword Dice") | dice panel — `owlbear-dice/panel.js:142-153` | OBR broadcast (`:162`) + room metadata (`:164`) | Companion panel `panel.js:557`, dice bg `owlbear-dice/background.js:98`, overlay `overlay.js:280` | `schemaVersion:1` | no |
| 12 | room roll re-tagged `relaySource:"owlbear-room"` | panel — `opener-bridge.js:258`; background — `background.js:131` | postMessage / BroadcastChannel / dev relay (`background.js:103-117`) | sheet — `vtt-relay.js:220-223` → `handleChannelMessage` → `ui.js:23656` | `v` and `schemaVersion` carried through by spread | **no — and not normalized either** |
| 13 | `"overlay-alive"` / `"overlay-ready"` (bare strings) | overlay `overlay.js:48,281` / bg `owlbear-dice/background.js:60-74` | BroadcastChannel `asb-dice-overlay.v1` | each other | version in the **channel name** only | n/a |
| 14 | `{kind:"roll-replay", events:[…]}` | dice bg — `owlbear-dice/background.js:71` | same channel | overlay — `overlay.js:270-275` | no | no |
| 15 | room metadata `ROOM_LOG_KEY` (persisted) | `panel.js:427`, `background.js:30`, `owlbear-dice/panel.js:164` | OBR room metadata | `panel.js:556,561` | `schemaVersion:1` per entry via `mergeRollLog` | no |
| 16 | token binding `TOKEN_BINDING_KEY` (persisted on scene items) | `panel.js:185`, `:326` | OBR item metadata | `panel.js:178,206,408`, `background.js:48` | `schemaVersion:1` (`core.js:191`) | no |
| 17 | player binding `PLAYER_BINDING_KEY` (persisted) | `panel.js:188,328` | OBR player metadata | `panel.js:550`, `background.js:48,51` | `schemaVersion:1` | no |

**Seventeen message types cross the boundary. Zero are version-checked on receipt.**

---

#### Q4. Where a contract-test phase pins into `test:vtt`

`package.json:17` defines the suite:
```
"test:vtt": "node scripts/build-owlbear.mjs && node scripts/test-vtt-adapters.mjs && node scripts/test-owlbear-opener-bridge.mjs && node scripts/test-owlbear-panel.mjs"
```

Three distinct harness patterns are available, each suited to a different layer of the contract:

**(a) `scripts/test-vtt-adapters.mjs` — pure-function contract checks. The right home for the schema-tolerance phase.**
- Counter helper `check(label, condition, detail)` at `:22-29`; failure prints `FAIL:` and increments; `main()` at `:367-375` registers phases in order; exit logic at `:376-380`.
- Fake events are plain object literals passed straight into imported `core.js` functions — e.g. `:109` (`normalizeRollEvent({id:"roll-1", …})`), `:235-253` (the whole `extractRollDice` battery), `:113` (`normalizeRollEvent({label:"No total"}) === null`).
- Source-text assertions are also normal here (`:254-279` read files and regex them) — useful for pinning that a guard *exists*.
- **Placement:** a new `async function testVersionCompat()` registered in `main()` between `testOwlbearCore()` (`:369`) and `testRollDice()` (`:370`).

**(b) `scripts/test-owlbear-opener-bridge.mjs` — injectable-environment + manual clock. The right home for envelope-level skew and for the missing `VTT_RELAY_VERSION` spec-drift pin.**
- Same `check` counter (`:24-31`); manual clock factory `createClock()` (`:33-64`); harness `createHarness(overrides)` (`:69-95`) wiring `openWindow`/`subscribe`/`onVisible`/`now`/`setInterval` fakes into `createOwlbearOpenerBridge`.
- The delivery primitive is `deliver(data, source = fakePopup, origin = SHEET_ORIGIN)` at `:92-93` — exactly what a skew test needs: hand-craft `{v: 2, kind: "dice", …}` and assert routing behavior.
- The spec-drift phase at `:97-108` is the established pattern for pinning duplicated literals; `VTT_RELAY_VERSION` belongs in it.

**(c) `scripts/test-owlbear-panel.mjs` — real Playwright, real `postMessage`. The right home for an end-to-end skew proof.**
- Forks the real dev server (`:12-29`), asserts CORS (`:30-35`), drives real pages.
- Already hand-writes wire envelopes containing literal `v: 1` at `:105` and `:125` — those two literals are the natural place to add a `v: 2` variant and assert it still renders.
- The bridge phase already forces hard mode: dev relay aborted (`:82`), `BroadcastChannel` removed in both pages (`:83-85`), so a green skew result cannot be a false positive from a fallback transport.

---

#### Q5. The minimal code changes WS5 would need (identified, **not** made)

Exact functions, in dependency order:

1. **`normalizeRollEvent`** — `owlbear/core.js:253-283`. Line `:264` currently *overwrites* `schemaVersion`. Must instead read `Number(event.schemaVersion)`, treat absent as `1`, reject-or-quarantine when `> ROLL_SCHEMA_VERSION`, and preserve otherwise. The fixed key list at `:263-282` is where the unknown-field policy lives.
2. **`normalizeCharacterExport`** — `owlbear/core.js:168-181`, with **`normalizeBuilderState`** (`:72-116`) and **`normalizeAschar`** (`:118-166`). Same shape of change; both currently stamp at `:83` / `:133`.
3. **`createBindingRecord`** — `owlbear/core.js:183-202` (stamps `:191`). Its *read* sites are the ones that would need a guard: `panel.js:178`, `:206-208`, `:408-411`; `background.js:48,51`.
4. **`handleMessage`** — `owlbear/opener-bridge.js:144-189`. The panel's single entry gate; the envelope `v` check belongs immediately after the `kind` guard at `:146`.
5. **`handleOpenerMessage`** — `src/js/vtt-relay.js:193-224`, and **`handleChannelMessage`** — `src/js/vtt-relay.js:40-63`. The sheet's two entry gates.
6. **The sheet's room-roll subscriber** — `src/js/ui.js:23656-23667`. Currently reads raw fields; must go through a normalize/guard. *(Note: the sheet cannot import `owlbear/core.js` — that isolation is asserted at `test-vtt-adapters.mjs:288`, `"relay imports nothing (stays dependency-light)"`. So this needs either a duplicated-and-pinned guard or a normalizer inside `vtt-relay.js`. This is a design constraint the brief must state, or the executor will hit the wall mid-task.)*
7. **`VTT_RELAY_VERSION`** — the two literals at `src/js/vtt-relay.js:18` and `owlbear/opener-bridge.js:25` must be pinned against each other in `test-owlbear-opener-bridge.mjs:97-108`.

**Two structural cautions the brief should carry:**

- **The test can only be synthetic.** "Accept same-or-older" is only meaningful when a receiver's constant can exceed a sender's. Today every constant is `1` and both sides ship from one repo, so there is no real skew to test against. WS5's suite must *construct* v0/v2 events. That's fine — but it means WS5 delivers a harness plus a policy, not a bug fix, and the brief should say so up front so the executor doesn't hunt for a broken case.
- **"Ignore unknown fields" is already true but destructive.** Because `normalizeRollEvent` rebuilds rather than filters, an old extension cannot *relay* a new builder's field to the room — it silently deletes it at `owlbear/background.js:62`. If the owner wants forward-compat (old extension passes unknown data through untouched), that is a **passthrough-bag change**, materially larger than "ignore". See parked question 1 — I did not decide this.

---

### WS6 — new-dice-set regression gate

---

#### Q6. The promoted-set flow as it really is

**Command.** `package.json:19` — `"dice:promote": "node scripts/promote-dice-skin.mjs"`.

**Validation** — `promote-dice-skin.mjs:70-118` (`validatePack`): `schema` must equal `"lyrian-dice-skin-pack/v1"` (`:73`); id is slugified from id-or-name (`:24-30, :72`); `RESERVED_IDS` (`angels-sword`, `new-angelsword`, `leaflit`, `asari`) are blocked (`:12, :75`); every required face of every included die must be a base64 data URI matching `isEmbeddedImage` (`:66-68, :89`); unsupported die keys (`:80-81`) and unexpected face keys (`:90, :92`) are rejected; geometry version checked at `:96-99`. Required face keys per die: `DIE_FACE_KEYS` at `:14-22` (70 faces for a full set; `d4` uses `face-1..face-4`, `d100` uses `"00".."90"`).

**What promote writes** — `promotePack` at `:191-252`, writes at `:245-250`:

| # | File | Built by |
|---|---|---|
| 1 | `assets/dice-3d/promoted/<id>.js` (art sidecar) | `buildSidecarScript` `:131-134`, keys `${pack.id}:${die}:${face}` `:125` |
| 2 | `assets/dice/promoted-dice-skins.json` | `:247` |
| 3 | `assets/dice/promoted-dice-skins.registry.js` | `buildRegistryScript` `:169-173` |
| 4 | `assets/dice/dice-pack-manifest.json` | `:249`, packs assembled `:212-233` |
| 5 | `index.html` — **cache-buster bump only** | `updateRegistryCacheBuster` `:161-167` |

Entries are de-duped by id and re-sorted by name (`:201-203`). `--dry-run` short-circuits at `:243`.

**One real registry entry** — `assets/dice/promoted-dice-skins.registry.js:4-38` (the `previewUrl` at line 21 is a ~200KB inline base64 webp, elided):

```js
{
  "id": "asari-full-set-draft",
  "name": "Asari Full Set",
  "description": "Created in the private Dice Builder Workshop by Angel Sword.",
  "author": "Angel Sword",
  "generatedAt": "2026-08-10T00:32:06.434Z",
  "geometryContract": "2.0.0",
  "faceCount": 70,
  "availableDice": ["d4","d6","d8","d10","d100","d12","d20"],
  "previewUrl": "data:image/webp;base64,…",          // line 21
  "faceArtScript": "assets/dice-3d/promoted/asari-full-set-draft.js?v=20260810003206",
  "palette": { "id": "asari-full-set-draft", "shell": 16054011, /* … */ "glow": 643071 }
}
```
File shape: IIFE assigning `root.LYRIAN_PROMOTED_DICE_SKINS` (`:3`) then merging `root.LYRIAN_DICE_SKIN_PALETTES` (`:110-156`), closing `}(typeof window !== "undefined" ? window : globalThis));` at `:157`.

**How the extension picker reads it.** `owlbear-dice/panel.html:75` loads `../assets/dice/promoted-dice-skins.registry.js?v=…` *first* in the chain; `owlbear-dice/panel.js:45-63` (`populateSets`) reads `window.LYRIAN_PROMOTED_DICE_SKINS`, filters on `pack?.id` (`:47`), maps to `{id, name}` (`:48`), and prepends the hardcoded `DEFAULT_SET = {id:"new-angelsword", …}` (`:6, :49`), then rebuilds `#dice-set`'s options (`:56-62`) restoring the stored selection from `asb.dice.selectedSet.v1`. Called at `:265` (boot) and `:231` (on `asd-dice-runtime-ready`). **Confirmed: zero extension code changes are needed for a new set** — provided the extension page actually re-fetches the registry (see Q9 landmine 1).

**How a sidecar is resolved and fetched.** `owlbear-dice/panel.html:78-81` and `owlbear-dice/overlay.html:54-57`:
```js
var sidecars = (window.LYRIAN_PROMOTED_DICE_SKINS || [])
  .map(function (pack) { return pack && pack.faceArtScript; })
  .filter(Boolean)
  .map(function (src) { return "../" + src; });
```
spliced into the ordered chain (`panel.html:87`, `overlay.html:63`) and loaded strictly sequentially (`panel.html:95-97`, `overlay.html:71-73`). The `?v=` already lives *inside* `faceArtScript` (registry `:22, :57, :92`), so sidecars are individually cache-busted per promotion. The builder does the same without the `../` prefix at `src/js/runtime-loader.js:89-97`.

**How art is looked up at render time.** `assets/dice-3d/character-sheet-skin-studio.js:18-24` — `getFaceImage(setId, dieKey, faceKey)` returns `root.LYRIAN_DICE_FACE_ART[`${id}:${die}:${face}`]` with id and die lowercased. Called from `getFaceArtSpec` (`shared-dice-roller-core.js:562-578`, at `:572` and `:578`). Verified matching against real data: `assets/dice-3d/promoted/rana-full-set.js` defines exactly `rana-full-set:d100:00 … rana-full-set:d20:20`.

**Routing.** `assets/dice-3d/dice-roller-router.js:11-15` — `usesSharedCore(setId)` is true for `new-angelsword` **or any id present in `LYRIAN_PROMOTED_DICE_SKINS`**. Registry presence alone decides the engine; loaded art is not consulted.

---

#### Q7. What "every registry entry resolves a loadable sidecar" must concretely mean

**The path scheme.** `faceArtScript` is **repo-root-relative with a query string**. Consumers add their own prefix by page depth: `""` for the builder (`runtime-loader.js:97`, page at root) and `"../"` for both extension pages (`panel.html:81`, `overlay.html:57`, pages one directory down). The invariant is therefore two-part:
1. `<repoRoot>/<faceArtScript with ?v=… stripped>` must exist on disk, **and**
2. the deployed tree must keep `assets/` a sibling of `owlbear-dice/`.

**What must exist per set: exactly one file** — `assets/dice-3d/promoted/<id>.js`. Everything else is inlined in the registry (previews are base64 at registry line 21/56/91; palettes at `:110-156`).

**What "loadable" should assert**, in cost order — items 1-3 already exist in `scripts/test-dice-skin-integration.mjs` for three hardcoded sets; 4-6 are new:

1. **Exists** (strip `?v=` first). Not currently asserted for arbitrary entries.
2. **Parses and evaluates** — existing pattern, `test-dice-skin-integration.mjs:138-143` (`vm.runInNewContext` with a self-referential `globalThis` sandbox).
3. **Defines every required key, all distinct** — existing pattern `:144-150`: 70 keys total (`:145`), every `${id}:${die}:${key}` present (`:148`), and `new Set(textures).size === keys.length` (`:149`, catching duplicate artwork).
4. **NEW — registry metadata must agree with the sidecar's reality.** `registryEntry.faceCount` and `registryEntry.availableDice` should be derived assertions, not literals. Today `:135-136` hardcodes `faceCount === 70` and `availableDice === Object.keys(DIE_FACE_KEYS)`, so **a legitimate single-die promotion would fail these assertions**. It's latent only because `assertDeployedFullSet` is invoked for three named sets at `:153-155` — yet `validatePack` explicitly supports d20-only packs (`test-dice-skin-integration.mjs:94-104`) and the promotion doc advertises them (`docs/dice-skin-promotion.md:9`).
5. **NEW — registry ↔ manifest agreement.** `:120-124` and `:126-130` assert both id lists against **hardcoded arrays**. Adding a fourth set breaks the suite in two places *by design*. Replacing that hardcoding with a derived cross-check is the core of WS6.
6. **NEW — orphan detection.** `assets/dice-3d/promoted/` currently holds **six** files while the registry names **three**. Unreferenced: `asari-d20.js` (2.4 MB), `exact-reference-test.js` (1.8 MB), `my-custom-dice-set.js` (0.65 MB) — about **4.8 MB of dead weight** shipped in every deploy. `npm run dice:publish-clean` (`package.json:20` → `scripts/prune-dice-catalog.mjs`) exists for this. Fail-vs-warn is an owner call (parked question 2).

**What "loadable" cannot mean.** `geometryContract` is enforced *only* at promote time and only when declared (`promote-dice-skin.mjs:96-99`); a registry entry's `"2.0.0"` proves nothing about the pack that produced it.

**Cost note.** The three registered sidecars are 12.1 MB, 11.7 MB and 14.9 MB (~38.7 MB); `promoted-dice-skins.registry.js` is itself 642 KB of inline base64. The existing test already `vm`-evaluates all three (`:140-143`), so this cost is accepted today — but it does **not** scale to the owner's "3+ more sets". Worth an explicit note in the brief.

---

#### Q8. Where the regression test naturally lives

**Extend `scripts/test-dice-skin-integration.mjs`.** WS6 is a *generalization of lines 119-155*, not a new file: that block already reads the deployed registry (`:119`), the deployed manifest (`:125`), and `vm`-evaluates each deployed sidecar (`:138-143`). The work is replacing the hardcoded id arrays (`:122`, `:128`) and the hardcoded 70/full-set assertions (`:135-136`) with a loop over `deployedRegistry.packs`.

**Style.** This file uses `node:assert/strict` (throw on first failure, `:1`). Its neighbours `test-vtt-adapters.mjs:22-29` and `test-owlbear-opener-bridge.mjs:24-31` use the accumulating `check()` counter. Keep this file on `assert` — consistency within the file beats consistency across the repo, and the coordinator's brief should say which, or an executor will "harmonize" it.

**Where it is pinned.** `npm run test:dice-skins` (`package.json:21`). It is **not** in `test:vtt` (`package.json:17`) and **not** in `npm test` (`package.json:26` → build + `test-cross-browser.mjs`). **No CI runs it** — `.github/workflows/deploy-pages.yml:33-36` runs only `npm ci` and `npm run build`. So the gate is human-invoked; `BETA_2.5_TASKS/TASK_TEMPLATE.md:36` already lists it as a checkbox, which is the actual enforcement mechanism.

**The half that does not fit there.** "The picker picks up new sets with zero code" is a DOM claim and cannot be proven from a Node-only test. The proof-shaped harness for it is `scripts/test-owlbear-panel.mjs` — it forks the real dev server (`:12-29`) and navigates real extension pages (`:41`). A phase that loads `owlbear-dice/panel.html` and asserts `#dice-set` option count `=== 1 + registry.packs.length` would be honest, and would *also* catch the cache-buster landmine below. That phase is materially more expensive (a full dice-runtime boot, ~42 MB of scripts). See parked question 3.

---

#### Q9. Landmines the briefs must warn about

**1. Cache-buster fragmentation — the single highest-value warning for WS6.** The same registry file is requested with **three different `?v=` values from three pages**:

| Page | Line | Value | Bumped by `dice:promote`? |
|---|---|---|---|
| `index.html` | `:457` | `?v=20260811-srgb-dice-v1` | **yes** — `promote-dice-skin.mjs:250` |
| `owlbear-dice/panel.html` | `:74` | `?v=20260811-srgb-dice-v1` | **no** |
| `owlbear-dice/overlay.html` | `:50` | `?v=20260825-numeral-dots-v3` | **no** |

`updateRegistryCacheBuster` (`promote-dice-skin.mjs:161-167`) is applied only to `INDEX_HTML` (`:10`, `:250`), and its `String.replace` uses a regex **without the `g` flag** (`:163-166`). **Consequence: after a promotion, both dice-extension pages keep serving the stale registry from cache and the new set does not appear in the picker** — the exact failure WS6 exists to catch, and precisely the class of bug `BETA_2.5_PROJECT_STATE.md:25-27` records as having burned a whole debugging session. `docs/dice-system-map.md:104-110` ("How To Add A Future Dice Set") does not mention it either.

**2. Extension pages assume `assets/` is a sibling.** All `../assets/…` (`panel.html:75,83-93`; `overlay.html:51,59-69`). True on the dev server, which serves the repo root (`scripts/server.mjs:128-174`).

**3. `owlbear-dice/` is never deployed.** `.github/workflows/deploy-pages.yml:41-46` rsyncs `index.html`, `manifest.webmanifest`, `assets/`, `owlbear/`, `src/css/main.css` — **the dice extension is absent from the published site entirely**, despite `npm run build` (`:36`) having built `owlbear-dice/dist`. Any WS6 claim about "the new set reaching the room" is untestable against the current published target until WS2 addresses this. (Flagging, not deciding — see parked question 4.)

**4. Manifest absolutization is dev-only.** `scripts/server.mjs:148-159` rewrites `icon`, `background_url`, `action.icon`, `action.popover` to absolute URLs at serve time. Static hosts cannot. That is WS2's job, but a WS6 test run against static staging hits this first.

**5. CORS is dev-only; COOP is correctly absent.** `server.mjs:129` adds Owlbear CORS headers only under `/owlbear` and `/owlbear-dice`; `test-owlbear-panel.mjs:30-35` asserts it. I grepped `server.mjs` for `Cross-Origin` / COOP / COEP: **none present** — consistent with `BETA_2.5_PROJECT_STATE.md:145-146` (COOP would sever `window.opener`).

**6. One missing sidecar kills the whole dice engine, everywhere.** All three loader chains are strictly sequential and any 404 rejects the chain:
- `overlay.html:71-80` → `asd-dice-runtime-error` → `overlay.js:268` `closeOverlay` (the room overlay just vanishes)
- `panel.html:95-105` → `asd-dice-runtime-error` → `owlbear-dice/panel.js:244-247` "Engine failed"
- builder `runtime-loader.js:92-107` rejects `diceRuntimePromise`

So a broken registry entry does not degrade one set — **it takes Angel Sword dice down with it.** The WS6 brief should say this out loud; it is the whole justification for the gate.

**7. A present-but-*incomplete* sidecar fails silently instead.** Missing art keys fall through to "a procedural fallback face with the number drawn on" (`shared-dice-roller-core.js:15-16`, via `getFaceArtSpec` `:562-578`). **So a mere file-exists check would pass a set that renders as blank procedural dice.** Key completeness must be asserted.

**8. The router trusts the registry, not the art.** `dice-roller-router.js:11-15` routes any registry id to the shared core regardless of whether its art loaded.

**9. WS3's lazy loading will invalidate the boot-time answer.** Today every promoted sidecar loads eagerly on every page (`runtime-loader.js:97`, `panel.html:87`, `overlay.html:63`), so "all entries resolve" is observable at boot. Under WS3's per-set lazy loading the failure moves to **selection time** and becomes per-viewer. **Recommendation: write WS6's assertions against the registry + filesystem (static, WS3-proof), not against boot-chain behavior — which WS3 will delete.**

**10. `dice-3d-embedded.js` (2.78 MB) is still in both extension chains** (`panel.html:85`, `overlay.html:61`) even though `LYRIAN_DISABLE_LEGACY_GLB_DICE = true` is set first (`overlay.html:39`). Already WS3 item 3; noted so WS6 does not "fix" it out of scope.

**11. Registry and manifest can drift.** Promote writes both (`:247`, `:249`), but nothing re-checks them together except the hardcoded lists at `test-dice-skin-integration.mjs:120-130`. Meanwhile `docs/dice-system-map.md:106` still instructs a human to "Add or update the public pack manifest" **manually** — stale advice that would produce exactly the drift the gate must catch.

**12. Two frozen copies of `core.js` ship — the real WS5 skew surface.** `owlbear-dice/panel.js:2`, `background.js:14` and `overlay.js:17` all import `../owlbear/core.js`, and `scripts/build-owlbear.mjs:8-39` bundles it separately into each extension's own `dist`. The two extensions are installed by **separate manifest URLs** and Owlbear caches the URL, not the code (`BETA_2.5_ONLINE_CONVERSION_PLAN.md:56`) — so a room can run a Companion and a Dice extension built weeks apart, each carrying its own frozen `ROLL_SCHEMA_VERSION`. This is the concrete scenario WS5 is protecting against, and it should be named in the WS5 brief.

**13. Room metadata is the longest-lived surface of all.** `ROOM_LOG_KEY` entries and `TOKEN_BINDING_KEY` records on scene items persist in an Owlbear room indefinitely and are read by whatever extension build is installed later.

---

## Part 2 — Work narrative

**Order of reading, with dead ends included.**

1. `BETA_2.5_PROJECT_STATE.md` and `BETA_2.5_TASKS/002-…md` first, per instruction. Then `git status` / `git log --oneline -5` to establish that the tree was clean at HEAD `c324b5b` apart from the two untracked briefs — so everything I read afterwards was committed state, and I would not need `git show HEAD:<path>` fallbacks.
2. `BETA_2.5_ONLINE_CONVERSION_PLAN.md` §5 (`:50-56`) and §6 (`:58-64`) for the DECIDED direction, plus the status log for context on what the dice wave had already changed.
3. `owlbear/core.js` in full. Immediately noticed that all four `schemaVersion` sites are assignments.
4. **First broad grep** for `schemaVersion|SCHEMA_VERSION`, scoped with `--include` filters. It returned only `owlbear/core.js`. That felt too clean, so I **deliberately re-ran it unfiltered** to make sure the `--include` list hadn't hidden a `.ts`/`.mts`/`.cjs` consumer. That second grep produced 250 KB of output — it had matched the minified `owlbear-dice/dist/overlay.js` and `assets/app.bundle.js`. **Dead end, but a productive one:** scanning the bundle preview surfaced `{v:1, …}` envelope literals I had not yet seen in source, which is what put me onto `VTT_RELAY_VERSION` as a *second* version field the brief had not listed. I then grepped `VTT_RELAY_VERSION` specifically and found the duplicated literal at `opener-bridge.js:25` — and, checking `test-owlbear-opener-bridge.mjs:97-108`, that the spec-drift test does not pin it.
5. Read the transport layer end to end: `owlbear/opener-bridge.js`, `src/js/vtt-relay.js`, `owlbear/panel.js`, `owlbear/background.js`, `owlbear-dice/{background,overlay,panel}.js`. Traced each `handle*` function line by line looking for any read of `.v` or `.schemaVersion`. Found none, which is the Q1/Q2 core answer.
6. Traced the sheet's *receive* side by grepping for `subscribeVttRoomEvents` callers, landing on `src/js/ui.js:23656`. Read the surrounding block and found the un-normalized field reads — the finding I consider most actionable for WS5.
7. **Second dead end:** I opened `scripts/check-bundle-compat.mjs` expecting an existing compatibility gate to extend. It is a Safari regex-lookbehind guard, unrelated. Recorded it in Q1(f) precisely so a future executor doesn't repeat my detour.
8. Read the three `test:vtt` scripts in full to extract harness patterns for Q4, plus `scripts/test-dice-skin-integration.mjs` for Q8.
9. **Third dead end, worked around:** `cat`-ing `assets/dice/promoted-dice-skins.registry.js` dumped 642 KB (inline base64 previews), and `Read` refused `dice-pack-manifest.json` at 640 KB. Rather than run node (barred by the read-only constraint), I filtered by line length (`awk 'length($0) < 300'`) to extract structure with line numbers intact — which is how the quoted entry at `registry.js:4-38` and the manifest structure were obtained with accurate citations.
10. Followed the sidecar path from `faceArtScript` outward: `owlbear-dice/{panel,overlay}.html`, `src/js/runtime-loader.js`, `assets/dice-3d/character-sheet-skin-studio.js`, `dice-roller-router.js`, and the head + `preloadFaceArt` region of `shared-dice-roller-core.js`. Verified the key format against real data by grepping actual keys out of `rana-full-set.js`.
11. **Fourth dead end, resolved as a non-issue:** `shared-dice-roller-core.js:28` maps `100: "d00"`, while `promote-dice-skin.mjs:19` and `dice-geometry.js:23` use `d100`. I suspected a face-key mismatch. Checking `dice-geometry.js:41-48` (`dieKeyForSides` returns `"d100"`), `preloadFaceArt` (`:1849`, iterating `geo().DIE_FACE_KEYS`) and the real sidecar keys (`rana-full-set:d100:00`) confirmed `"d00"` is only a percentile-pairing *label* (`:1301-1308`), not an art key. **Not a bug** — recorded so nobody re-investigates it.
12. `ls -la assets/dice-3d/promoted/` for sizes — which surfaced the three orphan sidecars (~4.8 MB) that the registry does not reference.
13. Compared the three registry `?v=` values across `index.html:457`, `panel.html:74`, `overlay.html:50` against `updateRegistryCacheBuster` (`promote-dice-skin.mjs:161-167, :250`). This is the landmine I rate highest.
14. Read `.github/workflows/deploy-pages.yml` last, expecting only WS2 relevance — and found `owlbear-dice/` missing from the rsync list, which constrains what WS6 can honestly claim.
15. Re-ran `git status` at the end and saw the task-001 writer's `BETA_2.5_PROJECT_STATE.md` modification; `git diff --stat` confirmed +14 lines to that file alone (a work-log append), touching nothing I cite.

**Not determinable by reading — stated honestly:** I could not confirm the suite's *exact* check counts ("109 adapter checks + 48 opener-bridge checks") because both counters are computed at runtime (`test-vtt-adapters.mjs:20-29`, `test-owlbear-opener-bridge.mjs:21-31`) and running them is barred. Q4 and Q8 therefore cite structure and placement, not counts. Everything else in both question blocks is answered from source.

---

## Part 3 — Recommended brief content

### Recommended DECIDED lines for the WS5 brief

- **Scope is three files plus their tests:** `owlbear/core.js`, `owlbear/opener-bridge.js`, `src/js/vtt-relay.js` — plus the one un-normalized consumer at `src/js/ui.js:23656-23667`. No UI, no transport redesign.
- **Version fields in scope are named explicitly:** `CHARACTER_SCHEMA_VERSION` / `ROLL_SCHEMA_VERSION` (`core.js:7-8`) **and the envelope `v` / `VTT_RELAY_VERSION`** (`vtt-relay.js:18`, `opener-bridge.js:25`). Out of scope and not to be touched: `ROLLER_VERSION`, `state.ui.gameVersion`, extension `manifest.json` versions, `check-bundle-compat.mjs`, `.v1` storage-key suffixes.
- **The receive rule:** every entry gate reads the incoming version, treats absent as `1`, accepts `<=` its own constant, and drops-with-a-console-note above it. Gates: `opener-bridge.js:144-189`, `vtt-relay.js:193-224`, `vtt-relay.js:40-63`, and the four `core.js` normalizers.
- **`normalizeRollEvent` must stop overwriting `schemaVersion` at `core.js:264`** — that single line is the contract violation in miniature.
- **`VTT_RELAY_VERSION` gets pinned across its two copies** in the existing spec-drift phase at `test-owlbear-opener-bridge.mjs:97-108`, matching the policy already stated at `core.js:11-15`.
- **The contract phase goes into `scripts/test-vtt-adapters.mjs`** as a new `testVersionCompat()` registered in `main()` (`:367-375`), using the existing `check()` counter (`:22-29`) and object-literal fake events. Bridge-level skew cases go into `test-owlbear-opener-bridge.mjs` via `createHarness().deliver(…)` (`:92-93`). An optional end-to-end proof extends the `v: 1` envelopes already hand-written at `test-owlbear-panel.mjs:105,125`.
- **The suite must construct synthetic v0/v2 events** — no real skew exists today (every constant is `1`, both sides ship from one repo). WS5 delivers a harness and a policy, not a bug fix.
- **`src/js/vtt-relay.js` must not import `owlbear/core.js`** — that isolation is asserted at `test-vtt-adapters.mjs:288`. The sheet-side guard is duplicated-and-pinned, matching the existing `OPENER_BRIDGE_KIND` precedent.
- **Green gate:** `npm run test:vtt`, all phases.

### Must stay SKETCH in the WS5 brief, and why

- **Whether "ignore unknown fields" means *drop* (today's behavior) or *pass through*.** `normalizeRollEvent` rebuilds rather than filters, so an old extension silently deletes a new builder's field at `owlbear/background.js:62`. Passthrough is a materially larger change (a preserved extras bag through four normalizers and two relay hops). This is a product decision about what "compatible" means, not a technical detail — the executor must not settle it. See parked question 1.
- **What a receiver does with an over-version event: drop, or degrade-and-render?** Dropping a roll is invisible to the player; rendering a v2 roll with v1 fields is lossy but visible. Owner-shaped call.
- **Whether the persisted surfaces (room log, token bindings) get the same treatment.** They are the longest-lived skew surface (Q9 item 13) but touching them risks the live, owner-verified WS1 flow. Verify scope against the real code before committing.

### Recommended DECIDED lines for the WS6 brief

- **Extend `scripts/test-dice-skin-integration.mjs`; do not create a new script.** WS6 is a generalization of its existing lines 119-155, which already read the deployed registry, the deployed manifest, and `vm`-evaluate each sidecar.
- **Replace the hardcoded id arrays at `:122` and `:128`** with assertions derived from `deployedRegistry.packs`, so adding a fourth set does not break the suite in two places by design.
- **Replace the hardcoded `faceCount === 70` and full-`DIE_FACE_KEYS` assertions at `:135-136`** with per-entry derived checks. Single-die packs are explicitly supported (`promote-dice-skin.mjs`, `docs/dice-skin-promotion.md:9`) and would fail today's assertions.
- **"Loadable" is defined as all four of:** the file exists at `<root>/<faceArtScript minus ?v=>`; it evaluates in a `vm` sandbox (pattern `:138-143`); it defines exactly the keys `${id}:${die}:${face}` implied by the entry's own `availableDice`/`faceCount`; and those textures are pairwise distinct within each die (pattern `:144-150`). **File existence alone is explicitly insufficient** — missing art degrades silently to procedural faces (`shared-dice-roller-core.js:15-16`).
- **Add a registry ↔ manifest cross-check** — every promoted registry id appears in `dice-pack-manifest.json` with matching `faceCount` / `availableDice`, and vice versa.
- **Assertions are filesystem- and registry-based, never boot-chain-based**, so they survive WS3's lazy-loading rework (Q9 item 9).
- **The brief states the stakes:** a single unresolvable sidecar rejects the entire sequential loader chain and takes Angel Sword dice down with the broken set, in all three surfaces (`overlay.html:71-80` → `overlay.js:268`; `panel.html:95-105` → `owlbear-dice/panel.js:244-247`; `runtime-loader.js:92-107`).
- **The brief carries the cache-buster warning verbatim:** `dice:promote` bumps only `index.html:457` (`promote-dice-skin.mjs:250`); `owlbear-dice/panel.html:74` and `owlbear-dice/overlay.html:50` are untouched and will serve a stale registry after a promotion.
- **Keep `node:assert/strict`** in this file; do not convert it to the `check()` counter used by its neighbours.
- **Green gate:** `npm run test:dice-skins` and `npm run dice:core:check`.

### Must stay SKETCH in the WS6 brief, and why

- **Whether to fix the cache-buster, or only to test for it.** Teaching `updateRegistryCacheBuster` (`promote-dice-skin.mjs:161-167`) to also rewrite the two extension pages is the obvious fix, but those pages carry a *different* buster value (`?v=20260825-numeral-dots-v3` at `overlay.html:50`) that also gates the dice-core scripts — rewriting it would invalidate ~42 MB of correctly-cached art on every promotion. The right answer is probably a separate registry-only buster token, but that is a design change and must be verified against real source before it becomes DECIDED.
- **Orphan sidecars: fail, warn, or ignore?** Three unreferenced files, ~4.8 MB. `dice:publish-clean` already exists. Owner call — parked question 2.
- **Whether WS6 includes a Playwright picker phase** proving "the picker picks up new sets with zero code". It is the only honest test of that claim and would also catch the cache-buster bug, but it costs a full ~42 MB dice-runtime boot. Parked question 3.
- **How the gate scales past ~6 sets.** `vm`-evaluating every sidecar already parses ~39 MB per run. Fine for three, unproven for the owner's "3+ more". A cheaper key-extraction strategy may be needed; verify before deciding.

---

## Part 4 — Questions parked for the owner

1. **Forward-compatibility semantics (WS5, blocks the DECIDED contract).** Should an older extension *drop* fields it doesn't recognize (today's behavior, `normalizeRollEvent` rebuilds at `core.js:263-282`), or *pass them through untouched* so a newer builder's data survives the relay hop? Drop is a no-op to implement; passthrough is a real design change across four normalizers and two hops. This determines what "compatible" means in practice, so it should be settled before the WS5 brief is written.

2. **Orphan dice sidecars (WS6).** `assets/dice-3d/promoted/` ships three unreferenced files — `asari-d20.js` (2.4 MB), `exact-reference-test.js` (1.8 MB), `my-custom-dice-set.js` (0.65 MB), ~4.8 MB total — in every deploy. Should the WS6 gate **fail** on orphans, **warn**, or ignore them? And should these three be deleted now (`npm run dice:publish-clean` exists for exactly this)?

3. **Scope of the WS6 gate (WS6).** Filesystem-and-registry only (cheap, WS3-proof, but cannot prove the picker actually updates), or also a Playwright phase loading `owlbear-dice/panel.html` and asserting the option count (expensive full dice-runtime boot, but the only real proof of "zero extension code changes" — and it would catch the cache-buster bug live)?

4. **`owlbear-dice/` is absent from the deploy workflow (affects WS2, constrains WS6).** `.github/workflows/deploy-pages.yml:41-46` publishes `index.html`, `assets/`, `owlbear/` and `src/css/main.css` — the dice extension is **not** on the published site at all, though `npm run build` does build it. Deliberate (dice extension deliberately unreleased), or an oversight from before the dice extension existed? The answer changes what WS6 is allowed to claim about staging, and it is a direct input to WS2.

5. **The registry cache-buster fix (WS6, technical but owner-visible).** Fixing this properly likely means giving the registry its **own** cache-buster token, separate from the `?v=` that gates the ~42 MB of dice art — otherwise every promotion invalidates every viewer's cached art. Worth a nod before an executor implements the naive version.
