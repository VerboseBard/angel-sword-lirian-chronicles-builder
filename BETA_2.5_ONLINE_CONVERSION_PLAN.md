# Beta 2.5 — Online Conversion Plan

Recorded: 2026-08-24, from the owner's end-of-session directives after the locally
verified milestone (tag `beta-2.2-locked` on `agent/beta-2-20-development`).

## Identity and rules

- This worktree (`agent/beta-2-5-online`) is the **change branch**. The 2.20 folder stays
  the frozen, known-working LOCAL build; all conversion work happens here.
- Nothing goes live from either branch. Publishing stays owner-held. The eventual public
  release name remains **Beta 3** per `BETA_3_OWLBEAR_RELEASE_ROADMAP_2026-08-23.md`;
  "2.5" is this internal conversion line.
- Guiding lesson (owner, 2026-08-24): "We got it to work here, and that's great. But until
  we can build it out to work there, we're in a bad way." Local-only transports are
  scaffolding, not product.

## Workstreams, in priority order

### 1. Remote roll + character transport (the staging blocker)
The local dev-server relay does not exist online. Replace with the approved design:
the Companion panel opens the builder in a window it owns; `window.opener` postMessage
carries character handoffs and live rolls both ways (window-to-window messaging is not
blocked by storage partitioning). Local relay stays as a dev fast path.
Acceptance: on a static host with no dev server, sheet rolls appear in Room Rolls and
trigger the dice overlay; Link-to-Owlbear-style handoff works with no file.

### 2. Staging publish pipeline
Static hosts cannot rewrite manifests at serve time. Add a publish step that emits an
uploadable folder with absolute manifest URLs (icon, background_url, action.icon,
action.popover) baked for a configurable base URL, for BOTH extensions. Include the
deploy-simulation check. The staging host choice (unlisted GitHub Pages test repo vs
Cloudflare Pages) is the owner's; the pipeline takes the base URL as input.

### 3. Dice asset slimming (owner: "is there a way to shrink the file?")
Yes, in three tiers:
- **Lazy per-set loading** (no visual loss): load only the selected set's face-art
  sidecar in the panel/overlay instead of all promoted packs (~42MB today). Biggest win.
- **Re-encode face art smaller** (tunable loss): the promotion pipeline can re-bake
  face textures at lower resolution/quality (e.g., 384px → 256px webp) for web builds.
- **Drop dead weight**: the legacy `dice-3d-embedded.js` (~2.8MB) loads disabled;
  verify and remove it from extension pages.
Also: the overlay currently reloads the engine every roll — keep it warm (resize the
popover to 1px instead of closing, or cache) so replays are instant and cheap.

### 4. Overlay roll sounds
The extension is silent; sounds exist only in the builder tray (owner-confirmed by ear).
Wire the builder's existing roll/impact sounds into the overlay playback, with the
per-viewer replay toggle also muting them, plus the planned persistent mute.

### 5. Version-compatibility contract (owner directive)
Builder and extensions must stay compatible across updates. The event/character schemas
already carry `schemaVersion` / `ROLL_SCHEMA_VERSION` / `CHARACTER_SCHEMA_VERSION` in
`owlbear/core.js` — formalize: extensions accept same-or-older schema versions, ignore
unknown fields, and a compatibility test in `test:vtt` pins the contract so a builder
update cannot silently break installed extensions (players' Owlbear caches the manifest
URL, not the code — both sides must tolerate version skew).

### 6. Adding new dice sets without breaking the extension (owner: 3+ sets planned)
Already architecturally supported — confirm and document: new sets go through the Skin
Pack Builder → `npm run dice:promote` → `promoted-dice-skins.registry.js`. The dice
extension reads the registry at load, so promoted sets appear in its picker with zero
extension code changes. With workstream 3's lazy loading, each new set costs nothing
until a viewer selects it. Add a regression test: promoted registry entries all resolve
a loadable sidecar.

### 7. Parked: GM tools extension
Owner idea (separate issue, separate time): a GM-focused Angel Sword extension
(initiative, monster/NPC helpers — in the spirit of other creators' GM suites).
Collect requirements later; do not scope-creep 2.5.

## Status log

### 2026-08-25 — Workstream 1 LIVE-VERIFIED by the owner; first live bug fixed
- Owner ran the full flow in a fresh room (new scene, re-added extensions):
  panel button opened the sheet with the character auto-loaded; handshake
  connected; two-tab guard fired on the old tab (and its Close button really
  closed it); sheet rolls reached Room Rolls + the 3D overlay; **rolls kept
  arriving with the panel closed**; Owlbear-side dice rolls landed back in the
  sheet's Combat Log. Workstream 1 acceptance = met live, both directions.
- Owner-confirmed after `60b5855`: F5 on the room tab → the sheet link
  auto-reconnected with no clicks and rolls kept flowing (silent
  `tryReconnectSheet` re-acquisition, live-verified).
- **Fixed same session (`60b5855`):** 2d10 animated only one die in the room
  overlay — rolls traveled as text and the overlay regex read one value per
  die group. Now all four sheet roll sites publish structured
  `dice:[{sides,value}]`, `normalizeRollEvent` carries it, and the overlay
  consumes it (robust text fallback kept for older events). 97+48 checks.
- **Logged, deliberately not in this pass:**
  (a) overlay plays one roll at a time (~9s busy window, engine cold-start
  per roll) — owner wants faster back-to-back rolls AND concurrent rolls
  stacking a second result banner; both fold into workstream 3's
  keep-the-overlay-warm rework (persistent overlay page receiving events).
  (b) dice FACE shown sometimes mismatches the registered number (e.g. a 17
  showing a different face) — dice-ENGINE face-orientation mapping bug in the
  shared dice core, affects sheet and Owlbear equally, predates the
  conversion; needs its own hunt with per-set/per-die repro (owner saw it on
  Rana set d10s/d20s); candidate approach: automated forced-result
  face-verification screenshots across all sets via the existing browser
  matrix harness.

### 2026-08-24 — Workstream 1 BUILT and machine-verified
- **Step 0 feasibility spike run live** (owner's Chrome, real room "The Tonal
  Quest"): Owlbear applies NO sandbox to extension iframes (`window.open` is
  possible); action-popover iframes are pre-mounted at room load and only
  visibility-toggled — never destroyed — so the bridge survives popover
  close/switching (only timer throttling to tolerate, handled via generous
  staleness + event-driven receive); BroadcastChannel confirmed NOT crossing
  the storage partition (synthetic probe never arrived), so the bridge is
  genuinely required.
- **Built:** `owlbear/opener-bridge.js` (panel owns the popup; hello/ping/pong/
  ack protocol, source+origin validation both ways, silent reconnect with
  ghost-window cleanup); sheet side inline in `src/js/vtt-relay.js`
  (`getOwlbearOpenerState` export; handoff prefers the bridge with ack, falls
  back to dev relay); room-roll id dedup on the sheet AND shared
  `shouldApplyHandoff` gate in the panel (fixes double-apply/resurrection);
  dead `/api/vtt-relay/token-image` endpoint deleted end to end; GM setup
  modal now lists BOTH extension install links and same-tab-navigates to the
  room (autosave flushed first, no orphan sheet tab); two-tab guard overlay
  (old tab pauses saving when a room-linked sheet appears).
- **Verified:** `npm run test:vtt` = 88 adapter checks + 48 opener-bridge
  fake-clock checks + Playwright panel phase + NEW bridge phase that blocks
  the dev relay and removes BroadcastChannel in both pages — the popup
  handshake, a character handoff, and an exactly-once roll all carried by
  window.opener postMessage alone (the workstream's literal acceptance
  condition, minus real-Owlbear embedding).
- **Remaining for workstream 1:** owner-run live room pass (real gesture
  popup from the panel, real sheet rolls + dice overlay, panel-closed
  behavior by feel), then the carried gaps below at staging.

### 2026-08-25 later — Dice presentation wave (owner decisions executed)
- **Audit verdict recorded:** 280/280 face assignments correct
  (DICE_FACE_AUDIT_2026-08-25.md); misreads = settle-camera angle + legibility.
- **Owner picked option A** (settle camera lift) and designed the overlay's
  concurrent-roll behavior: new roll cuts the old animation, results persist
  as up-to-three stacked chips (who + GM badge + what + total + breakdown),
  oldest fades by overflow and by ~30s age.
- **Shipped (`32bd2ba`, `cffc80e`):** engine-level 6/9 dot on every set
  (Angel d10 keeps its painted one); warm persistent overlay with
  interrupt-and-stack chips; GM/player role attribution end to end
  (Owlbear's own role system — the "who is the GM" question is answered
  structurally, not guessed); settle camera lift in the shared core (room
  overlay + sheet tray, reduced-motion starts overhead); Workshop core
  reconciled twice (dice:core:check green; Workshop commits f7e0420,
  cb837e8 — only the core file, other Workshop WIP untouched).
- **Owner live-test asks:** reload the room tab and hard-reload the sheet;
  roll twice fast (second roll should cut in, both chips stay), roll from
  the Dice panel as GM (chip should carry the GM badge), watch the camera
  ease overhead at settle, and check a 6 or 9 on any promoted set for its
  new dot.

### Backlog — dice art QC (from the 2026-08-25 placement review)
- **Workshop re-bake pass** for the 58 baseline-flagged faces
  (`qa-test-results/dice-face-audit/numeral-placement.json`; sheets
  `placement--<set>.png`). The rule the re-bake must satisfy, owner-derived:
  ONE shared baseline per die, consistent cap-height budget for one- and
  two-digit numerals (today doubles are ~2/3 the glyph height and ride
  ~2.5% high while singles sit ~2.5% low — systematic across Asari, Leaflit,
  Rana; Angel has scattered per-face drift instead).
- **Promote-time placement gate**: run the baseline measurement inside
  `dice:promote` validation so the owner's three planned sets arrive
  uniform instead of being repaired later.
- Engine-side nudging of baked art was considered and rejected (moving the
  numeral means moving the whole painting; frames would detach from face
  edges). Numeral-tracked ambiguity dots already compensate where it
  matters most.

## Carried test gaps (staging will cover)
Second-player ownership + GM repair (remote friend), real `.aschar` imports, phones and
tablets, Chrome/Edge/Firefox/Brave/Safari, private browsing. Housekeeping on the owner's
side: delete duplicate Pecorine library entries and dead grey tokens from the URL era.
