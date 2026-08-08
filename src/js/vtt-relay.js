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

function getChannel() {
  if (channelBroken || typeof BroadcastChannel !== "function") {
    return null;
  }
  if (!channelInstance) {
    try {
      channelInstance = new BroadcastChannel(VTT_RELAY_CHANNEL);
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
    channel.postMessage({
      v: VTT_RELAY_VERSION,
      ts: Date.now(),
      kind: String(kind || "event"),
      ...detail
    });
  } catch (error) {
    /* never let telemetry break a roll */
  }
}
