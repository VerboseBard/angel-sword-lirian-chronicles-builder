# Angel Sword Character Builder - Standard Build Handoff

This is the maintenance handoff for the standard bundled Lyrian Chronicles character builder and live character sheet. Give this file to a developer or coding assistant that has permission to work in the project folder.

The current release is Beta 2.13. Its newest bundled rules version is 0.13.1. Fresh browser storage must select 0.13.1 automatically; older rules versions must load only when a player explicitly chooses one from the version dropdown.

## Read First

Read these files before changing behavior:

```text
STANDARD_HANDOFF_README.md
BETA_2.13_RELEASE_NOTES.md
docs/BETA_2.13_FULL_BUILD_AUDIT.md
docs/rules-logic-map.md
docs/state-and-data-contract.md
docs/test-behavior-map.md
docs/known-risks-and-questions.md
```

For focused work, also use:

```text
docs/combat-access-crafting-audit.md
docs/dice-system-map.md
docs/dice-rendering-contract.md
docs/RULES_0.13.0_TO_0.13.1_AUDIT.md
```

Historical release notes explain why several unusual behaviors exist. Do not remove an odd-looking rule path until its tests and source text have been checked.

## Run And Test

From this folder:

```powershell
npm install
npm start
```

Open the local address printed by the server.

Before handing off any functional change, run:

```powershell
npm test
npm run test:rules0131
npm run audit:minmax
```

`npm test` rebuilds `assets/app.bundle.js` and exercises Chromium, Firefox, WebKit, mobile layouts, direct-file startup, version switching, custom builds, Quick Builds, live-play systems, and import/export behavior.

The production bundle is minified with a source map and is built for `es2020,safari15`. The build then runs `scripts/check-bundle-compat.mjs`, which specifically fails if a regex lookbehind reaches the bundle — Safari only parses lookbehind from 16.4, and one literal white-screens the whole app on older iPhones. Use `splitSentences` in `src/js/utils.js` instead of lookbehind splits. This guard covers that known syntax hazard; it is not a complete browser-compatibility polyfill or a substitute for the Chromium, Firefox, WebKit, branded-browser, and physical-device checks below.

## Runtime And Publishing Model

The published site is static. The deployment workflow copies:

```text
index.html
manifest.webmanifest
assets/
src/css/main.css
```

The workflow is `.github/workflows/deploy-pages.yml`. Pushing or dispatching that workflow publishes the prepared files. Players do not download rules packages from inside the builder.

The rules-version dropdown is still required. It reads prebuilt entries from:

```text
assets/versions/manifest.js
assets/versions/manifest.json
assets/versions/<version>/lyrian-data.js
assets/versions/<version>/lyrian-detail-data.js
```

Do not restore a browser-side update checker or downloader. New rules arrive through the data preparation and publishing process described below.

## Pulling New Official Data

Always work in a copied/new build folder for a new builder release. Preserve the previous release folder as a rollback and comparison reference.

Use an explicit rules version so the pull cannot silently select a different release:

```powershell
node scripts/pull-angels-sword-data.js 0.13.1
node scripts/build-version-assets.mjs 0.13.1
```

Replace `0.13.1` with the intended official rules version.

The pull writes source archives under:

```text
data/angelssword/raw/
data/angelssword/decoded/
data/angelssword/joined/
data/angelssword/manifest.json
```

The asset builder writes the matching browser bundles and updates both version manifests. It also sets `latestKnownVersion` and `defaultVersion` to the built version. Confirm that it did not remove older manifest entries.

After building a new default version, also update the two static `<script defer src="assets/versions/<version>/lyrian-data.js">` and `lyrian-detail-data.js` tags in `index.html` to that version. The page must statically load the same version the manifest defaults to; otherwise every first visit parses one full rules set and then immediately downloads and parses a second one.

The source archives are evidence, not automatically trusted game logic. A successful pull only proves that data was retrieved and transformed; it does not prove that the builder interprets every new rule correctly.

## Required New-Version Audit

For every rules update:

1. Compare the previous and new raw, decoded, and joined collections.
2. Review added, removed, and changed races, ancestries, classes, abilities, breakthroughs, items, keywords, requirements, costs, and granted choices.
3. Cross-reference patch notes against the live detail records. Record contradictions instead of silently rewriting official text.
4. Check class prerequisite chains, free class grants, mastery shortcuts, elemental access, expertise alternatives, proficiency wording, and zero-cost grants.
5. Check whether new perks, breakthroughs, gear, or race traits stack with existing unlock routes.
6. Review Quick Builds whenever a rules change affects starting choices, costs, prerequisites, starting equipment, or free grants.
7. Add focused regression coverage for every discovered interaction or correction.
8. Run the complete test and audit commands.
9. Test fresh storage, explicit older-version selection, reload persistence, and switching back to the newest version.
10. Update the release notes and full-build audit before publishing.

The existing 0.13.0-to-0.13.1 field audit and Beta 2.13 full-build audit are the model for this work.

## Important Code Areas

```text
src/js/main.js       startup
src/js/state.js      character and interface state
src/js/rules.js      lookups, prerequisites, derived values, version selection
src/js/ui.js         guided builder, Quick Builds, play sheet, many choice rules
src/js/io.js         browser saves, JSON, PDF, and spreadsheet round trips
src/js/dice.js       dice runtime and dice packs
src/js/constants.js  fixed budgets, labels, limits, and option sets
src/css/main.css     responsive layout and presentation
```

Quick Build species and packages currently live near `QUICK_BUILD_SPECIES` and `QUICK_BUILD_ROLES` in `src/js/ui.js`. A Quick Build is not complete unless its class progression, perks, breakthroughs, proficiencies, gear, quantities, costs, free grants, and review summary all agree.

## Rules That Must Be Preserved

- Support technically legal cascading unlocks, even when they create unusually strong or rare builds.
- Preserve the universal class progression order: key ability, first ability, Skills, second ability, Heart, third ability, Soul, ultimate.
- Preserve alternate expertise routes and named expertise tracking.
- Preserve all configured class-granted weapon, armor, and shield choice prompts.
- Preserve repeatable and stackable breakthrough behavior where the rules permit it.
- Treat temporary HP as non-stacking unless official rules change.
- Keep Standard and Mirane starting rules isolated where their costs or recovery rules differ.
- Keep custom and Quick Build characters on the same underlying rules calculations.
- Do not hide official-data contradictions. Document them and ask for a ruling when the builder cannot resolve them safely.

## Saves And Exports

Browser saves, JSON files, PDFs, and spreadsheets are core product behavior. Preserve:

- stable record identifiers
- selected rules version
- visible spreadsheet values
- hidden round-trip state
- imported final-stat handling
- custom inventory and equipment
- equipped booleans
- current HP/resource synchronization
- older save recovery and newest-version promotion behavior

Do not rename generated record identifiers or state fields casually. Existing characters depend on them.

## Dice And Assets

Dice packs use the manifest and assets under `assets/dice/` and `assets/dice-3d/`. New packs need complete face art or tested fallbacks. Visually check that overlays do not darken or block the sheet.

Item images may be cached while building version assets. Missing remote artwork must degrade safely rather than preventing the rules bundle from building.

## Release Checklist

- The intended builder version is shown consistently in `package.json`, `VERSION.txt`, `index.html`, the workflow name, and release notes.
- The newest rules entry is the manifest default and latest-known version.
- Every older bundled rules entry and its files still exist.
- Fresh storage selects the newest version.
- Every normal page load starts in Advanced Build, even if restored working state previously had Quick Build active.
- Quick Build opens only after explicit player confirmation and exposes Return to Advanced Build on every step.
- Returning from an applied Quick Build preserves its choices for Advanced Build customization.
- An explicitly selected older version survives reload.
- Switching versions refreshes races, classes, details, Quick Builds, and the live sheet without stale data.
- No update-check or download control appears in the interface.
- Advanced Build and Quick Build both work on wide, desktop, and mobile layouts.
- Save/import/export round trips pass.
- The generated `assets/app.bundle.js` is current.
- All tests and audits pass.

## Safe Handoff Rule

Inspect before editing, preserve unrelated owner changes, make the smallest compatible change, add regression coverage, and leave the project in a state that can be run and tested from this folder.
