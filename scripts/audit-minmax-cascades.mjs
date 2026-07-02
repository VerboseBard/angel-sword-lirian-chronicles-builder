import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataRoot = path.join(root, "data", "angelssword");

function readJson(relativePath, fallback = []) {
  const fullPath = path.join(dataRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhrase(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

function decodeBase64Text(value) {
  const text = String(value ?? "");
  const compact = text.replace(/\s+/g, "");
  if (!compact || /[<>{}.:,;!?]/.test(text) || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return text;
  }
  try {
    const decoded = Buffer.from(compact, "base64").toString("utf8");
    const nonPrintable = decoded.replace(/[\t\r\n\x20-\x7E]/g, "").length;
    return decoded && nonPrintable / decoded.length < 0.05 ? decoded : text;
  } catch {
    return text;
  }
}

function firstText(...values) {
  return values.map(cleanText).find(Boolean) || "";
}

function asArray(value) {
  return Array.isArray(value) ? value : (value ? [value] : []);
}

const refKeys = [
  "ability1Ref",
  "ability2Ref",
  "ability3Ref",
  "ability4Ref",
  "ability5Ref",
  "ability6Ref",
  "ability7Ref",
  "ultimateAbilityRef",
  "trait1Ref",
  "trait2Ref",
  "trait3Ref",
  "trait4Ref",
  "trait5Ref",
  "trait6Ref",
  "trait7Ref",
  "trait8Ref"
];

function referencedAbilities(record = {}) {
  const seen = new Set();
  const abilities = [];
  const push = (ability) => {
    if (!ability) {
      return;
    }
    const name = cleanText(typeof ability === "string" ? ability : ability.name);
    if (!name) {
      return;
    }
    const key = cleanText(ability.id || ability.indexId || ability.trueAbilityId || ability.abilityId || name);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    abilities.push(typeof ability === "string" ? { name } : ability);
  };
  asArray(record.abilities).forEach(push);
  refKeys.forEach((key) => push(record[key]));
  return abilities;
}

function ruleTextsFromRecord(record = {}) {
  return [
    record.name,
    record.text,
    record.clanText,
    record.clanNote,
    record.requirementsText,
    record.requirements,
    record.descriptionText,
    record.description,
    record.benefit1,
    record.benefit2,
    record.benefit3,
    record.benefit4
  ].map((entry) => cleanText(decodeBase64Text(entry))).filter(Boolean);
}

function classRequirementsText(record = {}) {
  return firstText(
    record.requirementsText,
    record.requirementsHtml,
    decodeBase64Text(record.requirements),
    record.requirements
  );
}

const classes = readJson(path.join("joined", "class_details_resolved.json"));
const ancestries = readJson(path.join("joined", "ancestry_details_resolved.json"));
const races = readJson(path.join("joined", "primary_race_details_resolved.json"));
const breakthroughs = readJson(path.join("decoded", "breakthroughs.json"));
const items = readJson(path.join("decoded", "item_details.json"));

const classByName = new Map(classes.map((entry) => [normalizePhrase(entry.name), entry]));
const classAliases = new Map([
  ["iaido style", "iai style"]
]);

function hasGenericClassMasteryText(text) {
  const normalized = cleanText(text);
  return /\b(?:any|one|at least one|at least 1|two|\d+)\s+(?:tier\s+\d+\s+)?class(?:es)?\s+mastered\b/i.test(normalized)
    || /\bclass\s+mastered\b/i.test(normalized)
    || /\bmastered\s+class\b/i.test(normalized)
    || /\bany\s+mastered\s+class\b/i.test(normalized);
}

function masteredClassNamesInText(text) {
  const normalized = normalizePhrase(text);
  return classes
    .filter((entry) => {
      const name = normalizePhrase(entry.name);
      return normalized.includes(`${name} mastered`)
        || [...classAliases.entries()].some(([alias, target]) => target === name && normalized.includes(`${alias} mastered`));
    })
    .map((entry) => entry.name);
}

function hasAnyClassMasteryFoundation(text) {
  return hasGenericClassMasteryText(text) || masteredClassNamesInText(text).length > 0;
}

function hasTierFoundation(text, tier) {
  const requiredTier = Math.max(2, tier - 1);
  const normalized = cleanText(text);
  if (new RegExp(`\\btier\\s+${requiredTier}\\+?\\s+(?:class\\s+)?mastered\\b`, "i").test(normalized)
    || new RegExp(`\\bany\\s+tier\\s+${requiredTier}\\s+(?:class\\s+)?mastered\\b`, "i").test(normalized)
    || new RegExp(`\\btier\\s+${requiredTier}\\s+class\\b`, "i").test(normalized)) {
    return true;
  }
  return masteredClassNamesInText(text).some((name) => {
    const record = classByName.get(normalizePhrase(name));
    return Number(record?.tier || 0) >= requiredTier;
  });
}

function hasLooseNoMasteryPath(record) {
  const text = classRequirementsText(record);
  if (!text) {
    return Number(record.tier || 0) >= 2;
  }
  if (!hasAnyClassMasteryFoundation(text)) {
    return true;
  }
  const alternatives = cleanText(text)
    .split(/\bAlternatively,?\b/i)
    .map(cleanText)
    .filter(Boolean);
  if (alternatives.length > 1 && alternatives.some((entry) => !hasAnyClassMasteryFoundation(entry))) {
    return true;
  }
  return /\bor\s+(?:be\s+(?:a|an)\s+|have\s+)?(?:[A-Za-z -]+\s+)?(?:element\s+)?mastery\b/i.test(text)
    || /\bor\s+have\s+[A-Za-z -]+\s+element\s+mastered\b/i.test(text)
    || /\bor\s+be\s+(?:a|an)\s+[A-Za-z -]+/i.test(text);
}

function selectedAccessGrantSignals() {
  const sources = [];
  const push = (sourceType, sourceName, text) => {
    const cleaned = cleanText(decodeBase64Text(text));
    if (/\b(?:purchase|enter|unlock)\s+(?:the\s+)?(.+?)\s+class\b/i.test(cleaned)) {
      sources.push({ sourceType, sourceName, text: cleaned });
    }
  };
  races.forEach((race) => {
    Object.entries(race.lineageChoices || {}).forEach(([key, choice]) => {
      push("lineage", `${race.name} ${key.toUpperCase()}`, choice.text);
      push("lineage", `${race.name} ${key.toUpperCase()}`, choice.note);
      referencedAbilities(choice).flatMap(ruleTextsFromRecord).forEach((text) => push("lineage", `${race.name} ${key.toUpperCase()}`, text));
    });
    referencedAbilities(race).flatMap(ruleTextsFromRecord).forEach((text) => push("race", race.name, text));
  });
  ancestries.forEach((ancestry) => {
    [...asArray(ancestry.traits), ...asArray(ancestry.abilities), ...referencedAbilities(ancestry)]
      .flatMap(ruleTextsFromRecord)
      .forEach((text) => push("ancestry", ancestry.name, text));
  });
  breakthroughs.forEach((entry) => {
    ruleTextsFromRecord(entry).forEach((text) => push("breakthrough", entry.name, text));
  });
  items.forEach((entry) => {
    ruleTextsFromRecord(entry).forEach((text) => push("item", entry.name, text));
  });
  return sources;
}

function spellAndMasterySources() {
  const sourceRecords = [...ancestries, ...races].flatMap((entry) =>
    referencedAbilities(entry).map((ability) => ({ source: entry.name, ability }))
  );
  const spellSources = [];
  const masterySources = [];
  const proficiencySources = [];
  sourceRecords.forEach(({ source, ability }) => {
    const text = ruleTextsFromRecord(ability).join(" ");
    const keywords = cleanText(ability.keywords);
    if (/\bspell\b/i.test(keywords) || /\bthis spell\b/i.test(text)) {
      spellSources.push(`${source}: ${ability.name}`);
    }
    if (/\belemental\s+mastery|(?:fire|frost|ice|wind|water|earth|lightning|holy|dark)\s+mastery\b/i.test(text)) {
      masterySources.push(`${source}: ${ability.name}`);
    }
    if (/\bproficien(?:cy|cies|t)\b/i.test(text)) {
      proficiencySources.push(`${source}: ${ability.name}`);
    }
  });
  return { spellSources, masterySources, proficiencySources };
}

function itemUnlockSignals() {
  return items
    .map((entry) => {
      const text = ruleTextsFromRecord(entry).join(" ");
      return {
        name: entry.name,
        type: [entry.type, entry.subType].filter(Boolean).join("/"),
        text
      };
    })
    .filter((entry) => /\b(?:class|master(?:ed|y)|spell|proficien(?:cy|cies|t)|elemental mastery|element type|purchase|enter|unlock)\b/i.test(entry.text));
}

function printSection(title, rows, limit = 80) {
  const uniqueRows = Array.from(new Set(rows));
  console.log(`\n## ${title} (${uniqueRows.length})`);
  uniqueRows.slice(0, limit).forEach((row) => console.log(`- ${row}`));
  if (uniqueRows.length > limit) {
    console.log(`- ... ${uniqueRows.length - limit} more`);
  }
}

const tier2Loose = classes
  .filter((entry) => Number(entry.tier || 0) === 2 && hasLooseNoMasteryPath(entry))
  .map((entry) => `${entry.name}: ${classRequirementsText(entry) || "None"}`);

const tier3Loose = classes
  .filter((entry) => Number(entry.tier || 0) >= 3 && !hasTierFoundation(classRequirementsText(entry), Number(entry.tier || 0)))
  .map((entry) => `${entry.name}: ${classRequirementsText(entry) || "None"}`);

const accessSignals = selectedAccessGrantSignals()
  .map((entry) => `${entry.sourceType} ${entry.sourceName}: ${entry.text}`);

const { spellSources, masterySources, proficiencySources } = spellAndMasterySources();
const itemSignals = itemUnlockSignals()
  .map((entry) => `${entry.name}${entry.type ? ` [${entry.type}]` : ""}: ${entry.text.slice(0, 220)}`);

console.log(`Min-max cascade audit for ${path.basename(root)}`);
console.log("Rules-legal cascade audit: reports no-mastery class paths, explicit class grants, spell/mastery/proficiency sources, and item text that can affect unlock chains.");

printSection("Tier 2 no-mastery paths to verify as legal cascades", tier2Loose);
printSection("Tier 3+ gates missing an obvious tier foundation", tier3Loose);
printSection("Explicit class access grants and overrides", accessSignals);
printSection("Race/ancestry spell sources", spellSources);
printSection("Race/ancestry elemental mastery sources", masterySources);
printSection("Race/ancestry proficiency sources", proficiencySources);
printSection("Item text that can affect unlock cascades", itemSignals);
