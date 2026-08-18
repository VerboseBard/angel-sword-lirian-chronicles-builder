# Angel Sword — Foundry VTT Companion Module (experimental scaffold)

Status: **v0.1.0 scaffold, NOT yet tested against a live Foundry install.**

The module now also ships a read-only mapping aid for JesterBaster's community
`lyrian_pc` Custom System Builder template. It converts an imported `.aschar` character to
a `lyrian_*` property plan and reports fields the current partial template cannot represent.
It still does **not** update Actors.

## What it is

A system-agnostic Foundry module that lets a player paste their exported Angel Sword
character and roll its attacks, saves, and checks into Foundry chat. It deliberately never
creates or modifies Actors — Actor schemas belong to the active game system, and guessing
them corrupts worlds (see `../BETA_2.20_VTT_INTEGRATION_PLAN.md`).

Chat commands: `/asimport` (paste exported JSON), `/ascharacter` (summary card),
`/asroll light|heavy|precise|save|init`, `/asroll 4d6+6 Some Label`.

For development inspection after `/asimport`, run this in the Foundry console:

```js
game.angelSword.mapLyrianCsb()
```

The sanitized pinned template/schema/style reference and known upstream defects are documented
in `csb-reference/README.md`.

## Install (once released)

Foundry → Add-on Modules → Install Module → paste the manifest URL:
`https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/foundry/module.json`

**Release requirement:** Foundry downloads the module as a zip. Before announcing this,
create `angel-sword-lyrian.zip` containing `module.json` + `scripts/` at the path the
manifest's `download` field points to (or repoint `download` at a GitHub Release asset).

## Verification checklist (needs a real Foundry license/install)

1. Install via manifest URL on Foundry v11 and v12, then repeat on Foundry 14 before claiming
   current-version compatibility.
2. In any world/system: `/asimport` with a real builder export → notification names the character.
3. `/asroll heavy` posts `1d20+<bonus>` with the right bonus from the export.
4. `/asroll save` posts `2d10+<save>`.
5. Confirm no Actor, Item, or system data was touched (fresh world diff).
6. Bump `verified` compatibility to the tested versions.
7. In a clean Foundry 14.365 + CSB 6.0.2 world, import/bind the sanitized `lyrian_pc`
   reference or a clean upstream export.
8. Run `game.angelSword.mapLyrianCsb()` and compare every returned prop with the matching
   CSB field on a Fae/Sylph and a Human character.
9. Confirm formula gaps and unmapped classes, breakthroughs, equipment, and expertise are
   visibly reported; nothing may be silently discarded.
10. Only after those checks pass, implement and separately test an opt-in Actor update with
    backup/restore and template/version guards.
