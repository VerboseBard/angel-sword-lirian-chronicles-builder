# Lyrian Chronicles Character Builder - Beta 1.5 Static Parity Build

This is the local Beta 1.5 static/public working copy for the Angel Sword character builder and live play sheet.

It has been synced forward with the non-API behavior from the Beta 1.6 work: play-sheet improvements, effects/conditions support, workbook import/export fixes, and Roland/Masaru regression coverage. It intentionally does not include the Beta 1.6 API provider layer.

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
