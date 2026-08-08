# Bundled CCS Template (`ccs-template.xlsx`)

This is Angel's Sword's blank **community character sheet** (CCS) spreadsheet template,
bundled so the CCS export works in one click.

- **Bundled with the owner's decision of 2026-07-22:** the owner has spoken with the
  game's creator and has their blessing for this project; the game is free and open, so
  the simplest-for-the-user option (bundling) was chosen deliberately.
- **Source of truth:** `https://clio.angelssword.com/characterbuilder/data/ccs-template.xlsx`
- **Bundled copy captured:** 2026-07-22, 588,454 bytes, sha256 prefix `078bb27baa394149`.
  The official builder's export code referenced template v10.3.1 at capture time.

## Update procedure (required at every release — owner's caveat)

1. Download the current file from the source URL above.
2. Replace `data/ccs-template.xlsx` with it — nothing else references the file by content,
   only by path, so a straight file swap is the entire update.
3. Run `npm run test:vtt` — it validates the workbook still contains the sheets the
   exporter writes to (Core, Abilities, Breakthrough, Inventory, EXP & Transactions).
   If a sheet was renamed upstream, the test fails and the cell map in the exporter
   needs a matching update before release.
4. Update the captured-date/size/sha line above.

## Why the template is patched, not rebuilt

The template is a Google-Sheets export full of IMPORTRANGE formulas that come back to
life when uploaded to Google Drive. Rewriting the workbook with a spreadsheet library
would destroy them — so the exporter unzips the file, patches ONLY input cells in the
sheet XML, and re-zips. Formulas, hidden lookup sheets, checkboxes, and styling survive
byte-for-byte.
