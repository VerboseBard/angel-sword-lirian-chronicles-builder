/* Angel Sword Dice — persistent roll overlay (2026-08-25 rework, owner design).
   Stays open across rolls with the 3D engine warm:
   - a new roll may cut the previous animation short — dice clear and the new
     roll flies immediately (no more one-roll-at-a-time lock);
   - every roll leaves a result CHIP in the top strip: who rolled (with a GM
     badge), what it was (Light Attack, skill check, ...), the total, and the
     per-die breakdown. Up to three chips; the oldest fades as new ones
     arrive, and every chip fades on its own after a while;
   - while dice fly the popover covers the viewport; once they land it
     shrinks to the chip strip so the map stays clickable, expanding again on
     the next roll; when the last chip fades the popover closes itself.
   Rolls arrive directly over OBR.broadcast; rolls fired while this page was
   still booting are replayed by background.js over a same-partition
   BroadcastChannel handshake. */

import OBR from "@owlbear-rodeo/sdk";
import { ROLL_CHANNEL, extractRollDice, normalizeRollEvent } from "../owlbear/core.js";

const OVERLAY_ID = "com.angelssword.lyrian-chronicles/dice-overlay";
const OVERLAY_CHANNEL = "asb-dice-overlay.v1";
const SET_STORAGE_KEY = "asb.dice.selectedSet.v1";
const REPLAY_STORAGE_KEY = "asb.dice.replayEnabled.v1";
const DICE_VISIBLE_MS = 5200;
const CHIP_TTL_MS = 30000;
const MAX_CHIPS = 3;
const STRIP_HEIGHT = 190;
const IDLE_CLOSE_DELAY_MS = 1200;
const HEARTBEAT_MS = 2000;

let obrReady = false;
let runtimeReady = false;
let closing = false;
let animatingUntil = 0;
let shrinkTimer = 0;
let idleTimer = 0;
let chipSequence = 0;
let rollGeneration = 0;
const seenRollIds = new Set();
const pendingEvents = [];
const chips = new Map();

const overlayChannel = typeof BroadcastChannel === "function"
  ? new BroadcastChannel(OVERLAY_CHANNEL)
  : null;

setInterval(() => {
  if (!closing) {
    overlayChannel?.postMessage("overlay-alive");
  }
}, HEARTBEAT_MS);

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

function selectedSetId() {
  try {
    return localStorage.getItem(SET_STORAGE_KEY) || "new-angelsword";
  } catch (error) {
    return "new-angelsword";
  }
}

function closeOverlay() {
  if (closing) {
    return;
  }
  closing = true;
  if (obrReady) {
    try {
      OBR.popover.close(OVERLAY_ID);
    } catch (error) {
      /* the popover may already be closing */
    }
  }
}

async function setOverlayHeight(pixels) {
  if (!obrReady) {
    return;
  }
  try {
    await OBR.popover.setHeight(OVERLAY_ID, pixels);
  } catch (error) {
    /* resizing is cosmetic */
  }
}

/* Expand the popover and wait for THIS window to actually reach the new
   size before returning. Rolling while the iframe is still at chip-strip
   height sizes the 3D canvas to ~190px and the later expansion stretches
   the render vertically — the "compression distortion" the owner saw. */
async function expandOverlay() {
  if (!obrReady) {
    return;
  }
  let targetHeight = 0;
  try {
    targetHeight = Math.max(420, Math.round(await OBR.viewport.getHeight()));
    await OBR.popover.setHeight(OVERLAY_ID, targetHeight);
  } catch (error) {
    return;
  }
  const deadline = Date.now() + 700;
  while (Date.now() < deadline && Math.abs(window.innerHeight - targetHeight) > 24) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

function scheduleIdleCheck() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const stillAnimating = Date.now() < animatingUntil;
    if (!stillAnimating && chips.size === 0) {
      closeOverlay();
    }
  }, IDLE_CLOSE_DELAY_MS);
}

function removeChip(id, immediate = false) {
  const chip = chips.get(id);
  if (!chip) {
    return;
  }
  chips.delete(id);
  clearTimeout(chip.ttlTimer);
  if (immediate) {
    chip.element.remove();
    scheduleIdleCheck();
    return;
  }
  chip.element.classList.add("is-fading");
  setTimeout(() => {
    chip.element.remove();
    scheduleIdleCheck();
  }, 650);
}

function addChip(event) {
  const strip = document.getElementById("roll-chips");
  if (!strip) {
    return;
  }
  const id = `chip-${chipSequence += 1}`;
  const element = document.createElement("div");
  element.className = "chip";
  const who = event.character && event.playerName && event.character !== event.playerName
    ? `${event.character} · ${event.playerName}`
    : (event.character || event.playerName || "Someone");
  const gmBadge = event.playerRole === "GM" ? '<span class="gm-badge">GM</span>' : "";
  // When the roller's display name IS "GM", the badge alone says it all.
  const whoText = gmBadge && who === "GM" ? "" : who;
  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  element.innerHTML = `
    <div class="chip-who">${gmBadge}${esc(whoText)}</div>
    <div class="chip-label">${esc(event.label || "Roll")}</div>
    <div class="chip-total">${Number.isFinite(Number(event.total)) ? `Total ${esc(event.total)}` : ""}</div>
    <div class="chip-breakdown">${esc(event.breakdown || "")}</div>`;
  strip.appendChild(element);
  requestAnimationFrame(() => element.classList.add("is-visible"));
  const ttlTimer = setTimeout(() => removeChip(id), CHIP_TTL_MS);
  chips.set(id, { element, ttlTimer });
  while (chips.size > MAX_CHIPS) {
    const oldestId = chips.keys().next().value;
    removeChip(oldestId);
  }
}

function clearDiceCanvases() {
  try {
    window.LyrianAccurateDiceRoller?.clear?.();
  } catch (error) {
    /* a mid-flight clear must never break the next roll */
  }
  document.querySelectorAll(".accurate-dice-canvas").forEach((canvas) => canvas.remove());
}

function playRoll(rawEvent) {
  const event = normalizeRollEvent(rawEvent);
  if (!event || !replayEnabled()) {
    return;
  }
  if (!runtimeReady) {
    if (!seenRollIds.has(event.id) && !pendingEvents.some((entry) => entry?.id === rawEvent?.id)) {
      pendingEvents.push(rawEvent);
    }
    return;
  }
  if (!remember(event.id)) {
    return;
  }
  const results = extractRollDice(rawEvent).slice(0, 24);
  if (!results.length) {
    return;
  }
  const generation = rollGeneration += 1;
  clearTimeout(shrinkTimer);
  clearDiceCanvases();
  addChip(event);
  expandOverlay().then(() => {
    if (generation !== rollGeneration) {
      return;
    }
    let animationMs = DICE_VISIBLE_MS;
    try {
      const reported = window.LyrianAccurateDiceRoller.rollDice({
        layer: document.getElementById("dice-flight-layer"),
        results,
        setId: selectedSetId(),
        width: window.innerWidth,
        height: window.innerHeight
      });
      if (Number.isFinite(Number(reported)) && Number(reported) > 0) {
        animationMs = Math.min(Number(reported), 12000);
      }
    } catch (error) {
      /* chips still record the result even if the 3D flight fails */
    }
    animatingUntil = Date.now() + animationMs;
    shrinkTimer = setTimeout(() => {
      clearDiceCanvases();
      setOverlayHeight(STRIP_HEIGHT);
      scheduleIdleCheck();
    }, Math.min(animationMs, DICE_VISIBLE_MS));
  });
}

function drainPending() {
  const queued = pendingEvents.splice(0);
  const [latest, ...older] = queued.reverse();
  older.reverse().forEach((event) => {
    const normalized = normalizeRollEvent(event);
    if (normalized && remember(normalized.id) && extractRollDice(event).length) {
      addChip(normalized);
    }
  });
  if (latest) {
    playRoll(latest);
  }
}

window.addEventListener("asd-dice-runtime-ready", () => {
  runtimeReady = true;
  try {
    window.LyrianAccurateDiceRoller?.preloadFaceArt?.(selectedSetId());
  } catch (error) {
    /* warm-up is best-effort */
  }
  drainPending();
  scheduleIdleCheck();
});
window.addEventListener("asd-dice-runtime-error", closeOverlay);

overlayChannel?.addEventListener("message", (messageEvent) => {
  const data = messageEvent?.data;
  if (data && typeof data === "object" && data.kind === "roll-replay" && Array.isArray(data.events)) {
    data.events.forEach((event) => playRoll(event));
  }
});

if (OBR?.onReady) {
  OBR.onReady(() => {
    obrReady = true;
    OBR.broadcast.onMessage(ROLL_CHANNEL, (broadcastEvent) => playRoll(broadcastEvent.data));
    overlayChannel?.postMessage("overlay-ready");
    scheduleIdleCheck();
  });
}
