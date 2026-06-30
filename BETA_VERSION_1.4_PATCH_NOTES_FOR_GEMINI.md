# Beta Version 1.4 Patch Notes for Gemini Review

Baseline: Beta Version 1.3 / Beta Version 1.3 Fixed

Current working copy: `Angel Sword Lirian Chronicles Beta 1.4`

Deployment status: not pushed. This is still a local working copy for review.

Last Codex validation pass: June 28, 2026

## Summary

Beta 1.4 is a rules-audit, performance, and play-sheet cleanup build based on the live/static Beta 1.3 package. It keeps the same public deployment model, but the local package has moved forward with major rules and UI fixes.

Main changes since Beta 1.3:

- Rebuilt expertise from a generic always-on bonus into named, repeatable specialties.
- Separated base skill rolls from selected expertise rolls on the live character sheet.
- Reworked the builder skill-spending UI around broad skill points and eligible named expertise.
- Fixed health so normal HP, max HP, and Temporary HP are tracked separately.
- Fixed stale/default saved characters opening at 20 HP instead of current max HP.
- Added shared Health/Temp HP/Damage input behavior.
- Added automation for clear self-targeted ability effects such as Spiritual Sync.
- Fixed tier 2 and tier 3 class prerequisite unlocking, including class mastery alternatives.
- Reduced builder sluggishness from hidden sheet rerenders and repeated browser-save writes.
- Removed the dice overlay/floor-plane dimming line during rolls.
- Reworked the wide character-sheet layout to reduce dead space.
- Expanded cross-browser Playwright regression coverage.
- Split the old large JavaScript implementation into modules.
- Split fixed-price material bundle data into individual purchasable material cards.

## File-Level Scope

Important changed or added files compared with Beta 1.3 Fixed:

- `index.html`
- `package.json`
- `package-lock.json`
- `README.md`
- `README - Beta Testers.txt`
- `VERSION.txt`
- `BETA_VERSION_1.4_WORKING_NOTES.md`
- `BETA_VERSION_1.4_PATCH_NOTES_FOR_GEMINI.md`
- `assets/app.bundle.js`
- `assets/dice-3d/lyrian-accurate-dice.js`
- `docs/skills-layout-mockup.html`
- `scripts/server.mjs`
- `scripts/test-cross-browser.mjs`
- `src/css/main.css`
- `src/js/constants.js`
- `src/js/dice.js`
- `src/js/io.js`
- `src/js/main.js`
- `src/js/rules.js`
- `src/js/state.js`
- `src/js/ui.js`
- `src/js/utils.js`

No rules-data JSON files were intentionally changed in the direct 1.4 work. Most rules behavior fixes are code-side interpretation, rendering, and state-handling changes.

## Build And Package Changes

- Package version is now `1.4.0`.
- The visible builder sidebar now shows `Builder build Beta 1.4`.
- The app remains a static web package.
- Vite remains removed; the package uses `esbuild` to create `assets/app.bundle.js`.
- `package-lock.json` was rebuilt so stale Vite metadata is not carried forward.
- The old monolithic JS implementation was split into:
  - `constants.js`
  - `dice.js`
  - `io.js`
  - `rules.js`
  - `state.js`
  - `ui.js`
  - `utils.js`
- `src/js/main.js` is now mostly bootstrap/import logic.

Review request:

- Check import/export boundaries for circular dependencies or hidden initialization-order issues.
- Confirm `assets/app.bundle.js` is rebuilt after source edits before any deployment.

## Version Panel And Update Metadata

- The left sidebar now distinguishes builder build from source rules version.
- The builder can keep using the same public GitHub Pages URL while the local builder build advances.
- The game-version dropdown and local version payload still load the included rule data versions.
- The direct-file startup test confirms the version panel populates instead of showing an empty dropdown.

Review request:

- Confirm the builder build label and selected rules version wording is clear for testers.

## Skill Expertise Rework

The Beta 1.3 expertise model behaved too much like a broad skill bonus. Beta 1.4 changes expertise into owned specialties.

Implemented behavior:

- Expertise is stored as named specialty entries.
- Base skill totals do not include expertise by default.
- Expertise is selected at roll time from owned specialties.
- Repeated purchases of the same specialty stack by +2 each time.
- Different specialties under the same skill stay separate.
- Gathering skills do not offer expertise options.
- Expertise dropdowns are seeded from known rulebook-style examples and artisan restrictions.
- Custom or GM-approved specialty entry remains available where the rules appear open-ended.
- Source-granted expertise such as `Perception (Smell)`, `Perception (Vibration Sense)`, lie-detection `Insight`, `Art (Calligraphy)`, and `Art (Cartography)` becomes owned expertise instead of broad skill math.
- Skill Training breakthrough expertise now asks for both a skill and a specialty.
- Open-ended fixed expertise grants such as choosing craft expertise are flagged as pending choices instead of being guessed automatically.

Current rules assumption:

- The app treats 1 eligible skill point as exchangeable into +2 named expertise.
- The exchanged point does not also increase the broad skill.

Review request:

- Verify the expertise cost/exchange rule against the source material.
- Confirm custom specialties should be available this broadly.
- Confirm named expertise survives browser save/load, JSON export/import, PDF export/import, and spreadsheet export/import.
- Confirm old Beta 1.3 generic expertise fields migrate sensibly.

## Builder Skill Interface

Implemented behavior:

- Broad skill points use plus/minus controls.
- Each eligible skill has an expandable `Expertise` panel.
- Legal spend sources are shown as direct action controls rather than a confusing source dropdown.
- Live remaining-point counts appear where creation, racial, or class benefit points can be spent.
- Top budget chips were reworded to avoid duplicated labels such as `class Class Skill Points`.
- The instructions above the skill list now explain broad skill points versus exchanged expertise.

Review request:

- Check whether the wording matches the final rules language.
- Check whether unavailable sources explain themselves clearly enough.

## Character Sheet Skill Rolls

Implemented behavior:

- Character sheet skills show base skill rolls separately from expertise rolls.
- An `Expertise` dropdown appears only when that skill has owned expertise.
- Unowned expertise stays hidden.
- Expertise options show the owned specialty and bonus, such as `Jumping +2` or `Jumping +6`.
- Rolling a named expertise adds only that selected specialty to the base roll.
- Regression coverage verifies that a three-point Jumping expertise purchase appears as `Jumping +6` and logs `Jumping Expertise +6`.

Review request:

- Confirm the selected-expertise roll breakdown is clear to players.
- Confirm base skill roll buttons do not accidentally include expertise.

## Health And Temporary HP

Implemented behavior:

- Health Tracker now separates current normal HP, max normal HP, and Temporary HP.
- Fresh characters start at current HP equal to max HP.
- Saved characters with stale/default HP sync to max HP unless the player intentionally changed HP.
- Healing cannot raise normal HP above max HP.
- Damage subtracts from Temporary HP first, then normal HP.
- Temporary HP does not stack; when a new grant is equal to or lower than current Temporary HP, the existing value is kept.
- When a new Temporary HP grant is higher than the current value, the higher value replaces the old value.
- Temporary HP displays inline beside the `current / max` normal HP readout.
- Heal HP, Take Damage, and Grant Temp HP all use the same amount input.
- The old separate blue Temporary HP amount box was removed.
- Temporary HP is not treated as max HP.

Confirmed rule:

- Temporary HP does not stack. Keep the highest active Temporary HP value.

Review request:

- Confirm whether Temporary HP should expire automatically or remain manually tracked.
- Confirm old intentionally damaged characters are not incorrectly restored to full.

## Ability Use Automation

Implemented behavior:

- Ability Use buttons now better handle variable resource costs such as `-1 Mana`.
- Variable costs display as an `X Mana` style choice where appropriate.
- Unambiguous costs spend tracked resources instead of doing nothing or moving values the wrong way.
- Spiritual Sync spends 1 Mana and grants 8 Temporary HP each time Use is clicked; this follows the non-stacking Temporary HP rule, so repeated uses keep 8 unless the current Temporary HP is already higher.
- Explicit self-tracker effects such as mana-to-Temporary-HP or mana-spent HP recovery are auto-applied only when clear.
- Target-dependent or trigger-dependent effects are logged/manual instead of guessed.

Review request:

- Audit every class/race/breakthrough Use button.
- Confirm only unambiguous self-effects are auto-applied.
- Confirm target-based effects do not change the player tracker.

## Class Prerequisite Unlock Fixes

Issue found:

- Some tier 2 and tier 3 classes stayed locked even after their displayed requirements looked met.
- Example: Bloodbinder should unlock from a fully mastered tier 1 class, but remained locked.
- Requirements such as `Fighter, Maid, or Armorsmith mastery` needed to unlock when any listed class was mastered.

Implemented behavior:

- Class requirement parsing was expanded in `src/js/ui.js`.
- The parser now handles class-name mastery requirements, comma/or alternatives, `any class mastered`, `one class mastered`, `any tier 2 class mastered`, compound `and`/`plus` clauses, alternative blocks, class count requirements, race/lineage gates, breakthrough gates, ability/spell requirements, proficiency requirements, skill/expertise prerequisites, mystic-eye-slot checks, and elemental mastery aliases such as ice/frost.
- Follow-up fix: the mystic-eye-slot parser now also accepts the normalized wording `have at least 1 mystic eye slot open`, which is what remains after `must have at least 1 mystic eye slot open` is cleaned.

Verification already documented:

- Fighter mastery unlocks Bodyguard and Bloodbinder.
- Fighter mastery now also unlocks Evil Eye, confirming the mystic-eye-slot requirement path.
- Fighter plus Bodyguard mastery unlocks higher classes such as Shield Saint, Death Knight, Colossus, and Trickster.
- Alternate branch examples involving Maid, Armorsmith, Forager, Acolyte, and Mage passed.
- Broad tier 2/tier 3 prerequisite matrix previously reported 66 scenarios, 164 unlock checks, and 0 failures.

Review request:

- Review `getRequirementCount`, `evaluateClassMasteryRequirement`, `evaluateOrRequirement`, `splitRequirementClauses`, and `getClassRequirementStatus`.
- Check whether any parser path is too permissive.
- Pay special attention to non-class gates such as proficiency, expertise, spells, elemental mastery, mystic-eye slots, race/lineage, and breakthroughs.

## Play Sheet Layout

The play sheet went through several 1.4 layout passes after the health/resource rewrite.

## Play Sheet Reference Details

Issue found:

- Some key abilities and passives only displayed short text such as `You may use Transfusion`.
- The detailed ability record existed in the pulled rules data, but the live sheet did not expose it from that card.

Implemented behavior:

- Ability names on live-sheet action cards are now clickable when a matching reference record exists.
- Matching ability names inside the short description are also clickable.
- Clicking a reference opens a right-side `Reference Detail` card with the pulled range, cost/tags/keywords, and full description.
- Transfusion now opens its real description, including its 40ft range, Healing/Aid keywords, HP-loss healing effect, and the note that the HP loss ignores temporary HP.
- The old visible `Builder Audit` panel was removed from the play sheet. Its duplicated funds/effects/pending-choice cards no longer occupy the right column; that space is now dedicated to reference details.

Verification:

- Cross-browser smoke coverage now opens the Transfusion reference from the Bloodbinder key ability card and confirms the right-side detail text appears.
- The same smoke coverage verifies that the old `Builder Audit` and `Funds and Builder Effects` labels are no longer present on the live sheet.

Current wide-screen layout:

- Main stats are compact cards with the stat value beside the label.
- Secondary stats are compact cards with the stat value beside the label.
- EXP and Spirit Core occupy the upper-right tracker area.
- Clim moved above the resource cards on the left.
- Mana, AP, and RP regained a wider lane.
- The Mana/AP/RP animation regained a wider lane below the resource cards.
- Health moved to the right-side lane.
- Speed and Initiative sit directly beneath Health at normal width.
- Defenses and Senses remain below the resource/combat dashboard.

Implementation notes:

- The wide-screen rearrangement is CSS-grid-only and uses existing card markup.
- Mobile and narrower layouts still collapse to single-column behavior.
- Regression coverage now checks:
  - Health is wide/thin.
  - Health sits right of resources.
  - Clim sits above resources.
  - Resource cards regained width.
  - Animation sits under resources.
  - Speed/Initiative sit under Health.
  - Speed/Initiative do not become super-wide.
  - Stat values remain inline with stat labels.
  - Health controls stay inside the Health card.
  - Changed cards do not overlap the tracker or Senses section.

Review request:

- Visually check wide, desktop, and mobile screenshots.
- Confirm the current left/right information grouping is the desired player flow:
  - Left: Clim, Mana, AP, RP, resource animation.
  - Right: Health, Speed, Initiative.

## Dice Overlay Fix

Implemented behavior:

- The accurate 3D dice roller no longer draws a semi-transparent dark floor plane across the play sheet.
- The visible horizontal dimming line during rolls is gone.
- Dice animation and result cards remain.
- A source regression check fails if the page-dimming floor plane is reintroduced.

Review request:

- Confirm dice remain visible and readable without the floor plane.
- Confirm no unwanted transparent overlay remains during rolls.

## Equipment Purchase Controls

Issue found:

- Builder equipment cards were doing two things at once: clicking an item both inspected it and toggled whether it was purchased.
- This made it too easy to accidentally buy or remove an item while only trying to read its description in the right-side detail panel.

Implemented behavior:

- Equipment cards are now inspect-only when clicked.
- Each equipment card has explicit `+` and `-` controls on the right side.
- `+` purchases the item if there is inventory space and enough Clim.
- `-` removes the item if it is already purchased.
- Budget checks still use the existing Clim logic and still block over-budget purchases unless the manual override allows them.

Verification:

- Cross-browser smoke coverage now verifies that inspecting an equipment card does not purchase it, `+` purchases it, and `-` removes it.

## Material Purchase Rows

Issue found:

- Several crafting material records were bundled as one large reference card with many different prices inside the description.
- Examples include Alchemy Materials, Armorsmithing Materials, Blacksmithing Materials, Carpenter Materials, Culinarian Ingredients, Farming Materials, and Artificer Materials.
- Because those records had empty or generic cost fields, the builder could not treat each priced material as a real purchasable item.

Implemented behavior:

- `src/js/utils.js` now expands fixed-price material rows into generated item records during lookup creation.
- The original bundle records remain resolvable for saved data, but are hidden from the equipment purchase list when generated purchasable rows exist.
- Generated material cards keep the source category header, image, Clim cost, and unit conversion text.
- Generated material cards use the same inspect / `+` purchase / `-` remove controls as normal equipment.
- Rows without a fixed Clim purchase price remain reference text instead of being guessed as purchasable items.

Verification:

- Cross-browser smoke coverage now searches for `Alchemy Herb - Common Fire`, inspects the generated detail card, buys it with `+`, removes it with `-`, and verifies the old `Alchemy Materials` bundle is not still shown as a purchasable card.
- A separate targeted generated-material purchase audit walked 134 generated material cards with a high GM Clim override, added each one, verified the Purchased state, removed it, and reported 0 failures.

Review request:

- Check whether any material rows with variable prices should become manual/custom purchase rows instead of remaining reference-only.
- Spot-check high-cost materials to confirm the disabled `+` state is correct when starting Clim is too low.

## Review Page Equipment Layout

Issue found:

- Long equipment lists made the Current Build summary too tall because Equipment was one of the compact summary cards.
- A large gear list turned the rightmost card into a narrow vertical column and made the review page look broken.

Implemented behavior:

- Current Build now keeps only Identity, Stats, Skills, Classes, and Breakthroughs in the compact top row.
- Equipment now renders as a full-width summary card underneath those five cards.
- The lower review grid uses the same idea: short review panels first, then a full-width Equipment panel.
- Equipment summary text preserves the Remaining Clim line separately from the item list.

Verification:

- Cross-browser smoke coverage now verifies that the Current Build Equipment card spans the summary panel, sits below the five compact cards, and lists a purchased generated material item.

## Performance Fixes

Implemented behavior:

- Hidden play-sheet rerenders during builder interactions were reduced.
- `renderPlayDashboardIfVisible()` skips dashboard rendering unless the sheet is visible.
- Skill row rendering computes active bonus data once per list render instead of repeatedly per row.
- Large builder/sheet mode switches use immediate scrolling instead of lingering smooth-scroll behavior.
- Builder save writes are batched through `scheduleWorkingStatePersist()`.
- Routine saves happen only when values actually change.
- Startup hydration avoids saving default/partial state before a saved character finishes loading.
- Delayed-save behavior respects intentional browser storage clears.

Observed performance probe results after fixes:

- Skills step about 61-69 ms.
- First expertise panel about 38-52 ms.
- Add expertise about 62-85 ms.
- Open character sheet about 81 ms.
- Abilities tab about 72 ms.
- Heavy saved-character scroll test about 119 ms.
- No console/page errors reported in the probe.

Review request:

- Check for remaining hot loops in builder rendering.
- Check whether large portraits/log history can still make localStorage writes feel heavy.

## Current Verification Results

Codex checks run on June 28, 2026 against the current local 1.4 folder:

- JavaScript syntax:
  - `node --check` passed for 12 JavaScript files in `src/js`, `scripts`, and `assets/dice-3d`.
- Dependency tree:
  - `npm.cmd ls --depth=0` passed.
  - Dependencies are `esbuild@0.25.5` and `playwright@1.60.0`.
- Security audit:
  - `npm.cmd audit --audit-level=high` reported 0 vulnerabilities.
- Local asset/dead-link scan:
  - Checked local refs in `index.html`, `src/css/main.css`, and main JS asset strings.
  - Found 0 missing local references.
- Source text scan:
  - No TODO/FIXME/debugger markers found in source/test targets.
  - Existing `console.error` calls are intentional error handlers and test failure reporters.
  - Localhost/127.0.0.1 references are confined to local server/test/dev-environment checks.
- Build:
  - `npm.cmd run build` passed.
  - `assets/app.bundle.js` rebuilt successfully.
- Cross-browser deployment smoke:
  - `npm.cmd test` passed.
  - Direct-file startup check passed against the copied static deployment artifact.
  - Chromium, Firefox, and WebKit passed wide, desktop, and mobile checks.
  - Network/HTTP/page-error assertions passed.
  - DOM/layout regressions passed.

Fresh screenshots generated:

- `qa-test-results/screenshot-chromium-wide.png`
- `qa-test-results/screenshot-chromium-desktop.png`
- `qa-test-results/screenshot-chromium-mobile.png`
- `qa-test-results/screenshot-firefox-wide.png`
- `qa-test-results/screenshot-firefox-desktop.png`
- `qa-test-results/screenshot-firefox-mobile.png`
- `qa-test-results/screenshot-webkit-wide.png`
- `qa-test-results/screenshot-webkit-desktop.png`
- `qa-test-results/screenshot-webkit-mobile.png`
- `qa-test-results/clim-above-resources-layout.png`

## Known Review Risks

These are not confirmed current bugs, but they are the highest-value checks before pushing:

- Expertise rule semantics: verify `1 eligible skill point -> +2 named expertise` is correct.
- Expertise export/import: verify named expertise survives every import/export path, not only browser state.
- Saved-character migration: verify old Beta 1.3 characters with generic expertise and damaged HP behave sensibly.
- Temporary HP expiration timing: non-stacking behavior is now confirmed, but expiration/removal timing still needs rules review.
- Ability automation: audit every Use button so target-dependent effects stay manual.
- Non-class prerequisites: class mastery gates were heavily checked; non-class gates still deserve targeted review.
- Wide layout with real characters: current layout checks pass, but real names, portraits, long class lists, and high values should still be visually sampled.

## Suggested Gemini Review Order

1. Run `npm.cmd test`.
2. Inspect wide/desktop/mobile screenshots.
3. Review expertise spending, storage, migration, and roll display.
4. Review health and Temporary HP state behavior.
5. Review ability Use resource/effect automation.
6. Review tier 2/tier 3 prerequisite parsing, especially non-class gates.
7. Review modular import/export boundaries.
8. Confirm the current play-sheet layout is the desired player-facing structure.
