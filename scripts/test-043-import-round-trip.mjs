// Task 043 checks: Export Character -> JSON File -> Import Character is an
// exact round trip, starting with the Human's five free racial skill points.
//
// The bug (task 041d, also on the live site): Import Character replaces the
// whole character but did not move the state's edit counter (`revision`). The
// builder's choice list and computed bonuses are cached on that counter, so the
// load then checked the NEW character against the PREVIOUS character's choices
// and cleared what did not fit: racial skill points (Human +21 Perception came
// back +16), class weapon and stat picks, Skill Training picks. The same load
// runs for a named save slot, a page reload and the JSON hidden inside our PDF
// and spreadsheet exports.
//
// What this proves, in a real browser through the real app:
//   A. Every Quick Build species x build x start mode (21 x 15 x 2 = 630
//      characters), built through the real Quick Build screens and Use This
//      Character, written out exactly as Export Character -> JSON File writes
//      it, then imported with Import Character's own file handler into another
//      page, twice: on top of a different character (Import replaces the one on
//      screen) and on a reset page. The whole character is compared before and
//      after: every sheet field, every builder choice (Human picks included),
//      expertise, breakthroughs, gear, Clim, EXP, pools, play state, and the
//      derived summary the room gets (stats, skills, HP, Clim, EXP). Only three
//      keys are left out, each for a stated reason (IGNORED_PATHS below).
//   B. A sample through the real buttons: Table Tools -> Export Character ->
//      JSON File (the downloaded file is the snapshot part A uses), then the
//      real Import Character file input on a fresh page.
//   C. Named save slots: Save Character to a named slot, then Load Saved on a
//      reset page and on top of a different character. The character comes
//      back the same (the slot's own by-design differences are listed in
//      SLOT_IGNORED_PATHS).
//   D. Old files: characters exported by the live site's code (3346d32, the
//      files players have today, in tests/fixtures/) import with every racial
//      skill point and every builder choice they hold, and every skill total
//      the live sheet showed.
//   E. The 041d case by name: a Human Gunslinger's Perception is +21 before and
//      after, and its "5 racial skill points" pool is fully assigned.
//   F. A character used on the sheet with its own controls (damage, Mana and
//      AP spent, armor or rifle unequipped, a note, a saving throw in the log,
//      an ability slot filled) survives Export -> Import exactly. Unequip
//      changes Guard, Evasion, Dodge, Block, Initiative and skills at once (the
//      same cache: they used to stay at the old numbers until a reload, so the
//      file and the imported character disagreed).
//
// The real src/js is bundled in memory with a test-only hook block appended to
// ui.js (the test-030/042 pattern); nothing in the shipped source is altered.
//
// Run:  npm run test:043   (builds first)
// Env:  T43_PORT (default 4493); T43_SRC=<folder with src/js> runs against
//       another source tree (used to show the old code fails); T43_ONLY=A,C
//       limits parts; T43_SPECIES=human,catfolk limits the part A sweep.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.env.T43_SRC ? path.resolve(process.env.T43_SRC) : root;
const output = path.join(root, "qa-test-results/task-043-import-round-trip");
await mkdir(output, { recursive: true });
const port = Number(process.env.T43_PORT || 4493);
const url = `http://localhost:${port}/`;
const only = (process.env.T43_ONLY || "").split(",").map((entry) => entry.trim().toUpperCase()).filter(Boolean);
const runPart = (letter) => !only.length || only.includes(letter);
const speciesFilter = (process.env.T43_SPECIES || "").split(",").map((entry) => entry.trim()).filter(Boolean);
// Files exported with the live site's own Export Character -> JSON File button
// (3346d32), byte for byte, plus what the live sheet showed for each skill.
const FIXTURE_DIR = path.join(root, "tests/fixtures/043-live-3346d32");

const failures = [];
let passed = 0;
const check = (name, actual, expected) => {
  try {
    assert.deepEqual(actual, expected, name);
    passed += 1;
  } catch {
    failures.push(name);
    const short = (value) => { const text = JSON.stringify(value) ?? "undefined"; return text.length > 700 ? `${text.slice(0, 700)}... (${text.length} chars)` : text; };
    if (failures.length <= 60) {
      console.log(`  FAIL ${name}\n       actual:   ${short(actual)}\n       expected: ${short(expected)}`);
    }
  }
};
const section = (title) => console.log(`\n== ${title}`);

// ---------------------------------------------------------------------------
// Test-only hooks, appended to ui.js in the in-memory bundle.
// ---------------------------------------------------------------------------
const hooks = `
// Keys a JSON round trip may change, each for a reason that is not character data:
//  - revision: the state's edit counter; it counts edits in this page.
//  - builder.inspected.*: which catalog entry the builder's detail panel shows;
//    every load (a page reload too) points it at the character's own entries.
//  - ui.gameVersion, only when the file left it empty (Reset Character empties
//    it): the import fills in the rules version the page is running.
const T43_IGNORED_PATHS = [/^revision$/, /^builder\\.inspected(\\.|$)/];
// A save slot is the compact browser save (task 025 F1): by design it keeps no
// screen (it opens on Review), no detail-panel or search state, no empty values,
// and it remembers the HP, Mana, RP and AP for the trip back to the sheet. Its
// flags are written as true/false, so "false" equals a flag the state never had.
const T43_SLOT_IGNORED_PATHS = [...T43_IGNORED_PATHS, /^ui(\\.|$)/, /^librarySelections(\\.|$)/, /^lastFocusedField$/,
  /^builder\\.searches\\.(?!mainStatMode$|secondaryStatMode$)/, /^play\\.resourcesBeforeBuilderVisit(\\.|$)/];
function t43IsEmpty(value) {
  if (value === "" || value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}
function t43Diff(before, after, ignored, { emptyEqualsMissing = false } = {}, base = "", out = []) {
  if (ignored.some((pattern) => pattern.test(base))) return out;
  if (before === after) return out;
  if (emptyEqualsMissing && t43IsEmpty(before) && t43IsEmpty(after)) return out;
  if (emptyEqualsMissing && ((before === undefined && after === false) || (before === false && after === undefined))) return out;
  const isObject = (value) => value !== null && typeof value === "object";
  if (!isObject(before) || !isObject(after) || Array.isArray(before) !== Array.isArray(after)) {
    if (base === "ui.gameVersion" && before === "" && after === window.LYRIAN_DATA?.version) return out;
    if (JSON.stringify(before) !== JSON.stringify(after)) out.push({ path: base, before, after });
    return out;
  }
  new Set([...Object.keys(before), ...Object.keys(after)]).forEach((key) =>
    t43Diff(before[key], after[key], ignored, { emptyEqualsMissing }, base ? base + "." + key : key, out));
  return out;
}
window.__t43 = {
  ids() {
    return { species: QUICK_BUILD_SPECIES.map((entry) => entry.id), builds: QUICK_BUILD_ROLES.flatMap((role) => role.builds.map((entry) => entry.id)) };
  },
  snapshot() { return JSON.parse(JSON.stringify(createVttCharacterSnapshot())); },
  reset() { clearSheet(); },
  // Quick Build through the real screens, then Use This Character.
  build(speciesId, buildId, mode, name) {
    window.confirm = () => true;
    const click = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error("missing " + selector);
      element.click();
    };
    clearSheet();
    click("#quick-build-entry");
    click('[data-quick-build-action="select-species"][data-id="' + speciesId + '"]');
    click("#builder-next");
    const nameInput = document.getElementById("builder-name-header");
    nameInput.value = name;
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    if (mode === "mirane") click('[data-quick-start-mode="mirane"]');
    click("#builder-next");
    click('[data-quick-build-action="select-build"][data-id="' + buildId + '"]');
    click("#builder-next");
    click("#builder-next"); // Use This Character
    if (state.ui.mode !== "sheet") throw new Error("Use This Character did not open the sheet for " + speciesId + " " + buildId);
    const snapshot = this.snapshot();
    // The file must be the whole state plus the room summary: nothing left out.
    const { vttSummary, ...fileState } = snapshot;
    const exportGaps = t43Diff(JSON.parse(JSON.stringify(state)), fileState, []);
    const openPools = [...getVisibleRacialSkillPoolChoices().map((choice) => ({ id: choice.id, ...getRacialSkillPoolState(choice) })),
      ...getVisibleClassSkillPoolChoices().map((choice) => ({ id: choice.id, ...getClassSkillPoolState(choice) }))].filter((pool) => pool.remaining !== 0);
    return { snapshot, exportGaps, openPools, hasSummary: Boolean(vttSummary) };
  },
  // Import Character's own handler (the #import-file change listener calls it).
  async importText(fileName, text) {
    await handleImportedCharacterFile(new File([text], fileName, { type: "application/json" }));
    return this.status();
  },
  status() {
    return (document.getElementById("status-pill")?.textContent || "") + " | " + (document.getElementById("builder-status-pill")?.textContent || "");
  },
  compare(before, after) { return t43Diff(before, after, T43_IGNORED_PATHS); },
  // An old file: keys the old builder did not have yet may appear (with their
  // defaults); everything else must match, apart from the intended changes the
  // fixture lists (each with the task that made it).
  compareOld(before, after, intended) {
    return t43Diff(before, after, T43_IGNORED_PATHS).filter((entry) => entry.before !== undefined
      && !(intended[entry.path] && JSON.stringify([entry.before, entry.after]) === JSON.stringify(intended[entry.path].change)));
  },
  compareSlot(before, after) { return t43Diff(before, after, T43_SLOT_IGNORED_PATHS, { emptyEqualsMissing: true }); },
  racialPools() {
    return getVisibleRacialSkillPoolChoices().map((choice) => ({ id: choice.id, ...getRacialSkillPoolState(choice) }));
  },
  skillRow(name) { return SKILL_DEFINITIONS.findIndex((entry) => entry.name === name) + 1; },
  skillTotal(name) { return state.fields["Bonus" + this.skillRow(name)] || ""; },
  async saveSlot(name) {
    const slot = await saveCurrentCharacterToNewSlot(name);
    return slot?.id || "";
  },
  importNotes() {
    const modal = document.getElementById("sheet-modal");
    if (!modal || modal.hidden) return null;
    return (modal.textContent || "").replace(/\\s+/g, " ").trim();
  }
};`;

const bundle = await build({
  absWorkingDir: sourceRoot,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "task043-test-access", setup(buildApi) {
    buildApi.onLoad({ filter: /[/\\]src[/\\]js[/\\]ui\.js$/ }, async ({ path: file }) => ({
      contents: await readFile(file, "utf8") + hooks, loader: "js"
    }));
  } }]
});

const server = fork(path.join(root, "scripts/server.mjs"), [], {
  cwd: root, env: { ...process.env, LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" }, silent: true
});
let serverLog = "";
server.stdout.on("data", (data) => { serverLog += data; });
server.stderr.on("data", (data) => { serverLog += data; });
let browser;
const pageErrors = [];
const results = { sweep: [], buttons: [], slots: [], oldFiles: [], human: {} };
try {
  for (let retry = 0; ; retry++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    if (retry === 80 || server.exitCode !== null) throw new Error(`Test server failed: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  const openPage = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await page.route("**/assets/app.bundle.js*", (route) => route.fulfill({
      contentType: "application/javascript", body: bundle.outputFiles[0].text
    }));
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__t43 && window.LYRIAN_DATA?.version === "0.13.2" && (document.getElementById("builder-step-content")?.innerHTML || "").length > 100, null, { timeout: 30000 });
    await page.waitForTimeout(1600); // the production idle sheet build
    return { context, page };
  };
  const js = (page, selector) => page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) throw new Error("missing " + sel);
    element.click();
  }, selector);
  const waitForImported = (page, fileName) => page.waitForFunction((stem) => window.__t43.status().includes("Imported " + stem),
    fileName.replace(/\.json$/i, ""), { timeout: 20000 });
  const fileNameFor = (entry) => `t43-${entry.mode}-${entry.species}-${entry.build}.json`;
  const describe = (diffs) => diffs.slice(0, 6).map((entry) => `${entry.path}: ${JSON.stringify(entry.before)?.slice(0, 60)} -> ${JSON.stringify(entry.after)?.slice(0, 60)}`);

  const ids = await (async () => {
    const { context, page } = await openPage();
    const value = await page.evaluate(() => window.__t43.ids());
    await context.close();
    return value;
  })();
  check("Quick Build has 21 species and 15 builds", [ids.species.length, ids.builds.length], [21, 15]);

  // -------------------------------------------------------------------------
  if (runPart("A")) {
    section("A. Every Quick Build character survives Export -> Import exactly (630 characters, two imports each)");
    const species = ids.species.filter((entry) => !speciesFilter.length || speciesFilter.includes(entry));
    // Two pages work side by side (one per start mode) to keep the run short.
    const buildMode = async (mode) => {
      const builder = await openPage();
      const list = [];
      for (const speciesId of species) {
        const built = await builder.page.evaluate(([speciesIdValue, buildIds, modeValue]) => buildIds.map((buildId) =>
          window.__t43.build(speciesIdValue, buildId, modeValue, "T43 " + speciesIdValue + " " + buildId)), [speciesId, ids.builds, mode]);
        built.forEach((entry, index) => list.push({ mode, species: speciesId, build: ids.builds[index], ...entry }));
      }
      await builder.context.close();
      return list;
    };
    const exported = (await Promise.all(["standard", "mirane"].map(buildMode))).flat();
    if (!speciesFilter.length) {
      check("sweep covers 21 species x 15 builds x 2 start modes", exported.length, 630);
    }
    const sanity = exported.filter((entry) => entry.snapshot.fields?.Name !== `T43 ${entry.species} ${entry.build}`
      || entry.snapshot.builder?.startMode !== entry.mode || entry.snapshot.ui?.mode !== "sheet" || !entry.hasSummary);
    check("every exported character has its name, start mode, the sheet open and the room summary", sanity.map((entry) => `${entry.mode}/${entry.species}/${entry.build}`), []);
    check("every exported file is the whole character state (Export Character -> JSON File leaves nothing out)",
      exported.filter((entry) => entry.exportGaps.length).map((entry) => `${entry.mode}/${entry.species}/${entry.build}: ${describe(entry.exportGaps).join("; ")}`), []);
    check("every exported character has every racial and class skill pool fully assigned (so the file holds them all)",
      exported.filter((entry) => entry.openPools.length).map((entry) => `${entry.mode}/${entry.species}/${entry.build}: ${JSON.stringify(entry.openPools)}`), []);
    const racialFiles = exported.filter((entry) => Object.entries(entry.snapshot.fields).some(([key, value]) => key.startsWith("RacialSkillPoint:") && value));
    check("every exported file holds its racial skill points", racialFiles.length, exported.length);

    // Import order: builds outer, species inner, so the character on screen
    // before each import is always another species and another build.
    const order = [];
    for (const mode of ["standard", "mirane"]) {
      ids.builds.forEach((buildId) => species.forEach((speciesId) => {
        const entry = exported.find((candidate) => candidate.mode === mode && candidate.species === speciesId && candidate.build === buildId);
        if (entry) order.push(entry);
      }));
    }
    const sweepProblems = { onTop: {}, reset: {} };
    const outcomes = new Map();
    // Two import pages side by side; each takes every other character, so the
    // character on screen before an import is still another species.
    const importWorker = async (worker) => {
      const importer = await openPage();
      for (const entry of order.filter((candidate, position) => position % 2 === worker)) {
        const fileName = fileNameFor(entry);
        const text = JSON.stringify(entry.snapshot, null, 2);
        outcomes.set(entry, await importer.page.evaluate(async ([name, fileText]) => {
          const before = JSON.parse(fileText);
          const onTopStatus = await window.__t43.importText(name, fileText);
          const onTop = window.__t43.compare(before, window.__t43.snapshot());
          const onTopNotes = window.__t43.importNotes();
          window.__t43.reset();
          const resetStatus = await window.__t43.importText(name, fileText);
          const reset = window.__t43.compare(before, window.__t43.snapshot());
          const resetNotes = window.__t43.importNotes();
          return { onTop, reset, onTopStatus, resetStatus, onTopNotes, resetNotes };
        }, [fileName, text]));
      }
      await importer.context.close();
    };
    await Promise.all([0, 1].map(importWorker));
    for (const entry of order) {
      const fileName = fileNameFor(entry);
      const outcome = outcomes.get(entry);
      const key = `${entry.mode}/${entry.species}/${entry.build}`;
      const stem = fileName.replace(/\.json$/, "");
      if (!outcome.onTopStatus.includes(`Imported ${stem}`) || !outcome.resetStatus.includes(`Imported ${stem}`)) {
        outcome.onTop.push({ path: "(status)", before: "Imported", after: outcome.onTopStatus });
      }
      if (outcome.onTopNotes || outcome.resetNotes) {
        outcome.onTop.push({ path: "(import notes window)", before: null, after: outcome.onTopNotes || outcome.resetNotes });
      }
      results.sweep.push({ key, onTop: outcome.onTop, reset: outcome.reset });
      if (outcome.onTop.length) (sweepProblems.onTop[`${entry.mode}/${entry.species}`] ||= []).push(`${entry.build}: ${describe(outcome.onTop).join("; ")}`);
      if (outcome.reset.length) (sweepProblems.reset[`${entry.mode}/${entry.species}`] ||= []).push(`${entry.build}: ${describe(outcome.reset).join("; ")}`);
    }
    for (const mode of ["standard", "mirane"]) {
      species.forEach((speciesId) => {
        check(`${mode}/${speciesId}: all 15 builds exact when imported on top of another character`, sweepProblems.onTop[`${mode}/${speciesId}`] || [], []);
        check(`${mode}/${speciesId}: all 15 builds exact when imported on a reset page`, sweepProblems.reset[`${mode}/${speciesId}`] || [], []);
      });
    }
    const exact = results.sweep.filter((entry) => !entry.onTop.length && !entry.reset.length).length;
    console.log(`   ${exact} of ${results.sweep.length} characters exact on both imports (${results.sweep.length * 2} imports).`);
    const lostPaths = {};
    results.sweep.forEach((entry) => [...entry.onTop, ...entry.reset].forEach((diffEntry) => {
      const pathKey = diffEntry.path.replace(/:\d+$/, ":N").replace(/\d+$/, "N");
      lostPaths[pathKey] = (lostPaths[pathKey] || 0) + 1;
    }));
    results.sweepLostPaths = lostPaths;
    if (Object.keys(lostPaths).length) {
      console.log(`   Fields that changed (path: count): ${Object.entries(lostPaths).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([key, count]) => `${key}: ${count}`).join(", ")}`);
    }

    // E. The 041d case by name, from the same sweep.
    const gunslinger = exported.find((entry) => entry.mode === "standard" && entry.species === "human" && entry.build === "gunslinger");
    if (gunslinger) {
      section("E. The 041d case: Human Gunslinger, Perception +21, 5 of 5 racial skill points");
      const human = await openPage();
      const fileName = "rook-t43.json";
      await human.page.evaluate(() => window.__t43.reset());
      await human.page.waitForTimeout(100);
      await human.page.setInputFiles("#import-file", { name: fileName, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(gunslinger.snapshot, null, 2)) });
      await waitForImported(human.page, fileName);
      const row = await human.page.evaluate(() => window.__t43.skillRow("Perception"));
      const humanAfter = await human.page.evaluate(() => ({ perception: window.__t43.skillTotal("Perception"), pools: window.__t43.racialPools() }));
      results.human = { row, ...humanAfter };
      check("E: the exported Human Gunslinger has Perception +21", gunslinger.snapshot.fields[`Bonus${row}`], "+21");
      check("E: the exported file holds the 5 Human racial points on Perception", gunslinger.snapshot.fields[`RacialSkillPoint:race-human-skill:${row}`], "5");
      check("E: after Import Character (the real file input), Perception is still +21", humanAfter.perception, "+21");
      check("E: after Import Character, the Human pool is 5 of 5 assigned", humanAfter.pools, [{ id: "race-human-skill", budget: 5, spent: 5, remaining: 0 }]);
      await human.context.close();
    }
  }

  // -------------------------------------------------------------------------
  if (runPart("B")) {
    section("B. The real buttons: Table Tools -> Export Character -> JSON File, then Import Character");
    const sample = [
      ["standard", "human", "gunslinger"], ["mirane", "human", "shield-warrior"], ["standard", "catfolk", "scout-sniper-path"],
      ["mirane", "demon", "sneak-thief"], ["standard", "pixie", "control-wizard"], ["mirane", "jiangshi", "gadgeteer"]
    ].filter(([, speciesId]) => !speciesFilter.length || speciesFilter.includes(speciesId));
    for (const [mode, speciesId, buildId] of sample) {
      const key = `${mode}/${speciesId}/${buildId}`;
      const exporter = await openPage();
      await exporter.page.evaluate(([s, b, m]) => window.__t43.build(s, b, m, "T43 Button " + s), [speciesId, buildId, mode]);
      await exporter.page.waitForSelector("#sheet-view:not(.is-hidden) #play-hit-points .play-hit-current", { timeout: 15000, state: "attached" });
      await js(exporter.page, '[data-play-mode="table"]');
      const before = await exporter.page.evaluate(() => window.__t43.snapshot());
      const downloadPromise = exporter.page.waitForEvent("download", { timeout: 30000 });
      await js(exporter.page, '[data-table-tool-action="export"]');
      await js(exporter.page, '#sheet-modal:not([hidden]) [data-export-mode="json"]');
      const download = await downloadPromise;
      const filePath = path.join(output, `button-${mode}-${speciesId}-${buildId}.json`);
      await download.saveAs(filePath);
      const fileText = await readFile(filePath, "utf8");
      const fileJson = JSON.parse(fileText);
      const exportDiff = await exporter.page.evaluate(([a, b]) => window.__t43.compare(a, b), [before, fileJson]);
      check(`B ${key}: the downloaded JSON is the character on screen (what part A writes)`, exportDiff, []);
      await exporter.context.close();
      const importer = await openPage();
      await importer.page.setInputFiles("#import-file", { name: path.basename(filePath), mimeType: "application/json", buffer: Buffer.from(fileText) });
      await waitForImported(importer.page, path.basename(filePath));
      await importer.page.waitForTimeout(200);
      const importDiff = await importer.page.evaluate((file) => window.__t43.compare(file, window.__t43.snapshot()), fileJson);
      results.buttons.push({ key, exportDiff, importDiff });
      check(`B ${key}: Import Character on a fresh page brings back the exact character`, importDiff, []);
      check(`B ${key}: the import opens no notes window`, await importer.page.evaluate(() => window.__t43.importNotes()), null);
      await importer.context.close();
    }
  }

  // -------------------------------------------------------------------------
  if (runPart("C")) {
    section("C. Named save slot: Save Character, then Load Saved (reset page, and on top of another character)");
    const slotPage = await openPage();
    const species = ids.species.filter((entry) => !speciesFilter.length || speciesFilter.includes(entry));
    let index = 0;
    const slotProblems = {};
    for (const mode of ["standard", "mirane"]) {
      for (const speciesId of species) {
        const buildId = ids.builds[index % ids.builds.length];
        const other = species[(species.indexOf(speciesId) + 7) % species.length];
        const otherBuild = ids.builds[(index + 5) % ids.builds.length];
        index += 1;
        const key = `${mode}/${speciesId}/${buildId}`;
        const outcome = await slotPage.page.evaluate(async ([s, b, m, o, ob]) => {
          localStorage.removeItem("lyrian-chronicles-character-suite-slots-v1");
          const before = window.__t43.build(s, b, m, "T43 Slot " + s + " " + b).snapshot;
          const slotId = await window.__t43.saveSlot("T43 Slot " + s + " " + b);
          const load = () => {
            document.getElementById("builder-load-browser").click();
            const button = document.querySelector('[data-slot-action="load"][data-slot-id="' + slotId + '"]');
            if (!button) throw new Error("no Load button for slot " + slotId);
            button.click();
          };
          const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
          window.__t43.reset();
          load();
          await settle();
          const resetAfter = window.__t43.snapshot();
          const reset = window.__t43.compareSlot(before, resetAfter);
          window.__t43.build(o, ob, m === "mirane" ? "standard" : "mirane", "Someone Else");
          load();
          await settle();
          const onTopAfter = window.__t43.snapshot();
          const onTop = window.__t43.compareSlot(before, onTopAfter);
          return { slotId, reset, onTop, landed: [resetAfter.ui.mode, resetAfter.ui.activeSaveSlotId === slotId, onTopAfter.ui.mode, onTopAfter.ui.activeSaveSlotId === slotId] };
        }, [speciesId, buildId, mode, other, otherBuild]);
        results.slots.push({ key, ...outcome });
        const problems = [];
        if (!outcome.slotId) problems.push("slot not saved");
        if (outcome.reset.length) problems.push(`reset page: ${describe(outcome.reset).join("; ")}`);
        if (outcome.onTop.length) problems.push(`on top: ${describe(outcome.onTop).join("; ")}`);
        if (JSON.stringify(outcome.landed) !== JSON.stringify(["builder", true, "builder", true])) problems.push(`landed ${JSON.stringify(outcome.landed)}`);
        if (problems.length) slotProblems[key] = problems;
      }
    }
    await slotPage.context.close();
    check(`C: ${results.slots.length} slot characters come back the same (reset page and on top of another character)`, slotProblems, {});
    console.log(`   ${results.slots.filter((entry) => !entry.reset.length && !entry.onTop.length).length} of ${results.slots.length} slot characters exact on both loads.`);
  }

  // -------------------------------------------------------------------------
  if (runPart("D")) {
    section("D. Old files exported by the live site (3346d32) keep every racial skill point and choice");
    const expected = JSON.parse(await readFile(path.join(FIXTURE_DIR, "expected.json"), "utf8"));
    const fixtures = (await readdir(FIXTURE_DIR)).filter((name) => name.endsWith(".json") && name !== "expected.json").sort();
    check("D: the live-site fixtures are present, each with its live skill totals", [fixtures.length >= 3, fixtures.every((name) => expected.files?.[name]?.skills)], [true, true]);
    const oldPage = await openPage();
    let previous = null;
    for (const name of fixtures) {
      const fileText = await readFile(path.join(FIXTURE_DIR, name), "utf8");
      const file = JSON.parse(fileText);
      const liveSkillTotals = expected.files[name].skills;
      const racialFields = Object.fromEntries(Object.entries(file.fields).filter(([key, value]) => key.startsWith("RacialSkillPoint:") && value));
      check(`D ${name}: the old file holds its racial skill points`, Object.keys(racialFields).length > 0, true);
      for (const route of ["reset", "on top"]) {
        if (route === "reset") {
          await oldPage.page.evaluate(() => window.__t43.reset());
        } else if (previous) {
          await oldPage.page.evaluate(async ([n, t]) => window.__t43.importText(n, t), ["previous.json", previous]);
        }
        await oldPage.page.setInputFiles("#import-file", { name, mimeType: "application/json", buffer: Buffer.from(fileText) });
        await waitForImported(oldPage.page, name);
        await oldPage.page.waitForTimeout(200);
        const after = await oldPage.page.evaluate((skillNames) => ({
          snapshot: window.__t43.snapshot(),
          pools: window.__t43.racialPools(),
          skills: Object.fromEntries(skillNames.map((skill) => [skill, window.__t43.skillTotal(skill)])),
          notes: window.__t43.importNotes()
        }), Object.keys(liveSkillTotals));
        const otherChanges = await oldPage.page.evaluate(([a, b, c]) => window.__t43.compareOld(a, b, c), [file, after.snapshot, expected.files[name].intendedChanges || {}]);
        check(`D ${name} (${route}): nothing else changes, apart from the intended changes listed in expected.json`, otherChanges, []);
        const keptRacial = Object.fromEntries(Object.keys(racialFields).map((key) => [key, after.snapshot.fields[key]]));
        check(`D ${name} (${route}): every racial skill point in the old file is kept`, keptRacial, racialFields);
        check(`D ${name} (${route}): every racial skill pool is fully assigned`, after.pools.filter((pool) => pool.remaining !== 0), []);
        check(`D ${name} (${route}): every builder choice in the old file is kept`, after.snapshot.builder.choiceSelections, file.builder.choiceSelections);
        check(`D ${name} (${route}): every skill total equals what the live sheet showed`, after.skills, liveSkillTotals);
        check(`D ${name} (${route}): the import opens no notes window`, after.notes, null);
        results.oldFiles.push({ name, route, keptRacial, pools: after.pools, skills: after.skills });
      }
      previous = fileText;
    }
    await oldPage.context.close();
  }

  // -------------------------------------------------------------------------
  if (runPart("F")) {
    section("F. A character used on the sheet survives Export -> Import exactly");
    const DEFENSE = ["Guard", "Evasion", "Dodge", "Block", "Initiative"];
    const usedCases = [
      { mode: "standard", species: "human", build: "sneak-thief", unequip: "Armor (Light)", itemId: "armor--light-", skill: "Stealth", changesNumbers: true },
      // Task 045: the rifle scope's +10 Perception holds only beyond 60 ft, so it is no
      // longer in the totals and unequipping the rifle moves no sheet number. The
      // round trip below still runs on this character; the armor case above is the
      // one that proves an Unequip refreshes the numbers at once.
      { mode: "mirane", species: "catfolk", build: "scout-sniper-path", unequip: "Sniper Rifle (Two-Handed)", itemId: "sniper-rifle--two-handed-", skill: "Perception", changesNumbers: false }
    ].filter((entry) => !speciesFilter.length || speciesFilter.includes(entry.species));
    for (const used of usedCases) {
      const key = `${used.mode}/${used.species}/${used.build}`;
      const player = await openPage();
      await player.page.evaluate(([s, b, m]) => window.__t43.build(s, b, m, "T43 Used " + s), [used.species, used.build, used.mode]);
      await player.page.waitForSelector("#sheet-view:not(.is-hidden) #play-hit-points .play-hit-current", { timeout: 15000, state: "attached" });
      const read = () => player.page.evaluate(([names, skill]) => {
        const snapshot = window.__t43.snapshot();
        return { defense: Object.fromEntries(names.map((name) => [name, snapshot.fields[name]])), skill: window.__t43.skillTotal(skill), resources: snapshot.play.resources };
      }, [DEFENSE, used.skill]);
      const start = await read();
      await player.page.click('[data-play-mode="combat"]:visible').catch(() => {});
      await player.page.fill("#play-hp-adjust-amount", "7");
      await player.page.click("#play-damage-button");
      await player.page.fill('[data-play-resource="manaCurrent"]', String(Math.max(0, Number(start.resources.manaMax) - 3)));
      await player.page.fill('[data-play-resource="apCurrent"]', "2");
      const unequipped = await player.page.evaluate((itemId) => {
        const entry = window.__t43.snapshot().play.inventoryItems.find((item) => item.equipped && item.itemId === itemId);
        const button = entry && document.querySelector('[data-inventory-toggle-equip="' + entry.uid + '"]');
        if (!button) return "";
        button.click();
        return entry.uid;
      }, used.itemId);
      await player.page.waitForTimeout(200);
      const afterUnequip = await read();
      await player.page.evaluate(() => {
        const notes = document.getElementById("play-player-notes");
        notes.value = "Owes the ferryman 20 Clim.";
        notes.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector('[data-play-roll="saveBonus"]').click();
        const picker = document.querySelector('[data-ability-picker="Ability1"]');
        picker.value = "Sneak Attack";
        picker.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await player.page.waitForTimeout(300);
      const before = await player.page.evaluate(() => window.__t43.snapshot());
      await player.context.close();
      check(`F ${key}: the sheet actions happened (7 damage, AP 2, ${used.unequip} unequipped, note, log, ability slot)`, {
        damage: Number(before.play.resources.hpMax) - Number(before.play.resources.hpCurrent), ap: Number(before.play.resources.apCurrent),
        unequipped: Boolean(unequipped) && before.play.inventoryItems.some((item) => item.uid === unequipped && !item.equipped),
        note: before.play.playerNotes, log: before.play.log.length > 0, ability: before.abilitySelections.Ability1
      }, { damage: 7, ap: 2, unequipped: true, note: "Owes the ferryman 20 Clim.", log: true, ability: "Sneak Attack" });
      check(`F ${key}: unequipping ${used.unequip} ${used.changesNumbers ? "changes" : "changes no"} defense number or ${used.skill} on the sheet${used.changesNumbers ? " at once" : ""}`,
        JSON.stringify([afterUnequip.defense, afterUnequip.skill]) !== JSON.stringify([start.defense, start.skill]), used.changesNumbers);
      const importer = await openPage();
      const fileName = `t43-used-${used.species}.json`;
      const fileText = JSON.stringify(before, null, 2);
      const outcome = await importer.page.evaluate(async ([name, text, names, skill]) => {
        const file = JSON.parse(text);
        await window.__t43.importText(name, text);
        const onTop = window.__t43.compare(file, window.__t43.snapshot());
        window.__t43.reset();
        await window.__t43.importText(name, text);
        const after = window.__t43.snapshot();
        const reset = window.__t43.compare(file, after);
        return { onTop, reset, defense: Object.fromEntries(names.map((field) => [field, after.fields[field]])), skill: window.__t43.skillTotal(skill) };
      }, [fileName, fileText, DEFENSE, used.skill]);
      await importer.context.close();
      results.used = [...(results.used || []), { key, start, afterUnequip, outcome }];
      check(`F ${key}: the used character is exact when imported on top of another character`, describe(outcome.onTop), []);
      check(`F ${key}: the used character is exact when imported on a reset page`, describe(outcome.reset), []);
      check(`F ${key}: right after Unequip the sheet already shows what a fresh load computes`, [afterUnequip.defense, afterUnequip.skill], [outcome.defense, outcome.skill]);
    }
  }

  check("No uncaught browser JavaScript errors", pageErrors, []);
  console.log(`\n${passed} passed, ${failures.length} failed. Evidence: ${output}`);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed, failed: failures.length, failures, ...results }, null, 1));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: error.stack, failures, serverLog }, null, 2));
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
