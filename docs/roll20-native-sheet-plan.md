# Roll20 Native Sheet Plan

## Product decision

The browser-userscript bridge is retired from the player-facing workflow. It
requires a separate extension, different browser-specific permissions, and a
technical installation process. That does not meet the requirement for a
simple, cross-browser player experience.

The long-term Roll20 connection will be a **Lyrian Chronicles community
character sheet that runs inside Roll20**. Once Roll20 approves and publishes
the sheet, a GM selects it for the game and players use it without installing a
browser extension.

## What works before the native sheet is published

The character builder keeps one browser-independent fallback:

1. Select **Table Tools → Roll20 — Alpha**.
2. Select **Copy Character Macro**.
3. Paste the macro into Roll20 chat.

This works without a subscription or browser extension. It is a manual copy and
paste, not direct synchronization, and must be described that way.

## Target GM experience

After the community sheet is approved:

1. The GM creates or edits a Roll20 game.
2. The GM selects **Lyrian Chronicles** from Roll20's character-sheet list.
3. The GM assigns a character to each player in the normal Roll20 journal.

That is the entire table-level setup. Players do not install Tampermonkey,
userscripts, Chrome extensions, or local files.

## Target player experience

### First character transfer

1. In this builder, select **Copy Roll20 Import Code**.
2. In the assigned Roll20 character, open **Import Character** and paste the
   code.
3. Select **Import**.

Browser security prevents an unrelated website from writing directly into a
Roll20 game. A paste into the native sheet is therefore the lowest-friction
cross-browser transfer unless Roll20 later provides an official external import
API.

### Normal play

After import, attacks, saves, checks, initiative, and resource actions run from
native Roll20 sheet buttons with one click. No external builder tab or browser
add-on is needed during play.

## Roll20 sheet package

Create a dedicated package suitable for Roll20's community-sheet repository:

- `sheet.json` — name, author, system, preview, and repository metadata.
- `sheet.html` — character display, importer, resources, actions, and roll
  controls.
- `sheet.css` — responsive Roll20-native layout.
- `translation.json` — all player-facing labels.
- preview image and README/testing instructions.

The initial release should be an importer and play sheet, not a second copy of
the full guided character builder. Roll20's community-sheet rules restrict
character creation and advancement features; an import workflow is both simpler
and explicitly supported as a character-sheet use case.

## Versioned import contract

Add a builder export named **Copy Roll20 Import Code**. The payload should be a
small, versioned JSON object that contains only Roll20 sheet data:

- format and schema version;
- character identity and portrait reference where permitted;
- race, ancestry, class, and breakthrough labels;
- main and secondary stats;
- skills and expertise;
- HP, Mana, AP, RP, Spirit Core, EXP, and Clim;
- attacks, abilities, equipment, effects, and notes.

The Roll20 sheet worker validates the schema, rejects unsupported versions, and
writes Roll20 attributes only after the player confirms the preview. Import must
never silently erase an existing Roll20 character.

## Optional Pro-only enhancement

A Roll20 Mod may be built later for token-bar synchronization, turn-tracker
automation, and GM utilities. Roll20 requires the game creator to have a Pro
subscription for Mods. The GM would install it once; players would still install
nothing. The community sheet must remain useful without this Mod.

## Acceptance criteria

The native Roll20 connection is not ready to leave Alpha until all of these pass:

- Works in Chrome, Edge, Firefox, and Safari without a browser add-on.
- A GM performs setup once; individual players install nothing.
- A player can import a character with copy, paste, and one confirmation.
- Imported totals match the source character and present a clear mapping report.
- All primary roll buttons post correct Roll20 chat templates.
- Resource changes persist on the Roll20 character.
- Import cannot overwrite an existing character without confirmation.
- The sheet works for free Roll20 players after community-sheet publication.
- Any optional Mod features remain clearly labeled Pro-only and GM-installed.

## Official Roll20 constraints referenced

- [Intro to Sheet Development](https://help.roll20.net/hc/en-us/articles/360037773413-Intro-to-Sheet-Development)
- [Beginner's Guide to GitHub and community submissions](https://help.roll20.net/hc/en-us/articles/360037257314-Beginner-s-Guide-to-GitHub)
- [Introduction to Mod Scripts](https://help.roll20.net/hc/en-us/articles/360037256714-Introduction-to-Mod-Scripts-API)
- [Roll20 subscription feature breakdown](https://help.roll20.net/hc/en-us/articles/360037774633-Feature-Breakdown)
