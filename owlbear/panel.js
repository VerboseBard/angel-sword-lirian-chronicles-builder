import {
  PLAYER_BINDING_KEY,
  RELAY_CHANNEL,
  ROLL_CHANNEL,
  ROOM_LOG_KEY,
  TOKEN_BINDING_KEY,
  createBindingRecord,
  mergeRollLog,
  normalizeCharacterExport,
  normalizeRollEvent
} from "./core.js";
import { loadOwlbearSdk } from "./sdk.js";

const CHARACTER_STORAGE_KEY = "asb.owlbear.character.v1";
const MAX_RENDERED_ROLLS = 60;

const statusChip = document.getElementById("status");
const fileInput = document.getElementById("character-file");
const characterCard = document.getElementById("character-card");
const characterSummary = document.getElementById("character-summary");
const bindButton = document.getElementById("bind-token");
const clearBindingButton = document.getElementById("clear-binding");
const bindingSummary = document.getElementById("binding-summary");
const testRollButton = document.getElementById("test-roll");
const feedback = document.getElementById("feedback");
const feed = document.getElementById("feed");
const empty = document.getElementById("empty");

let obrApi = null;
let activeCharacter = null;
let activeBinding = null;
let playerRecord = null;
const renderedRollIds = new Set();

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("is-error", Boolean(isError));
}

function renderCharacter() {
  characterCard.hidden = !activeCharacter;
  bindButton.disabled = !(activeCharacter && obrApi);
  testRollButton.disabled = !(activeCharacter && obrApi);
  if (!activeCharacter) {
    characterSummary.replaceChildren();
    return;
  }
  const resources = activeCharacter.resources || {};
  const tags = [activeCharacter.race, activeCharacter.ancestry, ...(activeCharacter.classes || [])]
    .filter(Boolean)
    .map((entry) => `<span class="tag">${esc(entry)}</span>`)
    .join("");
  characterSummary.innerHTML = `
    <div class="character-name">${esc(activeCharacter.name)}</div>
    <div class="tags">${tags || '<span class="tag">No class labels in export</span>'}</div>
    <div class="resources">
      <div class="resource"><strong>${esc(resources.hpCurrent)}/${esc(resources.hpMax)}</strong>HP</div>
      <div class="resource"><strong>${esc(resources.manaCurrent)}/${esc(resources.manaMax)}</strong>Mana</div>
      <div class="resource"><strong>${esc(resources.apCurrent)}/${esc(resources.apMax)}</strong>AP</div>
      <div class="resource"><strong>${esc(resources.rpCurrent)}/${esc(resources.rpMax)}</strong>RP</div>
    </div>`;
}

function renderBinding() {
  clearBindingButton.disabled = !(activeBinding && obrApi);
  bindingSummary.textContent = activeBinding
    ? `${activeBinding.characterName} is bound to ${activeBinding.tokenName}.`
    : "No character-token binding yet.";
}

function describeRoll(event) {
  const identity = [event.character, event.playerName].filter(Boolean).join(" · ");
  return [
    identity ? `<span class="who">${esc(identity)}</span>` : "",
    `<div><strong>${esc(event.label || event.kind || "Roll")}</strong>${event.weapon ? ` — ${esc(event.weapon)}` : ""}</div>`,
    event.formula ? `<div>${esc(event.formula)}</div>` : "",
    event.breakdown ? `<div>${esc(event.breakdown)}</div>` : "",
    `<div class="total">Total ${esc(event.total)}</div>`
  ].filter(Boolean).join("");
}

function appendRoll(rawEvent) {
  const event = normalizeRollEvent(rawEvent);
  if (!event || renderedRollIds.has(event.id)) {
    return;
  }
  renderedRollIds.add(event.id);
  empty.hidden = true;
  feed.hidden = false;
  const item = document.createElement("li");
  item.dataset.rollId = event.id;
  item.innerHTML = describeRoll(event);
  feed.prepend(item);
  while (feed.children.length > MAX_RENDERED_ROLLS) {
    const removed = feed.lastElementChild;
    renderedRollIds.delete(removed?.dataset.rollId);
    removed?.remove();
  }
}

function renderRoomLog(log) {
  (Array.isArray(log) ? [...log].reverse() : []).forEach(appendRoll);
}

async function readCharacterFile(file) {
  const parsed = JSON.parse(await file.text());
  activeCharacter = normalizeCharacterExport(parsed);
  localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(activeCharacter));
  renderCharacter();
  setFeedback(`Imported ${activeCharacter.name}. Select its Owlbear token next.`);
}

async function bindSelectedToken() {
  if (!obrApi || !activeCharacter || !playerRecord) {
    setFeedback("Connect to an Owlbear room and import a character first.", true);
    return;
  }
  try {
    const selection = await obrApi.player.getSelection();
    if (!Array.isArray(selection) || selection.length !== 1) {
      throw new Error("Select exactly one Owlbear character token.");
    }
    const [item] = await obrApi.scene.items.getItems(selection);
    if (!item || item.layer !== "CHARACTER") {
      throw new Error("The selected item must be on Owlbear's Character layer.");
    }
    const existing = item.metadata?.[TOKEN_BINDING_KEY];
    if (existing?.ownerPlayerId && existing.ownerPlayerId !== playerRecord.id && playerRecord.role !== "GM") {
      throw new Error(`That token is already bound to ${existing.characterName || "another character"}.`);
    }
    const record = createBindingRecord(activeCharacter, playerRecord, item);
    await obrApi.scene.items.updateItems([item.id], (items) => {
      for (const draft of items) {
        draft.metadata[TOKEN_BINDING_KEY] = record;
      }
    });
    await obrApi.player.setMetadata({ [PLAYER_BINDING_KEY]: record });
    activeBinding = record;
    renderBinding();
    setFeedback(`Bound ${record.characterName} to ${record.tokenName}.`);
  } catch (error) {
    setFeedback(error.message || "The token could not be bound.", true);
  }
}

async function clearBinding() {
  if (!obrApi || !activeBinding) {
    return;
  }
  try {
    const items = await obrApi.scene.items.getItems([activeBinding.tokenId]);
    if (items.length) {
      await obrApi.scene.items.updateItems(items, (drafts) => {
        for (const draft of drafts) {
          const existing = draft.metadata?.[TOKEN_BINDING_KEY];
          if (playerRecord?.role === "GM" || existing?.ownerPlayerId === playerRecord?.id) {
            delete draft.metadata[TOKEN_BINDING_KEY];
          }
        }
      });
    }
    await obrApi.player.setMetadata({ [PLAYER_BINDING_KEY]: null });
    activeBinding = null;
    renderBinding();
    setFeedback("Cleared your Angel Sword token binding.");
  } catch (error) {
    setFeedback(error.message || "The binding could not be cleared.", true);
  }
}

async function persistRoomRoll(event) {
  const metadata = await obrApi.room.getMetadata();
  const next = mergeRollLog(metadata?.[ROOM_LOG_KEY], event);
  await obrApi.room.setMetadata({ [ROOM_LOG_KEY]: next });
}

async function sendTestRoll() {
  if (!obrApi || !activeCharacter) {
    return;
  }
  const result = Math.floor(Math.random() * 20) + 1;
  const event = normalizeRollEvent({
    kind: "connection-test",
    character: activeCharacter.name,
    characterId: activeCharacter.characterId,
    playerId: playerRecord?.id,
    playerName: playerRecord?.name,
    label: "Owlbear Connection Test",
    formula: "1d20",
    breakdown: `d20: ${result}`,
    total: result
  });
  try {
    await obrApi.broadcast.sendMessage(ROLL_CHANNEL, event, { destination: "ALL" });
    await persistRoomRoll(event);
    setFeedback(`Shared a test roll of ${result} with the room.`);
  } catch (error) {
    setFeedback(error.message || "The test roll could not be shared.", true);
  }
}

function connectStandaloneRelay() {
  if (typeof BroadcastChannel !== "function") {
    return;
  }
  const channel = new BroadcastChannel(RELAY_CHANNEL);
  channel.addEventListener("message", (messageEvent) => {
    if (!obrApi) {
      appendRoll(messageEvent.data);
    }
  });
}

async function connectOwlbear() {
  const OBR = await loadOwlbearSdk();
  if (!OBR) {
    setFeedback("Opened outside an Owlbear room. Import preview is available; room binding is not.");
    return;
  }
  OBR.onReady(async () => {
    obrApi = OBR;
    const [name, role, metadata] = await Promise.all([
      OBR.player.getName(),
      OBR.player.getRole(),
      OBR.player.getMetadata()
    ]);
    playerRecord = { id: OBR.player.id || await OBR.player.getId(), name, role };
    activeBinding = metadata?.[PLAYER_BINDING_KEY] || null;
    statusChip.textContent = `${role === "GM" ? "GM" : "Player"} connected`;
    statusChip.classList.add("is-live");
    renderCharacter();
    renderBinding();
    const roomMetadata = await OBR.room.getMetadata();
    renderRoomLog(roomMetadata?.[ROOM_LOG_KEY]);
    OBR.broadcast.onMessage(ROLL_CHANNEL, (broadcastEvent) => appendRoll(broadcastEvent.data));
    OBR.room.onMetadataChange((room) => renderRoomLog(room?.[ROOM_LOG_KEY]));
  });
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((entry) => entry.setAttribute("aria-selected", String(entry === button)));
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== button.dataset.tab;
    });
  });
});

fileInput.addEventListener("change", async () => {
  const [file] = fileInput.files;
  if (!file) {
    return;
  }
  try {
    await readCharacterFile(file);
  } catch (error) {
    setFeedback(error.message || "The character file could not be imported.", true);
  } finally {
    fileInput.value = "";
  }
});

bindButton.addEventListener("click", bindSelectedToken);
clearBindingButton.addEventListener("click", clearBinding);
testRollButton.addEventListener("click", sendTestRoll);

try {
  const stored = JSON.parse(localStorage.getItem(CHARACTER_STORAGE_KEY) || "null");
  if (stored?.characterId && stored?.name) {
    activeCharacter = stored;
  }
} catch (error) {
  localStorage.removeItem(CHARACTER_STORAGE_KEY);
}

renderCharacter();
renderBinding();
connectStandaloneRelay();
connectOwlbear();
