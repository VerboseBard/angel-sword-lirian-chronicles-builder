export const EXTENSION_ID = "com.angelssword.lyrian-chronicles";
export const RELAY_CHANNEL = "asb-vtt-events";
export const ROLL_CHANNEL = `${EXTENSION_ID}/rolls`;
export const PLAYER_BINDING_KEY = `${EXTENSION_ID}/player-binding`;
export const TOKEN_BINDING_KEY = `${EXTENSION_ID}/character-binding`;
export const ROOM_LOG_KEY = `${EXTENSION_ID}/roll-log`;
export const CHARACTER_SCHEMA_VERSION = 1;
export const ROLL_SCHEMA_VERSION = 1;
export const MAX_ROOM_LOG_ITEMS = 24;

/* Opener bridge (sheet popup <-> Companion panel postMessage transport).
   Named OPENER_BRIDGE_* because roll20-bridge.js already exports a
   differently-valued BRIDGE_TIMING. The sheet side (src/js/vtt-relay.js)
   cannot import this file, so it repeats these literals; the opener-bridge
   unit test pins both copies against each other. */
export const OPENER_BRIDGE_KIND = Object.freeze({
  HELLO: "bridge-hello",
  PING: "bridge-ping",
  PONG: "bridge-pong",
  ACK: "bridge-ack"
});
export const OPENER_BRIDGE_TIMING = Object.freeze({
  PING_INTERVAL_MS: 4000,
  /* Generous on purpose: Chrome throttles timers in hidden cross-origin
     iframes to about one a minute, so a hidden-but-alive panel may only
     ping that often. postMessage delivery itself is never throttled. */
  PONG_TIMEOUT_MS: 75000,
  ACK_TIMEOUT_MS: 5000
});
export const OPENER_STATES = Object.freeze({
  CLOSED: "closed",
  CONNECTING: "connecting",
  CONNECTED: "connected"
});

function text(value, limit = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* Task 031: missing values never win. Number("") and Number(null) are both 0,
   which used to beat every later fallback (a blank Speed gave speed 0). */
function firstNumber(values, fallback = 0) {
  for (const value of values) {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      continue;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/* ── Version-skew contract (plan WS5, task 031) ──────────────────────────
   Every record we share carries a schemaVersion. Readers accept the same or
   an older version, ignore fields they do not know, and report a newer
   version with a clear note instead of failing silently. Players' Owlbear
   caches the manifest URL, not the code, so a sheet, a Companion and other
   players' Companions can run different versions at the same table. */
export function readSchemaVersion(record) {
  if (!record || typeof record !== "object") {
    return null;
  }
  const raw = record.schemaVersion;
  if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isNewerSchema(record, supportedVersion) {
  const version = readSchemaVersion(record);
  return version !== null && version > supportedVersion;
}

/* A builder character's version lives on its VTT summary (task 031); a
   top-level schemaVersion is honoured too. No version means an older file. */
export function getCharacterSchemaVersion(data) {
  const fromSummary = readSchemaVersion(data?.vttSummary);
  return fromSummary !== null ? fromSummary : readSchemaVersion(data);
}

export function describeNewerSchema(subject, version, supportedVersion) {
  return `${subject} came from a newer Angel Sword version (format ${version}; this Companion reads format ${supportedVersion}). The parts this Companion knows were kept. Reload the Owlbear room to update the Companion.`;
}

export function characterSchemaNote(data) {
  const version = getCharacterSchemaVersion(data);
  return version !== null && version > CHARACTER_SCHEMA_VERSION
    ? describeNewerSchema("This character", version, CHARACTER_SCHEMA_VERSION)
    : "";
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function collectFieldClasses(fields = {}, selectedIds = []) {
  const named = Object.entries(fields)
    .filter(([key, value]) => /^(?:class|classname)\d+$/i.test(key) && text(value))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([, value]) => text(value, 80));
  return Array.from(new Set(named.length ? named : selectedIds.map((value) => text(value, 80)).filter(Boolean)));
}

/* Builder characters. The sheet sends `vttSummary` (task 031): the numbers its
   main play sheet shows, computed by the sheet's own rules, so this file never
   recomputes bonuses. Files and sheets from before task 031 have no summary;
   for them the raw sheet fields below are the fallback (stats are then the
   base points, without race/class bonuses, and Clim is unknown). */
function normalizeBuilderState(data) {
  const fields = data.fields && typeof data.fields === "object" ? data.fields : {};
  const builder = data.builder && typeof data.builder === "object" ? data.builder : {};
  const play = data.play && typeof data.play === "object" ? data.play : {};
  const resources = play.resources && typeof play.resources === "object" ? play.resources : {};
  const summary = plainObject(data.vttSummary);
  const summaryStats = plainObject(summary.stats);
  const name = text(fields.Name || fields.CharacterName || "Unnamed character", 100);
  const race = text(fields["Primary Race"] || fields.Race, 80);
  const ancestry = text(fields["Sub Race"] || fields.Subrace || fields.SubRace, 80);
  const classes = collectFieldClasses(fields, Array.isArray(builder.selectedClassIds) ? builder.selectedClassIds : []);
  const identitySeed = JSON.stringify({ name, race, ancestry, classes });
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    characterId: `builder-${stableHash(identitySeed)}`,
    sourceFormat: "lyrian-builder-json",
    name,
    race,
    ancestry,
    classes,
    stats: {
      power: firstNumber([summaryStats.power, fields.Power], 0),
      focus: firstNumber([summaryStats.focus, fields.Focus], 0),
      agility: firstNumber([summaryStats.agility, fields.Agility], 0),
      toughness: firstNumber([summaryStats.toughness, fields.Toughness], 0),
      fitness: firstNumber([summaryStats.fitness, fields.Fitness], 0),
      cunning: firstNumber([summaryStats.cunning, fields.Cunning], 0),
      reason: firstNumber([summaryStats.reason, fields.Reason], 0),
      awareness: firstNumber([summaryStats.awareness, fields.Awareness], 0),
      presence: firstNumber([summaryStats.presence, fields.Presence], 0)
    },
    resources: {
      hpCurrent: firstNumber([resources.hpCurrent, fields.HPCurrent, fields.HP], 0),
      hpMax: firstNumber([resources.hpMax, fields.HPMax, fields.MaxHP], 0),
      manaCurrent: firstNumber([resources.manaCurrent, fields.ManaCurrent, fields.Mana], 0),
      manaMax: firstNumber([resources.manaMax, fields.ManaMax, fields.MaxMana], 0),
      apCurrent: firstNumber([resources.apCurrent, fields.APCurrent], 4),
      apMax: firstNumber([resources.apMax, fields.APMax], 4),
      rpCurrent: firstNumber([resources.rpCurrent, fields.RPCurrent], 0),
      rpMax: firstNumber([resources.rpMax, fields.RPMax], 0),
      // The sheet's real field names are "Spirit Core" and "Exp"; the old
      // SpiritCore/EXP spellings stay as last-resort fallbacks.
      spiritCore: firstNumber([summary.spiritCore, fields["Spirit Core"], fields.SpiritCore, builder.autoSpiritCore], 0),
      exp: firstNumber([summary.exp, fields.Exp, fields.EXP, builder.autoExpBank], 0),
      // The sheet has no Clim field: the shown Clim is computed (starting
      // Clim + earned - gear), so only the summary knows it.
      clim: firstNumber([summary.clim, fields.Clim], 0)
    },
    speed: firstNumber([summary.speed, fields.Speed], 20)
  };
}

function normalizeAschar(data) {
  const character = data.format === "angelssword-character" ? data.character : data;
  if (!character || typeof character !== "object") {
    throw new Error("The official character envelope is missing its character record.");
  }
  const race = character.race && typeof character.race === "object" ? character.race : {};
  const derived = character.derivedStats && typeof character.derivedStats === "object" ? character.derivedStats : {};
  const classes = (Array.isArray(character.classes) ? character.classes : [])
    .map((entry) => text(entry?.name || entry?.classId, 80))
    .filter(Boolean);
  const name = text(character.name || "Unnamed character", 100);
  const identitySeed = JSON.stringify({ name, race, classes });
  const hpMax = firstNumber([derived.hp, derived.hpMax, derived.maxHp], 0);
  const manaMax = firstNumber([derived.maxMana, derived.manaMax], 0);
  /* The official model's mainStats/subStats are the base points; its
     effectiveMainStats/effectiveSubStats hold the totals with bonuses. Prefer
     the effective numbers when a file has them (task 031). */
  const main = plainObject(character.mainStats);
  const sub = plainObject(character.subStats);
  const effectiveMain = plainObject(character.effectiveMainStats);
  const effectiveSub = plainObject(character.effectiveSubStats);
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    characterId: `aschar-${stableHash(identitySeed)}`,
    sourceFormat: "angelssword-character",
    name,
    race: text(race.primaryRaceName || race.primaryRaceId, 80),
    ancestry: text(race.ancestryName || race.ancestryId, 80),
    classes: Array.from(new Set(classes)),
    stats: {
      power: firstNumber([effectiveMain.power, main.power], 0),
      focus: firstNumber([effectiveMain.focus, main.focus], 0),
      agility: firstNumber([effectiveMain.agility, main.agility], 0),
      toughness: firstNumber([effectiveMain.toughness, main.toughness], 0),
      fitness: firstNumber([effectiveSub.fitness, sub.fitness], 0),
      cunning: firstNumber([effectiveSub.cunning, sub.cunning], 0),
      reason: firstNumber([effectiveSub.reason, sub.reason], 0),
      awareness: firstNumber([effectiveSub.awareness, sub.awareness], 0),
      presence: firstNumber([effectiveSub.presence, sub.presence], 0)
    },
    resources: {
      hpCurrent: hpMax,
      hpMax,
      manaCurrent: manaMax,
      manaMax,
      apCurrent: firstNumber([derived.ap, derived.apMax], 4),
      apMax: firstNumber([derived.apMax, derived.ap], 4),
      rpCurrent: firstNumber([derived.rp, derived.rpMax], 0),
      rpMax: firstNumber([derived.rpMax, derived.rp], 0),
      spiritCore: number(character.soulCore),
      exp: number(character.totalExp),
      clim: number(character.resources?.clim)
    },
    speed: firstNumber([derived.speed], 20)
  };
}

export function normalizeCharacterExport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("That file is not a JSON character export.");
  }
  if (data.fields && data.play) {
    return normalizeBuilderState(data);
  }
  const official = data.format === "angelssword-character"
    || (data.race && data.mainStats && typeof data.mainStats === "object");
  if (official) {
    return normalizeAschar(data);
  }
  throw new Error("Use Export Character JSON or an official .aschar.json file.");
}

export function createBindingRecord(character, player = {}, item = {}) {
  if (!character?.characterId || !character?.name) {
    throw new Error("Import a character before binding a token.");
  }
  if (!item?.id) {
    throw new Error("Select one Owlbear character token before binding.");
  }
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    characterId: text(character.characterId, 100),
    characterName: text(character.name, 100),
    tokenId: text(item.id, 120),
    tokenName: text(item.name || character.name, 100),
    ownerPlayerId: text(player.id, 120),
    ownerPlayerName: text(player.name, 100),
    resources: { ...character.resources },
    speed: number(character.speed, 20),
    updatedAt: new Date().toISOString()
  };
}

/* Task 031 (audit C5): a later Send for the same character refreshes the
   numbers on the player's own active binding. Only resources, speed and the
   timestamp change; the token id, name and owner stay, so the token is never
   rebound or moved. Returns null when the refresh is not allowed: another
   character, another player's binding, or a binding written by a newer
   Companion version (we only write records we fully understand). */
export function refreshBindingRecord(binding, character, playerId) {
  if (!binding || typeof binding !== "object" || !character?.characterId) {
    return null;
  }
  if (binding.characterId !== character.characterId) {
    return null;
  }
  if (!playerId || binding.ownerPlayerId !== text(playerId, 120)) {
    return null;
  }
  if (isNewerSchema(binding, CHARACTER_SCHEMA_VERSION)) {
    return null;
  }
  return {
    ...binding,
    resources: { ...character.resources },
    speed: number(character.speed, 20),
    updatedAt: new Date().toISOString()
  };
}

/* Task 031 (ledger A6): reconnect only adopts a binding this player owns.
   The character-id match now chooses among the player's own records (when
   they bound more than one token); it never adopts another player's token,
   even when both imported the same character identity. */
export function pickRestorableBinding(records, playerId, characterId = "") {
  const owner = text(playerId, 120);
  if (!owner) {
    return null;
  }
  const owned = (Array.isArray(records) ? records : [])
    .filter((record) => record && typeof record === "object" && record.ownerPlayerId === owner);
  return owned.find((record) => characterId && record.characterId === characterId) || owned[0] || null;
}

/* Task 031 (T1): Place My Token puts the picked image on the map at exactly
   one grid square. An Owlbear image's grid.dpi is "image pixels per grid
   square", so dpi = the image's longer side makes it one square; the offset
   centres it. The library's own setting (often 150 dpi, which made a 720 px
   token about five squares wide) is used only if the size is unknown. */
export function tokenGridForOneSquare(image, fallbackGrid) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  if (!(width > 0) || !(height > 0)) {
    return fallbackGrid;
  }
  return {
    dpi: Math.max(width, height),
    offset: { x: width / 2, y: height / 2 }
  };
}

const ROLL_DICE_SIDES = [20, 12, 100, 10, 8, 6, 4];
const MAX_ROLL_DICE = 40;

function sanitizeRollDice(dice) {
  if (!Array.isArray(dice)) {
    return [];
  }
  const results = [];
  for (const entry of dice) {
    const sides = Number(entry?.sides);
    const value = Number(entry?.value);
    if (ROLL_DICE_SIDES.includes(sides) && Number.isFinite(value)) {
      results.push({ sides, value });
    }
    if (results.length >= MAX_ROLL_DICE) {
      break;
    }
  }
  return results;
}

/* Per-die results for visual replay (the 3D overlay). Prefers the
   structured `dice` array on the wire; falls back to parsing the text
   breakdown for events from older builds — including count-prefixed
   multi-die groups ("2d10: 3 + 9"), which the old regex read as one die. */
export function extractRollDice(event) {
  const structured = sanitizeRollDice(event?.dice);
  if (structured.length) {
    return structured;
  }
  const results = [];
  const source = String(event?.breakdown || "");
  const pattern = /\d*d(\d+):\s*([\d\s+]+)/gi;
  let match = pattern.exec(source);
  while (match && results.length < MAX_ROLL_DICE) {
    const sides = Number(match[1]);
    if (ROLL_DICE_SIDES.includes(sides)) {
      for (const raw of match[2].split("+")) {
        const value = Number(raw.trim());
        if (raw.trim() && Number.isFinite(value) && results.length < MAX_ROLL_DICE) {
          results.push({ sides, value });
        }
      }
    }
    match = pattern.exec(source);
  }
  return results;
}

export function normalizeRollEvent(event, defaults = {}) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const total = Number(event.total);
  if (!Number.isFinite(total)) {
    return null;
  }
  const id = text(event.id, 120)
    || `roll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    schemaVersion: ROLL_SCHEMA_VERSION,
    id,
    timestamp: text(event.timestamp || event.ts || new Date().toISOString(), 60),
    kind: text(event.kind || "roll", 40),
    characterId: text(event.characterId || defaults.characterId, 100),
    character: text(event.character || defaults.character || "Unknown character", 100),
    playerId: text(event.playerId || defaults.playerId, 120),
    playerName: text(event.playerName || defaults.playerName, 100),
    playerRole: ["GM", "PLAYER"].includes(event.playerRole || defaults.playerRole)
      ? (event.playerRole || defaults.playerRole)
      : "",
    label: text(event.label || "Roll", 120),
    formula: text(event.formula, 120),
    breakdown: text(event.breakdown, 300),
    weapon: text(event.weapon, 100),
    visibility: ["PUBLIC", "GM"].includes(event.visibility) ? event.visibility : "PUBLIC",
    dice: sanitizeRollDice(event.dice),
    total
  };
}

export function mergeRollLog(existing, event, maxItems = MAX_ROOM_LOG_ITEMS) {
  const safeExisting = Array.isArray(existing) ? existing.filter((entry) => entry && typeof entry === "object") : [];
  const normalized = normalizeRollEvent(event);
  if (!normalized) {
    return safeExisting.slice(0, maxItems);
  }
  return [normalized, ...safeExisting.filter((entry) => entry.id !== normalized.id)].slice(0, maxItems);
}
