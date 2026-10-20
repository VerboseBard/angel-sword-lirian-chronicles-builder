import {
  CHARACTER_SCHEMA_VERSION,
  PLAYER_BINDING_KEY,
  RELAY_CHANNEL,
  ROLL_CHANNEL,
  ROLL_SCHEMA_VERSION,
  ROOM_LOG_KEY,
  TOKEN_BINDING_KEY,
  characterSchemaNote,
  createBindingRecord,
  describeNewerSchema,
  isNewerSchema,
  mergeRollLog,
  normalizeCharacterExport,
  normalizeRollEvent,
  pickRestorableBinding,
  readSchemaVersion,
  refreshBindingRecord,
  tokenGridForOneSquare
} from "./core.js";
import { loadOwlbearSdk } from "./sdk.js";
import { buildImage } from "@owlbear-rodeo/sdk";
import { createOwlbearOpenerBridge } from "./opener-bridge.js";
import { OPENER_STATES } from "./core.js";

const CHARACTER_STORAGE_KEY = "asb.owlbear.character.v1";
const TOKEN_IMAGE_KEY = "asb.owlbear.tokenImage.v1";
const HANDOFF_CONSUMED_KEY = "asb.owlbear.handoff.consumed.v1";
const HANDOFF_CLEARED_AT_KEY = "asb.owlbear.clearedAt.v1";
const SHEET_BRIDGE_SEEN_KEY = "asb.owlbear.sheetBridge.seenAt.v1";
const SHEET_BRIDGE_RECONNECT_WINDOW_MS = 6 * 60 * 60 * 1000;
const MAX_RENDERED_ROLLS = 60;
/* Task 031 (owner flow, 2026-10-18): the first token comes from Download
   Token Image + a drag onto the map; Place My Token only picks from the
   player's Owlbear library. */
const PLACE_TOKEN_FIRST_TIME_HELP = "Drag your downloaded token onto the map first, choose Character, then try again.";
/* Task 031b (031 audit finding 3): the SDK call that opens Owlbear's picker,
   assets.downloadImages, has no timeout at all (it waits for the player as
   long as it takes). If the player dismisses the picker and Owlbear never
   answers, Place My Token would stay disabled until the panel reloads. So the
   button comes back when the picker answers or after this long, whichever is
   first. 45 s: opening the picker, looking at the list and clicking a token
   takes a person 5 to 15 s, so 45 s is three times that and a slow but real
   pick still lands; it is also short enough that a player whose button is
   stuck gets it back before giving up on the panel. A pick made after the
   watchdog is ignored (see placeMyToken). */
const PLACE_TOKEN_WATCHDOG_MS = 45000;

const statusChip = document.getElementById("status");
const openSheetButton = document.getElementById("open-sheet");
const sheetLinkStatus = document.getElementById("sheet-link-status");
const sheetLinkStatusRolls = document.getElementById("sheet-link-status-rolls");
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
let handoffCursor = null;
let relayChannel = null;
let placeTokenInFlight = false;
/* Counts Place My Token runs; the watchdog bumps it to abandon a run. */
let placeTokenRun = 0;
let newerRollNoteShown = false;
const renderedRollIds = new Set();

function ensureRelayChannel() {
  if (!relayChannel && typeof BroadcastChannel === "function") {
    try {
      relayChannel = new BroadcastChannel(RELAY_CHANNEL);
    } catch (error) {
      relayChannel = null;
    }
  }
  return relayChannel;
}

function resolveBuilderUrl() {
  return new URL("..", window.location.href).href;
}

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
  if (!newerRollNoteShown && isNewerSchema(rawEvent, ROLL_SCHEMA_VERSION)) {
    newerRollNoteShown = true;
    setFeedback(describeNewerSchema("A shared roll", readSchemaVersion(rawEvent), ROLL_SCHEMA_VERSION));
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

/* Joins a status sentence and optional notes into one feedback line. */
function joinFeedback(...parts) {
  return parts.filter(Boolean).join(" ");
}

async function readCharacterFile(file) {
  const parsed = JSON.parse(await file.text());
  const normalized = normalizeCharacterExport(parsed);
  activeCharacter = normalized;
  localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(activeCharacter));
  renderCharacter();
  const message = joinFeedback(`Imported ${normalized.name}.`, characterSchemaNote(parsed));
  setFeedback(message);
  refreshActiveBinding(normalized, message);
}

/* Task 031 (audit C5): when the same character arrives again and this player
   owns the active binding, copy the new numbers onto the binding (token
   metadata and player metadata). The token itself is not moved or rebound. */
async function refreshActiveBinding(character, message) {
  if (!obrApi || !playerRecord || !activeBinding) {
    return false;
  }
  if (isNewerSchema(activeBinding, CHARACTER_SCHEMA_VERSION)
    && activeBinding.characterId === character?.characterId
    && activeBinding.ownerPlayerId === playerRecord.id) {
    setFeedback(joinFeedback(message, describeNewerSchema("Your token binding", readSchemaVersion(activeBinding), CHARACTER_SCHEMA_VERSION), "Its numbers were not changed."));
    return false;
  }
  const next = refreshBindingRecord(activeBinding, character, playerRecord.id);
  if (!next) {
    /* Task 031b (031 audit finding 4): the token's character id is a hash of
       name, race, ancestry and classes, so a rename or a class change looks
       like another character and the refresh is refused. Say so, once, and
       never rebind on the player's behalf. It may also be a different
       character altogether, so the wording does not claim more than that. */
    if (character?.characterId && activeBinding.characterId !== character.characterId) {
      setFeedback(joinFeedback(message, `This may be a new version of ${activeBinding.characterName || "your bound character"}. To link it, select your token and press Bind Selected Token.`));
    }
    return false;
  }
  try {
    const [item] = await obrApi.scene.items.getItems([next.tokenId]);
    let tokenUpdated = false;
    if (item) {
      await obrApi.scene.items.updateItems([next.tokenId], (drafts) => {
        for (const draft of drafts) {
          const existing = draft.metadata?.[TOKEN_BINDING_KEY];
          if (existing?.ownerPlayerId === playerRecord.id && existing.characterId === next.characterId) {
            draft.metadata[TOKEN_BINDING_KEY] = next;
            tokenUpdated = true;
          }
        }
      });
    }
    await obrApi.player.setMetadata({ [PLAYER_BINDING_KEY]: next });
    activeBinding = next;
    renderBinding();
    if (tokenUpdated) {
      setFeedback(joinFeedback(message, `Updated the numbers on your token ${next.tokenName}.`));
    }
    return true;
  } catch (error) {
    setFeedback(joinFeedback(message, "Your token's numbers could not be updated; press Bind Selected Token to refresh them."), true);
    return false;
  }
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

/* One shared gate for every handoff transport (dev relay poll, opener
   bridge): unconsumed, and newer than the player's last Clear Character. */
function shouldApplyHandoff(event, consumed) {
  if (!event || event.kind !== "character-handoff" || !event.id || consumed.includes(event.id)) {
    return false;
  }
  let clearedAt = 0;
  try {
    clearedAt = Number(localStorage.getItem(HANDOFF_CLEARED_AT_KEY) || 0);
  } catch (error) {
    clearedAt = 0;
  }
  return !clearedAt || Number(event.ts) > clearedAt;
}

function applyHandoff(event, consumed) {
  try {
    const normalized = normalizeCharacterExport(event.character);
    activeCharacter = normalized;
    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(normalized));
    tokenImageDataUrl = event.tokenImages?.sync || null;
    tokenImageFullDataUrl = event.tokenImages?.full || tokenImageDataUrl;
    if (tokenImageDataUrl) {
      localStorage.setItem(TOKEN_IMAGE_KEY, JSON.stringify({
        characterId: normalized.characterId,
        dataUrl: tokenImageDataUrl,
        fullDataUrl: tokenImageFullDataUrl
      }));
    }
    consumed.push(event.id);
    localStorage.setItem(HANDOFF_CONSUMED_KEY, JSON.stringify(consumed.slice(-50)));
    renderCharacter();
    const message = joinFeedback(
      `${normalized.name} arrived from the builder at ${new Date(Number(event.ts) || Date.now()).toLocaleTimeString()}.`,
      tokenImageFullDataUrl ? "Your token picture is ready: use Download Token Image the first time." : "",
      characterSchemaNote(event.character)
    );
    setFeedback(message);
    refreshActiveBinding(normalized, message);
    return true;
  } catch (error) {
    setFeedback(error.message || "A character arrived from the builder but could not be read.", true);
    return false;
  }
}

function clearImportedCharacter() {
  activeCharacter = null;
  tokenImageDataUrl = null;
  tokenImageFullDataUrl = null;
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
    const handoffs = (data.events || []).filter((entry) => shouldApplyHandoff(entry, consumed));
    if (handoffs.length) {
      applyHandoff(handoffs[handoffs.length - 1], consumed);
    }
  } catch (error) {
    // The local builder server may be offline; keep trying quietly.
  }
}

async function pickTokenFromLibrary(tokenName) {
  const picks = await obrApi.assets.downloadImages(false, tokenName);
  const pick = Array.isArray(picks) ? picks[0] : null;
  return pick?.image?.url ? pick : null;
}

async function placePickedToken(pick) {
  if (!(await obrApi.scene.isReady())) {
    setFeedback("Open an Owlbear scene first, then press Place My Token again.", true);
    return false;
  }
  const [width, height] = await Promise.all([obrApi.viewport.getWidth(), obrApi.viewport.getHeight()]);
  const center = await obrApi.viewport.inverseTransformPoint({ x: width / 2, y: height / 2 });
  const item = buildImage(pick.image, tokenGridForOneSquare(pick.image, pick.grid))
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
  return true;
}

/* Task 031 (T1): one picker, no hidden upload (Owlbear's upload never
   reliably landed and made duplicates), a clear first-time message, and a
   guard so a second click while Owlbear's picker is open does nothing.
   Task 031b: a watchdog (PLACE_TOKEN_WATCHDOG_MS) so the button can never stay
   stuck disabled. When it fires it frees the button and abandons this run:
   a picker answer that arrives later places nothing, binds nothing and
   throws nothing, and it cannot disturb a newer run. */
async function placeMyToken() {
  if (placeTokenInFlight || !obrApi || !activeCharacter || !tokenImageFullDataUrl || !playerRecord) {
    return;
  }
  placeTokenInFlight = true;
  placeButton.disabled = true;
  const run = (placeTokenRun += 1);
  const abandoned = () => run !== placeTokenRun;
  const tokenName = `${activeCharacter.name} Token`;
  const watchdog = setTimeout(() => {
    if (abandoned()) {
      return;
    }
    placeTokenRun += 1;
    placeTokenInFlight = false;
    placeButton.disabled = false;
    setFeedback(`Owlbear's picker did not answer in ${PLACE_TOKEN_WATCHDOG_MS / 1000} seconds, so Place My Token stopped waiting. Press it again to try once more; a pick made in the old dialog is ignored.`, true);
  }, PLACE_TOKEN_WATCHDOG_MS);
  try {
    setFeedback(`Pick ${tokenName} in Owlbear's dialog to place it.`);
    const pick = await pickTokenFromLibrary(tokenName);
    if (abandoned()) {
      return;
    }
    // The picker answered: the placing calls below have SDK timeouts of their own.
    clearTimeout(watchdog);
    if (pick) {
      await placePickedToken(pick);
      return;
    }
    setFeedback(`No token was picked. ${PLACE_TOKEN_FIRST_TIME_HELP}`, true);
  } catch (error) {
    if (abandoned()) {
      return;
    }
    console.error("Angel Sword Place My Token failed:", error);
    setFeedback(`${tokenName} could not be placed. ${PLACE_TOKEN_FIRST_TIME_HELP}`, true);
  } finally {
    clearTimeout(watchdog);
    if (!abandoned()) {
      placeTokenInFlight = false;
      placeButton.disabled = false;
    }
  }
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
    const records = items
      .map((item) => item.metadata?.[TOKEN_BINDING_KEY])
      .filter(Boolean);
    // Only this player's own records; never another player's token (A6).
    const mine = pickRestorableBinding(records, playerRecord.id, activeCharacter?.characterId);
    if (!mine) {
      return;
    }
    activeBinding = mine;
    await obrApi.player.setMetadata({ [PLAYER_BINDING_KEY]: activeBinding });
    renderBinding();
    setFeedback(joinFeedback(
      `Restored binding: ${activeBinding.characterName} is bound to ${activeBinding.tokenName}.`,
      isNewerSchema(activeBinding, CHARACTER_SCHEMA_VERSION)
        ? describeNewerSchema("This binding", readSchemaVersion(activeBinding), CHARACTER_SCHEMA_VERSION)
        : ""
    ));
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
  const channel = ensureRelayChannel();
  channel?.addEventListener("message", (messageEvent) => {
    if (!obrApi) {
      appendRoll(messageEvent.data);
    }
  });
}

/* ── Sheet bridge (window.opener transport) ──────────────────────────────
   The one transport that works on a public static host: this panel opens
   the character sheet with window.open() and the two windows message each
   other directly. Received sheet rolls are republished on the same-origin
   RELAY_CHANNEL BroadcastChannel, which background.js already consumes —
   background.js needs no changes to fan them out room-wide. */
const sheetBridge = createOwlbearOpenerBridge({
  onHandoff: (event) => {
    const consumed = readConsumedHandoffs();
    if (!shouldApplyHandoff(event, consumed)) {
      return false;
    }
    return applyHandoff(event, consumed);
  },
  onSheetRoll: (event) => {
    ensureRelayChannel()?.postMessage(event);
    if (!obrApi) {
      appendRoll(event);
    }
  }
});

function renderSheetLink(state) {
  const labels = {
    [OPENER_STATES.CLOSED]: "Sheet link: not connected. Press Open My Character Sheet.",
    [OPENER_STATES.CONNECTING]: "Sheet link: connecting…",
    [OPENER_STATES.CONNECTED]: "Sheet link: connected — sheet rolls reach this room."
  };
  const text = labels[state] || labels[OPENER_STATES.CLOSED];
  if (sheetLinkStatus) {
    sheetLinkStatus.textContent = text;
    sheetLinkStatus.classList.toggle("is-live", state === OPENER_STATES.CONNECTED);
  }
  if (sheetLinkStatusRolls) {
    sheetLinkStatusRolls.textContent = text;
    sheetLinkStatusRolls.classList.toggle("is-live", state === OPENER_STATES.CONNECTED);
  }
  if (state === OPENER_STATES.CONNECTED) {
    try {
      localStorage.setItem(SHEET_BRIDGE_SEEN_KEY, String(Date.now()));
    } catch (error) {
      /* the reconnect hint is best-effort */
    }
  }
}

function openCharacterSheet() {
  if (sheetBridge.getState() !== OPENER_STATES.CLOSED) {
    sheetBridge.focusSheet();
    return;
  }
  if (!sheetBridge.connect(resolveBuilderUrl())) {
    setFeedback("Your browser blocked the sheet window. Allow pop-ups for owlbear.rodeo, then press Open My Character Sheet again.", true);
    return;
  }
  setFeedback("Opened your character sheet in a new tab. Its rolls now reach this room. To bring your character here, press Send Character to Room in that sheet.");
}

/* After a room-tab reload the sheet tab may still be open under its fixed
   window name; silently re-acquire it instead of asking for another click. */
function tryReconnectSheet() {
  let seenAt = 0;
  try {
    seenAt = Number(localStorage.getItem(SHEET_BRIDGE_SEEN_KEY) || 0);
  } catch (error) {
    seenAt = 0;
  }
  if (seenAt && Date.now() - seenAt <= SHEET_BRIDGE_RECONNECT_WINDOW_MS) {
    sheetBridge.reconnect(resolveBuilderUrl());
  }
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
    OBR.broadcast.onMessage(ROLL_CHANNEL, (broadcastEvent) => {
      appendRoll(broadcastEvent.data);
      sheetBridge.sendRoomRollToSheet(broadcastEvent.data);
    });
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

openSheetButton?.addEventListener("click", openCharacterSheet);
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
    if (isNewerSchema(stored, CHARACTER_SCHEMA_VERSION)) {
      setFeedback(describeNewerSchema("Your saved character", readSchemaVersion(stored), CHARACTER_SCHEMA_VERSION));
    }
  }
} catch (error) {
  localStorage.removeItem(CHARACTER_STORAGE_KEY);
}
try {
  const storedToken = JSON.parse(localStorage.getItem(TOKEN_IMAGE_KEY) || "null");
  if (storedToken?.dataUrl && storedToken.characterId === activeCharacter?.characterId) {
    tokenImageDataUrl = storedToken.dataUrl;
    tokenImageFullDataUrl = storedToken.fullDataUrl || storedToken.dataUrl;
  }
} catch (error) {
  localStorage.removeItem(TOKEN_IMAGE_KEY);
}

renderCharacter();
renderBinding();
connectStandaloneRelay();
connectOwlbear();
sheetBridge.onStateChange(renderSheetLink);
renderSheetLink(sheetBridge.getState());
tryReconnectSheet();
if (isDevRelayHost()) {
  pollHandoffsOnce();
  setInterval(pollHandoffsOnce, 2500);
}
