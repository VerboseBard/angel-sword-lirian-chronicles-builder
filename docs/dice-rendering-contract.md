# Dice Rendering Contract

Locked on 2026-05-31 after the Angel Sword dice fixes.

This file is the memory for what "correct" means. If Asari or Leaflit dice are added back later, do not start by copying old roller behavior. Start here, then update the JSON contract and diagnostics only after the new set visually passes.

## Approved Active Set

- Active set id: `new-angelsword`
- User-facing name: `Angel Sword Dice`
- Old Angel Sword dice: removed from selection because that design did not work.
- Asari and Leaflit: may appear as `Coming Soon`, but should not be selectable until they have their own approved face-art pass.

## Non-Negotiable Rules

- The 3D die art is the result display. Do not add fake circled numbers or generated result badges on top of the die.
- The dice tray must use the same dice art/result data as the board roll.
- If multiple dice are rolled, the tray should show multiple dice.
- A percentile `d100` roll should show a tens die and a ones die.
- Keep the app roller and shared dice core in sync when changing dice behavior.

## D4 Contract

Angel Sword D4 art is classic corner-number D4 art. The result is the number at the top point of the front triangle, not a generated center label.

The source art does not contain every number at the top point in an unrotated form. The approved implementation is:

- Use `getD4FaceArtTransform`.
- Reuse imported D4 face art.
- Remap the source label when needed.
- Rotate the art around the triangle center so the requested result sits on the top point.
- Treat D4 as `readMode: "face"` for roll matching.

Approved D4 top-point map:

| Result | Source Label | Rotation |
| --- | --- | --- |
| `1` | `1` | `+120 degrees` |
| `2` | `1` | `-120 degrees` |
| `3` | `2` | `0 degrees` |
| `4` | `1` | `0 degrees` |

Do not reintroduce:

- `d4VertexLabelTextureCache`
- `makeD4VertexLabelTexture`
- `addD4VertexLabelPanels`
- Generated D4 vertex labels
- Large circled fake result numbers

## Future Dice Sets

When adding Asari or Leaflit back:

1. Add or regenerate set-specific face art.
2. Do not mark the set selectable yet.
3. Create the same kind of preview grid used for Angel Sword.
4. Confirm D4 top-point behavior, D10/D100 kite orientation, and tray previews.
5. Update `assets/dice-3d/dice-rendering-contract.json`.
6. Run `node scripts/diagnose-draft2.mjs`.

This is the seatbelt. It should make future dice work boring in the best possible way.
