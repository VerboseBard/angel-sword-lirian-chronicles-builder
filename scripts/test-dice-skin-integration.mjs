import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { DIE_FACE_KEYS, buildFaceArtMap, buildRegistryScript, buildSidecarScript, makeRegistryEntry, validatePack } from "./promote-dice-skin.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workshop = path.resolve(root, "..", "Dice Builder Workshop");
const normalize = (text) => text.replace(/\r\n/g, "\n").trimEnd();
assert.equal(
  normalize(await fs.readFile(path.join(workshop, "dice roller", "dice-geometry.js"), "utf8")),
  normalize(await fs.readFile(path.join(root, "assets", "dice-3d", "dice-geometry.js"), "utf8")),
  "character sheet geometry must be copied exactly from the Workshop contract"
);
assert.equal(
  normalize(await fs.readFile(path.join(workshop, "dice roller", "dice-roller-core.js"), "utf8")),
  normalize(await fs.readFile(path.join(root, "assets", "dice-3d", "shared-dice-roller-core.js"), "utf8")),
  "promoted character-sheet skins must use the exact Workshop roller core"
);
const sharedCoreSource = await fs.readFile(path.join(root, "assets", "dice-3d", "shared-dice-roller-core.js"), "utf8");
assert.match(
  sharedCoreSource,
  /rebuildCornerNumbers: true/,
  "shared roller must rebuild only the Angel Sword D4 numeral layer"
);
assert.match(
  sharedCoreSource,
  /sourceKey: "blank"/,
  "Angel Sword D4 must start from the canonical number-free panel"
);
assert.doesNotMatch(
  sharedCoreSource,
  /Every source panel carries one original apex number/,
  "Angel Sword D4 must not paint repair patches over already-numbered artwork at runtime"
);
assert.match(
  sharedCoreSource,
  /const corners = geo\(\)\.D4_FACE_CORNERS\[artKey\];/,
  "Angel Sword D4 numeral placement must use the same physical corner table as Asari and Leaflit"
);
assert.match(
  sharedCoreSource,
  /d10: \["0", "1", "2", "3", "4", "9", "8", "7", "6", "5"\]/,
  "D10 physical numbering must keep 0 opposite 5, 1 opposite 6, and so on"
);
assert.match(
  sharedCoreSource,
  /d100: \["00", "10", "20", "30", "40", "90", "80", "70", "60", "50"\]/,
  "D100 physical numbering must keep 00 opposite 50, 10 opposite 60, and so on"
);

const angelSwordRollerSource = await fs.readFile(path.join(root, "assets", "dice-3d", "lyrian-accurate-dice.js"), "utf8");
[
  /"1": \{ sourceLabel: "2", rotation: -turn \}/,
  /"2": \{ sourceLabel: "3", rotation: turn \}/,
  /"3": \{ sourceLabel: "1", rotation: turn \}/,
  /"4": \{ sourceLabel: "4", rotation: -turn \}/
].forEach((pattern, index) => {
  assert.match(
    angelSwordRollerSource,
    pattern,
    `Angel Sword D4 physical panel ${index + 1} must retain the approved vertex orientation`
  );
});
assert.match(
  angelSwordRollerSource,
  /const readMode = safeSides === 4 \? "vertex" : "face";/,
  "Angel Sword D4 must use the same vertex-read result convention as Asari and Leaflit"
);
assert.match(
  angelSwordRollerSource,
  /const excluded = \[0, 1, 2, 3\]\.find\(\(vertexIndex\) => !face\.indexes\.includes\(vertexIndex\)\);/,
  "Angel Sword D4 art must be assigned by its excluded result vertex, not by incidental face-array order"
);

const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
const faces = Object.fromEntries(Object.entries(DIE_FACE_KEYS).map(([die, keys]) => [die, Object.fromEntries(keys.map((key) => [key, pixel]))]));
const pack = validatePack({
  schema: "lyrian-dice-skin-pack/v1",
  id: "integration-fixture",
  name: "Integration Fixture",
  palette: { face: "#112233", trim: "#f0c45b", accent: "#58b9df", number: "#fff7df" },
  geometry: { version: "2.0.0" },
  faces
});
assert.equal(Object.keys(buildFaceArtMap(pack)).length, 70);
assert.match(buildSidecarScript(pack), /integration-fixture:d20:20/);
assert.throws(() => validatePack({ ...pack, id: "new-angelsword" }), /reserved/);
const incomplete = structuredClone(pack);
delete incomplete.faces.d20["20"];
assert.throws(() => validatePack(incomplete), /d20 is missing valid embedded art for: 20/);

const d20Only = validatePack({
  schema: "lyrian-dice-skin-pack/v1",
  id: "d20-only-fixture",
  name: "D20 Only Fixture",
  palette: { face: "#112233", trim: "#f0c45b", accent: "#58b9df", number: "#fff7df" },
  geometry: { version: "2.0.0" },
  faces: { d20: faces.d20 }
});
assert.equal(d20Only.geometry.faceCount, 20);
assert.deepEqual(d20Only.availableDice, ["d20"]);
assert.equal(Object.keys(buildFaceArtMap(d20Only)).length, 20);
assert.equal(makeRegistryEntry(d20Only, "2026-08-08T12:00:00.000Z").previewUrl, faces.d20["20"]);

const entry = makeRegistryEntry(pack, "2026-08-08T12:00:00.000Z");
const registryScript = buildRegistryScript({ packs: [entry] });
const sandbox = { globalThis: null };
sandbox.globalThis = sandbox;
vm.runInNewContext(registryScript, sandbox);
assert.equal(sandbox.LYRIAN_PROMOTED_DICE_SKINS[0].id, "integration-fixture");
assert.equal(sandbox.LYRIAN_DICE_SKIN_PALETTES["integration-fixture"].face, "#112233");

// Validate the actual deployed full sets, not just a synthetic fixture. Every
// required key must exist and every face within a die must have distinct
// encoded pixels. This catches accidental duplicate-number artwork even when
// the object keys themselves look correct.
const deployedRegistry = JSON.parse(await fs.readFile(path.join(root, "assets", "dice", "promoted-dice-skins.json"), "utf8"));
assert.deepEqual(
  deployedRegistry.packs.map((item) => item.id),
  ["asari-full-set-draft", "leaflit-full-set", "rana-full-set"],
  "the public selector must publish only the three complete custom sets"
);
const deployedManifest = JSON.parse(await fs.readFile(path.join(root, "assets", "dice", "dice-pack-manifest.json"), "utf8"));
assert.deepEqual(
  deployedManifest.packs.map((item) => item.id),
  ["new-angelsword", "asari-full-set-draft", "leaflit-full-set", "rana-full-set"],
  "the public dice catalog must contain exactly Angel Sword, Asari, Leaflit, and Rana"
);
async function assertDeployedFullSet(id, expectedName) {
  const registryEntry = deployedRegistry.packs.find((item) => item.id === id);
  assert.ok(registryEntry, `the deployed ${expectedName} must be registered`);
  assert.equal(registryEntry.name, expectedName);
  assert.equal(registryEntry.faceCount, 70);
  assert.deepEqual(registryEntry.availableDice, Object.keys(DIE_FACE_KEYS));

  const sidecarSandbox = { globalThis: null };
  sidecarSandbox.globalThis = sidecarSandbox;
  vm.runInNewContext(
    await fs.readFile(path.join(root, "assets", "dice-3d", "promoted", `${id}.js`), "utf8"),
    sidecarSandbox
  );
  const deployedArt = sidecarSandbox.LYRIAN_DICE_FACE_ART || {};
  assert.equal(Object.keys(deployedArt).length, 70, `the deployed ${expectedName} sidecar must contain exactly 70 textures`);
  Object.entries(DIE_FACE_KEYS).forEach(([die, keys]) => {
    const textures = keys.map((key) => deployedArt[`${id}:${die}:${key}`]);
    assert.ok(textures.every(Boolean), `${expectedName} ${die} must contain every required face key`);
    assert.equal(new Set(textures).size, keys.length, `${expectedName} ${die} must not reuse a texture for two results`);
  });
}

await assertDeployedFullSet("asari-full-set-draft", "Asari Full Set");
await assertDeployedFullSet("leaflit-full-set", "Leaflit Full Set");
await assertDeployedFullSet("rana-full-set", "Rana Full Set");

const geometrySandbox = { globalThis: null };
geometrySandbox.globalThis = geometrySandbox;
vm.runInNewContext(
  await fs.readFile(path.join(root, "assets", "dice-3d", "dice-geometry.js"), "utf8"),
  geometrySandbox
);
assert.equal(JSON.stringify(geometrySandbox.LyrianDiceGeometry.D4_FACE_CORNERS), JSON.stringify({
  "face-1": { apex: "2", right: "4", left: "3" },
  "face-2": { apex: "1", right: "3", left: "4" },
  "face-3": { apex: "1", right: "4", left: "2" },
  "face-4": { apex: "1", right: "2", left: "3" }
}), "D4 panels must retain the vertex-read orientation table");

const legacyCalls = [];
const sharedCalls = [];
const routerSandbox = {
  globalThis: null,
  LyrianLegacyDiceRoller: {
    rollDice(options) { legacyCalls.push(options.setId); return 11; },
    buildPreviewDataUrl() { return "legacy"; },
    preloadFaceArt() { return 1; },
    clear() {},
    getStatus() { return { kind: "legacy" }; }
  },
  LyrianAccurateDiceRoller: {
    rollDice(options) { sharedCalls.push(options.setId); return 22; },
    buildPreviewDataUrl() { return "shared"; },
    preloadFaceArt() { return 70; },
    clear() {},
    getStatus() { return { kind: "shared" }; }
  },
  LYRIAN_PROMOTED_DICE_SKINS: [{ id: "integration-fixture" }]
};
routerSandbox.globalThis = routerSandbox;
routerSandbox.window = routerSandbox;
const routerSource = await fs.readFile(path.join(root, "assets", "dice-3d", "dice-roller-router.js"), "utf8");
vm.runInNewContext(routerSource, routerSandbox);
assert.equal(routerSandbox.LyrianAccurateDiceRoller.rollDice({ setId: "new-angelsword" }), 22);
assert.equal(routerSandbox.LyrianAccurateDiceRoller.rollDice({ setId: "integration-fixture" }), 22);
assert.deepEqual(legacyCalls, []);
assert.deepEqual(sharedCalls, ["new-angelsword", "integration-fixture"]);

console.log("Dice promotion, shared-core, registry, and routing tests passed.");
