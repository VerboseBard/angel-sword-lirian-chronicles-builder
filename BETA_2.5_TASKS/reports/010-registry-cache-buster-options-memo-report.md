# Report — Task 010: Registry cache-buster fix options (memo, read-only)

Executor: Claude Sonnet 5 sub-agent, 2026-08-26. Read-only task: no file was
edited except this report. Worktree commit at read time: `ab70ce5` (clean
except the three untracked concurrent task briefs 008/009/010 — expected,
per the brief's own concurrency note).

---

## 0. Headline

Both bugs are real and independently confirmed by reading the live source,
not by trusting prior reports. They are **related but structurally
separate**, and — this is the memo's central, slightly uncomfortable
finding — **no candidate option fixes both for free.** Exactly one option
(1, broadly scoped) can fix both at once, and only by paying the exact
"every promotion nukes the ~42-45MB engine cache" cost that the other
options exist to avoid. The owner has to pick a point on that tradeoff line,
not a shape that dodges it.

A second finding not asked for in the brief but discovered while tracing
the write path: **the bug exists twice, in two independent scripts.**
`prune-dice-catalog.mjs` (the `dice:publish-clean` npm script) duplicates
`promote-dice-skin.mjs`'s cache-buster logic byte-for-byte rather than
importing it, and has the identical index.html-only gap. Any fix shape has
to land in both places (or unify them), or half the promotion path stays
broken.

---

## 1. Verified-exact current behavior

**Bug (a) — new sets silently missing from panel/overlay after a promotion.**
The hub's summary ("only index.html does") is **confirmed correct** by
reading the code, not just repeated:

- `scripts/promote-dice-skin.mjs:245-250` — the only place `promotePack()`
  touches a consumer page:
  ```
  const indexHtml = await fs.readFile(INDEX_HTML, "utf8");
  ...
  await writeAtomic(INDEX_HTML, updateRegistryCacheBuster(indexHtml, generatedAt));
  ```
  `INDEX_HTML` is defined at line 10 as `path.join(PROJECT_ROOT, "index.html")`.
  I read the full 272-line file: the strings `"panel.html"`, `"overlay.html"`,
  and `"owlbear-dice"` do not appear anywhere in it. Nothing in this script
  ever opens either extension page.
- `updateRegistryCacheBuster()` (lines 161-167) is a single regex
  find-and-replace: `/assets\/dice\/promoted-dice-skins\.registry\.js(?:\?v=[^"']*)?/`
  → `assets/dice/promoted-dice-skins.registry.js?v=${cacheKey}`, where
  `cacheKey` (lines 157-159) is `generatedAt` stripped to digits, e.g.
  `20260810042336`.
- **The identical gap exists a second time**, independently, in
  `scripts/prune-dice-catalog.mjs` (the `dice:publish-clean` npm script,
  `package.json:21`). It imports `buildRegistryScript` from
  `promote-dice-skin.mjs` (line 4) but **not** `updateRegistryCacheBuster` —
  instead it re-implements it verbatim as a local `cacheKey()` (lines 24-26)
  and local `updateRegistryCacheBuster()` (lines 28-33), and at line 80 writes
  it to the same `INDEX_HTML` constant (line 11) only. Same bug, second
  independent code path, never touches panel.html/overlay.html either.

**Consumer-page reality, read directly (not from the 002/004 reports):**

| Page | Registry reference | Cache-buster source |
|---|---|---|
| `index.html:457` | `<script defer src="assets/dice/promoted-dice-skins.registry.js?v=20260811-srgb-dice-v1">` | Inline literal in the file the promote/prune scripts write. **Gets bumped on every promotion.** |
| `owlbear-dice/panel.html:74-75` | `var V = "?v=20260811-srgb-dice-v1"; ... load("../assets/dice/promoted-dice-skins.registry.js" + V)` | Hand-edited `V`, shared with 8 engine files (lines 85-93). **Never touched by either script.** |
| `owlbear-dice/overlay.html:50-51` | `var V = "?v=20260825-numeral-dots-v3"; ... load("../assets/dice/promoted-dice-skins.registry.js" + V)` | Hand-edited `V`, shared with 8 engine files (lines 61-69). **Never touched by either script.** |

Corroborating evidence that no promotion has run since the last manual edit:
`assets/dice/promoted-dice-skins.json`'s newest `generatedAt` is
`2026-08-10T04:23:36.848Z` (the `rana-full-set` entry — matches the
registry's top-level `generatedAt`). A real promotion's cache key is
always pure digits (`registryCacheKey`/`cacheKey` strip everything else).
`index.html`'s current token, `20260811-srgb-dice-v1`, is **not** pure
digits — it is a hand-written string one day younger than the last real
promotion, i.e. it was overwritten by a human (evidently during the
"srgb dice" color pass) the day after the last `dice:promote` run, not by
the script itself. The mechanism is real and would fire correctly next
time it runs; it just hasn't run since.

**Bug (b) — M9, the double download.** Confirmed independently, and it is
bigger than "the registry token differs": panel.html and overlay.html each
gate **9 requests** (the registry plus 8 engine files) behind one shared
`var V`, and the two pages' `V` values differ (`20260811-srgb-dice-v1` vs
`20260825-numeral-dots-v3`), so a user who opens both downloads the same
~9-file, ~45MB set twice, under two cache keys.

**A live example that this already happens, not just hypothetically:**
`src/js/runtime-loader.js:92-103` (index.html's own engine loader, bundled
into `app.bundle.js`) lists the same 8 engine files. **One of its own 8
lines has already drifted**: `shared-dice-roller-core.js` is requested at
`?v=20260825-numeral-dots-v3` (line 102) while its 7 siblings are still at
`?v=20260811-srgb-dice-v1` (lines 95-96, 98-101, 103). Cross-referencing
all three surfaces for this one file:

| Surface | `shared-dice-roller-core.js` token |
|---|---|
| `src/js/runtime-loader.js:102` (→ index.html) | `20260825-numeral-dots-v3` (new) |
| `owlbear-dice/overlay.html` (shared `V`) | `20260825-numeral-dots-v3` (new) |
| `owlbear-dice/panel.html` (shared `V`) | `20260811-srgb-dice-v1` (**stale**) |

So panel.html is right now serving a stale `shared-dice-roller-core.js`
relative to both index.html and overlay.html. This is the same failure
mode as M9, one file more granular, and it proves "someone bumps some
copies and not others" is an active pattern here, not a one-off.

**A fifth copy of the same literal, in passing:** `src/js/constants.js:376`
carries `previewRevision: "20260811-srgb-dice-v1"` for the built-in dice
set's picker thumbnail. Different purpose (UI preview cache-busting, not
script loading), out of this memo's scope, but one more independent
hand-maintained copy of the identical string — extra evidence for how
fragile manual synchronization already is in this codebase, not a bug I'm
asking the owner to fix here.

**Design-intent contradiction worth naming:** `BETA_2.5_ONLINE_CONVERSION_PLAN.md:60-62`
states the intended architecture plainly: "The dice extension reads the
registry at load, so promoted sets appear in its picker with zero
extension code changes." Bug (a) is exactly this promise failing to hold
for 2 of the 3 surfaces that read the registry.

**Existing test coverage: none.** `scripts/test-dice-skin-integration.mjs:6`
imports `buildRegistryScript`, `makeRegistryEntry`, `buildSidecarScript`,
`buildFaceArtMap`, `validatePack`, `DIE_FACE_KEYS` from
`promote-dice-skin.mjs` — but not `updateRegistryCacheBuster` or
`promotePack` itself. I grepped the whole test file for
`promote|INDEX_HTML|registry\.js|cache`: nothing exercises which files get
their cache-buster bumped. Whichever shape is chosen ships with zero
regression protection today.

**ROLLER_VERSION — clarifying the hub's own hard-rule wording.** The hub
text ("bump `?v=` params ... and ROLLER_VERSION when their files change")
reads as one rule but is actually two unrelated mechanisms.
`ROLLER_VERSION` (`assets/dice-3d/shared-dice-roller-core.js:31`,
`assets/dice-3d/lyrian-accurate-dice.js:76`) is an **in-memory Three.js
texture-cache key** — used at `shared-dice-roller-core.js:808` and
`lyrian-accurate-dice.js:1661` to key a `Map` of already-decoded textures
so the app doesn't reuse stale pixels after an art change within the same
page session. It has no effect on whether the *browser's HTTP cache*
refetches the `.js` file — that's what the `?v=` query strings do. Neither
bug in this memo is about ROLLER_VERSION; flagging this only so the fix
discussion doesn't conflate the two the way the hub's rule text does.

**Build pipeline does not touch these HTML files.** Checked
`scripts/build-owlbear.mjs` in full: it runs two esbuild passes, bundling
only `owlbear/panel.js`+`owlbear/background.js` and
`owlbear-dice/panel.js`+`owlbear-dice/background.js`+`owlbear-dice/overlay.js`
into `dist/`. It never reads, templates, or copies `panel.html`,
`overlay.html`, or `background.html` — those ship as static, hand-authored
files. This matters for the options below: there is **no existing
build-time injection point** for these pages' inline `<script>` blocks. A
build-time fix would be a genuinely new mechanism, not an extension of
something already there.

---

## 2. Options

| # | Fix shape | Fixes (a) new-set visibility | Fixes (b) M9 double-download | Promotion-time cost | Implementation risk |
|---|---|---|---|---|---|
| **1** | `promote-dice-skin.mjs` (+ `prune-dice-catalog.mjs`) writes the **same** cache-buster value into index.html, panel.html, and overlay.html | Yes | **Only if scoped to the whole shared `V`**, not just the registry substring — see 2.1 | High if scoped broadly (busts the full ~42-45MB engine cache on every promotion, even art-only ones); low if scoped narrowly | Medium — panel.html/overlay.html's registry reference isn't shaped like index.html's (see 2.1); naive reuse of the existing regex produces a malformed double query string |
| **2** | A dedicated **registry-only** token, decoupled from the engine-payload `V`, written into all three pages | Yes | No — leaves the existing engine-file `V` mismatch exactly as-is | Low (registry is ~642KB vs. ~38-45MB of engine/sidecar payload) | Low-medium — clean by construction, but introduces a second version variable in panel.html/overlay.html alongside the existing `V` |
| **3** | Stop caching the registry at all — always-revalidate fetch (e.g. `Date.now()` appended at load time, or `fetch(..., {cache:"no-store"})`), no static token to forget | Yes, and structurally prevents recurrence | No — orthogonal to the engine files, same gap as Option 2 | Low per-promotion (nothing to edit at promotion time at all); small recurring cost of re-fetching ~642KB on every page open instead of reusing a browser-cached copy within a session | Low — smallest code footprint of the three, but is a real behavior change (this one file permanently bypasses caching, forever, not just after promotions) |

### 2.1 The scoping ambiguity in Option 1, spelled out

The brief's Option 1 text ("bumps the SAME cache-buster value into all
consumer pages") is ambiguous about *what* gets synchronized, and the
answer changes whether M9 gets fixed:

- **Narrow reading** — extend the existing regex-replace to also target
  just the registry reference inside panel.html/overlay.html. Mechanically
  awkward: index.html embeds `?v=` inline in one literal
  (`"...registry.js?v=X"`), but panel.html/overlay.html build the URL as
  `"...registry.js" + V` — the query string is not textually present next
  to the path at all. Reasoning through the existing regex against that
  source (not executed): it would still match the bare path and insert
  `?v=<key>` right before the closing quote, producing
  `"...registry.js?v=<key>" + V` — which at runtime concatenates to
  `...registry.js?v=<key>?v=<V-value>`, a double query string. This
  codebase's servers resolve static assets by pathname and ignore query
  strings entirely (confirmed in `BETA_2.5_TASKS/reports/004-ws2-pipeline-audit-report.md`
  item 3), so it would likely keep working, but it's an ugly, fragile
  artifact, and it does **not** touch the 8 engine-file entries governed by
  the same `V` — so M9 stays unfixed under this reading.
- **Broad reading** — replace the entire `var V = "?v=...";` value in both
  pages on every promotion. This *does* fix M9 (both pages converge on one
  token after the next promotion), but every promotion — including one
  that only tweaks a single pack's art — now also forces every visitor to
  re-download the full engine/sidecar set in panel.html and overlay.html.
  That is precisely the cost the brief's Option 2 was framed to avoid.

I could not find evidence in this codebase for a reading that gets M9 fixed
without paying one of these two costs. That is the memo's main
"uncomfortable" finding, not a gap in my search — see §0 and §4.

### 2.2 Answering the brief's direct question

**Does one fix shape resolve both bugs?** Only Option 1, and only under
the broad scoping — at the cost of re-coupling the registry to the full
engine payload, which is the exact coupling Option 2/3 exist to break.
Options 2 and 3 both solve bug (a) cheaply and cleanly but leave bug (b)
as a **separate, unaddressed problem** — today's mismatched panel/overlay
`V` values would need their own fix (at minimum a one-time manual sync to
the same value; see §5 for whether that's worth doing given WS3).

---

## 3. My lean (opinion, not a decision)

I'd pick **Option 2**, paired with a small, separate, one-time manual sync
of panel.html's and overlay.html's `V` to a matching value to close M9 now
— rather than reaching for Option 1's broad scoping to get "one mechanism,
both bugs." Reasons:

- The hub's own hard rule already treats the ~42-45MB engine payload as
  expensive to invalidate ("cache-busters matter... this burned a whole
  debugging session once"); Option 1-broad reintroduces that exact expense
  on every promotion, including art-only ones on a single pack, which will
  become more frequent as more sets are promoted (owner's stated plan:
  "3+ more sets").
- Option 2 mirrors a shape the codebase already uses successfully
  elsewhere: `CHARACTER_SCHEMA_VERSION`/`ROLL_SCHEMA_VERSION` are
  independent version fields precisely because they version independent
  things (per `BETA_2.5_TASKS/reports/002-ws5-ws6-contract-scout-report.md:345`).
  The registry and the engine bundle are also independent things that
  change on different schedules (packs get promoted often; the engine
  changed once in this whole log, for numeral dots) — giving them
  independent tokens matches that reality instead of fighting it.
- Option 3 is elegant and I don't dismiss it, but it's a bigger behavioral
  change (permanently disables caching for that file, forever, not just
  around promotions) for a problem Option 2 already solves with a smaller,
  more conventional edit. I'd keep it in reserve if Option 2's "don't
  forget the second token" still proves fragile in practice.

This is my judgment call, not the brief's instruction — the owner may
weigh the bandwidth cost vs. code-cleanliness tradeoff differently.

---

## 4. Work narrative

**Reading order.** `BETA_2.5_PROJECT_STATE.md` in full, then
`BETA_2.5_TASKS/010-registry-cache-buster-options-memo.md` in full. Then,
per the brief's evidence bar, the real source in this order:
`scripts/promote-dice-skin.mjs` (full file, 272 lines) →
`BETA_2.5_TASKS/reports/004-ws2-pipeline-audit-report.md` (full, for M9's
original context and citations to check) → grepped the whole worktree for
`promoted-dice-skins.registry.js` to find every consumer, not just the
three named, so I'd notice if the brief's "confirmed by search" undersold
the surface area (it found several dev/QA comparison pages —
`angel-sword-face-texture-check.html`, `dice-face-audit.html`,
`asari-*-comparison.html`, `dice-set-showcase.html`, etc. — that reference
the registry with no `?v=` at all; these are out of the brief's named
scope and I left them alone, noted here only so the exclusion is a
decision, not an oversight) → grepped for `ROLLER_VERSION` → read
`index.html:430-460`, `owlbear-dice/panel.html:1-100`,
`owlbear-dice/overlay.html:1-80` in full to get every exact line and the
full engine-file list, not just the one line each report already quoted →
read `scripts/prune-dice-catalog.mjs` in full (found the duplicate-bug
finding here) → read `src/js/runtime-loader.js` in full (found the
internal `shared-dice-roller-core.js` drift here) → read `package.json`
in full (to get the real npm script names, incl. `dice:publish-clean` →
`prune-dice-catalog.mjs`, which isn't named in the brief) → grepped
`src/js/constants.js` for the shared literal (found the fifth copy,
`previewRevision`) → read `scripts/build-owlbear.mjs` in full (to check
whether a build step already templates the HTML pages — it doesn't) →
grepped `scripts/check-bundle-compat.mjs` for registry/cache-buster
handling (nothing) → grepped `scripts/test-dice-skin-integration.mjs` for
existing coverage (imports pure builder functions only, not the
file-writing path) → read `assets/dice/promoted-dice-skins.json`'s
`generatedAt`/`faceArtScript` fields to date the last real promotion
against index.html's current (non-numeric, hand-edited) token → read
`BETA_2.5_ONLINE_CONVERSION_PLAN.md:40-65` for the stated design intent
behind the registry (§6) and the adjacent WS3/WS4/WS5 items, to know what
else touches this area. Checked `git log -1` and `git status --porcelain`
at the end: worktree clean at `ab70ce5` except the three untracked task
briefs (008, 009, 010) — no stray edits of mine.

**Dead ends / things I checked and ruled out.**
- Considered whether `build-owlbear.mjs` already templates the HTML pages
  (which would make a build-time-injected shared token nearly free). Read
  the whole script: it only bundles the three `.js` entry points via
  esbuild; the HTML shells are untouched, static, hand-authored files. Not
  a live option today without adding new build machinery — I did not add
  it as a 4th named option since I found no existing evidence for it, only
  absence of evidence, and the brief asks for evidence-grounded options.
- Considered whether the brief's Option 1 could be read as risk-free (just
  reuse the existing 6-line regex function against 2 more files). Traced
  the exact string shapes in panel.html/overlay.html vs. index.html and
  found they differ (`"...js" + V` vs. `"...js?v=X"` inline) — this became
  §2.1 rather than a dead end, but I want to flag that I reasoned through
  the regex by hand against the real source text rather than executing it
  (this is a read-only task; I made no edits to test it). Anyone
  implementing Option 1 should verify this mechanically before trusting my
  read.
- Checked whether `ROLLER_VERSION` was actually part of the HTTP
  cache-busting story (the brief explicitly pointed at it as "prior art").
  Traced both declarations and all their usages; it's an in-memory texture
  cache key, unrelated to script-tag URLs. Reported as a clarification
  rather than an option, since treating it as cache-busting prior art
  would have been importing a false analogy into the memo.
- Checked for any existing test coverage of the cache-buster-writing
  behavior before assuming there was none, since that would change the
  cost of any fix (a fix that breaks a passing test is cheaper to trust
  than one with no signal either way). Confirmed there is none.

---

## 5. Questions parked for the owner

1. **Scope of the fix: one script or both?** `prune-dice-catalog.mjs`
   (`dice:publish-clean`) duplicates `promote-dice-skin.mjs`'s cache-buster
   logic rather than importing it (it already imports `buildRegistryScript`
   from that module, just not this part). Should a future fix land in both
   scripts, or is this the moment to have `prune-dice-catalog.mjs` import
   the shared logic instead of re-implementing it? Small either way, but
   it's a real second location whoever implements this needs to know about.
2. **Is M9 worth fixing now at all, given WS3?** The task queue's item 6
   ("WS3 remainder — dice slimming: per-set lazy sidecar loading, ~42MB →
   per-set") would change the shape of what panel.html/overlay.html load
   in the first place. If WS3 lands relatively soon, a one-time manual
   sync of today's `V` mismatch (or any of Option 1/2/3 built around
   today's "one big shared engine bundle" model) may be partially
   obsoleted by it. Worth sequencing, or fixing cheaply now regardless
   since WS3 isn't scheduled?

Everything else needed to decide is in §1-§3 above; nothing else is
blocked on the owner to *understand* the bug, only to *choose* a shape.
