// App-owned summary, independent of the selected rules version and generated
// upstream patch notes. Include delivered content, dice, Owlbear and local fixes
// when they change; do not announce planned work or existing features as new.
// Beta 3.0 (tasks 039 and 042): each line is traced to its task and audit in
// BETA_2.5_TASKS/reports/039-release-notes-and-docs-report.md and 042's report.
// Task 044: the crafting line says "basics" (the crafting actions are not built
// yet), and two lines name task 043's import and Equip/Unequip fixes.
// Task 044c: two lines for task 044's player-visible rules fixes. Initiative
// rolled a d20 on the live site (3346d32). The Human Spirit Core double count
// (1200 for 1100 spent) was on the live site for Humans who spent all 1100 EXP
// in Advanced Build; a live Human Quick Build showed 1100, so the line does not
// say Quick Build.
// Task 045: the crafting line says "each basic craft roll". The roll adds the
// recipe's skill, but Beginner's Luck, Steady Craft and Standard Finish are not
// built, and Beginner's Luck would not add the skill anyway.

// Task 042 (owner design, 2026-10-19): the sidebar shows only this one line
// under the builder version and the selected rules version. The full list
// below opens in a popup from the "See full update list" button.
export const APP_RELEASE_SUMMARY = "Multiple dice sets, Owlbear Rodeo connection, quality-of-life improvements.";

export const APP_RELEASE_NOTES = Object.freeze([
  "The Owlbear Rodeo guide has buttons that copy the Companion and Dice install links.",
  "The Owlbear guide now teaches the token steps: Download Token Image, drag it onto the map, choose Character. Binding is optional.",
  "Send Character to Room now sends the stats, Clim and EXP your sheet shows.",
  "Open My Character Sheet is built to land on your play sheet when your character is finished.",
  "The 3D dice in Owlbear are built to let your clicks through. If a room blocks them, they turn off after one click.",
  "d100 rolls of 1 to 9 now show 00 on the tens die.",
  "New Quick Build: Gunslinger, with two pistols.",
  "Every Quick Build now spends all its EXP, skill points and spare Interlude Point.",
  "Quick Build with Human no longer drops you into Advanced Build on the Name step, and shows the Human picks before you continue.",
  "From the play sheet, the full builder opens with your character intact, never Quick Build.",
  "Characters loaded from a save slot open on Review and keep their current HP, Mana, RP and AP.",
  "The Current Build panel and Review show EXP spent and banked.",
  "Humans who spend all 1100 EXP now show Spirit Core 1100, not 1200.",
  "Human bonus skills and Skill Training now allow Artifice, Appraise, Animal Husbandry and Survival.",
  "The Gunslinger's +1 initiative and the Vampire Lord's +1 Presence now count.",
  "Initiative now rolls 1d4 plus your bonus, as the 0.13.2 rules say, and never goes below 0.",
  "Crafting basics now follow the 0.13.2 rulebook: 5 dice, your skill on each basic craft roll, crafting HP to succeed.",
  "Alchemy crafts now make 3 of the item.",
  "Save slots now keep the Mirane start after a reload.",
  "Imports now list anything that did not match, instead of dropping it. Spreadsheet imports no longer lose your 18th item, and list any past the builder's 24.",
  "Import Character and Load Saved now keep every free skill point and choice: class picks, Skill Training and the Divine's Chosen god.",
  "Equip and Unequip on the play sheet now update Guard, Evasion, Dodge, Block, Initiative and skills at once.",
  "CCS exports now include armor and shield numbers and leave out temporary effects."
]);
