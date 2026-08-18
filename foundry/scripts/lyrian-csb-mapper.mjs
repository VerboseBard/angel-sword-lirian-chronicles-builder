/*
 * Pure .aschar -> JesterBaster Lyrian CSB mapping.
 *
 * This module deliberately does not call Foundry APIs or update Actors. It produces
 * the system.props payload and a coverage report for the current `lyrian_pc`
 * template. A live Foundry/CSB test must confirm the Actor update path before the
 * companion module is allowed to write these props.
 */

export const LYRIAN_CSB_TEMPLATE = "lyrian_pc";
export const LYRIAN_CSB_SOURCE_COMMIT = "bb2c7bea22b5b96e91a1f8488efa36f49d465205";

const MAIN_STATS = ["power", "focus", "agility", "toughness"];
const SUB_STATS = ["fitness", "cunning", "reason", "awareness", "presence"];

const SKILL_KEYS = Object.freeze({
  athletics: "lyrian_sk_athletics",
  riding: "lyrian_sk_riding",
  deception: "lyrian_sk_deception",
  roguecraft: "lyrian_sk_roguecraft",
  stealth: "lyrian_sk_stealth",
  artifice: "lyrian_sk_artifice",
  appraise: "lyrian_sk_appraise",
  commonknowledge: "lyrian_sk_commonknow",
  flight: "lyrian_sk_flight",
  history: "lyrian_sk_history",
  linguistics: "lyrian_sk_linguistics",
  magic: "lyrian_sk_magic",
  medicine: "lyrian_sk_medicine",
  religion: "lyrian_sk_religion",
  animalhusbandry: "lyrian_sk_animalhusb",
  insight: "lyrian_sk_insight",
  perception: "lyrian_sk_perception",
  survival: "lyrian_sk_survival",
  art: "lyrian_sk_art",
  intimidation: "lyrian_sk_intimidation",
  negotiation: "lyrian_sk_negotiation"
});

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedName(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function unwrapCharacter(input) {
  if (input?.format === "angelssword-character" && input.character && typeof input.character === "object") {
    return input.character;
  }
  return input && typeof input === "object" ? input : {};
}

function statSource(character, effectiveKey, baseKey) {
  const effective = character[effectiveKey];
  return effective && typeof effective === "object" ? effective : (character[baseKey] || {});
}

function raceLabel(race, nameKey, idKey) {
  return text(race?.[nameKey]) || text(race?.[idKey]);
}

function skillEntries(skills) {
  if (Array.isArray(skills)) {
    return skills.map((entry) => [entry?.name, entry]);
  }
  return Object.entries(skills && typeof skills === "object" ? skills : {});
}

function firstFinite(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function buildLyrianCsbImportPlan(input = {}) {
  const character = unwrapCharacter(input);
  const race = character.race || {};
  const main = statSource(character, "effectiveMainStats", "mainStats");
  const sub = statSource(character, "effectiveSubStats", "subStats");
  const derived = character.derivedStats || character.derived || {};
  const resources = character.resources || {};
  const props = {
    lyrian_race: raceLabel(race, "primaryRaceName", "primaryRaceId"),
    lyrian_subrace: raceLabel(race, "ancestryName", "ancestryId")
  };

  MAIN_STATS.forEach((key) => {
    props[`lyrian_${key}`] = number(main[key], 0);
  });
  SUB_STATS.forEach((key) => {
    props[`lyrian_${key}`] = number(sub[key], 0);
  });

  const mappedSkills = [];
  const unmappedSkills = [];
  const expertise = [];
  for (const [name, entry] of skillEntries(character.skills)) {
    const normalized = normalizedName(name);
    const key = SKILL_KEYS[normalized];
    const points = number(entry?.points, 0);
    if (key) {
      props[key] = points;
      mappedSkills.push(text(name));
    } else if (text(name)) {
      unmappedSkills.push({ name: text(name), points });
    }
    for (const record of Array.isArray(entry?.expertise) ? entry.expertise : []) {
      if (text(record?.name) && number(record?.points, 0) > 0) {
        expertise.push({
          skill: text(name),
          name: text(record.name),
          points: number(record.points, 0),
          racial: Boolean(record.racial)
        });
      }
    }
  }

  const toughness = props.lyrian_toughness;
  const power = props.lyrian_power;
  const agility = props.lyrian_agility;
  const baseHp = 20 + (toughness * 10);
  const baseMana = 6 + power;
  const baseRp = 2 + agility;
  const hpMax = firstFinite(resources.hpMax, derived.hpMax, baseHp) ?? baseHp;
  const manaMax = firstFinite(resources.manaMax, derived.manaMax, baseMana) ?? baseMana;
  const rpMax = firstFinite(resources.rpMax, derived.rpMax, baseRp) ?? baseRp;
  const apMax = firstFinite(resources.apMax, derived.apMax, 4) ?? 4;

  props.lyrian_hp_value = firstFinite(resources.hpCurrent, hpMax) ?? hpMax;
  props.lyrian_mana_value = firstFinite(resources.manaCurrent, manaMax) ?? manaMax;
  props.lyrian_ap_value = firstFinite(resources.apCurrent, apMax) ?? apMax;
  props.lyrian_rp_value = firstFinite(resources.rpCurrent, rpMax) ?? rpMax;
  props.lyrian_temp_hp = firstFinite(resources.tempHp, 0) ?? 0;
  props.lyrian_ap_max = apMax;

  const guard = firstFinite(derived.guard);
  const evasion = firstFinite(derived.evasion);
  const block = firstFinite(derived.block);
  const initiative = firstFinite(derived.initiative);
  const speed = firstFinite(derived.speed, 20) ?? 20;
  props.lyrian_armor_guard = guard == null ? 0 : guard - toughness;
  props.lyrian_armor_eva_pen = evasion == null ? 0 : (7 + agility) - evasion;
  props.lyrian_armor_block = block == null ? 0 : block - (toughness * 2);
  props.lyrian_armor_init_pen = initiative == null ? 0 : agility - initiative;
  props.lyrian_shield_block = 0;
  props.lyrian_speed_base = 20;
  props.lyrian_speed_mod = speed - 20;
  props.lyrian_burden_use = firstFinite(resources.burden, 0) ?? 0;

  const formulaGaps = [];
  if (hpMax !== baseHp) formulaGaps.push({ field: "hpMax", expected: hpMax, templateFormulaResult: baseHp });
  if (manaMax !== baseMana) formulaGaps.push({ field: "manaMax", expected: manaMax, templateFormulaResult: baseMana });
  if (rpMax !== baseRp) formulaGaps.push({ field: "rpMax", expected: rpMax, templateFormulaResult: baseRp });
  const basePotency = 11 + props.lyrian_focus;
  const baseSave = toughness;
  if (firstFinite(derived.potency) != null && number(derived.potency) !== basePotency) {
    formulaGaps.push({ field: "potency", expected: number(derived.potency), templateFormulaResult: basePotency });
  }
  if (firstFinite(derived.saveBonus) != null && number(derived.saveBonus) !== baseSave) {
    formulaGaps.push({ field: "saveBonus", expected: number(derived.saveBonus), templateFormulaResult: baseSave });
  }

  return {
    format: "angel-sword-lyrian-csb-import-plan-v1",
    templateName: LYRIAN_CSB_TEMPLATE,
    sourceCommit: LYRIAN_CSB_SOURCE_COMMIT,
    actorName: text(character.name) || "Lyrian Character",
    props,
    coverage: {
      mappedSkills,
      unmappedSkills,
      formulaGaps,
      unmapped: {
        expertise,
        classes: Array.isArray(character.classes) ? character.classes : [],
        breakthroughs: Array.isArray(character.breakthroughs) ? character.breakthroughs : [],
        equipment: Array.isArray(character.equipment) ? character.equipment : []
      }
    },
    warnings: [
      "This is a mapping plan, not a verified Foundry Actor import file.",
      "The current lyrian_pc template has no completed Classes, Combat, Inventory, Crafting, or Bio content.",
      "Expertise, classes, breakthroughs, and equipment are retained in coverage.unmapped and are not written to visible CSB fields.",
      "Current HP/Mana/AP/RP default to their maxima when the source export does not carry live resource values.",
      "Template formula differences are reported in coverage.formulaGaps; the mapper does not falsify main stats to hide those gaps."
    ]
  };
}

