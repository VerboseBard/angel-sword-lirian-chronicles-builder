# Lyrian Chronicles Character Builder — Beta 3.0

Fresh browsers start on rules 0.13.2. The notes of the September 7, 2026 patch candidate stay in [PATCH_2026-09-07_START_HERE.md](PATCH_2026-09-07_START_HERE.md) as history.

Beta 3.0 is the standard public web build for the Angel Sword Lyrian Chronicles character builder and live play sheet.

The existing GitHub Pages address remains unchanged:

https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/

## What is included

- Official bundled rules 0.13.2 as the fresh-install default.
- Selectable historical rules 0.13.1, 0.13.0, 0.12.6, and 0.12.5.
- Pigfolk, four new classes, local artwork, and a searchable [offline rules reference](docs/offline-reference/RULES_0.13.2.html).
- Standard Play and Mirane Expedition character creation.
- Advanced Build as the default full creator, plus 15 validated Quick Build packages across 21 species choices.
- A persistent Return to Advanced Build control throughout Quick Build, with applied package choices preserved for customization.
- Seven Sorrows Sword Style, Divine's Chosen, Gnome, Raijin, and Selkie support.
- Live combat, crafting, gathering, inventory, dice, saving, and export/import tools.
- Safari 15 syntax targeting, mobile layouts, deferred heavy runtimes, cached rules switching, and debounced sheet rendering.
- Static GitHub Pages deployment with no in-app update checker.

## Run it locally

You need Node.js 22, the version the site build uses. From this folder:

```powershell
npm ci
npm start
```

`npm start` builds the Owlbear extensions, serves the builder and opens it in your browser. The address is `http://localhost:4176/`. If that port is busy, the server tries the next free one (up to 4195) and prints the address it chose, with the local Owlbear install link for that port. Keep port 4176 free when you test the extensions, so the link stays the same from run to run.

After you change anything under `src/js`, run `npm run build`. It writes the app bundle (`assets/app.bundle.js`) and sets the bundle's `?v=` token in `index.html` from the bundle's content. Commit `index.html` together with the bundle.

Saved characters belong to the browser address that made them, so a local run has its own saves, apart from the public site.

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
