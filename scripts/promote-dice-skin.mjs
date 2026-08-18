import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const REGISTRY_JSON = path.join(PROJECT_ROOT, "assets", "dice", "promoted-dice-skins.json");
const REGISTRY_JS = path.join(PROJECT_ROOT, "assets", "dice", "promoted-dice-skins.registry.js");
const MANIFEST_JSON = path.join(PROJECT_ROOT, "assets", "dice", "dice-pack-manifest.json");
const INDEX_HTML = path.join(PROJECT_ROOT, "index.html");
const SIDECAR_DIR = path.join(PROJECT_ROOT, "assets", "dice-3d", "promoted");
const RESERVED_IDS = new Set(["angels-sword", "new-angelsword", "leaflit", "asari"]);

export const DIE_FACE_KEYS = Object.freeze({
  d4: ["face-1", "face-2", "face-3", "face-4"],
  d6: ["1", "2", "3", "4", "5", "6"],
  d8: ["1", "2", "3", "4", "5", "6", "7", "8"],
  d10: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  d100: ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"],
  d12: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
  d20: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"]
});

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeHex(value, fallback) {
  const text = String(value || "").trim();
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(text);
  if (!match) return fallback;
  const raw = match[1].length === 3 ? match[1].split("").map((part) => part + part).join("") : match[1];
  return `#${raw.toLowerCase()}`;
}

function hexNumber(value) {
  return Number.parseInt(String(value || "#000000").replace("#", ""), 16) || 0;
}

function normalizePalette(palette = {}, id = "") {
  const face = normalizeHex(palette.face, "#fff6e8");
  const trim = normalizeHex(palette.trim, "#d8a441");
  const accent = normalizeHex(palette.accent, "#77c6dc");
  const number = normalizeHex(palette.number, "#9b6a24");
  return {
    id,
    shell: hexNumber(face),
    shell2: hexNumber(accent),
    face,
    center: face,
    pearl: face,
    trim,
    edge: hexNumber(trim),
    accent,
    accent2: accent,
    gem: accent,
    number,
    glow: hexNumber(accent)
  };
}

function isEmbeddedImage(value) {
  return /^data:image\/(?:png|webp|jpe?g|svg\+xml);base64,[a-z0-9+/=\r\n]+$/i.test(String(value || ""));
}

export function validatePack(raw) {
  const errors = [];
  const id = slugify(raw?.id || raw?.name);
  if (raw?.schema !== "lyrian-dice-skin-pack/v1") errors.push("schema must be lyrian-dice-skin-pack/v1");
  if (!id) errors.push("pack id or name is required");
  if (RESERVED_IDS.has(id)) errors.push(`pack id ${id} is reserved by a built-in dice set`);
  if (!String(raw?.name || "").trim()) errors.push("pack name is required");

  let faceCount = 0;
  const suppliedDice = raw?.faces && typeof raw.faces === "object" ? Object.keys(raw.faces) : [];
  const unexpectedDice = suppliedDice.filter((die) => !DIE_FACE_KEYS[die]);
  if (unexpectedDice.length) errors.push(`pack contains unsupported dice: ${unexpectedDice.join(", ")}`);
  const availableDice = suppliedDice.filter((die) => DIE_FACE_KEYS[die]);
  if (!availableDice.length) errors.push("pack must contain at least one complete die");
  availableDice.forEach((die) => {
    const requiredFaces = DIE_FACE_KEYS[die];
    const supplied = raw.faces[die];
    if (!supplied || typeof supplied !== "object") return;
    const suppliedKeys = Object.keys(supplied);
    const missing = requiredFaces.filter((face) => !isEmbeddedImage(supplied[face]));
    const unexpected = suppliedKeys.filter((face) => !requiredFaces.includes(face));
    if (missing.length) errors.push(`${die} is missing valid embedded art for: ${missing.join(", ")}`);
    if (unexpected.length) errors.push(`${die} contains unexpected face keys: ${unexpected.join(", ")}`);
    faceCount += requiredFaces.filter((face) => isEmbeddedImage(supplied[face])).length;
  });
  if (faceCount < 1) errors.push("pack contains no valid embedded face images");
  const geometryVersion = String(raw?.geometry?.version || "");
  if (geometryVersion && geometryVersion !== "2.0.0") {
    errors.push(`geometry contract ${geometryVersion} is not compatible with 2.0.0`);
  }
  if (errors.length) {
    const error = new Error(`Dice skin validation failed:\n- ${errors.join("\n- ")}`);
    error.validationErrors = errors;
    throw error;
  }
  return {
    ...raw,
    id,
    name: String(raw.name).trim(),
    palette: normalizePalette(raw.palette, id),
    geometry: {
      contract: "lyrian-dice-geometry",
      version: "2.0.0",
      faceCount,
      d4Convention: "panel-opposite-result-vertex"
    },
    availableDice
  };
}

export function buildFaceArtMap(pack) {
  const faceArt = {};
  Object.entries(pack.faces || {}).forEach(([die, supplied]) => {
    const faces = DIE_FACE_KEYS[die] || [];
    faces.forEach((face) => {
      if (isEmbeddedImage(supplied?.[face])) faceArt[`${pack.id}:${die}:${face}`] = supplied[face];
    });
  });
  return faceArt;
}

export function buildSidecarScript(pack) {
  const faceArt = buildFaceArtMap(pack);
  return `(function (root) {\n  "use strict";\n  const faceArt = ${JSON.stringify(faceArt)};\n  root.LYRIAN_DICE_FACE_ART = Object.assign(root.LYRIAN_DICE_FACE_ART || {}, faceArt);\n}(typeof window !== "undefined" ? window : globalThis));\n`;
}

export function makeRegistryEntry(pack, generatedAt = new Date().toISOString()) {
  const cacheKey = generatedAt.replace(/[^0-9]/g, "").slice(0, 14) || "1";
  const previewUrl = pack.faces?.d20?.["20"]
    || pack.faces?.d20?.["1"]
    || Object.values(pack.faces || {}).flatMap((faces) => Object.values(faces || {}))[0]
    || "";
  return {
    id: pack.id,
    name: pack.name,
    description: pack.notes || `Created in the private Dice Builder Workshop by ${pack.author || "Angel Sword"}.`,
    author: pack.author || "",
    generatedAt,
    geometryContract: "2.0.0",
    faceCount: pack.geometry.faceCount,
    availableDice: pack.availableDice,
    previewUrl,
    faceArtScript: `assets/dice-3d/promoted/${pack.id}.js?v=${cacheKey}`,
    palette: pack.palette
  };
}

function registryCacheKey(generatedAt) {
  return String(generatedAt || "").replace(/[^0-9]/g, "").slice(0, 14) || "1";
}

function updateRegistryCacheBuster(html, generatedAt) {
  const cacheKey = registryCacheKey(generatedAt);
  return String(html).replace(
    /assets\/dice\/promoted-dice-skins\.registry\.js(?:\?v=[^"']*)?/,
    `assets/dice/promoted-dice-skins.registry.js?v=${cacheKey}`
  );
}

export function buildRegistryScript(registry) {
  const packs = Array.isArray(registry?.packs) ? registry.packs : [];
  const palettes = Object.fromEntries(packs.map((pack) => [pack.id, pack.palette]));
  return `(function (root) {\n  "use strict";\n  root.LYRIAN_PROMOTED_DICE_SKINS = ${JSON.stringify(packs, null, 2)};\n  root.LYRIAN_DICE_SKIN_PALETTES = Object.assign(root.LYRIAN_DICE_SKIN_PALETTES || {}, ${JSON.stringify(palettes, null, 2)});\n}(typeof window !== "undefined" ? window : globalThis));\n`;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeAtomic(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, content, "utf8");
  await fs.rename(temporary, file);
}

export async function promotePack(raw, options = {}) {
  const pack = validatePack(raw);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const registry = await readJson(REGISTRY_JSON, {
    format: "lyrian-promoted-dice-skins",
    version: 1,
    generatedAt: null,
    packs: []
  });
  const entry = makeRegistryEntry(pack, generatedAt);
  const packs = (registry.packs || []).filter((item) => item.id !== pack.id);
  packs.push(entry);
  packs.sort((a, b) => a.name.localeCompare(b.name));
  const nextRegistry = { ...registry, generatedAt, packs };

  const manifest = await readJson(MANIFEST_JSON, {
    format: "lyrian-dice-pack-manifest",
    version: 1,
    generatedAt,
    packs: []
  });
  const promotedManifestById = new Map(
    (manifest.packs || [])
      .filter((item) => item.promoted && item.id !== pack.id)
      .map((item) => [item.id, item])
  );
  promotedManifestById.set(pack.id, {
    id: pack.id,
    name: pack.name,
    description: entry.description,
    installed: true,
    promoted: true,
    previewUrl: entry.previewUrl,
    geometryContract: "2.0.0",
    faceCount: entry.faceCount,
    availableDice: entry.availableDice
  });
  const builtInManifestPacks = (manifest.packs || []).filter((item) => item.installed === true && !item.promoted);
  const manifestPacks = [
    ...builtInManifestPacks,
    ...packs.map((item) => promotedManifestById.get(item.id)).filter(Boolean)
  ];
  const nextManifest = { ...manifest, generatedAt, packs: manifestPacks };
  const report = {
    id: pack.id,
    name: pack.name,
    faceCount: pack.geometry.faceCount,
    availableDice: pack.availableDice,
    geometryContract: "2.0.0",
    sidecar: path.relative(PROJECT_ROOT, path.join(SIDECAR_DIR, `${pack.id}.js`)),
    dryRun: Boolean(options.dryRun)
  };
  if (options.dryRun) return report;

  const indexHtml = await fs.readFile(INDEX_HTML, "utf8");
  await writeAtomic(path.join(SIDECAR_DIR, `${pack.id}.js`), buildSidecarScript(pack));
  await writeAtomic(REGISTRY_JSON, `${JSON.stringify(nextRegistry, null, 2)}\n`);
  await writeAtomic(REGISTRY_JS, buildRegistryScript(nextRegistry));
  await writeAtomic(MANIFEST_JSON, `${JSON.stringify(nextManifest, null, 2)}\n`);
  await writeAtomic(INDEX_HTML, updateRegistryCacheBuster(indexHtml, generatedAt));
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const input = args.find((arg) => !arg.startsWith("--"));
  if (!input) {
    throw new Error("Usage: node scripts/promote-dice-skin.mjs <skin-pack.json> [--dry-run]");
  }
  const raw = JSON.parse(await fs.readFile(path.resolve(input), "utf8"));
  const report = await promotePack(raw, { dryRun });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
