# Lyrian Chronicles Character Builder - Beta 1.2 Patch Notes

Scope: cumulative notes for the surviving changes from `Character Builder Angels sword version 3` through `Angel Sword Lirian Chronicles Beta 1.2`.

Version 3 is treated as the baseline. These notes focus on features, fixes, workflows, packaging changes, and support files that still remain in Beta 1.2. Temporary scratch files, QA screenshots, duplicate dice experiments, and removed test-only paths are intentionally left out.

## Version 3 Baseline

Version 3 already included the core standalone application foundation:

- Standalone Windows launcher through `Launch Character Builder.bat`.
- Browser-only fallback launcher.
- Portable Node runtime for Windows.
- Interactive character builder and play sheet.
- Bundled local Lyrian rules versions `0.12.5` and `0.12.6`.
- Rules-version selector and local update checker/downloader.
- Browser save/load support.
- JSON import/export.
- PDF import/export with embedded character data.
- Spreadsheet import/export with embedded character data.
- Official-style PDF template and Google-style spreadsheet template.
- Developer diagnostics through the local scripts folder.

Everything below describes additions or fixes layered on top of that baseline and still present in Beta 1.2.

## Alpha 4 - Builder Flow And Live Sheet Overhaul

- Reworked the guided builder into a clearer step-by-step character creation flow.
- Preserved dedicated steps for primary race/species, ancestry/subspecies, profile, main stats, secondary stats, breakthroughs, classes, skills, equipment, and review.
- Added persistent character identity at the top of the builder.
- Added top Continue controls so users do not need to scroll to the bottom of long steps.
- Added a persistent Reset Character control in the left sidebar.
- Renamed Start Over Character to Reset Character.
- Added a reset confirmation prompt to reduce accidental character wipes.
- Added Continue to Character Sheet access for characters that are ready enough to use the live sheet.
- Added independent left-sidebar scrolling so navigation and save/load/import/export tools remain reachable.
- Improved review-step layout so current build cards are easier to scan.
- Removed visible D&D Beyond wording from user-facing helper text.

## Alpha 4 - Rules And Character Creation Accuracy

- Updated fresh-character default behavior so the app uses the latest local Lyrian rules version unless the user deliberately selects an older version.
- Added standard main-stat array support for `5, 4, 4, 3`.
- Added secondary-stat array support from the character creation reference.
- Added custom-entry modes for GM-approved nonstandard stat values.
- Updated derived-stat handling from the character creation reference, including HP using `20 + Toughness * 5`.
- Added clearer explanatory text for main stats and secondary stats.
- Added Spirit Core explanation during character creation.
- Synced the top character name field with the profile Character Name field.
- Allowed the profile step to continue when optional profile fields are blank.
- Added starting Clim handling.
- Added breakthrough-based Clim bonuses.
- Added selected-equipment cost tracking against starting funds.
- Added remaining Clim display.
- Added a manual Clim override for GM-approved alternate starting funds.
- Added earned Clim and earned EXP tracking on the play sheet.

## Alpha 4 - Race, Ancestry, And Breakthrough Support

- Improved primary race/species and ancestry detail panels.
- Added scroll containment for long race and ancestry descriptions.
- Improved contrast for race bonuses, proficiencies, and feature callouts.
- Added fuller source-backed race ability display, including cost, range, and descriptions where the local data provides them.
- Added Demon clan handling as an ancestry-style choice when Demon is selected.
- Rechecked ancestry/subrace behavior for species that do not have source-backed ancestry options.
- Added race-specific breakthrough gating.
- Added prerequisite messaging for disabled breakthrough options.
- Added breakthrough budget visibility.
- Added selected-state styling for chosen breakthroughs.
- Added deterministic breakthrough effects where the rules text can be safely mapped into sheet fields.
- Added Rich Parents support so its bonus Clim flows into equipment and the sheet.
- Added pending-choice handling for breakthrough effects that require follow-up choices, such as stat, skill, weapon group, language, or expertise selections.
- Added breakthrough artwork placeholders and visual treatment.
- Preserved breakthrough display in the play sheet.

## Alpha 4 - Class, Skill, Equipment, And Inventory Work

- Added class prerequisite handling so locked classes are unavailable when requirements are not met.
- Added prerequisite text for locked class cards.
- Added tier and role grouping/filtering concepts.
- Added selected-class indicators on class cards and selected class chips.
- Added click-to-untake behavior for selected classes.
- Added class detail panel scrolling for long descriptions and guides.
- Added clearer class card summaries where source data supports them.
- Added class EXP and interlude-point foundations.
- Added builder-fed selected class data into the live sheet.
- Reworked skills from unrestricted numeric entry toward a point-spend model.
- Added visible spent/available skill point tracking.
- Added racial skill point support.
- Added class-fed skill totals.
- Added expertise tracking foundations.
- Added rollable skill values on the play sheet.
- Added equipment search and item selection.
- Added readable item cards and item detail panels.
- Added equipment cost tracking against starting Clim.
- Added selected equipment seeding into inventory/combat areas.
- Added item-based attack and armor-derived-stat groundwork.
- Added item burden display and later inventory burden support.

## Alpha 4 - Play Sheet, Combat, Rolling, And Dice Foundation

- Replaced the old page-by-page PDF-style play surface with a compact live play dashboard.
- Added builder-fed identity, race/species, ancestry, class, breakthrough, funds, equipment, and pending-choice reference data.
- Reworked the top sheet area into compact stat/resource cards.
- Added HP heal and damage controls.
- Added AP and RP current/max tracking.
- Added compact derived combat values including Speed, Initiative, Guard, Evasion, Dodge, Block, Potency, and Save.
- Added roll controls for saves, skills, initiative, and attacks.
- Added play workspace tabs for Actions, Abilities, Inventory, Crafting & Gathering, Proficiencies, Breakthroughs, and Notes.
- Reduced redundant manual compendium selection where the builder can feed the live sheet directly.
- Split attack controls so attacks can distinguish Roll Attack from Roll Damage.
- Added Use behavior for non-roll actions such as Move, Double Move, Dodge, and Block.
- Added AP/RP spending behavior for actions where applicable.
- Added damage-roll parsing foundations.
- Added a right-side roll result card with die breakdown and final total.
- Added roll animations for normal sheet rolls and manual dice tray rolls.
- Added a floating dice tray button above the sheet.
- Added dice selection for d20, d12, d100, d10, d8, d6, and d4.
- Added dice set selection infrastructure.
- Added dice set preview images.
- Added dice rolling sound effects.
- Added d100 handling as a percentile die plus a d10 ones die.

## Alpha 4 - Visual And Accessibility Improvements

- Added the Lyrian homepage castle image as sheet background atmosphere.
- Improved dark and light text contrast across cards, forms, funds, equipment, damage, and healing controls.
- Strengthened source-material continuity with darker panels, gold accents, parchment cards, and blue/gold contrast.
- Added scroll containment to long builder panels.
- Cleaned up areas where text blended into backgrounds.

## Alpha 5 - Clean Alpha Checkpoint

- Copied Alpha 4 into Alpha 5 as a cleaner test line, avoiding later Beta 1 and Beta 2 changes that were not wanted in this branch.
- Preserved the Alpha 4 builder, live sheet, rolling, export, and dice behavior.
- Kept the active rules default pointed at the latest local manifest version.
- Preserved the local update-enabled launcher.
- Removed or ignored scratch QA artifacts from the intended release path.
- Continued using the browser sheet as the primary play surface instead of returning to the old filled-PDF workflow.

## Beta 1 - Class Benefits, Progression, And Sheet Depth

- Added fixed class skill grant support.
- Added class-granted stat choice handling, such as `+1 to Focus, Agility, or Toughness`.
- Added class skill pool handling for benefits where the player assigns points into eligible skill options.
- Added support for multiword, crafting, and gathering skills in class benefits.
- Added canonical skill-name handling so aliases and wording differences resolve into sheet skills.
- Added fixed, disabled class benefit fields for auto-assigned grants.
- Added resolved class benefit notes into exported Proficiencies text.
- Verified class benefit parsing across bundled rules versions.
- Preserved breakthrough EXP budget handling and cost checks.
- Improved locked-breakthrough messaging.
- Preserved transfer of breakthrough effects into computed bonuses and sheet fields.
- Preserved EXP and Spirit Core tracking.
- Preserved spending EXP into Spirit Core.
- Added class progression support for purchased class abilities.
- Added controls to learn the next class ability or refund the last purchased class ability.
- Preserved selected class progression display.
- Preserved computed class bonuses flowing into sheet values.

## Beta 1 - Skills, Crafting, Inventory, And Play Sheet Controls

- Preserved editable base skill points.
- Preserved expertise handling.
- Preserved racial and class skill grants in skill rows.
- Preserved computed skill totals.
- Preserved roll buttons for skill checks.
- Preserved automatic derived-stat syncing for HP, AP, RP, Initiative, Dodge, Evasion, Save, Potency, and Speed.
- Preserved language and weapon training selections in Proficiencies output.
- Preserved item browsing and item detail cards.
- Preserved selected equipment cost handling.
- Preserved inventory display and custom inventory entry support.
- Added burden tracking support for carried equipment.
- Added a Crafting & Gathering play panel.
- Added crafting/gathering skill shortcuts.
- Added crafting point tracking.
- Added crafting die rolling.
- Added owned crafting support item display.
- Added transaction controls for health, AP, RP, EXP, Spirit Core, and Clim.
- Added attack and damage roll support for play actions.
- Added support for parsing damage formulas into individual dice parts.

## Beta 1 - Dice Finalization

- Added the real 3D-style dice roller experience used by the Beta line.
- Set Angel Sword Dice as the active selectable dice set.
- Preserved Asari and Leaflit as planned dice choices.
- Added custom Angel Sword face art for core dice types.
- Fixed d10 and d100 face orientation, fit, and texture scaling.
- Fixed d10 and d100 color consistency.
- Fixed d4 rendering so the visible face/top point reads correctly.
- Removed fake circular d4 number overlays.
- Fixed d4 result orientation so the final visible die agrees with the rolled result.
- Preserved percentile roll display.
- Preserved multi-die tray display.
- Added dice tray support for selecting, adding, resetting, and rolling dice.
- Added dice audio, impact, and fade behavior.
- Added dice texture preloading and cache-busting safeguards.
- Added the dice rendering contract in `docs/dice-rendering-contract.md`.

## Beta 1 - Save, Load, Import, Export, And Packaging

- Preserved browser save/load slots.
- Preserved active-slot saving.
- Preserved named new-slot saving.
- Preserved JSON import/export.
- Preserved PDF import/export.
- Preserved spreadsheet import/export.
- Preserved export/import round-trip behavior in diagnostics.
- Preserved character backup guidance for testers.
- Added beta-specific release notes and tester readmes.
- Added `.gitignore` for handoff.
- Kept the standalone Windows runtime.
- Prepared the package for outside testing and GitHub handoff without old scratch diagnostics or QA screenshots.

## Beta 1.1 - Update Reliability

- Copied the Beta 1 checkpoint into Beta 1.1 so Beta 1 remained a clean set point.
- Added dynamic manifest refresh after a successful official rules download.
- Rebuilt the game-version dropdown after a newly downloaded version is installed.
- Selected and persisted the downloaded version dynamically, using whatever official version the updater reports.
- Served `assets/versions/manifest.js` and `assets/versions/manifest.json` with `no-store` so stale browser cache cannot hide newly installed versions.
- Allowed stale auto-loaded browser state to promote forward when the local manifest advances.
- Updated visible package labels to Beta 1.1.
- Added `BETA_1_1_UPDATE_NOTES.md` in the Beta 1.1 checkpoint.

## Beta 1.1 - Dice Library Groundwork

- Added a Check for Dice Updates button inside the expanded dice picker.
- Added a local dice library manifest for future dice set support.
- Added local server endpoints for future dice library support:
  - `/api/dice/local`
  - `/api/dice/check`
  - `/api/dice/download`
- Kept dice downloads disabled until a trusted GitHub-hosted dice index exists and validation rules are implemented.
- Added future dice-library update documentation in the Beta 1.1 checkpoint.
- Current dice update check behavior safely reports that no dice update source is configured.
- Did not change the installed dice assets or active dice set in Beta 1.1.

## Beta 1.2 - Official Rules Update And Manifest Behavior

- Copied the cleaned Alpha 5 line into Beta 1.2 as the release candidate line.
- Ran the in-app update process and preserved the successful official rules download.
- Added local rules version `0.13.0`.
- Updated the local manifest so the bundled versions are now:
  - `0.12.5`
  - `0.12.6`
  - `0.13.0`
- Set `0.13.0` as both the default local version and latest known version.
- Confirmed the updater fix from Beta 1.1 remains in place: newly downloaded versions can be added to the version dropdown and selected dynamically.
- Preserved local update checker/downloader support for future official Lyrian Chronicles versions.
- Preserved cache-control protections for the version manifest.
- Confirmed fresh characters default to the latest local version.

## Beta 1.2 - Official 0.13.0 Data Included

The bundled `0.13.0` local manifest names these official update notes:

- Added Sylph, a wind-aligned fae subrace.
- Phoenix rebirth now removes all buffs/debuffs.
- Slime Body mana cost reduced from 1 to 0.
- Fading Counter mana cost reduced from 1 to 0.
- Blinding Dust now has the circuit keyword.
- Faerie Flash II was updated to account for abilities potentially resetting Faerie Flash.
- The `0.13.0` bundle includes the standard generated data sections used by the app:
  - Latest update
  - Settings guide
  - Rulebook
  - Breakthroughs
  - Keywords
  - Races
  - Classes
  - Abilities
  - Items
  - Monsters
  - Monster abilities

## Beta 1.2 - Dice Cleanup And Future Dice Downloads

- Kept Angel Sword Dice installed and ready as the active dice pack.
- Replaced unfinished Leaflit and Asari dice art with coming-soon placeholders in this build.
- Preserved Leaflit and Asari as planned future downloadable dice packs.
- Added `assets/dice/dice-coming-soon.svg`.
- Added `assets/dice/dice-pack-manifest.json`.
- Kept the optimized Angel Sword dice assets under `assets/dice/new-angelsword`.
- Removed excess QA screenshots, old dice experiments, browser-only launcher clutter, and large unused dice references from the release copy.
- Kept the Check for Dice Updates groundwork, while leaving remote dice downloads disabled until a trusted GitHub dice index exists.

## Beta 1.2 - Release Packaging And GitHub Handoff

- Created the fresh local Git project folder `Angel Sword Lirian Chronicles Beta 1.2`.
- Removed blank/nested failed GitHub Desktop repository artifacts.
- Added the Beta 1.2 project to GitHub.
- Published the Beta 1.2 tester package as a GitHub pre-release.
- Created the Windows release ZIP:
  - `Angel-Sword-Lirian-Chronicles-Beta-1.2-Windows.zip`
  - Download size: about `63.8 MB`
  - Size after unzipping: about `144.8 MB`
- Updated the main README so testers see download/run instructions before anything else.
- Added a direct GitHub release download link to the README.
- Clarified that testers should use the release ZIP instead of the green GitHub Code button.
- Updated the beta tester readme with the same download, unzip, and launch instructions.
- Kept the portable Windows Node runtime so testers do not need to install Node.js.

## Current Beta 1.2 Tester Instructions

Testers should:

1. Download the Windows ZIP from the GitHub Beta 1.2 release.
2. Right-click the ZIP and choose `Extract All`.
3. Open the extracted `Angel-Sword-Lirian-Chronicles-Beta-1.2` folder.
4. Double-click `Launch Character Builder.bat`.
5. Keep the black launcher window open while using the app.

## Known Beta 1.2 Limitations

- Remote dice downloads are not enabled yet.
- Leaflit and Asari dice are intentionally marked as coming soon.
- The dice update button has safe groundwork only; it does not contact GitHub until a trusted dice source is configured.
- The official `0.13.0` rules data is bundled, but any new mechanics that require brand-new character sheet controls may still need explicit UI support after review.
- Class progression still needs deeper work for ordered ability purchases, mastered-class prerequisites, and exact Spirit Core spending.
- Some source-backed choice effects still need stronger follow-up UI so every "choose a stat", "choose a skill", "choose a weapon group", or "choose an expertise" result updates the sheet automatically.
- Equipment still needs the final pass for full armor penalties, burden, equipped weapon actions, and exact damage formulas across all weapon types.
- GitHub warns that the bundled portable Node executable is large, but it is below GitHub's hard file-size limit and is included so Windows testers can run the app without installing developer tools.
