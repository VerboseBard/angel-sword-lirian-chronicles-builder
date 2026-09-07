# Bundled CCS Template (`ccs-template.xlsx`)

This is Angel's Sword's blank **community character sheet** (CCS) spreadsheet template,
bundled so the CCS export works in one click.

- **Bundled with the owner's decision of 2026-07-22:** the owner has spoken with the
  game's creator and has their blessing for this project; the game is free and open, so
  the simplest-for-the-user option (bundling) was chosen deliberately.
- **Source of truth:** `https://clio.angelssword.com/characterbuilder/data/ccs-template.xlsx`
- **Bundled copy captured:** 2026-09-07, 587,331 bytes, SHA-256
  `3aba3065ae76dcbb86baf712446c13f8fd1ff13f7dc052252a609affb127b6c6`.
  This is the exact official download accompanying rules 0.13.2. Compared with
  the July template, only Core!F4 changed: initiative now adds H35 instead of
  subtracting it. All other workbook parts and cell formulas are unchanged.

## Update procedure (required at every release — owner's caveat)

1. Download the current file from the source URL above.
2. Compare the sheets, input cells, formulas, validations and styles with the
   retained template, then replace `data/ccs-template.xlsx` with the exact download.
3. Run `npm run test:vtt` — it validates the workbook still contains the sheets the
   exporter writes to (Core, Abilities, Breakthrough, Inventory, EXP & Transactions).
   If a sheet was renamed upstream, the test fails and the cell map in the exporter
   needs a matching update before release.
4. After building the app, run `node scripts/test-patch-0132-ui.mjs` to verify
   the actual CCS download's stat selectors, residual bonuses and preserved
   formulas, including custom arrays and racial/class/breakthrough bonuses.
5. Update the captured-date/size/sha line above.

## Why the template is patched, not rebuilt

The template is a Google-Sheets export full of IMPORTRANGE formulas that come back to
life when uploaded to Google Drive. Rewriting the workbook with a spreadsheet library
would destroy them — so the exporter unzips the file, patches ONLY input cells in the
sheet XML, and re-zips. Formulas, hidden lookup sheets, checkboxes, and styling survive
byte-for-byte.
