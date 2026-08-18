# Lyrian Chronicles Character Builder - Local Beta 2.20 Patch Notes Draft

## Comparison baseline

- Compared on 2026-08-11 against freshly fetched GitHub `origin/main`.
- GitHub baseline commit: `0c8b2dada4c4bca2321f6d6d998ba6f02ec0169c` - `Document Advanced Build as the default (#5)`.
- Working branch: `agent/beta-2-20-development` at `5b72b47fac92a548fb9be047de88cf3653a7eea3`, three checkpoint commits ahead of `origin/main`, plus uncommitted working-tree changes.
- The application/package still intentionally identifies itself as Beta 2.13 / version 2.13.0. This working copy has not been approved, versioned, or published as a Beta 2.20 release.
- Nothing from this test and review was pushed to GitHub.

## Dice roller and dice-set changes

### Four installed sets

- Angel Sword Dice
- Asari Full Set
- Leaflit Full Set
- Rana Full Set

The selector no longer presents obsolete duplicates or `Coming Soon` entries as if they were available sets.

### Artwork and numbering

- Rebuilt and validated the Angel Sword D4 vertex numbering so results 1-4 read from the correct upper vertex and the two neighboring values point toward their own corners.
- Validated the same settled-result convention for the Asari, Leaflit, and Rana D4 artwork.
- Preserved character portraits and special symbols without placing numbers over the central artwork.
- Validated standard number ranges, unique faces, D100 labels, and result topology through the shared skin integration tests.
- Regenerated the four 1600x1000 full-set showcase images from the actual installed runtime art.

### Color and rendering

- Corrected the Three.js output pipeline to emit sRGB color in both the shared and legacy dice renderers.
- Removed conflicting per-set brightness/saturation filters that made source panels, settled dice, selector previews, and live rolls disagree.
- Angel Sword now keeps a consistent warm ivory, blue, and gold palette across D20, D12, D100, D10, D8, D6, and D4.
- Asari keeps bright white, electric blue, and gold separation.
- Leaflit keeps pearl, red, navy, and gold separation without muddy shadows.
- Rana remains the darkest intentional design, but its emerald faces, gold numbers, pink coils, red portrait, and teal accents remain distinguishable.

### Dice selector

- Expanded selector uses four large 8:5 showcase cards and anchors its scroll position on `Use Dice` at normal 100% browser zoom.
- Compact selector uses the corrected set showcase and seven shape-specific generated previews rather than a generic D4 image for every button.
- Per-die images are enlarged inside their buttons while retaining D20/D12/D100/D10/D8/D6/D4 labels.
- `Use Dice` collapses the gallery back to the compact rolling controls.
- Added explicit cache revisioning for the dice manifest, runtime, face-art scripts, and regenerated selector images.

### Roll behavior and performance design

- The active production behavior is the low-cost scripted side-entry roll, not the experimental collision-physics prototype.
- One shared WebGL canvas renders all queued dice. This avoids creating a separate WebGL context for every die and is better suited to mobile devices.
- The roll retains predetermined results, correct settled faces, and readable custom artwork.
- The color correction is a renderer output setting; it does not add image processing to every animation frame.

## Other local changes beyond dice

### Builder and character-sheet fixes

- Existing `Unassigned creation expertise` points can now be assigned to a legal specialty without spending the creation skill-point budget a second time.
- Class progress cards are keyboard/click interactive and can update the right-side detail panel.
- Class search now appears with the class catalog controls.
- Selected classes remain visible in their own panel even when the current search, role, or tier filter would hide them from the browse results.
- Selected class chips can be used to remove classes.
- Added focused regressions for legacy expertise assignment, class inspection, selected-class visibility, dice gallery sizing, per-die imagery, and scripted rolling.

### Official-builder and file interoperability checkpoint

- Added `.aschar`/official-builder interoperability support.
- Added the CCS spreadsheet template, mapping/readme work, and related verification scripts.
- Added rules, I/O, UI, and CSS parity work identified by the Beta 2.20 audit.
- Added community-update and live-interoperability test coverage.

### VTT checkpoint

- Added Roll20 bridge/protocol code and tests.
- Added Owlbear panel/manifest proof-of-concept files.
- Added Foundry module proof-of-concept files.
- Added VTT relay/integration modules and platform documentation.

These VTT additions are not all release-ready. Roll20 still needs a real table acceptance/resource-spend validation, Owlbear needs a storage-partition-safe redesign, and Foundry needs a packaged/installable current-version build and physical test.

### Documentation and audit material

- Added the Beta 2.20 official-builder/VTT audit, roadmap evaluation, AI handoff, owner physical checklist, Roll20 protocol/handoff, VTT plan, and dice rendering/promotion documentation.

## Verification completed on 2026-08-11

### Full deployment suite

`npm test` passed against a copied deployment artifact in:

- Chromium: 1660x760, 1280x800, and 390x844
- Playwright Firefox: 1660x760, 1280x800, and 390x844
- Playwright WebKit/Safari engine: 1660x760, 1280x800, and 390x844

The deep Chromium pass also audited:

- 28 Quick Build class-and-gear packages
- 705 class progressions across four local rules versions
- 19,186 class availability states across 53 race/ancestry paths and two start modes
- 25 selectable proficiency grants across 16 classes

No deployment-artifact layout, network, DOM, direct-file-startup, mobile-sheet, or bundle-compatibility assertion failed.

### Focused dice browser matrix

`npm run test:dice-browsers` passed at 1280x800 desktop and 390x844 mobile sizes in:

- Installed Google Chrome
- Installed Microsoft Edge
- Bundled Chromium as a Brave-engine compatibility proxy
- Playwright Firefox
- Playwright WebKit/Safari engine

Every case:

- Loaded the real character sheet.
- Opened the expanded selector and kept `Use Dice` visible inside the panel.
- Loaded all four showcase cards.
- Selected every dice set and confirmed seven distinct, successfully loaded per-die previews.
- Performed a real D20 + D6 + D4 roll.
- Confirmed scripted fallback motion, readable result text, one shared WebGL canvas, and no uncaught page errors or relevant failed local requests.

Measured local first-run ranges:

| Browser target | Sheet ready | Gallery ready | Slowest first set-preview generation | Roll visible |
| --- | ---: | ---: | ---: | ---: |
| Chrome | 0.63-0.78 s | 0.11-0.20 s | 1.26 s | 0.17-0.24 s |
| Edge | 0.67 s | 0.10-0.19 s | 1.28 s | 0.20-0.29 s |
| Chromium compatibility proxy | 0.66-0.73 s | 0.10-0.14 s | 3.38 s | 3.37-3.52 s |
| Playwright Firefox | 0.88-1.09 s | 0.26-0.36 s | 4.10 s | 2.22-2.97 s |
| WebKit/Safari engine | 1.00-1.02 s | 0.45-0.91 s | 3.85 s | 0.63-0.92 s |

The slowest operation is the first generation of seven shape-specific thumbnails after selecting a set. It is cached for reuse. The live roll and result calculation are local; internet speed primarily affects the first asset download.

### Other focused checks

- Production bundle build and compatibility check: passed.
- Workshop/shared dice-core synchronization check: passed.
- Dice promotion, registry, routing, numbering, and topology integration test: passed.
- Expertise assignment, class interaction, dice chooser, and scripted-roll follow-up test: passed.
- Manual live full-set roll on the character sheet for Angel Sword, Asari, Leaflit, and Rana: passed.
- Manual Angel Sword/Asari/Leaflit D4 settled orientation comparison: passed.
- Manual Rana natural-1, natural-20, and D4 results 1-4 comparison: passed.

## Test limitations and release cautions

- Brave is not installed on this Windows machine, so the exact Brave executable was not tested. Chromium compatibility passed, but that is not a substitute for a future physical Brave pass.
- Safari cannot run natively on Windows. Playwright WebKit passed, but a real iPhone/iPad and macOS Safari pass is still recommended before public release.
- Mobile results use 390x844 viewport emulation on desktop hardware. They validate responsive layout and browser behavior, not thermal, memory, or GPU limits of an older physical phone.
- First-run Firefox/WebKit thumbnail generation is visibly slower than Chrome/Edge but remained within the test timeouts and did not block rolling.
- The branch contains uncommitted and untracked implementation/QA files. It needs a deliberate release-scope cleanup before any commit or deployment.
- The application still says Beta 2.13. Do not change the public version label or publish this as Beta 2.20 until the owner approves the release scope.

## Table Tools and Owlbear setup checkpoint - 2026-08-16

- Consolidated the character-sheet file, repair, and tabletop controls into a
  fourth **Table Tools** mode beside Combat, Crafting, and Gathering.
- Reduced the character-sheet header to a single **Table Tools** entry point.
  Save, load, export, import, Roll20, Owlbear, recalculation, and builder-return
  controls remain available inside the organized panel.
- Added guided character-file, Roll20, and Owlbear walkthroughs. The Owlbear
  guide distinguishes the one-time GM extension install from the room invite
  link sent to players.
- Replaced the misleading Owlbear download language with the actual custom
  extension workflow. Owlbear installs from a hosted manifest address; no ZIP
  download is required.
- The local Owlbear preview manifest is available at
  `http://127.0.0.1:4212/owlbear/manifest.json` while the local server runs.
- The planned public Owlbear manifest still returns 404. The interface labels
  the integration as a preview and disables the public install action.
- Added `docs/owlbear-gm-setup-tutorial.md` with a click-by-click GM setup and
  recording checklist.
- Rebuilt the deployment bundle and passed the full Chromium, Firefox, and
  WebKit desktop/mobile deployment suite after updating regressions to use the
  new Table Tools controls.

### Table Tools readability follow-up - 2026-08-16

- Replaced the redundant **All Connections** modal and duplicated Guided Setup
  buttons with five individual connection cards and walkthroughs.
- Marked Roll20, Owlbear Rodeo, Foundry VTT, and World Anvil as **Alpha**. Marked
  the tested Official Clio Builder file exchange as **Verified**.
- Added a two-way official-builder walkthrough covering official `.aschar.json`
  export, official-file import, and the optional CCS spreadsheet export.
- Retired the browser-userscript bridge from the player-facing Roll20 workflow.
  It required a separate manager, browser-specific permissions, and technical
  setup that did not meet the one- or two-action player requirement.
- Kept **Copy Character Macro** as the browser-independent Roll20 fallback for
  this beta. The release direction is now a native Lyrian Chronicles Roll20
  community sheet with a paste-once importer and native roll buttons.
- Reserved token synchronization and turn-tracker automation for a possible
  GM-installed, Pro-only Roll20 Mod later; players will never be required to
  install a browser extension.
- Increased modal width, type size, line spacing, section spacing, button line
  height, wrapping, and mobile sizing to prevent links and buttons from covering
  explanatory text.

### Owlbear Companion v0.2 milestone - 2026-08-16

- Kept Owlbear as one installed **Angel Sword Companion** extension with internal
  modules, rather than asking GMs or players to install several separate extensions.
- Added Character JSON and official `.aschar.json` import inside Owlbear, compact
  character/resource display, player-aware binding to one selected Character-layer
  token, and safeguards against a non-GM replacing another player's binding.
- Added a versioned shared-roll contract, an extension-native connection-test roll,
  a deduplicated room roll log, and a manifest background page so the companion can
  receive and rebroadcast events while its popover is closed.
- Kept the external builder-to-extension transport explicitly Alpha. Modern browser
  storage partitioning can isolate a normal builder tab from an Owlbear extension
  iframe, so the import/binding/test-roll milestone does not depend on that path.
- Kept the sheet authoritative for future visual dice mirroring. A later visual module
  must display the sheet's completed result and must not generate a second outcome.
- Deferred damage/healing, conditions, movement, Lyrian fluid initiative, and mirrored
  3D dice to later modules in the same extension.
- Added the required Owlbear CORS response for local testing and included the complete
  `owlbear/` directory in the GitHub Pages deployment artifact. The public install URL
  remains unpublished until the owner approves deployment.
- Bundled the official Owlbear SDK into the extension itself; runtime use no longer depends
  on an additional CDN. The dependency tree reports no known npm audit vulnerabilities.
- Added architecture and GM setup documentation plus focused contract and browser tests.
  `npm run test:vtt` now passes 79 contract/adapter checks and the standalone Owlbear
  panel import/safeguard test. A real GM + second-player Owlbear room remains the physical
  release gate.
- The normal `npm start` and `npm run serve` commands now build the self-contained Owlbear
  runtimes before starting the local server. The full copied-deployment suite passes in
  Chromium, Firefox, and WebKit at wide, desktop, and mobile sizes, including the assertion
  that every manifest-referenced page and runtime is present in the deployable artifact.
