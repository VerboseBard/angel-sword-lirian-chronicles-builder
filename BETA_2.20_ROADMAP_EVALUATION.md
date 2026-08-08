# Beta 2.20 Roadmap Evaluation

Evaluated: 2026-07-21

This evaluates `UPDATE_ROADMAP_2026-07-21.md` against the Beta 2.20 branch, the bundled
0.13.1 rules, the captured official Clio builder, and the existing browser tests. It is a
product recommendation, not a promise that every optional integration belongs in 2.20.

## Recommendation in one sentence

Finish rules correctness and creation flow first (Track A), add portable character exchange
next (E1/E2), then add a small Roll20 copy workflow (B1); treat browser bridges, Discord
credentials, and shared-screen dice as later opt-in integrations rather than release blockers.

## Track A — rules and creation

| Item | Value | Current decision | Interface recommendation | Information still needed |
|---|---|---|---|---|
| A1 Human +100 EXP | Essential | Implemented in 2.20, including Human-Chimera suppression and Slow Starter stacking. | Keep the adjustment in the Classes budget explanation and show remaining EXP normally. | None for builder behavior. A stream timestamp is useful only for provenance. |
| A2 Clio proxy data pull | Essential maintenance | Implemented for the developer-only pull script. Do not restore a browser update checker. | No player-facing control. Rules updates belong to the build/publish workflow. | Confirm only if the official proxy contract or allowed-use policy changes. |
| A3 gathering skills and 15 caps | Essential | Implemented in 2.20. Added Artificer, Herbalism, Fishing, Hunting, Logging; canonicalized Blacksmith; made Farming artisan; removed invented sub-stat links from artisan/gathering skills; capped skills and expertise at 15. | Keep all rows in the Skills grid, label artisan/gathering rows “no linked sub-stat,” block new over-cap spending, and warn on old imported over-cap values. | The fixed PDF and official CCS template cannot visibly fit every extended skill row; embedded state preserves them, but a future export design should decide how to display extras. |
| A4 specialty weapon ruling | Essential | Implemented in 2.20. Generic choices use the eight current groups; explicit legacy/class grants remain recognized. | Show the short legal list in generic selectors; do not hide a class's explicit Magic Staff/Hori-style grant. | None. |
| A5 unused creation IP: Job/Train/Other | High | Confirmed missing and recommended for 2.20, but not yet implemented. It changes three budgets and must be tested as one transaction model. | Add a “Spend remaining Interlude Points” card under the class budget: Job +300 Clim, Train +25 EXP, Other (GM decides). Use steppers, show remaining IP, and provide an optional note for Other. | Confirm whether Train EXP should immediately increase displayed Spirit Core as earned EXP; the official builder clearly adds it to the EXP bank, but the current app's Spirit Core semantics need one consistent migration. |
| A6 Skilled Flier gate | Essential | Implemented and tested for Harpy, Pixie, Tengu, Sylph, and Mothfolk + Racial Flight. | Existing locked-card explanation is sufficient. | None. |
| A7 verification sweep | Essential QA | Rogue's Journey, Anubis/Cu Sith/Mothfolk expertise, Acolyte's Human-or-Divine gate, and all three Paladin variants are now covered. The audit found and fixed the missing key-ability skill-pool path. The remaining gap is the separate two-discipline Transmuter/Alkahest model. | Transmuter disciplines should be two named choice chips on the Skills step and displayed as `Transmuter (discipline)` values, not added to an ordinary crafting skill. | Exact permitted disciplines can be derived from official artisan skill data; owner input is needed only if custom/GM-approved disciplines should be allowed. |

### Track A release position

A1–A4 and A6 are release-quality directions. A5 is valuable but should wait for the Spirit
Core decision above. A7 is a release gate because it checks rule paths already promised by
the builder rather than adding optional scope.

## Track B — Roll20

| Item | Value | Recommendation | Interface | Information needed |
|---|---|---|---|---|
| B1 copyable Roll20 macro | High for Roll20 groups, low risk | Do after Track A. It works without installations and can be useful even if later bridge work is rejected. | Add “Copy Roll20 macro” to an action's overflow/share menu and a global format preference. Avoid placing a second primary button on every ability card. On mobile, use a bottom sheet. | Which Roll20 character sheet/template and attribute names the group actually uses; provide 2–3 real macros if available. |
| B2 official companion protocol | Conditional | Prototype only after B1 and only against a recorded protocol fixture. It is coupled to another tool and can silently break. | An Integrations panel should show connection state and an explicit “Send to Roll20” action. Never auto-spend local resources until a successful acknowledgement is defined. | Protocol documentation/version, expected userscript/companion install, and whether the official project permits compatibility use. |
| B3 clean-room userscript bridge | Low for 2.20 | Defer. It creates an installation, support, security, and Roll20-DOM maintenance burden. TokenMod/ChatSetAttr/turn tracker should be separate later milestones. | If eventually built, publish it as a separately versioned download with connection permissions and a disable switch, not bundled invisibly into the builder. | Whether players are willing to install a userscript or extension, supported browsers, and the minimum Roll20 feature set. |

## Track C — Discord dice

| Item | Value | Recommendation | Interface | Information needed |
|---|---|---|---|---|
| C1 pre-render every dice result | Low | Do not build the proposed animation bank now. The app already renders local 3D dice, and a per-set/per-die/per-face bank adds storage and production work without improving normal play. Create a small generic share animation only if C2 proves it is needed. | Keep the existing Dice settings and local animation. A share preview can be added later. | What Discord result presentation is actually desired: text, static card, short animation, or live bot roll. |
| C2 browser-to-webhook posting | Medium utility, high credential risk | Do not make this a default feature. Webhook URLs are secrets, can be abused if leaked, may hit CORS/rate limits, and must never enter exports or synced saves. Prefer “Copy result for Discord” first; a local companion or bot is safer for automated posting. | If approved, put a masked webhook field, test button, clear-data button, and warning in Integrations. Store locally only and exclude it from every character file. | Explicit acceptance of the credential risk and the target Discord channel workflow. |
| C3 slash-command bot | Low unless there is sustained group demand | Defer; it requires hosting, token rotation, permissions, moderation, and uptime. | Separate service, not a hidden part of the static GitHub Pages app. | Hosting owner, operating budget, privacy policy, and command scope. |
| C4 Discord Activity | Not valuable now | Keep parked. | None. | Revisit only if Discord becomes the primary play surface. |

## Track D — dice on a shared screen

| Item | Value | Recommendation | Interface | Information needed |
|---|---|---|---|---|
| D1 dddice trial | High discovery value | Do the no-code trial before investing in D2/D3. It answers whether shared dice materially improve the table. | No builder change. Record latency, reliability, mobile use, and player reaction. | A real session and the devices/browsers used. |
| D2 OBS overlay page | Medium, especially for streams | Worth a later isolated prototype. Be careful: `BroadcastChannel` may not cross reliably into an OBS browser source depending on process/profile isolation, so a local WebSocket companion may be required. | “Open OBS dice overlay” in Dice/Integrations, plus a copyable URL and a connection indicator. | OBS platform/version and whether a small local helper is acceptable. |
| D3 overlay over Roll20 via userscript | Low / last | Defer until both B3 and D2 are independently stable. It combines both fragile surfaces. | A separate userscript toggle; never inject without explicit installation. | Same decisions as B3 and D2. |

## Track E — interoperability

| Item | Value | Recommendation | Interface | Information needed |
|---|---|---|---|---|
| E1 `.aschar.json` | High | Strong next feature after Track A. Portable, testable, and useful even without Roll20/Discord. Import should be schema-validated and versioned; preserve unknown fields for forward compatibility when safe. | Put “Import Angel Sword character” and “Export Angel Sword character” in the existing save/export area; show a preview before replacing the active character. | Official schema/sample files and confirmation that compatibility/format use is allowed. |
| E2 official CCS spreadsheet | Medium-high | The app already has spreadsheet import/export, so this is a compatibility enhancement, not a new export system. Compare exact cells/formulas and offer an explicit “Official CCS-compatible” export only after parity tests. | Keep the existing workbook export and add a clearly labeled CCS option rather than silently changing formats. | Current official template, redistribution permission, and two sample characters for round-trip testing. |
| E3 homebrew share codes | Low for this release | Defer. Importing executable-like rules content greatly expands validation, conflicts, migrations, and support. Character portability should come first. | Eventually place Homebrew in its own managed library with source, version, conflict, enable/disable, and delete controls. | Locked schemas, trust/signing policy, allowed content types, and actual user demand. |

## Recommended interface structure

Do not scatter integrations across the main builder. Add one **Integrations & Sharing** panel
under the existing tools/export area with four cards: Character Files, Roll20, Discord, and
Stream/OBS. Each card should say Not configured / Connected / Error and expose only the next
useful action. Contextual roll menus can then offer Copy result, Copy Roll20 macro, or Send
only when the related integration is available.

For core creation, keep rule decisions where the budget is visible:

- Human/Slow Starter EXP stays in Classes.
- Job/Train/Other belongs directly below the Classes IP summary.
- Skill and expertise cap feedback stays inside each skill row.
- Export compatibility belongs in Save/Export, not in character creation steps.

## Proposed execution order

1. Finish A7 and decide the A5 Spirit Core treatment.
2. Implement and test A5 if the decision is made.
3. Run build, focused rules, min/max, and Chromium/Firefox/WebKit suites.
4. Add E1 schema-backed character exchange.
5. Validate E2 against the official CCS workbook.
6. Add B1 macro copy if Roll20 is confirmed as an active play surface.
7. Trial D1 before any shared-screen dice code.
8. Reconsider B2/D2; keep B3, C2–C4, D3, and E3 out of the 2.20 critical path.
