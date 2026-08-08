# Beta 2.20 VTT and Character-Service Integration Plan

Last verified: 2026-07-21

## Naming clarification

- “Albert Rodeo” is almost certainly **Owlbear Rodeo**.
- “Something Anvil” is **World Anvil**, which is primarily a campaign/worldbuilding and
  character-profile service rather than a virtual tabletop.
- **Foundry VTT** is the other major virtual tabletop that is easy to confuse with that
  description, so both Foundry and World Anvil are included in the sheet hub.

## Implemented in Beta 2.20

- Added one **VTT & Sharing** button to the desktop character-sheet toolbar.
- Added the same destination to the mobile character-sheet Tools modal.
- Added compact **Copy VTT** controls to every basic action and quick ability.
- Roll20 action, ability, and character-summary macros use the standard
  `&{template:default}` chat format and sanitize braces/newlines before copying.
- Added a World Anvil-friendly profile summary copy.
- Added safe launch links for Roll20, Owlbear Rodeo, Foundry VTT, and World Anvil with
  `noopener noreferrer` isolation.
- Reused the current character export entrypoint for Owlbear/Foundry preparation.
- Added no credential fields and made no claim that a platform is connected when its
  required adapter is absent.

## Platform evaluation

| Platform | Useful now | What true automatic linking requires | Recommendation |
|---|---|---|---|
| Roll20 | Copy character/action/ability chat macros and open Roll20. This works for every account with no install. | A separately installed userscript/browser bridge must relay messages into the Roll20 chat box. Roll20 Mods run in a server-side sandbox and cannot fetch or control this public sheet. | Keep macro copy in 2.20. Build and version the public-origin bridge separately only after installation/support scope is approved. |
| Owlbear Rodeo | Export the Angel Sword character and open Owlbear. | An Owlbear extension manifest and iframe app using the official SDK. The extension can use room broadcasts and Owlbear APIs for rolls/token state. | Best first true live adapter after Roll20 macro copy. It is officially sanctioned and works well with static hosting. |
| Foundry VTT | Export the Angel Sword character and open Foundry. | A Foundry module/importer. Actor data is governed by the installed game system, so a generic external JSON file cannot safely guess its schema. | Best full-featured adapter. Create a small Angel Sword module that stores canonical data in module flags and generates Actor/chat actions. |
| World Anvil | Copy a formatted character profile and open World Anvil. | A registered application plus a user authorization token, handled by a backend or secure local companion. | Keep copy/paste support. Do not put World Anvil API secrets into this public GitHub Pages application. Revisit only if users want World Anvil publishing enough to justify a secure service. |

## Interface direction

Keep one sheet-level hub instead of four permanent toolbar buttons. Contextual actions can
offer Copy VTT now and later change to Send when a verified adapter acknowledges a live
connection. Any future live adapter must show one of these honest states:

- Not installed
- Ready to connect
- Connected
- Error / reconnect

A copied macro must never spend AP, RP, Mana, HP, items, or other local resources. A future
direct-send action may spend resources only after an explicit successful acknowledgement
from the adapter.

## 2026-07-22 — Adapter groundwork implemented (Claude/Fable 5 session)

Owner direction: lay the groundwork for every discussed platform so dice rolls and actions
can work back and forth between our sheet and the programs; live testing is deferred (the
owner cannot test right now), so each adapter is marked with its exact verification debt.

### New shared plumbing

- `src/js/vtt-relay.js` — the sheet now publishes every roll (dice tray, action damage,
  attack/save/initiative checks, skill checks) on a same-origin BroadcastChannel
  (`asb-vtt-events`). Payloads carry only table-visible facts (label, formula, breakdown,
  total, character name). Fire-and-forget; no listener costs nothing.

### Per-platform state and the "back and forth" story

| Platform | Outbound (sheet → table) | Inbound (table → sheet) | Verification debt |
|---|---|---|---|
| Roll20 | LIVE (pending physical check): macros via Copy VTT, one-click send via the bridge userscript + hub Send button | Feasible later: the bridge's Roll20 side could relay chat results back over the same storage pipe (not built) | Tampermonkey + real Roll20 game; checklist in `BETA_2.20_ROLL20_HANDOFF.md` |
| Owlbear Rodeo | SCAFFOLDED: `owlbear/` extension — room owner adds the manifest URL; the panel mirrors this sheet's rolls to every player via `OBR.broadcast` | WORKS BY DESIGN in the scaffold: remote players' rolls arrive on the same OBR channel and render in the panel | Add manifest to a real room; verify popover loads, CDN SDK import, broadcast both ways; then decide compact-panel vs sheet-embed (owner question 3) |
| Foundry VTT | SCAFFOLDED: `foundry/` module — `/asimport` a builder export, `/asroll light|heavy|precise|save|init` posts real Rolls to chat | Deliberately none in v0.1 (module stores per-user flags only; never touches Actors) | Needs a licensed Foundry install: run `foundry/README.md` checklist; package the release zip |
| World Anvil | LIVE: plain profile copy + NEW BBCode article copy (`buildWorldAnvilBBCodeProfile`) | Not applicable (World Anvil is a campaign wiki, not a live table) | None for copy; API publishing stays deferred (secrets) |
| dddice / Talespire (discussed, not in hub) | Talespire: `talespire://dice/...` URL scheme is trivial to add to roll cards if wanted. dddice: REST API + rooms could mirror our relay events as synced 3D dice, but the API key is a credential — same security decision as Discord webhooks. | dddice rooms are inherently two-way | Owner decision whether either earns a hub card |

### Files added

- `src/js/vtt-relay.js` (+ publish calls at the four roll sites in ui.js)
- `owlbear/manifest.json`, `owlbear/panel.html`, `owlbear/panel.js`, `owlbear/icon.svg`
- `foundry/module.json`, `foundry/scripts/angel-sword.mjs`, `foundry/README.md`
- `buildWorldAnvilBBCodeProfile` in `src/js/integrations.js`; hub gains Copy BBCode
  Article, Copy Manifest URL (Owlbear), and updated honest card copy
- `scripts/test-vtt-adapters.mjs` (`npm run test:vtt`, 35 checks: manifest shapes vs the
  documented references, script parse checks, no-Actor-writes guard, BBCode output, relay
  hygiene — no network calls, no credentials)

### Defaults chosen for the two open owner questions (reversible)

- Owlbear (question 3): compact roll/action panel first, not a full sheet embed — it is the
  smallest thing that delivers live rolls to the whole room.
- Foundry (question 4): system-agnostic module storing data in per-user flags — per this
  plan's own boundary; an Angel Sword game system remains a possible later upgrade.

## Next decisions needed from the owner

1. **Resolved 2026-07-21:** build the public Roll20 bridge first because Roll20 is where most
   users of this builder play.
2. Confirm whether the optional bridge should target Tampermonkey first or also include
   installation instructions for Violentmonkey from its first release.
3. For Owlbear, should the extension embed the full Angel Sword sheet or provide a compact
   roll/resource panel linked to the existing public sheet?
4. For Foundry, will Angel Sword use its own Foundry game system, or should the module be
   system-agnostic and store data only in module flags?

## Official sources checked

- Roll20 API sandbox restrictions:
  https://help.roll20.net/hc/en-us/articles/360037772853-API-Sandbox-Model
- Roll20 character-sheet development and macros:
  https://help.roll20.net/hc/en-us/articles/360037773413-Intro-to-Sheet-Development
- Owlbear Rodeo extension architecture:
  https://docs.owlbear.rodeo/extensions/getting-started/
- Owlbear Rodeo manifest reference:
  https://docs.owlbear.rodeo/extensions/reference/manifest/
- Owlbear Rodeo broadcast API:
  https://docs.owlbear.rodeo/extensions/apis/broadcast/
- Foundry module development:
  https://foundryvtt.com/article/module-development/
- Foundry Actors and JSON import boundary:
  https://foundryvtt.com/article/actors/
- World Anvil API authentication and secret-handling warning:
  https://www.worldanvil.com/api/aragorn/documentation
- World Anvil character profiles:
  https://www.worldanvil.com/player
