import OBR from "@owlbear-rodeo/sdk";
import { ROLL_CHANNEL, ROOM_LOG_KEY, mergeRollLog, normalizeRollEvent } from "../owlbear/core.js";

const SET_STORAGE_KEY = "asb.dice.selectedSet.v1";
const DEFAULT_SET = { id: "new-angelsword", name: "Angel Sword" };
const DICE_TYPES = [20, 12, 100, 10, 8, 6, 4];
const MAX_QUEUED = 12;

const statusChip = document.getElementById("status");
const setSelect = document.getElementById("dice-set");
const diceButtonsHost = document.getElementById("dice-buttons");
const resetButton = document.getElementById("dice-reset");
const rollButton = document.getElementById("dice-roll");
const replayToggle = document.getElementById("replay-toggle");
const feedback = document.getElementById("feedback");
const flightLayer = document.getElementById("dice-flight-layer");

let obrApi = null;
let playerRecord = null;
let runtimeReady = false;
const queue = new Map();
const seenRollIds = new Set();

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("is-error", Boolean(isError));
}

function rememberRoll(id) {
  if (!id || seenRollIds.has(id)) {
    return false;
  }
  seenRollIds.add(id);
  if (seenRollIds.size > 300) {
    seenRollIds.delete(seenRollIds.values().next().value);
  }
  return true;
}

function getSelectedSetId() {
  return setSelect.value || DEFAULT_SET.id;
}

function populateSets() {
  const promoted = (window.LYRIAN_PROMOTED_DICE_SKINS || [])
    .filter((pack) => pack?.id)
    .map((pack) => ({ id: String(pack.id), name: String(pack.name || pack.id) }));
  const sets = [DEFAULT_SET, ...promoted.filter((pack) => pack.id !== DEFAULT_SET.id)];
  let stored = "";
  try {
    stored = localStorage.getItem(SET_STORAGE_KEY) || "";
  } catch (error) {
    stored = "";
  }
  setSelect.replaceChildren(...sets.map((set) => {
    const option = document.createElement("option");
    option.value = set.id;
    option.textContent = set.name;
    option.selected = set.id === stored;
    return option;
  }));
}

function totalQueued() {
  let total = 0;
  queue.forEach((count) => {
    total += count;
  });
  return total;
}

function renderQueue() {
  diceButtonsHost.querySelectorAll("button[data-sides]").forEach((button) => {
    const count = queue.get(Number(button.dataset.sides)) || 0;
    const badge = button.querySelector(".count");
    if (count) {
      if (badge) {
        badge.textContent = String(count);
      } else {
        const span = document.createElement("span");
        span.className = "count";
        span.textContent = String(count);
        button.appendChild(span);
      }
    } else if (badge) {
      badge.remove();
    }
  });
  const total = totalQueued();
  resetButton.disabled = !total;
  rollButton.disabled = !total || !runtimeReady;
  rollButton.textContent = total ? `Roll ${total} ${total === 1 ? "die" : "dice"}` : "Roll";
}

function buildDiceButtons() {
  diceButtonsHost.replaceChildren(...DICE_TYPES.map((sides) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.sides = String(sides);
    button.textContent = `d${sides}`;
    button.addEventListener("click", () => {
      if (totalQueued() >= MAX_QUEUED) {
        setFeedback(`No more than ${MAX_QUEUED} dice per roll.`, true);
        return;
      }
      queue.set(sides, (queue.get(sides) || 0) + 1);
      renderQueue();
    });
    return button;
  }));
}

function animateResults(results) {
  if (!runtimeReady || !results.length) {
    return false;
  }
  try {
    return window.LyrianAccurateDiceRoller.rollDice({
      layer: flightLayer,
      results,
      setId: getSelectedSetId(),
      width: window.innerWidth,
      height: window.innerHeight
    });
  } catch (error) {
    console.error("Angel Sword Dice replay failed:", error);
    return false;
  }
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
  return results.slice(0, MAX_QUEUED * 2);
}

function replayRoomRoll(rawEvent) {
  const event = normalizeRollEvent(rawEvent);
  if (!event || !rememberRoll(event.id) || !replayToggle.checked) {
    return;
  }
  const results = parseBreakdown(event);
  if (!results.length) {
    return;
  }
  animateResults(results);
  const who = [event.character, event.playerName].filter(Boolean).join(" · ");
  setFeedback(`${who || "The room"} rolled ${event.label || "dice"}: total ${event.total}.`);
}

async function shareLocalRoll(results, total, formula, breakdown) {
  const event = normalizeRollEvent({
    kind: "dice",
    label: "Angel Sword Dice",
    formula,
    breakdown,
    total,
    character: playerRecord?.name,
    playerId: playerRecord?.id,
    playerName: playerRecord?.name
  });
  if (!event) {
    return;
  }
  rememberRoll(event.id);
  if (!obrApi) {
    return;
  }
  try {
    await obrApi.broadcast.sendMessage(ROLL_CHANNEL, event, { destination: "ALL" });
    const metadata = await obrApi.room.getMetadata();
    await obrApi.room.setMetadata({ [ROOM_LOG_KEY]: mergeRollLog(metadata?.[ROOM_LOG_KEY], event) });
  } catch (error) {
    // A closing room must never interrupt the local roll animation.
  }
}

function rollQueued() {
  if (!runtimeReady || !totalQueued()) {
    return;
  }
  const results = [];
  const formulaParts = [];
  DICE_TYPES.forEach((sides) => {
    const count = queue.get(sides) || 0;
    if (!count) {
      return;
    }
    formulaParts.push(`${count}d${sides}`);
    for (let index = 0; index < count; index += 1) {
      results.push({ sides, value: Math.floor(Math.random() * sides) + 1 });
    }
  });
  const total = results.reduce((sum, entry) => sum + entry.value, 0);
  const breakdown = results.map((entry) => `d${entry.sides}: ${entry.value}`).join(" | ");
  animateResults(results);
  setFeedback(`Rolled ${formulaParts.join(" + ")}: total ${total}.`);
  shareLocalRoll(results, total, formulaParts.join(" + "), breakdown);
  queue.clear();
  renderQueue();
}

setSelect.addEventListener("change", () => {
  try {
    localStorage.setItem(SET_STORAGE_KEY, getSelectedSetId());
  } catch (error) {
    /* remembering the set is a convenience only */
  }
  try {
    window.LyrianAccurateDiceRoller?.preloadFaceArt?.(getSelectedSetId());
  } catch (error) {
    /* preloading is best-effort */
  }
});

resetButton.addEventListener("click", () => {
  queue.clear();
  renderQueue();
});
rollButton.addEventListener("click", rollQueued);

window.addEventListener("asd-dice-runtime-ready", () => {
  runtimeReady = true;
  populateSets();
  renderQueue();
  if (!obrApi) {
    statusChip.textContent = "Standalone preview";
  }
  setFeedback("Dice engine ready.");
  try {
    window.LyrianAccurateDiceRoller?.preloadFaceArt?.(getSelectedSetId());
  } catch (error) {
    /* preloading is best-effort */
  }
});

window.addEventListener("asd-dice-runtime-error", () => {
  statusChip.textContent = "Engine failed";
  setFeedback(`The dice engine could not load (${window.ASD_DICE_RUNTIME_ERROR || "unknown reason"}).`, true);
});

async function connectOwlbear() {
  if (!OBR?.onReady) {
    return;
  }
  OBR.onReady(async () => {
    obrApi = OBR;
    const [name, role] = await Promise.all([OBR.player.getName(), OBR.player.getRole()]);
    playerRecord = { id: OBR.player.id || (await OBR.player.getId()), name, role };
    statusChip.textContent = `${role === "GM" ? "GM" : "Player"} connected`;
    statusChip.classList.add("is-live");
    OBR.broadcast.onMessage(ROLL_CHANNEL, (broadcastEvent) => replayRoomRoll(broadcastEvent.data));
  });
}

buildDiceButtons();
renderQueue();
populateSets();
connectOwlbear();
