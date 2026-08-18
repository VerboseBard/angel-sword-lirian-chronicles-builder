# Beta 2.20 Status and Four-Set Dice Audit

Audited: 2026-08-16

## Executive decision

Beta 3.0 is parked. The near-term product should continue from the Beta 2.20 working tree;
no redesign work is required for the current plan.

The four visual dice sets are already integrated into the local Beta 2.20 character sheet:

1. Angel Sword Dice
2. Asari Full Set
3. Leaflit Full Set
4. Rana Full Set

They are not merely loose art files. They are registered, selectable, loaded by the live
character sheet, routed through the shared renderer, and exercised by current browser tests.
No missing fifth step or missing set was found, so this audit did not add duplicate runtime
code. The important qualification is release state: the four-set work exists in the dirty
local working tree and has not been committed or published.

## What is working successfully

### Core builder and rules work

- Human creation EXP, Spirit Core handling, Human-Chimera suppression, and Slow Starter
  stacking are implemented and regression-tested.
- The Clio-proxy developer data pull, current specialty weapon list, Skilled Flier gate,
  expanded skill taxonomy, 15-point skill/expertise caps, and class/key-ability skill grants
  are implemented.
- Community bug-sweep work for requirement wording, race effects, proficiencies, CCS mapping,
  and racial Battle Mode abilities passes its focused suite.
- Quick Build, Advanced Build, mobile sheet flow, four historical rules packages, autosave,
  version isolation, and copied deployment startup remain covered by the deep browser suite.

### Character exchange and VTT groundwork

- `.aschar.json` import/export passed automated round trips and a prior live import into the
  official Clio vault.
- CCS workbook generation, cells, types, and styles are mechanically tested. It is not yet
  semantically release-certified against the newer community Google Sheet formulas.
- Roll20 macro copy and the optional bridge protocol pass 64 focused checks, including mocked
  connection, acknowledgement, token, initiative, and spend ordering paths.
- VTT adapter structure passes 58 checks. World Anvil copy is usable. Owlbear and Foundry are
  still prototypes pending the architecture/package and physical tests listed below.
- The sanitized JesterBaster Foundry CSB reference and read-only mapper pass 15 focused checks.

## Four-set dice integration trace

| Layer | Current Beta 2.20 behavior | Evidence |
| --- | --- | --- |
| Catalog | Exactly four public sets are listed | `assets/dice/dice-pack-manifest.json` and integration assertions |
| Registration | Asari, Leaflit, and Rana load before the app bundle; Angel Sword is built in | `promoted-dice-skins.registry.js`, `index.html`, `src/js/constants.js` |
| Shapes | Every set contains D4, D6, D8, D10, D100, D12, and D20; promoted sets contain 70 distinct face textures each | `test:dice-skins` |
| Rendering | All four sets route through the synchronized Workshop geometry and shared renderer | `dice:core:check`, router assertions |
| D4 result model | All four use vertex-read results and the shared physical corner map | rendering contract and topology assertions |
| UI | Four gallery cards, seven shape-specific thumbnails, `Use Dice`, compact tray, and mixed rolls work | `test:followups`, `test:dice-browsers` |
| Browser coverage | Desktop and 390x844 mobile passed in Chrome, Edge, Chromium, Firefox, and WebKit | fresh 2026-08-16 dice matrix |
| Performance design | One shared WebGL canvas renders the queued dice using the scripted fallback path | runtime assertions in every matrix case |

The selected set is part of the persisted play state. The default remains Angel Sword, and
legacy Angel Sword identifiers normalize back to `new-angelsword`.

## Fresh verification record

Passed on 2026-08-16:

- `npm run build`
- `npm run dice:core:check`
- `npm run test:dice-skins`
- `npm run test:dice-browsers`
- `node scripts/test-ui-followups.mjs`
- `node scripts/test-rules-0131.mjs`
- `node scripts/test-community-update.mjs`
- `npm run test:roll20` — 64/64
- `npm run test:vtt` — 58/58
- `npm run test:foundry-csb` — 15/15
- `npm run audit:minmax`
- `npm test` — full success on the unchanged retry

The first `npm test` run had one Firefox-mobile Playwright timeout while waiting for the
Crafting walkthrough button to become stable. The same build passed Firefox mobile in the
dedicated dice matrix and passed the complete unchanged suite immediately afterward. Treat it
as a monitored test-harness flake unless it becomes reproducible.

## What still needs implementation in Beta 2.20

### Rules and creation correctness — highest priority

- Structured Mixed House handling.
- Full Elemental Mastery choice/lifecycle handling for Sorcerer, Ryujin, Celestial Dragon,
  and related invalidation paths.
- Complete Human-Chimera stat/weapon grants.
- Arachne and Organized Inventory burden effects.
- Invalid-class cascade/refund behavior after prerequisites change.
- Consumable-only quantity rules.
- Current item mod/material tiers and combat effects, including Agile Weave, Protective
  Coating, and Nio Stoneskin.
- Separate maximum-two Transmuter/Alkahest discipline values.
- Creation Job/Train/Other spending after deciding how Train EXP changes displayed Spirit Core.
- The confirmed Mirane mod-timing rule when the owner is ready to bring that later item forward.

### Product hardening

- Add a persistent dice mute control. This is the only identified missing core dice feature;
  it is not a missing visual set.
- Reconcile CCS export with the current community sheet/template as one template-and-mapper
  update, with Pixie/Fae/Chimera, Mirane, Spirit Core, class-row, and formula regressions.
- Decide the final Beta 2.20 release scope, clean the dirty worktree deliberately, then change
  package/UI/version identity from Beta 2.13 to Beta 2.20 as one release operation.
- Replace the soft 512px PWA icon when a true high-resolution source becomes available.

## What still needs physical or account-backed testing

- Real iPhone/iPad Safari and macOS Safari; Playwright WebKit is useful but not certification.
- Representative low- and mid-range Android phones, Firefox Android, and touch/GPU/memory load.
- Brave with Shields on and off. Brave is not installed on this machine; Chromium proxy passed.
- Native Roll20 community-sheet development in a Pro test game: validate the
  paste-once importer, mapped totals, native roll buttons, persisted resources,
  overwrite confirmation, and player use in Chrome, Edge, Firefox, and Safari.
  The old browser-userscript bridge is no longer a player-facing release path.
- Owlbear in a real two-account room, followed by the expected storage-partition-safe redesign.
- A packaged Foundry 14 + CSB 6.0.2 clean-world install, template binding, schema rejection,
  multi-user isolation, and uninstall/reinstall behavior.
- CCS upload to Google Drive/Sheets with current formulas revived and all supported regions
  compared against a complex character.
- Repeat official Clio vault interoperability after the remaining major rules/equipment ports.

## Recommended next sequence

1. Freeze Beta 3.0 and keep all implementation in Beta 2.20.
2. Complete the rules/creation correctness list before adding new integration scope.
3. Correct item quantities, mods/material effects, and Transmuter/Alkahest disciplines.
4. Reconcile the current CCS template and add dice mute.
5. Run the full automated gate again, then perform physical phone/Brave/Safari and Roll20 tests.
6. Treat Owlbear redesign and Foundry packaging as later adapter tracks, not blockers for the
   core builder unless they are explicitly included in the Beta 2.20 release promise.
7. Only after scope approval: clean/commit, update the visible version identity, and publish.
