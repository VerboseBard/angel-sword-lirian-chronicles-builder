# Mirane Expedition Character Start

Source reviewed: the connected Google Doc titled **Mirane Expedition**, including its Character Creation Guidelines, Restricted Classes, and Mirane Specific Gameplay Changes tabs/sections.

## Builder impact

Mirane does not replace standard character creation. The campaign explicitly uses the rules-as-written character start and adds a campaign overlay:

- +1000 starting Clim, producing 4000 before breakthrough bonuses.
- New characters only; transferred characters require a different workflow outside this builder.
- Angelblooded, Shinigami Eyes, Vampire, and other restricted/GM-choice creation paths are unavailable at character creation.
- A character cannot enter with an individual crafting material whose base value is 1000 Clim or more.
- Ingots and raw crafting materials are capped at 2500 Clim total.
- Non-food materials must be things the character could harvest or use; this remains a lead-DM review because the builder cannot reliably infer campaign justification.

Stats, the 1000 class EXP start, the 300 breakthrough-only EXP pool, and the normal class Interlude Point budget do not change.

## Implementation

`builder.startMode` stores `standard` or `mirane`. Missing or unknown values migrate to `standard` so existing saves retain their previous behavior.

The top identity banner owns the start selector directly beneath Character Name. Activating Mirane requires confirmation. Starting funds derive the Mirane bonus automatically. Restricted breakthroughs/classes remain visible but disabled with a campaign explanation. The Equipment step enforces machine-checkable material limits and shows the remaining DM-review requirement.

Expedition rewards, rest recovery changes, death/retirement inheritance, lockouts, casual mode, Astra poisoning, housing, and Mirane downtime actions are campaign-play rules and intentionally do not modify creation math.
