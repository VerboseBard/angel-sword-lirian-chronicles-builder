# Reusable Systems Map

| System | Primary files | Release concern |
| --- | --- | --- |
| Startup and version selection | `src/js/main.js`, `src/js/rules.js`, `assets/versions/` | Fresh storage defaults to newest; explicit older choices persist. |
| Character state and saves | `src/js/state.js`, `src/js/io.js` | Preserve storage keys, IDs, exports, imports, and pending-edit flushes. |
| Guided and Quick Builds | `src/js/ui.js`, `src/js/rules.js` | Custom and packaged builds must use the same rules calculations. |
| Live play sheet | `src/js/ui.js`, `src/js/dice.js` | Derived stats, combat, crafting, gathering, inventory, and resources stay synchronized. |
| Rules preparation | `scripts/pull-angels-sword-data.js`, `scripts/build-version-assets.mjs` | Pull explicit versions, retain history, and audit every changed field. |
| Import and export | `src/js/io.js`, `assets/vendor/` | Heavy libraries load only when used; hidden round-trip state remains stable. |
| Responsive presentation | `src/css/main.css`, `index.html` | Wide, 1280 px desktop, and phone layouts remain usable across engines. |
| Release validation | `scripts/test-cross-browser.mjs`, `scripts/test-rules-0131.mjs`, `scripts/audit-minmax-cascades.mjs` | All three release gates must pass from the deployment-shaped artifact. |

Keep data loading, game rules, rendering, and persistence separated enough that a change in one area can be tested without silently changing the others.
