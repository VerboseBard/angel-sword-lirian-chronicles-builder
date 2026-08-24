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

## Carried test gaps (staging will cover)
Second-player ownership + GM repair (remote friend), real `.aschar` imports, phones and
tablets, Chrome/Edge/Firefox/Brave/Safari, private browsing. Housekeeping on the owner's
side: delete duplicate Pecorine library entries and dead grey tokens from the URL era.
