# Beta 2.13 Public Release Notes

Beta 2.13 updates the reviewed Beta 2.11 public/mobile build to the official Lyrian Chronicles 0.13.1 rules published by Angel's Sword Studios.

For the complete cumulative upgrade from Beta 2.1, including the 2.11 mobile hotpatch and all Beta 2.13 corrections, see `BETA_2.13_PATCH_NOTES_FROM_2.1.md`.

## Official content update

- Added rules version 0.13.1 as the local default while preserving 0.12.5, 0.12.6, and 0.13.0 for older saves.
- Added Seven Sorrows Sword Style, a tier-2 striker class, with its key ability and four class abilities.
- Added Divine's Chosen, including a required Divine selector and the correct damage/mastery mapping for all nine published Divines.
- Added the Divine and Isolated keywords.
- Included every official 0.13.1 race, class, breakthrough, ability, item, keyword, rulebook, and settings-guide record from the official rules source.

## Rules-engine compatibility

- Recognizes the new “start with the [name] class unlocked and at level 1” wording used by Demon clans, Raijin, Gnome, and Selkie.
- Granted level-1 classes cost 0 EXP and 0 Interlude Points while still granting the class key ability.
- Preserves the older 0-EXP-only behavior for earlier rules versions where the text still requires an Interlude Point.
- A mastered Acolyte receives the elemental mastery tied to Divine's Chosen; a Human Acolyte without that breakthrough receives Holy mastery.
- Updated Quick Build explanations to match the new granted-class language.

## Quick Build 0.13.1 follow-up

- Renamed the full 10-step creator Advanced Build and made it the default on every normal page load, including when older browser state recorded Quick Build as active.
- Added **Return to Advanced Build** to every Quick Build step. Applied package choices are preserved for advanced customization; an early return opens the first Advanced Build step.
- Kept Standard Play as the campaign-rules option so it cannot be confused with the Advanced Build interface.
- Expanded the Quick Build species list from 18 to 21 with Gnome, Raijin, and Selkie.
- Their free Miner, Flash Star Blade Style, and level-2 Hydromancer classes are added without consuming the three paid class slots.
- Added Seven Sorrows Rush and Bard Expertise Rush as clearly labeled high-acceleration packages.
- Seven Sorrows Rush purchases five distinct Fighter weapon proficiencies, including Katana, and equips its two-handed Katana; Bard Expertise Rush records its Singing expertise conversion and equips its light armor and small weapon.
- Nonhuman Quick Builds containing Acolyte now add the zero-EXP Divine's Chosen breakthrough and default to Kari; the choice remains editable.
- Corrected Cleric Support to choose Magic Staff proficiency for its equipped staff.
- Corrected Quick Build auto-equip detection so shields and channeling weapons such as staves are equipped rather than only purchased.
- Expanded the cross-browser package audit from 24 to 28 Standard/Mirane package checks.

## Full build audit follow-up

- Normalized singular and plural proficiency labels, so the official Seven Sorrows “Katanas” requirement accepts the builder's tracked “Katana” proficiency.
- Fixed runtime version switching so every dropdown change rebuilds the character sheet without a stale class catalog or JavaScript reference error.
- Expanded the play-sheet Proficiencies panel to include race, ancestry, class, breakthrough, resolved choice, and elemental-mastery sources from the builder handoff.
- Corrected Quick Build racial skill allocation for Fae, Youkai, and every other nonhuman race that receives the general five-point racial skill pool.
- Changing a Quick Build species now clears the previous package immediately, updates the preview identity, and requires a fresh role selection.
- Added regression coverage for fresh-version defaults, all legacy-version class counts, Seven Sorrows version isolation, latest-version persistence, proficiency handoff, racial skill spending, and Quick Build species changes.
- Recorded the completed hands-on and automated results in `docs/BETA_2.13_FULL_BUILD_AUDIT.md`.

## Update and audit tooling

- Removed the obsolete browser-side rules update checker, downloader, local updater routes, and updater wrapper. Rules releases now arrive only through published data/deployments.
- Kept the developer-side pull and version-asset build scripts for preparing bundled releases and historical versions.
- Added `scripts/package.json` so the existing CommonJS data puller runs correctly inside the ESM project.
- Added `scripts/audit-rules-version-diff.mjs` and `docs/RULES_0.13.0_TO_0.13.1_AUDIT.md` for a field-by-field official-data comparison.
- Updated the min-max audit to recognize the new granted-class sentence form.

## Beta 2.13 performance and compatibility patch

- Removed the three regex lookbehind splits that prevented the whole bundle from parsing on Safari/iOS older than 16.4 (white screen on iPhone 7-era devices). `splitSentences` in `src/js/utils.js` is the drop-in replacement, the esbuild target now includes `safari15`, and `scripts/check-bundle-compat.mjs` fails the build if lookbehind ever reaches the bundle again.
- `index.html` now statically loads the manifest-default rules version (0.13.1). First visits previously parsed 0.13.0 (~3.2 MB) and then downloaded and parsed 0.13.1 (~3.3 MB) on top.
- Removed the `Date.now()` cache-buster from dynamic script loading, so version files at immutable per-version paths are eligible for normal browser caching and revalidation instead of being forced to re-download on every visit.
- Added an in-session registry of loaded rules versions: switching the version dropdown back to an already-loaded version reuses the parsed data with zero network requests.
- Typing in a character-sheet field no longer rebuilds the entire play dashboard per keystroke (previously 140-200 ms each on desktop); the derived-stat sync, rerender, and autosave now run once shortly after typing pauses. Name fields use the same deferred path, and every sheet edit advances the revision key so race, ancestry, class, and equipment bonus caches cannot remain stale. Using an ability renders the dashboard once instead of twice.
- Pending sheet edits and player notes are now synchronously folded into the final browser save when the page closes or becomes hidden, removing the debounce-window data-loss edge on tab close and mobile app switching.
- The builder remains a usable sidebar-plus-content layout at the common 1280 px desktop width and stacks below 900 px; the cross-browser suite now enforces that breakpoint in Chromium, Firefox, and WebKit.
- The production bundle is minified with a source map: 1,184 KB to 659 KB before compression.
- The hidden print-style sheet stack (738 generated elements in the current form map) is built after first paint instead of during startup.
- Re-encoded the homepage castle and logo backgrounds as WebP (1,839 KB to 138 KB combined), added `loading="lazy"` and `decoding="async"` to all browse-grid card art, added 192x192 and 512x512 PWA icons, and added the one missing `-webkit-backdrop-filter` for Safari 17 and older.
- Measured result: first-load decoded payload dropped from 9.6 MB to 4.3 MB. Later visits are no longer forced onto unique cache-busted rules URLs; actual transfer size still depends on the hosting cache policy and browser revalidation.

## Source inconsistency retained

The 0.13.1 patch notes say Selkie's Aqua Drill and Water Mastery were removed and replaced by Blue Soul. The live ancestry detail correctly replaces the third trait with Blue Soul, but the first Selkie trait still contains a sentence referring to Aqua Drill. Beta 2.12 preserves that official text and records the discrepancy rather than silently inventing a correction.
