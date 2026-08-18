# Dice Skin Promotion

The character sheet supports complete full-set packs and complete single-die packs exported by the private Dice Builder Workshop.

## Contract

- Schema: `lyrian-dice-skin-pack/v1`
- Geometry: `lyrian-dice-geometry` version `2.0.0`
- Required images: every face of each included die. A D20-only pack therefore contains 20 / 20 D20 faces; a full set contains 70 / 70 faces.
- D4 convention: each `face-k` image is the physical panel opposite result vertex `k`
- Runtime: promoted skins use the Workshop's copied `shared-dice-roller-core.js`; built-in Angel Sword dice continue using the existing approved legacy runtime through the dice router.

## Promotion

Preferred owner workflow:

1. Start the Workshop with `Start Dice Builder Workshop.bat`.
2. Import or build the skin, then verify a specific upward result with `Forced Preview Result`.
3. Click `Export + Install in Character Sheet` in the Skin Pack Builder.
4. Reload the character sheet and choose the installed set.

The builder downloads the JSON before installing it, so the completed portable pack is retained as a backup. If the Workshop local server is not running, use `Export Optimized JSON`, then run `Promote Dice Skin to Character Sheet.bat` from the Workshop folder and choose the exported file.

Command-line equivalent:

```text
npm run dice:promote -- "C:\path\to\completed-skin.json"
```

The promotion command validates every included die before changing the character sheet. Missing dice use the procedural fallback; a die that is present but missing one of its own faces is rejected. Promotion writes a per-skin art sidecar under `assets/dice-3d/promoted/`, updates the small promoted-skin registry, and updates the dice-pack manifest. It does not publish or push anything.

## Verification

```text
npm run dice:core:check
npm run test:dice-skins
npm run build
```

The standalone roller's `Validate All 70 Faces` button checks every requested settle, including the D4's vertex result convention.
