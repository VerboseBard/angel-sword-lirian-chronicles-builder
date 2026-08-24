# Angel Sword Builder Beta 3 — Owlbear-First Release Roadmap

Decision recorded: 2026-08-23

## Answer-first identity

- The active implementation remains in `Angel Sword Lirian Chronicles Public Beta 2.20`
  on branch `agent/beta-2-20-development` until the release gates below pass.
- The release earned by this work will be **Angel Sword Character Builder Beta 3**, not
  Beta 2.5 and not a continuation of the former visual redesign project.
- The feature that defines Beta 3 is a functioning, tested **Owlbear Rodeo Companion**.
- The former `Public Beta 3.0` game-style redesign is a separate experimental product named
  **Game Interface — Angel Sword Character Sheet Alpha 1**. It is parked and cannot supply
  code or scope to this release unless the owner explicitly reopens that project.
- Roll20 and Foundry are not active release priorities. Preserve their existing fallback,
  prototypes, documentation, and tests, but do not spend current implementation time on them.

Do not change the visible public version merely because this decision exists. The current
development build earns the Beta 3 label only after the owner approves all release gates.

## Priority order

### Priority 1 — Make Owlbear work in a real game

The current Owlbear Companion v0.2 Alpha is the active product focus. Complete these gates in
order:

1. Start the extension locally and install its local manifest into the owner's Owlbear profile.
2. Test one GM, one second player, two imported characters, and two Character-layer tokens in a
   disposable room.
3. Verify import, token binding and clearing, ownership protection, GM repair, test rolls, room
   roll deduplication, reconnect behavior, and background behavior with the panel closed.
4. Test an external builder-tab roll separately. Record storage-partition failures without
   confusing them with extension-native failures.
5. Fix every reproducible local-room problem and repeat the automated and physical checks.
6. Publish the exact extension files to an unlisted HTTPS staging address, not the production
   builder URL, and repeat the GM/player tests from separate devices and networks.
7. Verify Chrome, Edge, Firefox, Brave, Safari/WebKit, private browsing, desktop, phone, and
   tablet behavior before calling the extension public-ready.

The GM should install or enable the Owlbear extension once for the room. Players should join by
the normal Owlbear invitation and should not install Tampermonkey, a browser userscript, or a
separate Chrome-only bridge.

### Priority 2 — Harden the builder, dice, rules, and interface

After the Owlbear room workflow is reliable:

1. Physically verify all four dice sets: Angel Sword, Asari, Leaflit, and Rana.
2. Listen to roll audio, fix missing or inconsistent sound, and add the persistent mute control.
3. Recheck the removed floor/haze regression and the dice tray at desktop and phone sizes.
4. Finish the selected rules and creation corrections that affect exported or played characters.
5. Fix interface problems that obstruct character creation, live play, Owlbear import, or
   character comparison. Do not reopen the complete game-style redesign here.

### Priority 3 — Prove official Clio interoperability and parity

After the relevant builder rules are stable:

1. Create a deliberate comparison character in the official Clio builder.
2. Export its official `.aschar.json` file.
3. Import that exact file into this builder.
4. Compare every meaningful field: identity, rules version, race/ancestry, classes and levels,
   stats, skills and expertise, breakthroughs, creation interludes, EXP, Spirit Core, Clim,
   equipment, quantities, mods/materials, resources, and derived values.
5. Classify each difference as an import bug, a rule-calculation bug, an unsupported official
   field, an intentional local feature, or an official/local interpretation question.
6. Turn the saved official exports into regression fixtures so future changes cannot silently
   reintroduce the differences.
7. Repeat in the opposite direction: export from this builder, import into the official Clio
   vault, and compare the resulting character.

The earlier live round trip proves that the file doorway works. This new gate proves that the
character on each side means the same thing.

## Beta 3 release gate

Call this product **Angel Sword Character Builder Beta 3** only when all of the following are
true:

- the Owlbear extension is hosted at a stable HTTPS manifest URL;
- a real GM plus second-player room test passes;
- the extension works without Tampermonkey or a player-installed browser bridge;
- the four dice sets, roll visuals, and roll sound pass physical checks;
- selected release-blocking rules and interface issues are resolved;
- official Clio-to-local and local-to-official comparison fixtures pass;
- the full automated suite passes from the copied deployment artifact;
- the owner approves the release notes, version change, merge, and publication.

Owlbear Showcase submission is a later distribution step. A stable custom manifest can be
tested and shared before the extension is listed in the public showcase.

## Parked work

- Native Roll20 sheet work: parked; another contributor owns that direction.
- Foundry package work: parked; another contributor owns that direction.
- Game Interface — Angel Sword Character Sheet Alpha 1: preserved as a separate experimental
  project; not a dependency of Builder Beta 3.
- Large visual/game-style redesign ideas: belong only to the Game Interface Alpha project.

