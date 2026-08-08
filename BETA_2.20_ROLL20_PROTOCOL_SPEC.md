# Roll20 Bridge Protocol Specification (Behavior-Level)

Last updated: 2026-07-22
Status: implementation reference for the clean-room Beta 2.20 bridge.

This spec describes OBSERVABLE protocol behavior only. It was written from the recorded
message shapes in `BETA_2.20_ROLL20_HANDOFF.md` (companion 0.4.0 observation). No upstream
source code is reproduced here or in the implementation. The machine-readable companion of
this document is `scripts/roll20-protocol-fixture.mjs`, which the unit tests import.

## 1. Two dialects, one message shape

The sheet's connection manager (`src/js/roll20-bridge.js`) speaks two wire dialects with
identical message shapes but different `source` tags:

| Dialect | Page → bridge `source` | Bridge → page `source` | Served by |
|---|---|---|---|
| `official` | `clio-battle` | `clio-companion` | Angel's Sword Clio Companion (localhost/127.0.0.1 dev origins only) |
| `asb` | `asb-battle` | `asb-companion` | Our clean-room userscript (`roll20/angel-sword-roll20-bridge.user.js`) |

Rationale: on localhost, a developer with the official companion installed gets a working
bridge with zero extra installs. The public GitHub Pages origin is only matched by our own
userscript. Distinct tags prevent double-forwarding when both userscripts are installed:
**a macro send is routed to exactly one dialect** (preference: `asb`, then `official`).

## 2. Messages

All messages are plain JSON-safe objects posted with `window.postMessage(payload, "*")` on
the page's own window. Receivers filter on `event.origin === location.origin` plus the
`source` tag; sender-identity checks are deliberately NOT used (userscript world
WindowProxy identity is unreliable).

### Page → bridge

- Ping: `{ source: <pageTag>, type: "ping" }`
- Send: `{ source: <pageTag>, type: "send", id: string, macro: string }`
  - Optional metadata fields may accompany a send: `kind`, `bonus`, `formula`, `tokenId`,
    `pr`. From v0.2.0, a send with `kind: "initiative"` + numeric `pr` (the SHEET's rolled
    total — one source of truth, never re-rolled bridge-side) + `tokenId` (the pinned
    token, else the current selection) also writes that token into Roll20's turn tracker
    when main-world page access is available; otherwise it degrades to posting the macro
    only.
- Selected-token query: `{ source: <pageTag>, type: "getSelected", id: string }`
  (implemented in bridge v0.2.0; the hub's "Pin Selected Token" uses it)

### Bridge → page

- Status: `{ source: <bridgeTag>, type: "status", roll20: boolean }`
  - Sent immediately at script load, in reply to every ping, and on heartbeat change.
  - `roll20: true` means a live Roll20 game tab heartbeat is fresh.
- Ack: `{ source: <bridgeTag>, type: "ack", id, ok: boolean, error?: string }`
- Selected result: `{ source: <bridgeTag>, type: "selected", id, ok, tokenId?, name?, error? }`
  (reserved for step 7)

### Secondary page→bridge transport (DOM mailbox)

Because page→userscript `postMessage` delivery can fail under some userscript-manager
modes, every page→bridge message is ALSO delivered by writing the JSON payload to
`document.documentElement.dataset.asbBridgeMsg` (our dialect) /
`document.documentElement.dataset.clioBattleMsg` (official dialect) and dispatching a plain
DOM event `asb-battle-poke` / `clio-battle-poke`. Bridges deduplicate by message `id`
(and pings are idempotent), so double delivery is harmless.

## 3. Timing constants (manager)

| Constant | Value | Meaning |
|---|---:|---|
| `PING_INTERVAL_MS` | 5000 | ping cadence per dialect |
| `SEND_TIMEOUT_MS` | 3000 | pending send fails if no ack |
| `COMPANION_SILENT_MS` | 15000 | no status for this long → treat userscript as absent |

## 4. Manager states

Effective state, derived per render from both dialects:

- `not-installed` — no status message from either dialect within `COMPANION_SILENT_MS`.
- `no-roll20` — at least one bridge answered, all report `roll20: false`.
- `connected` — at least one bridge reports `roll20: true`.

Per-send lifecycle reported to the caller: `sending → sent` on `{ok:true}` ack,
`sending → error` on `{ok:false}` ack or timeout. Duplicate acks for a settled id are
ignored. A send attempted while not `connected` fails immediately without posting.

Reconnect: when the effective state transitions into `connected`, the manager emits a
state-change event; consumers may re-render or re-push state. The manager itself never
auto-resends failed macros.

## 5. Userscript internal relay (our bridge only)

The userscript's two personalities relay through userscript-manager script storage using
`asb20_`-prefixed keys: `asb20_alive` (Roll20 heartbeat `{ts, tab}`), `asb20_send`
(`{id, macro, ts, kind?, pr?, tokenId?, …}` builder→Roll20), `asb20_ack`
(`{id, ok, error?, ts}` Roll20→builder), `asb20_query` (`{id, type:"selected", ts}`
builder→Roll20), `asb20_query_ack` (`{id, ok, tokenId?, name?, error?, ts}`
Roll20→builder).
Storage change listeners are backed by 600 ms polling (change events are unreliable under
some manager modes); consumers dedupe by `id`. With several Roll20 game tabs open, the tab
with the freshest heartbeat is the designated injector; a tab whose heartbeat readback
shows another live tab leaves sends alone. These keys are OURS — they intentionally do not
collide with any other userscript's storage.

Roll20-side injection (v0.1): fill the chat input textarea, click its send button, restore
any pre-existing draft afterward. If the chat box is absent, ack `{ok:false}` with a clear
error. No page-internal Roll20 objects are touched in v0.1.

## 5b. TokenMod bar sync (opt-in, sheet-side)

When the player enables bar sync AND has pinned a token AND the bridge is connected, the
sheet sends `!token-mod --ignore-selected --ids <pinnedTokenId> --set bar1_value|… ` as an
ordinary macro send (debounced, deduped against the last sent values). Bar convention:
bar1 HP, bar2 Mana, bar3 RP, bar4 Shield/Temp HP. This requires the GM-installed TokenMod
mod in the Roll20 game — without it the chat line is inert, which is why the feature is
strictly opt-in and labeled advanced. `--ignore-selected` pins the write to the token id
so it can never hit whatever happens to be selected.

## 6. Safety rules (binding)

- No resource spending anywhere in the bridge path (spending arrives only in a later,
  ack-gated milestone per the Roll20 handoff, and only after a positive ack).
- Macro payloads: strings only, `{`/`}` template fields already sanitized by
  `integrations.js` builders, and capped at `MAX_MACRO_LENGTH = 4000` characters.
- Malformed inbound messages (wrong types, missing fields, oversized) are dropped silently.
- The userscript requests no permissions beyond storage + its listed origins, stores no
  character data, and never talks to any server.
