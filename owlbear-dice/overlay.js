/* Angel Sword Dice — persistent roll overlay (2026-08-25 rework, owner design).
   Stays open across rolls with the 3D engine warm:
   - a new roll may cut the previous animation short — dice clear and the new
     roll flies immediately (no more one-roll-at-a-time lock);
   - every roll leaves a result CHIP in the top strip: who rolled (with a GM
     badge), what it was (Light Attack, skill check, ...), the total, and the
     per-die breakdown. Up to three chips; the oldest fades as new ones
     arrive, and every chip fades on its own after a while;
   - task 032 L1: this page runs in a full-screen, click-through Owlbear
     MODAL (background.js opens it with disablePointerEvents), so it never
     changes size and never takes a click: Owlbear underneath stays usable
     while dice fly and while chips show. The dice canvas is cleared once they
     land; when the last chip fades the modal closes itself.
   Rolls arrive directly over OBR.broadcast; rolls fired while this page was
   still booting are replayed by background.js over a same-partition
   BroadcastChannel handshake. */

import OBR from "@owlbear-rodeo/sdk";
import { ROLL_CHANNEL, extractRollDice, normalizeRollEvent } from "../owlbear/core.js";

const OVERLAY_ID = "com.angelssword.lyrian-chronicles/dice-overlay";
const OVERLAY_CHANNEL = "asb-dice-overlay.v1";
const SET_STORAGE_KEY = "asb.dice.selectedSet.v1";
const REPLAY_STORAGE_KEY = "asb.dice.replayEnabled.v1";
const MUTE_STORAGE_KEY = "asb.dice.soundMuted.v1";
const DEFAULT_DICE_SOUND_ASSETS = {
  rollBed: "../assets/sounds/dice-roll-bed-142528.mp3",
  impact: "../assets/sounds/dice-impact-95077.mp3"
};
const DICE_VISIBLE_MS = 5200;
const CHIP_TTL_MS = 30000;
const MAX_CHIPS = 3;
const IDLE_CLOSE_DELAY_MS = 1200;
const HEARTBEAT_MS = 2000;

let obrReady = false;
let runtimeReady = false;
let closing = false;
let animatingUntil = 0;
let diceClearTimer = 0;
let idleTimer = 0;
let chipSequence = 0;
let rollGeneration = 0;
let activeDiceAudioElements = [];
let diceAudioTimers = [];
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

/* Task 008 (WS4): persistent per-viewer mute for roll sound specifically,
   mirroring replayEnabled()'s own localStorage pattern exactly (same
   "absent/anything but the off-sentinel = default" shape). Defaults to
   unmuted, so an empty/missing key is not muted. */
function soundMuted() {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function diceSoundAssets() {
  const configured = window.ASD_DICE_SOUND_ASSETS;
  if (configured && typeof configured === "object") {
    return {
      rollBed: configured.rollBed || DEFAULT_DICE_SOUND_ASSETS.rollBed,
      impact: configured.impact || DEFAULT_DICE_SOUND_ASSETS.impact
    };
  }
  return DEFAULT_DICE_SOUND_ASSETS;
}

function closeModal() {
  try {
    Promise.resolve(OBR.modal.close(OVERLAY_ID)).catch(() => {
      /* the modal may already be closing */
    });
  } catch (error) {
    /* the modal may already be closing */
  }
}

function closeOverlay() {
  if (closing) {
    return;
  }
  closing = true;
  /* Tell the background at once, so a roll that arrives right after this
     closes opens a fresh overlay instead of waiting out the heartbeat
     (task 032: such a roll used to be dropped for up to ~5 s). */
  overlayChannel?.postMessage("overlay-closing");
  if (obrReady) {
    closeModal();
  }
}

/* Task 032b safety net. The background opens this page click-through
   (disablePointerEvents), so it should never receive a pointer event. If it
   ever does, this room's Owlbear is not passing clicks through the modal, and
   a full-screen overlay would block the whole screen for about 32 s after
   every roll. So the first such event closes the overlay, tells the
   background to leave it closed until the room reloads, and says why once.
   Rolls still reach the Room Rolls log and the Dice panel's roll line; only
   the 3D animation and the chips stop. The cost is one lost click. Nothing
   in this page makes pointer events of its own, so any one is the host's. */
const CLICK_THROUGH_FAILURE_EVENTS = ["pointerdown", "mousedown", "touchstart", "wheel"];
let clickThroughFailed = false;

function handleUnexpectedPointerEvent(event) {
  if (clickThroughFailed) {
    return;
  }
  clickThroughFailed = true;
  console.warn(`Angel Sword Dice overlay: this room is not passing clicks through the roll overlay (it got a ${event.type}). Closing the overlay and leaving it closed until the room reloads. Rolls still reach the Room Rolls log.`);
  overlayChannel?.postMessage({ kind: "overlay-blocks-clicks", event: event.type });
  closeOverlay();
}

CLICK_THROUGH_FAILURE_EVENTS.forEach((type) => {
  window.addEventListener(type, handleUnexpectedPointerEvent, { capture: true, passive: true });
});

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
  // The engine keeps (and hides) its one pooled canvas between rolls (task
  // 032 L4); only stray canvases are removed here.
  document.querySelectorAll(".accurate-dice-canvas:not([data-pooled])").forEach((canvas) => canvas.remove());
}

/* Task 008 (WS4) — roll sound, ported from the builder's
   playDiceAssetRollSounds/playDiceAudioElement/fadeOutDiceAudio/
   stopActiveDiceSounds (src/js/ui.js). Same asset(s), same choreography
   (a looping roll-bed that fades near the end, plus per-die staggered
   impact hits) and the same volume/timing formulas — reused as-is per the
   brief. Not a shared import: ui.js is the builder's ~8000-line monolith
   bundle with many builder-only dependencies, so pulling it into this
   extension's bundle would drag in unrelated code for one function. The
   builder's WebAudio-synthesis fallback (for when Audio/the mp3 assets
   are unavailable) is intentionally not ported — DICE_SOUND_ASSETS is
   always non-empty and Audio is universal in any real browser this
   overlay runs in, so that fallback path is unreachable here. */
function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function stopActiveDiceSounds() {
  diceAudioTimers.forEach((timer) => {
    window.clearTimeout(timer);
    window.clearInterval(timer);
  });
  diceAudioTimers = [];
  activeDiceAudioElements.forEach((audio) => {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (error) {
      /* browser-managed media cleanup can fail harmlessly */
    }
  });
  activeDiceAudioElements = [];
}

function playDiceAudioElement(src, options = {}) {
  if (typeof Audio === "undefined" || !src) {
    return null;
  }
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.loop = Boolean(options.loop);
  audio.volume = clampNumber(Number(options.volume) || 0.34, 0, 1);
  audio.playbackRate = clampNumber(Number(options.playbackRate) || 1, 0.65, 1.35);
  activeDiceAudioElements.push(audio);
  const removeAudio = () => {
    activeDiceAudioElements = activeDiceAudioElements.filter((entry) => entry !== audio);
  };
  audio.addEventListener("ended", removeAudio, { once: true });
  const startAudio = () => {
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch(removeAudio);
    }
  };
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  if (delayMs > 0) {
    const timer = window.setTimeout(startAudio, delayMs);
    diceAudioTimers.push(timer);
  } else {
    startAudio();
  }
  return audio;
}

function fadeOutDiceAudio(audio, startAfterMs, fadeMs) {
  if (!audio) {
    return;
  }
  const fadeTimer = window.setTimeout(() => {
    const initialVolume = audio.volume;
    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      const progress = clampNumber((performance.now() - startedAt) / Math.max(1, fadeMs), 0, 1);
      audio.volume = initialVolume * (1 - progress);
      if (progress >= 1) {
        window.clearInterval(interval);
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch (error) {
          /* playback may never have started */
        }
        activeDiceAudioElements = activeDiceAudioElements.filter((entry) => entry !== audio);
      }
    }, 45);
    diceAudioTimers.push(interval);
  }, Math.max(0, startAfterMs));
  diceAudioTimers.push(fadeTimer);
}

/* The trigger point: called from the engine's onSettle hook (real dice-
   physics "the roll has landed" event — assets/dice-3d/lyrian-accurate-
   dice.js already supports options.onSettle, forwarded verbatim by
   dice-roller-router.js), once per roll. Takes the overlay's own
   normalized per-die results (not the onSettle callback's own argument)
   so this stays decoupled from the engine's internal settled-result
   shape — this file only relies on the pre-existing public onSettle
   calling convention, nothing dice-core-internal. */
function playRollLandingSound(diceResults = []) {
  if (soundMuted()) {
    return;
  }
  const assets = diceSoundAssets();
  if (typeof Audio === "undefined" || !assets.rollBed) {
    return;
  }
  const dice = diceResults.slice(0, 24);
  if (!dice.length) {
    return;
  }
  stopActiveDiceSounds();
  const diceCount = Math.max(1, dice.length);
  const rollDurationMs = clampNumber(1800 + Math.sqrt(diceCount) * 520, 2300, 4300);
  const bedAudio = playDiceAudioElement(assets.rollBed, {
    loop: true,
    volume: clampNumber(0.23 + diceCount * 0.012, 0.22, 0.43),
    playbackRate: 0.96 + Math.random() * 0.08
  });
  fadeOutDiceAudio(bedAudio, rollDurationMs - 850, 850);
  const impactSrc = assets.impact || assets.rollBed;
  dice.forEach((entry, index) => {
    const hits = clampNumber(3 + Math.floor((Number(entry.sides) || 20) / 12), 3, 6);
    const dieOffset = index * 46 + Math.random() * 60;
    for (let hit = 0; hit < hits; hit += 1) {
      const delayMs = dieOffset + 140 + hit * (95 + Math.random() * 55);
      const volume = clampNumber((0.27 / Math.sqrt(diceCount)) * (1 - hit * 0.1) * (0.78 + Math.random() * 0.28), 0.04, 0.28);
      playDiceAudioElement(impactSrc, {
        delayMs,
        volume,
        playbackRate: 0.86 + Math.random() * 0.28
      });
    }
  });
}

function playRoll(rawEvent) {
  const event = normalizeRollEvent(rawEvent);
  if (!event || !replayEnabled() || closing) {
    // A closing overlay leaves the roll to the fresh one the background opens.
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
  clearTimeout(diceClearTimer);
  clearDiceCanvases();
  stopActiveDiceSounds();
  addChip(event);
  /* The modal is always full screen, so the canvas is sized right from the
     first frame (the old popover had to grow back from the chip strip
     before each roll, or the render stretched). */
  let animationMs = DICE_VISIBLE_MS;
  try {
    const reported = window.LyrianAccurateDiceRoller.rollDice({
      layer: document.getElementById("dice-flight-layer"),
      results,
      setId: selectedSetId(),
      width: window.innerWidth,
      height: window.innerHeight,
      // One WebGL context for every roll in this overlay (task 032 L4).
      reuseRenderer: true,
      onSettle: () => {
        if (generation === rollGeneration) {
          playRollLandingSound(results);
        }
      }
    });
    if (Number.isFinite(Number(reported)) && Number(reported) > 0) {
      animationMs = Math.min(Number(reported), 12000);
    }
  } catch (error) {
    /* chips still record the result even if the 3D flight fails */
  }
  animatingUntil = Date.now() + animationMs;
  diceClearTimer = setTimeout(() => {
    clearDiceCanvases();
    scheduleIdleCheck();
  }, Math.min(animationMs, DICE_VISIBLE_MS));
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
    if (closing) {
      // Closed (safety net or engine error) before the SDK was ready.
      closeModal();
      return;
    }
    OBR.broadcast.onMessage(ROLL_CHANNEL, (broadcastEvent) => playRoll(broadcastEvent.data));
    overlayChannel?.postMessage("overlay-ready");
    scheduleIdleCheck();
  });
}
