import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLyrianCsbImportPlan, LYRIAN_CSB_SOURCE_COMMIT } from "../foundry/scripts/lyrian-csb-mapper.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const referenceRoot = path.join(root, "foundry", "csb-reference");
let checks = 0;
let failures = 0;

function check(label, condition) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`FAIL: ${label}`);
}

const template = JSON.parse(await readFile(path.join(referenceRoot, "jesterbaster-lyrian-pc-template.json"), "utf8"));
const schema = JSON.parse(await readFile(path.join(referenceRoot, "jesterbaster-lyrian-pc-schema.json"), "utf8"));
const serializedTemplate = JSON.stringify(template);

check("snapshot is pinned to the audited upstream commit", template.provenance.commit === LYRIAN_CSB_SOURCE_COMMIT);
check("sanitized template keeps the CSB unique version", Boolean(template.template.system.templateSystemUniqueVersion));
check("sanitized template omits actor identity/ownership", !serializedTemplate.includes('"_id"') && !serializedTemplate.includes('"ownership"'));
check("sanitized template omits document/history state", !serializedTemplate.includes("prototypeToken") && !serializedTemplate.includes("templateHistory"));
check("schema has all 21 ordinary skill fields", schema.components.filter((entry) => /^lyrian_sk_/.test(entry.key || "")).length === 21);
check("schema records the current partial template", schema.componentCount === 163 && schema.keyedComponentCount === 163);
check("schema captures the Roguecraft key defect", schema.components.some((entry) => entry.key === "lyrian_roll_" && /Roguecraft/.test(entry.rollMessage || "")));
check("schema captures the Intimidation expertise defect", schema.components.some((entry) => entry.key === "lyrian_exp_roll_expertise_intimidation" && /lyrian_sk_negotiation/.test(entry.rollMessage || "")));

const plan = buildLyrianCsbImportPlan({
  format: "angelssword-character",
  character: {
    name: "Mapper Probe",
    race: { primaryRaceId: "fae", primaryRaceName: "Fae", ancestryName: "Sylph" },
    mainStats: { power: 3, focus: 3, agility: 3, toughness: 3 },
    effectiveMainStats: { power: 5, focus: 6, agility: 4, toughness: 4 },
    subStats: { fitness: 1, cunning: 1, reason: 1, awareness: 1, presence: 1 },
    effectiveSubStats: { fitness: 2, cunning: 3, reason: 4, awareness: 5, presence: 6 },
    derivedStats: { hpMax: 65, manaMax: 13, rpMax: 6, apMax: 5, guard: 7, evasion: 12, block: 10, initiative: 6, speed: 25, potency: 19, saveBonus: 5 },
    skills: {
      "Common Knowledge": { points: 4, expertise: [] },
      Intimidation: { points: 2, expertise: [{ name: "Interrogation", points: 3 }] },
      Cooking: { points: 5, expertise: [] }
    },
    classes: [{ name: "Sorcerer", levels: 2 }],
    breakthroughs: [{ name: "Elemental Mastery" }],
    equipment: [{ name: "Staff" }]
  }
});

check("mapper uses effective stats", plan.props.lyrian_power === 5 && plan.props.lyrian_presence === 6);
check("mapper maps identity", plan.props.lyrian_race === "Fae" && plan.props.lyrian_subrace === "Sylph");
check("mapper maps abbreviated CSB skill keys", plan.props.lyrian_sk_commonknow === 4 && plan.props.lyrian_sk_intimidation === 2);
check("mapper reports skills absent from the partial template", plan.coverage.unmappedSkills.some((entry) => entry.name === "Cooking"));
check("mapper retains expertise/classes/breakthroughs/equipment as unmapped", plan.coverage.unmapped.expertise.length === 1
  && plan.coverage.unmapped.classes.length === 1
  && plan.coverage.unmapped.breakthroughs.length === 1
  && plan.coverage.unmapped.equipment.length === 1);
check("mapper preserves final guard/evasion through scratch fields", plan.props.lyrian_armor_guard === 3 && plan.props.lyrian_armor_eva_pen === -1);
check("mapper reports formula gaps instead of changing stats", ["hpMax", "manaMax", "potency", "saveBonus"].every((field) => plan.coverage.formulaGaps.some((entry) => entry.field === field)));

if (failures) {
  console.error(`\n[FOUNDRY CSB REFERENCE TEST FAILURE] ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`[FOUNDRY CSB REFERENCE TEST SUCCESS] All ${checks} checks passed.`);

