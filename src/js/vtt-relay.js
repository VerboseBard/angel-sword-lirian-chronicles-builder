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
  postDevRelayEvent(event);
  return event;
}

/**
 * Hand a full character (and optional baked token images) to a companion
 * surface through the local dev relay. Unlike rolls this awaits delivery so
 * the caller can tell the user whether the send actually landed.
 * Dev-host only; resolves false when the local builder server is absent.
 */
export async function publishVttHandoff(detail = {}) {
  if (!isDevRelayHost() || typeof fetch !== "function") {
    return false;
  }
  const event = {
    v: VTT_RELAY_VERSION,
    id: createEventId(),
    ts: Date.now(),
    kind: "character-handoff",
    relaySource: "angel-sword-sheet",
    ...detail
  };
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
  roomEventSubscribers.add(subscriber);
  return () => roomEventSubscribers.delete(subscriber);
}
