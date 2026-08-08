# Beta 2.20 Official Builder, Rules, and VTT Audit

Audit date: 2026-08-04  
Target: `Angel Sword Lirian Chronicles Public Beta 2.20` only  
Official rules baseline checked: Lyrian Chronicles `0.13.1`

## Executive verdict

- The official rules API still reports **0.13.1**. No newer numbered rules release was found.
- The official Clio character builder has changed substantially since the retained
  2026-07-21 snapshot. These are not all cosmetic bug fixes: several changes alter legal
  creation choices, refunds, class access, proficiencies, equipment effects, and sheet output.
- Beta 2.20 already contains the previously requested Bard, Mist Veil Elegy, Faerie Light
  Eyes, Aurora/Flash Star Blade, Daionmyoji, Demon skill, race-skill, level-preservation,
  Acolyte/channeling/Gauntlet, short-screen, CCS, and racial Battle Mode work. The focused
  and cross-browser tests still cover those paths.
- Beta 2.20 does **not** yet match the current official builder in several important areas.
  Mixed House, the full Elemental Mastery lifecycle, invalid-class cascading refunds,
  Human-Chimera hybrid grants, Arachne/Organized Inventory, consumable-only quantities,
  the current item-mod/material effect model, and Transmuter/Alkahest disciplines are the
  principal correctness gaps.
- The Roll20 adapter is a serious automated prototype, but it is still physically unverified
  and uses unstable Roll20 DOM/internal APIs. Its positive acknowledgement proves that the
  userscript clicked the chat button, not that Roll20 accepted and displayed the message.
  Because local resources are spent after that acknowledgement, one real-table send/spend
  test is a release blocker.
- Owlbear is **not release-ready**. Its cross-tab `BroadcastChannel` design can be separated
  by modern top-level-site storage partitioning when the panel is embedded in Owlbear.
- Foundry is **not installable from the advertised manifest today**: the referenced release
  zip is absent, the manifest is verified only through Foundry 12, and Foundry 14 is the
  current stable generation. The source scaffold parses but has never run in Foundry.
- World Anvil support is honest copy/paste interoperability, not a live connection.
- Beta 2.20 is not deployed, so none of its new VTT artifacts should be advertised as live.

## Evidence and audit limits

The comparison used:

- the official latest-version API and 0.13.1 patch notes;
- current public Clio character-builder modules compared with the retained 2026-07-21 copy;
- Beta 2.20 source, tests, manifests, handoffs, and current working tree;
- current official Roll20, Owlbear Rodeo, Foundry, and World Anvil documentation;
- fresh local automated gates.

The in-app interactive browser was unavailable in this session. No fresh manual click-through
or real-account VTT session is claimed. Automated Playwright coverage and physical testing are
listed separately throughout this report.

## Official rules and character-builder status

### Rules release

The official endpoint `https://clio-proxy.angelssword.com/api/ttrpg/version/latest` returned
`0.13.1`. The official 0.13.1 patch-notes endpoint is unchanged. The builder updates below
therefore represent implementation fixes and clarified behavior on top of 0.13.1, not a new
rules-data version.

### Current official-builder changes observed

The current builder now includes, among other changes:

- structured Mixed House selection of two Demon houses, including both identities, abilities,
  and free-class grants;
- Sorcerer start and level-8 Elemental Mastery choices plus fuller Ryujin/Celestial Dragon
  choice handling;
- selection revalidation that removes invalid breakthroughs/classes and refunds their costs;
- Human-Chimera hybrid Human stat choices and Human weapon proficiency while still excluding
  Adaptability and the Human +100 EXP;
- Arachne and repeatable Organized Inventory burden effects;
- stricter named class gates plus explicit Thief and Abjurer ability-based gates;
- merged class expertise and safer forced-stat/class-level choice handling;
- Armorsmith Heart choice between Heavy Armor and Greatshields;
- consumable-only bulk purchase and separate raw-material unit purchase;
- wood/special material routing, elemental armor damage reduction, special weapon infusion,
  Agile Weave, Protective Coating, and Nio Stoneskin handling;
- Pixie's exact -2 Toughness/+2 Agility adjustment without double application;
- mute state, broader sheet display fixes, Mixed House export, and safer CCS artisan rows.

## Comparison against Beta 2.20

| Area | Beta 2.20 result | Disposition |
|---|---|---|
| Official rules version | Bundled/default rules remain 0.13.1 | Correct; no data-version bump needed |
| Bard / Mist Veil / FLE / Aurora / Flash / Daionmyoji | Explicit gates implemented and tested; FLE also grants +10 Perception (Illusion) | Keep |
| Thief and Abjurer gates | Generic evaluator supports learned abilities, damaging spells, OR clauses, Rabbitfolk, and class mastery; Abjurer cascade has browser coverage | Add one dedicated Thief end-to-end regression before calling this closed |
| Acolyte / channeling / Gauntlets | Acolyte selects a common group or Wands/Staves; channeling grants and Gauntlet-from-Unarmed projection are implemented | Keep |
| Armorsmith Heart | Heavy Armor/Greatshields choice already exists | Keep; add focused regression when class-choice tests are expanded |
| Race skills / Demon clan skill | Explicit pools and Demon any-skill behavior implemented | Keep |
| Pixie | Current rules test shows -2 Toughness and +2 Agility auto-applied | Treat as implemented; retain a focused no-double-apply regression |
| Level-up preservation | Normalized class progress survives legacy keys and race/lineage changes | Partial: preservation works, but general invalid-class cascade/refund does not |
| Mixed House | Only a free-text second-house note | Must port structured two-house state and all downstream effects |
| Elemental Mastery | Ryujin choice and some mastery text handling exist | Must port Sorcerer start/L8 and complete Celestial Dragon/Ryujin lifecycle |
| Human-Chimera hybrid | Correctly removes Human +100 EXP and Adaptability | Missing official Human stat-choice and weapon-proficiency grants |
| Arachne / Organized Inventory | No rules implementation found | Must port exact burden/Extra Arms behavior |
| Invalid selection refunds | Ineligible breakthroughs are pruned | Missing full class cascade and complete EXP/IP refund accounting |
| Available breakthrough filter | Race/ancestry mismatches are hidden; other unmet choices remain visible and locked | UX mismatch, not a rules error; add an Available-only toggle defaulted on |
| Item quantities | Every catalog item with an id is currently stackable | Correctness bug: restrict quantity to official consumable categories; keep raw units separate |
| Mods/material effects | Crafting/material groundwork exists | Missing the current official tier catalog and complete combat/sheet effects |
| Agile Weave / Protective Coating / Nio Stoneskin | No complete tracked implementation found | Port with equipment-derived-stat regressions |
| Transmuter / Alkahest disciplines | Only ordinary proficiency choice exists | Still missing the separate maximum-two discipline model |
| Mute | No mute control; Beta 2.20 does play dice sounds | Add a persistent dice mute. Official voice-specific behavior does not otherwise apply |
| One-click token image | Not implemented | Valuable for VTT workflow, but secondary to correctness and live Roll20 validation |
| Short-height equipment / racial Battle Mode | Implemented and browser-tested | Keep |
| CCS | Expanded map, 136 inventory rows, proficiencies and ability tables exist; artisan output is already constrained to the expected block | Recheck one current export in Google Sheets; add Mixed House fields after its port |

## VTT and sharing implementation audit

| Platform | What is actually built | Automated status | Live status |
|---|---|---|---|
| Roll20 | Macro copy; optional Tampermonkey/Violentmonkey userscript; connection state; sends; ack-gated spend; token pin; optional TokenMod bars; optional initiative | 64/64 focused checks plus mocked browser protocol paths pass | Not physically verified; do not call release-ready |
| Owlbear Rodeo | Manifest and popover; local BroadcastChannel relay; OBR room broadcast/display | Manifest/source-shape tests pass | Architecture at risk from storage partitioning; no real-room pass |
| Foundry VTT | Experimental module with `/asimport`, `/ascharacter`, `/asroll`; per-user flag only, no Actor writes | Manifest/source parse and guard tests pass | Zip absent, manifest not installable, verified version stale, no Foundry run |
| World Anvil | Plain and BBCode profile copy | Formatter tests pass | Copy/paste only; no API or live synchronization |
| Official Clio vault | `.aschar.json` export/import | Round-trip tests pass | Previously passed against live vault; repeat after major ports |
| CCS spreadsheet | Patched official workbook export | Workbook structure and downloaded-file cell/style checks passed previously | Google Drive/Sheets formula revival still needs an account test |

### Roll20 connection risks

1. The userscript depends on `#textchat-input`, its textarea/button structure, and private
   `d20.engine` / `d20.Campaign` objects. Roll20 can change these without notice.
2. `ok:true` currently means the bridge found the input and clicked the button. It does not
   observe a resulting chat message. Ack-gated local spending is therefore one step more
   optimistic than its label implies.
3. Userscript storage is persistent. The latest heartbeat, macro payload, acknowledgement,
   and token query remain in `GM_*` storage until overwritten or the script is removed. The
   header statement “Stores nothing” is inaccurate and should be replaced with an exact
   disclosure plus explicit cleanup/expiry.
4. TokenMod requires the game owner to have the appropriate Roll20 subscription and install
   the Mod. Bar 4 also requires the game to expose a fourth token bar.
5. Safari/iPhone support should not be promised. This is a desktop userscript workflow unless
   a supported Safari userscript manager is selected and physically verified.
6. There is no Roll20-to-builder chat-result import. “Back and forth” currently means status,
   acknowledgements, token selection, and optional resource/initiative output—not incoming
   roll results or reverse resource synchronization.

### Owlbear connection risks

The public sheet is a top-level GitHub Pages tab while the Owlbear panel is a GitHub Pages
iframe under an Owlbear top-level site. Modern Firefox and Chromium storage partitioning can
key BroadcastChannel/state by the top-level site, preventing those contexts from seeing each
other. The current unit test only confirms channel names and source shape; it cannot exercise
that partition boundary.

The panel also imports the Owlbear SDK dynamically from third-party CDNs and does not await
`OBR.broadcast.sendMessage`, so asynchronous send failures escape the surrounding `try/catch`.
Remote rolls render in the Owlbear panel but are not applied back to the main builder state.

Recommended design: make the builder/roll controls run inside the Owlbear extension context,
or import a character into the extension panel and initiate rolls there. Bundle and pin the
official SDK instead of loading it dynamically. A separate public sheet tab should not be the
only source of live events.

### Foundry connection risks

- `foundry/angel-sword-lyrian.zip` does not exist although `module.json` advertises it.
- The manifest says `verified: 12`; Foundry 14 is current stable. Version 14 must be the first
  compatibility target, with 13/12 treated as optional back-compatibility.
- The legacy `Dialog` class is deprecated since Foundry 13 (still present in 14); migrate to
  `foundry.applications.api.DialogV2` before the legacy removal window.
- The module is manual import plus chat commands, not a live connection to the open web sheet,
  not Actor synchronization, and not reverse sync.
- Import accepts arbitrary JSON without a strict Angel Sword schema/version rejection path.

### World Anvil boundary

World Anvil is a publishing/worldbuilding service, not a VTT connection in this build. Copying
plain text or BBCode is useful and safe. Direct publishing would require user authorization and
careful token storage; credentials must not be embedded in GitHub Pages or exported characters.

## Required physical test procedures

### Roll20 — release blocker

Preconditions: deploy the exact reviewed Beta 2.20 commit over HTTPS; install the reviewed
userscript in Tampermonkey; use a disposable Roll20 game and test character.

1. Open Beta 2.20 and one Roll20 game. Confirm the hub progresses from Bridge not installed
   (before installation), to Roll20 not open, to Connected.
2. Copy a character macro and paste it manually. Then use Send to Roll20 and compare the two
   rendered messages exactly.
3. Send a paid action. Confirm one chat message and exactly one local resource deduction.
4. Close the Roll20 tab, repeat the paid action, and confirm no resource is spent. Repeat with
   the Roll20 chat panel unavailable and with the userscript disabled.
5. Simulate a slow/failed send (offline or blocked tab). Confirm timeout and no spend.
6. Select a token, pin it, reload both tabs, and confirm the same token remains pinned.
7. In a game with TokenMod installed, enable four token bars, opt into sync, and verify HP,
   Mana, RP, and Shield values plus maxima on only the pinned token. Change each resource once.
8. Opt into initiative, roll twice, and confirm the token is added then updated—not duplicated.
9. Open two Roll20 game tabs and send once. Confirm exactly one tab posts it.
10. Repeat the base send/no-spend tests in Chrome, Edge, Firefox, Brave with Shields on/off,
    and Violentmonkey. Treat Safari as unsupported until separately proven.

Record the Roll20 DOM selectors and console errors with each failure. A visible Roll20 chat
message—not merely the builder's Sent status—is the pass criterion.

### Owlbear Rodeo — architecture validation, not release certification

1. Deploy the exact manifest, panel, icon, and builder under the same HTTPS release.
2. Add the deployed `owlbear/manifest.json` URL to a disposable Owlbear room.
3. Open the popover and confirm `Room connected` with no CSP/module-import errors.
4. Keep the public builder open as a separate tab and roll from the sheet.
5. Verify whether the popover receives the roll in Chrome and Firefox. If it does not, capture
   storage-partition/console evidence; that confirms the expected architecture failure.
6. Join with a second account/browser profile and test room broadcast in both directions.
7. Confirm remote data remains below Owlbear's 16 KB broadcast limit and contains no private
   character notes.

Do not publish the current Owlbear adapter on a single successful browser result. Rework it so
rolls originate inside the extension context, then repeat the two-account test in Chromium,
Firefox, and Safari.

### Foundry VTT — package and compatibility test

1. Update the module for Foundry 14, build a zip whose root contains `module.json` and
   `scripts/`, and deploy it at the manifest's exact `download` URL.
2. In Foundry 14, install using the public manifest URL and enable it in a disposable world.
3. Run `/asimport` with a valid builder export and reject malformed/wrong-version JSON.
4. Run `/ascharacter` and every named `/asroll` command; compare bonuses to the builder.
5. Test a negative modifier and a raw formula. Confirm chat flavor and dice totals.
6. Compare Actors, Items, and world data before/after; only the current user's module flag and
   chat messages may change.
7. Join as a second user and confirm imports are user-specific and do not overwrite each other.
8. Disable/uninstall/reinstall the module and confirm the world remains intact.
9. Repeat on Foundry 13 only if that version will be advertised. Set manifest compatibility to
   versions actually tested, not assumed.

### World Anvil

1. Create a disposable draft article/profile.
2. Copy both plain and BBCode versions; paste and preview them.
3. Verify names containing `&`, `<`, `>`, brackets, apostrophes, and non-ASCII characters.
4. Verify no `undefined`, broken tags, private notes, or credentials appear.
5. Confirm the UI says Copy/Open, never Connected or Synced.

### Official Clio and CCS interoperability

1. Export a complex character after the next rules ports: Mixed House, repeated breakthroughs,
   expertise, multiple classes, equipment quantities/mods, and special characters in the name.
2. Import `.aschar.json` into the current official vault and compare every supported field.
3. Export CCS, upload it to Google Drive, open as Google Sheets, and confirm formulas revive.
4. Check Core, Abilities, Breakthrough, Inventory, proficiency, artisan, and injury regions.
5. Verify that unsupported data produces a visible note instead of silently disappearing.

## Fresh automated test record

On 2026-08-04, before any new correctness ports:

- `npm.cmd run test:roll20` — **64/64 passed**.
- `npm.cmd run test:vtt` — **55/55 passed**.
- `npm.cmd run test:community` — **passed**.
- `npm.cmd run test:rules0131` — **passed**.
- `npm.cmd run audit:minmax` — **passed**.
- `npm.cmd test` — **passed** with `[TEST SUCCESS]` in Chromium, Firefox, and WebKit at
  wide, desktop, and 390x844 mobile viewports. It retained the 28 Quick Build packages,
  705 class progressions, 19,186 class-availability states, and 25 proficiency grants.

These gates prove internal consistency and simulated browser behavior. They do not install a
userscript, enter a real Roll20/Owlbear room, or start Foundry.

The test server still announces the visible/package identity as Beta 2.13. That is intentional
for this unshipped development tree, but the identity must be changed consistently when the
owner approves Beta 2.20 for release.

## Recommended implementation order

1. Correct rules/creation state: Mixed House; Elemental Mastery; Human-Chimera; Arachne and
   Organized Inventory; invalid class cascade/refunds.
2. Correct purchasing/equipment: consumable-only quantities, current mod tiers/materials,
   Agile Weave/Protective Coating/Nio Stoneskin, then Transmuter/Alkahest disciplines.
3. Add persistent dice mute and current-export regressions.
4. Physically validate Roll20 and harden acknowledgement/storage disclosure before release.
5. Redesign Owlbear around an in-extension sheet/import flow.
6. Package and migrate Foundry for v14, then physically test it.
7. Re-run current official-vault and Google Sheets interoperability after the rules ports.

Do not modify Beta 3.0, do not deploy Beta 2.20, and do not describe any VTT adapter as live
until the matching physical checklist passes.
