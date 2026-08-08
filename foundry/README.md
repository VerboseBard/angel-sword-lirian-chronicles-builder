# Angel Sword — Foundry VTT Companion Module (experimental scaffold)

Status: **v0.1.0 scaffold, NOT yet tested against a live Foundry install.**

## What it is

A system-agnostic Foundry module that lets a player paste their exported Angel Sword
character and roll its attacks, saves, and checks into Foundry chat. It deliberately never
creates or modifies Actors — Actor schemas belong to the active game system, and guessing
them corrupts worlds (see `../BETA_2.20_VTT_INTEGRATION_PLAN.md`).

Chat commands: `/asimport` (paste exported JSON), `/ascharacter` (summary card),
`/asroll light|heavy|precise|save|init`, `/asroll 4d6+6 Some Label`.

## Install (once released)

Foundry → Add-on Modules → Install Module → paste the manifest URL:
`https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/foundry/module.json`

**Release requirement:** Foundry downloads the module as a zip. Before announcing this,
create `angel-sword-lyrian.zip` containing `module.json` + `scripts/` at the path the
manifest's `download` field points to (or repoint `download` at a GitHub Release asset).

## Verification checklist (needs a real Foundry license/install)

1. Install via manifest URL on Foundry v11 and v12.
2. In any world/system: `/asimport` with a real builder export → notification names the character.
3. `/asroll heavy` posts `1d20+<bonus>` with the right bonus from the export.
4. `/asroll save` posts `2d10+<save>`.
5. Confirm no Actor, Item, or system data was touched (fresh world diff).
6. Bump `verified` compatibility to the tested versions.
