# Owner Checklist & Connection Tutorials — verified edition

Last updated: 2026-07-23. On this date a Claude session ran every step it could reach
itself, in a real browser, against the live official site. Steps marked **[VERIFIED]**
were actually executed and worked exactly as written. Steps marked **[YOU]** need your
hands, accounts, or installs. Item statuses:

| # | Connection | Status |
|---|---|---|
| 1 | Roll20 bridge | Blocked on ONE install only: Tampermonkey is not in your Chrome (confirmed — Chrome plain-downloaded the userscript instead of installing it). Everything after that install is ready. |
| 2 | Owlbear Rodeo | Needs your Owlbear login. Untested beyond that. |
| 3 | Foundry VTT | Foundry is NOT installed on this PC (searched Program Files, AppData, E:). Waits until you install it. |
| 4 | CCS spreadsheet | **File generation fully verified** — real browser download, correct values in correct cells, styles intact. Only the Google-Drive "formulas revive" check remains. |
| 5 | .aschar ↔ official vault | **PASSED — fully verified live.** Our export was imported by the official vault's own code at clio.angelssword.com and the character appears in their vault list. Nothing left to do. |

---

## Starting the server (used by tutorials 1, 2, 4 — one method for all) [VERIFIED]

The app is a static site with a small dev server. One server serves everything: the app,
the bridge userscript, the Owlbear extension files.

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

## Tutorial 1 — Roll20 bridge (~15 min after the one install)

**The one thing verified missing: Tampermonkey.** When Chrome has no userscript manager,
clicking Install Bridge just downloads the file to your Downloads folder (this exact
behavior was observed) — that's the "nothing happened" failure mode.

1. **[YOU]** Install Tampermonkey once: Chrome Web Store → search "Tampermonkey" →
   Add to Chrome. Then click the puzzle-piece icon (top right) → pin Tampermonkey.
   One extra step on modern Chrome: right-click the Tampermonkey icon → Manage
   extension → turn ON **"Allow User Scripts"** (or Developer Mode at the top of
   chrome://extensions on older versions) — without it, userscripts silently don't run.
2. With the server running, open http://localhost:4176 → load/build a character → open the
   sheet → **VTT & Sharing** → Roll20 card → **Install Bridge**. Tampermonkey now opens
   its install tab — click **Install**.
3. Refresh the app tab. Roll20 card's second chip: "Bridge not installed" → **"Roll20 not
   open"**. That chip changing is proof the userscript is alive.
4. Log into Roll20 in another tab and open any game (make a free solo game if needed —
   Create Game, any name, no module).
5. Back on the sheet within ~5 seconds: chip flips to **"Connected"**, and **⚔ Send**
   buttons appear on every action/ability card.
6. Test ladder, in order:
   a. Hub **Send to Roll20** → your character summary appears in Roll20's chat.
   b. **⚔ Send** on Light Attack → macro posts AND 1 AP disappears from your sheet —
      the deduction happens only after Roll20 confirms (that ordering is the whole
      safety design; it was proven with a simulated Roll20 in three browsers).
   c. Click your token on the Roll20 map → hub **Pin Selected Token** → label shows its
      name.
   d. (Needs TokenMod — a Pro-account game mod) tick **Sync token bars**, change your HP
      → token bar 1 updates.
   e. Tick **Send initiative rolls**, roll Initiative → posts to chat + your pinned token
      lands in the turn tracker with the same number.
7. Final pass someday: repeat 2–6b with Violentmonkey instead of Tampermonkey.

**If it fails:** F12 console on BOTH tabs, look for lines starting `[AS Roll20 Bridge` —
copy them to the next session with the step letter that failed.

## Tutorial 2 — Owlbear Rodeo (~10 min, needs your Owlbear account)

1. Server running; open the app and the VTT hub → Owlbear card → **Copy Manifest URL**
   (it copies `http://localhost:4176/owlbear/manifest.json`).
2. **[YOU]** Log into https://owlbear.rodeo and open or create a room.
3. Click your profile icon (bottom-left in a room) → **Extensions** → **Add Custom
   Extension** → paste the URL → Add.
4. An "Angel Sword" action button should appear in the room's toolbar — open it; the
   panel says "Waiting for rolls…".
5. In your app tab, roll anything (dice tray, attack, skill) → the roll should appear in
   the Owlbear panel. That's the one-browser test.
6. The full test: second device or incognito window, join the same room as a second
   player, open the panel there too → your rolls appear on their panel ("Room connected"
   chip) and theirs on yours.

**Honest expectation:** this is the least pre-validated adapter (a live room was never
available to any session). If Owlbear rejects the manifest or the panel stays
"Standalone", screenshot the exact message — that's the fix input.

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

## Optional: let Claude drive tutorials 1, 2, and 4 to the finish

A Claude session can operate your real Chrome (logins and extensions included) once two
things are true: Tampermonkey is installed (tutorial 1 step 1), and you approve the sites
in the Claude Chrome extension when it asks (app.roll20.net, owlbear.rodeo,
drive.google.com, clio.angelssword.com — it currently only has localhost). After that,
"walk the Roll20 checklist in my Chrome" is a valid request; you watch, Claude clicks.

## Decisions still parked (say the word, no desktop needed)

- Workspace cleanup: go/no-go + archive destination (default `E:\Archives\AngelsSwordHistory\`).
- Discord dice: on hold.
- GitHub publishing: waiting for your "desktop verification done".
- Mirane mod-timing rule: rules-confirmed, awaiting your go to implement.
