// Task 025 regression checks (F1-F8). Each section was written to FAIL on the
// pre-fix code and PASS after its fix. Style follows test-patch-0132-ui.mjs:
// the real src/js is bundled in memory with a small test-only hook block
// appended to ui.js (nothing in the shipped source is altered for testing),
// then driven in Chromium through the real page.
//
// Run:  node scripts/test-025-fixes.mjs        (npm run test:025)
// Env:  T25_PORT (default 4230), T25_ONLY=F1,F3 to run chosen sections.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";
import { normalizeAscharCharacter } from "../src/js/aschar.js";

const root =path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "qa-test-results/task-025-fixes");
await mkdir(output, { recursive: true });
const only = new Set(String(process.env.T25_ONLY || "").split(",").map(value => value.trim().toUpperCase()).filter(Boolean));
const wants = section => only.size === 0 || only.has(section);

const results = [];
const failures = [];
// Failures are recorded (not thrown) so one run shows the whole before/after
// picture for every fix.
const check = (name, actual, expected) => {
  try {
    assert.deepEqual(actual, expected, name);
    results.push({ name, ok: true });
  } catch (error) {
    failures.push({ name, actual, expected });
    results.push({ name, ok: false, actual, expected });
    const short = value => { const text = JSON.stringify(value) ?? "undefined"; return text.length > 500 ? `${text.slice(0, 500)}... (${text.length} chars)` : text; };
    console.log(`  FAIL ${name}\n       actual:   ${short(actual)}\n       expected: ${short(expected)}`);
  }
};
const section = title => console.log(`\n== ${title}`);

// ---------------------------------------------------------------------------
// Test-only hooks, appended to ui.js in the in-memory bundle.
// ---------------------------------------------------------------------------
const hooks = `
import { loadSavedState as __t25LoadSavedState, handleImportedCharacterFile as __t25ImportFile } from "./io.js";
import { mergeBuilderState as __t25MergeBuilder } from "./state.js";
import { ensureSpreadsheetRuntimeLoaded as __t25LoadXlsx, ensurePdfRuntimeLoaded as __t25LoadPdf } from "./runtime-loader.js";
window.__t25 = {
  fixture(input = {}) {
    const revision = (state.revision || 0) + 1;
    const defaults = createDefaultState();
    Object.assign(state, defaults, input);
    state.revision = revision;
    state.fields = { ...defaults.fields, ...(input.fields || {}) };
    state.ui = { ...defaults.ui, gameVersion: "0.13.2", ...(input.ui || {}) };
    state.builder = __t25MergeBuilder({ ...defaults.builder, ...(input.builder || {}) });
    state.play = mergePlayState(input.play || {});
  },
  sync: syncBuilderSelectionsIntoSheet,
  bonuses: getComputedBonuses,
  rollInitiative() { rollPlayCheck("initiative"); return { top: state.play.log[0], derivedInitiative: getDerivedCombatStats().initiative }; },
  tracked() { return getTrackedLearnedAbilityRecords().map(entry => ({ name: entry.name, source: entry.sourceLabel })); },
  playAbilities() { return getQuickPlayAbilities().map(entry => ({ name: entry.name, source: entry.source })); },
  derived: getDerivedCombatStats,
  ccs() {
    return {
      map: buildCcsCellMap(),
      derived: getDerivedCombatStats(),
      agility: getComputedMainStatValue("Agility"),
      toughness: getComputedMainStatValue("Toughness"),
      notes: [...ccsExportNotes]
    };
  },
  exportCcs: exportCcsState,
  render: renderBuilder,
  async makeXlsxBase64(sheets) {
    await __t25LoadXlsx();
    const workbook = window.XLSX.utils.book_new();
    for (const [name, cells] of Object.entries(sheets)) {
      const sheet = { "!ref": "A1:P120" };
      for (const [address, value] of Object.entries(cells)) {
        sheet[address] = { t: typeof value === "number" ? "n" : "s", v: value };
      }
      window.XLSX.utils.book_append_sheet(workbook, sheet, name);
    }
    return window.XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
  },
  xlsxPayload(sheets) {
    const workbook = { Sheets: {} };
    for (const [name, cells] of Object.entries(sheets)) {
      workbook.Sheets[name] = Object.fromEntries(Object.entries(cells).map(([address, value]) => [address, { t: typeof value === "number" ? "n" : "s", v: value }]));
    }
    return buildSpreadsheetImportPayload(workbook);
  },
  pdfPayload(fields) { return buildPdfImportPayload(fields); },
  async editXlsxCell(base64, sheetPath, address, newText) {
    await __t25LoadXlsx({ includeExportAssets: true });
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const zip = await window.JSZip.loadAsync(bytes);
    const xml = await zip.file(sheetPath).async("string");
    const pattern = new RegExp("(<c r=\\"" + address + "\\"[^>]*>\\\\s*<is>\\\\s*<t[^>]*>)[^<]*(</t>)");
    if (!pattern.test(xml)) throw new Error("cell " + address + " is not an inline string");
    zip.file(sheetPath, xml.replace(pattern, "$1" + newText + "$2"));
    return zip.generateAsync({ type: "base64" });
  },
  exportPdf: exportPdfState,
  // Takes a PDF this builder exported, removes the embedded full-state fields (so the
  // import must read the visible form fields, like a hand-edited sheet) and edits fields.
  async editPdf(base64, edits) {
    await __t25LoadPdf();
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const doc = await window.PDFLib.PDFDocument.load(bytes);
    const form = doc.getForm();
    for (const field of form.getFields()) {
      const name = field.getName();
      if (name === "_LyrianState" || name === PDF_STATE_MANIFEST_FIELD || name.startsWith(PDF_STATE_CHUNK_FIELD_PREFIX)) {
        form.removeField(field);
      }
    }
    for (const [name, value] of Object.entries(edits)) {
      form.getTextField(name).setText(value);
    }
    const out = await doc.save({ updateFieldAppearances: false });
    let binary = "";
    out.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  },
  importNotes(parsed) { return typeof collectUnmatchedImportEntryNotes === "function" ? collectUnmatchedImportEntryNotes(captureImportEntryReferences(parsed)) : []; },
  classRowCount() { return CLASS_ROWS.length; },
  importModal() {
    const modal = document.getElementById("sheet-modal");
    return {
      open: !modal.hidden && !modal.classList.contains("is-hidden"),
      eyebrow: document.getElementById("sheet-modal-eyebrow").textContent,
      title: document.getElementById("sheet-modal-title").textContent,
      items: [...modal.querySelectorAll("#sheet-modal-content li")].map(item => item.textContent.replace(/\\s+/g, " ").trim())
    };
  },
  closeModal() { document.getElementById("sheet-modal").hidden = true; document.getElementById("sheet-modal").classList.add("is-hidden"); document.getElementById("sheet-modal-content").innerHTML = ""; },
  toggleBreakthrough: toggleBuilderBreakthrough,
  breakthroughMet(id) { return getBreakthroughRequirementStatus(lookup.breakthroughs.resolve(id)).met; },
  setAncestry(id) { state.builder.selectedAncestryId = id; syncBuilderSelectionsIntoSheet(); },
  attention() { return getBuilderAttentionNotes().map(note => ({ title: note.title, text: note.text })); },
  classBudget() { const budget = getClassUnlockBudgetState(); return { spentExp: budget.spentExp, remainingExp: budget.remainingExp, perClass: getSelectedClassProgress().map(entry => [entry.record.id, entry.cost]) }; },
  snapshot() { return JSON.parse(serializeCurrentState()); },
  storable() { return createStorableStateSnapshot(); },
  compact(snapshot) { return createCompactSnapshotFromStateSnapshot(snapshot); },
  defaults() { return JSON.parse(JSON.stringify(createDefaultState())); },
  async embedded() {
    const pkg = await buildEmbeddedStatePackage();
    return JSON.parse(await decodeEmbeddedStateText(pkg.chunks.join(""), pkg.encoding));
  },
  exportXlsx: exportSpreadsheetState,
  async importBytes(name, base64) {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    return __t25ImportFile(new File([bytes], name));
  },
  loadObject(parsed, options = {}) { return __t25LoadSavedState(parsed, { activeSlotId: "", statusOnFailure: false, ...options }); },
  async saveSlot(name) { const slot = await saveCurrentCharacterToNewSlot(name); return slot ? { id: slot.id, name: slot.name } : null; },
  summary() {
    const funds = getStartingFundsState();
    return {
      startMode: state.builder.startMode,
      startModeId: getCharacterStartMode().id,
      startingClim: funds.startingClim,
      campaignBonusClim: funds.campaignBonusClim,
      creationInterludeActions: [...state.builder.creationInterludeActions],
      classAbilityProgress: { ...state.builder.classAbilityProgress },
      autoSpiritCore: state.builder.autoSpiritCore,
      autoExpBank: state.builder.autoExpBank,
      activeEffects: state.play.activeEffects.map(effect => effect.id),
      foodUsedSinceRest: state.play.foodUsedSinceRest,
      quickBuild: state.builder.quickBuild,
      roll20: { id: state.play.roll20TokenId, name: state.play.roll20TokenName, sync: state.play.roll20TokenSync, tracker: state.play.roll20TurnTracker },
      activeSlot: state.ui.activeSaveSlotId
    };
  }
};`;

const bundle = await build({
  absWorkingDir: root,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "task025-test-access", setup(buildApi) {
    buildApi.onLoad({ filter: /[/\\]src[/\\]js[/\\]ui\.js$/ }, async ({ path: file }) => ({
      contents: await readFile(file, "utf8") + hooks, loader: "js"
    }));
  } }]
});

export function unzip(bytes) {
  const result = new Map();
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  assert(end >= 0, "XLSX ZIP end record exists");
  let at = bytes.readUInt32LE(end + 16);
  for (let count = bytes.readUInt16LE(end + 10); count > 0; count--) {
    const method = bytes.readUInt16LE(at + 10);
    const size = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + size);
    result.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

const port = Number(process.env.T25_PORT || 4230);
const url = `http://127.0.0.1:${port}/`;
const server = fork(path.join(root, "scripts/server.mjs"), [], {
  cwd: root, env: { ...process.env, LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" }, silent: true
});
let serverLog = "";
server.stdout.on("data", data => { serverLog += data; });
server.stderr.on("data", data => { serverLog += data; });
let browser;
try {
  for (let retry = 0; ; retry++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    if (retry === 80 || server.exitCode !== null) throw new Error(`Test server failed: ${serverLog}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/assets/app.bundle.js*", route => route.fulfill({
    contentType: "application/javascript", body: bundle.outputFiles[0].text
  }));
  const ready = async () => {
    await page.waitForFunction(() => window.__t25 && window.LYRIAN_DATA?.version === "0.13.2");
    await page.waitForTimeout(1600); // the production idle sheet build
  };
  await page.goto(url, { waitUntil: "load" });
  await ready();
  const fixture = input => page.evaluate(value => window.__t25.fixture(value), input);
  const call = (name, ...args) => page.evaluate(([fn, argList]) => window.__t25[fn](...argList), [name, args]);

  // =========================================================================
  // F1: save slots and the embedded export package keep every field that
  // matters on reload.
  // =========================================================================
  if (wants("F1")) {
    section("F1 save slots / embedded package field coverage");
    const effect = {
      id: "fx-t25-1", name: "Bear Elixir", source: "Bear Elixir", summary: "Test effect",
      duration: "Encounter", tone: "buff", createdAt: "2026-10-08T00:00:00.000Z",
      rules: { id: "bear", modifiers: { rpMax: 1 } }
    };
    const miraneFixture = {
      fields: { Name: "Mirane Slot Test" },
      builder: {
        startMode: "mirane", selectedRaceId: "human",
        selectedClassIds: ["fighter"], classAbilityProgress: { fighter: 3 },
        creationInterludeActions: ["train"],
        quickBuild: { speciesId: "human", buildId: "t25", appliedBuildId: "t25", summary: "Quick build summary", classPrerequisiteSource: "" }
      },
      play: {
        activeEffects: [effect], foodUsedSinceRest: true,
        roll20TokenId: "-Tok123", roll20TokenName: "Pin Name", roll20TokenSync: true, roll20TurnTracker: true
      }
    };
    const expectMirane = (label, summary) => {
      check(`${label}: still Mirane`, [summary.startMode, summary.startModeId], ["mirane", "mirane"]);
      check(`${label}: Mirane starts with 4000 Clim`, summary.startingClim, 4000);
      check(`${label}: creation interlude actions kept`, summary.creationInterludeActions, ["train"]);
      check(`${label}: class ability progress kept`, summary.classAbilityProgress, { fighter: 3 });
      check(`${label}: active effects kept`, summary.activeEffects, ["fx-t25-1"]);
      check(`${label}: food-used flag kept`, summary.foodUsedSinceRest, true);
      check(`${label}: quick build review kept`, [summary.quickBuild.appliedBuildId, summary.quickBuild.summary], ["t25", "Quick build summary"]);
      check(`${label}: Roll20 token pin kept`, summary.roll20, { id: "-Tok123", name: "Pin Name", sync: true, tracker: true });
    };

    // 1) The compact snapshot itself, in isolation.
    await fixture(miraneFixture);
    await call("sync");
    const autoBefore = await call("summary");
    check("F1 fixture sanity: the auto EXP / Spirit Core fields exist before saving", [Boolean(autoBefore.autoSpiritCore), Boolean(autoBefore.autoExpBank)], [true, true]);
    const storable = await call("storable");
    check("Compact snapshot carries builder.startMode", storable.builder?.startMode, "mirane");
    check("Compact snapshot carries builder.classAbilityProgress", storable.builder?.classAbilityProgress, { fighter: 3 });
    check("Compact snapshot carries builder.creationInterludeActions", storable.builder?.creationInterludeActions, ["train"]);
    check("Compact snapshot carries builder.autoSpiritCore", storable.builder?.autoSpiritCore, autoBefore.autoSpiritCore);
    check("Compact snapshot carries builder.autoExpBank", storable.builder?.autoExpBank, autoBefore.autoExpBank);
    check("Compact snapshot carries play.activeEffects", (storable.play?.activeEffects || []).map(entry => entry.id), ["fx-t25-1"]);

    // 2) Coverage audit: every top-level builder/play key the app owns must be
    //    in the compact snapshot unless it is on this short, deliberate list of
    //    view-only keys. A new state field added later without a snapshot entry
    //    fails here instead of silently vanishing from saves.
    const defaults = await call("defaults");
    const viewOnly = {
      builder: ["inspected", "searches"], // searches keeps only the two stat-mode toggles on purpose
      play: []
    };
    const mark = value => {
      if (Array.isArray(value)) return ["x"];
      if (value && typeof value === "object") {
        const keys = Object.keys(value);
        return Object.fromEntries((keys.length ? keys : ["x"]).map(key => [key, mark(value[key] ?? "x")]));
      }
      if (typeof value === "boolean") return true;
      if (typeof value === "number") return 7;
      return "x";
    };
    const probe = JSON.parse(JSON.stringify(defaults));
    probe.builder = mark(defaults.builder);
    probe.play = mark(defaults.play);
    probe.builder.importedFinalStats = true;
    const probeCompact = await call("compact", probe);
    for (const area of ["builder", "play"]) {
      const missing = Object.keys(defaults[area]).filter(key => !viewOnly[area].includes(key) && !(key in (probeCompact[area] || {})));
      check(`Compact snapshot covers every default ${area} key (only deliberate view-only keys omitted)`, missing, []);
    }
    check("Compact snapshot still omits the two view-only builder keys", viewOnly.builder.filter(key => key === "inspected" && key in probeCompact.builder), []);

    // 3) The real flow: save to a named slot, reload the page, the slot
    //    restores the character.
    await fixture(miraneFixture);
    await call("sync");
    const slot = await call("saveSlot", "T25 Mirane");
    check("Named slot was created and became the active slot", Boolean(slot?.id), true);
    await page.reload({ waitUntil: "load" });
    await ready();
    expectMirane("Slot reload", await call("summary"));

    // 4) The embedded export package (XLSX/PDF round-trip payload).
    await fixture(miraneFixture);
    await call("sync");
    const embedded = await call("embedded");
    check("Embedded package carries builder.startMode", embedded.builder?.startMode, "mirane");
    await fixture({});
    check("Fixture reset really cleared Mirane (guards against a vacuous pass)", (await call("summary")).startMode, "standard");
    check("Embedded package loads back", await call("loadObject", embedded), true);
    expectMirane("Embedded package reload", await call("summary"));

    // 4b) The same through a real exported .xlsx file and the Import button's code path.
    await fixture(miraneFixture);
    await call("sync");
    const xlsxDownload = page.waitForEvent("download");
    await call("exportXlsx");
    const xlsxFile = await xlsxDownload;
    const xlsxPath = path.join(output, "f1-mirane-roundtrip.xlsx");
    await xlsxFile.saveAs(xlsxPath);
    await fixture({});
    check("XLSX import reports success", await page.evaluate(async base64 => window.__t25.importBytes("f1-mirane-roundtrip.xlsx", base64), (await readFile(xlsxPath)).toString("base64")), true);
    await page.waitForTimeout(300);
    expectMirane("Real .xlsx export then import", await call("summary"));

    // 5) Backwards compatibility (D4): a slot written by the old code has none
    //    of the new fields and must load exactly as before.
    const legacy = { ui: { gameVersion: "0.13.2" }, fields: { Name: "Old save" }, abilitySelections: {}, builder: { selectedRaceId: "human", selectedClassIds: ["fighter"], selectedItemIds: [], selectedBreakthroughIds: [] }, play: { resources: {} } };
    check("Old-format save loads", await call("loadObject", legacy), true);
    const legacySummary = await call("summary");
    check("Old-format save loads as Standard with defaults", [legacySummary.startMode, legacySummary.startingClim, legacySummary.activeEffects, legacySummary.creationInterludeActions], ["standard", 3000, [], []]);
  }


  // =========================================================================
  // F5: Great Shield dodge (and the other defensive gear) follow the item text.
  // =========================================================================
  if (wants("F5")) {
    section("F5 equipped gear: guard / block / initiative / evasion / dodge");
    const gear = id => ({
      fields: { Name: "Gear test" },
      builder: { selectedRaceId: "human", selectedItemIds: id ? [id] : [] },
      play: { inventoryItems: id ? [{ uid: `t25-${id}`, itemId: id, quantity: 1, equipped: true }] : [] }
    });
    const readDerived = async id => {
      await fixture(gear(id));
      await call("sync");
      return page.evaluate(() => {
        const derived = window.__t25.bonuses().derived;
        return { guard: derived.guard, block: derived.block, initiative: derived.initiative, evasion: derived.evasion, dodge: derived.dodge };
      });
    };
    const baseline = await readDerived("");
    const delta = async id => {
      const worn = await readDerived(id);
      return Object.fromEntries(Object.keys(worn).map(key => [key, worn[key] - baseline[key]]));
    };
    // Expected values are the item text in rules 0.13.2 (item_details.json).
    check("Armor (Light): +1 guard, +4 block, -1 initiative, -2 evasion and dodge", await delta("armor--light-"), { guard: 1, block: 4, initiative: -1, evasion: -2, dodge: -2 });
    check("Armor (Medium): +2 guard, +8 block, -2 initiative, -4 evasion and dodge", await delta("armor--medium-"), { guard: 2, block: 8, initiative: -2, evasion: -4, dodge: -4 });
    check("Armor (Heavy): +3 guard, +12 block, -3 initiative, -6 evasion and dodge", await delta("armor--heavy-"), { guard: 3, block: 12, initiative: -3, evasion: -6, dodge: -6 });
    check("Shield: +4 block and nothing else", await delta("shield"), { guard: 0, block: 4, initiative: 0, evasion: 0, dodge: 0 });
    // The sheet's Block value is the value used when taking the Block action, so
    // the Great Shield's "increased to 8" while blocking is shown as +8 Block (a
    // documented design choice in collectComputedTextBonuses, not part of F5).
    check("Shield (Great): +1 guard, +8 block (while Blocking), -1 initiative, -2 evasion, -2 dodge", await delta("shield--great-"), { guard: 1, block: 8, initiative: -1, evasion: -2, dodge: -2 });
  }


  // =========================================================================
  // F6: Human-Chimera Hybrid does not get Human Adaptability.
  // =========================================================================
  if (wants("F6")) {
    section("F6 Human-Chimera Hybrid and Human Adaptability");
    const human = extra => ({ fields: { Name: "Hybrid test" }, builder: { selectedRaceId: "human", ...extra } });
    const names = async fn => (await call(fn)).map(entry => entry.name);
    await fixture(human({}));
    await call("sync");
    check("Plain Human lists Human Adaptability (learned list)", (await names("tracked")).includes("Human Adaptability"), true);
    check("Plain Human lists Human Adaptability (play list)", (await names("playAbilities")).includes("Human Adaptability"), true);
    await fixture(human({ selectedBreakthroughIds: ["human-chimera-hybrid--race-"], choiceSelections: { "breakthrough-human-chimera-hybrid--race--chimera-subrace": "pigfolk" } }));
    await call("sync");
    const held = await page.evaluate(() => window.__t25.snapshot().builder.selectedBreakthroughIds);
    check("Fixture sanity: the hybrid breakthrough is actually held", held.includes("human-chimera-hybrid--race-"), true);
    check("Hybrid does not list Human Adaptability (learned list)", (await names("tracked")).includes("Human Adaptability"), false);
    check("Hybrid does not list Human Adaptability (play list)", (await names("playAbilities")).includes("Human Adaptability"), false);
    check("Hybrid keeps Divine Providence (the official text says it is kept)", (await names("playAbilities")).includes("Divine Providence"), true);
    check("Hybrid keeps its other Human race abilities in the learned list", (await names("tracked")).includes("Divine Providence"), true);
  }


  // =========================================================================
  // F8a: the initiative roll breakdown no longer calls the whole modifier
  // "Agility".
  // =========================================================================
  if (wants("F8")) {
    section("F8 initiative breakdown label");
    // Agility 6 in Light armor (-1 Initiative): the modifier is +5, of which
    // Agility is +6 and the armor is -1 (the January complaint: "+5 but she
    // has 6 agi").
    await fixture({
      fields: { Name: "Initiative test", Agility: "6" },
      builder: { selectedRaceId: "human", selectedItemIds: ["armor--light-"] },
      play: { inventoryItems: [{ uid: "t25-light", itemId: "armor--light-", quantity: 1, equipped: true }] }
    });
    await call("sync");
    const rolled = await call("rollInitiative");
    const lines = rolled.top.lines.join(" | ");
    const mod = rolled.derivedInitiative;
    check("Fixture sanity: initiative modifier is +5 (Agility 6, armor -1)", mod, 5);
    check("Initiative breakdown shows the real Agility modifier (+6), not the whole +5", /Agility: \+6\b/.test(lines), true);
    // Task 036: the armor part is now named ("Armor (Light) equipped: -1"); it used
    // to sit in an "Other initiative modifiers" lump.
    check("Initiative breakdown shows the armor/other part (-1) on its own", /(?:other|armor)[^|]*: -1\b/i.test(lines), true);
    check("Initiative breakdown no longer attributes the whole +5 to Agility", /Agility: \+5\b/.test(lines), false);

    // F8b: an .aschar class entry with neither id nor name used to vanish with
    // no note (aschar.js). The pure module runs under Node, so no browser needed.
    section("F8 .aschar entries with no id/name get a note");
    const plan = normalizeAscharCharacter({
      name: "Nameless rows", race: { primaryRaceName: "Human" }, mainStats: {}, subStats: {},
      classes: [{ classId: "", name: "", levels: 3 }, { classId: "fighter", name: "Fighter", levels: 2 }, { levels: 1 }],
      breakthroughs: [{ breakthroughId: "", name: "" }, { breakthroughId: "weapon-training", name: "Weapon Training" }],
      equipment: [{ itemId: "", name: "", qty: 1 }, { itemId: "shield", name: "Shield", qty: 1 }]
    });
    check("The usable class is still imported", plan.classes.map(entry => entry.classId), ["fighter"]);
    check("Dropped class entries are reported (2 with no id/name)", plan.notes.filter(note => /class/i.test(note) && /no (class )?id or name/i.test(note) && /\b2\b/.test(note)).length, 1);
    check("Dropped breakthrough entry is reported", plan.notes.filter(note => /breakthrough/i.test(note) && /no (breakthrough )?id or name/i.test(note)).length, 1);
    check("Dropped item entry is reported", plan.notes.filter(note => /item/i.test(note) && /no name/i.test(note)).length, 1);
    const cleanPlan = normalizeAscharCharacter({ name: "Clean", race: { primaryRaceName: "Human" }, mainStats: {}, subStats: {}, classes: [{ classId: "fighter", name: "Fighter", levels: 2 }] });
    check("A clean file adds no drop notes", cleanPlan.notes.filter(note => /no (class |breakthrough )?(id or )?name/i.test(note)), []);
  }

  // =========================================================================
  // F2: xlsx / pdf / JSON-state imports report what did not match instead of
  // dropping it silently, and the xlsx import reads every class row.
  // =========================================================================
  if (wants("F2")) {
    section("F2 import notes and the full class-row range");
    const rowCount = await call("classRowCount");
    check("The builder holds 13 class rows (the CCS has 21, Core!A15:A35)", rowCount, 13);
    const valid = ["Fighter", "Mage", "Not A Real Class", "Medic", "Gunslinger", "Fencer", "Lancer", "Sniper", "Deadeye", "Pyromancer", "Geomancer", "Aeromancer", "Windbringer"];
    const extra = ["Zephyr Warder", "Granite Warden", "Flame Sentinel", "Archsage", "Battle Mage", "Exalted Blade", "Exalted Shield", "Marksman"];
    const classCells = {};
    [...valid, ...extra].forEach((name, index) => {
      classCells[`A${15 + index}`] = name;
      classCells[`C${15 + index}`] = 2;
      classCells[`D${15 + index}`] = 200;
    });
    classCells.A36 = "Row 22 is outside the CCS class block";
    const sheets = {
      Core: { B2: "Xlsx Import Test", D2: "Human", ...classCells },
      Breakthrough: { A2: "Weapon Training", A3: "Mystery Breakthrough", B2: 0, B3: 0 }
    };
    check("A CCS has 21 class rows and the fixture fills all 21", [...valid, ...extra].length, 21);

    // Payload level: every row is read; rows beyond what the builder holds are reported.
    const payload = await page.evaluate(value => window.__t25.xlsxPayload(value), sheets);
    check("Row 13 of the class block (Windbringer) is now read", payload.fields.Class13, "Windbringer");
    check("The first twelve rows are still read in order", [payload.fields.Class1, payload.fields.Class2, payload.fields.Class12], ["Fighter", "Mage", "Aeromancer"]);
    check("Rows 14-21 are listed in an import note instead of vanishing", (payload.importNotes || []).filter(note => extra.every(name => note.includes(name))).length, 1);
    check("Nothing beyond the 13 rows leaks into the fields", Object.keys(payload.fields).filter(key => /^Class(1[4-9]|2\d)$/.test(key)), []);

    // The real file through the Import code path: xlsx.
    await fixture({});
    await call("closeModal");
    const xlsx = await page.evaluate(value => window.__t25.makeXlsxBase64(value), sheets);
    check("Importing the .xlsx succeeds", await page.evaluate(async value => window.__t25.importBytes("t25-import.xlsx", value), xlsx), true);
    await page.waitForTimeout(300);
    const imported = await call("snapshot");
    check("The matched classes were imported (12 of 13 rows; the fake one is the only loss)", imported.builder.selectedClassIds.length, 12);
    let modal = await call("importModal");
    check("A notes window opens", [modal.open, modal.eyebrow], [true, "Import Notes"]);
    const joined = modal.items.join(" | ");
    check("It names the class that did not match", /Not A Real Class/.test(joined), true);
    check("It names the breakthrough that did not match", /Mystery Breakthrough/.test(joined), true);
    check("It lists the class rows beyond the builder's 13", extra.every(name => joined.includes(name)), true);
    check("It does not complain about entries that matched", /Weapon Training|\bFighter\b|\bMedic\b|\bLancer\b/.test(joined), false);
    await call("closeModal");

    // JSON state with ids this rules version does not have.
    const stateJson = JSON.stringify({
      ui: { gameVersion: "0.13.2" }, fields: { Name: "JSON ids" }, abilitySelections: {},
      builder: { selectedRaceId: "human", selectedClassIds: ["fighter", "retired-class"], selectedBreakthroughIds: ["retired-breakthrough"], selectedItemIds: ["retired-item"] },
      play: { resources: {} }
    });
    check("Importing the JSON state succeeds", await page.evaluate(async value => window.__t25.importBytes("t25-state.json", value), Buffer.from(stateJson).toString("base64")), true);
    modal = await call("importModal");
    const jsonItems = modal.items.join(" | ");
    check("The JSON import lists the unknown class, breakthrough and item ids", [/retired-class/, /retired-breakthrough/, /retired-item/].map(pattern => pattern.test(jsonItems)), [true, true, true]);
    check("...and says they are kept, not lost", /kept in the character data/.test(jsonItems), true);
    await call("closeModal");

    // A class the sheet lists with no level and no EXP (planned, not learned) is skipped
    // quietly, exactly as before: nothing is lost, so it must not open a window.
    const quiet = await page.evaluate(value => window.__t25.xlsxPayload(value), { Core: { B2: "Quiet", A15: "Fighter", C15: 2, D15: 200, A16: "Guardian", D16: 0, A17: "Exalted Shield", D17: 0 } });
    check("A named class row with no level and no EXP is skipped without a note", [quiet.fields.Class1, quiet.fields.Class2, quiet.importNotes], ["Fighter", undefined, undefined]);

    // A clean file produces no window at all.
    // Task 044b: a clean Human file holds its five free racial skill points (a
    // file without them now gets one plain import note, as brief 043 asked).
    const cleanJson = JSON.stringify({ ui: { gameVersion: "0.13.2" }, fields: { Name: "Clean", "RacialSkillPoint:race-human-skill:17": "5" }, builder: { selectedRaceId: "human", selectedClassIds: ["fighter"] }, play: { resources: {} } });
    check("A clean JSON state imports", await page.evaluate(async value => window.__t25.importBytes("t25-clean.json", value), Buffer.from(cleanJson).toString("base64")), true);
    check("...and opens no notes window", (await call("importModal")).open, false);

    // PDF: the same reporting through the field-based payload (the PDF form fields are
    // the sheet's own field names).
    const pdfPayload = await page.evaluate(() => window.__t25.pdfPayload({ Name1: "Pdf Import Test", Class1: "Fighter", Class2: "Zzz Not A Class", BName: "Weapon Training\nMystery Breakthrough", CombatInventory1: "Shield", CombatInventory2: "Mystery Item" }));
    const pdfNotes = await page.evaluate(payloadValue => window.__t25.importNotes(payloadValue), pdfPayload);
    check("A PDF's unknown class, breakthrough and item names are all reported", [/Zzz Not A Class/, /Mystery Breakthrough/, /Mystery Item/].map(pattern => pdfNotes.filter(note => pattern.test(note)).length), [1, 1, 1]);
    check("...and the PDF's known names are not", pdfNotes.some(note => /Fighter|Weapon Training|Shield/.test(note)), false);

    // A real exported PDF, with its embedded state removed and three fields edited
    // (so the import has to read the visible form fields).
    await fixture({ fields: { Name: "Pdf round trip" }, builder: { selectedRaceId: "human", selectedClassIds: ["fighter"], classAbilityProgress: { fighter: 1 } } });
    await call("sync");
    const pdfDownload = page.waitForEvent("download", { timeout: 60000 });
    await call("exportPdf");
    const pdfFile = await pdfDownload;
    const pdfPath = path.join(output, "f2-roundtrip.pdf");
    await pdfFile.saveAs(pdfPath);
    const editedPdf = await page.evaluate(async value => window.__t25.editPdf(value, { Class2: "Zzz Not A Class", BName: "Mystery Breakthrough", CombatInventory3: "Mystery Item" }), (await readFile(pdfPath)).toString("base64"));
    await call("closeModal");
    check("Importing the hand-edited PDF succeeds", await page.evaluate(async value => window.__t25.importBytes("t25-edited.pdf", value), editedPdf), true);
    modal = await call("importModal");
    const pdfItems = modal.items.join(" | ");
    check("The PDF import window names the unknown class, breakthrough and item", [/Zzz Not A Class/, /Mystery Breakthrough/, /Mystery Item/].map(pattern => pattern.test(pdfItems)), [true, true, true]);
    check("...and the PDF's known class is still imported", (await call("snapshot")).builder.selectedClassIds, ["fighter"]);
    await call("closeModal");

    // The owner's hand-test route: a CCS file (it carries no embedded state, so the
    // import reads the visible cells) with one class name retyped in a spreadsheet.
    await fixture({ fields: { Name: "Ccs edit" }, builder: { selectedRaceId: "human", selectedClassIds: ["fighter", "mage"], classAbilityProgress: { fighter: 2, mage: 1 } } });
    await call("sync");
    const ccsDownload = page.waitForEvent("download");
    await call("exportCcs");
    const ccsFile = await ccsDownload;
    const ccsPath = path.join(output, "f2-ccs-for-edit.xlsx");
    await ccsFile.saveAs(ccsPath);
    const editedCcs = await page.evaluate(async value => window.__t25.editXlsxCell(value, "xl/worksheets/sheet1.xml", "A16", "Madeup Class"), (await readFile(ccsPath)).toString("base64"));
    await call("closeModal");
    check("Importing the hand-edited CCS succeeds", await page.evaluate(async value => window.__t25.importBytes("t25-edited-ccs.xlsx", value), editedCcs), true);
    modal = await call("importModal");
    check("The notes window names the retyped class", modal.items.some(item => /Madeup Class/.test(item)), true);
    check("...and the untouched class is still imported", (await call("snapshot")).builder.selectedClassIds, ["fighter"]);
    await call("closeModal");

    // The .aschar window is unchanged: same title text and still lists its notes.
    const aschar = { format: "angelssword-character", version: 1, character: { name: "Aschar window", gameMode: "standard", race: { primaryRaceName: "Human" }, mainStats: { power: 4, focus: 4, agility: 4, toughness: 3 }, subStats: {}, classes: [{ classId: "fighter", name: "Fighter", levels: 2 }, { classId: "no-such-class", name: "No Such Class", levels: 2 }] } };
    check("An .aschar import still succeeds", await page.evaluate(async value => window.__t25.importBytes("t25-char.aschar.json", value), Buffer.from(JSON.stringify(aschar)).toString("base64")), true);
    modal = await call("importModal");
    check("The .aschar window keeps its Import Complete wording and class note", [modal.eyebrow, modal.items.some(item => /No Such Class/.test(item)), modal.items.some(item => /processed/.test(item))], ["Import Complete", true, true]);
    await call("closeModal");
  }

  // =========================================================================
  // F3: loading no longer deletes saved breakthroughs (or ids this rules version
  // does not know); they are kept and flagged on screen.
  // =========================================================================
  if (wants("F3")) {
    section("F3 load keeps breakthroughs and unknown ids, flags them");
    const rapidFlash = "rapid-flash--high-fae-";
    // A character saved while eligible (High Fae) whose requirement now reads unmet (Pixie).
    const unmetSave = {
      ui: { gameVersion: "0.13.2" }, fields: { Name: "Stale breakthrough" }, abilitySelections: {},
      builder: { selectedRaceId: "fae", selectedAncestryId: "pixie", selectedBreakthroughIds: [rapidFlash] },
      play: { resources: {} }
    };
    await fixture({});
    check("Fixture sanity: Rapid Flash reads as unmet for a Pixie", (await page.evaluate(() => { window.__t25.fixture({ builder: { selectedRaceId: "fae", selectedAncestryId: "pixie" } }); return window.__t25.breakthroughMet("rapid-flash--high-fae-"); })), false);
    check("Loading the save succeeds", await call("loadObject", unmetSave), true);
    let loaded = await call("snapshot");
    check("The unmet breakthrough is still in the character after load", loaded.builder.selectedBreakthroughIds, [rapidFlash]);
    check("It is recorded as kept-although-unmet", loaded.builder.unmetBreakthroughIds, [rapidFlash]);
    let notes = await call("attention");
    check("A visible note names it and says why", notes.length === 1 && /Rapid Flash/.test(notes[0].text) && /Requires/i.test(notes[0].text) && /no longer/i.test(notes[0].text), true);
    await call("render");
    const cardText = await page.evaluate(() => [...document.querySelectorAll("#builder-summary .summary-card-attention")].map(card => card.textContent));
    check("The note is on screen in the Current Build panel", cardText.length === 1 && /Rapid Flash/.test(cardText[0]), true);
    check("The kept breakthrough is in the stored slot data too (compact snapshot)", (await call("storable")).builder?.selectedBreakthroughIds, [rapidFlash]);

    // Through the real slot flow: save, reload the page, nothing is deleted.
    await call("saveSlot", "T25 stale breakthrough");
    await page.reload({ waitUntil: "load" });
    await ready();
    const afterReload = await call("snapshot");
    check("After a page reload from the slot the breakthrough is still there", [afterReload.builder.selectedBreakthroughIds, afterReload.builder.unmetBreakthroughIds], [[rapidFlash], [rapidFlash]]);
    check("...and the slot itself still holds it", (await page.evaluate(() => JSON.parse(localStorage.getItem("lyrian-chronicles-character-suite-slots-v1")).slots.find(slot => slot.name === "T25 stale breakthrough")?.snapshot.builder.selectedBreakthroughIds)), [rapidFlash]);

    // The player decides: removing it clears the flag and the note.
    await call("toggleBreakthrough", rapidFlash);
    const removed = await call("snapshot");
    check("Removing it by hand removes it and clears the flag", [removed.builder.selectedBreakthroughIds, removed.builder.unmetBreakthroughIds], [[], []]);
    check("...and the note disappears", (await call("attention")).length, 0);

    // A flag clears itself when the requirement is met again.
    await call("loadObject", unmetSave);
    await page.evaluate(() => { window.__t25.setAncestry("high-fae"); });
    const healed = await call("snapshot");
    check("Switching back to High Fae keeps it and drops the flag", [healed.builder.selectedBreakthroughIds, healed.builder.unmetBreakthroughIds], [[rapidFlash], []]);

    // Interactive behavior is unchanged: a breakthrough the player had legitimately
    // and then made ineligible by hand is still removed with its prerequisite.
    await fixture({ builder: { selectedRaceId: "fae", selectedAncestryId: "high-fae", selectedBreakthroughIds: [rapidFlash] } });
    await call("sync");
    check("Fixture sanity: eligible High Fae keeps Rapid Flash with no flag", [(await call("snapshot")).builder.selectedBreakthroughIds, (await call("snapshot")).builder.unmetBreakthroughIds], [[rapidFlash], []]);
    await page.evaluate(() => { window.__t25.setAncestry("pixie"); });
    const pruned = await call("snapshot");
    check("Changing the ancestry by hand still removes the now-ineligible breakthrough (unchanged)", [pruned.builder.selectedBreakthroughIds, pruned.builder.unmetBreakthroughIds], [[], []]);

    // The owner's hand-test route: export the state as JSON, change the ancestry word
    // in a text editor, import the file through the Import button's code path.
    await fixture({ builder: { selectedRaceId: "fae", selectedAncestryId: "high-fae", selectedBreakthroughIds: [rapidFlash] } });
    await call("sync");
    const editedJson = JSON.stringify(await call("snapshot"), null, 2).replace('"selectedAncestryId": "high-fae"', '"selectedAncestryId": "pixie"');
    check("Fixture sanity: the edit really changed the ancestry in the exported JSON", editedJson.includes('"selectedAncestryId": "pixie"'), true);
    check("Importing the hand-edited JSON succeeds", await page.evaluate(async value => window.__t25.importBytes("t25-hand-edit.json", value), Buffer.from(editedJson).toString("base64")), true);
    const handEdited = await call("snapshot");
    check("The hand-edited import keeps Rapid Flash, flagged", [handEdited.builder.selectedBreakthroughIds, handEdited.builder.unmetBreakthroughIds], [[rapidFlash], [rapidFlash]]);
    check("...and shows the Breakthrough kept note", (await call("attention")).some(note => note.title === "Breakthrough kept" && /Rapid Flash/.test(note.text)), true);
    await call("closeModal");

    // Ids this rules version does not know: kept in the save, one note per kind.
    const unknownIds = {
      ui: { gameVersion: "0.13.2" }, fields: { Name: "Unknown ids" }, abilitySelections: {},
      builder: { selectedRaceId: "human", selectedClassIds: ["fighter", "retired-class"], selectedBreakthroughIds: ["retired-breakthrough"], selectedItemIds: ["retired-item"], itemQuantities: { "retired-item": 2 } },
      play: { resources: {} }
    };
    check("Loading a save with ids the rules no longer have succeeds", await call("loadObject", unknownIds), true);
    const unknown = await call("snapshot");
    check("Unknown class, breakthrough and item ids are all still in the character", [unknown.builder.selectedClassIds, unknown.builder.selectedBreakthroughIds, unknown.builder.selectedItemIds], [["fighter", "retired-class"], ["retired-breakthrough"], ["retired-item"]]);
    notes = await call("attention");
    check("One visible line per kind names the ids", [/retired-class/, /retired-breakthrough/, /retired-item/].map(pattern => notes.filter(note => pattern.test(note.text)).length), [1, 1, 1]);
    check("The known class still works alongside the unknown one", (await call("classBudget")).perClass.map(entry => entry[0]), ["fighter"]);

    // D4: an old save with none of the new fields loads as before and shows no note.
    await call("loadObject", { ui: { gameVersion: "0.13.2" }, fields: { Name: "Old" }, builder: { selectedRaceId: "human", selectedClassIds: ["fighter"] }, play: { resources: {} } });
    check("An old save with no new fields loads with no notes", await call("attention"), []);
  }

  // =========================================================================
  // F7: two chosen classes granting the same ability get a visible warning
  // that quotes the rulebook; no EXP is refunded automatically.
  // =========================================================================
  if (wants("F7")) {
    section("F7 duplicate ability warning");
    const rulebookPath = path.resolve(root, "../docs/research/community-data-pack/lyrian-data-pack/data/0.13.2/clean/rulebook.json");
    const refundRule = "If there is a situation in which you would get a duplicate ability by spending EXP in a class, the EXP spent is refunded. This applies even when learning a new class, though unlocking the class would still require an Interlude Point as normal. If there is a situation where the abilities don't exactly match, but you still have everything else the ability has to give, then you get a half exp refund.";
    if (existsSync(rulebookPath)) {
      const rulebook = JSON.parse(await readFile(rulebookPath, "utf8"));
      check("The quoted refund sentence is verbatim in the rules 0.13.2 rulebook", rulebook.contentText.includes(refundRule), true);
    } else {
      console.log("  (rulebook.json not found next to the worktree; verbatim check skipped)");
    }
    const classes = (ids, counts = {}) => ({ fields: { Name: "Duplicate test" }, builder: { selectedRaceId: "human", selectedClassIds: ids, classAbilityProgress: counts } });
    const noteCards = async input => {
      await fixture(input);
      await call("sync");
      await call("render");
      return page.evaluate(() => [...document.querySelectorAll("#builder-summary .summary-card-attention")].map(card => card.textContent.replace(/\s+/g, " ").trim()));
    };
    let cards = await noteCards(classes(["aeromancer", "windbringer"], { aeromancer: 0, windbringer: 0 }));
    if (process.env.T25_SCREENSHOTS) {
      for (const [label, width] of [["desktop", 1280], ["phone", 390]]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(200);
        await page.locator(".builder-stage-summary").first().screenshot({ path: path.join(output, `f7-duplicate-note-${label}.png`) });
      }
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    check("Two classes with the same key ability: one visible note", cards.length, 1);
    const wind = cards[0] || "";
    check("The note names the ability and both classes", ["Wind Master", "Aeromancer", "Windbringer"].every(text => wind.includes(text)), true);
    check("The note quotes the rulebook refund sentence", wind.includes(refundRule), true);
    check("The note says nothing is refunded automatically", /does not refund/i.test(wind), true);
    const budget = await call("classBudget");
    check("No EXP is refunded: both full unlock costs (tier 2 = 200 each) are still spent", [budget.spentExp, budget.perClass], [400, [["aeromancer", 200], ["windbringer", 200]]]);

    cards = await noteCards(classes(["aeromancer", "windbringer", "zephyr-warder"]));
    check("Three classes sharing Wind Master give one note naming all three", cards.length === 1 && ["Aeromancer", "Windbringer", "Zephyr Warder"].every(text => cards[0].includes(text)), true);

    cards = await noteCards(classes(["archsage", "battle-mage"], { archsage: 1, "battle-mage": 3 }));
    check("A bought slot ability granted by two classes (Battle Cast) is reported", cards.length === 1 && /Battle Cast/.test(cards[0]) && /Archsage/.test(cards[0]) && /Battle Mage/.test(cards[0]), true);
    cards = await noteCards(classes(["archsage", "battle-mage"], { archsage: 0, "battle-mage": 3 }));
    check("The same pair is not flagged while only one of them has bought the slot", cards, []);

    cards = await noteCards(classes(["fighter", "mage"], { fighter: 3, mage: 3 }));
    check("Unrelated classes: no note", cards, []);
    cards = await noteCards(classes(["aeromancer"], { aeromancer: 3 }));
    check("One class repeating its own ability: no note", cards, []);
  }

  // =========================================================================
  // F4: the CCS export carries equipped-gear numbers, the adjustment cells and
  // the identity of the template that made the file.
  // =========================================================================
  if (wants("F4")) {
    section("F4 CCS export: gear numbers, adjustment cells, template identity");
    const templateBytes = await readFile(path.join(root, "data/ccs-template.xlsx"));
    const templateSha = createHash("sha256").update(templateBytes).digest("hex");
    const templateSheet = unzip(templateBytes).get("xl/worksheets/sheet1.xml").toString();
    const readCells = xml => Object.fromEntries([...xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(m => {
      const body = m[3] || "";
      // Decode entities: the exporter re-serializes the XML, so &quot; becomes a quote.
      const formula = (/<f[^>]*>([\s\S]*?)<\/f>/.exec(body) || [])[1]?.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      const inline = (/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body) || [])[1];
      const raw = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
      const isBool = /\bt="b"/.test(m[2]);
      return [m[1], { formula, text: inline, value: isBool ? raw === "1" : raw !== undefined && inline === undefined && !/\bt="(s|str)"/.test(m[2]) ? Number(raw) : raw }];
    }));
    const templateCells = readCells(templateSheet);

    // The sheet's own formulas are the spec. Pin the ones the evaluator below
    // relies on, so a re-captured template that changes them fails loudly.
    const pinned = {
      H2: "7+B11+E33+SUMIF($L$37:$L$42,TRUE,$H$37:$H$42)",
      K2: "20+B11+H33+SUMIF($L$37:$L$42,TRUE,$I$37:$I$42)",
      H3: "ROUNDDOWN(B12+K4,0)",
      K4: "SUMIF($L$37:$L$42,TRUE,$G$37:$G$42)",
      K3: "(B12*2)+SUMIF($L$37:$L$42,TRUE,$J$37:$J$42)",
      F4: "B11+H35-SUMIF($L$37:$L$42,TRUE,$K$37:$K$42)",
      H4: "B12+G34",
      F7: "IF(K30, 2 + (B11 - K6), 2 + B11)-E35"
    };
    check("Template formulas read the cells F4 fills (pins the evaluator)", Object.fromEntries(Object.keys(pinned).map(a => [a, templateCells[a]?.formula])), pinned);
    const writtenByF4 = ["E33", "H33", "G34", "E35", "H35", "R1", ...[37, 38, 39, 40, 41, 42].flatMap(row => ["F", "G", "H", "I", "J", "K", "L"].map(col => `${col}${row}`))];
    check("None of the cells F4 writes holds a formula in the template", writtenByF4.filter(address => templateCells[address]?.formula), []);

    // Evaluate the template's formulas from the exported cell values.
    const evaluateSheet = (core, agility, toughness) => {
      const num = address => Number(core[address] ?? 0) || 0;
      const rows = [37, 38, 39, 40, 41, 42].filter(row => core[`L${row}`] === true);
      const sum = column => rows.reduce((total, row) => total + num(`${column}${row}`), 0);
      return {
        evasion: 7 + agility + num("E33") + sum("H"),
        dodge: 20 + agility + num("H33") + sum("I"),
        guard: Math.floor(toughness + sum("G")),
        block: toughness * 2 + sum("J"),
        initiative: agility + num("H35") - sum("K"),
        saveBonus: toughness + num("G34"),
        rpMax: 2 + agility - num("E35")
      };
    };
    const gear = (ids, extra = {}) => ({
      fields: { Name: "Gear export", Agility: "5", Toughness: "4", ...(extra.fields || {}) },
      builder: { selectedRaceId: "human", selectedItemIds: ids, ...(extra.builder || {}) },
      play: { inventoryItems: ids.map(id => ({ uid: `t25-${id}`, itemId: id, quantity: 1, equipped: true })) }
    });
    const cases = [
      ["Light armor", gear(["armor--light-"])],
      ["Medium armor + Shield", gear(["armor--medium-", "shield"])],
      ["Heavy armor + Great Shield", gear(["armor--heavy-", "shield--great-"])],
      ["Nio (race Stoneskin: +1 guard, +4 block, -2 evasion and dodge), no gear", gear([], { builder: { selectedRaceId: "youkai", selectedAncestryId: "nio" } })],
      ["Nio + Heavy armor + Great Shield + On the draw", gear(["armor--heavy-", "shield--great-"], { builder: { selectedRaceId: "youkai", selectedAncestryId: "nio", selectedBreakthroughIds: ["on-the-draw"] } })],
      ["No gear", gear([])]
    ];
    for (const [label, input] of cases) {
      await fixture(input);
      await call("sync");
      const { map, derived, agility, toughness } = await call("ccs");
      const sheet = evaluateSheet(map.Core, agility, toughness);
      const builder = { evasion: derived.evasion, dodge: derived.dodge, guard: derived.guard, block: derived.block, initiative: derived.initiative, saveBonus: derived.saveBonus, rpMax: derived.rpMax };
      check(`${label}: the sheet's Guard/Evasion/Dodge/Block/Initiative/Save/RP equal the builder's`, sheet, builder);
    }

    // All six equipment rows taken: race/class guard and block have no cell, so
    // the export must say so instead of silently differing.
    await fixture(gear(["armor--light-", "armor--medium-", "armor--heavy-", "shield", "shield--great-", "armor--clothing-"], { builder: { selectedRaceId: "youkai", selectedAncestryId: "nio" } }));
    await call("sync");
    const full = await call("ccs");
    const fullSheet = evaluateSheet(full.map.Core, full.agility, full.toughness);
    check("Six equipped rows + Nio: the sheet is short by exactly the unplaced +1 guard / +4 block", [full.derived.guard - fullSheet.guard, full.derived.block - fullSheet.block], [1, 4]);
    check("Six equipped rows + Nio: the export notes say which totals will read low", full.notes.length === 1 && /Guard \+1 and Block \+4/.test(full.notes[0]) && /six equipment rows/.test(full.notes[0]), true);
    check("Six equipped rows + Nio: evasion, dodge and initiative still equal the builder's", [fullSheet.evasion, fullSheet.dodge, fullSheet.initiative], [full.derived.evasion, full.derived.dodge, full.derived.initiative]);

    // The armor numbers themselves, row by row, for the plain armor case.
    await fixture(gear(["armor--heavy-", "shield--great-"]));
    await call("sync");
    const core = (await call("ccs")).map.Core;
    check("Heavy armor row: guard +3, evasion -6, dodge -6, block +12, initiative penalty 3, equipped", ["F37", "G37", "H37", "I37", "J37", "K37", "L37"].map(a => core[a]), ["Armor (Heavy)", 3, -6, -6, 12, 3, true]);
    check("Great Shield row: guard +1, evasion -2, dodge -2, block +8, initiative penalty 1, equipped", ["F38", "G38", "H38", "I38", "J38", "K38", "L38"].map(a => core[a]), ["Shield (Great)", 1, -2, -2, 8, 1, true]);

    // A real downloaded file: new cells land, every template formula survives,
    // and the template that produced it is recorded.
    await fixture(gear(["armor--light-"]));
    await call("sync");
    const download = page.waitForEvent("download");
    await call("exportCcs");
    const exportedFile = await download;
    const exportedPath = path.join(output, "f4-ccs-light-armor.xlsx");
    await exportedFile.saveAs(exportedPath);
    const exportedCells = readCells(unzip(await readFile(exportedPath)).get("xl/worksheets/sheet1.xml").toString());
    check("Downloaded file: Light armor row is filled (guard 1, evasion -2, dodge -2, block 4, penalty 1)", ["G37", "H37", "I37", "J37", "K37"].map(a => exportedCells[a]?.value), [1, -2, -2, 4, 1]);
    const formulasOf = cells => Object.entries(cells).filter(([, cell]) => cell.formula !== undefined).map(([address, cell]) => [address, cell.formula]).filter(([address]) => !writtenByF4.includes(address));
    check("Downloaded file keeps every template formula on Core", formulasOf(exportedCells), formulasOf(templateCells));
    const provenance = exportedCells.R1?.text || "";
    check("Downloaded file records the template's SHA-256 (matches the bundled file)", provenance.includes(templateSha), true);
    check("Downloaded file records the template's capture date", provenance.includes("2026-09-07"), true);
    check("Downloaded file names the source of the template", /Clio/.test(provenance) && /ccs-template\.xlsx/.test(provenance), true);
  }

  check("No uncaught browser JavaScript errors", pageErrors, []);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed: results.filter(entry => entry.ok).length, failed: failures.length, results }, null, 2));
  console.log(`\n${results.filter(entry => entry.ok).length} passed, ${failures.length} failed. Evidence: ${output}`);
  if (failures.length) process.exitCode = 1;
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: error.stack, completed: results, serverLog }, null, 2));
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
