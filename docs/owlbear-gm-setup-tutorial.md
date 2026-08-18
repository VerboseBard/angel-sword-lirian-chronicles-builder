# Angel Sword + Owlbear Rodeo GM Setup

## Current status

Angel Sword Companion is currently a **local developer preview**. It is not
published at a permanent public address yet. The local preview can be installed
on the GM's Owlbear account while the character builder's local server is
running on the same computer.

- Local test install link: `http://127.0.0.1:<running-port>/owlbear/manifest.json`
  (for example, `http://127.0.0.1:4176/owlbear/manifest.json`; use the port printed by the server)
- Planned public install link: `https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/owlbear/manifest.json`
- The planned public link currently returns 404 and must not be given to players
  as an installable release.

The extension can be added through the free Owlbear **Nestling** account used for
the earlier setup inspection. The signed-in profile displayed both **Manage** and
**Add Custom Extension** without requiring an upgrade; confirm those controls are
still available during the live-room test.

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
4. Read the status badges at the top of the walkthrough:
   - **Local preview available** means the local test files are reachable.
   - **Public release not published** means the permanent internet address is
     not ready for players.
5. For a local test, select **Copy Local Test Install Link**.

## Part 2: Add the custom extension to the GM account

1. Open [Owlbear Rodeo Profile](https://www.owlbear.rodeo/profile).
2. Scroll to **Extensions**.
3. Select **Manage**.
4. Select **Add Custom Extension**.
5. Paste the Angel Sword install link into **Install Link**.
6. Select **Add**.
7. Confirm that **Angel Sword Companion** appears under **My Extensions**.

Installing the local preview changes the GM's Owlbear account. The builder
walkthrough therefore stops before this step until the GM confirms the install.

## Part 3: Enable Angel Sword in a room

1. Open the Owlbear room as the GM.
2. Open the room's extension manager.
3. Find **Angel Sword Companion**.
4. Enable it for the room.
5. Confirm that the **Angel Sword** action appears in the room.
6. Open the action and confirm that its panel loads.

The local server must remain running for the local preview. Closing it makes the
local manifest and panel unavailable to Owlbear.

## Part 4: Invite players

1. In the Owlbear room, open **Players**.
2. Select **Invite Players**.
3. Copy the Owlbear room invite link.
4. Send that room invite link to the players.
5. Each player opens the link and joins the Owlbear room normally.

## Part 5: Import and bind a character

1. In the Angel Sword builder, open **Table Tools → Character Files**.
2. Use **Export Character** and select the JSON export, or use the verified
   official `.aschar.json` export.
3. In Owlbear, open **Angel Sword Companion → Character**.
4. Under **Import your character**, choose the exported file.
5. Confirm that the character name and current resources appear.
6. Place or select exactly one token on Owlbear's **Character** layer.
7. Select **Bind Selected Token**.
8. Confirm that the panel names both the character and bound token.
9. Select **Send Test Roll**, then open **Room Rolls** and confirm that the
   result appears for every connected participant.

The binding stores a compact character/player/token relationship in namespaced
Owlbear metadata. It does not upload the complete rulebook or builder source.

External character-sheet roll mirroring is still an Alpha transport and needs a
real two-browser room test. Modern browser partitioning can prevent a normal
builder tab from sharing `BroadcastChannel` messages with an extension iframe.
The extension's own imported character, token binding, connection-test roll,
and room log do not depend on that cross-site channel.

This milestone does not yet change HP, consume movement, apply conditions, or
run Lyrian initiative. Those belong to later modules in the same extension.

## Recording checklist

Capture these scenes for the tutorial video:

1. Character sheet: Combat/Crafting/Gathering/**Table Tools** tabs.
2. Table Tools: Character Library, VTT Connections, and Guided Setup.
3. Owlbear walkthrough: local and public status badges.
4. Owlbear profile: Extensions → Manage.
5. Extensions window: Add Custom Extension.
6. Install Link field and Add button.
7. My Extensions showing Angel Sword Companion.
8. The room extension manager enabling Angel Sword.
9. The Angel Sword room action and panel.
10. Players → Invite Players, emphasizing that this is the room link.
11. Character JSON import inside the Angel Sword panel.
12. Selecting one Character-layer token and binding it.
13. Sending a connection-test roll and viewing it under **Room Rolls**.
