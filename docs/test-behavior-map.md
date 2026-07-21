# Test Behavior Map

This document explains how to use the test suite as behavior documentation.

## Main Test Command

```powershell
npm test
```

This runs:

```powershell
npm run build
node scripts/test-cross-browser.mjs
```

The build command rebundles:

```text
assets/app.bundle.js
```

The Playwright test runs browser checks in:

- Chromium
- Firefox
- WebKit

It also checks direct file startup from a deployment-like copy.

## Main Test File

```text
scripts/test-cross-browser.mjs
```

This file is long, but it is one of the best maps of expected behavior.

## Behavior Covered

The test suite includes checks for:

- direct file startup
- version selector startup
- latest-version default and cached historical-version round trips
- absence of the retired browser update controls and local version-download routes
- builder build label
- 2.12.1 sheet-edit bonus-cache invalidation, debounced browser autosave, and pending sheet/notes flushes on unload or hidden-page transitions
- lazy/async primary browse-grid images and deferred print-sheet construction
- side-by-side builder/sidebar layout at the 1280 px desktop breakpoint in Chromium, Firefox, and WebKit
- bundled static-data startup
- expertise source UI
- named expertise
- expertise display on the play sheet
- expertise roll behavior
- health tracker behavior
- stale HP sync behavior
- spreadsheet visible-grid import behavior
- spreadsheet export round-trip behavior
- Roland-style workbook import behavior
- Masaru-style workbook import/export behavior
- class requirement unlocks
- 21 Quick Build species, including Gnome, Raijin, and Selkie free-class grants
- 14 Quick Build packages in both Standard and Mirane starts
- Bard Expertise Rush creation-expertise allocation
- nonhuman Acolyte Quick Builds adding Divine's Chosen and Kari automatically
- generic class mastery unlocks
- Elemental Affinity repeatability
- elemental mastery class unlocks
- key ability elemental unlocks
- chosen class elemental mastery unlocks
- ancestry trait elemental mastery unlocks
- Language Training and Weapon Training repeatable unique choices
- stackable Skill Training
- ability reference details
- Spiritual Sync use behavior
- fighter variable-cost ability buttons
- AP recovery
- inventory use
- food benefit lockout
- Shielding Potion tracking
- Hydromancer AP/RP choice buttons
- equipment inspect-only behavior
- equipment plus/minus controls
- equipment quantity behavior
- generated material cards
- generated material quantities
- builder review equipment summary layout
- wide dashboard layout
- missing resources
- console errors

## Recent Fixture Coverage

The workbook regression path now checks the kinds of issues found in real imported sheets:

- visible final HP and health tracker sync
- visible Mana/RP/defense imports
- blank ancestry and placeholder class rows
- visible spreadsheet skill row order
- custom equipment and Block modifiers
- Youkai/Oni lineage and breakthrough imports
- exported custom inventory rows
- exported equipped armor booleans
- hidden spreadsheet metadata

## How To Use Tests When Porting

If another interface wants to reuse this project:

1. Read the relevant test block.
2. Recreate the same character setup in the new system.
3. Confirm the same result happens.
4. Port or rewrite the test in the new test framework.

## How To Add New Tests

When adding a new rules fix:

1. Create a small character setup that triggers the rule.
2. Assert the visible UI result or internal state result.
3. Include enough failure detail in the thrown error to explain what broke.
4. Run `npm test`.
5. Review screenshots in:

```text
qa-test-results/
```

## Important Warning

The tests are not a complete official rules engine. They document the issues we have already found and fixed. Future rule discoveries should become new test cases.
