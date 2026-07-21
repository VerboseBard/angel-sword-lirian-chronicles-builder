import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data", "angelssword");
const VERSION_DIR = path.join(PROJECT_ROOT, "assets", "versions");
const ITEM_IMAGE_DIR = path.join(PROJECT_ROOT, "assets", "item-images");

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "entry";
}

function normalizeSpace(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0019/g, "'")
    .replace(/\u001c/g, '"')
    .replace(/\u001d/g, '"')
    .replace(/\u0014/g, "-")
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬Å“/g, '"')
    .replace(/Ã¢â‚¬Â/g, '"')
    .replace(/Ã¢â‚¬â€/g, "-")
    .replace(/Ã¢â‚¬â€œ/g, "-")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeAssetUrl(value) {
  return normalizeSpace(value).replace(/\\/g, "/");
}

function toBrowserPath(value) {
  return normalizeAssetUrl(path.relative(PROJECT_ROOT, value));
}

function getUrlExtension(value) {
  try {
    const parsed = new URL(value);
    const ext = path.extname(parsed.pathname).toLowerCase();
    return ext || ".webp";
  } catch {
    const ext = path.extname(String(value || "")).toLowerCase();
    return ext || ".webp";
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cacheRemoteImage(url, version, id, variant) {
  const source = normalizeAssetUrl(url);
  if (!/^https?:\/\//i.test(source)) {
    return source;
  }

  const versionDir = path.join(ITEM_IMAGE_DIR, version);
  const fileName = `${slugify(id)}-${variant}${getUrlExtension(source)}`;
  const outPath = path.join(versionDir, fileName);
  if (await fileExists(outPath)) {
    return toBrowserPath(outPath);
  }

  await fs.mkdir(versionDir, { recursive: true });
  try {
    const response = await fetch(source, {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: "https://rpg.angelssword.com/"
      }
    });
    if (!response.ok) {
      console.warn(`Could not cache image ${source}: HTTP ${response.status}`);
      return source;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outPath, buffer);
    return toBrowserPath(outPath);
  } catch (error) {
    console.warn(`Could not cache image ${source}: ${error.message}`);
    return source;
  }
}

function makeItemSummaryMap(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    [
      entry.itemId,
      entry.id,
      entry.indexId,
      entry.name
    ].filter(Boolean).forEach((key) => map.set(normalizeSpace(key).toLowerCase(), entry));
  }
  return map;
}

function resolveItemSummary(summaryMap, entry) {
  for (const key of [entry.itemId, entry.id, entry.indexId, entry.name].filter(Boolean)) {
    const match = summaryMap.get(normalizeSpace(key).toLowerCase());
    if (match) {
      return match;
    }
  }
  return null;
}

async function buildItemImageFields(entry, summary, version) {
  const id = entry.itemId || entry.id || entry.indexId || entry.name;
  const smSource = normalizeAssetUrl(summary?.imageSmUrl || entry.imageSmUrl || entry.imageLgUrl);
  const lgSource = normalizeAssetUrl(entry.imageLgUrl || entry.imageSmUrl || summary?.imageSmUrl);
  const imageSmUrl = smSource ? await cacheRemoteImage(smSource, version, id, "sm") : "";
  const imageLgUrl = lgSource ? await cacheRemoteImage(lgSource, version, id, "lg") : imageSmUrl;
  return {
    imageSmUrl,
    imageLgUrl: imageLgUrl || imageSmUrl,
    imageAlignment: normalizeSpace(entry.imageAlignment)
  };
}

function stripHtml(value) {
  return normalizeSpace(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n\n")
      .replace(/<\/li\s*>/gi, "\n")
      .replace(/<li\s*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#8217;/gi, "'")
      .replace(/&#8220;/gi, '"')
      .replace(/&#8221;/gi, '"')
      .replace(/&#8211;/gi, "-")
      .replace(/&#8230;/gi, "...")
  );
}

function maybeDecodeBase64Html(value) {
  const text = normalizeSpace(value);
  if (!text) {
    return "";
  }
  if (text.startsWith("<")) {
    return stripHtml(text);
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(text) && text.length % 4 === 0) {
    try {
      const decoded = Buffer.from(text, "base64").toString("utf8");
      return decoded.startsWith("<") ? stripHtml(decoded) : normalizeSpace(decoded);
    } catch {
      return text;
    }
  }
  return text;
}

function splitTitleAndNote(value) {
  const text = normalizeSpace(value);
  if (!text) {
    return ["", ""];
  }
  if (text.includes(" - ")) {
    const [title, ...rest] = text.split(" - ");
    return [normalizeSpace(title), normalizeSpace(rest.join(" - "))];
  }
  return [text, ""];
}

function buildCostLabel(entry = {}) {
  const costs = [];
  const ap = normalizeSpace(entry.apCost);
  const rp = normalizeSpace(entry.rpCost);
  const mana = normalizeSpace(entry.manaCost);
  const other = normalizeSpace(entry.otherCosts);
  if (ap !== "") costs.push(`${ap} AP`);
  if (rp !== "") costs.push(`${rp} RP`);
  if (mana !== "") costs.push(`${mana} Mana`);
  if (other) costs.push(other);
  return costs.join(", ");
}

function normalizeAbilityEntry(entry) {
  if (!entry) {
    return null;
  }
  return {
    id: entry.trueAbilityId || entry.abilityId || entry.indexId || slugify(entry.name),
    name: normalizeSpace(entry.name),
    descriptionText: normalizeSpace(entry.descriptionText) || maybeDecodeBase64Html(entry.description),
    descriptionHtml: entry.descriptionHtml || "",
    costLabel: buildCostLabel(entry),
    apCost: normalizeSpace(entry.apCost),
    rpCost: normalizeSpace(entry.rpCost),
    manaCost: normalizeSpace(entry.manaCost),
    otherCosts: normalizeSpace(entry.otherCosts),
    range: normalizeSpace(entry.range),
    keywords: normalizeSpace(entry.keywords),
    requirement: normalizeSpace(entry.requirementText) || maybeDecodeBase64Html(entry.requirement)
  };
}

function normalizeKeyAbility(entry) {
  if (!entry) {
    return null;
  }
  return {
    name: normalizeSpace(entry.name),
    benefit1: normalizeSpace(entry.benefit1),
    benefit2: normalizeSpace(entry.benefit2),
    benefit3: normalizeSpace(entry.benefit3),
    benefit4: normalizeSpace(entry.benefit4)
  };
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, relativePath), "utf8"));
}

function firstLines(value, limit = 5) {
  return normalizeSpace(value)
    .split("\n")
    .map((line) => line.replace(/^-+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

async function buildDataBundle(version) {
  const classesRaw = await readJson("joined/class_details_resolved.json");
  const raceRaw = await readJson("joined/primary_race_details_resolved.json");
  const ancestryRaw = await readJson("decoded/ancestry_details.json");
  const itemSummariesRaw = await readJson("decoded/items.json").catch(() => []);
  const itemsRaw = await readJson("decoded/item_details.json");
  const breakthroughsRaw = await readJson("decoded/breakthroughs.json");
  const abilitiesRaw = await readJson("decoded/true_abilities.json");
  const keywordsRaw = await readJson("decoded/keywords.json");
  const itemSummaryMap = makeItemSummaryMap(itemSummariesRaw);
  const items = await Promise.all(itemsRaw.map(async (entry) => {
    const summary = resolveItemSummary(itemSummaryMap, entry);
    return {
      id: entry.itemId || summary?.itemId || slugify(entry.name),
      name: normalizeSpace(entry.name),
      type: normalizeSpace(entry.type),
      subType: normalizeSpace(entry.subType),
      cost: normalizeSpace(entry.cost),
      burden: normalizeSpace(entry.burden),
      activationCost: normalizeSpace(entry.activationCost),
      fuelUsage: normalizeSpace(entry.fuelUsage),
      craftingType: normalizeSpace(entry.craftingType),
      description: normalizeSpace(entry.descriptionText) || maybeDecodeBase64Html(entry.description),
      ...(await buildItemImageFields(entry, summary, version))
    };
  }));

  return {
    version,
    races: raceRaw.map((entry) => ({
      id: entry.primaryRaceId || slugify(entry.name),
      name: normalizeSpace(entry.name),
      attributes: normalizeSpace(entry.attributes),
      skills: normalizeSpace(entry.skills),
      proficiencies: normalizeSpace(entry.proficiencies),
      description: normalizeSpace(entry.descriptionText) || maybeDecodeBase64Html(entry.description),
      abilities: [entry.ability1Ref?.name, entry.ability2Ref?.name].filter(Boolean)
    })),
    ancestries: ancestryRaw.map((entry) => ({
      id: entry.ancestryId || slugify(entry.name),
      name: normalizeSpace(entry.name),
      description: normalizeSpace(entry.descriptionText) || maybeDecodeBase64Html(entry.description)
    })),
    classes: classesRaw.map((entry) => ({
      id: entry.classId || slugify(entry.name),
      name: normalizeSpace(entry.name),
      tier: Number(entry.tier || 0),
      role1: normalizeSpace(entry.role1),
      role2: normalizeSpace(entry.role2),
      difficulty: Number(entry.difficulty || 0),
      requirements: normalizeSpace(entry.requirementsText) || maybeDecodeBase64Html(entry.requirements),
      heart: normalizeSpace(entry.heart),
      soul: normalizeSpace(entry.soul),
      skills: normalizeSpace(entry.skills),
      description: normalizeSpace(entry.descriptionText) || maybeDecodeBase64Html(entry.description),
      guide: normalizeSpace(entry.guideText) || maybeDecodeBase64Html(entry.guide),
      keyAbility: normalizeSpace(entry.keyAbilityRef?.name),
      abilities: [
        entry.ability1Ref?.name,
        entry.ability2Ref?.name,
        entry.ability3Ref?.name,
        entry.ultimateAbilityRef?.name
      ].filter(Boolean)
    })),
    items,
    breakthroughs: breakthroughsRaw.map((entry) => ({
      id: entry.breakthroughId || slugify(entry.name),
      name: normalizeSpace(entry.name),
      cost: normalizeSpace(entry.cost),
      requirements: normalizeSpace(entry.requirements),
      description: normalizeSpace(entry.descriptionText) || maybeDecodeBase64Html(entry.description)
    })),
    abilities: abilitiesRaw.map((entry) => ({
      id: entry.trueAbilityId || slugify(entry.name),
      name: normalizeSpace(entry.name),
      costLabel: buildCostLabel(entry),
      apCost: normalizeSpace(entry.apCost),
      rpCost: normalizeSpace(entry.rpCost),
      manaCost: normalizeSpace(entry.manaCost),
      otherCosts: normalizeSpace(entry.otherCosts),
      range: normalizeSpace(entry.range),
      requirement: normalizeSpace(entry.requirementText) || maybeDecodeBase64Html(entry.requirement),
      keywords: normalizeSpace(entry.keywords).split(",").map((part) => part.trim()).filter(Boolean),
      description: normalizeSpace(entry.descriptionText) || maybeDecodeBase64Html(entry.description)
    })),
    keywords: keywordsRaw.map((entry) => ({
      id: entry.keywordId || slugify(entry.name),
      name: normalizeSpace(entry.name),
      description: normalizeSpace(entry.descriptionText) || maybeDecodeBase64Html(entry.description)
    }))
  };
}

async function buildDetailBundle(version) {
  const raceRaw = await readJson("joined/primary_race_details_resolved.json");
  const ancestryRaw = await readJson("joined/ancestry_details_resolved.json");
  const classesRaw = await readJson("joined/class_details_resolved.json");

  return {
    version,
    races: raceRaw.map((entry) => {
      const lineageChoices = {};
      for (const code of ["wi", "lir", "d", "ar", "lu", "ni", "un", "vi", "none"]) {
        const rawChoice = entry[code];
        if (!rawChoice) continue;
        const [title, note] = splitTitleAndNote(rawChoice.text);
        lineageChoices[code] = {
          code: code.toUpperCase(),
          title,
          note,
          text: normalizeSpace(rawChoice.text),
          ability: normalizeSpace(rawChoice.ability),
          abilityRef: normalizeAbilityEntry(rawChoice.abilityRef)
        };
      }
      return {
        id: entry.primaryRaceId || slugify(entry.name),
        name: normalizeSpace(entry.name),
        descriptionText: normalizeSpace(entry.descriptionText) || maybeDecodeBase64Html(entry.description),
        descriptionHtml: entry.descriptionHtml || "",
        attributes: normalizeSpace(entry.attributes),
        proficiencies: normalizeSpace(entry.proficiencies),
        skills: normalizeSpace(entry.skills),
        imageSmUrl: entry.imageSmUrl || "",
        imageLgUrl: entry.imageLgUrl || "",
        imageAlignment: normalizeSpace(entry.imageAlignment),
        abilities: [normalizeAbilityEntry(entry.ability1Ref), normalizeAbilityEntry(entry.ability2Ref)].filter(Boolean),
        lineageChoices
      };
    }),
    ancestries: ancestryRaw.map((entry) => ({
      id: entry.ancestryId || slugify(entry.name),
      name: normalizeSpace(entry.name),
      primaryRace: normalizeSpace(entry.primaryRace),
      descriptionText: normalizeSpace(entry.descriptionText) || maybeDecodeBase64Html(entry.description),
      descriptionHtml: entry.descriptionHtml || "",
      imageSmUrl: entry.imageSmUrl || "",
      imageLgUrl: entry.imageLgUrl || "",
      traits: [
        normalizeAbilityEntry(entry.trait1Ref),
        normalizeAbilityEntry(entry.trait2Ref),
        normalizeAbilityEntry(entry.trait3Ref)
      ].filter(Boolean)
    })),
    classes: classesRaw.map((entry) => ({
      id: entry.classId || slugify(entry.name),
      name: normalizeSpace(entry.name),
      descriptionText: normalizeSpace(entry.descriptionText) || maybeDecodeBase64Html(entry.description),
      descriptionHtml: entry.descriptionHtml || "",
      guideText: normalizeSpace(entry.guideText) || maybeDecodeBase64Html(entry.guide),
      guideHtml: entry.guideHtml || "",
      difficulty: normalizeSpace(entry.difficulty),
      role1: normalizeSpace(entry.role1),
      role2: normalizeSpace(entry.role2),
      requirements: normalizeSpace(entry.requirementsText) || maybeDecodeBase64Html(entry.requirements),
      skills: normalizeSpace(entry.skills),
      heart: normalizeSpace(entry.heart),
      soul: normalizeSpace(entry.soul),
      tier: normalizeSpace(entry.tier),
      imageSmUrl: entry.imageSmUrl || "",
      imageLgUrl: entry.imageLgUrl || "",
      imageAlignment: normalizeSpace(entry.imageAlignment),
      keyAbility: normalizeKeyAbility(entry.keyAbilityRef),
      abilities: [
        normalizeAbilityEntry(entry.ability1Ref),
        normalizeAbilityEntry(entry.ability2Ref),
        normalizeAbilityEntry(entry.ability3Ref),
        normalizeAbilityEntry(entry.ultimateAbilityRef)
      ].filter(Boolean)
    }))
  };
}

async function readManifest() {
  const manifestPath = path.join(VERSION_DIR, "manifest.json");
  return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

async function writeManifest(manifest) {
  const jsonPath = path.join(VERSION_DIR, "manifest.json");
  const jsPath = path.join(VERSION_DIR, "manifest.js");
  const ordered = {
    ...manifest,
    versions: [...manifest.versions].sort((a, b) => {
      const left = a.id.match(/\d+/g)?.map(Number) || [];
      const right = b.id.match(/\d+/g)?.map(Number) || [];
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const diff = (left[index] || 0) - (right[index] || 0);
        if (diff) return diff;
      }
      return 0;
    })
  };
  await fs.writeFile(jsonPath, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
  await fs.writeFile(jsPath, `window.LYRIAN_VERSION_MANIFEST = ${JSON.stringify(ordered, null, 2)};\n`, "utf8");
}

async function writeJs(variableName, payload, outPath) {
  await fs.writeFile(
    outPath,
    `window.${variableName} = ${JSON.stringify(payload, null, 0)};\n`,
    "utf8"
  );
}

async function main() {
  const pulledManifest = await readJson("manifest.json");
  const version = process.argv[2] || pulledManifest.latestVersion;
  if (!version) {
    throw new Error("No pulled Lyrian version was available to build.");
  }

  const outDir = path.join(VERSION_DIR, version);
  await fs.mkdir(outDir, { recursive: true });

  const dataBundle = await buildDataBundle(version);
  const detailBundle = await buildDetailBundle(version);
  await writeJs("LYRIAN_DATA", dataBundle, path.join(outDir, "lyrian-data.js"));
  await writeJs("LYRIAN_DETAIL_DATA", detailBundle, path.join(outDir, "lyrian-detail-data.js"));

  const patchNotes = await readJson("decoded/patch_notes.json").catch(() => ({}));
  const updates = firstLines(patchNotes.contentText || maybeDecodeBase64Html(patchNotes.content), 8);
  const manifest = await readManifest();
  const existing = new Map((manifest.versions || []).map((entry) => [entry.id, entry]));
  existing.set(version, {
    id: version,
    label: `${version} - Lyrian Chronicles`,
    status: "downloaded",
    dataPath: `assets/versions/${version}/lyrian-data.js`,
    detailPath: `assets/versions/${version}/lyrian-detail-data.js`,
    local: true,
    updates: updates.length ? updates : [`Downloaded official Lyrian data ${version}.`],
    sections: existing.get(manifest.defaultVersion)?.sections || [
      "Latest update",
      "Settings guide",
      "Rulebook",
      "Breakthroughs",
      "Keywords",
      "Races",
      "Classes",
      "Abilities",
      "Items",
      "Monsters",
      "Monster abilities"
    ]
  });
  manifest.latestKnownVersion = version;
  manifest.defaultVersion = manifest.latestKnownVersion;
  manifest.versions = Array.from(existing.values());
  await writeManifest(manifest);

  console.log(JSON.stringify({
    ok: true,
    version,
    dataPath: `assets/versions/${version}/lyrian-data.js`,
    detailPath: `assets/versions/${version}/lyrian-detail-data.js`,
    counts: {
      races: dataBundle.races.length,
      ancestries: dataBundle.ancestries.length,
      classes: dataBundle.classes.length,
      items: dataBundle.items.length,
      breakthroughs: dataBundle.breakthroughs.length,
      abilities: dataBundle.abilities.length,
      keywords: dataBundle.keywords.length
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
