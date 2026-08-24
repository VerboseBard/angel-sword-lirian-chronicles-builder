# Beta 2.20 Status and Four-Set Dice Audit

Audited: 2026-08-16

Priority corrected: 2026-08-23. For the authoritative current execution order and release
identity, read `BETA_3_OWLBEAR_RELEASE_ROADMAP_2026-08-23.md`. Historical test evidence below
remains valid, but the former Roll20-first and “Owlbear later” recommendations are superseded.

## Executive decision

The former Beta 3.0 redesign is now the separate, parked **Game Interface — Angel Sword
Character Sheet Alpha 1** project. The near-term product continues from this Beta 2.20 working
tree and will become **Angel Sword Character Builder Beta 3** after the Owlbear, builder-
hardening, and official Clio comparison release gates pass. No complete redesign is required.

The four visual dice sets are already integrated into the local Beta 2.20 character sheet:

1. Angel Sword Dice
2. Asari Full Set
3. Leaflit Full Set
4. Rana Full Set

They are not merely loose art files. They are registered, selectable, loaded by the live
character sheet, routed through the shared renderer, and exercised by current browser tests.
No missing fifth step or missing set was found, so this audit did not add duplicate runtime
code. The important qualification is release state: the four-set work is committed on the
development branch but has not been merged or published.

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
- The current VTT/Owlbear suite passes 79 focused checks. Owlbear Companion v0.2 has
  extension-native character import, ownership-aware token binding, test rolls, a deduplicated
  room log, a background page, and deployment packaging. It remains Alpha until a real GM plus
  second-player room and HTTPS staging test pass. Foundry is parked.
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
- The confirmed Mirane mod-timing rule when the owner is ready to bring that later item forward.

### Product hardening

- Add a persistent dice mute control. This is the only identified missing core dice feature;
  it is not a missing visual set.
- Reconcile CCS export with the current community sheet/template as one template-and-mapper
  update, with Pixie/Fae/Chimera, Mirane, Spirit Core, class-row, and formula regressions.
- Complete the Beta 3 release gates, then change package/UI/version identity from the inherited
  Beta 2.13 value to Builder Beta 3 as one owner-approved release operation.
- Replace the soft 512px PWA icon when a true high-resolution source becomes available.

## What still needs physical or account-backed testing

- Real iPhone/iPad Safari and macOS Safari; Playwright WebKit is useful but not certification.
- Representative low- and mid-range Android phones, Firefox Android, and touch/GPU/memory load.
- Brave with Shields on and off. Brave is not installed on this machine; Chromium proxy passed.
- Owlbear in a real two-account room, followed by an unlisted HTTPS staging test from separate
  devices and networks. This is the first physical priority and a Builder Beta 3 blocker.
- CCS upload to Google Drive/Sheets with current formulas revived and all supported regions
  compared against a complex character.
- Repeat official Clio interoperability as a field-by-field comparison after the selected
  rules/equipment ports. Save official exports as automated regression fixtures.
- Roll20 and Foundry physical/package work is parked and is not a Builder Beta 3 blocker.

## Recommended next sequence

1. Keep implementation in this working tree; treat the old redesign as Game Interface Alpha 1.
2. Install and physically test Owlbear with one GM and a second player in a disposable room.
3. Fix Owlbear defects, publish to an unlisted HTTPS staging address, and repeat remotely.
4. Physically harden the four dice sets and sound, then complete the selected rules/interface
   corrections that affect creation, play, or exported character meaning.
5. Run official Clio-to-local and local-to-official field comparisons and preserve fixtures.
6. Run the full automated and physical browser/device gate.
7. Only after owner approval: rename the current builder to Beta 3, merge, and publish.
