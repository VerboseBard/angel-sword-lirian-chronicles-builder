# Task 011 report — Wire the Workshop composer to the real per-shape placement offsets

**Executor:** Claude Opus 5 sub-agent · **Date:** 2026-08-28
**Verdict:** GREEN. Both Workshop commits landed; every required check green.
One DECIDED sub-clause could not be satisfied against the real data (the d4
half of "replace the 30% lerp") — reported in §4, not improvised around.

---

## 1. Outcome vs the verification checklist

| # | Checklist item | Result |
|---|---|---|
| 1 | `scripts/test-dice-skin-workflow.cjs` green, extended to assert measured position not just digits | **GREEN** — extended by +220 lines; suite passes. It now asserts painted position for all six measured shapes at two canvas sizes, the ink-centre correction and its three fallback paths, kite-anchor semantics, and d4's pinned corner positions. Five negative controls confirm it fails when it should (§2.6). |
| 2 | Programmatic check: render one sample face per die type and confirm measured position matches the intended offset within tolerance | **GREEN, exceeded** — rendered **all 66** numeric faces (not one per shape) through the real composer in a real browser canvas and measured them with the audit's own `measure()` routine. Mean deviation **0.28%** of canvas, worst **1.56%**, **0/66** over the audit's own 1.6% flag threshold. d4 measured separately (§2.5). |
| 3 | Confirm the Beta 2.5 builder repo's code and suites are untouched | **GREEN** — `git status` in this repo was clean before and after all work; the only write here is this report file. The audit script `scripts/dice-numeral-placement-audit.mjs` was read only (confirmed clean, unmodified). `npm run dice:core:check` re-run and green ("in sync" for both `dice-geometry.js` and `dice-roller-core.js`) — which also proves the Workshop commits did not break cross-repo sync. |
| 4 | No dev server left running in either repo | **GREEN** — none was ever started. `netstat` shows nothing listening on 4176/4177/4219. The pixel check drove a headless chromium against `about:blank` with injected scripts, no server; the browser is closed by the script. |

Also done, not on the list: bumped the composer's cache-buster in
`skin-pack-builder.html` (`?v=exact-reference-1` → `?v=placement-offsets-1`)
per the hub's standing cache-buster rule, since the composer's bytes changed.

---

## 2. Work narrative

### 2.1 What the audit script's "design offset" actually means

This was the part the brief warned about, so it was settled by reading
`scripts/dice-numeral-placement-audit.mjs` line by line rather than inferring
from prose. The precise definition, as implemented there:

> **design offset** = (centre of the numeral's **ink bounding box**) − (the
> face's **corner-vector anchor**), expressed as a **percentage of the face
> canvas edge** (SIZE = 384, *not* a percentage of the polygon), y-down, so a
> **negative y sits above the anchor**. Per shape it is the **median** over
> every readable numeric face of all four promoted sets.

Four details that each would have silently broken the port if guessed:

1. **The anchor is not the centroid.** `anchorFor()` (audit L192-202) returns
   the vertex average for square/triangle/pentagon — but for the **kite**
   faces (d10/d100) it returns the crossing of the two diagonals,
   `{x: (pole.x+tail.x)/2, y: (rightWing.y+leftWing.y)/2}`, which sits at
   **wing height**, not the vertex average.
2. **The ink bbox is trimmed, not raw.** `measure()` takes the 5th/95th
   percentile of the high-contrast outlier pixels' x and y (audit L116-131),
   sampled on a 2px grid inside the polygon scaled to 58% and masked to a
   ±0.24·SIZE central column. The 2px grid is why almost every residual in
   my verification is an exact multiple of 0.26% (= 1px at 384).
3. **Percentage of canvas, not polygon** (audit L211-213) — which is what
   makes the offsets resolution independent and safe to apply at both the
   512px fit preview and the 768px bake.
4. **d4 is not measured at all.** `DIE_KEYS` (audit L49) is
   `{d6, d8, d10, d100, d12, d20}`. d4 never enters the measurement, the
   offset derivation, or the flag counts. See §4.

### 2.2 Dead end / resolved discrepancy: the hub's d10 and d100 numbers are stale

`BETA_2.5_PROJECT_STATE.md` records the offsets as
"d6 +0.5, d8 -2.9, **d10 -2.8, d100 -2.5**, d12 +0.5, d20 -5.0". The JSON on
disk says **d10 −17.33, d100 −17.07**. A 14.5-point disagreement on two of the
six numbers I was told to wire in is not something to shrug at, so I stopped
and chased it rather than trusting the brief's "prose is not the source of
truth" line as a free pass.

- The JSON's mtime is **17:27:21**; the audit commit that introduced the kite
  anchor (`d5caea5`, "Anchors formalized as the owner's corner-vector
  construction") is **17:29:14** — two minutes *later*. My first hypothesis
  was therefore that the JSON predates the anchor change and its kite numbers
  are the *old* vertex-average ones. **That hypothesis was wrong**, and I only
  caught it by checking the arithmetic instead of the timestamps.
- Computed from the real geometry: the kite's diagonal crossing sits
  **14.52% of the canvas below** its vertex average (identical in both repos).
  So `−2.8 + (−14.52) = −17.32` versus the file's **−17.33**, and
  `−2.5 + (−14.52) = −17.02` versus **−17.07**.
- Conclusion: **the JSON is current and correct** — it was written by a
  working-tree run of the already-updated script, and the commit message two
  minutes later quotes those very numbers ("17.3 vs 17.1 — tight"). The hub's
  prose is the stale artefact, still quoting the pre-`d5caea5` values.
- Consequence for the port: the offsets are only meaningful **paired with the
  anchor that produced them**, so the composer had to implement `anchorFor`
  exactly — kite crossing included. Using the centroid for d10/d100 with these
  numbers would have thrown the numerals 14.5% of the canvas off the face.

Cross-checked that the two repos' geometry agree before relying on any of
this: `facePolygon` output is byte-identical for all seven shapes, as are
`DIE_FACE_KEYS` and `D4_FACE_CORNERS`.

### 2.3 The em-box vs ink-centre gap (the largest real finding)

The audit measures **painted ink**. Canvas `textBaseline = "middle"` positions
the **em box**. Those are different points, and the difference turned out to
be the same order of magnitude as the offsets themselves — so applying the
measured numbers to the em box would have quietly reintroduced a placement
error while looking like a fix.

Measured in the real font (`900 76.8px Georgia`), the ink centre's offset from
the em-box middle, as % of canvas:

```
digit:  0     1     2     3     4     5     6      7     8      9
shift: 0.21  0.08  0.08  1.90  1.90  2.03  -1.36  2.03  -1.36  1.90
```

Georgia ships **old-style (text) figures**: 3/4/5/7/9 descend below the
baseline, 6/8 rise above it. The spread from "6" to "7" is **3.4% of the
canvas** — larger than the entire d8 offset (−2.89) and two thirds of d20's.

So `drawText` now lands the **ink centre** on the target, via `measureText`'s
`actualBoundingBox*` metrics (measured after the font is set and inside the
rotated frame, so it would stay correct for a rotated glyph), with a zero-shift
fallback for any context that cannot report metrics.

Measured effect over all 66 faces, same render, same measuring routine:

| Placement | mean \|dev\| | max \|dev\| | spread | faces over the audit's 1.6% flag |
|---|---|---|---|---|
| **Ink-centred (this change)** | **0.28%** | 1.56% | 2.08% | **0 / 66** |
| Em-box (no correction) | 0.93% | 1.82% | 3.39% | 4 / 66 |

The residual tracks the **glyph**, not the shape (mean dy by digit: "7"
−0.83%, "9" −0.52%, "5" −0.41%, versus "6" +0.26%, "8" +0.04%), which is the
percentile-trimming estimator reacting to ink distribution — the same
estimator, with the same behaviour, that produced the design offsets from the
real art. Per-shape mean |dy| ranges 0.13% (d8) to 0.57% (d100).

This raises an aesthetic question that is genuinely the owner's — see §5 Q1.

### 2.4 Where the table lives — and why not in `dice-geometry.js`

The brief floated putting the offset table in the shared geometry file. I put
it in the composer instead, and this is not a taste call: `dice-geometry.js`
is **mirrored into this repo** at `assets/dice-3d/dice-geometry.js` and
guarded by `npm run dice:core:check`. Adding a Workshop-only table there would
have turned that gate **red**. Numeral placement is also a bake-time authoring
concern the roller never consults — the roller only maps already-baked
textures. Gate re-run after the change: still green.

### 2.5 d4

Rendered and measured separately, because the audit's `measure()` physically
cannot read it: the left/right corner labels sit ~126px from the face's
centre-x, outside the routine's ±92px central column mask. Measuring each
corner's ink centroid directly shows drifts of −1.69%..+0.90% x and
−0.94%..+0.45% y from its em-box position — i.e. the em-vs-ink gap, rotated
per corner. Behaviour is unchanged from the pre-existing WIP; the positions
are now pinned by the test suite so any future change is deliberate.

### 2.6 Negative controls (proving the new test is not blind)

Each mutation was applied to the composer, the suite run, and the file
restored. All five turned it red; the restored file is green:

1. kite anchor reverted to the vertex average → red
2. offset y sign flipped → red
3. offset scaled by polygon height instead of canvas edge → red
4. ink-centre correction removed → red
5. full pre-fix behaviour restored (centroid + −2% d8/d20 fudge) → red

### 2.7 Incidental finding in the pre-existing WIP (not fixed)

The old line `const center = geometry?.polygonCentroid?.(points) ||
polygonBounds(points);` had a latent bug: `polygonBounds` returns
`{minX, maxX, minY, maxY, width, height, centerX, centerY}` — no `.x` / `.y`
— so the fallback path would have drawn at `NaN, NaN`. Additionally
`polygonBounds`' bbox centre differs from the vertex average by ~13.6% of the
canvas on a triangle, so even a corrected fallback would have been a different
anchor. Dead as of this change (the anchor is now computed locally from the
polygon, with no geometry dependency), but worth recording as a class of bug:
a silent fallback to a *different geometric definition*.

### 2.8 Order of work

Baseline `node scripts/test-dice-skin-workflow.cjs` was run **before** touching
anything (green as found), the ~19-day-old WIP was checked for concurrent
edits (all mtimes 2026-08-08/09; nothing recent; no other agent active) and
scanned for secrets (none), then landed as-is in its own commit, and only then
was the fix layered on top.

---

## 3. Files touched and commits

**Dice Builder Workshop repo** (`E:\Chat gpt Codex\Angels sword\Dice Builder Workshop`, branch `master`, local only):

| Commit | Contents |
|---|---|
| **`e3e9ce4`** — *Land existing composer/promotion WIP (uncommitted since ~2026-08-09)* | The 14 pre-existing paths, verbatim, no cleanup: `dice roller/dice-skin-composer.js`, `dice-reference-face-extractor.js`, `dice-skin-pack-io.js`, `Promote Dice Skin to Character Sheet.{bat,ps1}`, `scripts/test-dice-skin-workflow.cjs`, `tests/exact-reference-fixture.svg`, plus the modified `README.md`, `dice roller templates/README.md`, `dice roller templates/skin-pack-builder.html`, `dice roller/dice-geometry.js`, `dice roller/index.html`, `dice roller/local-server.cjs`, `dice roller/skin-studio.js`. |
| **`4cdb855`** — *011: wire composer numeral placement to real per-shape design offsets* | `dice roller/dice-skin-composer.js` (+170/−12), `scripts/test-dice-skin-workflow.cjs` (+220), `dice roller templates/skin-pack-builder.html` (cache-buster line only). |

**Beta 2.5 builder repo** (this repo, branch `agent/beta-2-5-online`, local only):
this report file only. `BETA_2.5_PROJECT_STATE.md` deliberately untouched.

Neither repo pushed. No `git add -A` used — explicit paths only, verified
against `git status` before each commit.

### The six values wired in

```
d6   x +0.26  y  +0.52        d12  x +0.26  y  +0.49
d8   x  0.00  y  -2.89        d20  x  0.00  y  -4.97
d10  x  0.00  y -17.33        d100 x +0.26  y -17.07     (% of canvas edge)
```

Stored as one `DESIGN_PLACEMENT_OFFSETS` constant with a source-and-date
comment and an explicit "not owner-blessed yet" note; re-blessing is an edit
to those six pairs and nothing else.

---

## 4. Deviations from the sketch, and the one DECIDED clause that could not be met

1. **The d4 half of "replacing ALL of its current ad-hoc logic (the 30%
   lerp, …)" is impossible as written — flagged, not improvised.** The
   DECIDED table names the six shapes d6/d8/d10/d100/d12/d20, and the DECIDED
   data-source row forbids inventing, guessing or re-deriving numbers. The
   audit measures no d4 offset (§2.1 point 4), so there is nothing measured to
   replace the 30% lerp *with*. I left d4's behaviour byte-identical, promoted
   the bare `0.3` to a named, documented `D4_CORNER_INSET` constant so a future
   blessed value is a one-line edit, and pinned d4's positions in the suite.
   The sketch anticipated this ("confirm exactly what the audit script's
   'design offset' means for d4 before assuming…") — the answer is that it
   means nothing for d4. **This is the stop-and-report item; owner input in
   §5 Q2.**
2. **Added the ink-centre correction, which the sketch does not mention.** Not
   scope creep — without it the measured numbers land on the wrong reference
   point (§2.3), which is precisely the silent-semantics failure the brief
   warned about. Measured, not asserted: it takes flagged faces from 4 to 0.
3. **Table in the composer, not `dice-geometry.js`** — forced by the
   `dice:core:check` mirror gate (§2.4).
4. **Anchor derived from the passed `points`, not recomputed from
   `facePolygon`.** The audit recomputes; the composer is handed a polygon by
   its caller. `faceGuideForDie` passes `facePolygon` output unmodified, so the
   two agree today, and deriving from the actual polygon keeps a custom guide
   self-consistent.
5. **Verified 66 faces rather than the 7 the checklist asked for**, and added
   the em-box counterfactual, because a per-shape spot check would not have
   exposed the per-glyph behaviour that turned out to dominate the residual.
6. **Cache-buster bumped** (hub standing rule) — one line, listed above.
7. The pixel verification is a **scratchpad one-off**, not committed: it needs
   this repo's Playwright, and the Workshop has no `package.json` or
   `node_modules`. Making it a permanent Workshop test would mean giving the
   Workshop a dependency it has never had — an owner-scope decision, §5 Q3.

---

## 5. Questions parked for the owner

1. **Uniform ink centres, or uniform baselines?** (the substantive one) The
   audit's standard — and therefore this change — makes every face's *ink
   centre* land on the same point. Because Georgia uses old-style figures,
   that means a "7" and a "6" on the same die sit on **visibly different
   baselines** (up to 3.4% of the face apart). The alternative, aligning
   baselines, is what audit **v2**'s own commit message argued for ("baseline
   metric — the eye aligns numeral bottoms") before v3 moved to geometric
   anchors. Both are defensible; they are not the same look. This is squarely
   an eye call, and it decides whether the composer keeps the correction as
   built. *(Cheap mitigation if baselines win: choose a lining-figures font
   for the number layer, which collapses the difference to near zero.)*
2. **d4 placement rule.** No measured offset exists (§4.1). Options: leave the
   30% inset as-is; extend the audit to read d4 by sampling each corner
   neighbourhood instead of the central column (small change to a read-only
   reference script — would need its own task); or bless a d4 number by eye.
3. **Should the pixel check become a permanent gate?** It is currently a
   one-off. Making it part of the Workshop suite means the Workshop takes on
   Playwright; alternatively it could live in this repo alongside the other
   dice audits, pointed at the Workshop's files.
4. **Hub prose fix.** `BETA_2.5_PROJECT_STATE.md`'s "Where the project
   stands" still quotes the pre-`d5caea5` kite offsets (d10 −2.8, d100 −2.5).
   The numbers themselves are not wrong-under-their-old-anchor, but anyone
   reading the hub and applying them against the current anchor would be
   14.5% of a canvas out. Coordinator's file to change, not mine — flagged so
   parked question 1 (blessing the offsets) is decided against the right
   values: the ones to bless are **−17.33 / −17.07**, unless the owner would
   rather bless-and-store them against the vertex average.
5. **Owner live-check still outstanding** (the brief's own ≤5-minute item):
   open the Workshop, pick "Flat artwork" for one die of each shape, and
   eyeball the auto-placed numeral — especially d4 (3 corners) and d20. Note
   the composer's bytes changed, so a hard refresh is worth doing even though
   the cache-buster was bumped.
