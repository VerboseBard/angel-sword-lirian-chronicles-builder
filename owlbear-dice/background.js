/* Angel Sword Dice — background page.
   Since the 2026-08-25 rework this page only manages the overlay's
   LIFECYCLE; the overlay itself (overlay.js) subscribes to the room's roll
   broadcasts, animates every roll (interrupting the previous one), and keeps
   the stacked result chips. Responsibilities here:
   - open the overlay when a roll arrives and no live overlay is heartbeating
     (an extension window cannot open itself);
   - buffer recent rolls and replay them to a freshly booted overlay over the
     same-partition BroadcastChannel, so rolls arriving mid-boot are not lost.
     Only rolls that arrived after the open that booted it are replayed
     (task 032 L2): an older roll's chip must not come back.
   Task 032 L1: the overlay opens as a full-screen, click-through MODAL
   (disablePointerEvents), not a popover. Owlbear's popover has no
   pass-through option, so the old full-screen popover (then a full-width
   190 px strip) swallowed every click on Owlbear for about 30 s per roll.
   Task 032b safety net: if a real Owlbear ever ignores that option, the
   overlay sees a pointer event, closes itself and reports it here
   ("overlay-blocks-clicks"); this page then opens no more overlays until the
   room reloads. Rolls still reach the Room Rolls log.
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
/* Arrival time of the roll that triggered the current overlay boot; 0 when
   no boot is pending. "overlay-ready" replays only rolls from then on. */
let bootSince = 0;
/* Task 032b safety net: set when an overlay reports that it received a real
   pointer event, which means this room's Owlbear does not pass clicks through
   the modal. No overlay opens again until the room (and so this page) reloads.
   Kept in memory on purpose, never stored. */
let overlayBlocksClicks = false;

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
  const entry = { at: now, event };
  recentRolls.push(entry);
  while (recentRolls.length > BUFFER_MAX || (recentRolls.length && now - recentRolls[0].at > BUFFER_TTL_MS)) {
    recentRolls.shift();
  }
  return entry;
}

overlayChannel?.addEventListener("message", (messageEvent) => {
  const data = messageEvent?.data;
  if (data === "overlay-alive") {
    lastHeartbeatAt = Date.now();
    return;
  }
  if (data === "overlay-closing") {
    // The overlay is closing itself: the next roll may open a new one now.
    lastHeartbeatAt = 0;
    lastOpenAttemptAt = 0;
    return;
  }
  if (data && typeof data === "object" && data.kind === "overlay-blocks-clicks") {
    overlayBlocksClicks = true;
    return;
  }
  if (data === "overlay-ready") {
    const now = Date.now();
    lastHeartbeatAt = now;
    const since = bootSince;
    bootSince = 0;
    if (!since) {
      return;
    }
    const fresh = recentRolls.filter((entry) => entry.at >= since && now - entry.at <= BUFFER_TTL_MS);
    if (fresh.length) {
      overlayChannel.postMessage({ kind: "roll-replay", events: fresh.map((entry) => entry.event) });
    }
  }
});

/* Full screen so the 3D dice can fly anywhere, but it ignores the mouse and
   touch (disablePointerEvents), so every click lands on Owlbear underneath
   while dice fly and while the result chips stay up. No backdrop, no paper:
   only the dice and the chips are drawn. */
const OVERLAY_MODAL = Object.freeze({
  fullScreen: true,
  hideBackdrop: true,
  hidePaper: true,
  disablePointerEvents: true
});

async function ensureOverlayOpen(rollArrivedAt) {
  if (overlayBlocksClicks) {
    return;
  }
  const now = Date.now();
  if (now - lastHeartbeatAt < HEARTBEAT_FRESH_MS || now - lastOpenAttemptAt < OPEN_RETRY_MS) {
    return;
  }
  lastOpenAttemptAt = now;
  bootSince = rollArrivedAt || now;
  await OBR.modal.open({
    id: OVERLAY_ID,
    url: new URL("overlay.html", window.location.href).href,
    ...OVERLAY_MODAL
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
    const buffered = bufferRoll(event);
    try {
      await ensureOverlayOpen(buffered.at);
    } catch (error) {
      lastOpenAttemptAt = 0;
    }
  });
});
