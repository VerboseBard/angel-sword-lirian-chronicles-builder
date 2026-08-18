/* ═══════════════════════════════════════════════════════════════════════════
   .aschar.json interop — the official Clio builder's character trading format.

   Envelope (confirmed from the official implementation 2026-07-22):
     { format: "angelssword-character", version: 1, character: {…} }
   The character payload is the official builder's character model. This module
   is PURE data mapping — no app imports, no DOM — so it runs identically in
   the browser bundle and under Node for tests. ui.js assembles the export
   context from live state and applies the parsed import plan.

   Fidelity philosophy (matches the project rules): map everything mappable,
   and surface everything else in the import plan's `notes` so no data is ever
   silently dropped.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ASCHAR_FORMAT = "angelssword-character";
export const ASCHAR_VERSION = 1;

const MAIN_KEYS = ["power", "focus", "agility", "toughness"];
const SUB_KEYS = ["fitness", "cunning", "reason", "awareness", "presence"];

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function statBlock(source, keys) {
  const out = {};
  keys.forEach((key) => {
    out[key] = num(source?.[key], 0);
  });
  return out;
}

/* ─── Export: our context → official character model ─────────────────── */

/**
 * @param {Object} context — assembled by the app from live state:
 *   name, startMode, race {id,name}, ancestry {id,name}|null, demonHouseName,
 *   elementalMastery, mainStats, subStats, effectiveMainStats, effectiveSubStats,
 *   derived, classes [{classId,name,tier,levels}], breakthroughs
 *   [{breakthroughId,name,cost,description,choice}], skills
 *   [{name,points,expertise:[{name,points,racial}]}], equipment
 *   [{itemId,name,baseName,mods,cost,qty}], interludeActions, resources
 *   {clim,classExp,interludePoints,skillPoints,breakthroughExp}, soulCore, totalExp
 */
export function buildAscharCharacter(context = {}) {
  const skills = {};
  (Array.isArray(context.skills) ? context.skills : []).forEach((skill) => {
    const name = text(skill?.name);
    const points = num(skill?.points, 0);
    const expertise = (Array.isArray(skill?.expertise) ? skill.expertise : [])
      .map((entry) => {
        const record = { name: text(entry?.name), points: num(entry?.points, 0) };
        if (entry?.racial) {
          record.racial = true;
        }
        return record;
      })
      .filter((entry) => entry.name && entry.points > 0);
    if (name && (points > 0 || expertise.length)) {
      skills[name] = { points, expertise };
    }
  });

  return {
    name: text(context.name),
    gameMode: context.startMode === "mirane" ? "mirane" : "lyrian",
    completedStep: 10,
    race: {
      primaryRaceId: text(context.race?.id) || null,
      primaryRaceName: text(context.race?.name) || null,
      ancestryId: text(context.ancestry?.id) || null,
      ancestryName: text(context.ancestry?.name) || null,
      demonHouseName: text(context.demonHouseName) || null,
      elementalMastery: text(context.elementalMastery) || null
    },
    raceBonuses: context.raceBonuses && typeof context.raceBonuses === "object"
      ? context.raceBonuses
      : { mainStat: null, subStat: null, mainVal: 0, subVal: 0 },
    mainStats: statBlock(context.mainStats, MAIN_KEYS),
    subStats: statBlock(context.subStats, SUB_KEYS),
    effectiveMainStats: context.effectiveMainStats ? statBlock(context.effectiveMainStats, MAIN_KEYS) : null,
    effectiveSubStats: context.effectiveSubStats ? statBlock(context.effectiveSubStats, SUB_KEYS) : null,
    derivedStats: context.derived && typeof context.derived === "object" ? { ...context.derived } : null,
    classes: (Array.isArray(context.classes) ? context.classes : []).map((cls) => ({
      classId: text(cls?.classId),
      name: text(cls?.name),
      tier: num(cls?.tier, 1),
      levels: Math.max(1, num(cls?.levels, 1)),
      mastered: num(cls?.levels, 1) >= 8
    })).filter((cls) => cls.classId || cls.name),
    breakthroughs: (Array.isArray(context.breakthroughs) ? context.breakthroughs : []).map((bt) => ({
      breakthroughId: text(bt?.breakthroughId),
      name: text(bt?.name),
      cost: num(bt?.cost, 0),
      description: text(bt?.description) || undefined,
      choice: text(bt?.choice) || undefined,
      fromCreation: bt?.fromCreation !== false
    })).filter((bt) => bt.breakthroughId || bt.name),
    skills,
    equipment: (Array.isArray(context.equipment) ? context.equipment : []).map((item) => ({
      itemId: text(item?.itemId) || undefined,
      name: text(item?.name),
      baseName: text(item?.baseName) || text(item?.name),
      mods: Array.isArray(item?.mods) ? item.mods.map(text).filter(Boolean) : [],
      cost: num(item?.cost, 0),
      qty: item?.qty !== undefined ? Math.max(1, num(item.qty, 1)) : undefined
    })).filter((item) => item.name),
    interludeActions: (Array.isArray(context.interludeActions) ? context.interludeActions : [])
      .map(text)
      .filter((id) => ["job", "train", "other"].includes(id)),
    resources: {
      breakthroughExp: num(context.resources?.breakthroughExp, 0),
      classExp: num(context.resources?.classExp, 0),
      interludePoints: num(context.resources?.interludePoints, 0),
      skillPoints: num(context.resources?.skillPoints, 0),
      clim: num(context.resources?.clim, 0)
    },
    soulCore: num(context.soulCore, 0),
    totalExp: num(context.totalExp, 0),
    exportedBy: "angel-sword-lyrian-builder"
  };
}

export function wrapAscharExport(character) {
  return {
    format: ASCHAR_FORMAT,
    version: ASCHAR_VERSION,
    exportedAt: new Date().toISOString(),
    character
  };
}

/* ─── Import: parsed JSON → normalized plan ──────────────────────────── */

/** Accepts the envelope, or a bare official character object (vault entries
    and the official localStorage payload are bare). */
export function parseAscharFile(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "That file is not a character export." };
  }
  if (data.format === ASCHAR_FORMAT && data.character && typeof data.character === "object") {
    return { ok: true, character: data.character };
  }
  // Bare official model heuristic: the official builder always writes these.
  if (data.race && typeof data.race === "object" && data.mainStats && typeof data.mainStats === "object") {
    return { ok: true, character: data };
  }
  return { ok: false, error: "That JSON is not an .aschar character (missing format marker and race/stat blocks)." };
}

/** Strip the "::N" uniqueness suffix official repeatable breakthroughs carry. */
function baseBreakthroughId(id) {
  return text(id).split("::")[0];
}

export function normalizeAscharCharacter(character = {}) {
  const notes = [];
  const race = character.race || {};

  const skills = Object.entries(character.skills && typeof character.skills === "object" ? character.skills : {})
    .map(([name, entry]) => ({
      name: text(name),
      points: num(entry?.points, 0),
      expertise: (Array.isArray(entry?.expertise) ? entry.expertise : [])
        .map((expertise) => ({
          name: text(expertise?.name),
          points: num(expertise?.points, 0),
          racial: Boolean(expertise?.racial)
        }))
        .filter((expertise) => expertise.name && expertise.points > 0)
    }))
    .filter((skill) => skill.name && (skill.points > 0 || skill.expertise.length));

  const plan = {
    name: text(character.name),
    gameMode: character.gameMode === "mirane" ? "mirane" : "standard",
    race: {
      primaryRaceId: text(race.primaryRaceId),
      primaryRaceName: text(race.primaryRaceName)
    },
    ancestry: {
      ancestryId: text(race.ancestryId),
      ancestryName: text(race.ancestryName)
    },
    demonHouseName: text(race.demonHouseName),
    elementalMastery: text(race.elementalMastery),
    raceBonuses: character.raceBonuses && typeof character.raceBonuses === "object" ? character.raceBonuses : null,
    mainStats: statBlock(character.mainStats, MAIN_KEYS),
    subStats: statBlock(character.subStats, SUB_KEYS),
    classes: (Array.isArray(character.classes) ? character.classes : []).map((cls) => ({
      classId: text(cls?.classId),
      name: text(cls?.name),
      levels: Math.min(8, Math.max(1, num(cls?.levels, 1)))
    })).filter((cls) => cls.classId || cls.name),
    breakthroughs: (Array.isArray(character.breakthroughs) ? character.breakthroughs : []).map((bt) => ({
      breakthroughId: baseBreakthroughId(bt?.breakthroughId),
      name: text(bt?.name),
      cost: num(bt?.cost, 0),
      choice: text(bt?.choice)
    })).filter((bt) => bt.breakthroughId || bt.name),
    skills,
    equipment: (Array.isArray(character.equipment) ? character.equipment : []).map((item) => ({
      itemId: text(item?.itemId),
      name: text(item?.name),
      baseName: text(item?.baseName) || text(item?.name),
      mods: Array.isArray(item?.mods) ? item.mods.map(text).filter(Boolean) : [],
      cost: num(item?.cost, 0),
      qty: Math.max(1, num(item?.qty, 1))
    })).filter((item) => item.name),
    interludeActions: (Array.isArray(character.interludeActions) ? character.interludeActions : [])
      .map(text)
      .filter((id) => ["job", "train", "other"].includes(id)),
    resources: {
      clim: num(character.resources?.clim, NaN),
      classExp: num(character.resources?.classExp, NaN),
      interludePoints: num(character.resources?.interludePoints, NaN)
    },
    notes
  };

  if (character.portraitData) {
    notes.push("The official portrait image was not imported (different portrait systems).");
  }
  if (plan.raceBonuses && plan.race.primaryRaceName.toLowerCase() === "human"
      && (plan.raceBonuses.mainStat || plan.raceBonuses.subStat)) {
    notes.push(`Human bonus picks in the file: +1 ${plan.raceBonuses.mainStat || "?"} / +1 ${plan.raceBonuses.subStat || "?"} — re-select them on the Race step (they are choices here, not raw numbers).`);
  }
  const moddedItems = plan.equipment.filter((item) => item.mods.length);
  if (moddedItems.length) {
    notes.push(`${moddedItems.length} item(s) carry official mods (${moddedItems.map((item) => item.name).slice(0, 3).join(", ")}${moddedItems.length > 3 ? "…" : ""}); mod details are kept in the item name/notes.`);
  }
  return plan;
}
