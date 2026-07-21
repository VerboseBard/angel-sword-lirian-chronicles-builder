# Rules Data Audit: 0.13.0 → 0.13.1

Generated: 2026-07-20T20:27:49.334Z

This report compares every decoded official rules collection by stable record ID. Raw base64 mirrors are omitted when decoded text/HTML companions exist.

## Cross-reference Findings

- Official-source inconsistency: the 0.13.1 patch notes say Selkie's Aqua Drill and Water Mastery were removed and replaced by Blue Soul. The live Selkie detail replaces the third trait with Blue Soul but its first trait still refers to Aqua Drill. The pulled data is preserved unchanged and the discrepancy is flagged for a future official correction.

- The new granted-class wording is mechanically different from the earlier 0-EXP unlock wording: a class granted at level 1 consumes neither EXP nor an Interlude Point, while legacy 0-EXP unlocks can still consume their stated Interlude Point.
- Divine's Chosen is a zero-EXP selection with a permanent deity choice. Its chosen damage type also controls the elemental mastery awarded when Acolyte is mastered.

## Count Changes

| Collection | Before | After | Delta |
|---|---:|---:|---:|
| versions | 36 | 37 | +1 |
| classes | 180 | 181 | +1 |
| classDetails | 180 | 181 | +1 |
| keyAbilities | 174 | 175 | +1 |
| trueAbilities | 931 | 937 | +6 |
| breakthroughs | 88 | 89 | +1 |
| keywords | 85 | 87 | +2 |

## breakthroughs.json

Records: 88 → 89; added 1, removed 0, modified 3.

Added:

- Divine's Chosen (divine-s-chosen)

Modified:

- Elixir Addict (elixir-addict): requirements
  - requirements: “Must have used at least 3 elixirs.” → “Must have used at least 3 elixirs in the same encounter.”
- Racial Flight (racial-flight): requirements
  - requirements: “Must be Phoenix, Mothfolk, Lizardfolk or Willowisp race.” → “Must be Phoenix, Mothfolk, Lizardfolk, Sylph or Willowisp race.”
- The Unknown Paladin (the-unknown-paladin): requirements
  - requirements: “Must be a believer in a god.” → “Must have the Divine's Chosen breakthrough.”

## class_details.json

Records: 180 → 181; added 1, removed 0, modified 5.

Added:

- Seven Sorrows Sword Style (seven-sorrows-sword-style)

Modified:

- Acolyte (acolyte): requirementsHtml, requirementsText
  - requirementsHtml: “<p>None.</p>” → “<p>Divine's Chosen breakthrough or be human.</p>”
  - requirementsText: “None.” → “Divine's Chosen breakthrough or be human.”
- Aerial Mage (aerial-mage): requirementsHtml, requirementsText
  - requirementsHtml: “<p>Mage or Aeromancer mastered.</p>” → “<p>Mage, Artificer or Aeromancer mastered.</p>”
  - requirementsText: “Mage or Aeromancer mastered.” → “Mage, Artificer or Aeromancer mastered.”
- Dark Priest (dark-priest): requirementsHtml, requirementsText
  - requirementsHtml: “<p>Acolyte, Mage or Sorcerer mastered.</p>” → “<p>Acolyte, Mage, Sorcerer or Eremancer mastered.</p>”
  - requirementsText: “Acolyte, Mage or Sorcerer mastered.” → “Acolyte, Mage, Sorcerer or Eremancer mastered.”
- Naturalist (naturalist): requirementsHtml, requirementsText
  - requirementsHtml: “<p>Acolyte, Sorcerer, Mage, Ranger, Farmer, Forager or Mycomancer mastered.</p>” → “<p>Medic, Acolyte, Sorcerer, Mage, Ranger, Farmer, Forager or Mycomancer mastered.</p>”
  - requirementsText: “Acolyte, Sorcerer, Mage, Ranger, Farmer, Forager or Mycomancer mastered.” → “Medic, Acolyte, Sorcerer, Mage, Ranger, Farmer, Forager or Mycomancer mastered.”
- Sanctioner (sanctioner): requirementsHtml, requirementsText
  - requirementsHtml: “<p>Acolyte, Mage, Mage Knight or Sorcerer mastered.</p>” → “<p>Medic, Acolyte, Mage, Mage Knight or Sorcerer mastered.</p>”
  - requirementsText: “Acolyte, Mage, Mage Knight or Sorcerer mastered.” → “Medic, Acolyte, Mage, Mage Knight or Sorcerer mastered.”

## classes.json

Records: 180 → 181; added 1, removed 0, modified 0.

Added:

- Seven Sorrows Sword Style (seven-sorrows-sword-style)

## item_details.json

Records: 206 → 206; added 0, removed 0, modified 9.

Modified:

- Buster Weapon (Buster Weapon): descriptionHtml, descriptionText
  - descriptionHtml: “<p>An artifice that adds an explosive blast to increase forward velocity.&nbsp;The most common type of weapon artifice used to help overwhelm an opponent.&nbsp;Attachable to melee weapons.&nbsp;</p><p>Use when you are making an attack against an enemy.&nbsp;T…” → “<p>An artifice that adds an explosive blast to increase forward velocity.&nbsp;The most common type of weapon artifice used to help overwhelm an opponent.&nbsp;Attachable to melee weapons.&nbsp;</p><p>Use when you are making a melee attack against an enemy.&n…”
  - descriptionText: “An artifice that adds an explosive blast to increase forward velocity. The most common type of weapon artifice used to help overwhelm an opponent. Attachable to melee weapons. Use when you are making an attack against an enemy. The attack gains +3 accuracy an…” → “An artifice that adds an explosive blast to increase forward velocity. The most common type of weapon artifice used to help overwhelm an opponent. Attachable to melee weapons. Use when you are making a melee attack against an enemy. The attack gains +3 accura…”
- Cannon (Two-Handed) (Cannon (Two-Handed)): descriptionHtml, descriptionText, type
  - descriptionHtml: “<p><strong>Cannon</strong>: All basic attacks made with this weapon gain the Artillery keyword, but you can only make 1 ranged attack with this weapon per round. When you make a basic Heavy attack against an enemy, you make a Blanketing Light attack against a…” → “<p><strong>Cannon</strong>: All basic attacks made with this weapon gain the Artillery keyword, but you can only make 1 ranged attack with this weapon per round. When you make a basic Heavy attack against an enemy, you make a Blanketing Light attack against a…”
  - descriptionText: “Cannon: All basic attacks made with this weapon gain the Artillery keyword, but you can only make 1 ranged attack with this weapon per round. When you make a basic Heavy attack against an enemy, you make a Blanketing Light attack against all enemies within 5f…” → “Cannon: All basic attacks made with this weapon gain the Artillery keyword, but you can only make 1 ranged attack with this weapon per round. When you make a basic Heavy attack against an enemy, you make a Blanketing Light attack against all other enemies wit…”
  - type: “Equipment” → “Artifice”
- Elemental Grease (Elemental Grease): cost
  - cost: “300 Clim” → “301 Clim”
- Equipment Patching Kit (Equipment Patching Kit): descriptionHtml, descriptionText
  - descriptionHtml: “<p>Contains all the necessary materials to jury rig a fix on damaged weapons.</p><p><strong>Rest Action: </strong>You can patch a broken piece of equipment, allowing it to be usable until the end of the scenario if it is repairable.&nbsp;The equipment still c…” → “<p>Contains all the necessary materials to jury rig a fix on damaged weapons.</p><p><strong>Rest Action: </strong>You can patch a broken piece of equipment or adventuring essential item, allowing it to be usable until the end of the scenario if it is repairab…”
  - descriptionText: “Contains all the necessary materials to jury rig a fix on damaged weapons. Rest Action: You can patch a broken piece of equipment, allowing it to be usable until the end of the scenario if it is repairable. The equipment still counts as broken at the end of t…” → “Contains all the necessary materials to jury rig a fix on damaged weapons. Rest Action: You can patch a broken piece of equipment or adventuring essential item, allowing it to be usable until the end of the scenario if it is repairable. The equipment still co…”
- Fire Robe (Fire Robe): descriptionHtml, descriptionText
  - descriptionHtml: “<p>A red robe with a design based of a Divine Arms. Keeps the wearer cool in even the hottest of weathers by repelling the heat.</p><p>Can be activated to give the wearer 5 damage reduction against fire damage until the end of the encounter. When this effect …” → “<p>A red robe with a design based of a Divine Arms. Keeps the wearer cool in even the hottest of weathers by repelling the heat.</p><p>Considered a cloak and takes the cloak slot.</p><p>Can be activated to give the wearer 5 damage reduction against fire damag…”
  - descriptionText: “A red robe with a design based of a Divine Arms. Keeps the wearer cool in even the hottest of weathers by repelling the heat. Can be activated to give the wearer 5 damage reduction against fire damage until the end of the encounter. When this effect ends, the…” → “A red robe with a design based of a Divine Arms. Keeps the wearer cool in even the hottest of weathers by repelling the heat. Considered a cloak and takes the cloak slot. Can be activated to give the wearer 5 damage reduction against fire damage until the end…”
- Lightning Rod (Lightning Rod): descriptionHtml, descriptionText
  - descriptionHtml: “<p>A short metal rod that can be expanded with the push of a button.</p><p>When placed into the ground and activated, it creates a 25x25ft zone with it in the center. Everyone in the zone gains 5 damage reduction against Lightning damage. Lasts until the end …” → “<p>A short metal rod that can be expanded with the push of a button.</p><p>When placed into the ground and activated, it creates a 25x25ft zone with it in the center. Everyone in the zone gains 5 damage reduction against Lightning damage. Lasts until the end …”
  - descriptionText: “A short metal rod that can be expanded with the push of a button. When placed into the ground and activated, it creates a 25x25ft zone with it in the center. Everyone in the zone gains 5 damage reduction against Lightning damage. Lasts until the end of the en…” → “A short metal rod that can be expanded with the push of a button. When placed into the ground and activated, it creates a 25x25ft zone with it in the center. Everyone in the zone gains 5 damage reduction against Lightning damage. Lasts until the end of the en…”
- Power Gauntlets (Power Gauntlets): descriptionHtml, descriptionText
  - descriptionHtml: “<p>A large and heavy pair of gloves. Once the wearer inserts their hand into them, they will secure themselves properly around their hands.&nbsp;</p><p>When activated, the wearer’s unarmed attacks do normal weapon damage instead of their normal unarmed damage…” → “<p>A large and heavy pair of gloves. Once the wearer inserts their hand into them, they will secure themselves properly around their hands.&nbsp;</p><p>When activated, the wearer’s unarmed attacks do normal weapon damage instead of their normal unarmed damage…”
  - descriptionText: “A large and heavy pair of gloves. Once the wearer inserts their hand into them, they will secure themselves properly around their hands. When activated, the wearer’s unarmed attacks do normal weapon damage instead of their normal unarmed damage. If the wearer…” → “A large and heavy pair of gloves. Once the wearer inserts their hand into them, they will secure themselves properly around their hands. When activated, the wearer’s unarmed attacks do normal weapon damage instead of their normal unarmed damage. If the wearer…”
- Shell Converter (Shell Converter): descriptionHtml, descriptionText, imageAlignment
  - descriptionHtml: “<p>An artifice that easily converts fuel into shells. Less bulky to carry than an artifice kit, but cannot be used to repair artifices.</p><p>Treated as a kit for Burden purposes.</p><p><strong>Rest Action: </strong>You can choose to create a small Artifice S…” → “<p>An artifice that easily converts fuel into shells. Less bulky to carry than an artifice kit, but cannot be used to repair artifices.</p><p>Treated as a kit for Burden purposes.</p><p><strong>Rest Action: </strong>You can choose to create a small Artifice S…”
  - descriptionText: “An artifice that easily converts fuel into shells. Less bulky to carry than an artifice kit, but cannot be used to repair artifices. Treated as a kit for Burden purposes. Rest Action: You can choose to create a small Artifice Shell, paying its cost in Magical…” → “An artifice that easily converts fuel into shells. Less bulky to carry than an artifice kit, but cannot be used to repair artifices. Treated as a kit for Burden purposes. Rest Action: You can choose to create a small Artifice Shell, paying its cost in Magical…”
  - imageAlignment: “(empty)” → “middle”
- Snow Cloak (Snow Cloak): descriptionHtml, descriptionText
  - descriptionHtml: “<p>A white cloak designed as the counterpart to the Fire Robe. Keeps the wearer warm in even the coldest of weathers.</p><p>Can be activated to give the wearer 5 damage reduction against frost damage until the end of the encounter. When this effect ends, the …” → “<p>A white cloak designed as the counterpart to the Fire Robe. Keeps the wearer warm in even the coldest of weathers.</p><p>Considered a cloak and takes the cloak slot.</p><p>Can be activated to give the wearer 5 damage reduction against frost damage until th…”
  - descriptionText: “A white cloak designed as the counterpart to the Fire Robe. Keeps the wearer warm in even the coldest of weathers. Can be activated to give the wearer 5 damage reduction against frost damage until the end of the encounter. When this effect ends, the shell ins…” → “A white cloak designed as the counterpart to the Fire Robe. Keeps the wearer warm in even the coldest of weathers. Considered a cloak and takes the cloak slot. Can be activated to give the wearer 5 damage reduction against frost damage until the end of the en…”

## items.json

Records: 206 → 206; added 0, removed 0, modified 2.

Modified:

- Cannon (Two-Handed) (cannon--two-handed-): type
  - type: “Equipment” → “Artifice”
- Elemental Grease (elemental-grease): cost
  - cost: “300 Clim” → “301 Clim”

## key_abilities.json

Records: 174 → 175; added 4, removed 3, modified 9.

Added:

- Dark Weapon (dark-weapon)
- Divine Weapon (divine-weapon)
- Knight of Yggdrasil (knight-of-yggdrasil)
- Knight of Yggdrasil II (knight-of-yggdrasil-ii)

Removed:

- Holy Weapon (holy-weapon)
- Knight of Yddrasil (knight-of-yddrasil)
- Knight of Yddrasil II (knight-of-yddrasil-ii)

Modified:

- Acolyte's Journey (acolyte-s-journey): benefit2, benefit4
  - benefit2: “You gain +5 skill points in the Religion skill.” → “You gain +5 skill points in the Religion skill. You can exchange any skill point for 2 expertise points, but must spend them in this skill.”
  - benefit4: “(empty)” → “Upon Mastery of the class, you gain Elemental Mastery in your chosen Divine's element (or Holy if just human).”
- Advanced Artificing (advanced-artificing): benefit2
  - benefit2: “You are able to craft artificers that cost 10000 clim or less.” → “You are able to craft artifices that cost 10000 clim or less.”
- Celestial Artillery (celestial-artillery): benefit1
  - benefit1: “When attacking an enemy that’s further than 80ft away, your spells with the Celestial keyword gain the Artillery keyword.” → “When attacking an enemy outdoors that’s further than 80ft away, your spells with the Celestial keyword gain the Artillery keyword.”
- Idol's Journey (idol-s-journey): benefit2
  - benefit2: “You gain +5 skill points in Art.” → “You gain +5 skill points in Art. You can exchange any skill point for 2 expertise points, but must spend them in this skill.”
- Mage's Journey (mage-s-journey): benefit2
  - benefit2: “You gain +5 skill points in the Magic skill.” → “You gain +5 skill points in the Magic skill. You can exchange any skill point for 2 expertise points, but must spend them in this skill.”
- Peddler of Wares (peddler-of-wares): benefit3
  - benefit3: “You gain +5 skill points in Riding.” → “You gain +5 skill points in Riding. You can exchange any skill point for 2 expertise points, but must spend them in this skill.”
- Sorcerer's Journey (sorcerer-s-journey): benefit2
  - benefit2: “You gain +5 skill points in Magic.” → “You gain +5 skill points in Magic. You can exchange any skill point for 2 expertise points, but must spend them in this skill.”
- Throwing Rhythm (throwing-rhythm): benefit2
  - benefit2: “(empty)” → “When you take the thrown attack basic action, the weapon returns to your hand afterwards.”
- Transmutation Basics (transmutation-basics): benefit4
  - benefit4: “You gain proficiency in alchemist’s tools and 1 basic weapon type.” → “You gain proficiency in alchemist’s alembic and 1 basic weapon type.”

## keywords.json

Records: 85 → 87; added 2, removed 0, modified 3.

Added:

- Divine (divine)
- Isolated (isolated)

Modified:

- Artillery (artillery): descriptionHtml, descriptionText
  - descriptionHtml: “<p>The attack can target non-hidden units behind cover (even full cover) and ignore cover bonuses.</p>” → “<p>The attack can target non-hidden units behind cover (even full cover) and any cover is calculated from above the target rather than from your position to the target.</p>”
  - descriptionText: “The attack can target non-hidden units behind cover (even full cover) and ignore cover bonuses.” → “The attack can target non-hidden units behind cover (even full cover) and any cover is calculated from above the target rather than from your position to the target.”
- Challenge (challenge): descriptionHtml, descriptionText
  - descriptionHtml: “<p>If a challenged character does not include the challenger as a target, they provoke a melee attack of opportunity from the challenger.</p><p>This does not trigger if the challenged target makes an attack of opportunity or if the challenger is not a target …” → “<p>If a challenged character does not include the challenger as a target when making an attack, they provoke a melee attack of opportunity from the challenger.</p><p>This does not trigger if the challenged target makes an attack of opportunity or if the chall…”
  - descriptionText: “If a challenged character does not include the challenger as a target, they provoke a melee attack of opportunity from the challenger. This does not trigger if the challenged target makes an attack of opportunity or if the challenger is not a target due effec…” → “If a challenged character does not include the challenger as a target when making an attack, they provoke a melee attack of opportunity from the challenger. This does not trigger if the challenged target makes an attack of opportunity or if the challenger is …”
- Unbalanced (unbalanced): descriptionHtml, descriptionText
  - descriptionHtml: “<p>Your next attack costs 1 extra AP.</p>” → “<p>Your next attack that costs AP (even 0 AP) costs 1 extra AP.</p>”
  - descriptionText: “Your next attack costs 1 extra AP.” → “Your next attack that costs AP (even 0 AP) costs 1 extra AP.”

## metadata.json

Records: 1 → 1; added 0, removed 0, modified 1.

Modified:

- document (document): generatedAt, latestVersion
  - generatedAt: “2026-06-14T18:24:39.040Z” → “2026-07-20T20:14:21.494Z”
  - latestVersion: “{"name":"Lyrian Chronicles","versionId":"6a06299f6be32fced493035f","versionNumber":"0.13.0"}” → “{"name":"Lyrian Chronicles","versionId":"6a2e7a0d6be32fced4930c9a","versionNumber":"0.13.1"}”

## patch_notes.json

Records: 1 → 1; added 0, removed 0, modified 1.

Modified:

- document (6a2e7dcf6be32fced493157c): contentHtml, contentText
  - contentHtml: “<h2>Races</h2><ul><li>NEW:<ul><li>Sylph, a wind aligned fae subrace.</li></ul></li><li>Phoenix rebirth now removes all buffs/debuffs.</li><li>Slime Body mana cost reduced from 1→0.</li><li>Fading Counter mana cost reduced from 1→0.</li><li>Blinding Dust now h…” → “<h2>Features</h2><ul><li>New Interactive World Website: &nbsp;<a href="https://clio.angelssword.com">https://clio.angelssword.com</a><ul><li>Mirane Start Guide</li><li>DM Tools</li><li>Mirane DM Tools</li></ul></li><li>New Character Builder: &nbsp;Build chara…”
  - contentText: “Races - NEW:- Sylph, a wind aligned fae subrace. - Phoenix rebirth now removes all buffs/debuffs. - Slime Body mana cost reduced from 1→0. - Fading Counter mana cost reduced from 1→0. - Blinding Dust now has the circuit keyword. - Faerie Flash II slightly upd…” → “Features - New Interactive World Website: https://clio.angelssword.com- Mirane Start Guide - DM Tools - Mirane DM Tools - New Character Builder: Build characters like never before! Follow Aniela's guidance as she helps you through it. - New Character Vault. S…”

## primary_race_details.json

Records: 5 → 5; added 0, removed 0, modified 1.

Modified:

- Demon (demon): un, vi, wi
  - un: “{"ability":"fd369348-a806-47d8-9d62-0c2230771ae6","text":"Maids and Butlers - You may enter the Maid class at no experience cost."}” → “{"ability":"fd369348-a806-47d8-9d62-0c2230771ae6","text":"Maids and Butlers - You start with the Maid class unlocked and at level 1."}”
  - vi: “{"ability":"0e2cca4a-edc5-4f1a-a64b-6508cf7df15c","text":"Medical and Healers - You may enter the Medic class at no experience cost."}” → “{"ability":"0e2cca4a-edc5-4f1a-a64b-6508cf7df15c","text":"Medical and Healers - You start with the Medic class unlocked and at level 1."}”
  - wi: “{"ability":"1e26e66c-34c5-49dc-b99f-68b157be8aee","text":"Saboteurs - You gain proficiency with Saboteur Thread Daggers in addition to the ability below. You may also enter the Saboteur class at no experience cost."}” → “{"ability":"1e26e66c-34c5-49dc-b99f-68b157be8aee","text":"Saboteurs - You gain proficiency with Saboteur Thread Daggers in addition to the ability below. You start with the Saboteur class unlocked and at level 1."}”

## rulebook.json

Records: 1 → 1; added 0, removed 0, modified 1.

Modified:

- document (6a2e7a0d6be32fced49311d6): contentHtml, contentText
  - contentHtml: “<h2><strong>Introduction</strong></h2><p>Lyrian Chronicles is a game for ttrpg players and by ttrpg players.&nbsp; After playing through several systems we had decided to make one that solves a lot of the issues that we had with them.&nbsp; We drew inspiratio…” → “<h2><strong>Introduction</strong></h2><p>Lyrian Chronicles is a game for ttrpg players and by ttrpg players.&nbsp; After playing through several systems we had decided to make one that solves a lot of the issues that we had with them.&nbsp; We drew inspiratio…”
  - contentText: “Introduction Lyrian Chronicles is a game for ttrpg players and by ttrpg players. After playing through several systems we had decided to make one that solves a lot of the issues that we had with them. We drew inspiration from the best parts of each system, wh…” → “Introduction Lyrian Chronicles is a game for ttrpg players and by ttrpg players. After playing through several systems we had decided to make one that solves a lot of the issues that we had with them. We drew inspiration from the best parts of each system, wh…”

## true_abilities.json

Records: 931 → 937; added 7, removed 1, modified 40.

Added:

- 1st Sorrow: Distance Dies First (1st-sorrow--distance-dies-first)
- 2nd Sorrow: One Against The World (2nd-sorrow--one-against-the-world)
- 3rd Sorrow: Blade Without Witness (3rd-sorrow--blade-without-witness)
- Blue Soul (blue-soul)
- Hydromancer (hydromancer)
- Lightning Weapon Expert (lightning-weapon-expert)
- Lone Wolf Stance (lone-wolf-stance)

Removed:

- Lightning Weapon (lightning-weapon)

Modified:

- Angel's Embrace (angel-s-embrace): descriptionHtml, descriptionText, keywords
  - descriptionHtml: “<p>You grant the target ally <strong>Angel’s Embrace</strong>, which grants a Shield against the triggering attack that blocks damage equal to 5 + (2 x Toughness). This Spell does not provoke attacks of opportunity.</p>” → “<p>You grant the target ally <strong>Angel’s Embrace</strong>, which grants a Shield against the triggering attack that blocks damage equal to 5 + (2 x Toughness).</p>”
  - descriptionText: “You grant the target ally Angel’s Embrace, which grants a Shield against the triggering attack that blocks damage equal to 5 + (2 x Toughness). This Spell does not provoke attacks of opportunity.” → “You grant the target ally Angel’s Embrace, which grants a Shield against the triggering attack that blocks damage equal to 5 + (2 x Toughness).”
  - keywords: “Shield,Spell,Aid” → “Shield,Spell,Aid,Safe”
- Aquatic Fae (aquatic-fae): descriptionHtml, descriptionText
  - descriptionHtml: “<p>While swimming, your base movement speed becomes 30, in addition you gain Elemental Mastery: Water.</p><p>Your Aqua Drill costs 0 mana when used as RP ability while in natural water.</p>” → “<p>While swimming, your base movement speed becomes 30.</p><p>Your Aqua Drill costs 0 mana when used as RP ability while in natural water.</p>”
  - descriptionText: “While swimming, your base movement speed becomes 30, in addition you gain Elemental Mastery: Water. Your Aqua Drill costs 0 mana when used as RP ability while in natural water.” → “While swimming, your base movement speed becomes 30. Your Aqua Drill costs 0 mana when used as RP ability while in natural water.”
- Aurora Blade Style: Aurora Slash (aurora-blade-style--aurora-slash): descriptionHtml, descriptionText
  - descriptionHtml: “<p>You fire slashes in a straight line creating a curtain of light which strikes the first target hit with a light attack that deals frost damage. On hit the target is slowed until the end of your next turn.&nbsp;</p><p>The light from the slash continues for …” → “<p>You fire slashes in a straight line creating a curtain of light which strikes the first target hit with a light attack that deals frost damage. On hit the target is slowed until the end of your next turn.&nbsp;</p><p>The light from the slash continues for …”
  - descriptionText: “You fire slashes in a straight line creating a curtain of light which strikes the first target hit with a light attack that deals frost damage. On hit the target is slowed until the end of your next turn. The light from the slash continues for the full range,…” → “You fire slashes in a straight line creating a curtain of light which strikes the first target hit with a light attack that deals frost damage. On hit the target is slowed until the end of your next turn. The light from the slash continues for the full range,…”
- Ave María (ave-mar-a): keywords
  - keywords: “(empty)” → “Divine”
- Bolting (bolting): descriptionHtml, descriptionText, keywords
  - descriptionHtml: “<p>You may make a Heavy Attack that deals Lightning Damage with a bolt from the sky. On damage, inflict Static X where X equals your Focus x 3. As the attack from the sky, any cover is calculated from above the target rather than from your path to the target.…” → “<p>You may make a Heavy Attack that deals Lightning Damage with a bolt from the sky. On damage, inflict Static X where X equals your Focus x 3.&nbsp;</p>”
  - descriptionText: “You may make a Heavy Attack that deals Lightning Damage with a bolt from the sky. On damage, inflict Static X where X equals your Focus x 3. As the attack from the sky, any cover is calculated from above the target rather than from your path to the target.” → “You may make a Heavy Attack that deals Lightning Damage with a bolt from the sky. On damage, inflict Static X where X equals your Focus x 3.”
  - keywords: “Lightning, Rapid,Spell” → “Lightning, Rapid,Spell,Artillery”
- Cannonball (cannonball): descriptionHtml, descriptionText
  - descriptionHtml: “<p>You make 2 heavy attacks against the target and a light attack against all other enemies within 5ft of the target.</p>” → “<p>You make 2 heavy attacks against the target and a light attack against all other enemies within 5ft of the target.</p><p>This secondary Light attack is affected by mods on your cannon that modify its basic attack splash.</p>”
  - descriptionText: “You make 2 heavy attacks against the target and a light attack against all other enemies within 5ft of the target.” → “You make 2 heavy attacks against the target and a light attack against all other enemies within 5ft of the target. This secondary Light attack is affected by mods on your cannon that modify its basic attack splash.”
- Check (check): keywords
  - keywords: “(empty)” → “Active”
- Concealed Shot (concealed-shot): descriptionHtml, descriptionText, keywords
  - descriptionHtml: “<p>You immediately make a new stealth check and remain hidden if enemies fail their perception check.</p>” → “<p>You gain the Hiding state from anyone you have cover or concealment from.</p>”
  - descriptionText: “You immediately make a new stealth check and remain hidden if enemies fail their perception check.” → “You gain the Hiding state from anyone you have cover or concealment from.”
  - keywords: “(empty)” → “Hiding,Stealth”
- Divine Smite (divine-smite): keywords
  - keywords: “Full Pierce” → “Full Pierce,Divine”
- Divine Smite II (divine-smite-ii): keywords
  - keywords: “(empty)” → “Divine”
- Divine Storm (divine-storm): keywords
  - keywords: “Scatter” → “Scatter,Divine”
- Downburst (downburst): apCost, descriptionHtml, descriptionText, manaCost
  - apCost: “4” → “2”
  - descriptionHtml: “<p>You may make a Heavy Attack that deals Wind damage against the target. On damage, the target immediately plummets to the ground and takes falling damage. This falling damage cannot be negated through the use of abilities that would normally negate falling …” → “<p>You may make a Heavy Attack that deals Wind damage against the target.&nbsp;</p><p>On damage, the target immediately plummets to the ground and takes falling damage. This falling damage cannot be negated through the use of abilities that would normally neg…”
  - descriptionText: “You may make a Heavy Attack that deals Wind damage against the target. On damage, the target immediately plummets to the ground and takes falling damage. This falling damage cannot be negated through the use of abilities that would normally negate falling dam…” → “You may make a Heavy Attack that deals Wind damage against the target. On damage, the target immediately plummets to the ground and takes falling damage. This falling damage cannot be negated through the use of abilities that would normally negate falling dam…”
  - manaCost: “(empty)” → “1”
- Downburst II (downburst-ii): descriptionHtml, descriptionText, manaCost, rpCost
  - descriptionHtml: “<p>You may make a Heavy Attack that deals Wind damage against the target. On damage, the target immediately plummets to the ground and takes falling damage. This falling damage cannot be negated through the use of abilities that would normally negate falling …” → “<p>You may make a Heavy Attack that deals Wind damage against the target.&nbsp;</p><p>On damage, the target immediately plummets to the ground and takes falling damage. This falling damage cannot be negated through the use of abilities that would normally neg…”
  - descriptionText: “You may make a Heavy Attack that deals Wind damage against the target. On damage, the target immediately plummets to the ground and takes falling damage. This falling damage cannot be negated through the use of abilities that would normally negate falling dam…” → “You may make a Heavy Attack that deals Wind damage against the target. On damage, the target immediately plummets to the ground and takes falling damage. This falling damage cannot be negated through the use of abilities that would normally negate falling dam…”
  - manaCost: “(empty)” → “1”
  - rpCost: “2” → “1”
- Empower Mana Shield (empower-mana-shield): keywords
  - keywords: “(empty)” → “Shield”
- Energy Drain (energy-drain): descriptionHtml, descriptionText
  - descriptionHtml: “<p>You deal Light true damage to a willing ally other than yourself. You gain <strong>Haste</strong>, which gives you 2 AP for the rest of this turn. A target can only be affected by haste once per turn.</p>” → “<p>You deal Light full pierce dark damage to a willing ally other than yourself. This damage ignores damage resistance against dark damage (such as from gloom infusion or corvuskite armor), unless that DR is an universal type of DR.</p><p>You gain <strong>Has…”
  - descriptionText: “You deal Light true damage to a willing ally other than yourself. You gain Haste, which gives you 2 AP for the rest of this turn. A target can only be affected by haste once per turn.” → “You deal Light full pierce dark damage to a willing ally other than yourself. This damage ignores damage resistance against dark damage (such as from gloom infusion or corvuskite armor), unless that DR is an universal type of DR. You gain Haste, which gives y…”
- Fae Knight Style: Carapace (fae-knight-style--carapace): descriptionHtml, descriptionText, requirementHtml, requirementText
  - descriptionHtml: “<p>One of your Fluttering Blades returns to you and interferes with the attack.&nbsp;You may take the dodge or block action against the attack.&nbsp;</p><p>This cancels Fluttering Blade on that weapon.</p>” → “<p>One of your Fluttering Blades returns to you and interferes with the attack.&nbsp;You may take the dodge or block action against the attack.&nbsp;</p><p>Your Fluttering Blade needs LoS to you or the target it is assisting.</p><p>This cancels Fluttering Bla…”
  - descriptionText: “One of your Fluttering Blades returns to you and interferes with the attack. You may take the dodge or block action against the attack. This cancels Fluttering Blade on that weapon.” → “One of your Fluttering Blades returns to you and interferes with the attack. You may take the dodge or block action against the attack. Your Fluttering Blade needs LoS to you or the target it is assisting. This cancels Fluttering Blade on that weapon. Overcha…”
  - requirementHtml: “<p>Heavy Spin Fluttering Blade Active and target of an attack.</p>” → “<p>Heavy Spin Fluttering Blade Active. You or an ally is the target of an attack and your chosen Heavy Spin Fluttering Blade is not part of that attack.</p>”
  - requirementText: “Heavy Spin Fluttering Blade Active and target of an attack.” → “Heavy Spin Fluttering Blade Active. You or an ally is the target of an attack and your chosen Heavy Spin Fluttering Blade is not part of that attack.”
- Fae Knight Style: Gadfly (fae-knight-style--gadfly): descriptionHtml, descriptionText, keywords
  - descriptionHtml: “<p>Sends a Fluttering Blade to harass the target within 90ft of you, making a light attack against them.&nbsp;</p><p>The Fluttering Blade then occupies the same space as the target and follows them throughout all movement, including teleportation.&nbsp;</p><p…” → “<p>Sends a Fluttering Blade to harass the target within 90ft of you, making a light attack against them.&nbsp;</p><p>The Fluttering Blade then occupies the same space as the target and follows them throughout all movement, including teleportation.&nbsp;</p><p…”
  - descriptionText: “Sends a Fluttering Blade to harass the target within 90ft of you, making a light attack against them. The Fluttering Blade then occupies the same space as the target and follows them throughout all movement, including teleportation. Gadfly makes an attack of …” → “Sends a Fluttering Blade to harass the target within 90ft of you, making a light attack against them. The Fluttering Blade then occupies the same space as the target and follows them throughout all movement, including teleportation. The Gadfly then Challenges…”
  - keywords: “(empty)” → “Challenge”
- Fae Knight Style: Megasoma (fae-knight-style--megasoma): descriptionHtml, descriptionText, requirementHtml, requirementText
  - descriptionHtml: “<p>You direct a Heavy Spin Fluttering Blade at a target within 30ft of you, making a Heavy attack and cancelling Fluttering Blade on that weapon afterwards.</p><p>Cannot be used on a Fluttering Blade that was created this turn.</p>” → “<p>You direct a Heavy Spin Fluttering Blade at a target within 30ft of you, making a Heavy attack and cancelling Fluttering Blade on that weapon afterwards.</p><p>The chosen Blade must have Line of Sight to the chosen target.</p>”
  - descriptionText: “You direct a Heavy Spin Fluttering Blade at a target within 30ft of you, making a Heavy attack and cancelling Fluttering Blade on that weapon afterwards. Cannot be used on a Fluttering Blade that was created this turn.” → “You direct a Heavy Spin Fluttering Blade at a target within 30ft of you, making a Heavy attack and cancelling Fluttering Blade on that weapon afterwards. The chosen Blade must have Line of Sight to the chosen target.”
  - requirementHtml: “<p>Heavy Spin Fluttering Blade active from last turn</p>” → “<p>Can only be used with Heavy Spin Fluttering Blades that have been active for at least 1 whole round.</p>”
  - requirementText: “Heavy Spin Fluttering Blade active from last turn” → “Can only be used with Heavy Spin Fluttering Blades that have been active for at least 1 whole round.”
- Fae Knight Style: Willow Stance (fae-knight-style--willow-stance): descriptionHtml, descriptionText
  - descriptionHtml: “<p>You enter Fae Knight Style: Willow Stance.&nbsp;Increasing your Fluttering Blade Limit to 2.&nbsp;Shields can be used as Fluttering Blades while in Willow Stance.&nbsp;</p><p>For 1 mana, all Fluttering Blades created in Willow Stance this turn can be enhan…” → “<p>You enter Fae Knight Style: Willow Stance.&nbsp;Increasing your Fluttering Blade Limit to 2.&nbsp;Shields can be used as Fluttering Blades while in Willow Stance.&nbsp;</p><p>For 2 mana, all Fluttering Blades created in Willow Stance this turn can be enhan…”
  - descriptionText: “You enter Fae Knight Style: Willow Stance. Increasing your Fluttering Blade Limit to 2. Shields can be used as Fluttering Blades while in Willow Stance. For 1 mana, all Fluttering Blades created in Willow Stance this turn can be enhanced with Heavy Spin, allo…” → “You enter Fae Knight Style: Willow Stance. Increasing your Fluttering Blade Limit to 2. Shields can be used as Fluttering Blades while in Willow Stance. For 2 mana, all Fluttering Blades created in Willow Stance this turn can be enhanced with Heavy Spin, allo…”
- Faerie Flash II (faerie-flash-ii): descriptionHtml, descriptionText
  - descriptionHtml: “<p>You Teleport up to twice your Speed to an unoccupied space that you can see.</p><p>If you gain an effect that would lets you regain the use of Faerie Flash and you use Faerie Flash II that turn, instead reduce the mana cost of this ability by 1 (to a minim…” → “<p>You Teleport up to twice your Speed to an unoccupied space that you can see.</p><p>If you gain an effect that would let you regain the use of Faerie Flash and you use Faerie Flash II that turn, instead reduce the mana cost of this ability by 1 (to a minimu…”
  - descriptionText: “You Teleport up to twice your Speed to an unoccupied space that you can see. If you gain an effect that would lets you regain the use of Faerie Flash and you use Faerie Flash II that turn, instead reduce the mana cost of this ability by 1 (to a minimum of 0).” → “You Teleport up to twice your Speed to an unoccupied space that you can see. If you gain an effect that would let you regain the use of Faerie Flash and you use Faerie Flash II that turn, instead reduce the mana cost of this ability by 1 (to a minimum of 0).”
- Fluttering Blade (fluttering-blade): descriptionHtml, descriptionText, keywords
  - descriptionHtml: “<p>You infuse a melee weapon that you are familiar with (belongs to you and was originally in your combat inventory at the start of the encounter) with magic, causing it to float into the air that listens to your directions.&nbsp; You can have one Fluttering …” → “<p>You infuse a melee weapon within ability range that you are familiar with (belongs to you and was originally in your combat inventory at the start of the encounter, or has been in your dimensional storage for at least a day) with magic, causing it to float…”
  - descriptionText: “You infuse a melee weapon that you are familiar with (belongs to you and was originally in your combat inventory at the start of the encounter) with magic, causing it to float into the air that listens to your directions. You can have one Fluttering Blade at …” → “You infuse a melee weapon within ability range that you are familiar with (belongs to you and was originally in your combat inventory at the start of the encounter, or has been in your dimensional storage for at least a day) with magic, causing it to float in…”
  - keywords: “Quick,Rapid” → “Quick,Rapid,Active”
- Forged Knowledge II (forged-knowledge-ii): requirementHtml, requirementText
  - requirementHtml: “<p>You or an ally attacked with a weapon you crafted.</p>” → “<p>You or an ally attacked with a weapon or item you crafted.</p>”
  - requirementText: “You or an ally attacked with a weapon you crafted.” → “You or an ally attacked with a weapon or item you crafted.”
- Forked Lightning (forked-lightning): keywords
  - keywords: “Lightning,Spell” → “Lightning,Spell,Blanketing”
- Headless (headless): descriptionHtml, descriptionText
  - descriptionHtml: “<p>Critical hits rolled against you do not gain Full Pierce and do not automatically deal maximum damage.</p>” → “<p>Critical hits rolled against you do not gain Half Pierce and do not automatically deal maximum damage.</p>”
  - descriptionText: “Critical hits rolled against you do not gain Full Pierce and do not automatically deal maximum damage.” → “Critical hits rolled against you do not gain Half Pierce and do not automatically deal maximum damage.”
- Mana Shield (mana-shield): keywords
  - keywords: “Encounter Start” → “Encounter Start,Shield”
- Mining Expertise (mining-expertise): descriptionHtml, descriptionText
  - descriptionHtml: “<p>You may unlock the miner class for 0 EXP. You must still spend the IP on it.</p>” → “<p>You start with the Miner class unlocked and at level 1.</p>”
  - descriptionText: “You may unlock the miner class for 0 EXP. You must still spend the IP on it.” → “You start with the Miner class unlocked and at level 1.”
- Miracle: Sanctuary (miracle--sanctuary): descriptionHtml, descriptionText, keywords
  - descriptionHtml: “<p>You create an immobile sphere of protection in a 5ft radius that prevents all entry into and out of it. The Shield has health points equal to 20 + Toughness x 8. Attacks and Magical Effects cannot be casted out of or into the Sanctuary, which functions as …” → “<p>You create an immobile sphere of protection in a 5ft radius that prevents all entry into and out of it. The Shield has health points equal to 20 + Toughness x 8. Attacks and Magical Effects cannot be casted out of or into the Sanctuary, which functions as …”
  - descriptionText: “You create an immobile sphere of protection in a 5ft radius that prevents all entry into and out of it. The Shield has health points equal to 20 + Toughness x 8. Attacks and Magical Effects cannot be casted out of or into the Sanctuary, which functions as lin…” → “You create an immobile sphere of protection in a 5ft radius that prevents all entry into and out of it. The Shield has health points equal to 20 + Toughness x 8. Attacks and Magical Effects cannot be casted out of or into the Sanctuary, which functions as lin…”
  - keywords: “Concentration, Miracle,Spell,Upkeep” → “Concentration, Miracle,Spell,Upkeep,Safe”
- Multishot (multishot): keywords
  - keywords: “Overcharge” → “Overcharge,Scatter”
- Ougi: Taju Bunshin no Jutsu (ougi--taju-bunshin-no-jutsu): keywords
  - keywords: “Secret Art,Ninjutsu,Illusion,Upkeep” → “Secret Art,Ninjutsu,Illusion,Upkeep,Active”
- Painkiller Injection (painkiller-injection): descriptionHtml, descriptionText
  - descriptionHtml: “<p>You grant a willing ally temporary HP until the start of your next turn equal to your Focus x X.&nbsp;</p><p>The target cannot benefit from this ability again until the end of your next turn.</p>” → “<p>You inject a willing ally with some helpful drugs to grant them temporary HP until the start of your next turn equal to your Focus x X.&nbsp;</p><p>The target cannot benefit from this ability again until the end of your next turn.</p>”
  - descriptionText: “You grant a willing ally temporary HP until the start of your next turn equal to your Focus x X. The target cannot benefit from this ability again until the end of your next turn.” → “You inject a willing ally with some helpful drugs to grant them temporary HP until the start of your next turn equal to your Focus x X. The target cannot benefit from this ability again until the end of your next turn.”
- Pie Toss (pie-toss): descriptionHtml, descriptionText
  - descriptionHtml: “<p>You deal 2 damage to the target. This damage can not be increased and does not trigger extra damage effects on the target.</p><p>Can be used while downed, Encounter Start and Encounter Conclusion.</p>” → “<p>You deal 2 damage to the target. This damage can not be increased and does not trigger extra damage effects on the target.</p><p>Can be used while downed, Encounter Start and Encounter Conclusion or as an AoO for 0 RP.</p>”
  - descriptionText: “You deal 2 damage to the target. This damage can not be increased and does not trigger extra damage effects on the target. Can be used while downed, Encounter Start and Encounter Conclusion.” → “You deal 2 damage to the target. This damage can not be increased and does not trigger extra damage effects on the target. Can be used while downed, Encounter Start and Encounter Conclusion or as an AoO for 0 RP.”
- Power Word: Reinforce (power-word--reinforce): keywords
  - keywords: “Aid” → “Aid,Shield”
- Sacrament (sacrament): keywords
  - keywords: “Enchantment” → “Enchantment,Divine”
- Secret Art ~ Faerie Light Eyes: Jade Shelterbelt (secret-art---faerie-light-eyes--jade-shelterbelt): keywords
  - keywords: “Secret Art,Illusion” → “Secret Art,Illusion,Active”
- Secret Art: Divine Judgement (secret-art--divine-judgement): keywords
  - keywords: “Secret Art,Sure Hit,Full Pierce” → “Secret Art,Sure Hit,Full Pierce,Divine”
- Secret Art: Meteor (secret-art--meteor): descriptionHtml, descriptionText, keywords
  - descriptionHtml: “<p>You mark a 30x30ft area and begin summoning a meteor to strike it at the start of your next turn. Those in the area when it lands take Heavy Fire Damage. You cannot use the Prepare action on this ability. Overcharge: You may spend extra AP on this ability …” → “<p>You mark a 30x30ft area and begin summoning a meteor to strike it at the start of your next turn. Those in the area when it lands take Heavy Fire Damage.&nbsp;</p><p><strong>Overcharge:</strong> You may spend extra AP on this ability to increase the damage…”
  - descriptionText: “You mark a 30x30ft area and begin summoning a meteor to strike it at the start of your next turn. Those in the area when it lands take Heavy Fire Damage. You cannot use the Prepare action on this ability. Overcharge: You may spend extra AP on this ability to …” → “You mark a 30x30ft area and begin summoning a meteor to strike it at the start of your next turn. Those in the area when it lands take Heavy Fire Damage. Overcharge: You may spend extra AP on this ability to increase the damage and size of it. For every extra…”
  - keywords: “Fire,Overcharge,Spell,Sure Hit,Secret Art,Blanketing” → “Fire,Overcharge,Spell,Sure Hit,Secret Art,Blanketing,Active”
- Selective Casting (selective-casting): descriptionHtml, descriptionText
  - descriptionHtml: “<p>For the next Spell you cast, you may choose to have it not affect a number of targets equal to your Focus.</p><p>Only affects spells with an instantaneous effect (excluding setup things). Lingering spell effects such as Glittershards cannot be used with Se…” → “<p>For the next Spell you cast, you may choose to have it not affect a number of targets you can see equal to your Focus.</p><p>Only affects spells with an instantaneous effect (excluding setup things). Lingering spell effects such as Glittershards cannot be …”
  - descriptionText: “For the next Spell you cast, you may choose to have it not affect a number of targets equal to your Focus. Only affects spells with an instantaneous effect (excluding setup things). Lingering spell effects such as Glittershards cannot be used with Selective C…” → “For the next Spell you cast, you may choose to have it not affect a number of targets you can see equal to your Focus. Only affects spells with an instantaneous effect (excluding setup things). Lingering spell effects such as Glittershards cannot be used with…”
- Shatter Time (shatter-time): descriptionHtml, descriptionText
  - descriptionHtml: “<p>For this encounter you may act during different parts of a round. When you end your turn with AP remaining, you may choose to act immediately after another creature ends their turn. You do not regain AP or RP and these extra actions are not considered turn…” → “<p>For this encounter you may act during different parts of a round. When you end your turn with AP remaining, you may choose to act immediately after another creature ends their turn. You do not regain AP or RP and these extra actions are not considered turn…”
  - descriptionText: “For this encounter you may act during different parts of a round. When you end your turn with AP remaining, you may choose to act immediately after another creature ends their turn. You do not regain AP or RP and these extra actions are not considered turns. …” → “For this encounter you may act during different parts of a round. When you end your turn with AP remaining, you may choose to act immediately after another creature ends their turn. You do not regain AP or RP and these extra actions are not considered turns. …”
- Shield Burst (shield-burst): requirementHtml, requirementText
  - requirementHtml: “<p>Target must have temporary HP applied by you.</p>” → “<p>Target must have temporary HP that cost mana to apply or was applied by a Shieldwarden or Veilguard ability. This temporary HP must have been applied by you.</p>”
  - requirementText: “Target must have temporary HP applied by you.” → “Target must have temporary HP that cost mana to apply or was applied by a Shieldwarden or Veilguard ability. This temporary HP must have been applied by you.”
- Transfusion (transfusion): keywords
  - keywords: “Healing,Aid” → “Healing,Aid,Quick”

## versions.json

Records: 36 → 37; added 1, removed 0, modified 0.

Added:

- Lyrian Chronicles (6a2e7a0d6be32fced4930c9a)
