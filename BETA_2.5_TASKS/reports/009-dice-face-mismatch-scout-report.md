# Task 009 report — Scout: dice engine face-mismatch bug (READ-ONLY diagnosis)

Executor: Claude Opus 5 sub-agent, 2026-08-26. Read-only task; this report file
is the only write. No worktree file was modified, no commit made by me beyond
(optionally) this report. `../Dice Builder Workshop` and the frozen
`...Public Beta 2.20` sibling were never opened.

---

## 1. Reproduced? — YES

**A genuine, deterministic, engine-level value-vs-face desync exists and I
reproduced it 36 times out of 400 forced rolls, in all four sets, with a
matching visual capture.**

**The bug:** every percentile (`d100`) roll whose value is **1 through 9**
displays a tens die reading **"10"** instead of **"00"**. The pair of dice on
the table therefore reads **11–19** while the logged / registered / wired total
is **1–9**.

Concrete repro (Rana set, forced value **7**): the two settled dice show
**"10"** and **"7"** — the table reads **17** — while the roll registered as
**7**. Control at value 57 correctly shows **"50" + "7"**.

This is *not* the camera/legibility problem the 280-face audit already settled.
It is a value→face-key mapping defect that lives above the art layer, is
identical in all four sets, and predates the online conversion. It hits the
sheet's dice tray, the sheet's roll overlay preview chips, and the Owlbear dice
panel/overlay equally — matching the plan's note that it "affects sheet and
Owlbear equally."

### How to reproduce by hand (30 seconds)
1. `npm start`, open the sheet, open the dice tray, add one **d100**, roll
   repeatedly (or the Owlbear dice panel's d100 button — same defect).
2. Roughly 1 roll in 11 registers a total of 1–9. On those rolls the tens die
   shows **10** and the log/chip shows the single digit.

### Forced repro (deterministic, no waiting)
In any page that has the dice runtime loaded (e.g. `/dice-face-audit.html`),
in the console:
```js
LyrianAccurateDiceRoller.rollDice({
  layer: document.getElementById("dice-flight-layer") || document.body,
  results: [{ sides: 100, value: 7, label: "d100" }],
  setId: "rana-full-set", width: 1280, height: 800
});
LyrianAccurateDiceRoller.getStatus().settledResults;
// -> [{ die:"d00", value:0, requested:"10", ... }, { die:"d10", value:7, requested:"7", ... }]
//    "requested" is the face key the engine decided to show. It should be "00".
```

---

## 2. Work narrative (including dead ends)

### 2.1 Reading first, so as not to re-derive settled ground
Read in full: `BETA_2.5_PROJECT_STATE.md`, task brief 009,
`BETA_2.5_ONLINE_CONVERSION_PLAN.md` status-log item (b),
`DICE_FACE_AUDIT_2026-08-25.md`, `docs/dice-rendering-contract.md`,
`docs/dice-system-map.md`, `assets/dice-3d/dice-geometry.js` (229 lines) and
`assets/dice-3d/shared-dice-roller-core.js` (all 1,989 lines). Then the
consumer side: `src/js/ui.js` roll paths (`rollDice` helper L291,
`normalizeRollResults`/`inferRollResultsFromOverlay`/
`expandPercentileRollResults`/`renderRollPreviewGrid` L7412–7570,
`getSettledTopReadDisplay`/`animateRollDice`/`showRollOverlay` L8160–8370,
`rollDiceTraySelection` L8546, `rollPlayCheck`/`rollPlayDamage` L8620–8760),
`src/js/runtime-loader.js`, `owlbear/core.js` (`extractRollDice`,
`normalizeRollEvent`), `owlbear-dice/overlay.js`, `owlbear-dice/panel.js`,
`owlbear-dice/{overlay,panel}.html`, and the existing instruments
(`scripts/dice-face-audit.mjs`, `dice-orientation-diagnostic.mjs`,
`test-dice-browser-matrix.mjs`, `dice-face-audit.html`).

Key framing I held onto: the static audit proves *face key → art → orientation*.
It says nothing about *roll value → face key*, because every existing instrument
**forces face keys, not roll values**. `dice-face-audit.html`'s own d100 plan is
`[10, 20, …, 100]` — the multiples of ten only. The 1–9 band has literally never
been exercised by any instrument in this repo. That gap is where the bug lived.

### 2.2 Instruments built (outside the worktree, deliberately)
Three Playwright probes, written to the session scratchpad
(`…/scratchpad/dice-mismatch-probe.mjs`, `dice-probe2.mjs`, `dice-probe3.mjs`),
never inside the worktree, so the tree stayed clean for the two concurrent
agents. Each forks the repo's own `scripts/server.mjs` on an isolated port
(4291–4295 — deliberately away from 4176/4212/4216), loads
`dice-face-audit.html`, and drives the **real engine** through
`LyrianAccurateDiceRoller` and its `__testInternals` hook. The probes are
throwaway; the recipe above and in §6 reproduces them.

They asked two questions the static audit never asked:

- **Q1 (value → face key).** Call the real `rollDice()` with forced values and
  read `getStatus().settledResults[].requested`. This is the engine's own
  decision about which face to show, and it is filled **synchronously** inside
  `rollDice()` before it returns, so no animation wait is needed.
- **Q2 (face key → what the viewer actually sees).** Rebuild each die with
  `__testInternals.createDie`, compute the settle quaternion with
  `finalQuaternionForDie(die, presentDirection)` using `rollDice()`'s own
  `presentDirection` maths, then measure which face normal has the largest dot
  product with the camera direction — i.e. which face is genuinely pointed at
  the viewer — plus the runner-up and the margin.

### 2.3 Results

| Probe | Scope | Result |
|---|---|---|
| Q1 value→key, d4/d6/d8/d10/d12/d20 | 240 forced values (4 sets × 60) | **240/240 correct** |
| Q1 value→key, d100 | 400 forced values (4 sets × 1…100) | **36 wrong** — exactly values 1–9 in each set |
| Q2 settle geometry | 1,400 checks (4 sets × 7 dice × all values × 5 landing spots) | **1,400/1,400 correct**, viewer-dot = **1.0000**, runner-up 0.745 |
| Engine `validateAllFaceSettles` | 4 sets | **70/70 each = 280/280** |
| Engine `validateNumberingTopology` | shared geometry | **33/33** |
| Sheet's own two-stage expansion, replayed | 100 percentile values | **9 wrong** — 1…9, `shown "10\|N"`, `expected "00\|N"` |

Visual confirmation: three real animated rolls screenshotted at settle (Rana
set) — `d100 = 7` → **"10" + "7"** (bug, reads 17); `d100 = 57` → **"50" + "7"**
(control, correct); `d20 = 17` → **"17"** dead-centre, upright, aimed at the
viewer, with 14/11/19 flanking it (control, correct).

### 2.4 Dead ends — what I chased and ruled out

- **Off-by-one in a face-index array.** Dead. 240/240 value→key correct on the
  non-percentile dice, 280/280 engine self-check, 33/33 topology.
- **Per-set face-order override applied inconsistently.** Dead. There is no
  per-set orientation or ordering data anywhere; `getFaceArtKeys`
  (core L954–973) branches only on *shape* (`physicalKeyOrder` for d10/d100),
  never on set id. Every probe result is byte-identical across all four sets.
- **Float-tie instability in `buildConvexFaces`'s final sort** (core L254–258:
  `(ra.z - la.z) || (ra.y - la.y) || (ra.x - la.x)` would use a 1e-17 residue
  instead of falling through). Plausible on paper; dead in practice —
  `validateNumberingTopology` returns 33/33 and the d10/d100 `physicalKeyOrder`
  permutation it depends on holds.
- **Physics settling onto an adjacent face.** Dead by construction *and* by
  measurement. The result is chosen up front; `publishSettle` snaps
  `quaternion.copy(finalQuat)`; the animation's wobble term is
  `…× Math.pow(1 - settle, 2.2)` → exactly 0 at settle. Q2 measured 1.0000
  every time.
- **Wrong set's art bleeding through the texture cache.** Dead.
  `makeFaceTexture`'s cache key is
  `${ROLLER_VERSION}:${studioVersion}:${palette.id}:${dieKey}:${artKey}`, and
  `DiceSkinStudio.getFaceImage` keys strictly on `${id}:${die}:${face}`.
- **Stale promoted sidecar art.** Dead. Every `faceArtScript` in
  `promoted-dice-skins.registry.js` carries a per-generation `?v=` token.
- **The UI passing different numbers to the engine than it logs.** Mostly dead:
  `rollPlayCheck`, `rollPlayDamage` and `rollDiceTraySelection` all pass explicit
  `diceResults` built from the same values they log.
  `inferRollResultsFromOverlay` (ui.js L7421) — which *re-parses digits out of
  the overlay text* — only fires when a caller supplies no `diceResults`; I
  found no such caller among the eight `showRollOverlay` sites. Latent, not
  live.
- **The owner's d20 sighting specifically.** Measurably clean today. See §5.

---

## 3. Root cause and ranked candidates

### CANDIDATE 1 — percentile 1–9 shows tens "10" instead of "00". **CONFIRMED. Confidence: certain (reproduced 36/400 + visual capture).**

Three independent clamps stack, and each one on its own is enough to destroy the
"00" case. The tens die is asked to represent zero, and *zero is unrepresentable
everywhere along the path*:

1. **`assets/dice-3d/shared-dice-roller-core.js:1305`** (in
   `expandPercentileResults`):
   ```js
   const percentileValue = value === 100 ? 100 : Math.floor(value / 10) * 10;
   ```
   For a rolled 7 this is `0`. The tens entry becomes `{sides:100, value:0}`.

2. **`assets/dice-3d/shared-dice-roller-core.js:1054`** (in `makeResultLabel`):
   ```js
   const v = clamp(Math.round(Number(value) || 10), 10, 100);
   ```
   `Number(0) || 10` → **10** (falsy-zero coercion), and even without that the
   `clamp(…, 10, 100)` floor would forbid 0. Result label: **`"10"`**.

3. **`src/js/ui.js:7416`** (in `normalizeRollResults`, on the sheet path only):
   ```js
   value: Math.max(1, toNumber(entry.value, 1)),
   ```
   turns the 0 into 1 before the engine is even called — and then step 2's
   `clamp(1, 10, 100)` → 10 again. Same wrong answer by a different road.

The sheet duplicates the expansion in **`src/js/ui.js:7443`**
(`expandPercentileRollResults`) with the identical `Math.floor(value / 10) * 10`
defect, so both the sheet and the extension arrive at "10" independently.
Note the third clamp is also *masking* the fault: without
`Math.max(1, …)` the tens die would be dropped by the `.filter(entry.value)`
on the next line and simply vanish.

Reachability is real, not theoretical: `DICE_TRAY_TYPES`
(`src/js/constants.js:332–340`) includes `{sides:100,label:"d100"}`, and
`owlbear-dice/panel.js:183` rolls `Math.floor(Math.random()*100)+1` for the same
die. **9% of every percentile roll on every surface.** The same wrong tens face
also appears in the roll overlay's *pre-settle* preview chips, because
`getRollPreviewImage` → `buildPreviewDataUrl({sides:100, value:0|1})` runs the
same `makeResultLabel`.

Why no instrument caught it: `validateAllFaceSettles`, `dice-face-audit.mjs`,
the top-down audit and `dice-face-audit.html` all iterate **face keys**
(`"00","10",…,"90"`) or the ten multiples of ten. None of them ever asks the
engine to render a *rolled value* in the 1–9 band.

### CANDIDATE 2 — the engine's own settle self-report has been wrong since `77779b4`. **CONFIRMED as a defect; currently latent for users. Confidence: high.**

`lastSettledResults` (core L1684–1698) still measures the settled face with
`topFaceLabelForDie(entry.die, entry.finalQuat)` — "which face points at world
**up**". Since `77779b4` ("the face you see IS the result") aims the result face
at the **camera** instead, world-up is no longer the result face for any die in
`FACE_TOWARD_VIEWER_SIDES` (8/10/12/20/100). Measured across all four sets:

| die | dice reported | `matched:false` |
|---|---|---|
| d4 | 16 | 0 |
| d6 | 24 | 0 |
| d8 | 32 | 1 |
| d10 | 40 | 36 |
| d12 | 48 | 48 |
| d20 | 80 | 80 |
| d100 | 80 | 55 |
| **total** | **320** | **220 (69%)** |

Example: a Rana d20 forced to 17 settles perfectly (viewer-dot 1.0) but reports
`topFace:"8"`, `matched:false`.

Two consequences in shipped code:
- **`src/js/ui.js:8215`** logs `console.warn("Accurate dice reported a top-face
  mismatch.")` on essentially every roll containing a d10/d12/d20/d100. Anyone
  debugging from the console is being handed a false lead — and this may well be
  part of why this bug was believed to be an orientation problem.
- **`src/js/ui.js:8160` `getSettledTopReadDisplay` → `:8348`** writes
  `entry.topFace` into `#roll-overlay-face`. It is gated on
  `!previewResults.length`, i.e. it only fires when `capturePreviews` produced
  nothing — which happens when `buildDiePreviewDataUrl`'s extra `WebGLRenderer`
  fails to get a context (context-count pressure, weak mobile GPU, software
  rendering). On such a device the overlay would print a **wrong number that
  sticks** (it lands ~2.9s in, after the 700ms interval that keeps rewriting
  `rollText` has already stopped). Latent today, hardware-dependent, exactly the
  "sometimes" flavour — and one of the carried test gaps is "phones/tablets".

### CANDIDATE 3 — `owlbear-dice/panel.html` still pins a pre-fix engine. **CONFIRMED as a fact; user impact bounded. Confidence: high on the fact, medium on the impact.**

`owlbear-dice/overlay.html:63` was bumped to `var V = "?v=20260825-numeral-dots-v3"`,
but **`owlbear-dice/panel.html:74` is still `var V = "?v=20260811-srgb-dice-v1"`**.
Both load the same `../assets/dice-3d/shared-dice-roller-core.js`, but as
different cache URLs — so any browser that opened the dice panel before
2026-08-25 keeps serving the panel a **pre-`77779b4`, pre-6/9-dot** core, i.e.
the old top-face pose with the low camera: precisely the misread the audit
documented. Impact is bounded because `owlbear-dice/panel.js:189` only animates
locally when `!obrApi` (standalone/dev), while a real room animates through the
overlay — but it is a genuine "the engine you are looking at is not the engine
you think" hazard, and the hub already warns that this class of thing "burned a
whole debugging session once."

For completeness: the sheet is **not** affected — `src/js/runtime-loader.js:102`
carries `?v=20260825-numeral-dots-v3`, and `git diff 282c94c dd1adf4 --
shared-dice-roller-core.js` is a one-line delta (the `ROLLER_VERSION` string),
so the token still covers the current core.

### CANDIDATE 4 — the settle-pose preview is rendered from the wrong camera. **CONFIRMED as an inaccuracy; cosmetic. Confidence: high.**

`buildDiePreviewDataUrl` places the die at `(0,-0.2,0)` with a camera at
`(0,4.8,8.5)`, but replays the `finalQuat` that was computed for the **live**
scene's camera and that die's **live** landing spot. Measured divergence: ~8.8°
for a centred die, ~18.6° for one that landed at `endX ≈ ±3.6`. Well inside a
d20's 41.8° face spacing, so the correct face is still front-and-centre — but
the overlay chips are visibly yawed relative to the table, which nibbles at the
"the face you see IS the result" contract. Cosmetic only; listed so it is not
rediscovered as a bug.

### Explicitly NOT the cause (measured, not assumed)
The settle/selection geometry. 1,400/1,400 checks, dot exactly 1.0000, across
every set, every die type, every value and five landing spots. The result face
is aimed at the viewer with a 0.745 margin over the runner-up. **The brief's
"floating-point / nearest-face selection at physics settle" hypothesis is
dead.**

---

## 4. Proposed minimal fix for a FUTURE task (described only — nothing applied)

### Fix 1 — percentile 1–9 (the actual bug)
The cleanest minimal change exploits the fact that **"00" is already reachable**:
`makeResultLabel(100, 100)` → `clamp(100,10,100)` → `>= 100` → `"00"`. So route
the 1–9 band to the value the engine already understands, and none of the three
clamps has to be touched:

- `assets/dice-3d/shared-dice-roller-core.js:1305` —
  `value === 100 ? 100 : Math.floor(value / 10) * 10`
  becomes `(value === 100 || value < 10) ? 100 : Math.floor(value / 10) * 10`.
- `src/js/ui.js:7443` — the identical change to `tensValue`.

Two expressions, two files. A rolled 7 then shows **"00" + "7"**; 100 keeps
showing **"00" + "0"**; every other value is untouched. Requires `npm run build`
(a `src/js/*` edit) and a `dice:core:check` sync to the Workshop core.

*Larger alternative, if the owner would rather fix the class than the case:*
carry an explicit `faceKey` on the expanded entries instead of re-deriving a
label from a numeric value, so no downstream `clamp`/`||` can eat a legitimate
zero. Bigger blast radius; not recommended for a first pass.

**Guard it or it comes back.** Every existing instrument iterates face keys, so
none of them can catch this class. Add a value-domain sweep: for `rolled` in
1…100, assert `settledResults[0].requested + settledResults[1].requested`
equals the expected `tens|ones` pair. That is ~15 lines in the existing dice
harness and is exactly what probe 3 did (it found 9/100 red, and would go
green after the fix). Same idea is worth extending to a 1…N sweep per die type
as a cheap permanent regression net.

### Fix 2 — the settle self-report (Candidate 2)
Make the runtime check measure the pose the die is actually in: pass the same
`presentDirection` used for that die into the settled-face measurement (or drop
`topFace`/`matched` from `rollDice`'s report entirely and keep the top-face
measurement only inside `validateAllFaceSettles`, which deliberately uses the
measuring pose). Then point `getSettledTopReadDisplay` (`src/js/ui.js:8160`) at
`entry.requested` rather than `entry.topFace`. This silences a per-roll false
`console.warn` and closes the latent wrong-number-on-weak-GPU path.

### Fix 3 — the stale panel token (Candidate 3)
Bump `owlbear-dice/panel.html:74`'s `V` to match `overlay.html:63`.
**Sequencing note:** task 008 (WS4 overlay sounds) currently has
`owlbear-dice/panel.html` modified in the working tree, and task 010's memo owns
the cache-buster question — this should be folded into one of those rather than
raced.

---

## 5. Affected vs. checked-and-clean

**Affected**
- **d100 tens die, rolled values 1–9 — ALL FOUR SETS** (`new-angelsword`,
  `asari-full-set-draft`, `leaflit-full-set`, `rana-full-set`). 9 bad values per
  set, 36/400 probes. Set-independent: the defect is in value→label arithmetic,
  above the art layer.
- **Reporting layer** (`topFace`/`matched`): d8 (1/32), d10 (36/40), d12 (48/48),
  d20 (80/80), d100 (55/80) — all four sets.

**Checked and clean**
- Value→face-key for **d4, d6, d8, d10, d12, d20**: 240/240 across all four sets.
- Value→face-key for **d100 at values 10–100**: correct, including 100 → "00"+"0"
  and multiples of ten.
- **Settle geometry, every set/die/value/landing spot**: 1,400/1,400, viewer-dot
  1.0000.
- **Rana d20** specifically — the owner's headline sighting. A forced 17 settles
  with "17" centred, upright and aimed at the viewer (screenshot). Chronology
  matters here: the symptom was logged in `755a0fa` at **2026-08-25 14:35**, and
  `77779b4` ("the face you see IS the result") landed at **14:51** — **16
  minutes later**. The owner's d20 sighting therefore predates the viewer-facing
  settle fix, and is best explained by the already-documented old-pose
  adjacent-face read ("forced 17 puts big 19 and 15 in front"). The d10 half of
  the sighting, by contrast, is fully explained by Candidate 1 and is **still
  live today** — a percentile roll renders as two d10-shaped dice, which is
  exactly what "the Rana set's d10s" looks like on the table.
- Engine self-checks: 280/280 face settles, 33/33 numbering topology.
- Texture cache keying, skin-studio art lookup, promoted sidecar cache-busting,
  sheet roll paths' value provenance: all clean (see §2.4).

---

## 6. Reproducing my instruments

No script was left in the worktree (the probes lived in the session scratchpad,
outside the tree, so the two concurrent agents were never disturbed). To rebuild:
fork `scripts/server.mjs` with `LYRIAN_PORT=<free port>` and `LYRIAN_NO_OPEN=1`,
launch Chromium via the repo's own Playwright with
`--use-gl=swiftshader --enable-unsafe-swiftshader`, load
`/dice-face-audit.html?set=<set>&die=d6`, wait for
`document.documentElement.dataset.ready === "true"`, then:
- **value→key:** `rollDice({layer, results, setId, reducedMotion:true})` followed
  immediately by `getStatus().settledResults` (filled synchronously — no wait).
- **settle geometry:** `__testInternals.{createDie, finalQuaternionForDie,
  getTheme}`, rebuilding `rollDice`'s own `presentDirection` as
  `new THREE.Vector3(0,6.9,8.5).sub(new THREE.Vector3(endX, -1.55+diceSize, endZ)).normalize()`,
  then compare each face normal's dot product against it.

---

## 7. Questions parked for the owner

1. **Percentile convention.** Confirm the intended display: a rolled **7**
   should show tens **"00"** + ones **"7"** (reading "07"), and **100** continues
   to show **"00" + "0"**. This is the standard percentile reading, but the fix
   bakes it in, so it is worth one word of confirmation.
2. **Is the d20 half still happening?** The owner's d20 sighting predates
   `77779b4` by 16 minutes, and the d20 path measures clean today (1,400/1,400,
   plus a clean forced-17 capture). If the owner has seen a d20 mismatch *since*
   the viewer-facing change, that is a separate hunt and I have not found it; if
   not, the d20 half of the report can be closed as fixed by `77779b4`.
3. **Who owns the `panel.html` cache-buster bump?** It overlaps task 008
   (currently editing that file) and task 010's cache-buster memo.
4. **Should the runtime settle self-check survive at all?** Now that the pose is
   viewer-facing, `matched`/`topFace` are meaningless as shipped. Repair them to
   measure the real pose, or delete them from the runtime path and keep the
   top-face measurement only in `validateAllFaceSettles`?
