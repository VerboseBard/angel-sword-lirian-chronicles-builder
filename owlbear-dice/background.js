/* Angel Sword Dice — background page.
   Since the 2026-08-25 rework this page only manages the overlay popover's
   LIFECYCLE; the overlay itself (overlay.js) subscribes to the room's roll
   broadcasts, animates every roll (interrupting the previous one), and keeps
   the stacked result chips. Responsibilities here:
   - open the overlay popover when a roll arrives and no live overlay is
     heartbeating (popovers cannot open themselves);
   - buffer recent rolls and replay them to a freshly booted overlay over the
     same-partition BroadcastChannel, so rolls arriving mid-boot are not lost.
   The old one-roll-at-a-time 8s busy lock is gone by design (owner directive:
   a new roll may cut the previous animation short; results persist as chips). */

import OBR from "@owlbear-rodeo/sdk";
import { ROLL_CHANNEL, extractRollDice } from "../owlbear/core.js";

const OVERLAY_ID = "com.angelssword.lyrian-chronicles/dice-overlay";
const OVERLAY_CHANNEL = "asb-dice-overlay.v1";
const REPLAY_STORAGE_KEY = "asb.dice.replayEnabled.v1";
const HEARTBEAT_FRESH_MS = 5000;
const OPEN_RETRY_MS = 20000;
const BUFFER_MAX = 12;
const BUFFER_TTL_MS = 60000;

const seenRollIds = new Set();
const recentRolls = [];
let lastHeartbeatAt = 0;
let lastOpenAttemptAt = 0;

function remember(id) {
  if (!id || seenRollIds.has(id)) {
    return false;
  }
  seenRollIds.add(id);
  if (seenRollIds.size > 300) {
    seenRollIds.delete(seenRollIds.values().next().value);
  }
  return true;
}

function replayEnabled() {
  try {
    return localStorage.getItem(REPLAY_STORAGE_KEY) !== "0";
  } catch (error) {
    return true;
  }
}

const overlayChannel = typeof BroadcastChannel === "function"
  ? new BroadcastChannel(OVERLAY_CHANNEL)
  : null;

function bufferRoll(event) {
  const now = Date.now();
  recentRolls.push({ at: now, event });
  while (recentRolls.length > BUFFER_MAX || (recentRolls.length && now - recentRolls[0].at > BUFFER_TTL_MS)) {
    recentRolls.shift();
  }
}

overlayChannel?.addEventListener("message", (messageEvent) => {
  const data = messageEvent?.data;
  if (data === "overlay-alive") {
    lastHeartbeatAt = Date.now();
    return;
  }
  if (data === "overlay-ready") {
    lastHeartbeatAt = Date.now();
    const now = Date.now();
    const fresh = recentRolls.filter((entry) => now - entry.at <= BUFFER_TTL_MS);
    if (fresh.length) {
      overlayChannel.postMessage({ kind: "roll-replay", events: fresh.map((entry) => entry.event) });
    }
  }
});

async function ensureOverlayOpen() {
  const now = Date.now();
  if (now - lastHeartbeatAt < HEARTBEAT_FRESH_MS || now - lastOpenAttemptAt < OPEN_RETRY_MS) {
    return;
  }
  lastOpenAttemptAt = now;
  const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
  await OBR.popover.open({
    id: OVERLAY_ID,
    url: new URL("overlay.html", window.location.href).href,
    width: Math.max(360, Math.round(width)),
    height: Math.max(420, Math.round(height)),
    anchorReference: "POSITION",
    anchorPosition: { left: 0, top: 0 },
    anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
    transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
    hidePaper: true,
    disableClickAway: true
  });
}

OBR.onReady(() => {
  OBR.broadcast.onMessage(ROLL_CHANNEL, async (broadcastEvent) => {
    const event = broadcastEvent.data;
    if (!event?.id || !remember(event.id) || !replayEnabled()) {
      return;
    }
    if (!extractRollDice(event).length) {
      return;
    }
    bufferRoll(event);
    try {
      await ensureOverlayOpen();
    } catch (error) {
      lastOpenAttemptAt = 0;
    }
  });
});
