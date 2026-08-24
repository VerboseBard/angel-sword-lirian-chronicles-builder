import OBR from "@owlbear-rodeo/sdk";
import { ROLL_CHANNEL } from "../owlbear/core.js";

const OVERLAY_ID = "com.angelssword.lyrian-chronicles/dice-overlay";
const SET_STORAGE_KEY = "asb.dice.selectedSet.v1";
const REPLAY_STORAGE_KEY = "asb.dice.replayEnabled.v1";
const DICE_TYPES = [20, 12, 100, 10, 8, 6, 4];
const seenRollIds = new Set();
let overlayBusy = false;

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

function parseBreakdown(event) {
  const results = [];
  const source = String(event?.breakdown || "");
  const pattern = /d(\d+):\s*(\d+)/gi;
  let match = pattern.exec(source);
  while (match) {
    const sides = Number(match[1]);
    const value = Number(match[2]);
    if (DICE_TYPES.includes(sides) && Number.isFinite(value)) {
      results.push({ sides, value });
    }
    match = pattern.exec(source);
  }
  return results.slice(0, 24);
}

function replayEnabled() {
  try {
    return localStorage.getItem(REPLAY_STORAGE_KEY) !== "0";
  } catch (error) {
    return true;
  }
}

OBR.onReady(() => {
  OBR.broadcast.onMessage(ROLL_CHANNEL, async (broadcastEvent) => {
    const event = broadcastEvent.data;
    if (!event?.id || !remember(event.id) || !replayEnabled() || overlayBusy) {
      return;
    }
    const results = parseBreakdown(event);
    if (!results.length) {
      return;
    }
    overlayBusy = true;
    setTimeout(() => {
      overlayBusy = false;
    }, 8000);
    try {
      const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
      let setId = "new-angelsword";
      try {
        setId = localStorage.getItem(SET_STORAGE_KEY) || setId;
      } catch (error) {
        /* viewer preference is optional */
      }
      const payload = encodeURIComponent(JSON.stringify({ results, setId }));
      await OBR.popover.open({
        id: OVERLAY_ID,
        url: new URL(`overlay.html#${payload}`, window.location.href).href,
        width: Math.max(360, Math.round(width)),
        height: Math.max(420, Math.round(height)),
        anchorReference: "POSITION",
        anchorPosition: { left: 0, top: 0 },
        anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
        transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
        hidePaper: true,
        disableClickAway: true
      });
    } catch (error) {
      overlayBusy = false;
    }
  });
});
