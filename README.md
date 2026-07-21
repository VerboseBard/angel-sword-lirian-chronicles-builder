# Lyrian Chronicles Character Builder - Beta 2.13

Beta 2.13 is the standard public web build for the Angel Sword Lyrian Chronicles character builder and live play sheet.

The existing GitHub Pages address remains unchanged:

https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/

## What is included

- Official bundled rules 0.13.1 as the fresh-install default.
- Selectable historical rules 0.13.0, 0.12.6, and 0.12.5.
- Standard Play and Mirane Expedition character creation.
- Advanced Build as the default full creator, plus 14 validated Quick Build packages across 21 species choices.
- A persistent Return to Advanced Build control throughout Quick Build, with applied package choices preserved for customization.
- Seven Sorrows Sword Style, Divine's Chosen, Gnome, Raijin, and Selkie support.
- Live combat, crafting, gathering, inventory, dice, saving, and export/import tools.
- Safari 15 syntax targeting, mobile layouts, deferred heavy runtimes, cached rules switching, and debounced sheet rendering.
- Static GitHub Pages deployment with no in-app update checker.

## Local development

```powershell
npm install
npm start
```

## Required validation

```powershell
npm test
npm run test:rules0131
npm run audit:minmax
```

`npm test` builds the production bundle and exercises Chromium, Firefox, and WebKit at wide, 1280 px desktop, and 390 px phone viewports. It also covers direct-file startup, Advanced and Quick Builds, older-version switching, saving, and live-play behavior.

See `BETA_2.13_RELEASE_NOTES.md`, `BETA_2.13_PATCH_NOTES_FROM_2.1.md`, and `STANDARD_HANDOFF_README.md` for release and maintenance details.

## Save-data note

Characters are saved in the browser profile used to open the app. Export JSON, PDF, or spreadsheet backups before changing devices, browsers, or clearing site data.
