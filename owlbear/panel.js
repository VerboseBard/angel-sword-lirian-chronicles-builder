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
import { buildImage, buildImageUpload } from "@owlbear-rodeo/sdk";

const CHARACTER_STORAGE_KEY = "asb.owlbear.character.v1";
const TOKEN_IMAGE_KEY = "asb.owlbear.tokenImage.v1";
const HANDOFF_CONSUMED_KEY = "asb.owlbear.handoff.consumed.v1";
const HANDOFF_CLEARED_AT_KEY = "asb.owlbear.clearedAt.v1";
const MAX_RENDERED_ROLLS = 60;

const statusChip = document.getElementById("status");
const fileInput = document.getElementById("character-file");
const characterCard = document.getElementById("character-card");
const characterSummary = document.getElementById("character-summary");
const placeButton = document.getElementById("place-token");
const downloadTokenButton = document.getElementById("download-token");
const clearCharacterButton = document.getElementById("clear-character");
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
let tokenImageDataUrl = null;
let tokenImageFullDataUrl = null;
let tokenImagePlaceUrl = null;
let handoffCursor = null;
const renderedRollIds = new Set();

function isDevRelayHost() {
  return /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
}

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
  renderPlaceButton();
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

function renderPlaceButton() {
  placeButton.hidden = !(activeCharacter && obrApi && tokenImageFullDataUrl);
  downloadTokenButton.hidden = !(activeCharacter && tokenImageFullDataUrl);
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

function readConsumedHandoffs() {
  try {
    const stored = JSON.parse(localStorage.getItem(HANDOFF_CONSUMED_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    return [];
  }
}

function applyHandoff(event, consumed) {
  try {
    const normalized = normalizeCharacterExport(event.character);
    activeCharacter = normalized;
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(normalized));
    tokenImageDataUrl = event.tokenImages?.sync || null;
    tokenImageFullDataUrl = event.tokenImages?.full || tokenImageDataUrl;
    tokenImagePlaceUrl = event.tokenImageUrl || null;
    if (tokenImageDataUrl) {
      localStorage.setItem(TOKEN_IMAGE_KEY, JSON.stringify({
        characterId: normalized.characterId,
        dataUrl: tokenImageDataUrl,
        fullDataUrl: tokenImageFullDataUrl,
        placeUrl: tokenImagePlaceUrl
      }));
    }
    consumed.push(event.id);
    localStorage.setItem(HANDOFF_CONSUMED_KEY, JSON.stringify(consumed.slice(-50)));
    renderCharacter();
    setFeedback(`${normalized.name} arrived from the builder at ${new Date(Number(event.ts) || Date.now()).toLocaleTimeString()}.${tokenImageDataUrl && obrApi ? " Place My Token is ready." : ""}`);
  } catch (error) {
    setFeedback(error.message || "A character arrived from the builder but could not be read.", true);
  }
}

function clearImportedCharacter() {
  activeCharacter = null;
  tokenImageDataUrl = null;
  tokenImageFullDataUrl = null;
  tokenImagePlaceUrl = null;
  try {
    localStorage.removeItem(CHARACTER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_IMAGE_KEY);
    localStorage.setItem(HANDOFF_CLEARED_AT_KEY, String(Date.now()));
  } catch (error) {
    /* storage may be unavailable; the in-memory clear still applies */
  }
  renderCharacter();
  setFeedback("Cleared the imported character. Only sends newer than this moment will import. Token bindings stay until you use Clear My Binding.");
}

async function pollHandoffsOnce() {
  try {
    const query = handoffCursor
      ? `?boot=${encodeURIComponent(handoffCursor.boot)}&since=${handoffCursor.seq}`
      : "";
    const response = await fetch(`/api/vtt-relay/events${query}`);
    const data = await response.json();
    if (!data?.ok) {
      return;
    }
    handoffCursor = { boot: data.boot, seq: data.seq };
    const consumed = readConsumedHandoffs();
    let clearedAt = 0;
    try {
      clearedAt = Number(localStorage.getItem(HANDOFF_CLEARED_AT_KEY) || 0);
    } catch (error) {
      clearedAt = 0;
    }
    const handoffs = (data.events || []).filter((entry) => entry?.kind === "character-handoff"
      && entry.id
      && !consumed.includes(entry.id)
      && (!clearedAt || Number(entry.ts) > clearedAt));
    if (handoffs.length) {
      applyHandoff(handoffs[handoffs.length - 1], consumed);
    }
  } catch (error) {
    // The local builder server may be offline; keep trying quietly.
  }
}

function describePlacementError(error) {
  let reason = error?.message || error?.error?.message;
  if (!reason) {
    try {
      reason = JSON.stringify(error).slice(0, 200);
    } catch (stringifyError) {
      reason = String(error);
    }
  }
  return reason;
}

async function placeMyToken() {
  if (!obrApi || !activeCharacter || !tokenImageFullDataUrl || !playerRecord) {
    return;
  }
  const tokenName = `${activeCharacter.name} Token`;
  try {
    const blob = dataUrlToBlob(tokenImageFullDataUrl);
    const sizePixels = 720;
    const upload = buildImageUpload(blob)
      .name(tokenName)
      .dpi(sizePixels)
      .offset({ x: sizePixels / 2, y: sizePixels / 2 })
      .build();
    setFeedback("Saving your token to Owlbear's asset library…");
    await obrApi.assets.uploadImages([upload], "CHARACTER");
  } catch (error) {
    console.error("Angel Sword token upload failed:", error);
    setFeedback(`The token could not be saved to Owlbear (${describePlacementError(error)}). Fallback: Download Token Image, add the file to Owlbear's asset library as a Character, drag it in, and press Bind Selected Token.`, true);
    return;
  }
  try {
    setFeedback(`Pick ${tokenName} in Owlbear's dialog to place it.`);
    const picks = await obrApi.assets.downloadImages(false, tokenName, "CHARACTER");
    const pick = Array.isArray(picks) ? picks[0] : null;
    if (!pick?.image?.url) {
      setFeedback(`${tokenName} is saved in your Owlbear Characters library — drag it onto the scene and press Bind Selected Token.`);
      return;
    }
    if (!(await obrApi.scene.isReady())) {
      setFeedback(`${tokenName} is in your library. Open a scene, drag it in, and press Bind Selected Token.`);
      return;
    }
    const [width, height] = await Promise.all([obrApi.viewport.getWidth(), obrApi.viewport.getHeight()]);
    const center = await obrApi.viewport.inverseTransformPoint({ x: width / 2, y: height / 2 });
    const item = buildImage(pick.image, pick.grid)
      .layer("CHARACTER")
      .name(activeCharacter.name)
      .position(center)
      .build();
    const record = createBindingRecord(activeCharacter, playerRecord, item);
    item.metadata[TOKEN_BINDING_KEY] = record;
    await obrApi.scene.items.addItems([item]);
    await obrApi.player.setMetadata({ [PLAYER_BINDING_KEY]: record });
    activeBinding = record;
    renderBinding();
    setFeedback(`Placed and bound ${record.characterName} from your Owlbear library.`);
  } catch (error) {
    console.error("Angel Sword library placement failed:", error);
    setFeedback(`${tokenName} is saved in your Owlbear library — drag it onto the scene and press Bind Selected Token.`);
  }
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("The token image data could not be read.");
  }
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: match[1] });
}

function downloadTokenImage() {
  if (!tokenImageFullDataUrl || !activeCharacter) {
    return;
  }
  const link = document.createElement("a");
  link.href = tokenImageFullDataUrl;
  const extension = tokenImageFullDataUrl.startsWith("data:image/webp") ? "webp" : "png";
  link.download = `${String(activeCharacter.name || "token").replace(/[^\w-]+/g, "-")}-token.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function restoreBindingFromScene() {
  if (activeBinding || !obrApi || !playerRecord) {
    return;
  }
  try {
    const items = await obrApi.scene.items.getItems();
    const bound = items
      .map((item) => ({ item, record: item.metadata?.[TOKEN_BINDING_KEY] }))
      .filter((entry) => entry.record);
    const mine = bound.find((entry) => entry.record.ownerPlayerId === playerRecord.id)
      || bound.find((entry) => activeCharacter && entry.record.characterId === activeCharacter.characterId);
    if (!mine) {
      return;
    }
    activeBinding = mine.record;
    await obrApi.player.setMetadata({ [PLAYER_BINDING_KEY]: activeBinding });
    renderBinding();
    setFeedback(`Restored binding: ${activeBinding.characterName} is bound to ${activeBinding.tokenName}.`);
  } catch (error) {
    // The scene may not be open yet; onReadyChange retries.
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
    if (await OBR.scene.isReady()) {
      await restoreBindingFromScene();
    }
    OBR.scene.onReadyChange((ready) => {
      if (ready) {
        restoreBindingFromScene();
      }
    });
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

placeButton.addEventListener("click", placeMyToken);
downloadTokenButton.addEventListener("click", downloadTokenImage);
clearCharacterButton.addEventListener("click", clearImportedCharacter);
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
try {
  const storedToken = JSON.parse(localStorage.getItem(TOKEN_IMAGE_KEY) || "null");
  if (storedToken?.dataUrl && storedToken.characterId === activeCharacter?.characterId) {
    tokenImageDataUrl = storedToken.dataUrl;
    tokenImageFullDataUrl = storedToken.fullDataUrl || storedToken.dataUrl;
    tokenImagePlaceUrl = storedToken.placeUrl || null;
  }
} catch (error) {
  localStorage.removeItem(TOKEN_IMAGE_KEY);
}

renderCharacter();
renderBinding();
connectStandaloneRelay();
connectOwlbear();
if (isDevRelayHost()) {
  pollHandoffsOnce();
  setInterval(pollHandoffsOnce, 2500);
}
