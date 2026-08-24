# Angel Sword Public Beta 2.20 — AI Handoff and Work Ledger

Last updated: 2026-08-23

## Purpose

This is the authoritative continuation file for Beta 2.20 development. Any AI or developer
working in this repository must read this file before changing code and update it whenever
work is started, completed, tested, deferred, or found to need an owner ruling.

The current release authority is `BETA_3_OWLBEAR_RELEASE_ROADMAP_2026-08-23.md`.
Owlbear Rodeo is the first and release-defining VTT adapter. Roll20 and Foundry documents are
retained as historical/parked adapter records and must not redirect active work away from
Owlbear.

## 2026-08-23 owner priority and naming decision

- Finish and physically prove the Owlbear Companion before Roll20 or Foundry work.
- After Owlbear is reliable, harden the four dice sets, roll sound, release-blocking rules,
  and the current interface.
- Then create official Clio characters, import their `.aschar.json` exports here, compare every
  meaningful field, fix the differences, and preserve them as regression fixtures. Repeat the
  proof in the opposite direction.
- When those gates pass, this builder advances directly to **Angel Sword Character Builder
  Beta 3**. Do not use Beta 2.5 as an intermediate public identity.
- The project formerly called Public Beta 3.0 is now the separate, parked **Game Interface —
  Angel Sword Character Sheet Alpha 1** experiment. Its redesign scope does not belong in this
  builder release.
- Keep the visible/package version at its inherited value until the release gates pass and the
  owner explicitly approves publication.

## Write boundary

- The only implementation target is `Angel Sword Lirian Chronicles Public Beta 2.20`.
- Do not make implementation changes in Beta 2.12, Beta 2.13, `.publish-public`, an archive,
  or any other sibling folder while doing Beta 2.20 work.
- The live GitHub Pages release remains Beta 2.13 until Beta 2.20 is explicitly approved,
  committed, and published.
- Do not restore the obsolete browser-side rules update checker. Rules are refreshed by the
  developer data-pull/build/publish workflow.

## Repository baseline

- Branch: `agent/beta-2-20-development`
- Starting commit: `0c8b2da` (`Document Advanced Build as the default (#5)`)
- Baseline copied from the current Public Beta 2.13 repository.
- The working tree was clean when this ledger was created.
- Package and visible version identity still say 2.13; rename only when the Beta 2.20 feature
  set is settled so an unfinished development build is not mistaken for a release.
- Bundled rules default: Lyrian rules 0.13.1.

## Confirmed rules findings

- Chimera do not pay a race-specific class-unlock surcharge.
- Normal class unlock cost is `class tier × 100 EXP + 1 Interlude Point` for every race.
- Humans receive an additional 100 EXP. The official 0.13.1 Human race detail says the
  character starts with an additional 100 EXP, also added to Spirit Core.
- Chimera-related 200-EXP choices are breakthroughs, not a general class surcharge:
  `Fight and Flight (Chimera)`, `Faerie-Chimera Hybrid (Race)`, and
  `Human-Chimera Hybrid (Race)`.
- Human-Chimera Hybrid explicitly does not receive the Human +100 EXP or Human Adaptability.

## Current work

Status: COMMUNITY BUG SWEEP REQUIREMENT/RACE/PROFICIENCY/CCS/BATTLE-MODE PASS IMPLEMENTED AND VERIFIED

1. Audit the proposed 2026-07-21 roadmap against Beta 2.20 and current official 0.13.1 data.
2. Implement only confirmed, high-value corrections in this repository.
3. Add regression coverage for each behavior change.
4. Produce an item-by-item value and interface evaluation.
5. Research and design a character-sheet-side integration control for Roll20 and other
   popular platforms. “Albert Rodeo” is provisionally interpreted as Owlbear Rodeo;
   “something Anvil” must be verified before it is named in the interface.

## Work log

### 2026-07-21 — VTT integration discovery started

- Owner requested a small character-sheet-side button that can link/send the current
  character to Roll20 in the previously discussed manner, plus support for other popular
  platforms.
- Current candidates to verify against official documentation: Roll20, Owlbear Rodeo,
  Foundry VTT, and World Anvil. Do not ship a platform card until its actual integration
  mechanism and security boundary are understood.
- Intended first layer: an uncluttered Integrations/Share control on the sheet, with honest
  capability labels (copy, export, connect, or send) rather than pretending every platform
  supports one-click browser linking.

### 2026-07-21 — VTT and sharing first layer implemented

- Confirmed “Albert Rodeo” means Owlbear Rodeo. “Something Anvil” means World Anvil, but
  Foundry VTT is also included because it is the major VTT likely being recalled alongside it.
- Added `BETA_2.20_VTT_INTEGRATION_PLAN.md` with official-source research, platform security
  boundaries, implemented capabilities, recommended adapters, and owner decisions still needed.
- Added one `VTT & Sharing` control to the desktop sheet toolbar and the mobile sheet Tools
  modal. The hub contains Roll20, Owlbear Rodeo, Foundry VTT, and World Anvil cards.
- Added `src/js/integrations.js`, which builds sanitized Roll20 default-template macros,
  World Anvil-friendly profile summaries, safe platform URLs, and cross-browser clipboard
  fallback behavior.
- Added compact `Copy VTT` controls to basic action and quick-ability cards. These copy
  Roll20-compatible chat macros without rolling, spending resources, or requiring an install.
- Added a Roll20 character-summary macro and a World Anvil profile copy. Owlbear/Foundry
  reuse the existing export workflow until their required extension/module adapters exist.
- No API tokens, passwords, webhooks, or service secrets are requested or stored. External
  links use `noopener noreferrer`, and cards say `Extension needed` or `Module needed` rather
  than displaying a false connection state.
- Added cross-browser regression coverage that drives the hub in both desktop and mobile
  layouts, verifies all four cards and safe links, rejects credential inputs, and exercises
  character/action macro copying in Chromium, Firefox, and WebKit.
- `npm.cmd run build` and `node --check scripts/test-cross-browser.mjs` pass.
- First post-integration `npm.cmd test` run completed every existing deep audit and passed the
  new desktop hub/macro checks in all three engines. Its new mobile action-copy assertion
  failed in Chromium, Firefox, and WebKit because the test attempted to click the correctly
  hidden Actions-tab button while still on mobile Overview. This was a test-navigation defect,
  not an application exception or missing control. The regression now selects the mobile
  Combat page before clicking Copy VTT.
- Corrected post-integration `npm.cmd test` rerun passed with `[TEST SUCCESS]`. Desktop and
  mobile VTT hub/macro flows passed in Chromium, Firefox, and WebKit, along with every prior
  deployment, rules, layout, Quick Build, version, cache, and persistence assertion.
- Post-integration `npm.cmd run test:rules0131`, `npm.cmd run audit:minmax`,
  `node --check src/js/integrations.js`, and `git diff --check` all pass. Git printed only the
  repository's existing LF-to-CRLF notices.

### 2026-07-21 — Roll20 selected as the first live adapter (historical; superseded 2026-08-23)

- Owner confirmed Roll20 is the tabletop used by most users of this builder, so the public
  Roll20 bridge takes priority over Owlbear Rodeo and Foundry adapters.
- Provenance clarified: the detailed Roll20 protocol report was produced by a Claude
  (Fable 5) session from a full official Clio source scrape. This session independently
  verified Roll20's official sandbox restrictions and the other platforms' documented APIs.
- The prior raw `.tmp_official_site/clio-characterbuilder-2026-07-21/` folder is no longer on
  disk even though the roadmap said to retain it. The analysis survives in
  `../ROLL20_VTT_INTEGRATION_NOTES_2026-07-21.md`.
- Reacquired the current official source endpoints without copying their code into this public
  repository: `characterbuilder/js/battle-mode.js` returned 110,296 bytes and
  `characterbuilder/roll20/clio-companion.user.js` returned 21,673 bytes, still version 0.4.0.
- Use those files only to verify observable protocol behavior. The Beta 2.20 public bridge must
  be a clean-room implementation, separately versioned, with an explicit install/disable path.
- Added `BETA_2.20_ROLL20_HANDOFF.md` with protocol messages, provenance, clean-room rules,
  public-origin constraints, implementation order, testing requirements, and the immediate
  continuation point.

### 2026-07-21 — Audit baseline established

- Confirmed the Beta 2.20 worktree is clean and based on public Beta 2.13.
- Confirmed the in-app rules update checker is absent; existing cross-browser tests assert
  that it remains absent.
- Confirmed `scripts/pull-angels-sword-data.js` still uses the retired direct API and
  `/version/list`; the developer-only pull pipeline needs migration to the working Clio proxy.
- Confirmed class and breakthrough creation budgets still use a flat 1,000 EXP and do not yet
  apply the official Human +100 EXP.
- No behavioral code was changed before creating this ledger.

### 2026-07-21 — First confirmed corrections implemented

- Added rules-layer Human creation EXP handling: pure Humans receive +100 class/general EXP.
- Added the Human rule's explicit Spirit Core side: the racial +100 is included in the
  auto-managed Spirit Core before it is spent. Human-Chimera Hybrid suppresses both sides.
- Added Human-Chimera exclusion: selecting the hybrid breakthrough removes that +100.
- Added Slow Starter creation handling: the selected breakthrough reduces starting class EXP
  by 200, stacking with the Human modifier (Human + Slow Starter = 900).
- Auto-managed EXP now recomputes from race, selected breakthroughs, class spending, and
  above-creation-pool breakthrough spending. A manually edited character-sheet EXP bank still
  remains authoritative.
- Updated the Classes interface to show the current adjusted starting budget and name the
  Human and Slow Starter modifiers when active.
- Migrated the developer data puller from the retired direct API/request-key mechanism to the
  official Clio proxy. It uses `/version/latest` for the current default, retains `/version/list`
  for explicit historical pulls, and trims decoded `name` fields defensively.
- The in-app update checker remains removed.
- Updated the selectable specialty-weapon list to the July 20 ruling set: added Chainsaw and
  Channeling Weapons; removed Gauntlets, Wand, Magic Staff, Scythe, Giant Scissors, Pickaxe,
  Hori, Sickle, and Smith's Hammer from generic specialty selections. Legacy/class-granted
  groups remain recognized for equipment and explicit class benefits (for example Acolyte can
  still grant Magic Staff, and Forager can still grant Hori).
- Added the Skilled Flier gate. It now accepts the exact ancestry trait `Flight` (including
  Harpy, Pixie, Tengu, and hybrid-granted ancestry features) or the selected Racial Flight
  breakthrough. Sylph's activated `Fly` does not qualify.
- Added focused 0.13.1 regressions for all creation EXP combinations, the five Skilled Flier
  cases, and the specialty-weapon option set.
- Corrected the skill taxonomy to match the official builder: added Artificer and the missing
  Herbalism, Fishing, Hunting, and Logging rows; renamed the legacy Blacksmithing row to
  Blacksmith with an import/parser alias; moved Farming to artisan; and removed guessed
  governing sub-stats from all artisan and gathering skills. Existing Art Magic, Expert
  Knowledge, and Magic Perception special rows remain available.
- Added effective 15-point ceilings for broad skills and expertise. Creation, racial, class,
  and feature sources now share the same broad-skill ceiling; saved over-cap values are
  visibly warned about and rolls use the legal capped value. Expertise additions are blocked
  before they would exceed +15, and legacy over-cap expertise is capped when calculated.
- Added a focused DOM regression covering the six official gathering skills, canonical
  Blacksmith/Artificer names, no-sub-stat labeling, and saved-value skill/expertise caps.
- Fixed a real level-one class-grant hole: key-ability skill pools (for example Rogue's
  Journey's +5 Roguecraft and +5 from its allowed list) now enter the same guided skill/
  expertise allocation system as later class-skill grants. Repeated class/key text is not
  counted twice; genuinely separate grants such as Acolyte's Journey +5 Religion remain.
- Expanded focused A7 coverage: Human-or-Divine Acolyte access, Rogue's Journey allocation,
  Cu Sith and Mothfolk fixed expertise, and The Unknown Paladin access for Gun, Shield, and
  Sword Paladin all pass. The existing full suite already covers Anubis fixed expertise.
- Added `BETA_2.20_ROADMAP_EVALUATION.md` with an item-by-item value decision, interface
  recommendation, dependencies, and owner-information needs for Tracks A through E.
- Focused rules verification now passes with the skill-model regression. Full cross-browser verification is still pending;
  these changes are not release-ready until all gates pass.

### 2026-07-22 — Roll20 bridge steps 1–5 implemented (Claude/Fable 5 session)

- Added `BETA_2.20_ROLL20_PROTOCOL_SPEC.md` + `scripts/roll20-protocol-fixture.mjs`
  (behavior-level protocol spec and machine fixture; a drift test keeps code and spec equal).
- Added `src/js/roll20-bridge.js`: the sheet-side connection manager (two dialects,
  single-dialect send routing, ping/status aging/ack correlation/timeout/dedupe/reconnect/
  teardown). No resource spending anywhere in the bridge path.
- Added `roll20/angel-sword-roll20-bridge.user.js` v0.1.0: clean-room userscript for the
  public GitHub Pages origin + localhost + app.roll20.net, `asb20_*` namespaced storage,
  minimal grants, DOM-route chat injection, multi-tab arbitration.
- VTT hub Roll20 card: live bridge status chip, `Send to Roll20` (connected-only, with
  Sending/Sent/Error states), `Install Bridge` link, safety copy. CSS `is-live`/`is-warn`
  chip variants.
- Added `npm run test:roll20` (47 checks — manager unit tests with a manual clock plus both
  userscript personalities under node:vm with mocked userscript storage).
- Scrape-folder history, corrected twice: the 2026-07-21 "no longer on disk" note WAS
  accurate — something deleted `../.tmp_official_site/` from the workspace root after this
  session's Fable 5 copy was verified at 16:58 on 07-21 (deleter unknown; possibly a temp
  cleanup). On 2026-07-22 the folder was RESTORED byte-identical from the original session
  scratchpad and verified (2.2 MB, all 21 modules present). The owner keeps it permanently.
  Use it for observation only; the public repo still gets no upstream code.
- Details and the next continuation point: `BETA_2.20_ROLL20_HANDOFF.md`.

### 2026-07-22 — Track E interop part 1: .aschar.json exchange (Claude/Fable 5 session)

- Owner decisions recorded: the creator has given the project their blessing (game is free
  and open), so official content may be bundled; the CCS template ships at
  `data/ccs-template.xlsx` with `data/CCS_TEMPLATE_README.md` (source URL, checksum,
  MANDATORY release update procedure) and structural validation in `npm run test:vtt`.
- New `src/js/aschar.js` — pure, dependency-free mapper for the official
  `.aschar.json` trading format (envelope `{format:"angelssword-character", version:1,
  character}`, confirmed from the official implementation). Export builds the official
  character model from live state; import normalizes an official file (or a BARE official
  character object) into an apply plan with visibility notes.
- Hub gained a fifth card, "Official Clio Builder": Export .aschar.json + Open Official
  Vault. Import needs no new button — the normal Import flow content-detects the format
  (envelope first, our own format second, bare official model as a last resort) in io.js.
- Import fidelity rules: fixed skill grants recompute and the creation fields get the
  remainder; choice-based picks (Human +1/+1, guided class skill pools) surface as the
  app's normal pending-choice guidance; catalog-missing classes/breakthroughs/items and
  every other caveat land in an import-summary modal — nothing is silently dropped.
- `npm run test:vtt` grew to 55 checks (round-trip, bare-model acceptance, suffix
  stripping, level clamping, garbage rejection, dependency-freeness).
- Track E part 2 — CCS spreadsheet export implemented the same day: new generic
  `exportPatchedTemplateWorkbook()` in io.js (loads any bundled xlsx template, patches
  only input cells, preserves every formula) + `buildCcsCellMap()` in ui.js following the
  documented official cell map against the bundled template: Core identity/stat
  arrays/bonus columns (template row-label order E45=Focus…), Human +100 and Slow Starter
  checkbox values, the Mirane boolean at A58, classes A15/C15/D15, skills by the
  template's fixed E9:E29 label order with expertise text, weapon/wearable rows,
  Breakthrough sheet (creation BTs write 0 XP per the CCS's own accounting note),
  Inventory rows, and Abilities active/passive blocks (A59 header row never written).
  Hub button: "Export CCS Spreadsheet" on the Official Clio Builder card. Verification
  debt: an exported file should be uploaded to Google Drive once to confirm the
  template's IMPORTRANGE formulas revive (needs a Google account — physical checklist).
- Proficiency cells (Core!K9:L12 merged free-text rows) are NOT written yet — the merged
  layout needs one live look at a real filled CCS before guessing; flagged as the one
  remaining CCS gap.

### 2026-07-22 — Roll20 bridge steps 7–10 (v0.2.0) + per-card sends (Claude/Fable 5 session)

- Per-card ⚔ Send on every action/ability card (visible only while connected), with
  ack-gated spending: costs are deducted through `usePlayCost` only inside the resolution
  of a positive Roll20 ack; failures/timeouts/duplicates spend nothing. End-to-end
  cross-browser test drives a fake in-page companion through the real protocol.
- Token pinning (hub Pin/Unpin, persisted per character), opt-in TokenMod bar sync
  (bar1 HP / bar2 Mana / bar3 RP / bar4 Shield, pinned-id targeted, debounced), and
  opt-in initiative → turn tracker (sheet's rolled total is the single source of truth).
- Userscript v0.2.0 (`getSelected` + turn-order write + `pr` passthrough,
  `unsafeWindow` grant added); Violentmonkey compatibility review passed (real-install
  check still on the physical list). `npm run test:roll20` now 64 checks.
- Details: `BETA_2.20_ROLL20_HANDOFF.md` (third-session entry) and the protocol spec.
- Beta 2.12 side note: that repo's whole uncommitted update was checkpoint-committed
  locally (`228b155`) on the owner's preserve-everything instruction; nothing pushed.

### 2026-07-22 — VTT adapter groundwork for all discussed platforms (Claude/Fable 5 session)

- Owner direction: lay groundwork to attach to all discussed VTTs so rolls/actions work
  back and forth; live testing deferred by the owner, so every adapter carries an explicit
  verification-debt note instead of a connection claim.
- Added `src/js/vtt-relay.js` + publish calls at all four roll sites (dice tray, action
  damage, checks, skills): same-origin BroadcastChannel roll feed, table-visible data only.
- Added the Owlbear Rodeo extension scaffold (`owlbear/`: manifest, popover panel, icon):
  mirrors sheet rolls into a room via OBR.broadcast, receives other players' rolls back —
  the first genuinely two-way adapter. Hub gained a Copy Manifest URL button. EXPERIMENTAL,
  not yet loaded in a real room.
- Added the Foundry VTT companion module scaffold (`foundry/`): system-agnostic, per-user
  flags, `/asimport` + `/ascharacter` + `/asroll`, never touches Actors; README documents
  install/verification and the release-zip requirement. UNTESTED against a live install.
- Added `buildWorldAnvilBBCodeProfile` (BBCode article copy) and its hub button.
- Added `npm run test:vtt` (35 checks: manifest shapes against the documented references,
  script parsing, the no-Actor-writes guard, BBCode output, relay hygiene).
- Full details, bidirectional matrix, and the two reversible defaults chosen for the open
  Owlbear/Foundry questions: `BETA_2.20_VTT_INTEGRATION_PLAN.md` (2026-07-22 section).

### 2026-07-24 — official Community Bug Sweep evaluated against Beta 2.20

- This was a read-only comparison against the current public Clio character builder and
  its public JavaScript modules. No Beta 2.20 application code was changed, and Beta 3.0
  was not touched.
- The announcement is primarily an official-builder behavior update, not a new numbered
  rules-data release. Beta 2.20 therefore does not inherit all of it merely because it
  already loads 0.13.1 rules data.
- Already present or substantially equivalent in Beta 2.20: Human +100 class EXP,
  Rich Parents starting Clim, repeatable/stackable breakthrough handling, Divine's
  Chosen deity selection, available-only breakthrough browsing, the base Ryujin
  Elemental Mastery choice, broad class-requirement enforcement, free class grants,
  expertise merging, shop search, raw-material handling, carpenter/wood recipe
  requirements, racial abilities on the play sheet, CCS export, and VTT integration.
- Confirmed correctness gaps or behavior mismatches to port deliberately:
  - Mixed House is only a free-text second-house note in Beta 2.20. It does not yet
    model two structured houses, both house abilities, both requirement identities,
    or both free-class grants.
  - Sorcerer does not yet own separate mandatory Elemental Mastery picks at class
    start and level 8. Celestial Dragon currently only widens the Ryujin list with
    Holy/Dark, while the updated official behavior requires a new pick from the full
    selectable element list.
  - Mystic Eyes of Faerie Light does not yet grant the fixed +10 Perception
    (Illusion) expertise. Arachne does not yet remove Extra Arms and add +2 Burden.
  - Pixie's -2 Toughness/+2 Agility needs an explicit implementation/regression
    instead of relying on generic prose parsing.
  - Race/breakthrough changes prune invalid breakthroughs, but do not yet cascade
    through invalid classes and their paid levels with a complete EXP/IP refund.
  - The quantity helper currently treats every catalog item as stackable. The
    official update restricts bulk-buy to consumable categories; raw materials use
    their own unit flow.
  - Beta 2.20 has no imported corrected item-mod tier catalog, no complete
    attachment-at-purchase flow, and therefore no complete Agile Weave override
    that removes every armor penalty and adds +1 Evasion.
  - There is no sheet/dice mute control and no one-click VTT token-image export.
- Items that need focused regression comparison before deciding whether code changes
  are required: race skill grants and clan-skill loops, class level-up progress
  preservation, Bard/Mist Veil Elegy/Faerie Light Eyes/Aurora and Flash Star
  Blade/Daionmyoji gates, Acolyte/channeling/Gauntlet proficiency behavior, short-height
  equipment panels, CCS cell mapping after the official export fixes, and racial
  abilities reaching every Battle Mode path.
- Do not copy the official implementation wholesale. Port the confirmed behavior into
  the existing Beta 2.20 state model and add local regression coverage for every port.

### 2026-07-24 — requested Community Bug Sweep correctness pass implemented

- Implementation was confined to `Angel Sword Lirian Chronicles Public Beta 2.20`.
  Beta 3.0 and the live Beta 2.13 repository were not modified.
- Added explicit, suffix-tolerant requirement handling for Bard, Mist Veil Elegy,
  Faerie Light Eyes, Aurora Blade Style, Flash Star Blade Style, and Daionmyoji.
  The official semantics now enforced are:
  - Bard requires Idol mastery or at least 5 real Art/expertise progress; a blank
    character does not qualify.
  - Mist Veil Elegy requires Idol mastery, Bard mastery, or any mastered class plus
    at least 10 Art progress.
  - Faerie Light Eyes requires Mystic Eyes of Faerie Light.
  - Aurora/Flash require an actually mastered class plus Light Swords, Longsword,
    Katana, or Dueling Weapons proficiency.
  - Daionmyoji requires Onmyoji mastery. Name normalization intentionally tolerates
    the official source's trailing whitespace on `Onmyoji `.
- Mystic Eyes of Faerie Light now contributes fixed +10 Perception (Illusion)
  expertise to the computed skill model, rolls, and sheet expertise control.
- Replaced prose-derived primary racial skill pools with explicit official pools for
  Chimera, Demon, Fae, and Youkai; Human retains its existing non-crafting,
  non-gathering any-skill behavior. Changing race/lineage now removes inactive
  racial-skill allocations without touching unrelated creation skill spending.
- Demon clan skill allocation now accepts every skill, matching the official
  "any skill; square the clan connection with the GM" behavior. It is no longer
  trapped in a guessed short list or a clan-selection loop.
- Added normalized migration/preservation of selected class progress so legacy
  class keys and race/lineage changes do not erase purchased levels.
- Corrected proficiency projection:
  - Acolyte chooses one common weapon group or one individual channeling weapon,
    exposed as `Wands` or `Staves`; it does not receive the entire Channeling
    Weapons group.
  - Mage/Sorcerer-style explicit grants project `Channeling Weapons`.
  - Unarmed proficiency projects `Unarmed (as One-Handed)` and automatically grants
    Gauntlets. Gauntlets are not a generic selectable specialty group.
  - Quick Builds prefer Staves for staff gear and Wands for wand gear.
- Expanded race/ancestry ability reference resolution to include current direct
  records and legacy `ability1`…`ability7`, `ultimateAbility`, and
  `trait1`…`trait8` identifiers. Racial abilities now reach the same Battle Mode
  quick-action path.
- Updated CCS export mapping to the current official sheet layout: gender, creation
  stats/bonuses, Human/Slow Starter/Mirane flags, category proficiency cells,
  general and artisan skills, derived adjustments, equipped weapon/armor grids,
  breakthrough creation/general EXP accounting, 136 inventory rows with quantity,
  burden, and cost, and active/passive ability tables. The export still patches the
  bundled workbook instead of replacing formulas.
- Added short-height builder/equipment constraints and verified the 390x568
  equipment review sheet settles entirely inside the viewport with scrollable
  content and reachable actions. The regression waits for the 180 ms entrance
  animation before measuring final geometry.
- Added `scripts/test-community-update.mjs` and `npm run test:community` as a focused
  smoke gate. Expanded the deep Chromium test block to cover every named gate, all
  five race grants, Demon all-skill selection, level preservation, stale racial
  allocation cleanup, Acolyte choices, proficiency projection, Battle Mode racial
  actions, and the short-screen equipment panel.
- Do not revert the tests from `textContent` to `innerText` for closed expertise or
  proficiency `<details>` controls: their option bodies are intentionally collapsed
  but present and actionable in the DOM.

## Test record

- 2026-07-24/25 independent cross-check (Claude/Fable 5, at the owner's request): every
  gate re-run from scratch over the Community Bug Sweep changes — test:roll20 64/64,
  test:vtt 55/55, test:community, test:rules0131, audit:minmax, and the full
  cross-browser suite all passed; `scripts/verify-interop-live.mjs` re-passed against
  the LIVE official vault. File-timestamp audit confirmed the sweep touched no
  bridge/interop/adapter modules. Verdict: nothing broken; the sweep's ports integrate
  cleanly with the VTT/interop layer.
- 2026-07-24 Community Bug Sweep correctness pass:
  - `npm.cmd run test:community`: passed.
  - `npm.cmd run test:rules0131`: passed.
  - `npm.cmd test`: passed with `[TEST SUCCESS]` in Chromium, Firefox, and WebKit at
    wide, desktop, and mobile sizes. Deep Chromium audited 28 Quick Builds,
    705 class progressions across four local rules versions, 19,186 class
    availability states, and 25 proficiency grants in addition to the new sweep.
  - `npm.cmd run test:roll20`: 64/64 passed.
  - `npm.cmd run test:vtt`: 55/55 passed, including bundled CCS-template and
    interop structure checks.
  - `npm.cmd run audit:minmax`: passed.
  - `git diff --check`: passed; only existing LF-to-CRLF notices were printed.
- Final post-VTT `npm.cmd test`: passed with `[TEST SUCCESS]` after correcting the new test's
  mobile navigation. It verified VTT & Sharing and macro copy in desktop/mobile Chromium,
  Firefox, and WebKit while retaining all 28 Quick Builds, 705 class progressions, 19,186
  availability states, and 25 proficiency-grant audits.
- Baseline `npm run audit:minmax`: passed before this work session (recorded when worktree was
  created).
- Final `npm.cmd test`: passed after all changes with `[TEST SUCCESS]`. It exercised the
  deployment artifact in Chromium, Firefox, and WebKit at wide, desktop, and 390×844 mobile
  viewports; 28 Quick Build packages, 705 class progressions across four local rules versions,
  19,186 class-availability states, and 25 proficiency grants were audited.
- `npm.cmd run test:rules0131`: passed after Human EXP, data-pipeline, specialty-weapon,
  Skilled Flier, gathering-skill, 15-point-cap, key-ability pool, Acolyte, racial expertise,
  and three-Paladin changes/checks.
- Final `npm.cmd run audit:minmax`: passed.
- `node --check scripts/pull-angels-sword-data.js`: passed.
- Final `git diff --check`: passed. The CRLF notices are Git line-ending notices, not errors.
- 2026-07-22 (Track E interop, both parts): `npm run test:vtt` passed (55/55 including
  .aschar round-trip and CCS template structure); `npm run test:roll20` re-passed (64/64);
  `npm.cmd run test:rules0131` passed; full `npm.cmd test` passed with `[TEST SUCCESS]`
  in Chromium, Firefox, and WebKit with the fifth hub card and both export buttons
  present; `git diff --check` clean after normalizing io.js line endings (a byte-level
  whitespace fix applied after the suite run; no functional change). Open verification
  debt: one Google-Drive upload of an exported CCS file, and one official-vault import of
  an exported .aschar.json — both need accounts/desktop (physical checklist).
- 2026-07-22 (bridge v0.2.0, steps 7–10): `npm run test:roll20` passed (64/64);
  `npm run test:vtt` passed (35/35); `npm.cmd run test:rules0131` passed; full
  `npm.cmd test` passed with `[TEST SUCCESS]` in Chromium, Firefox, and WebKit including
  the new end-to-end card-send/ack-gated-spend test and the token-pinning flow against
  the in-page fake companion, desktop and mobile.
- 2026-07-22 (VTT adapter groundwork): `npm run test:vtt` passed (35/35 checks);
  `npm run test:roll20` re-passed (47/47); `npm.cmd run test:rules0131` passed;
  full `npm.cmd test` passed with `[TEST SUCCESS]` in Chromium, Firefox, and WebKit with
  the reworked hub cards (BBCode/manifest copy buttons, scaffold notes) and the roll-relay
  publishes in place. Owlbear room, Foundry install, and Roll20 physical checks remain
  open verification debt — deferred by the owner 2026-07-22.
- 2026-07-22 (Roll20 bridge steps 1–5): `npm run test:roll20` passed (47/47 checks);
  `npm.cmd run test:rules0131` passed; `npm.cmd run audit:minmax` passed; full `npm.cmd test`
  passed with `[TEST SUCCESS]` in Chromium, Firefox, and WebKit at wide, desktop, and mobile
  viewports with the new hub status chip/send button present; `node --check` and
  `git diff --check` clean. This describes the historical bridge build; the
  2026-08-16 product decision below retires it from the player-facing release path.

## Roadmap disposition

The detailed decision table is in `BETA_2.20_ROADMAP_EVALUATION.md`. Current
high-confidence directions:

- Human +100 EXP: valuable correctness fix; implement with hybrid and Slow Starter coverage.
- Developer data pull → Clio proxy: valuable maintenance fix; do not add runtime networking or
  an in-app update button.
- Creation Job/Train/Other is valuable, but Train's interaction with the app's displayed
  Spirit Core needs one consistent decision before implementation.
- The only identified A7 feature still lacking a complete model is Transmuter/Alkahest's
  maximum-two named discipline system. Do not fake those points into ordinary crafting
  skills; they are separate `Transmuter (discipline)` values in the official model.
- VTT first layer is complete. Roll20 copy works now; live Roll20 needs a separately installed
  public-origin bridge, Owlbear needs an official extension, Foundry needs a module, and World
  Anvil API publishing needs secure credential handling. See `BETA_2.20_VTT_INTEGRATION_PLAN.md`.
- Discord, shared-screen dice, and deeper interop remain optional and must not block core rules
  correctness.

## Owner physical checklist

All human-only verification steps are written out step-by-step with success criteria in
`OWNER_PHYSICAL_CHECKLIST.md`. When the owner reports "item N passed/failed", update
that file and the matching handoff sections.

**2026-07-23 live verification session (Claude/Fable 5):** added
`scripts/verify-interop-live.mjs` (headless Chromium: real export-button downloads +
live official-vault upload). Results — checklist item 5 (.aschar → official vault)
**PASSED against the live site** (their import code accepted our export; character
listed in their vault); item 4's machine half passed (real downloaded CCS file
  cell-validated: correct values, types, and styles); item 1 confirmed that the
  browser-userscript route required unacceptable player setup and was therefore
  retired rather than promoted; item 3 confirmed no Foundry install on this PC.
The checklist doc was rewritten as verified tutorials with [VERIFIED]/[YOU] markers.

## Flagged for a later update (owner, 2026-07-22)

- **Mirane mod timing rule (CONFIRMED 2026-07-22 from the official implementation):**
  the official builder's creation shop returns NO mod options under Mirane ("items brought
  into the expedition cannot have mods"), while the official sheet's in-play Item Shop
  applies no Mirane gate at all — mods and materials are freely purchasable once play has
  begun. So the rule is: banned at creation, allowed on in-game purchases. Implementation
  remains a later update per the owner: (a) verify our creation-time Mirane flow blocks
  mod attachment, and (b) ensure the play-mode shop/crafting path allows adding purchased
  mods under Mirane without warnings.

## Information that may require the owner

- A link or timestamp for Leaflit's stream statement would allow exact wording confirmation,
  although the current written/API rules are sufficient for builder behavior.
- Roll20 bridge scope may require confirmation of whether users are expected to install a
  userscript or companion application.
- Live-adapter priority is resolved: build the public Roll20 bridge first. Owlbear Rodeo and
  Foundry remain later adapters.
- Discord webhook support requires an explicit privacy/security decision because webhook URLs
  are credentials even when stored only in the browser.
- Physical iPhone/Android and Brave-with-Shields testing still requires real devices/installations.

## Next safe action

### 2026-08-04 official-builder and VTT audit

- Full report: `BETA_2.20_OFFICIAL_BUILDER_AND_VTT_AUDIT_2026-08-04.md`.
- Official rules latest remains `0.13.1`; no numbered rules update was found.
- Current official builder modules changed substantially since the retained 2026-07-21
  snapshot. Newly confirmed/high-priority deltas include structured Mixed House, full
  Sorcerer/Ryujin/Celestial Dragon mastery choices, invalid-class cascade/refunds,
  Human-Chimera Human stat/weapon grants, Arachne and Organized Inventory burden effects,
  consumable-only quantities, current mod/material combat effects, and separate
  Transmuter/Alkahest disciplines.
- Corrected an outdated handoff assumption: Pixie's -2 Toughness/+2 Agility is already
  auto-applied by the current generic effect model and appeared in the fresh rules test.
  Keep/add a focused no-double-application regression; do not reimplement it blindly.
- Corrected an outdated UI comparison: Beta 2.20 does not have the official builder's
  Available-only breakthrough toggle. It hides race/ancestry mismatches but otherwise shows
  unmet choices as locked. This is a useful UX port, not a rules blocker.
- Roll20 focused automation still passes, but physical status is unchanged. Important new
  audit findings: positive ack proves DOM injection/click, not visible Roll20 acceptance;
  ack-gated resource spending therefore needs a real-table pass. The userscript's `Stores
  nothing` text is inaccurate because the latest macro/heartbeat/ack/query persist in GM
  storage until overwritten or removal. Add expiry/cleanup and truthful disclosure.
- Owlbear is not merely `awaiting a room test`: the separate public sheet tab and embedded
  panel can be isolated by modern top-level-site storage partitioning, breaking their shared
  BroadcastChannel. Redesign toward an in-extension sheet/import/roll context before release.
- Foundry is not installable from its manifest: the advertised
  `foundry/angel-sword-lyrian.zip` is absent. Its manifest is verified only through Foundry
  12 while Foundry 14 is current stable, and legacy `Dialog` is deprecated. Package, migrate,
  and test on a licensed v14 install before advertising it.
- World Anvil remains copy/paste only. `.aschar` previously passed the live official vault;
  CCS still needs its Google Drive/Sheets formula-revival check.
- Fresh gates on 2026-08-04 all passed: Roll20 64/64; VTT 55/55; community; rules0131;
  min/max audit; and the full `[TEST SUCCESS]` deployment suite in Chromium, Firefox, and
  WebKit at wide, desktop, and 390x844 mobile viewports. The deep Chromium pass retained
  28 Quick Builds, 705 class progressions, 19,186 class-availability states, and 25
  proficiency grants. The package/test-server identity still says 2.13 intentionally until
  Beta 2.20 is approved for release.

The next safe implementation sequence is: Mixed House; Elemental Mastery lifecycle;
Human-Chimera; Arachne/Organized Inventory; invalid class cascade/refunds; consumable-only
quantities; current mods/material effects; Transmuter/Alkahest; dice mute. Add a focused
regression before each port. In parallel only after code is stable, physically validate
Roll20, redesign Owlbear, and package Foundry v14. Do not modify Beta 3.0 or publish Beta 2.20
without explicit owner approval.

### 2026-08-09 Discord sheet/Roll20 implications review

- Reviewed the supplied August 2-7 Discord discussion and Roll20 custom-weapon screenshot.
  It does not establish a new numbered rules release or justify changing class EXP costs.
  The reported Roll20 class-cost failure was an external Roll20 deployment problem.
- Nio's corrected rule is already represented in the local `0.13.1` ancestry data and the
  generic computed-bonus path applies it correctly once: +1 Guard, +4 Block, -2 Evasion,
  and -2 Dodge. Do not add the briefly reported +2 Toughness/-2 Agility; that was corrected
  in the conversation. Catfolk and Rabbitfolk Fast Runner also resolves to base Speed 25
  (+5 from the normal 20). Add focused ancestry regressions before changing this parser.
- Local Archer Multishot already has `Overcharge,Scatter`. The Discord omission was stale
  text inside an existing Roll20 character ability; removing/re-adding refreshed it. Our
  browser cards are rebuilt from current loaded data, but exported/copied Roll20 macros are
  snapshots. Any future two-way Roll20 sync should refresh records by stable ability ID and
  should expose the source rules version rather than treating copied wording as live data.
- The current Clio `ccs-template.xlsx` download is byte-identical to our bundled copy:
  588,454 bytes, SHA-256
  `078BB27BAA394149A10453A0FA7B19B28BDB42F0DCD30E6C94A24E4AA64EE4A6`. Its Core B11/B12
  formulas are still the older formulas. The Discord discussion says the separate community
  Google sheet gained new auto-race formulas and that Clio export is currently incorrect.
  Therefore CCS export success must not be treated as semantic correctness yet.
- Do not paste the Discord B11/B12 formulas into the bundled workbook by themselves. The
  Beta 2.20 exporter currently writes computed racial bonuses into F47/F48; the newer sheet
  formulas also add Pixie/Fae/Chimera from D2/D3 and would double-count them. A template
  refresh must update `buildCcsCellMap()` and add regression cases for Pixie, Fae, Chimera,
  Mirane lockouts, Spirit Core, and class rows. Obtain or identify the current blank community
  sheet/template first and compare every writable cell and protected formula region.
- The Venom Drip pistol macro demonstrates a useful future Roll20 feature, not a rules-data
  correction. Our bridge can already carry the resulting macro string, but our generator does
  not yet model equipped/custom weapon mode queries, 1H/2H attack bonuses, Light/Precise/Heavy
  damage profiles, crit/reach notes, or weapon modifications such as Venom Drip. Implement
  this only after current item mods/material effects are modeled. Roll20 nested query syntax
  requires context-aware escaping of `|` and `}` plus focused macro tests; do not copy the
  community macro wholesale.
- Spreadsheet conditional-formatting discussion (a maximum d4 appearing green) and the old
  Pathfinder sheet have no Beta 2.20 program implication.

Next action from this review: acquire the current community CCS blank-sheet source, perform a
cell/formula diff against the bundled v10.3.1 workbook, then update the template, mapper, and
export regressions as one atomic change. The richer equipped-weapon Roll20 macro builder belongs
after the pending item-mod/material-effects work. No Beta 3.0 files were touched.

### 2026-08-09 CCS provenance check

- Beta 2.20 contains two different spreadsheet templates. The active CCS export uses
  `data/ccs-template.xlsx`; the older legacy spreadsheet export uses
  `assets/lyrian-google-template.xlsx`. Do not treat their provenance or mappings as
  interchangeable.
- `data/ccs-template.xlsx` was captured directly from the official Clio builder endpoint
  `https://clio.angelssword.com/characterbuilder/data/ccs-template.xlsx` on 2026-07-22 and
  was identified by the official builder integration as community-sheet template v10.3.1.
  The current endpoint still serves the exact same bytes.
- The XLSX contains no usable creator attribution: it has no Office core-properties file,
  its workbook comments contain a blank author, and no Twilight/Morrocker/Kaelith credit is
  embedded in the workbook XML. Git records only who bundled it locally: VerboseBard added
  the CCS template in checkpoint `15defa6` (co-authored by Claude Fable 5). That is not
  evidence of original spreadsheet authorship.
- The supplied Discord conversation is the strongest available authorship evidence. Twilight
  calls it "the spreadsheet I've made," discusses maintaining the main sheet, and describes
  selectively adopting ideas from a Clio-derived/customized version. The careful attribution
  is therefore: **Twilight appears to be the primary creator/maintainer of the underlying main
  community character sheet; the bundled file is the Clio builder's XLSX export/adaptation of
  that sheet.** The exact contributors to the Clio adaptation cannot be proven from the file.
- The legacy `assets/lyrian-google-template.xlsx` was added to this repository by VerboseBard
  in the initial Beta 1.3 web-builder commit `3cc103e`. Its Office metadata is also blank, so
  the repository does not establish its original external author. Confirm which export button
  is being discussed before answering future provenance questions.

### 2026-08-12 Foundry CSB community-project review

- Reviewed `JesterBaster/Lyrian-Chronicles-foundry-vtt-system` at commit
  `bb2c7bea22b5b96e91a1f8488efa36f49d465205`. Full implications and recommended integration
  sequence are recorded in `BETA_2.20_VTT_INTEGRATION_PLAN.md`.
- This is a newly published, partial Foundry 14.365 / Custom System Builder 6.0.2 sheet/world,
  not a standalone Lyrian game system and not yet a clean installable module. Useful completed
  scope is header/stats/resources/defences and the 21 ordinary skills; most gameplay tabs,
  item templates, compendiums, enemies, and expertise automation remain unfinished.
- Its documented `lyrian_*` keys create a valuable optional target for Beta 2.20 exports.
  Preserve our current system-agnostic Foundry companion as the fallback; pursue a separate
  `.aschar` -> Lyrian CSB adapter only after the schema and ownership terms stabilize.
- Do not copy code/assets yet: there is no repository license, `module.json` has blank
  manifest/download/license fields and a placeholder author, and the claimed `exports/`
  template backup is absent.
- Security/repository-hygiene concern: the public repository includes the complete Foundry
  world LevelDB state (`data/users`, `messages`, `settings`, `actors`, and more). Contents were
  deliberately not inspected. Advise the maintainer to sanitize and rewrite history or start
  a clean distribution repository, publishing CSB template JSON/compendiums rather than a live
  world database.
- No Beta 2.20 runtime code, Beta 3.0 files, or external repository state changed during this
  evaluation.

### 2026-08-12 JesterBaster collaboration permission update

- Owner reports direct Discord permission from JesterBaster to collaborate and reuse the
  Lyrian Foundry/CSB work for the overall community, with neither fan project seeking financial
  benefit. Owner also reports existing game-owner approval for this community builder project.
- Mark the direct collaboration/reuse permission blocker resolved. Credit JesterBaster and keep
  the work labeled unofficial fan/community tooling.
- Still obtain a durable `LICENSE`/`PERMISSION.md` or retained Discord permission record before
  redistribution. Noncommercial status is context, not a substitute for permission; the reported
  express permission is the operative authorization.
- Do not copy the published live-world LevelDB files. Request a sanitized CSB template export,
  stable `lyrian_*` schema, and clean distributable assets first. Continue honoring licenses for
  Foundry, CSB, fonts, and any other third-party material.
- Next implementation work is now authorized in principle: design and test an `.aschar` ->
  Lyrian CSB mapper after the sanitized template/schema is received. No runtime code changed in
  this permission-recording update.

### 2026-08-12 independent Foundry CSB extraction and mapper update

- Owner explicitly directed the project to retrieve and reconstruct the public community CSB
  work ourselves rather than wait for the maintainer to package it.
- Downloaded JesterBaster's repository at commit
  `bb2c7bea22b5b96e91a1f8488efa36f49d465205`. The separate
  `packs/actor-templates` LevelDB contains a stale/empty `lyrian_pc`; the complete current
  `_template` Actor was located in the world `data/actors` database.
- Extracted only that template and immediately sanitized it. Added
  `foundry/csb-reference/jesterbaster-lyrian-pc-template.json`, its flattened schema,
  upstream `customcss.css`, and only the seven referenced font files plus their OFL license.
  The reference excludes actor/document IDs, ownership, prototype tokens, embedded records,
  template histories, live-world metadata, and all user/message/settings/campaign data.
- Added `foundry/scripts/lyrian-csb-mapper.mjs`, a pure mapping layer that never calls Foundry
  APIs and never writes Actors. It maps `.aschar` identity, effective stats, 21 ordinary skills,
  resources, and the current template's defence/speed scratch fields. Unsupported expertise,
  classes, breakthroughs, equipment, and skills remain in `coverage.unmapped`; formula
  mismatches remain in `coverage.formulaGaps`.
- `game.angelSword.mapLyrianCsb()` exposes the read-only plan in a licensed test installation.
  Do not turn this into an Actor write until the clean-world physical checklist passes.
- Template audit found two upstream errors at the pinned commit: Roguecraft's roll component is
  keyed `lyrian_roll_`; Intimidation's expertise control rolls/lists Negotiation. Also, the
  Classes/Combat/Inventory/Crafting/Bio tabs and expertise storage remain incomplete.
- Validation: `npm run test:foundry-csb` passes all 15 checks and `npm run test:vtt` passes all
  58 checks. Update both tests whenever the upstream schema commit changes.
- The temporary upstream zip, extracted live world, and LevelDB reader were deleted after the
  sanitized artifacts were verified; do not commit or redistribute the live world.
- Current next step: use a licensed clean Foundry 14.365 + CSB 6.0.2 install to verify template
  import/binding and exact `system.props` behavior, fix the two CSB component defects in a clean
  export, then add a guarded backup-first Actor update. Beta 3.0 remains out of scope.

### 2026-08-16 — Beta 2.20 scope and four-set dice audit

- Owner explicitly parked the Beta 3.0 redesign. No Beta 3.0 file was inspected as an
  implementation source or changed. Beta 2.20 remains the only active implementation target.
- Confirmed that the local Beta 2.20 working tree already integrates exactly four selectable
  dice sets: Angel Sword, Asari, Leaflit, and Rana. Angel Sword is built in; the other three
  load through the generated promoted-skin registry. All four route through the synchronized
  shared geometry/renderer, expose D4/D6/D8/D10/D100/D12/D20, render distinct per-die picker
  previews, and work in real character-sheet rolls.
- No missing dice-set implementation was found, so no duplicate runtime feature code was added.
  The integration is local and tested but remains uncommitted/unpublished with the rest of the
  Beta 2.20 working tree.
- Added `BETA_2.20_STATUS_AND_DICE_AUDIT_2026-08-16.md` as the current answer-first status
  report. Updated the dice system map and rendering contract to include Rana and the current
  promotion/test workflow.
- Fresh verification passed: build/bundle compatibility; shared Workshop core sync; dice
  promotion/registry/routing/topology; UI follow-ups; rules 0.13.1; community update; min/max;
  Roll20 64/64; VTT 58/58; Foundry CSB 15/15; and the dedicated dice browser matrix on desktop
  and mobile Chrome, Edge, Chromium, Firefox, and WebKit. Brave was not installed.
- The first full `npm test` run reached Firefox mobile and timed out waiting for the Crafting
  walkthrough button to become stable. The dedicated Firefox dice tests had passed, WebKit
  continued to pass, and an immediate unchanged full-suite rerun passed every deployment,
  layout, network, DOM, Quick Build, class progression, availability, proficiency, version,
  cache, autosave, and mobile assertion. Record this as an intermittent Firefox Playwright
  actionability flake and monitor it; do not claim a reproducible product regression.
- Owner then reported that selecting Roll20 `Install Bridge` replaced the character-sheet tab
  and showed `ERR_CONNECTION_REFUSED` after the local server on port 4210 had stopped. Restored
  the local server and changed the installer link to open in a separate protected tab with
  `target="_blank"` and `rel="noopener noreferrer"`, so a failed or intercepted userscript
  navigation cannot strand the sheet. Corrected the nearby disclosure: the bridge does not
  contact a server, but its userscript storage retains the latest relay/status messages until
  they are overwritten or the bridge is removed. Added a deployment-browser assertion for the
  link target, relationship protections, and installer path. The fresh full Chromium/Firefox/
  WebKit deployment suite passed after the fix.
- The separate-tab experiment proved that a browser userscript is not a suitable
  player product: it depends on a manager extension, browser-specific permissions,
  and technical installation steps. The installer, download, direct-send, token-pin,
  and token-sync controls were removed from the player-facing interface.
- **Table Tools → Roll20 (Alpha)** now presents **Copy Character Macro** as the
  cross-browser fallback and explains the target solution: a native Lyrian
  Chronicles Roll20 community sheet selected once by the GM, followed by a
  paste-once character import and native one-click roll buttons. A later Roll20
  Mod may provide GM automation in Pro-created games, but it will never be a
  player requirement. See `docs/roll20-native-sheet-plan.md`.
- A real official-builder round trip of `The Heir.aschar.json` mapped both classes, both
  breakthroughs, four skill rows, and all seven equipment entries, but reported a Clim caveat.
  The file showed 300 Clim remaining because it preserved `interludeActions: ["job"]`; the
  official creation-time Job action adds 300 Clim, while our importer had ignored the action and
  recomputed 0 from a 4,000 Mirane budget minus 4,000 of gear. Added official creation interlude
  actions (repeatable Job +300 Clim, Train +25 class EXP, and Other/GM decides) to builder state,
  class-IP accounting, funds, class-step controls, `.aschar` import, and `.aschar` export. Import
  results now report an exact Clim match when totals agree and show both values only on a true
  mismatch. A focused browser regression recreates the seven-item/Job case and proves 300 Clim
  survives the import.
- Owner reported that the desktop `Clear Sheet` toolbar button erased the working character on
  a single click. The project already had a guarded reset modal for the builder sidebar and
  mobile tools, but the desktop button bypassed it and called `clearSheet()` directly. Rewired
  the desktop button to the same confirmation flow. The modal now asks, `Are you sure you wish
  to erase this character?`, explains that current working data will be erased while saved
  character slots remain, and offers explicit `Yes, Erase Character` / `No, Keep Character`
  actions. The focused browser regression proves cancellation preserves the character and
  confirmation clears it. Build/bundle compatibility and `test-ui-followups` pass.
- Release status remains unchanged: the package/UI still identify as Beta 2.13 intentionally,
  the worktree needs deliberate scope/commit cleanup, physical devices remain unverified, and
  the rule/creation/equipment and live-adapter gaps in the status report remain open.

### 2026-08-16 — Owlbear Companion v0.2 architecture milestone

- Adopted one installed Owlbear extension with internal modules. The first module now imports
  either builder Character JSON or official `.aschar.json`, normalizes it to a compact versioned
  record, displays live resources, and binds it to exactly one selected Character-layer token.
- Binding metadata is namespaced and records player, character, token, and update identity.
  Non-GM players cannot silently replace another player's existing token binding; a GM can
  repair or clear it.
- Added a shared, versioned roll-event contract, an extension-native connection-test roll,
  a short deduplicated room log, and a manifest background page. The background page permits
  relay work while the visible popover is closed.
- The external top-level builder-to-Owlbear relay remains best effort because modern browser
  storage partitioning may isolate `BroadcastChannel` between the builder origin and Owlbear's
  extension iframe. Extension-native import, binding, test rolls, and room log do not depend
  on that channel. Do not call external-sheet relay certified until a physical two-browser
  room test passes.
- The sheet remains authoritative for future mirrored visual dice: Owlbear will eventually
  visualize a completed sheet result, not roll a second independent outcome. Damage/healing,
  conditions, movement, Lyrian fluid initiative, and mirrored 3D dice are intentionally later
  modules in the same installed extension.
- Added Owlbear-specific CORS for local serving and corrected GitHub Pages packaging so the
  complete `owlbear/` extension is present in a future deployment artifact. Nothing was pushed,
  published, or installed into the owner's Owlbear account in this milestone.
- The official Owlbear SDK is bundled into the static extension at build time rather than
  loaded from a runtime CDN. `uuid` is overridden to 11.1.1 because SDK 3.1.0 only calls its
  compatible v4 API; `npm audit` reports no known vulnerabilities.
- Added `docs/owlbear-extension-architecture.md`, expanded the GM recording walkthrough, and
  updated the owner physical checklist. Focused verification currently passes 79 adapter/
  contract checks plus a Chromium standalone-panel import and safety test. The next gate is
  one GM plus one second player in a real Owlbear room.
- `npm start` and `npm run serve` build the ignored/generated Owlbear runtime bundles before
  opening the local server. The GitHub Pages workflow also builds before packaging. The full
  copied-deployment suite passes Chromium, Firefox, and WebKit at wide, desktop, and mobile
  sizes, including a complete manifest/page/runtime deployment assertion.
