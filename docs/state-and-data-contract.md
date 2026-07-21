# State And Bundled-Data Contract

Beta 2.13 is a static public build. Rules are loaded from versioned JavaScript assets and character state is kept in browser storage or exported files.

## Rules data

`index.html` statically loads the default version, currently 0.13.1:

- `assets/versions/0.13.1/lyrian-data.js`
- `assets/versions/0.13.1/lyrian-detail-data.js`
- `assets/versions/manifest.js`

The scripts populate `window.LYRIAN_DATA`, `window.LYRIAN_DETAIL_DATA`, and `window.LYRIAN_VERSION_MANIFEST`. Runtime version switching may replace the first two globals with another bundled version, then `refreshGameDataRuntime()` rebuilds indexes and derived lookups.

The static tags and manifest default must always identify the same version. Older version entries and files must remain available for existing characters.

## Character state

`src/js/state.js` owns the working character and save-slot state. Important contracts include:

- selected rules version
- race, ancestry, classes, levels, abilities, breakthroughs, and resolved choices
- proficiencies, expertise, skills, equipment, quantities, and equipped state
- current HP and resources
- Quick Build metadata
- UI mode and character-start mode

Do not rename stable identifiers or storage keys without a migration. Existing browser saves, JSON exports, PDFs, spreadsheets, and shared Build Lab links depend on them.

## Persistence

Normal edits schedule browser persistence. Sheet fields and player notes have longer UI debounces for performance; startup registers close and visibility handlers that flush these pending edits before the final storage write.

Every direct sheet edit must advance the state revision so derived-value caches cannot remain stale.

## Imports and exports

`src/js/io.js` handles JSON, PDF, and spreadsheet round trips. Visible fields and hidden embedded state must agree. Import tests must cover final-stat handling, equipped booleans, custom inventory, current resources, rules version, and older-save recovery.

## Safe change rule

Treat pulled data as evidence, not automatically correct runtime behavior. Compare official records, update rules interpretation deliberately, add a regression for each corrected interaction, and run every release gate.
