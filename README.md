# Lyrian Chronicles Character Builder - Beta 2.1 Mirane and Quick Build Update

This is the complete local Beta 2.1 static/public working copy for the Angel Sword character builder and live play sheet.

It starts as a copy of the hardened Beta 1.8 guided crafting and gathering baseline (2026-07-06). It intentionally does not include the Beta 1.6 API provider layer.

## Workstream

Beta 2.1 keeps the full Beta 1.94 responsive builder and live sheet, then adds Standard Play and Mirane Expedition starts throughout guided and Quick Build creation. Mirane restrictions, starting funds, material purchasing, crafting pricing, review-page retirement options, and campaign-unavailable choices are represented in the builder. Quick Build now includes twelve optimized newcomer packages, Slimefolk, race-aware substitutions and shortcuts, complete class/skill/gear summaries, and validated tier-one/tier-two class paths.

Crafting and gathering both run as guided downtime workflows. Each step shows what the player is trying to do, what to click next, and which warnings are soft GM gates rather than hard app failures.

Do not update the local Beta 1.6, Beta 1.7, or Beta 1.8 folders from this folder until the 1.9 work is reviewed and approved for sync.

## Public Web Build

The live public site is published as a single browser link through GitHub Pages. Visitors open the site URL directly; they do not need to download a ZIP, install Node.js, or run a local launcher.

Keep asset paths relative so the same build can run from the GitHub Pages address, a local dev server, or direct file startup.

## Local Development

```powershell
npm install
npm start
```

Then open the local URL printed by the server.

## Testing

```powershell
npm test
```

This rebuilds `assets/app.bundle.js` and runs the cross-browser regression suite.

## Included

- Interactive builder and live play sheet.
- Standard Play and Mirane Expedition creation rules, including Mirane retirement/retraining review guidance.
- Twelve optimized Quick Build play styles with complete classes, breakthroughs, skills, and supporting equipment.
- Eighteen Quick Build species choices, including featured Slimefolk, Dullahan, and Wolf-folk options arranged as six complete desktop rows.
- Race-aware Quick Build handling for Slimefolk and early-unlock or restricted race combinations.
- Guided crafting wizard (5 steps: choose recipe, gather materials, check support, roll points, resolve craft).
- Guided gathering wizard (4 steps: choose node, check access, roll strikes, resolve gather).
- Local rules versions `0.12.5`, `0.12.6`, and `0.13.0`; fresh characters default to the latest local version.
- Browser save/load slots.
- JSON, PDF, and spreadsheet export/import.
- Official-style PDF and Google-style spreadsheet templates.
- Static web deployment through GitHub Pages.

## Tester Notes

Characters are saved in the browser used to open the app. Export a JSON, PDF, or spreadsheet copy if you want a backup or need to move the character to another machine or browser.

Leaflit and Asari dice are intentionally marked as coming soon in this build.

---
Lyrian Chronicles Character Builder
