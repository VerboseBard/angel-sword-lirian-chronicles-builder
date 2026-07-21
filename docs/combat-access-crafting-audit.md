# Combat Access, Prerequisite, And Crafting Audit

Scope: shared Beta 1.6 rules baseline, reviewed July 1, 2026.

This audit focuses on the character creator and live character sheet. It does not judge whether a min-max combination is good or table-realistic. The goal is to identify the state, UI, and rule hooks needed for the app to represent legal build access, combat item access, reload/ammo behavior, crafting, gathering, and foraging without forcing players to hunt through scattered item text.

The recent chat logs are not present in this workspace, so this is based on the 1.6 source, bundled rules data, and the existing `audit:minmax` output.

## Current Coverage

The builder already handles several important prerequisite-bypass cases:

- Class requirement checks include mastery, tier mastery, race/lineage, breakthrough gates, ability/spell gates, proficiencies, skills/expertise, Spirit Core, mystic-eye slots, and some manual requirements.
- Selected lineage, breakthrough, and selected item text can provide explicit class access overrides when the text says the character may `enter` or `unlock` a class.
- The existing min-max cascade audit reports the known class access grants: Demon clan free class entries, Gnome Miner unlock, Sheepfolk Aetherie access without requirements, Angelblooded, Mystic Eyes of Faerie Light, and Touched by Death.
- The builder has manual main-stat and secondary-stat modes, so it can intentionally bypass the standard character-creation arrays.
- The play sheet has AP/RP/Mana/HP resources, basic actions, quick ability cards, inventory item use buttons, food benefit lockout, consumable quantity consumption, active effects for some item uses, and a crafting/gathering tab.

## Main Finding

The app is good at answering "does this character own or know this thing?" It is much weaker at answering "can this character use this thing right now in combat?"

That gap matters because the rules data distinguishes:

- carried inventory vs non-combat storage
- easy-access storage vs ordinary storage
- held, equipped, drawn, sheathed, and stowed states
- one-per-turn draw/sheath rules
- item capacity, loaded shells, reload actions, and carried fuel
- consumables in hand vs in combat inventory vs in a rig
- crafting sessions vs gathering sessions
- ordinary skill checks vs special Node/Lucky/Strike Dice gathering mechanics

Right now most of those are plain text attached to inventory rows. The sheet exposes many `Use` buttons from activation cost and effect text, but it does not consistently know whether the item is actually combat-ready, held, loaded, or reachable.

## High Priority Gaps

### 1. Combat Readiness And Storage Zones

Current state only has `inventoryItems[]` plus an `equipped` boolean. That is not enough.

Rules examples:

- `Alchemy Rig`: easy access to Elixirs, Flasks, Potions, Poisons, and Salves; one rig at a time; stores 2 burden worth.
- `Alchemy Rig (Deluxe)`: same, but 5 burden worth.
- `Backpack`: non-combat storage.
- `Adventurer's Kit`: stores up to 5 burden of certain essentials in a combat-ready state for 0 burden.
- `Fuel Cartridge Pack`: stores up to 20 burden worth of fuel shells and reduces their burden to 0.

Missing functionality:

- No inventory location: held, worn, quick-access, combat inventory, pack, cart, non-combat storage.
- No container assignment or capacity checking.
- No "combat-ready" gate before showing a `Use` button.
- No warning when an item is owned but packed away and therefore not available during combat.

Required model:

- Add `location`, `containerUid`, `combatReady`, and `accessTags` to inventory entries.
- Add container records with capacity, allowed item categories, burden treatment, and equip limits.
- Separate "Owned Inventory" from "Combat Loadout."

### 2. Hands, Draw/Stow, And Quick Access

Many rules depend on whether something is in hand or drawn, not merely owned.

Rules examples:

- `Small Weapons`: draw for 0 AP; first basic Light/Heavy after drawing gains Trick Attack once per combat.
- `Hori`: foraging tool and hidden weapon with 0 AP draw.
- `Pistol`: draw or sheath for 0 AP once per turn.
- `Saboteur Thread Daggers`: draw/sheath and recall for 0 AP once per turn.
- `Giant Scissors`: Separation mod can split/merge for 0 AP (Quick).
- `Counter-Potion`: immediately use a Potion, Elixir, Salve, Poison, or Flask held in your hand.
- `Doctor Jekyll`: draw and drink a Potion or Elixir, or throw one to an ally.
- `Throw Potion`: potion must be in your hands.
- `Quickdraw Alchemy`: draw an Alchemy item from combat inventory.

Missing functionality:

- No hand slots.
- No drawn/sheathed/stowed state.
- No per-turn flags such as "0 AP draw used this turn."
- No per-combat flags such as "Hidden Weapon benefit used this combat."
- No distinction between "can use directly" and "needs draw first."

Required model:

- Add hand/loadout slots: main hand, off hand, worn, quick-access, stowed.
- Add item state: `drawn`, `sheathed`, `loaded`, `usesThisTurn`, `usesThisCombat`.
- Generate contextual actions: Draw, Stow, Sheathe, Use, Throw, Apply Poison, Reload.

### 3. Ammo, Fuel, Reload, And Capacity

The current sheet can spend AP/RP/Mana, but it does not know whether a weapon/artifice is loaded or whether ammo/fuel is carried.

Rules examples:

- `Small Shell`: fuel for artifices.
- `Fuel Cartridge Pack`: carries fuel shells at 0 burden, one pack at a time.
- `Universal Artifice Mods`: Double/Triple/Quadruple/Quintuple Barrel increases shell capacity, but reload remains 1 shell at a time.
- `Quick Artifice Reload`: reload one shell into an artifice in range using one of your shells.
- `Crossbow` Windlass Arbalest mod: must reload for 2 AP or 1 RP before it can be used again.
- `Stone Serpent's Kiss`: can be applied to a weapon, arrow, bolt, or bullet.

Missing functionality:

- No ammo/fuel quantities separate from ordinary item quantity.
- No loaded-count or capacity.
- No reload action generated from item/mod text.
- No automatic shell/ammo consumption.
- No "weapon unavailable until reloaded" state.

Required model:

- Add `charges`, `loaded`, `capacity`, `ammoType`, and `ammoPoolUid`.
- Add reload actions with alternate costs, such as `2 AP` or `1 RP`.
- Add combat validation: attacks requiring reload should become blocked or marked "needs reload."

### 4. Consumable Effects Are Only Partially Automated

Current item use handles activation cost, resource spend, consumable quantity, direct healing/resource restoration, true damage, some Temporary HP, food lockout, and a few active effects.

Still missing:

- Stat buffs such as +1 Power/Focus/Agility/Toughness from elixirs.
- Speed, flight, breathing, invisibility/vision, resistance, immunity, cleanse, and injury suppression effects.
- Thrown ally/self targeting and "target pays mana cost" behavior.
- Poison application to a weapon/ammo and later hit consumption.
- Area effects from flasks.
- Duration countdown by turn/round/encounter/rest.
- Effects with manual choices, such as choosing element or damage type.

Required model:

- Structured `effectProfile` on use options: stat buff, condition, cleanse, resistance, movement mode, target mode, duration, save/potency, manual choice.
- Active effect entries should be linked to source item and be removable/expirable.
- Use buttons should say `Use Self`, `Throw`, `Apply`, `Feed Ally`, etc. when the item supports different modes.

### 5. Crafting And Gathering Are A Workspace, Not A Rules Engine

Current sheet has a useful crafting tab, but it intentionally says it does not invent missing recipe or downtime rules. It tracks generic crafting dice, generated/spent points, recipe notes, material costs, and skill shortcuts.

Rules examples:

- Skills include crafting skills and gathering skills: Farming, Foraging, Mining.
- `Hori` and `Giant Scissors` are foraging tools if proficient.
- `Universal Weapon Mods`: Gathering mod helps gathering rolls, but still cannot gather unless the weapon is a valid gathering tool.
- Gathering abilities mention gathering sessions, gathering checks, Node Points, Lucky Points, Strike Dice, and overflow behavior.
- Crafting abilities mention crafting sessions, crafting dice, Co-Craft, material costs, mods, alloys, facilities, and session-only requirements.

Missing functionality:

- No session type: crafting, farming, foraging, mining.
- No Node Points or Lucky Points tracker.
- No Strike Dice tracker separate from Crafting Dice.
- No tool/proficiency validation for Foraging/Mining/Farming.
- No material unit inventory or container capacity.
- No recipe cards with required materials, difficulty, output, quality, or mods.

Rules conclusion:

Foraging is not just a generic Survival check in the current data. It appears as a dedicated gathering skill, has dedicated tools, and has abilities with special session mechanics. The sheet should still allow manual skill rolls, but a real gathering workflow needs its own tracker.

## Scattered Logic To Consolidate

These concepts are currently spread across multiple places:

- Class prerequisites: mostly in `ui.js`, with support docs in `rules-logic-map.md`.
- Combat resources: `rules.js` and `ui.js`.
- Inventory item use: `ui.js`.
- Equipment selection and sheet inventory sync: `ui.js` and `io.js`.
- Crafting/gathering: `ui.js` plus raw item/ability data.
- Min-max cascade discovery: `scripts/audit-minmax-cascades.mjs`.

Recommended consolidation:

- Create a small rules-profile layer that normalizes item and ability text into structured tags:
  - `combatReadyContainer`
  - `nonCombatStorage`
  - `quickAccess`
  - `requiresHeld`
  - `drawAction`
  - `reloadAction`
  - `ammoOrFuel`
  - `consumable`
  - `craftingTool`
  - `gatheringTool`
  - `sessionRequirement`
  - `classAccessOverride`
- Keep raw official text visible, but drive sheet buttons and warnings from these tags.

## UI Concepts To Evaluate

### Concept A: Keep Current Tabs, Add Readiness Badges

Lowest effort. Inventory stays as the main place for items, but each item gains badges:

- Ready
- In pack
- Requires hand
- Needs reload
- Consumable
- Container
- Crafting tool
- Gathering tool

Pros: Small implementation and low layout risk.

Cons: Still makes the player inspect inventory during combat. Does not fully solve hands/reload.

### Concept B: Add A Combat Tab

Recommended next step.

The Combat tab would show only what matters during an encounter:

- AP/RP/Mana/HP strip
- main hand/off hand/worn/quick-access slots
- loaded weapons and reload status
- combat-ready consumables
- generated actions from readied gear
- "blocked" actions with reasons, such as "in backpack" or "needs reload"

Pros: Best match for the table problem. Separates owning an item from being able to use it.

Cons: Requires new state model and migration for existing saves.

### Concept C: Full Rules Engine

Highest effort. Parse all official text into structured actions, effects, durations, targeting, and prerequisites.

Pros: Best long-term automation.

Cons: Too large for one pass and risky while rules are still moving. Should be built after the Combat tab creates stable state.

## Beta 1.6 Implementation Started

The first 1.6 slice now adds advisory item readiness profiling to the Play inventory:

- Inventory items derive badges from official item/category/rules text for use actions, consumables, easy access, combat-ready storage, non-combat storage, held-item requirements, draw/stow language, reload/ammo/fuel language, equip limits, crafting, gathering, and storage.
- The inventory panel shows a Combat Access readiness snapshot so missing loadout, hand, container, and reload state is visible before those systems exist.
- Item rows show readiness badges and warnings without blocking existing behavior.
- Item use logs include advisory readiness warnings, so a player can see when an action was taken even though hands, packed storage, or reload state is not yet enforced.

This is intentionally not the full Combat tab or loadout gate. It is the low-risk data/UI foundation for the next stateful pass.

## Recommended Build Order

1. Add item profile derivation and visible badges without changing behavior.
2. Add Combat Loadout state: hands, equipped/worn, quick-access, packed, and non-combat storage.
3. Gate item `Use` buttons behind readiness. Keep a manual override button for edge cases.
4. Add ammo/fuel/reload state for shells, crossbows, guns, and artifice capacity.
5. Split crafting and gathering trackers:
   - Crafting: Crafting Dice, Crafting Points, recipe, material units, mods.
   - Gathering: session type, gathering skill, tool, Node Points, Lucky Points, Strike Dice, output units.
6. Add regression tests for each gating case.

## Tests To Add

- A potion in an equipped Alchemy Rig is usable in combat.
- A potion in a Backpack is owned but not usable in combat.
- Deluxe and normal Alchemy Rig cannot both be active.
- Fuel Cartridge Pack reduces carried shell burden and supplies reload.
- Quick Artifice Reload spends its cost and consumes one shell.
- Windlass Arbalest blocks follow-up attacks until reloaded.
- Quickdraw Alchemy draws an alchemy item from combat inventory.
- Counter-Potion requires the alchemy item to be held.
- Hidden Weapon can trigger once per combat after draw.
- Pistol 0 AP draw/sheath can only be used once per turn.
- Hori and Giant Scissors can satisfy foraging tool readiness when proficiency exists.
- Gathering session abilities require an active gathering session and update Node/Lucky/Strike trackers.
- Manual stat array bypass is clearly flagged in exports/review.
- Class access override tests cover `enter`, `unlock`, `purchase`, `without meeting requirements`, 0 EXP, and EXP reduction wording.

## Open Rules Questions

- What is the default AP/RP cost to draw, stow, or interact with an item when no item-specific rule overrides it?
- Does an Alchemy Rig only grant access, or does it also affect burden? The text says it stores burden worth, but unlike Fuel Cartridge Pack it does not explicitly say the stored burden becomes 0.
- Are all sheet inventory rows "combat inventory," or should some rows represent owned inventory outside combat readiness?
- Can anyone attempt Foraging/Mining/Farming at 0 skill, or is class/tool/proficiency required?
- For gathering, what are the exact maximums and reset timing for Node Points, Lucky Points, and Strike Dice?
- Should temporary combat effects that grant elemental mastery ever satisfy character creator prerequisites? The safer default is no.
