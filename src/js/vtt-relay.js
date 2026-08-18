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

/**
 * Publish a sheet event to any listening companion surface.
 * @param {string} kind — "dice" | "action-damage" | "check" | "skill"
 * @param {Object} detail — JSON-safe payload (label, formula, total, parts…)
 */
export function publishVttEvent(kind, detail = {}) {
  const channel = getChannel();
  if (!channel) {
    return;
  }
  try {
    const event = {
      v: VTT_RELAY_VERSION,
      id: createEventId(),
      ts: Date.now(),
      kind: String(kind || "event"),
      relaySource: "angel-sword-sheet",
      ...detail
    };
    rememberPublishedId(event.id);
    channel.postMessage(event);
    return event;
  } catch (error) {
    /* never let telemetry break a roll */
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
  roomEventSubscribers.add(subscriber);
  return () => roomEventSubscribers.delete(subscriber);
}
