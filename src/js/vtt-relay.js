/* ═══════════════════════════════════════════════════════════════════════════
   VTT relay — publishes sheet events (dice rolls, action rolls) onto a
   same-origin BroadcastChannel so companion surfaces can mirror them live.

   First consumer: the Owlbear Rodeo extension panel (owlbear/panel.html),
   which runs on THIS origin inside an Owlbear room iframe and therefore
   shares the channel with the sheet tab — no server, nothing leaves the
   browser. Future consumers (an OBS overlay page, other adapters) can listen
   on the same channel without any sheet changes.

   Fire-and-forget by design: publishing never throws, never blocks the roll,
   and silently no-ops where BroadcastChannel is unavailable. Events carry
   only what a table would see out loud — labels, formulas, totals — never
   the full character, notes, or anything private.
   ═══════════════════════════════════════════════════════════════════════════ */

export const VTT_RELAY_CHANNEL = "asb-vtt-events";
export const VTT_RELAY_VERSION = 1;

let channelInstance = null;
let channelBroken = false;
const publishedEventIds = new Set();
const seenRoomEventIds = new Set();
const roomEventSubscribers = new Set();

function createEventId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `sheet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function rememberPublishedId(id) {
  publishedEventIds.add(id);
  if (publishedEventIds.size > 200) {
    publishedEventIds.delete(publishedEventIds.values().next().value);
  }
}

function handleChannelMessage(messageEvent) {
  const event = messageEvent?.data;
  if (!event || event.relaySource !== "owlbear-room" || publishedEventIds.has(event.id)) {
    return;
  }
  /* The same room roll can arrive on several live transports at once
     (opener bridge, BroadcastChannel, dev relay) — deliver it once. */
  if (event.id) {
    if (seenRoomEventIds.has(event.id)) {
      return;
    }
    seenRoomEventIds.add(event.id);
    if (seenRoomEventIds.size > 200) {
      seenRoomEventIds.delete(seenRoomEventIds.values().next().value);
    }
  }
  roomEventSubscribers.forEach((subscriber) => {
    try {
      subscriber(event);
    } catch (error) {
      // A companion listener must never interrupt future relay events.
    }
  });
}

function getChannel() {
  if (channelBroken || typeof BroadcastChannel !== "function") {
    return null;
  }
  if (!channelInstance) {
    try {
      channelInstance = new BroadcastChannel(VTT_RELAY_CHANNEL);
      channelInstance.addEventListener("message", handleChannelMessage);
    } catch (error) {
      channelBroken = true;
      return null;
    }
  }
  return channelInstance;
}

/* Local dev transport: browsers partition BroadcastChannel across the
   Owlbear iframe boundary (and 127.0.0.1 vs localhost are different
   origins), so on local hosts the relay also routes through the dev
   server at /api/vtt-relay/events. Best-effort, dev-only, same-origin. */
const DEV_RELAY_HOST_PATTERN = /^(?:localhost|127\.0\.0\.1|\[::1\])$/i;
let devRelayCursor = null;
let devRelayTimer = null;

function isDevRelayHost() {
  return DEV_RELAY_HOST_PATTERN.test(globalThis.location?.hostname || "");
}

function postDevRelayEvent(event) {
  if (!isDevRelayHost() || typeof fetch !== "function") {
    return;
  }
  try {
    fetch("/api/vtt-relay/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true
    }).catch(() => {});
  } catch (error) {
    /* dev relay is best-effort */
  }
}

async function pollDevRelayOnce() {
  try {
    const query = devRelayCursor
      ? `?boot=${encodeURIComponent(devRelayCursor.boot)}&since=${devRelayCursor.seq}`
      : "";
    const response = await fetch(`/api/vtt-relay/events${query}`);
    const data = await response.json();
    if (!data?.ok) {
      return;
    }
    const baseline = !devRelayCursor;
    devRelayCursor = { boot: data.boot, seq: data.seq };
    if (baseline) {
      return;
    }
    (data.events || []).forEach((event) => handleChannelMessage({ data: event }));
  } catch (error) {
    /* server may be offline; keep trying quietly */
  }
}

function ensureDevRelayPolling() {
  if (devRelayTimer || !isDevRelayHost() || typeof fetch !== "function" || typeof setInterval !== "function") {
    return;
  }
  devRelayTimer = setInterval(pollDevRelayOnce, 2000);
}

/* ── Owlbear opener bridge (sheet side) ─────────────────────────────────
   When the Companion panel opened THIS window (window.opener is set), the
   two exchange events directly over postMessage — the one transport that
   works on a public static host, since window-to-window messaging is not
   storage-partitioned. The panel owns the heartbeat; this side answers.

   This file cannot import owlbear/core.js (enforced by test-vtt-adapters),
   so the kind strings and timings below repeat OPENER_BRIDGE_KIND /
   OPENER_BRIDGE_TIMING; scripts/test-owlbear-opener-bridge.mjs pins the
   two copies against each other. */
const OPENER_KIND_HELLO = "bridge-hello";
const OPENER_KIND_PING = "bridge-ping";
const OPENER_KIND_PONG = "bridge-pong";
const OPENER_KIND_ACK = "bridge-ack";
const OPENER_ACK_TIMEOUT_MS = 5000;
/* Generous: a hidden Companion iframe's ping timer can be throttled to
   about one a minute; postMessage delivery itself is never throttled. */
const OPENER_STALE_MS = 75000;
const OPENER_CONNECT_WAIT_MS = 2000;

let openerInitialized = false;
let openerHandshaken = false;
let openerLastHeardAt = 0;
const openerPendingAcks = new Map();

function getOwlbearOpener() {
  try {
    return globalThis.window?.opener || null;
  } catch (error) {
    return null;
  }
}

function postToOwlbearOpener(event) {
  const opener = getOwlbearOpener();
  if (!opener) {
    return false;
  }
  try {
    opener.postMessage(event, globalThis.location?.origin || "/");
    return true;
  } catch (error) {
    return false;
  }
}

function makeOpenerEnvelope(kind) {
  return {
    v: VTT_RELAY_VERSION,
    id: createEventId(),
    ts: Date.now(),
    kind,
    relaySource: "angel-sword-sheet"
  };
}

function handleOpenerMessage(messageEvent) {
  const opener = getOwlbearOpener();
  if (!opener || messageEvent?.source !== opener) {
    return;
  }
  if (messageEvent.origin !== (globalThis.location?.origin || "")) {
    return;
  }
  const event = messageEvent.data;
  if (!event || typeof event !== "object" || !event.kind) {
    return;
  }
  if (event.kind === OPENER_KIND_PING) {
    openerHandshaken = true;
    openerLastHeardAt = Date.now();
    postToOwlbearOpener(makeOpenerEnvelope(OPENER_KIND_PONG));
    return;
  }
  if (event.kind === OPENER_KIND_ACK) {
    openerLastHeardAt = Date.now();
    const pending = openerPendingAcks.get(event.inReplyTo);
    if (pending) {
      openerPendingAcks.delete(event.inReplyTo);
      pending(event);
    }
    return;
  }
  if (event.relaySource === "owlbear-room") {
    openerLastHeardAt = Date.now();
    handleChannelMessage({ data: event });
  }
}

function ensureOwlbearOpenerBridge() {
  if (openerInitialized) {
    return;
  }
  const win = globalThis.window;
  if (!win || typeof win.addEventListener !== "function" || !getOwlbearOpener()) {
    return;
  }
  openerInitialized = true;
  win.addEventListener("message", handleOpenerMessage);
  postToOwlbearOpener(makeOpenerEnvelope(OPENER_KIND_HELLO));
}

/**
 * Sync connection state of the opener bridge for UI copy decisions:
 * "closed" (no opener / room tab gone), "connecting", or "connected".
 */
export function getOwlbearOpenerState() {
  const opener = getOwlbearOpener();
  if (!opener) {
    return "closed";
  }
  try {
    if (opener.closed === true) {
      return "closed";
    }
  } catch (error) {
    /* a cross-origin opener still supports the checks below */
  }
  if (openerHandshaken && Date.now() - openerLastHeardAt <= OPENER_STALE_MS) {
    return "connected";
  }
  return "connecting";
}

function waitForOpenerConnected(timeoutMs = OPENER_CONNECT_WAIT_MS) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const state = getOwlbearOpenerState();
      if (state === "connected") {
        resolve(true);
        return;
      }
      if (state === "closed" || Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

async function sendHandoffViaOpener(event) {
  ensureOwlbearOpenerBridge();
  if (!(await waitForOpenerConnected())) {
    return false;
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      openerPendingAcks.delete(event.id);
      resolve(false);
    }, OPENER_ACK_TIMEOUT_MS);
    openerPendingAcks.set(event.id, (ack) => {
      clearTimeout(timer);
      resolve(Boolean(ack?.ok));
    });
    if (!postToOwlbearOpener(event)) {
      clearTimeout(timer);
      openerPendingAcks.delete(event.id);
      resolve(false);
    }
  });
}

/**
 * Publish a sheet event to any listening companion surface.
 * @param {string} kind — "dice" | "action-damage" | "check" | "skill"
 * @param {Object} detail — JSON-safe payload (label, formula, total, parts…)
 */
export function publishVttEvent(kind, detail = {}) {
  const event = {
    v: VTT_RELAY_VERSION,
    id: createEventId(),
    ts: Date.now(),
    kind: String(kind || "event"),
    relaySource: "angel-sword-sheet",
    ...detail
  };
  rememberPublishedId(event.id);
  try {
    getChannel()?.postMessage(event);
  } catch (error) {
    /* never let telemetry break a roll */
  }
  postToOwlbearOpener(event);
  postDevRelayEvent(event);
  return event;
}

/**
 * Hand a full character (and optional baked token images) to a companion
 * surface. Preferred transport: the opener bridge, when the Companion panel
 * opened this window — an acked postMessage that works on any static host.
 * Fallback: the local dev relay (dev hosts only). Unlike rolls this awaits
 * delivery so the caller can tell the user whether the send landed.
 */
export async function publishVttHandoff(detail = {}) {
  const event = {
    v: VTT_RELAY_VERSION,
    id: createEventId(),
    ts: Date.now(),
    kind: "character-handoff",
    relaySource: "angel-sword-sheet",
    ...detail
  };
  if (getOwlbearOpenerState() !== "closed") {
    if (await sendHandoffViaOpener(event)) {
      return true;
    }
  }
  if (!isDevRelayHost() || typeof fetch !== "function") {
    return false;
  }
  try {
    const response = await fetch("/api/vtt-relay/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event)
    });
    const data = await response.json();
    return Boolean(data?.ok);
  } catch (error) {
    return false;
  }
}

/**
 * Listen for other players' room rolls relayed back by the Owlbear extension.
 * This is best-effort in browsers that partition iframe storage; callers must
 * not depend on it for character-state synchronization.
 */
export function subscribeVttRoomEvents(subscriber) {
  if (typeof subscriber !== "function") {
    return () => {};
  }
  getChannel();
  ensureDevRelayPolling();
  ensureOwlbearOpenerBridge();
  roomEventSubscribers.add(subscriber);
  return () => roomEventSubscribers.delete(subscriber);
}
