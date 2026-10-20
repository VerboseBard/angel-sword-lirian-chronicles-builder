# Angel Sword + Owlbear Rodeo GM Setup

> **Superseded (2026-10).** This page describes the earlier local-only test. Angel Sword Companion and Angel Sword Dice have been public on GitHub Pages since 2026-09-16. Current steps: `docs/owlbear-gm-video-walkthrough.md` (steps 10-22). The owner's recording plan is `docs/owlbear-tutorial-recording-outline.md`. The body below and the recording checklist at the end are kept as history of the local-preview era (task 041, 2026-10-19: only the lines that would mislead today were corrected). Install links:
> Companion: `https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/owlbear/manifest.json`
> Dice: `https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/owlbear-dice/manifest.json`

## Current status

Both extensions are **public** (GitHub Pages, since 2026-09-16): the install links
in the banner above are the ones to give a GM. A localhost install
(`http://localhost:4176/owlbear/manifest.json` and `.../owlbear-dice/manifest.json`)
is only for testing the next version on this computer while `npm start` runs in the
Beta 2.5 Online worktree; the builder's Owlbear walkthrough shows those local links
under **Testing on this computer today** only when it is opened from localhost.

The extensions can be added through a free Owlbear account. The profile's
**Extensions** section has **Manage** and **Add Extension**; no upgrade is needed.

## What the two links do

The Owlbear room invite and the Angel Sword extension install link have separate
jobs:

1. The **extension install link** is used once by the GM to add Angel Sword to
   the GM's Owlbear account.
2. The GM enables Angel Sword in the room.
3. The **room invite link** is what the GM sends to players so they can join the
   game. Players do not paste the room invite into the character sheet.

## Part 1: Open the Angel Sword walkthrough

1. Open a character in the Angel Sword character sheet.
2. Select **Table Tools** beside Combat, Crafting, and Gathering.
3. Under **Choose a Service**, select **Owlbear Rodeo — Alpha**.
4. Read the chips at the top of the walkthrough: **Alpha connection**,
   **Not linked to a room yet** (or **Linked to your game room** in a sheet opened
   from the Companion) and **Public install links ready**.
5. Select **Copy Companion Install Link** and **Copy Dice Install Link** (the two
   public addresses are also printed above the buttons). Only when the builder runs
   from localhost, a **Testing on this computer today** block offers **Copy Local
   Test Link** and **Copy Local Dice Test Link** for a local test.

## Part 2: Add the two extensions to the GM account

1. Open [Owlbear Rodeo Profile](https://www.owlbear.rodeo/profile).
2. Scroll to **Extensions**.
3. Select **Manage** if shown.
4. Select **Add Extension** (the + control).
5. Paste the Companion install link into **Install Link**.
6. Select **Add**.
7. Confirm that **Angel Sword Companion** appears under **My Extensions**. Repeat
   steps 4-6 with the Dice install link and confirm **Angel Sword Dice**.
8. Click the heart on each card so every new room offers both extensions.

Installing an extension changes the GM's Owlbear account; the builder only copies
the links, it never installs anything itself.

## Part 3: Enable Angel Sword in a room

1. Open the Owlbear room as the GM.
2. Open **Extras → Extensions** (the room's Extensions Manager).
3. Find **Angel Sword Companion** and **Angel Sword Dice**; use **Add** if either
   is missing from the room's list.
4. Switch both on for the room.
5. Confirm that the **Angel Sword Companion** and **Angel Sword Dice** actions
   appear at the top left of the room.
6. Open the Companion action and confirm that its panel loads.

Only a localhost test install needs the local server running. Closing it makes the
local manifest and panel unavailable to Owlbear; the public cards are unaffected.

## Part 4: Invite players

1. In the Owlbear room, open **Players**.
2. Select **Invite Players**.
3. Copy the Owlbear room invite link.
4. Send that room invite link to the players.
5. Each player opens the link and joins the Owlbear room normally.

## Part 5: Import a character and place its token

1. In the Angel Sword builder, open **Table Tools**. Under
   **Save, Load, Export, or Import**, press **Export Character**.
2. Select the JSON export, or use the verified official `.aschar.json` export.
3. In Owlbear, open **Angel Sword Companion → Character**.
4. Under **Import your character**, choose the exported file.
5. Confirm that the character name and current resources appear.
6. For a token, the Companion needs the character's picture. Select **Open My
   Character Sheet**, then **Send Character to Room** in that sheet. If its
   **Your token** says **No picture yet**, choose one with **Change Image** first.
   A file import alone carries no token picture.
7. First time: select **Download Token Image**, drag the file onto the Owlbear
   map and choose **Character**. Later sessions: select **Place My Token** and
   pick the token.
8. Binding is optional. To link the token to the character, select exactly that
   one token on the **Character** layer, then **Bind Selected Token**. Rolls work
   without it.
9. Select **Send Test Roll**, then open **Room Rolls** and confirm that the
   result appears for every connected participant.

If you bind a token, the binding stores a compact character/player/token relationship in namespaced
Owlbear metadata. It does not upload the complete rulebook or builder source.

External character-sheet roll mirroring is still an Alpha transport and needs a
real two-browser room test. Modern browser partitioning can prevent a normal
builder tab from sharing `BroadcastChannel` messages with an extension iframe.
The extension's own imported character, token binding, connection-test roll,
and room log do not depend on that cross-site channel.

This milestone does not yet change HP, consume movement, apply conditions, or
run Lyrian initiative. Those belong to later modules in the same extension.

## Recording checklist (historical, local-preview era)

Use `docs/owlbear-tutorial-recording-outline.md` for the real recording. This list
is kept as history of what the earlier local test captured:

1. Character sheet: Combat/Crafting/Gathering/**Table Tools** tabs.
2. Table Tools: Character Library, VTT Connections, and Guided Setup.
3. Owlbear walkthrough: the status chips and the two Copy install-link buttons.
4. Owlbear profile: Extensions → Manage.
5. Extensions window: Add Extension.
6. Install Link field and Add button.
7. My Extensions showing Angel Sword Companion.
8. The room extension manager enabling Angel Sword.
9. The Angel Sword room action and panel.
10. Players → Invite Players, emphasizing that this is the room link.
11. Character JSON import inside the Angel Sword panel (a fallback; the main route
    is Open My Character Sheet, then Send Character to Room in that sheet).
12. Download Token Image, dragging the file onto the map and choosing Character
    (binding is optional).
13. Sending a connection-test roll and viewing it under **Room Rolls**.
