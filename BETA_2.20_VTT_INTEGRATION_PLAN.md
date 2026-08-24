# Beta 2.20 VTT and Character-Service Integration Plan

> **Priority notice — 2026-08-23:** This plan's older cross-platform ordering is superseded.
> Owlbear Rodeo is the only active VTT release priority. Roll20 and Foundry are parked because
> other contributors own those directions. See `BETA_3_OWLBEAR_RELEASE_ROADMAP_2026-08-23.md`.

Last verified: 2026-08-16

## Naming clarification

- “Albert Rodeo” is almost certainly **Owlbear Rodeo**.
- “Something Anvil” is **World Anvil**, which is primarily a campaign/worldbuilding and
  character-profile service rather than a virtual tabletop.
- **Foundry VTT** is the other major virtual tabletop that is easy to confuse with that
  description, so both Foundry and World Anvil are included in the sheet hub.

## Implemented in Beta 2.20

- Consolidated character files, repair utilities, and platform connections into
  **Table Tools**, the fourth character-sheet mode beside Combat, Crafting, and Gathering.
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
| Roll20 | Copy character/action/ability chat macros and open Roll20. This works for every account with no install. | A native Lyrian Chronicles community sheet for paste-once import and one-click rolls. A later optional GM Mod may add token/turn automation in eligible games. | Keep macro copy in 2.20. The browser userscript is retired from the player workflow. Build and validate the native community sheet next. |
| Owlbear Rodeo | Alpha v0.2 imports Character JSON or `.aschar.json`, binds a player/character/token, and provides a shared room roll feed/log. | A hosted Angel Sword Companion extension using the official SDK. The current external-sheet relay also needs a storage-partition-safe transport or extension-native combat controls. | Keep one installed extension with internal modules. Physically validate v0.2 in a GM + second-player room before adding combat state, visual dice, initiative, or movement. |
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
| Roll20 | LIVE manual fallback: **Copy VTT** / **Copy Character Macro**, then paste in Roll20 chat. TARGET: a native Lyrian Chronicles community sheet with a paste-once importer and native roll buttons | No external-site synchronization is promised. A later GM-installed Roll20 Mod could add token and turn-tracker automation for Pro-created games | Build and validate the community-sheet package in a Pro development game, then submit it to Roll20's community repository |
| Owlbear Rodeo | ALPHA v0.2: one modular extension imports Character JSON or `.aschar.json`, binds the current player/character to one selected Character-layer token, broadcasts complete roll records, and retains a short deduplicated room log | Best-effort room-roll return to an open external builder is implemented, but cross-site `BroadcastChannel` partitioning can block it. The extension-native import, binding, test roll, broadcast, and log use the Owlbear SDK | Install the local manifest in a real room; verify GM + player import/binding, ownership safeguards, background relay, reconnect, and two-browser roll flow. Public manifest still needs deployment |
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

1. **Resolved 2026-08-16:** retire the browser-userscript bridge from the player
   workflow. Keep macro copy as the current fallback and build a native Roll20
   community sheet as the cross-browser one-click play surface.
2. Build the first native Roll20 sheet as an importer and play sheet, then decide
   whether a GM-only Pro Mod adds enough value for token and turn-tracker automation.
3. **Resolved 2026-08-16:** one installed Owlbear extension, internally modular.
   Version 0.2 proves import, binding, and shared rolls; compact combat controls,
   visual dice, combat state, Lyrian initiative, and movement follow progressively.
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

## 2026-08-12 — JesterBaster Lyrian CSB project evaluation

Repository reviewed:
`https://github.com/JesterBaster/Lyrian-Chronicles-foundry-vtt-system`

This project changes the recommended Foundry direction, but it does not yet replace our
system-agnostic companion module.

- It is a real **Custom System Builder (CSB)** world/template effort, not a standalone
  Lyrian Foundry game system. Its world reports Foundry `14.365` and CSB `6.0.2`; its
  companion asset module declares Foundry 12 minimum and 14 verified.
- The working sheet currently has the header, main/sub stats, resources/defences, and 21
  ordinary skill rows. Classes, Combat, Inventory, Crafting, Bio, item templates,
  compendiums, enemy templates, and most expertise buttons are still unfinished.
- Its documented `lyrian_*` keys give us the first concrete third-party Foundry schema we
  could target. The preferred future design is an optional **Export/Import for Lyrian CSB**
  adapter using our canonical `.aschar` model, while retaining our system-agnostic module
  for Foundry users who do not run CSB.
- Do not copy or vendor this repository yet. It has no `LICENSE`, the module manifest's
  license and distribution URLs are blank, and the author entry is still `YOUR NAME HERE`.
  Obtain explicit permission and agree on a versioned schema/import contract first.
- The repository is not currently installable as a clean module: actual CSB components live
  in the included world database, the README-referenced `exports/` template backup is absent,
  and `module.json` distributes only CSS/fonts/docs rather than the actor template.
- High-priority repository hygiene warning: the public tree contains a complete Foundry world
  database, including `data/users`, `data/messages`, `data/settings`, `data/actors`, and other
  LevelDB state. Those records were not inspected. The maintainer should remove the live-world
  database from the public repository and rewrite history (or start a clean repository), then
  publish sanitized CSB template exports/compendiums instead. Deleting files in a new commit
  alone does not remove prior Git history.
- Before integration, compare every formula with Beta 2.20's current rule engine. The CSB
  sheet presently depends on manual base stats and simple derived formulas; it does not yet
  model our race/ancestry automation, complete combat/equipment effects, classes, or inventory.

Recommended sequence at the time of the first review: contact the maintainer; establish
license/credit; obtain or reconstruct a sanitized template and stable key manifest; map
`.aschar` fields to `lyrian_*` keys; build import tests against a clean Foundry 14 + CSB 6.0.2
world; only then expose a Lyrian CSB button in the public builder. Do not package or
redistribute their live-world database.

### 2026-08-12 — collaboration permission confirmed by owner

- The project owner reports speaking directly with JesterBaster on Discord. JesterBaster gave
  permission to collaborate and reuse the Foundry work for the community, with no commercial
  benefit intended by either fan project. The owner also reports prior approval from the game
  owner for this community builder work.
- Treat the collaboration/reuse permission blocker as resolved. Preserve attribution to
  JesterBaster and identify both projects as unofficial fan/community work.
- Before redistribution, capture the permission in durable repository form: preferably a
  short `LICENSE` or `PERMISSION.md` in JesterBaster's repository, or a retained screenshot/
  message link plus an agreed license statement. Lack of profit by itself does not grant reuse
  rights; the explicit permission is the important part.
- Permission does not remove the separate hygiene requirement. Do not vendor or redistribute
  the live Foundry LevelDB world. Ask for a sanitized CSB Export Templates JSON, clean
  compendiums/assets, and a stable `lyrian_*` key manifest. The source repository should remove
  user/message/settings databases and rewrite history or restart from a clean distribution
  repository.
- Also retain the licenses and attribution for third-party dependencies and assets, including
  Foundry VTT, Custom System Builder, and bundled fonts. Mutual fan-project permission cannot
  relicense third-party material.

Updated implementation sequence: document permission/credits; obtain or independently extract a
sanitized CSB template and schema; audit formulas against Beta 2.20; implement an `.aschar` ->
Lyrian CSB mapper; test in a clean Foundry 14 + CSB 6.0.2 installation; then add the public
integration option.

### 2026-08-12 — independent template extraction and mapper groundwork

The owner directed us not to wait for the upstream maintainer to prepare an export. The current
public repository was downloaded at commit
`bb2c7bea22b5b96e91a1f8488efa36f49d465205`, and only the `lyrian_pc` `_template` Actor was
read from the world actor database. The packaged `packs/actor-templates` copy is stale and has
an empty body; the complete current template exists in `data/actors`.

- Created `foundry/csb-reference/`, containing a sanitized template snapshot, a flattened
  163-component key/formula schema, the upstream CSS, and only its seven referenced OFL font
  files. Actor ID, ownership, prototype token, embedded records, template history, and world
  metadata were omitted. No users, chat messages, settings, journals, scenes, or campaign data
  were retained.
- Added `foundry/scripts/lyrian-csb-mapper.mjs`. It maps identity, effective main/sub stats,
  all 21 ordinary skill values, resource currents/defaults, and available defence/speed scratch
  fields. It retains unsupported expertise, classes, breakthroughs, equipment, and non-template
  skills in an explicit coverage report. It does not call Foundry APIs or write Actors.
- Exposed the pure mapping aid as `game.angelSword.mapLyrianCsb()` for later licensed-install
  testing. Existing system-agnostic flag/chat behavior is unchanged.
- Formula comparison confirms the template's simple HP/Mana/RP/Potency/Save formulas cannot
  reproduce every Beta 2.20 modifier. The mapper reports these as `formulaGaps` and does not
  falsify source stats to make them disappear.
- Found two upstream snapshot defects: Roguecraft's roll component key is `lyrian_roll_`, and
  the Intimidation expertise control is labeled/formulated as Negotiation. These must be fixed
  in the CSB template before certification.
- Added `npm run test:foundry-csb`; all 15 sanitizer/schema/mapper checks pass. The broader
  `npm run test:vtt` suite also passes all 58 checks.

Remaining gate: physically import/bind the template in a clean licensed Foundry 14.365 + CSB
6.0.2 world, verify exact `system.props` behavior and sheet rendering, then add a guarded,
backup-first Actor writer. Until that succeeds, there is no public one-click CSB import button.
