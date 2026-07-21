# Beta 2.13 Full Build Audit

Audit date: July 21, 2026  
Build: Angel Sword Lyrian Chronicles Beta 2.13 public release  
Default rules: 0.13.1  
Historical rules retained: 0.13.0, 0.12.6, 0.12.5

## Result

Beta 2.13 passes every release gate available on this machine. The standard public bundle contains the shared rules, Quick Build, performance, autosave, caching, Safari, desktop, and mobile fixes. It does not load or bundle the separate service-provider layer.

Fresh storage selects 0.13.1. Older versions load only after explicit selection, persist across reloads, and can be switched without stale class or detail data. The existing GitHub Pages path, browser storage keys, shared Build Lab link format, and export formats remain unchanged.

## Production build

- Target: `es2020,safari15`
- Minified bundle: approximately 656 KB before transfer compression
- Source map retained for debugging
- Regex-lookbehind guard: passed
- Obsolete in-app update controls and updater runtime: absent
- Separate service-provider runtime: absent
- Static tags and manifest default: both 0.13.1

## Cross-browser deployment gate

`npm test` passed twice after the final port, including once after the mobile word-wrap polish.

The suite tested a GitHub-Pages-shaped deployment artifact in:

- Chromium at 1660×760, 1280×800, and 390×844
- Firefox at 1660×760, 1280×800, and 390×844
- WebKit at 1660×760, 1280×800, and 390×844

The automated and visual checks covered:

- direct-file startup
- fresh 0.13.1 default selection
- older-version selection, persistence, switching, and isolation
- Custom Build and Quick Build flows
- wide and 1280 px desktop layouts
- phone navigation, choice overlays, Quick Build details, and live sheet
- save and pending-edit flush behavior
- deferred optional runtimes and print-sheet construction
- lazy images and rules-version caching
- network, console, missing-resource, and DOM failures

Final result: `[TEST SUCCESS] All deployment artifact layout, network, and DOM assertions passed.`

## Rules and Quick Build coverage

The cross-browser suite completed:

- 28 Standard/Mirane Quick Build package checks across 14 packages
- Phoenix and Demon shortcut checks
- 705 rendered class progressions across four rules versions
- 19,186 class-availability states across 53 race and ancestry paths in Standard and Mirane starts
- 25 selectable proficiency grants across 16 classes

`npm run test:rules0131` passed and confirmed:

- Divine's Chosen selection and Divine damage/mastery mapping
- Selkie's granted level-2 Hydromancer with no EXP or Interlude cost
- Seven Sorrows prerequisite handling
- Gnome Seven Sorrows Rush classes, breakthroughs, five Fighter proficiency choices, Katana purchase, equipped state, and budget
- Raijin Bard Expertise Rush classes, Singing expertise, breakthroughs, equipment, equipped state, and budget
- Selkie Cleric Support classes, Divine's Chosen, Kari choice, Magic Staff proficiency, staff/shield/medical-kit equipment, equipped state, and budget

`npm run audit:minmax` passed and reported the legal accelerated unlock routes for review, including alternate mastery, racial spell/mastery/proficiency sources, explicit class grants, and item text that can influence cascades.

## Performance and compatibility improvements retained

- Safari/iOS lookbehind parse failure removed and mechanically guarded
- static first load aligned to rules 0.13.1 to avoid a duplicate rules parse
- stable version URLs and in-session parsed-version reuse
- debounced sheet rendering and persistence with correct revision invalidation
- close/visibility flushing for pending sheet and note edits
- deferred heavy export and 3D-dice runtimes
- deferred 738-element print-sheet construction
- lazy/async browse artwork
- WebP homepage backgrounds and PWA icons
- 1280 px two-column desktop layout
- narrow-phone wrapping and touch-target corrections

## Physical-device limits

Browser-engine emulation validates layout and behavior but cannot certify battery use, heat, memory pressure, touch latency, home-screen installation, or branded privacy features on real hardware.

Still recommended after publication:

- Safari on a physical older supported iPhone and a current iPhone
- Chrome and Firefox on representative Android hardware
- Brave with Shields enabled
- Edge and Chrome on Windows

These are follow-up device checks, not known failures.
