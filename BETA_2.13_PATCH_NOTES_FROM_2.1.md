# Beta 2.13 Cumulative Patch Update from Beta 2.1

This document summarizes everything players, testers, and maintainers receive when upgrading the Angel Sword Lyrian Chronicles Character Builder from Beta 2.1 to Beta 2.13.

Beta 2.13 is a compatible replacement for Beta 2.1. The public website address, GitHub Pages deployment path, browser save keys, shared Build Lab link format, and JSON/PDF/spreadsheet character formats remain unchanged. Existing characters and explicitly selected older rules versions remain supported.

## Highlights

- Updated the bundled official Lyrian Chronicles rules from 0.13.0 to 0.13.1 while preserving 0.12.5, 0.12.6, and 0.13.0 in the version dropdown.
- Added Seven Sorrows Sword Style, Divine's Chosen, the Divine and Isolated keywords, and the associated official class, ability, race, breakthrough, item, rulebook, and settings changes.
- Expanded Quick Build from 12 to 14 optimized packages and from 18 to 21 species choices.
- Added Gnome, Raijin, and Selkie Quick Build support, including their free starting classes and correct level, EXP, and Interlude Point treatment.
- Named the full 10-step creator Advanced Build, made it the default on every normal page load, and added a return path from every Quick Build step.
- Added major mobile, Safari, startup, caching, rendering, and desktop-layout improvements.
- Removed the obsolete in-browser rules update checker because published deployments now deliver updates automatically.
- Expanded automated coverage for all four rules versions, every race/ancestry path, Quick Builds, class progressions, and desktop/mobile browser layouts.

## Official rules update: 0.13.0 to 0.13.1

Fresh browser storage now starts on rules version 0.13.1. Players may still select 0.13.0, 0.12.6, or 0.12.5, and an explicit older-version choice persists after reloading.

The 0.13.1 data update includes:

- Seven Sorrows Sword Style as a new tier-2 striker class, with its key ability and four class abilities.
- Divine's Chosen as a zero-EXP breakthrough with a required choice among all nine published Divines.
- Correct Divine damage-type and elemental-mastery mapping when Acolyte is mastered.
- The new Divine and Isolated keywords.
- Updated official requirements, descriptions, race traits, abilities, items, rulebook text, and setting-guide content from the official rules source.
- Singular/plural proficiency matching needed for official wording such as Seven Sorrows' Katanas requirement and the builder's Katana proficiency.

The builder now distinguishes between the new wording that grants a class already unlocked at a stated level and older wording that merely reduces an unlock to 0 EXP. A class granted at level 1 consumes neither EXP nor an Interlude Point; earlier rules versions retain their original accounting.

## Quick Build expansion and corrections

Beta 2.1 included 12 optimized packages and 18 species choices. Beta 2.13 includes 14 packages and 21 species choices.

New species support:

- Gnome begins with Miner unlocked at level 1 for 0 EXP and 0 Interlude Points.
- Raijin begins with Flash Star Blade Style unlocked at level 1 for 0 EXP and 0 Interlude Points.
- Selkie begins with Hydromancer unlocked at level 2 for 0 EXP and 0 Interlude Points.

These granted classes supplement the paid class plan instead of consuming one of its three normal class slots.

New high-acceleration packages:

- Seven Sorrows Rush uses Fighter proficiencies to reach Seven Sorrows Sword Style immediately, selects Katana correctly, and equips its two-handed Katana.
- Bard Expertise Rush records the Singing expertise conversion used to accelerate Bard and equips its intended light armor and small weapon.

Additional Quick Build fixes and safeguards:

- Advanced Build is the startup default for both fresh and restored browser sessions. Quick Build opens only after the player deliberately selects and confirms it.
- Every Quick Build step includes a **Return to Advanced Build** control. Returning early opens the first Advanced Build step; returning after a package is applied preserves the generated choices and opens Advanced Build review for customization.
- Standard Play remains the campaign-rules choice and is not used as the name of the full character builder.
- Nonhuman Acolyte packages include Divine's Chosen and an editable default Divine selection.
- Cleric Support selects Magic Staff proficiency for its equipped staff.
- Shields, staves, channeling weapons, armor, kits, tools, and storage are correctly auto-equipped when appropriate; consumables remain carried.
- General five-point racial skill pools are allocated for Fae, Youkai, and other nonhuman races instead of being limited to special Human or Demon handling.
- Changing species immediately clears the old generated package, updates the identity preview, and requires a new role selection.
- Race-granted classes, breakthroughs, proficiencies, expertise, purchased gear, and class levels are included in package validation.

## Mobile and browser compatibility

The Beta 2.11 portion of this cumulative update introduced the mobile hotpatch:

- PDF, spreadsheet, embedded-export, and 3D dice libraries load only when used instead of blocking startup.
- The duplicate startup rules download was removed.
- Builder steps, character tabs, sheet pages, and Crafting/Gathering navigation wrap inside narrow phone viewports.
- Sticky controls no longer cover content, and the floating dice button stays out of Crafting and Gathering workspaces.
- Current Build cards and primary controls stay within iPhone-width screens.

Beta 2.13 adds further compatibility work:

- Removed JavaScript regex lookbehind that could prevent the entire application from parsing on Safari/iOS versions before 16.4.
- Added an enforced `es2020,safari15` production target and a build guard that rejects bundles containing regex lookbehind.
- Added the missing WebKit backdrop-filter compatibility declaration.
- Kept the builder sidebar and main content side-by-side at the common 1280 px desktop width, while retaining the stacked layout below 900 px.
- Verified Chromium, Firefox, and WebKit at wide, desktop, and phone viewports.

## Performance and saving improvements

- The production JavaScript bundle is minified from approximately 1,184 KB to 659 KB before transfer compression, with a source map retained for debugging.
- The hidden print-sheet structure, currently 738 generated elements, builds after first paint instead of blocking startup.
- The homepage castle and logo were converted from approximately 1.8 MB of PNG data to approximately 138 KB of WebP data.
- Browse-grid artwork uses lazy loading and asynchronous image decoding while immediately needed portrait, detail, and dice images remain eager.
- Version files use stable per-version URLs instead of a `Date.now()` cache-buster, making them eligible for ordinary browser caching and revalidation.
- Rules versions already loaded during a session are reused without another network request when switching back and forth.
- Sheet typing no longer rebuilds the full play dashboard on every keystroke. Derived values, rendering, and autosave run through a short debounce.
- Computed race, ancestry, class, equipment, and bonus caches invalidate correctly after direct sheet edits.
- Pending sheet changes and player notes are flushed into browser storage when the page closes or becomes hidden, covering tab closure and mobile app switching.
- Ability use no longer performs a duplicate dashboard render.

The final first-load performance measurement dropped from 9.6 MB to 4.3 MB decoded. Actual network transfer still depends on hosting cache policy and browser revalidation.

## Version management and update delivery

- The version dropdown now changes rules data without leaving stale classes or throwing a runtime reference error.
- Fresh storage defaults to 0.13.1; an older version loads only after the player explicitly selects it.
- The obsolete Check for Updates and Download New Version controls, client updater wrapper, and local updater routes were removed.
- Published site deployments or a future official backend now own update delivery.
- Developer-side data pulling, version-asset generation, field-by-field rules auditing, and historical-version packaging remain available for future releases.

## Builder and play-sheet corrections

- The Proficiencies panel now includes relevant race, ancestry, class, breakthrough, resolved-choice, and elemental-mastery sources.
- Granted class levels cannot be refunded as if the player purchased them.
- Advanced Build and Quick Build use the same underlying rules calculations. Quick Build choices carry the correct perks, breakthroughs, expertise, proficiencies, class levels, purchases, and equipped state into Advanced Build and the character sheet.
- Name and sheet edits invalidate derived caches while retaining the faster debounced rendering path.
- Autosave behavior now covers both normal pauses in typing and immediate page-close/visibility transitions.

## Maintenance changes

- The public release uses bundled static rules data and does not depend on a separate service.
- The standard-build handoff explains data pulls, version packaging, deployment, state contracts, and known risks.
- Added a repeatable 0.13.0-to-0.13.1 field audit and expanded the min-max cascade audit for race/ancestry class grants and unusual legal unlock paths.
- The GitHub Pages workflow still deploys the same root page and relative asset paths, so publishing Beta 2.13 replaces the existing site without changing its link.

## Compatibility with Beta 2.1 characters

The following contracts remain stable:

- Public website and GitHub Pages path.
- Browser working-character and save-slot keys.
- JSON, PDF, and spreadsheet character import/export formats.
- `#lyrian-build=` shared Build Lab links.
- Relative static asset paths and direct-file startup.
- Existing 0.12.5, 0.12.6, and 0.13.0 rules packages.

Players do not need to recreate Beta 2.1 characters. Exporting a backup before any release upgrade remains recommended.

## Validation completed

The final Beta 2.13 verification passed:

- Chromium, Firefox, and WebKit at wide, 1280 px desktop, and 390 px phone layouts.
- 28 Standard/Mirane Quick Build package checks across the 14 current packages, plus Phoenix and Demon shortcuts.
- 705 rendered class progressions across four bundled rules versions.
- 19,186 class-availability states across 53 race and ancestry paths in both character-start modes.
- 25 selectable proficiency grants across 16 classes.
- Fresh-version defaulting, legacy-version switching, persistence, direct-file startup, saving, and pending-edit flushes.
- The dedicated 0.13.1 rules regression and min-max cascade audit.

For deeper technical detail, see:

- `BETA_2.13_RELEASE_NOTES.md`
- `docs/BETA_2.13_FULL_BUILD_AUDIT.md`
- `docs/RULES_0.13.0_TO_0.13.1_AUDIT.md`
- `docs/test-behavior-map.md`

## Known official-source note

The official 0.13.1 patch notes say Selkie's Aqua Drill and Water Mastery were replaced by Blue Soul. The live official Selkie detail includes Blue Soul but still contains an older Aqua Drill reference in another trait. Beta 2.13 preserves the pulled official text and documents the discrepancy rather than inventing an unofficial correction.
