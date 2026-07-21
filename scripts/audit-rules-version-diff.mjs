import fs from "node:fs/promises";
import path from "node:path";

const [previousRootArg, currentRootArg, outputArg] = process.argv.slice(2);
if (!previousRootArg || !currentRootArg || !outputArg) {
  console.error("Usage: node scripts/audit-rules-version-diff.mjs <previous-data-root> <current-data-root> <output.md>");
  process.exit(2);
}

const previousRoot = path.resolve(previousRootArg);
const currentRoot = path.resolve(currentRootArg);
const outputPath = path.resolve(outputArg);
const ignoredRawMirrors = new Set([
  "content",
  "description",
  "descriptions",
  "guide",
  "requirement",
  "requirements",
  "lore",
  "strategy",
  "runningMonster"
]);
const ignoredRecordKeys = new Set([
  "id",
  "indexId",
  "ability",
  "ability1",
  "ability2",
  "ability3",
  "ultimateAbility",
  "keyAbility",
  "trait1",
  "trait2",
  "trait3"
]);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function identity(record, index) {
  const explicitId = Object.entries(record || {}).find(([key, value]) =>
    key !== "id" && key !== "indexId" && /Id$/.test(key) && value
  )?.[1];
  return String(explicitId || record?.name || record?.title || record?.id || record?.indexId || `record-${index}`);
}

function label(record, fallback) {
  return String(record?.name || record?.title || record?.versionNumber || fallback);
}

function semanticKeys(record) {
  return Object.keys(record || {}).filter((key) => {
    if (ignoredRecordKeys.has(key)) return false;
    if (!ignoredRawMirrors.has(key)) return true;
    return !(`${key}Text` in record) && !(`${key}Html` in record);
  });
}

function summarize(value, limit = 260) {
  const text = typeof value === "string" ? value : stable(value);
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "(empty)";
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function listJsonFiles(root) {
  return (await fs.readdir(path.join(root, "decoded")))
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function compareArrays(previous, current) {
  const before = new Map(previous.map((record, index) => [identity(record, index), record]));
  const after = new Map(current.map((record, index) => [identity(record, index), record]));
  const added = [];
  const removed = [];
  const changed = [];

  for (const [id, record] of after) {
    if (!before.has(id)) {
      added.push({ id, name: label(record, id) });
      continue;
    }
    const previousRecord = before.get(id);
    const keys = Array.from(new Set([...semanticKeys(previousRecord), ...semanticKeys(record)])).sort();
    const fields = keys.filter((key) => stable(previousRecord[key]) !== stable(record[key]));
    if (fields.length) {
      changed.push({
        id,
        name: label(record, id),
        fields,
        values: Object.fromEntries(fields.map((field) => [field, {
          before: summarize(previousRecord[field]),
          after: summarize(record[field])
        }]))
      });
    }
  }
  for (const [id, record] of before) {
    if (!after.has(id)) removed.push({ id, name: label(record, id) });
  }
  return { before: previous.length, after: current.length, added, removed, changed };
}

function compareObjects(previous, current) {
  const keys = Array.from(new Set([...semanticKeys(previous), ...semanticKeys(current)])).sort();
  const fields = keys.filter((key) => stable(previous[key]) !== stable(current[key]));
  return {
    before: 1,
    after: 1,
    added: [],
    removed: [],
    changed: fields.length ? [{
      id: current.id || previous.id || "document",
      name: "document",
      fields,
      values: Object.fromEntries(fields.map((field) => [field, {
        before: summarize(previous[field]),
        after: summarize(current[field])
      }]))
    }] : []
  };
}

const previousManifest = await readJson(path.join(previousRoot, "manifest.json"));
const currentManifest = await readJson(path.join(currentRoot, "manifest.json"));
const currentPatchNotes = await readJson(path.join(currentRoot, "decoded", "patch_notes.json"));
const currentAncestries = await readJson(path.join(currentRoot, "joined", "ancestry_details_resolved.json"));
const selkie = currentAncestries.find((entry) => entry.name === "Selkie");
const selkieStillReferencesAquaDrill = /aqua drill/i.test(stable(selkie));
const patchSaysAquaDrillRemoved = /aqua drill removed/i.test(currentPatchNotes.contentText || "");
const commonFiles = await listJsonFiles(currentRoot);
const results = [];

for (const file of commonFiles) {
  const previousPath = path.join(previousRoot, "decoded", file);
  try {
    await fs.access(previousPath);
  } catch {
    continue;
  }
  const [previous, current] = await Promise.all([
    readJson(previousPath),
    readJson(path.join(currentRoot, "decoded", file))
  ]);
  const diff = Array.isArray(previous) && Array.isArray(current)
    ? compareArrays(previous, current)
    : compareObjects(previous, current);
  if (diff.added.length || diff.removed.length || diff.changed.length) {
    results.push({ file, ...diff });
  }
}

const lines = [
  `# Rules Data Audit: ${previousManifest.latestVersion} → ${currentManifest.latestVersion}`,
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "This report compares every decoded official API collection by stable record ID. Raw base64 mirrors are omitted when decoded text/HTML companions exist.",
  "",
  "## Cross-reference Findings",
  "",
  ...(selkieStillReferencesAquaDrill && patchSaysAquaDrillRemoved ? [
    "- Official-source inconsistency: the 0.13.1 patch notes say Selkie's Aqua Drill and Water Mastery were removed and replaced by Blue Soul. The live Selkie detail replaces the third trait with Blue Soul but its first trait still refers to Aqua Drill. The pulled data is preserved unchanged and the discrepancy is flagged for a future official correction.",
    ""
  ] : []),
  "- The new granted-class wording is mechanically different from the earlier 0-EXP unlock wording: a class granted at level 1 consumes neither EXP nor an Interlude Point, while legacy 0-EXP unlocks can still consume their stated Interlude Point.",
  "- Divine's Chosen is a zero-EXP selection with a permanent deity choice. Its chosen damage type also controls the elemental mastery awarded when Acolyte is mastered.",
  "",
  "## Count Changes",
  "",
  "| Collection | Before | After | Delta |",
  "|---|---:|---:|---:|"
];

const countKeys = Array.from(new Set([
  ...Object.keys(previousManifest.counts || {}),
  ...Object.keys(currentManifest.counts || {})
]));
for (const key of countKeys) {
  const before = Number(previousManifest.counts?.[key] || 0);
  const after = Number(currentManifest.counts?.[key] || 0);
  if (before !== after) lines.push(`| ${key} | ${before} | ${after} | ${after - before >= 0 ? "+" : ""}${after - before} |`);
}

for (const result of results) {
  lines.push("", `## ${result.file}`, "", `Records: ${result.before} → ${result.after}; added ${result.added.length}, removed ${result.removed.length}, modified ${result.changed.length}.`);
  if (result.added.length) {
    lines.push("", "Added:", "", ...result.added.map((entry) => `- ${entry.name} (${entry.id})`));
  }
  if (result.removed.length) {
    lines.push("", "Removed:", "", ...result.removed.map((entry) => `- ${entry.name} (${entry.id})`));
  }
  if (result.changed.length) {
    lines.push("", "Modified:", "");
    for (const entry of result.changed) {
      lines.push(`- ${entry.name} (${entry.id}): ${entry.fields.join(", ")}`);
      for (const field of entry.fields) {
        const value = entry.values[field];
        lines.push(`  - ${field}: “${value.before.replaceAll("“", "'").replaceAll("”", "'")}” → “${value.after.replaceAll("“", "'").replaceAll("”", "'")}”`);
      }
    }
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({
  previousVersion: previousManifest.latestVersion,
  currentVersion: currentManifest.latestVersion,
  changedFiles: results.length,
  outputPath
}, null, 2));
