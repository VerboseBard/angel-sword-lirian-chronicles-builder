# Lyrian Chronicles Character Builder - Beta 1.3 Web

This is the web-ready Beta 1.3 package for the Angel Sword character builder and live play sheet.

## Public Web Build

This version is designed to be published as a single browser link through GitHub Pages. Visitors open the site URL directly; they do not need to download a ZIP, install Node.js, or run a local launcher.

## Local Development

If you want to run it from this folder while editing:

```powershell
npm install
npm start
```

Then open the local URL printed by the server.

The public site is deployed by GitHub Actions from the repository root. Pushing to `main` publishes the static web package automatically.

## Included

- Interactive builder and live play sheet.
- Local rules versions `0.12.5`, `0.12.6`, and `0.13.0`; fresh characters default to the latest local version.
- Browser save/load slots.
- JSON, PDF, and spreadsheet export/import.
- Official-style PDF and Google-style spreadsheet templates.
- Static web deployment through GitHub Pages.

## Tester Notes

Characters are saved in the browser used to open the app. Export a JSON, PDF, or spreadsheet copy if you want a backup or need to move the character to another machine or browser.

## Notes

The approved Angel Sword dice behavior is documented in `docs/dice-rendering-contract.md`. Leaflit and Asari dice are intentionally marked as coming soon in this build.
