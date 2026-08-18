# Beta 2.20 Roll20 Integration Handoff

Last updated: 2026-07-21

> **Product disposition — 2026-08-16:** The userscript bridge documented below
> is retained only as historical/developer protocol work. It is no longer a
> player-facing feature or a release candidate because it requires a separate
> userscript manager and browser-specific security settings. Do not continue the
> Tampermonkey/Violentmonkey rollout. The active direction is the native Roll20
> community sheet and paste-once importer described in
> `docs/roll20-native-sheet-plan.md`.

## Read this first

This is the authoritative feature handoff for the Beta 2.20 Roll20 integration. Also read
`BETA_2.20_AI_HANDOFF.md` before changing code because it contains the complete rules work,
test record, repository boundary, and other unfinished Beta 2.20 decisions.

## Repository boundary

- Make implementation changes only in `Angel Sword Lirian Chronicles Public Beta 2.20`.
- Branch: `agent/beta-2-20-development`.
- Do not edit Beta 2.12, Beta 2.13, `.publish-public`, archives, or the live public repository.
- The live GitHub Pages release remains Beta 2.13 until Beta 2.20 is explicitly approved,
  committed, and published.
- The visible/package identity intentionally still says 2.13 during development. Rename it
  only when the Beta 2.20 feature set is settled.
- The current working tree is uncommitted and contains rules, Quick Build, documentation,
  VTT, source-bundle, and test changes. Preserve all of them.

## Owner decision

Roll20 is the first live adapter because it is the tabletop used by most people who use this
builder. Owlbear Rodeo, Foundry VTT, and World Anvil remain later integrations.

## What is already implemented

- Desktop character-sheet toolbar includes **VTT & Sharing**.
- Mobile character-sheet Tools includes the same VTT destination.
- The hub includes Roll20, Owlbear Rodeo, Foundry VTT, and World Anvil with honest capability
  labels rather than false connection indicators.
- Every basic action and quick ability includes **Copy VTT**.
- Roll20 character, action, and ability macros use `&{template:default}`.
- Macro values strip braces/newlines before entering Roll20 template fields.
- World Anvil profile-summary copying is available.
- External links use `noopener noreferrer`.
- No service passwords, API tokens, webhooks, or other credentials are requested or stored.
- Copying a macro does not roll dice or spend AP, RP, Mana, HP, inventory, or other resources.

Primary implementation files:

- `src/js/integrations.js`
- `src/js/ui.js`
- `src/css/main.css`
- `index.html`
- `scripts/test-cross-browser.mjs`
- `BETA_2.20_VTT_INTEGRATION_PLAN.md`

## Source and protocol provenance

The detailed compatibility report at the workspace root,
`../ROLL20_VTT_INTEGRATION_NOTES_2026-07-21.md`, came from a Claude (Fable 5) session that
scraped the official Clio character builder.

The original raw temporary folder named in that report is no longer on disk. On 2026-07-21,
the current official sources were independently reacquired and verified at these endpoints:

- `https://clio.angelssword.com/characterbuilder/js/battle-mode.js`
  - HTTP 200
  - 110,296 bytes when checked
- `https://clio.angelssword.com/characterbuilder/roll20/clio-companion.user.js`
  - HTTP 200
  - 21,673 bytes when checked
  - userscript version 0.4.0
- `https://clio.angelssword.com/characterbuilder/sheet.html`
  - HTTP 200
  - 5,579 bytes when checked

Do not commit or redistribute those upstream source files. Use them to verify observable
behavior only. The public Beta 2.20 bridge must be a clean-room implementation.

## Recorded companion protocol

### Sheet to companion

- Ping: `{ source: "clio-battle", type: "ping" }`
- Send macro: `{ source: "clio-battle", type: "send", id, macro, ...optionalMetadata }`
- Selected token query: `{ source: "clio-battle", type: "getSelected", id }`

Optional send metadata recorded by the prior scrape includes `kind`, `bonus`, `formula`, and
`tokenId`.

### Companion to sheet

- Status: `{ source: "clio-companion", type: "status", roll20: boolean }`
- Send acknowledgement: `{ source: "clio-companion", type: "ack", id, ok, error }`
- Selected token result:
  `{ source: "clio-companion", type: "selected", id, ok, tokenId, name }`

### Recorded behavior

- The sheet pings every five seconds.
- Macro sends use unique IDs and a three-second acknowledgement timeout.
- The upstream implementation uses both `window.postMessage` and a DOM-attribute mailbox
  with a `clio-battle-poke` event because userscript/page WindowProxy checks can be unreliable.
- The Roll20 side treats a live chat input as its heartbeat and injects the macro into chat.
- Cross-tab transport uses userscript storage and change listeners with polling fallback.
- Recorded upstream storage concepts are `r20_alive`, `clio_send`, `clio_ack`, `clio_query`,
  and `clio_query_ack`. A clean-room bridge should use its own namespaced keys so it does not
  collide with the official companion.
- A successful acknowledgement is required before any automatic local resource spend.
- Token-bar convention in the prior integration: bar 1 HP, bar 2 Mana, bar 3 RP, bar 4 Shield.
- Token synchronization requires the GM-approved TokenMod Roll20 Mod and therefore cannot be
  assumed for every table.

## Public-origin problem

The official companion matches the official Clio origin, localhost, 127.0.0.1, and a limited
file path. It does not match the public builder origin:

`https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/`

Therefore the public release needs its own optional bridge/userscript or upstream permission
and origin support. Do not claim the current GitHub Pages build is directly connected.

## Required implementation order

1. Create a behavior-level protocol fixture from the current 0.4.0 observable messages.
2. Add a sheet-side connection manager with ping, status aging, unique request IDs,
   acknowledgement correlation, timeout handling, reconnect behavior, and cleanup.
3. Display `Not installed`, `Roll20 not open`, `Connected`, `Sending`, `Sent`, and `Error`
   states in the existing VTT hub.
4. Build a separately versioned clean-room Tampermonkey userscript supporting:
   - the public GitHub Pages origin;
   - localhost and 127.0.0.1 development origins;
   - `https://app.roll20.net/*`.
5. Implement direct macro sending without automatic resource spending.
6. Add acknowledgement-gated spending only after direct send is reliable and covered by tests.
7. Add selected-token pinning.
8. Add optional TokenMod bar synchronization behind an explicit setting and explanation.
9. Add initiative/turn-tracker support after basic sending and reconnect behavior are stable.
10. Check Violentmonkey compatibility after the Tampermonkey implementation passes.

## Security and product rules

- The bridge must be optional, explicitly installed, separately versioned, and removable.
- List every userscript match/permission clearly. Do not request unrelated sites.
- Keep all communication local to the user's browser.
- Do not send character data to a hosted service.
- Do not store secrets in exported characters, browser saves, or source code.
- Do not copy official Clio source code. Reimplement the small observable protocol cleanly.
- Do not spend resources on timeout, negative acknowledgement, missing Roll20 tab, or copy-only
  actions.
- Deduplicate repeated send IDs so reconnects/polling cannot post a macro twice.
- Escape/sanitize every macro field and cap payload sizes before crossing the bridge.
- TokenMod and turn-tracker features must be opt-in and described as advanced Roll20 support.

## Required tests

- Protocol unit tests: ping/status, request ID correlation, positive/negative ack, timeout,
  duplicate ack, stale status, reconnect, and teardown.
- Userscript transport tests with mocked userscript storage and multiple Roll20 tabs.
- End-to-end happy path: connected sheet sends one macro and receives one acknowledgement.
- End-to-end failure paths: Roll20 closed, bridge absent, chat unavailable, timeout, malformed
  message, and duplicate delivery.
- Verify no spend on copy, failure, timeout, or duplicate ack.
- Verify exactly one spend after one successful ack when acknowledgement-gated spending is added.
- Retain the existing Chromium, Firefox, and WebKit desktop/mobile VTT hub tests.
- Physical follow-up: Chrome, Edge, Firefox, Brave with Shields, and Safari where the chosen
  userscript manager is actually supported.

## Current verification baseline

All gates passed after the first VTT/sharing layer:

- `npm.cmd test` — `[TEST SUCCESS]` in Chromium, Firefox, and WebKit at wide, desktop, and
  390×844 mobile layouts.
- Existing deep audit retained 28 Quick Builds, 705 class progressions, 19,186 availability
  states, and 25 selectable proficiency grants.
- `npm.cmd run test:rules0131` — passed.
- `npm.cmd run audit:minmax` — passed.
- `node --check src/js/integrations.js` — passed.
- `git diff --check` — passed with only LF/CRLF notices.

Run the same gates after every bridge milestone. Do not mark the bridge release-ready based
only on unit tests.

## 2026-07-22 session — implementation-order steps 1–5 built

Completed by a Claude (Fable 5) session, following the required order:

1. **Protocol fixture/spec (step 1):** `BETA_2.20_ROLL20_PROTOCOL_SPEC.md` (behavior-level,
   no upstream code) plus the machine fixture `scripts/roll20-protocol-fixture.mjs` with
   message samples and shape validators. A drift test asserts the implementation constants
   equal the fixture's.
2. **Sheet-side connection manager (step 2):** `src/js/roll20-bridge.js` —
   dependency-injected factory (fully unit-testable without a browser). Two dialects with
   identical shapes: `asb-battle`/`asb-companion` (our userscript) and
   `clio-battle`/`clio-companion` (official companion, which also activates on localhost dev
   origins). A send is routed to exactly ONE dialect (asb preferred) so both userscripts
   installed can never double-post. Ping every 5 s, 15 s status aging, unique request ids,
   ack correlation, 3 s timeout, duplicate-ack ignore, reconnect state events, teardown.
3. **Hub connection states (step 3):** the Roll20 card now shows a live status chip
   (`Bridge not installed` / `Roll20 not open` / `Connected`), a `Send to Roll20` button
   (disabled unless connected; Sending…/Sent ✓/Send failed states), and an `Install Bridge`
   link to the userscript. CSS: `.integration-status.is-live` / `.is-warn`.
4. **Clean-room userscript (step 4):** `roll20/angel-sword-roll20-bridge.user.js` v0.1.0.
   @match: the public GitHub Pages origin, localhost, 127.0.0.1, app.roll20.net. Storage
   keys namespaced `asb20_*` (no collision with the official companion). Grants:
   GM_setValue/GM_getValue/GM_addValueChangeListener only. Builder side: dual page→script
   transports (postMessage + DOM mailbox), id dedupe, size caps, origin filtering. Roll20
   side: heartbeat while the chat box exists, freshest-heartbeat tab arbitration,
   DOM-route chat injection with draft restore, ok/error acks. No page-internal Roll20
   objects are touched in v0.1.
5. **Direct sending without spending (step 5):** the hub send posts the character macro and
   spends nothing; there is no spend code anywhere in the bridge path.

Tests added: `npm run test:roll20` (`scripts/test-roll20-bridge.mjs`, 47 checks) covering
spec drift, ping/status, ack correlation, negative ack, timeout, duplicate ack/dedupe,
stale-status aging, reconnect, dialect preference, teardown, both userscript personalities
with mocked storage, multi-tab arbitration, cross-origin rejection, and oversized payloads.

Gate status this session — ALL PASSED: `test:roll20` 47/47; `npm.cmd run test:rules0131`
passed; `npm.cmd run audit:minmax` passed; full cross-browser `npm.cmd test` finished with
`[TEST SUCCESS]` in Chromium, Firefox, and WebKit (wide/desktop/mobile); `node --check` and
`git diff --check` clean (usual CRLF notices).

## 2026-07-22 later session — per-card sends + ack-gated spending (steps 5b/6)

- Every basic action and quick ability card now has a **⚔ Send** button next to Copy VTT.
  The buttons exist in the DOM but are CSS-hidden until the bridge reports a live Roll20
  tab (`body.asb-r20-connected`, toggled by the connection manager, which now also starts
  with the play dashboard, not just the hub).
- **Ack-gated spending (step 6) is in:** a card send posts the macro first and spends the
  action/ability's tracked cost through `usePlayCost` ONLY inside the promise resolution
  of a positive ack. Failures, timeouts, copies, and duplicate acks spend nothing (the
  bridge promise settles exactly once). Passive/no-cost entries just post.
- New END-TO-END functional test in the cross-browser suite: an in-page fake companion
  speaks the real `asb-battle`/`asb-companion` postMessage protocol (status + ok ack sent
  TWICE), the test clicks a card ⚔ send and asserts exactly one send and exactly one
  spend log entry. Passed in Chromium, Firefox, and WebKit, desktop and mobile, alongside
  every prior assertion (`[TEST SUCCESS]`, plus test:roll20 47/47 and test:vtt 35/35).

## 2026-07-22 third session — steps 7–10 implemented (bridge v0.2.0)

- **Step 7 — token pinning:** the manager gained `getSelectedToken()` (query correlation,
  timeout, duplicate-reply ignore, teardown — same discipline as sends). Userscript v0.2.0
  implements `getSelected` end to end: builder side relays through `asb20_query` /
  `asb20_query_ack` with id dedupe; Roll20 side reads the tabletop selection via
  `unsafeWindow` page access with a main-world script-execution fallback. The hub's Roll20
  card now has **Pin Selected Token** / Unpin with the pinned name displayed; the pin
  persists in `state.play.roll20TokenId/Name` (exports with the character).
- **Step 8 — TokenMod bar sync (opt-in):** hub checkbox; when enabled + pinned +
  connected, resource changes debounce into
  `!token-mod --ignore-selected --ids <pinned> --set bar1…bar4` (bar1 HP, bar2 Mana,
  bar3 RP, bar4 Shield), deduped against the last sent values, sent as an ordinary macro.
  Clearly labeled as needing the GM-installed TokenMod mod.
- **Step 9 — turn tracker (opt-in):** second hub checkbox; an initiative roll then sends
  its result macro with `kind:"initiative"`, `pr` = the SHEET's rolled total (one source
  of truth — the bridge never re-rolls), and the pinned `tokenId`. The Roll20 side writes
  that token into `d20.Campaign` turn order (deduped by token id) when main-world access
  is available, and degrades to macro-only otherwise.
- **Step 10 — Violentmonkey review (best-effort, physical check pending):** the script
  uses only `GM_setValue`/`GM_getValue`/`GM_addValueChangeListener`/`unsafeWindow`,
  `@noframes`, standard `@match` patterns, and a blob-URL Worker — all supported by
  current Violentmonkey; `GM_addElement` is deliberately NOT used. Storage polling already
  covers managers whose change events are unreliable. Verdict: review-compatible;
  real-install verification remains on the physical checklist.
- Tests grew to **64 checks** in `npm run test:roll20` (query correlation/timeout/dupes,
  TokenMod command shape, userscript query relay both sides, initiative passthrough), and
  the cross-browser suite gained a pin-flow assertion against the fake in-page companion.
- Protocol spec updated: `getSelected` implemented, `pr` metadata semantics, full storage
  key list, TokenMod section 5b.

## Immediate next action

Do not spend additional player-product time on the userscript. Build the native
Roll20 community-sheet package and a versioned **Copy Roll20 Import Code** export
from the builder. Test that package in a Pro development game, then prepare the
community-repository submission. The sheet must remain fully useful to free
players after the GM selects it; any later Roll20 Mod is optional, Pro-only, and
installed by the game creator rather than individual players.
