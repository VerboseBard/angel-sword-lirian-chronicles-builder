# Owner Checklist & Connection Tutorials — verified edition

Last updated: 2026-08-16. Automated checks have run every local step they can reach,
and earlier live checks used the official sites. Steps marked **[VERIFIED]**
were actually executed and worked exactly as written. Steps marked **[YOU]** need your
hands, accounts, or installs. Item statuses:

| # | Connection | Status |
|---|---|---|
| 1 | Roll20 | Manual macro copy works across browsers. The userscript bridge is retired from the player interface. A native Roll20 community sheet/importer is the required one-click solution. |
| 2 | Owlbear Rodeo | **Local v0.2 milestone verified.** Character import, ownership-aware token binding, a shared room roll contract/log, the background page, deployment packaging, and standalone safeguards are automated. A real GM + second-player room test still needs your Owlbear account. |
| 3 | Foundry VTT | Foundry is NOT installed on this PC (searched Program Files, AppData, E:). Waits until you install it. |
| 4 | CCS spreadsheet | **File generation fully verified** — real browser download, correct values in correct cells, styles intact. Only the Google-Drive "formulas revive" check remains. |
| 5 | .aschar ↔ official vault | **PASSED — fully verified live.** Our export was imported by the official vault's own code at clio.angelssword.com and the character appears in their vault list. Nothing left to do. |

---

## Starting the server (used by tutorials 1, 2, 4 — one method for all) [VERIFIED]

The app is a static site with a small dev server. One server serves the app and
the Owlbear extension preview files.

1. Open a terminal (PowerShell is fine).
2. Run:
   ```
   cd "E:\Chat gpt Codex\Angels sword\Angel Sword Lirian Chronicles Public Beta 2.20"
   npm.cmd start
   ```
3. It prints the address — normally **http://localhost:4176** (if 4176 is busy it picks
   the next number; use whatever it prints).
4. Open that address in Chrome. You'll see the builder ("Beta 2.13" branding is expected —
   the 2.20 name only appears at release).
5. Everything below assumes this is running. To stop it later: Ctrl+C in that terminal.

A useful shortcut for testing: on the builder's first screen use **Quick Build** to get a
complete character in seconds instead of building one by hand.

---

## Tutorial 1 — Roll20 current fallback and native-sheet target

The browser-userscript bridge is no longer a player feature. Players should not
install Tampermonkey, enable browser developer settings, or import `.user.js` files.

### Cross-browser fallback available now

1. Open a character and select **Table Tools → Roll20 — Alpha**.
2. Select **Copy Character Macro**.
3. Open the Roll20 game, paste into chat, and send.

This is functional in modern browsers without an extension, but it is manual and
must not be described as direct synchronization.

### Required release direction

Build and publish a Lyrian Chronicles community character sheet inside Roll20.
The GM selects it for the game once. A player copies a Roll20 import code from this
builder, pastes it into the assigned Roll20 character, and confirms Import. After
that, the player rolls attacks, saves, checks, and initiative from native one-click
buttons inside Roll20. See `docs/roll20-native-sheet-plan.md`.

A Pro-only Roll20 Mod may later add token-bar and turn-tracker automation, but it
must be GM-installed and optional. The community sheet must work without it.

## Tutorial 2 — Owlbear Rodeo (~15 min, needs your Owlbear account)

1. Start the local server and use the exact port it prints. The local install link is
   `http://127.0.0.1:<port>/owlbear/manifest.json` (for example, port 4176).
2. **[YOU]** Log into [Owlbear Rodeo](https://www.owlbear.rodeo/profile), then select
   **Extensions → Manage → Add Custom Extension**. Paste the local install link and add
   **Angel Sword Companion**. Keep the local server running for the entire test.
3. Open or create a room, enable **Angel Sword Companion** in that room, and open its
   action panel.
4. In the builder, open **Table Tools → Character Files → Export Character** and save a
   Character JSON file. An official `.aschar.json` file is also accepted.
5. In the Owlbear panel's **Character** tab, import that file. Confirm the name, classes,
   and current HP/Mana/AP/RP values.
6. Put one token on Owlbear's **Character** layer, select only that token, and choose
   **Bind Selected Token**. Confirm that the panel names both the character and token.
7. Choose **Send Test Roll**, then open **Room Rolls** and confirm the result appears.
8. Join the room from an incognito window or second browser as another player. Open the
   companion there and confirm the shared result appears. Import and bind a second
   character/token, send a test roll, and confirm both participants receive it.
9. With both room participants connected, roll from the external Angel Sword sheet and
   check whether the result reaches **Room Rolls**. Repeat once with the companion panel
   closed to exercise its background page.

**Honest expectation:** import, token binding, the event contract, local room-log behavior,
standalone safeguards, and required deployment files are automated. The real two-account
Owlbear behavior is not yet certified. Cross-site browser storage partitioning may block the
external-sheet relay even though extension-native import, binding, test rolls, and room logs
work. This milestone does not apply HP changes, movement, conditions, Lyrian initiative, or
mirrored visual dice. The permanent public manifest is packaged for a future deployment but
has not been published. See `docs/owlbear-gm-setup-tutorial.md` for the recording walkthrough.

## Tutorial 3 — Foundry VTT (~10 min once Foundry exists on this PC)

Confirmed: no Foundry installation on this machine, so step 1 is the gate.

1. **[YOU]** Install Foundry VTT (your license, foundryvtt.com → Purchased Licenses →
   download the Windows installer) and run it once.
2. Copy the folder
   `E:\Chat gpt Codex\Angels sword\Angel Sword Lirian Chronicles Public Beta 2.20\foundry`
   to `%LOCALAPPDATA%\FoundryVTT\Data\modules\angel-sword-lyrian`
   (the folder must contain `module.json` directly).
3. Launch any world → Settings sidebar → **Manage Modules** → enable "Angel Sword —
   Lyrian Chronicles Companion".
4. In the app: VTT hub → Official Clio Builder → **Export .aschar.json**. Open the
   downloaded file in Notepad, Ctrl+A, Ctrl+C.
5. In Foundry chat: type `/asimport`, paste into the dialog, Import → a notification
   names your character. (The dialog accepts the whole file as-is — envelope handling is
   built in.)
6. `/asroll heavy` → posts 1d20 + your heavy bonus. `/ascharacter` → summary card.
   `/asroll save` → 2d10 + save.
7. Confirm the Actors tab is untouched — the module never creates Actors by design.

## Tutorial 4 — CCS spreadsheet → Google Drive (~5 min, needs your Google account)

Machine half already **[VERIFIED]**: the exported file was downloaded through a real
browser, and its cells were inspected — name/race strings, stat numbers, checkbox
values, and the Mirane flag all land in the correct cells with the template's styling
intact. What no machine here can check is Google's IMPORTRANGE revival:

1. App → sheet → VTT hub → Official Clio Builder card → **Export CCS Spreadsheet**
   (a `-ccs.xlsx` file downloads).
2. **[YOU]** drive.google.com → New → File upload → pick that file.
3. Double-click it in Drive → **Open with Google Sheets**.
4. Success = the template wakes up: your values visible on Core, and the template's own
   computed cells (derived stats, totals) fill themselves in. A one-time "allow access"
   button may appear for linked ranges — clicking that is part of the revival.
5. While you're in there: look at the **Proficiencies box (Core, around K9)** on any
   hand-filled CCS you can find and describe how people write in it — that's the one
   region our exporter deliberately leaves blank.

## Tutorial 5 — .aschar ↔ official vault — **DONE, nothing to do**

Fully verified live on 2026-07-23 by `scripts/verify-interop-live.mjs`: real button
download → real upload into https://clio.angelssword.com/characterbuilder/vault.html →
their import code accepted it → character listed in their vault. Re-run the proof any
time with the server running:

```
node scripts/verify-interop-live.mjs
```

(The reverse direction — an official export into our Import button — is covered by the
automated import tests; if you ever hit a real official file that misbehaves, save it for
the next session.)

## Optional: browser-assisted verification

A browser-control session can verify the current macro-copy flow, the Owlbear setup,
the CCS upload, and the Clio file exchange after the relevant sites are approved. The
native Roll20 sheet cannot be physically tested until its package exists and a Pro-owned
development game or Roll20 Sheet Sandbox is available.

## Decisions still parked (say the word, no desktop needed)

- Workspace cleanup: go/no-go + archive destination (default `E:\Archives\AngelsSwordHistory\`).
- Discord dice: on hold.
- GitHub publishing: waiting for your "desktop verification done".
- Mirane mod-timing rule: rules-confirmed, awaiting your go to implement.
