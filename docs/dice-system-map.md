# Dice System Map

This document explains the reusable dice roller and dice pack system.

## Why This Matters

The dice system may be useful even if another team does not use the rest of the character builder UI. It already explores:

- animated dice rolls
- custom Angel Sword dice art
- clickable character sheet roll buttons
- dice tray behavior
- dice pack metadata
- fallback dice previews
- cross-browser visual checks

## Primary Files

```text
src/js/dice.js
src/js/constants.js
assets/dice-3d/dice-3d-embedded.js
assets/dice-3d/lyrian-accurate-dice.js
assets/dice-3d/new-angelsword-dice-face-art.384-webp.js
assets/dice-3d/shared-dice-roller-core.js
assets/dice-3d/dice-roller-router.js
assets/dice-3d/promoted/
assets/dice/dice-pack-manifest.json
assets/dice/promoted-dice-skins.json
assets/dice/promoted-dice-skins.registry.js
assets/dice/new-angelsword/
assets/dice/dice-coming-soon.svg
docs/dice-rendering-contract.md
```

## Main Concepts

### Dice Configuration

`src/js/constants.js` defines dice types and dice set options.

Search terms:

```text
DICE_TRAY_TYPES
DICE_SETS
DEFAULT_DICE_SET_ID
DICE_PREVIEW_FALLBACK_URL
ENABLE_ACCURATE_DICE_ROLLS
ENABLE_WEBGL_DICE_ROLLS
```

### Runtime Dice Behavior

`src/js/dice.js`, `src/js/ui.js`, and `src/js/runtime-loader.js` handle dice selection,
tray rendering, persisted choice state, preview preparation, and lazy runtime loading.

Search terms:

```text
renderDiceTray
preloadDiceSetFaceArt
dicePackRuntime
prepareDiceSetPreviews
selectDiceSet
```

### 3D/Animated Dice

The embedded/accurate dice files live under:

```text
assets/dice-3d/
```

The current test suite guards against a past issue where the dice roll overlay visually darkened the sheet.

### Installed Dice Sets

The Beta 2.20 working tree has exactly four selectable sets:

- Angel Sword Dice (`new-angelsword`)
- Asari Full Set (`asari-full-set-draft`)
- Leaflit Full Set (`leaflit-full-set`)
- Rana Full Set (`rana-full-set`)

Angel Sword is the built-in default. The other three are generated promoted packs. All
four expose D4, D6, D8, D10, D100, D12, and D20 art and route through the shared renderer.

### Dice Packs

Dice pack metadata lives in:

```text
assets/dice/dice-pack-manifest.json
```

Custom dice art lives under:

```text
assets/dice/new-angelsword/
```

## How To Add A Future Dice Set

1. Add dice preview and face/texture assets.
2. Promote the pack so its sidecar, JSON registry, and browser registry are generated.
3. Add or update the public pack manifest in `assets/dice/dice-pack-manifest.json`.
4. Make sure fallback previews still exist for unavailable packs.
5. Run `npm run dice:core:check`, `npm run test:dice-skins`, and
   `npm run test:dice-browsers`.
6. Run `npm test` and visually inspect the generated screenshots in `qa-test-results/`.

## What To Preserve

- Dice should not dim or obscure the page after a roll.
- Dice should work in Chromium, Firefox, and WebKit.
- Missing dice art should fall back gracefully.
- Character sheet roll buttons should still calculate the correct final roll bonus.

## Useful Test Areas

Look in:

```text
scripts/test-dice-skin-integration.mjs
scripts/test-dice-browser-matrix.mjs
scripts/test-ui-followups.mjs
scripts/test-cross-browser.mjs
```

Search terms:

```text
dice
roll
overlay
dark floor plane
Roll Initiative
Roll Saving Throw
```
