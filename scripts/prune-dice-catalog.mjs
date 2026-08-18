import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistryScript } from "./promote-dice-skin.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const REGISTRY_JSON = path.join(PROJECT_ROOT, "assets", "dice", "promoted-dice-skins.json");
const REGISTRY_JS = path.join(PROJECT_ROOT, "assets", "dice", "promoted-dice-skins.registry.js");
const MANIFEST_JSON = path.join(PROJECT_ROOT, "assets", "dice", "dice-pack-manifest.json");
const INDEX_HTML = path.join(PROJECT_ROOT, "index.html");
const REQUIRED_DICE = ["d4", "d6", "d8", "d10", "d100", "d12", "d20"];

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeAtomic(file, content) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, content, "utf8");
  await fs.rename(temporary, file);
}

function cacheKey(isoDate) {
  return String(isoDate).replace(/[^0-9]/g, "").slice(0, 14) || "1";
}

function updateRegistryCacheBuster(html, generatedAt) {
  return String(html).replace(
    /assets\/dice\/promoted-dice-skins\.registry\.js(?:\?v=[^"']*)?/,
    `assets/dice/promoted-dice-skins.registry.js?v=${cacheKey(generatedAt)}`
  );
}

export async function pruneDiceCatalog(keepIds) {
  const requested = [...new Set(keepIds.map((id) => String(id).trim().toLowerCase()).filter(Boolean))];
  if (!requested.length) {
    throw new Error("Provide at least one promoted dice set id to keep.");
  }

  const [registry, manifest, indexHtml] = await Promise.all([
    readJson(REGISTRY_JSON),
    readJson(MANIFEST_JSON),
    fs.readFile(INDEX_HTML, "utf8")
  ]);
  const registryById = new Map((registry.packs || []).map((pack) => [String(pack.id).toLowerCase(), pack]));
  const missing = requested.filter((id) => !registryById.has(id));
  if (missing.length) {
    throw new Error(`Cannot keep missing promoted dice set(s): ${missing.join(", ")}`);
  }

  const promotedPacks = requested.map((id) => registryById.get(id));
  promotedPacks.forEach((pack) => {
    const available = new Set(pack.availableDice || []);
    const absentDice = REQUIRED_DICE.filter((die) => !available.has(die));
    if (absentDice.length) {
      throw new Error(`${pack.id} is not a complete set; missing ${absentDice.join(", ")}`);
    }
  });

  const generatedAt = new Date().toISOString();
  const nextRegistry = { ...registry, generatedAt, packs: promotedPacks };
  const promotedManifestById = new Map(
    (manifest.packs || []).filter((pack) => pack.promoted).map((pack) => [String(pack.id).toLowerCase(), pack])
  );
  const builtInPacks = (manifest.packs || []).filter((pack) => pack.installed === true && !pack.promoted);
  const nextManifest = {
    ...manifest,
    generatedAt,
    packs: [
      ...builtInPacks,
      ...requested.map((id) => promotedManifestById.get(id)).filter(Boolean)
    ]
  };

  await Promise.all([
    writeAtomic(REGISTRY_JSON, `${JSON.stringify(nextRegistry, null, 2)}\n`),
    writeAtomic(REGISTRY_JS, buildRegistryScript(nextRegistry)),
    writeAtomic(MANIFEST_JSON, `${JSON.stringify(nextManifest, null, 2)}\n`),
    writeAtomic(INDEX_HTML, updateRegistryCacheBuster(indexHtml, generatedAt))
  ]);

  return {
    visibleCatalog: [...builtInPacks.map((pack) => pack.id), ...requested],
    removedFromSelector: (registry.packs || [])
      .map((pack) => pack.id)
      .filter((id) => !requested.includes(String(id).toLowerCase())),
    note: "Unlisted workshop sidecar files were retained locally so no in-progress art was destroyed."
  };
}

async function main() {
  const report = await pruneDiceCatalog(process.argv.slice(2));
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
