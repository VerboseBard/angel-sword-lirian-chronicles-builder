# Lyrian CSB collaboration reference

This folder is a sanitized, version-pinned reference for the community Lyrian Chronicles
Custom System Builder sheet by JesterBaster:

`https://github.com/JesterBaster/Lyrian-Chronicles-foundry-vtt-system`

The Angel Sword builder owner reports explicit permission from JesterBaster to collaborate
and reuse the work for this noncommercial community project. Preserve that attribution and
retain the upstream permission record when it becomes available in durable form.

## Snapshot provenance

- Upstream commit: `bb2c7bea22b5b96e91a1f8488efa36f49d465205`
- Foundry: `14.365`
- Custom System Builder: `6.0.2`
- Extracted: 2026-08-12

The complete `lyrian_pc` template was reconstructed from the upstream world's `data/actors`
LevelDB because the separately packaged `packs/actor-templates` snapshot is stale and contains
an empty template body. No user, chat-message, settings, journal, scene, or campaign records are
included here. The downloaded live-world copy was used only for this extraction and was removed
afterward.

## Files

- `jesterbaster-lyrian-pc-template.json` — sanitized Actor-template reference. It omits the
  upstream actor ID, ownership, prototype token, embedded records, history, and world metadata.
  It is not yet certified as a direct CSB/Foundry import file.
- `jesterbaster-lyrian-pc-schema.json` — flattened component/key/formula inventory used for
  auditing and mapper tests.
- `customcss.css` and `fonts/` — the upstream sheet theme and only the seven font files it
  actually references. Font license is retained as `fonts/OFL.txt`.
- `../scripts/lyrian-csb-mapper.mjs` — pure `.aschar` to `lyrian_*` property mapping. It does
  not write Foundry Actors.

## Current capability and gaps

Usable now: identity, effective main/sub stats, 21 ordinary skill values, HP/Mana/AP/RP current
values, and the existing header scratch values for guard, evasion, block, initiative, and speed.

Not represented by the current template: class data; breakthroughs; equipment/item documents;
expertise storage; abilities; proficiencies; crafting; biography; and several final derived-stat
adjustments. Those remain authoritative in the Beta 2.20 `.aschar` payload and are reported as
unmapped by the mapper rather than silently discarded.

Two upstream component defects were found in this pinned snapshot:

1. Roguecraft's roll component key is `lyrian_roll_` instead of
   `lyrian_roll_roguecraft`.
2. `lyrian_exp_roll_expertise_intimidation` is labeled and calculated as Negotiation, using
   `lyrian_sk_negotiation` instead of Intimidation.

Do not expose Actor-writing or promise one-click import until the checklist in `../README.md`
has been completed in a clean licensed Foundry 14 + CSB 6.0.2 test world.

