import { normalizeLyrianText, normalizePulledRulesEntry } from "./ui.js";









export function normalizeKey(value) {
      return String(value || "").trim().toLowerCase();
    }
export function normalizePhrase(value) {
      return cleanText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    }
export function cleanText(value) {
      return normalizeLyrianText(value);
    }
export function escapeHtml(value) {
      return cleanText(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
export function toNumber(value, fallback = 0) {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    }
export function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }
export function formatModifier(value) {
      const num = toNumber(value, 0);
      return num >= 0 ? `+${num}` : String(num);
    }
function isMaterialBundleName(nameKey) {
      return [
        "alchemy materials",
        "armorsmithing materials",
        "artificer materials",
        "blacksmithing materials",
        "carpenter materials",
        "culinarian ingredients",
        "farming materials"
      ].includes(nameKey);
    }
function readableMaterialText(value) {
      return cleanText(value)
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
function slugMaterialPart(value) {
      return readableMaterialText(value)
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "material";
    }
function parseMaterialNumber(value) {
      const match = readableMaterialText(value).match(/\d[\d,]*/);
      return match ? Number(match[0].replace(/,/g, "")) : 0;
    }
function cleanMaterialSentence(value) {
      return readableMaterialText(value)
        .replace(/\s+-\s+/g, ". ")
        .replace(/\s+/g, " ")
        .trim();
    }
function singularMaterialCategory(source) {
      const name = readableMaterialText(source?.name || "Crafting Materials");
      return name
        .replace(/\s+Materials$/i, " Material")
        .replace(/\s+Ingredients$/i, " Ingredient");
    }
function titleMaterialUnit(value) {
      return readableMaterialText(value)
        .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    }
function formatGeneratedMaterialName(source, materialName, unitLabel = "") {
      const category = singularMaterialCategory(source);
      const material = readableMaterialText(materialName);
      const unit = titleMaterialUnit(unitLabel).replace(/^Per\s+/i, "");
      const suffix = unit && !normalizeKey(material).includes(normalizeKey(unit))
        ? `${material} ${unit}`
        : material;
      return `${category} - ${suffix}`;
    }
function createGeneratedMaterialEntry(source, details) {
      const category = readableMaterialText(source?.name || "Crafting Materials");
      const name = details.name || formatGeneratedMaterialName(source, details.materialName, details.unitName || details.unitLabel);
      const cost = `${parseMaterialNumber(details.climCost)} Clim`;
      const unitLabel = readableMaterialText(details.unitLabel || "");
      const unitCostText = readableMaterialText(details.unitCostText || "");
      const extraText = cleanMaterialSentence(details.extraText || "");
      const summary = [
        `${category}.`,
        details.materialName ? `Material: ${readableMaterialText(details.materialName)}.` : "",
        unitLabel ? `Clim cost per ${unitLabel}: ${cost}.` : `Cost: ${cost}.`,
        unitCostText ? `Unit cost: ${unitCostText}.` : "",
        extraText
      ].filter(Boolean).join(" ");

      return {
        ...source,
        id: `${source.id}--${slugMaterialPart(name)}`,
        name,
        type: source.type || "Crafting",
        subType: details.subType || source.subType || "Materials",
        cost,
        burden: "",
        description: summary,
        materialCategory: category,
        materialSourceId: source.id,
        materialUnitLabel: unitCostText || "",
        generatedMaterial: true
      };
    }
function collectRegexMatches(text, pattern) {
      const matches = [];
      let match;
      while ((match = pattern.exec(text))) {
        matches.push({
          match,
          index: match.index,
          end: pattern.lastIndex
        });
      }
      return matches;
    }
function expandAlchemyMaterials(source) {
      const elements = ["Fire", "Water", "Earth", "Wind", "Arcane"];
      const rows = [
        ["Common", [60, 50, 55, 55, 65]],
        ["Rare", [300, 250, 275, 275, 325]],
        ["Mystic", [600, 500, 550, 550, 650]],
        ["Supreme", [1200, 1000, 1100, 1100, 1300]]
      ];
      return rows.flatMap(([rarity, costs]) => elements.map((element, index) => createGeneratedMaterialEntry(source, {
        name: `Alchemy Herb - ${rarity} ${element}`,
        materialName: `${rarity} ${element}`,
        subType: "Alchemy Herb",
        climCost: costs[index],
        unitLabel: "herb",
        unitCostText: "1 herb",
        extraText: "Use this as the specific herb purchase for alchemy recipes."
      })));
    }
function expandClimUnitMaterials(source, text) {
      const pattern = /-\s*([^:-]+?)(?::-)?-?\s*Clim Cost per\s+([^:]+):\s*([\d,]+)\s*Clim\s*-\s*Unit cost per\s+([^:]+):\s*([\d,]+)\s*([A-Za-z][A-Za-z\s]+?units?)(?=\.|\s*-)/gi;
      return collectRegexMatches(text, pattern).map(({ match }) => {
        const [, materialName, climUnit, climCost, unitCostLabel, unitCost, unitName] = match;
        return createGeneratedMaterialEntry(source, {
          materialName,
          subType: "Base Material",
          climCost,
          unitLabel: readableMaterialText(climUnit || unitCostLabel),
          unitCostText: `${parseMaterialNumber(unitCost)} ${readableMaterialText(unitName)} per ${readableMaterialText(unitCostLabel || climUnit)}`,
          extraText: "Base crafting material parsed from the source materials table."
        });
      });
    }
function expandSpecialMaterialRows(source, text) {
      const pattern = /-\s*([^()\-]+?)\s*\(\s*([\d,]+)\s*(?:Clim|c)\s*(?:[\/,]\s*([\d,]+)\s*crafting\s*points?)?\s*\)\s*:?-?/gi;
      const matches = collectRegexMatches(text, pattern);
      return matches.map((entry, index) => {
        const [, materialName, climCost, craftingPoints] = entry.match;
        const next = matches[index + 1]?.index ?? text.length;
        const section = text.slice(entry.end, next);
        const unitMatch = section.match(/Unit cost(?:\s+per\s+([^:]+))?:\s*([\d,]+|1)\s*([A-Za-z][A-Za-z\s]+?(?:units?|core|wood)?)(?=\.|\s*-)/i);
        const unitLabel = readableMaterialText(unitMatch?.[1] || "unit");
        const unitCostText = unitMatch
          ? `${readableMaterialText(unitMatch[2])} ${readableMaterialText(unitMatch[3])}${unitMatch[1] ? ` per ${unitLabel}` : ""}`
          : "";
        return createGeneratedMaterialEntry(source, {
          name: formatGeneratedMaterialName(source, materialName, ""),
          materialName,
          subType: "Special Material",
          climCost,
          unitLabel: unitLabel === "unit" ? "" : unitLabel,
          unitCostText,
          extraText: [
            craftingPoints ? `Crafting points: ${parseMaterialNumber(craftingPoints)}.` : "",
            section
          ].filter(Boolean).join(" ")
        });
      });
    }
function expandFarmingMaterials(source, text) {
      const seedPattern = /-\s*([^:-]+?):-\s*Cost:\s*([\d,]+)\s*Clim\s*-\s*Difficulty:?\s*([^-]+?)\s*-\s*Yields?:?\s*([^-]+?)\s*-\s*Growing time:?\s*([^-]+?)(?=\s*-\s*[^:]+:-|\s*Cost is|\s*Special Seeds|$)/gi;
      const fertilizerPattern = /-\s*(Average|Good|Excellent|Supreme):-?\s*Cost:\s*([\d,]+)\s*Clim\s*-\s*Effect:\s*([^-.]+(?:dice)?)/gi;
      const seedEntries = collectRegexMatches(text, seedPattern).map(({ match }) => {
        const [, materialName, climCost, difficulty, yieldText, growingTime] = match;
        return createGeneratedMaterialEntry(source, {
          name: `Farming Seed - ${readableMaterialText(materialName)}`,
          materialName,
          subType: "Seed",
          climCost,
          unitLabel: "seed",
          unitCostText: `Difficulty ${readableMaterialText(difficulty)}`,
          extraText: `Yield: ${readableMaterialText(yieldText)}. Growing time: ${readableMaterialText(growingTime)}.`
        });
      });
      const fertilizerEntries = collectRegexMatches(text, fertilizerPattern).map(({ match }) => {
        const [, materialName, climCost, effect] = match;
        return createGeneratedMaterialEntry(source, {
          name: `Farming Fertilizer - ${readableMaterialText(materialName)}`,
          materialName,
          subType: "Fertilizer",
          climCost,
          unitLabel: "fertilizer",
          unitCostText: "1 fertilizer",
          extraText: `Effect: ${readableMaterialText(effect)}.`
        });
      });
      return [...seedEntries, ...fertilizerEntries];
    }
function expandMaterialBundle(source) {
      const nameKey = normalizeKey(source?.name);
      if (!isMaterialBundleName(nameKey)) {
        return [];
      }
      const text = readableMaterialText(source.description);
      if (nameKey === "alchemy materials") {
        return expandAlchemyMaterials(source);
      }
      if (nameKey === "farming materials") {
        return expandFarmingMaterials(source, text);
      }
      const generated = [
        ...expandClimUnitMaterials(source, text),
        ...expandSpecialMaterialRows(source, text)
      ];
      return generated;
    }
function expandMaterialItemEntries(entries = []) {
      return entries.flatMap((entry) => {
        const generated = expandMaterialBundle(entry);
        if (!generated.length) {
          return [entry];
        }
        return [
          {
            ...entry,
            hiddenFromBuilderEquipment: true,
            materialReferenceCard: true
          },
          ...generated
        ];
      });
    }
export function buildLookup(data) {
      const makeMap = (entries = []) => {
        const normalizedEntries = entries.map((entry) => normalizePulledRulesEntry(entry));
const byId = new Map();
const byName = new Map();
        normalizedEntries.forEach((entry) => {
          byId.set(normalizeKey(entry.id), entry);
          byName.set(normalizeKey(entry.name), entry);
        });
        return {
          byId,
          byName,
          entries: normalizedEntries,
          resolve(value) {
            const key = normalizeKey(value);
            return byId.get(key) || byName.get(key) || null;
          }
        };
      };

      return {
        races: makeMap(data.races),
        ancestries: makeMap(data.ancestries),
        classes: makeMap(data.classes),
        items: makeMap(expandMaterialItemEntries(data.items)),
        breakthroughs: makeMap(data.breakthroughs),
        abilities: makeMap(data.abilities)
      };
    }
export function cssEscape(value) {
      return String(value || "").replace(/"/g, '\\"');
    }
export function asArray(value) {
      if (Array.isArray(value)) {
        return value;
      }
      if (!value) {
        return [];
      }
      return [value];
    }

