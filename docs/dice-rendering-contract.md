# Dice Rendering Contract

Locked on 2026-05-31 after the Angel Sword dice fixes. Updated on 2026-08-16
after the four-set Beta 2.20 integration audit.

This file is the memory for what "correct" means. When a set is added or regenerated,
do not start by copying old roller behavior. Start here, then update the registry and
diagnostics only after the set visually passes.

## Approved Public Sets

- `new-angelsword` — Angel Sword Dice
- `asari-full-set-draft` — Asari Full Set
- `leaflit-full-set` — Leaflit Full Set
- `rana-full-set` — Rana Full Set

## Non-Negotiable Rules

- The 3D die art is the result display. Do not add fake circled numbers or generated result badges on top of the die.
- The dice tray must use the same dice art/result data as the board roll.
- If multiple dice are rolled, the tray should show multiple dice.
- A percentile `d100` roll should show a tens die and a ones die.
- Keep the app roller and shared dice core in sync when changing dice behavior.

## D4 Contract

All four public D4s are vertex-read. The result is the number at the highest
visible pyramid point, not a generated center label. Art key `face-k` (or the
legacy Angel Sword label `k`) is the physical panel opposite result vertex
`k`, so it contains the other three numbers.

The approved Angel Sword implementation is:

- Route Angel Sword through the same shared geometry and settling engine used
  by Asari, Leaflit, and Rana.
- Keep the imported Angel Sword border, pearl field, sword crest, gems, and
  color design upright and unchanged on every flat panel.
- Replace only the old baked numeral layer. Those three old numerals were all
  painted upright to the source image, so rotating the complete triangle could
  never make all three point toward their own vertices at once.
- Rebuild the three gold numerals from `D4_FACE_CORNERS`, with apex `0 degrees`,
  right `+120 degrees`, and left `-120 degrees`.
- Treat D4 as `readMode: "vertex"` for roll matching.

Approved Angel Sword physical-panel map:

| Physical panel | Required corners (apex/right/left) |
| --- | --- |
| `1` | `2 / 4 / 3` |
| `2` | `1 / 3 / 4` |
| `3` | `1 / 4 / 2` |
| `4` | `1 / 2 / 3` |

Do not reintroduce:

- `d4VertexLabelTextureCache`
- `makeD4VertexLabelTexture`
- `addD4VertexLabelPanels`
- Separate 3D label meshes or result badges
- Large circled fake result numbers

## Future Dice Sets

When adding another public set:

1. Add or regenerate set-specific face art.
2. Keep it out of `promoted-dice-skins.registry.js` until its full-set checks pass.
3. Create the same kind of preview grid used for Angel Sword.
4. Confirm D4 top-point behavior, D10/D100 kite orientation, and tray previews.
5. Promote it with `npm run dice:promote` and verify the generated registry/sidecar.
6. Run `npm run dice:core:check`, `npm run test:dice-skins`,
   `npm run test:dice-browsers`, and `npm test`.

This is the seatbelt. It should make future dice work boring in the best possible way.
