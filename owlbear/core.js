export const EXTENSION_ID = "com.angelssword.lyrian-chronicles";
export const RELAY_CHANNEL = "asb-vtt-events";
export const ROLL_CHANNEL = `${EXTENSION_ID}/rolls`;
export const PLAYER_BINDING_KEY = `${EXTENSION_ID}/player-binding`;
export const TOKEN_BINDING_KEY = `${EXTENSION_ID}/character-binding`;
export const ROOM_LOG_KEY = `${EXTENSION_ID}/roll-log`;
export const CHARACTER_SCHEMA_VERSION = 1;
export const ROLL_SCHEMA_VERSION = 1;
export const MAX_ROOM_LOG_ITEMS = 24;

function text(value, limit = 180) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstNumber(values, fallback = 0) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
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

function normalizeBuilderState(data) {
  const fields = data.fields && typeof data.fields === "object" ? data.fields : {};
  const builder = data.builder && typeof data.builder === "object" ? data.builder : {};
  const play = data.play && typeof data.play === "object" ? data.play : {};
  const resources = play.resources && typeof play.resources === "object" ? play.resources : {};
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
      power: number(fields.Power),
      focus: number(fields.Focus),
      agility: number(fields.Agility),
      toughness: number(fields.Toughness),
      fitness: number(fields.Fitness),
      cunning: number(fields.Cunning),
      reason: number(fields.Reason),
      awareness: number(fields.Awareness),
      presence: number(fields.Presence)
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
      spiritCore: firstNumber([fields.SpiritCore, builder.autoSpiritCore], 0),
      exp: firstNumber([fields.EXP, builder.autoExpBank], 0),
      clim: firstNumber([fields.Clim], 0)
    },
    speed: firstNumber([fields.Speed], 20)
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
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    characterId: `aschar-${stableHash(identitySeed)}`,
    sourceFormat: "angelssword-character",
    name,
    race: text(race.primaryRaceName || race.primaryRaceId, 80),
    ancestry: text(race.ancestryName || race.ancestryId, 80),
    classes: Array.from(new Set(classes)),
    stats: {
      power: number(character.mainStats?.power),
      focus: number(character.mainStats?.focus),
      agility: number(character.mainStats?.agility),
      toughness: number(character.mainStats?.toughness),
      fitness: number(character.subStats?.fitness),
      cunning: number(character.subStats?.cunning),
      reason: number(character.subStats?.reason),
      awareness: number(character.subStats?.awareness),
      presence: number(character.subStats?.presence)
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
    label: text(event.label || "Roll", 120),
    formula: text(event.formula, 120),
    breakdown: text(event.breakdown, 300),
    weapon: text(event.weapon, 100),
    visibility: ["PUBLIC", "GM"].includes(event.visibility) ? event.visibility : "PUBLIC",
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
