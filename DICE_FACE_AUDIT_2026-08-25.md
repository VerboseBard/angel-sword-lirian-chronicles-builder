# Dice Face Audit — 2026-08-25

Owner-ordered 100%-coverage audit: every face of every die across all four sets,
forced to land on each value, captured and verified image-by-image. Trigger: live
reports of the die visually showing a different number than the roll registered
(seen most on d20s, on Asari and Rana).

## Verdict

**No mapping, geometry, or orientation bugs exist. 280 of 280 face assignments
are correct.** Every die in every set lands with the correct face up and the
numeral upright. The experienced mismatches are a *reading* problem caused by
the settle camera's low angle plus per-set art legibility — real, reproducible,
worth fixing — but not a data or engine defect.

## Method (instruments beat eyeballs)

1. `scripts/dice-face-audit.mjs` + `dice-face-audit.html` — 28 grids (4 sets x
   7 dice): per face, the 3D settled render beside the flat source art and the
   expected value. Output: `qa-test-results/dice-face-audit/`.
2. `scripts/dice-orientation-diagnostic.mjs` — numeric check via the engine's
   own `finalQuaternionForDie`: settled art-up vs screen-up per face. Result:
   0 deg for every face-read die face (d4 is vertex-read; metric not applicable).
3. `scripts/dice-topdown-audit.mjs` — the decisive instrument: orthographic
   camera looking straight down at each settled die, zero foreshortening.
   Output: `qa-test-results/dice-face-audit/topdown/`. All 24 face-read grids
   verified: correct number, upright glyph, every face, every set.
4. Animated-path check: `rollDice` settles each die at exactly
   `finalQuaternionForDie` composed with a deliberate random +/-10 deg yaw
   ("no catalogue pose", `shared-dice-roller-core.js:1450-1457`), so live rolls
   match the audited pose.

Supporting facts confirmed on the way: all four sets share one geometry and one
orientation code path (no per-set orientation data anywhere); d10/d100
`physicalKeyOrder` permutation is correct; d20 opposite faces all sum to 21;
flat art depicts the right number for every key in every set; special faces are
intentional (every set's d20 "20" is portrait/emblem art; Rana's d20 "1" is the
comet fumble art). The d4 uses the separate corner-number system pinned by
`D4_FACE_CORNERS` in `test:dice-skins` and is not covered by the top-down
instrument.

## Why players (and this audit, twice) misread it

- The settle camera sits at ~30 deg elevation: the RESULT face is heavily
  foreshortened while the two adjacent camera-facing faces render larger and
  more legible. Forced 17 puts big 19 and 15 in front — the exact confusions
  reported ("rolled 17, registered 13", "19 registered as 17" are
  adjacent/rotated-glyph reads).
- During this audit the auditor confidently misread the Angel d10 "9" as an
  inverted 6 from the perspective render; the top-down instrument proved it
  upright and correct. If it fools a full-attention audit, it fools a table.
- Side faces of a d10 legitimately show upside-down glyphs (physically correct
  on the real solid) — and they're often the most legible thing on screen.
- Per-set legibility ranking at angle: Angel Sword (bold, 6/9 dots) > Asari /
  Leaflit (clean but no 6/9 marks, thinner) >> Rana (pale thin numerals on
  dark textured ground with heavy ribbon ornament — hardest by far).

## Fix directions (presentation, owner decision — see decision artifact)

A. Ease the camera upward as dice settle so the result face dominates the
   final frame (the tumble can keep the current drama).
B. Per-die result chip: a small floating value label over each settled die —
   removes all ambiguity regardless of art or angle.
C. Dim non-result faces slightly at settle (the engine already tracks glow).
D. Art hardening per set in the Workshop: 6/9 underlines for Asari/Leaflit,
   contrast pass for Rana numerals.

Recommendation: A + B together in the workstream-3 overlay rework; C cheap
add-on; D longer-term art pass.

## QA hook added

`shared-dice-roller-core.js` now exposes `__testInternals` (createDie,
finalQuaternionForDie, topFaceLabelForDie, getTheme) for the diagnostic
scripts. The Workshop's copy of the core was already 18 lines out of sync
before this session (floor-plane removal never ported back); reconciling the
two copies — including this hook — is a standing housekeeping item for the
Workshop repo.
