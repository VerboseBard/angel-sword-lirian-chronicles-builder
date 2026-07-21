# Rules Logic Map

This document explains where the rules behavior lives and how another developer or AI should inspect it.

## Core Files

```text
src/js/rules.js
src/js/ui.js
src/js/state.js
src/js/constants.js
scripts/test-cross-browser.mjs
```

`src/js/rules.js` is the closest thing to the rules engine. `src/js/ui.js` also contains important choice and interaction behavior because the builder UI and rules logic grew together.

## Major Rule Areas

### Race And Ancestry

Useful concepts:

- primary race selection
- ancestry/subrace filtering
- race and ancestry auto-applied effects
- ancestry traits that grant elemental mastery
- secondary lineage choices such as Demon clan behavior

Start with:

```text
src/js/rules.js
src/js/ui.js
```

Search terms:

```text
getSelectedRaceDetail
getSelectedAncestryDetail
getAncestryOptionsByPrimaryRace
getTrackedElementalMasteries
lineage
clan
```

### Class Unlocks And Mastery

Useful concepts:

- selected classes
- class progression
- class mastery
- tier 2 and tier 3 prerequisite checks
- requirements that allow any one of several mastered classes
- elemental mastery unlocking classes
- non-mastery requirements, such as proficiency, spell, rune, or damage-dealing spell gates
- cascading unlocks where a race, breakthrough, item, spell, or class feature makes a later class legal

Start with:

```text
src/js/rules.js
scripts/test-cross-browser.mjs
```

Search terms:

```text
class requirement
mastery
unlock
requirementStatus
elemental mastery
getSelectedClassDetails
getSelectedClassProgress
getClassUnlockBudgetState
```

Important tests:

```text
Class requirement unlock regression
Early Ascension generic class mastery regression
Elemental Affinity mastery unlock regression
Key ability elemental mastery unlock regression
Chosen class elemental mastery unlock regression
Ancestry trait elemental mastery unlock regression
```

Important porting rule:

```text
Do not block rare legal build paths. If the rules allow a chain of choices to satisfy a prerequisite, the builder should calculate that chain and allow it.
```

Example pattern:

```text
racial or ancestry trait -> magic/spell access -> class prerequisite -> class feature or item access -> additional spell/item/class unlock
```

### Breakthroughs

Useful concepts:

- normal selected breakthroughs
- repeatable unique choices, such as Elemental Affinity, Language Training, and Weapon Training
- stackable breakthroughs, such as Skill Training
- breakthrough choice fields that become pending/resolved builder choices
- breakthrough effects that apply to stats, skills, proficiencies, and unlocks

Start with:

```text
src/js/ui.js
src/js/rules.js
src/js/constants.js
```

Search terms:

```text
Elemental Affinity
REPEATABLE_UNIQUE_BREAKTHROUGH_CONFIGS
STACKABLE_BREAKTHROUGH_NAMES
getSelectedBreakthroughRecords
getSelectedBreakthroughEffects
builderChoices
Skill Training
Language Training
Weapon Training
The Unknown Paladin
```

Important tests:

```text
Repeatable Elemental Affinity UI regression
Repeatable Elemental Affinity unlock regression
Repeatable unique breakthrough choice regression
Stackable breakthrough purchase regression
```

### Skills And Expertise

Useful concepts:

- creation skill points
- race and class skill points
- exchanging one eligible skill point for +2 named expertise
- expertise names tied to a skill
- repeated expertise in the same specialty
- only showing active expertise on the play sheet
- expertise roll buttons adding the right bonus

Start with:

```text
src/js/constants.js
src/js/rules.js
src/js/ui.js
```

Search terms:

```text
SKILL_DEFINITIONS
SKILL_EXPERTISE_OPTIONS
CREATION_SKILL_POINT_BUDGET
expertise
skill point
getSkillRowsData
getSkillRowData
```

Important tests:

```text
Expertise source UI regression
Named expertise regression
Sheet expertise regression
Sheet expertise roll regression
Fixed expertise regression
```

### Equipment, Items, And Materials

Useful concepts:

- equipment selection without accidental purchase on inspection
- plus/minus purchase controls
- item quantity counts
- multiple purchases of stackable materials and weapons
- generated material cards from larger source material entries
- remaining Clim tracking
- selected equipment feeding inventory rows
- custom equipment modifiers feeding combat values
- visible spreadsheet equipment rows importing/exporting as inventory
- item access that can affect build legality or spell/effect availability

Start with:

```text
src/js/ui.js
src/js/rules.js
src/js/io.js
```

Search terms:

```text
equipment
inventory
material
Clim
quantity
selected items
getSelectedEquipmentCost
getSelectedItemRecords
```

Important tests:

```text
Equipment inspect-only regression
Equipment add-control regression
Equipment quantity regression
Equipment remove-control regression
Generated material card regression
Generated material inspect regression
Generated material add regression
Generated material quantity regression
Generated material decrement regression
Builder review equipment summary layout
```

### Abilities And Resource Spending

Useful concepts:

- ability cost parsing
- AP/RP/Mana spend buttons
- variable cost buttons such as 2 AP / 4 AP choices
- manual/reference abilities
- play reference detail panel
- AP recovery button
- inventory item use
- food/rest lockout behavior
- temporary HP behavior

Start with:

```text
src/js/ui.js
src/js/rules.js
src/js/constants.js
```

Search terms:

```text
usePlayCost
parseResourceCost
AP
RP
Mana
Temporary
Temp HP
reference
Spend Cost
Recover AP
```

Important tests:

```text
Ability reference detail regression
Spiritual Sync use regression
Fighter variable ability cost buttons
Fighter variable ability spend
AP recovery button regression
Inventory item use
Food benefit lockout
Shielding Potion tracking
Hydromancer AP/RP choice buttons
Hydromancer AP/RP choice spend
```

## Porting Advice

If another interface wants these rules:

1. Extract the behavior by concept, not by screen.
2. Keep the current tests nearby while porting.
3. Preserve stable IDs for classes, items, abilities, and breakthroughs.
4. Keep data loading and transformation separate from game rules.
5. Treat browser UI validation as guidance, not final official server validation.
