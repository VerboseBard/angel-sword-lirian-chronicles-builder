// Task 038 checks: small builder fixes from the open-items ledger (027c) and the
// 031 / 036 / 037 / 03xb audits and the 041a tutorial research.
//
// One lettered part per fix, each run in a real browser through the real app:
//   A. (item 1, B13)  the saving-throw roll names the save total, Toughness and
//      each other bonus, instead of calling the whole modifier "Toughness".
//   B. (item 2, B14)  the CCS export's permanent cells (HP bonus H7, mana K34,
//      speed H6) leave out temporary play effects; no effects = as before.
//   C. (items 3, B15/B16) .aschar export writes each breakthrough's choice and
//      import applies it, or says in the import notes why it did not.
//   D. (item 4, B17)  the xlsx import reads every Breakthrough and Inventory
//      row of the official template, and rows past it (old limits 40 and 25).
//   E. (item 5, B21)  every top-level state key is reset by clearSheet and by a
//      load (hydrateStateFromObject); a new key that is missed fails here.
//   F. (item 7)       a crafter role card previews the Job Clim it really pays.
//   G. (item 8)       the Human Gadgeteer card says the spare point may go to the
//      Glove instead of the Job, with the GM's OK.
//   H. (item 9)       pick-one grants (Forager, Miner, Adventurer) count only the
//      chosen group; outright grants still count.
//   I. (item 10)      the Vampire Lord key's +1 Presence applies and is named on
//      the sheet; Anti-Mage's conditional save bonus is not applied.
//   J. (item 11)      Load Saved and a reload with an active slot land a built
//      character on Review and keep its HP / Mana / RP / AP.
//   K. (item 12)      a built character shows no Quick Build card, and nothing
//      on the landing rewrites Spirit Core, the start mode or the record.
//   L. (item 13)      the Review landing shows EXP spent and EXP banked: in the
//      "Current Build" panel at the top (task 038b, the 038 audit's must-fix),
//      and in the Review step's lower card.
//   M. (item 14)      037 test gaps: autosave flush before leaving the sheet;
//      Mana, RP and AP full stays full; Companion name without an opener.
//   N. (item 17)      no picture: the token step says to choose one with Change
//      Image first; with a picture the line is gone.
// Items 6, 15 and 16 are in test-031, test-owlbear-panel and test-032.
//
// The real src/js is bundled in memory with a test-only hook block appended to
// ui.js (the test-025/037 pattern); nothing in the shipped source is altered.
//
// Run:  npm run test:038   (builds first)
// Env:  T38_PORT (default 4386); T38_SRC=<folder with src/js> bundles another
//       source tree (used to show the old code fails); T38_ONLY=A,C limits parts.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.env.T38_SRC ? path.resolve(process.env.T38_SRC) : root;
const output = path.join(root, "qa-test-results/task-038-small-fixes");
await mkdir(output, { recursive: true });
const port = Number(process.env.T38_PORT || 4386);
const only = (process.env.T38_ONLY || "").split(",").map((entry) => entry.trim().toUpperCase()).filter(Boolean);

const STORAGE_KEY = "lyrian-chronicles-character-suite-v2";
const SAVE_SLOTS_KEY = "lyrian-chronicles-character-suite-slots-v1";
const ACTIVE_SAVE_SLOT_KEY = "lyrian-chronicles-character-suite-active-slot-v1";
const COMPANION_WINDOW_KEY = "angel-sword-companion-window-mode-v1";
const COMPANION_POPUP_NAME = "angel-sword-sheet-bridge";
const TOKEN_CROP_KEY = "asb.owlbear.tokenCrop.v1";
const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const failures = [];
let passed = 0;
const record = {};
const check = (name, actual, expected) => {
  try {
    assert.deepEqual(actual, expected, name);
    passed += 1;
  } catch {
    failures.push(name);
    const short = (value) => { const text = JSON.stringify(value) ?? "undefined"; return text.length > 900 ? `${text.slice(0, 900)}... (${text.length} chars)` : text; };
    console.log(`  FAIL ${name}\n       actual:   ${short(actual)}\n       expected: ${short(expected)}`);
  }
};
const section = (title) => console.log(`\n== ${title}`);

// ---------------------------------------------------------------------------
// Test-only hooks, appended to ui.js in the in-memory bundle. New functions are
// only referenced inside method bodies, so the same hooks also load on the old
// source (T38_SRC) and the parts that need the new code fail there one by one.
// ---------------------------------------------------------------------------
const hooks = `
import { loadSavedState as __t38LoadSavedState, handleImportedCharacterFile as __t38ImportFile } from "./io.js";
import { mergeBuilderState as __t38MergeBuilder, clearSheet as __t38ClearSheet, createDefaultState as __t38Defaults } from "./state.js";
import { ensureSpreadsheetRuntimeLoaded as __t38LoadXlsx } from "./runtime-loader.js";
import { buildAscharCharacter as __t38BuildAschar } from "./aschar.js";
window.__t38 = {
  fixture(input = {}) {
    const defaults = __t38Defaults();
    Object.assign(state, defaults, input);
    state.fields = { ...defaults.fields, ...(input.fields || {}) };
    state.ui = { ...defaults.ui, gameVersion: "0.13.2", ...(input.ui || {}) };
    state.builder = __t38MergeBuilder({ ...defaults.builder, ...(input.builder || {}) });
    state.play = mergePlayState(input.play || {});
    state.revision = (state.revision || 0) + 1;
    syncBuilderSelectionsIntoSheet();
    state.revision = (state.revision || 0) + 1;
  },
  id(kind, name) {
    const list = kind === "class" ? lookup.classes.entries : kind === "breakthrough" ? lookup.breakthroughs.entries : kind === "item" ? lookup.items.entries : kind === "race" ? detailLookup.races.entries : detailLookup.ancestries.entries;
    return (list.find((entry) => normalizePhrase(entry.name) === normalizePhrase(name)) || {}).id || "";
  },
  // A
  rollSave() {
    rollPlayCheck("saveBonus");
    const derived = getDerivedCombatStats();
    return { lines: [...(state.play.log[0]?.lines || [])], saveBonus: derived.saveBonus, toughness: getCurrentMainStatValues().Toughness };
  },
  // B
  ccs() {
    const map = buildCcsCellMap();
    const core = map.Core || {};
    const derived = getDerivedCombatStats();
    return {
      cells: { H6: core.H6 ?? null, H7: core.H7 ?? null, K34: core.K34 ?? null },
      derived: { hpMax: derived.hpMax, manaMax: derived.manaMax, speed: derived.speed },
      toughness: getComputedMainStatValue("Toughness"),
      power: getComputedMainStatValue("Power")
    };
  },
  // C
  exportAschar() { return JSON.parse(JSON.stringify(__t38BuildAschar(buildAscharContext()))); },
  async importAschar(character) { await applyAscharImport(character, "task 038 test file"); return this.breakthroughState(); },
  breakthroughState() {
    return {
      names: getSelectedBreakthroughRecords().map((entry) => entry.name),
      elements: getSelectedElementalAffinityElements(),
      choices: { ...state.builder.choiceSelections }
    };
  },
  importModal() {
    const modal = document.getElementById("sheet-modal");
    return {
      open: !modal.hidden && !modal.classList.contains("is-hidden"),
      title: document.getElementById("sheet-modal-title").textContent,
      items: [...modal.querySelectorAll("#sheet-modal-content li")].map((item) => item.textContent.replace(/\\s+/g, " ").trim())
    };
  },
  closeModal() { closeSheetModal(); },
  // D
  async xlsxBase64(sheets) {
    await __t38LoadXlsx();
    const workbook = window.XLSX.utils.book_new();
    for (const [name, cells] of Object.entries(sheets)) {
      let lastRow = 1;
      const sheet = {};
      for (const [address, value] of Object.entries(cells)) {
        sheet[address] = { t: typeof value === "number" ? "n" : "s", v: value };
        lastRow = Math.max(lastRow, Number(/\\d+$/.exec(address)[0]));
      }
      sheet["!ref"] = "A1:I" + lastRow;
      window.XLSX.utils.book_append_sheet(workbook, sheet, name);
    }
    return window.XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
  },
  async xlsxPayload(base64) {
    await __t38LoadXlsx();
    const workbook = window.XLSX.read(base64, { type: "base64" });
    const payload = buildSpreadsheetImportPayload(workbook);
    return {
      breakthroughNames: String(payload.fields.BName || "").split("\\n").filter(Boolean),
      inventory: (payload.play.inventoryItems || []).map((entry) => entry.custom ? entry.name : (lookup.items.resolve(entry.itemId)?.name || entry.itemId)),
      notes: [...(payload.importNotes || [])],
      capacity: INVENTORY_ROWS.length
    };
  },
  async importBytes(name, base64) {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    return __t38ImportFile(new File([bytes], name));
  },
  catalogNames() {
    return {
      breakthroughs: lookup.breakthroughs.entries.map((entry) => entry.name).filter(Boolean).slice(0, 44),
      items: lookup.items.entries.filter((entry) => !/weapon|armor|shield/i.test(String(entry.type) + " " + String(entry.subType))).map((entry) => entry.name).filter(Boolean).slice(0, 60)
    };
  },
  inventoryState() {
    return { entries: getPlayInventoryEntries().map((entry) => entry.name), breakthroughs: getSelectedBreakthroughRecords().map((entry) => entry.name) };
  },
  // E
  defaults() { return JSON.parse(JSON.stringify(__t38Defaults())); },
  topKeys() { return Object.keys(__t38Defaults()); },
  stateKey(key) { return JSON.parse(JSON.stringify(state[key] ?? null)); },
  // Every top-level key gets a marker, then clearSheet or a load runs in the
  // same tick (no timer sees the marked state). A key that is not reset keeps
  // its marker.
  markEveryTopKey() {
    Object.keys(__t38Defaults()).forEach((key) => {
      state[key] = typeof state[key] === "string" ? "__t38-sentinel__" : { __t38Sentinel: key };
    });
  },
  markThenClear() { this.markEveryTopKey(); __t38ClearSheet(); },
  markThenLoad(parsed) { this.markEveryTopKey(); return __t38LoadSavedState(parsed, { activeSlotId: "", statusOnFailure: false }); },
  // F / G
  quickApply(speciesId, buildIds) {
    window.confirm = () => true;
    const click = (selector) => { const element = document.querySelector(selector); if (!element) throw new Error("missing " + selector); element.click(); };
    if (!state.ui.quickBuildActive) click("#quick-build-entry");
    click('[data-step-index="0"]');
    click('[data-quick-build-action="select-species"][data-id="' + speciesId + '"]');
    click("#builder-next");
    click("#builder-next");
    const out = {};
    for (const id of buildIds) {
      click('[data-quick-build-action="select-build"][data-id="' + id + '"]');
      const detail = (document.getElementById("builder-detail-card")?.textContent || "").replace(/\\s+/g, " ");
      click("#builder-next");
      out[id] = { detail, jobClim: getStartingFundsState().creationInterludeClim, jobs: (state.builder.creationInterludeActions || []).filter((entry) => entry === "job").length };
      click('[data-quick-build-action="back-to-build"]');
    }
    return out;
  },
  // H
  groupTracked(label) { return hasTrackedSpecificProficiency([label]); },
  breakthroughMet(name) {
    const entry = lookup.breakthroughs.entries.find((item) => normalizePhrase(item.name) === normalizePhrase(name));
    return entry ? getBreakthroughRequirementStatus(entry).met : null;
  },
  choiceIdByLabel(pattern) { return getBuilderChoiceDefinitions().find((choice) => new RegExp(pattern, "i").test(choice.label))?.id || ""; },
  setChoice(id, value) { setBuilderChoiceValue(id, value); state.revision = (state.revision || 0) + 1; },
  // I
  statValues() {
    const bonuses = getComputedBonuses();
    return { presence: getComputedSecondaryStatValue("Presence", bonuses), saveBonus: getDerivedCombatStats().saveBonus, initiative: getDerivedCombatStats().initiative, autoApplied: [...bonuses.autoApplied] };
  },
  presenceCardText() {
    renderPlayDashboard();
    const card = [...document.querySelectorAll("#play-secondary-grid .play-secondary-card")].find((entry) => entry.querySelector("strong")?.textContent.trim() === "Presence");
    return (card?.textContent || "").replace(/\\s+/g, " ").trim();
  },
  // J / K / L / M
  pools() {
    const resources = state.play.resources;
    return { hp: Number(resources.hpCurrent), hpMax: Number(resources.hpMax), mana: Number(resources.manaCurrent), manaMax: Number(resources.manaMax), rp: Number(resources.rpCurrent), rpMax: Number(resources.rpMax), ap: Number(resources.apCurrent), apMax: Number(resources.apMax) };
  },
  setApMax(value) { state.play.resources.apMax = value; state.revision = (state.revision || 0) + 1; },
  view() {
    const text = (selector) => (document.querySelector(selector)?.textContent || "").replace(/\\s+/g, " ").trim();
    const shown = (id) => !document.getElementById(id).classList.contains("is-hidden");
    return {
      builder: shown("builder-view"), sheet: shown("sheet-view"),
      label: text("#builder-mode-label"), title: text("#builder-step-title"), progress: text("#builder-progress-text"),
      stepId: BUILDER_STEPS[state.ui.builderStep]?.id || "", quickBuildActive: Boolean(state.ui.quickBuildActive),
      quickBuildCardShown: !document.getElementById("quick-build-entry").classList.contains("is-hidden")
    };
  },
  identity() {
    return { spiritCore: state.fields["Spirit Core"] || "", autoSpiritCore: state.builder.autoSpiritCore || "", startMode: state.builder.startMode, quickBuild: JSON.parse(JSON.stringify(state.builder.quickBuild || {})), builderStep: state.ui.builderStep, quickBuildActive: Boolean(state.ui.quickBuildActive) };
  },
  expNumbers() {
    const budget = getClassUnlockBudgetState();
    return { spent: budget.spentExp, budget: budget.expBudget, remaining: budget.remainingExp, banked: getCampaignProgressState().expBank };
  },
  reviewText() { return (document.getElementById("builder-step-content")?.textContent || "").replace(/\\s+/g, " "); },
  // 038b: the EXP card in the TOP "Current Build" panel (#builder-summary), not the Review step's own card.
  // Task 042 (033b/038b audit break A3): the bank and the remaining EXP are
  // the same number once the builder has synced the Exp field, so the top card
  // is also read in the one state where they differ (a blank Exp field before
  // the sync: remaining = the creation budget, bank = 0). The "Banked EXP" line
  // must read the bank.
  unsyncedTopPanelExp() {
    state.fields.Exp = "";
    state.builder.autoExpBank = "";
    renderBuilderSummary();
    const card = [...document.querySelectorAll("#builder-summary .summary-card")].find((node) => node.querySelector("strong")?.textContent.trim() === "EXP");
    return { text: (card?.textContent || "").replace(/\\s+/g, " ").trim(), remaining: getClassUnlockBudgetState().remainingExp, banked: getCampaignProgressState().expBank };
  },
  topPanelExp() {
    const card = [...document.querySelectorAll("#builder-summary .summary-card")].find((node) => node.querySelector("strong")?.textContent.trim() === "EXP");
    if (!card) return { present: false, text: "", inSummaryPanel: false, aboveStepContent: false, top: null };
    const box = card.getBoundingClientRect();
    return {
      present: true, text: card.textContent.replace(/\\s+/g, " ").trim(),
      inSummaryPanel: Boolean(card.closest(".builder-stage-summary")),
      aboveStepContent: box.bottom <= document.getElementById("builder-step-content").getBoundingClientRect().top + 1,
      top: Math.round(box.top + window.scrollY)
    };
  },
  windowMode() { try { return sessionStorage.getItem(${JSON.stringify(COMPANION_WINDOW_KEY)}); } catch { return "unavailable"; } },
  storable() { return createStorableStateSnapshot(); },
  serialized() { return serializeCurrentState(); },
  // N
  tokenNote() {
    const note = document.querySelector("[data-owlbear-token-missing]");
    return note ? { shown: !note.classList.contains("is-hidden") && !note.hidden, text: note.textContent.replace(/\\s+/g, " ").trim() } : null;
  },
  setPortrait(dataUrl) { state.builder.portraitDataUrl = dataUrl; state.revision = (state.revision || 0) + 1; }
};`;

const bundle = await build({
  absWorkingDir: sourceRoot,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "task038-test-access", setup(buildApi) {
    buildApi.onLoad({ filter: /[/\\]src[/\\]js[/\\]ui\.js$/ }, async ({ path: file }) => ({
      contents: await readFile(file, "utf8") + hooks, loader: "js"
    }));
  } }]
});

function startServer() {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(root, "scripts/server.mjs"), [], {
      cwd: root,
      env: { ...process.env, LYRIAN_HOST: "127.0.0.1", LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" },
      silent: true
    });
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${buffer}`)), 20000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = /running at (http:\/\/[^\s]+)/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve({ child, url: match[1].endsWith("/") ? match[1] : `${match[1]}/` });
      }
    });
    child.stderr.on("data", (chunk) => { buffer += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`Server exited early (${code}): ${buffer}`)));
  });
}

let server;
let browser;
try {
  server = await startServer();
  const baseUrl = server.url;
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.route("**/assets/app.bundle.js*", (route) => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
  await context.route("**/api/vtt-relay/events*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, boot: "t38", seq: 0, events: [] }) }));
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("dialog", (dialog) => dialog.accept());

  const ready = async (target = page) => {
    await target.waitForFunction(() => window.__t38 && window.LYRIAN_DATA?.version === "0.13.2" && (document.getElementById("builder-step-content")?.innerHTML || "").length > 100, null, { timeout: 20000 });
    await target.waitForTimeout(1600); // the production idle sheet build
  };
  const fresh = async () => {
    await page.goto(baseUrl, { waitUntil: "load" });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: "load" });
    await ready();
  };
  const js = (selector, target = page) => target.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) throw new Error("missing " + sel);
    element.click();
  }, selector);
  const hook = (name, arg, target = page) => target.evaluate(([fn, value]) => window.__t38[fn](value), [name, arg]);
  const hookArgs = (name, args, target = page) => target.evaluate(([fn, list]) => window.__t38[fn](...list), [name, args]);
  const onSheet = (target = page) => target.waitForSelector("#sheet-view:not(.is-hidden) #play-hit-points .play-hit-current", { timeout: 15000, state: "attached" });
  const onBuilder = (target = page) => target.waitForSelector("#builder-view:not(.is-hidden)", { timeout: 15000 });
  const quickBuild = async (speciesId, buildId, name = "", mode = "standard") => {
    await js("#quick-build-entry");
    await js(`[data-quick-build-action="select-species"][data-id="${speciesId}"]`);
    await js("#builder-next");
    if (name) await page.fill("#builder-name-header", name);
    if (mode === "mirane") await js('[data-quick-start-mode="mirane"]');
    await js("#builder-next");
    await js(`[data-quick-build-action="select-build"][data-id="${buildId}"]`);
    await js("#builder-next");
    await js("#builder-next"); // Use This Character
    await onSheet();
  };
  const usePools = async (damage = 7) => {
    const before = await hook("pools");
    await page.click('[data-play-mode="combat"]:visible').catch(() => {});
    await page.fill('[data-play-resource="manaCurrent"]', String(Math.max(0, before.manaMax - 2)));
    await page.fill('[data-play-resource="rpCurrent"]', String(Math.max(0, before.rpMax - 1)));
    await page.fill('[data-play-resource="apCurrent"]', "2");
    await page.fill("#play-hp-adjust-amount", String(damage));
    await page.click("#play-damage-button");
    await page.waitForFunction((hp) => Number(document.querySelector(".play-hit-current")?.textContent) === hp, before.hpMax - damage);
    await page.waitForTimeout(400); // the sheet's own sync
    return hook("pools");
  };
  const continueToSheet = async () => {
    const view = await hook("view");
    if (view.stepId !== "review") await js('[data-step-index="9"]');
    await js("#builder-next");
    await onSheet();
  };
  const part = async (letter, title, fn) => {
    if (only.length && !only.includes(letter)) return;
    section(`${letter}. ${title}`);
    try {
      await fn();
    } catch (error) {
      failures.push(`${letter}: part stopped early`);
      const where = String(error.stack || "").split("\n").filter((line) => line.includes("test-038-small-fixes.mjs")).slice(0, 3).map((line) => line.trim().replace(/^at /, "").replace(/\(.*test-038-small-fixes\.mjs:/, "(line ")).join(" <- ");
      console.log(`  FAIL ${letter}: part stopped early: ${String(error.message || error).split("\n")[0]}${where ? `\n       at ${where}` : ""}`);
    }
  };

  await fresh();
  const ids = await page.evaluate(() => ({
    chimera: window.__t38.id("race", "Chimera"), catfolk: window.__t38.id("ancestry", "Catfolk"),
    fighter: window.__t38.id("class", "Fighter"), vampireLord: window.__t38.id("class", "Vampire Lord"), antiMage: window.__t38.id("class", "Anti-Mage"),
    gunslinger: window.__t38.id("class", "Gunslinger"),
    forager: window.__t38.id("class", "Forager"), miner: window.__t38.id("class", "Miner"), adventurer: window.__t38.id("class", "Adventurer"),
    carpenter: window.__t38.id("class", "Carpenter"), fencer: window.__t38.id("class", "Fencer"), acolyte: window.__t38.id("class", "Acolyte")
  }));
  assert.ok(Object.values(ids).every(Boolean), `fixture ids missing: ${JSON.stringify(ids)}`);
  const catfolk = (extra = {}) => ({
    ui: { mode: "sheet", ...(extra.ui || {}) },
    fields: { Name: "Mira Vale", Power: "2", Focus: "3", Agility: "3", Toughness: "3", Fitness: "2", Cunning: "1", Reason: "1", Awareness: "1", Presence: "2", Exp: "5000", ...(extra.fields || {}) },
    builder: { selectedRaceId: ids.chimera, selectedAncestryId: ids.catfolk, selectedClassIds: [ids.fighter], ...(extra.builder || {}) },
    play: { ...(extra.play || {}) }
  });
  const effect = (id, name, modifiers) => ({ id, name, source: "Task 038 test", summary: name, duration: "Until cleared", rules: { id, sourceType: "official", modifiers } });

  // -------------------------------------------------------------------------
  await part("A", "Saving-throw roll label names the total, Toughness and each bonus (B13)", async () => {
    await hook("fixture", catfolk());
    const plain = await hook("rollSave");
    record.saveRolls = [plain];
    const breakdownOf = (roll) => roll.lines[0] || "";
    check("A: no other bonus: 'Save bonus: +N (Toughness +N)'", breakdownOf(plain).replace(/^2d10: [^|]+\| /, ""), `Save bonus: +${plain.saveBonus} (Toughness +${plain.toughness})`);
    check("A: the roll no longer calls the whole modifier 'Toughness:'", /\| Toughness:/.test(breakdownOf(plain)), false);
    // An equipped custom item with a save bonus, and an active effect.
    await hook("fixture", catfolk({ play: {
      inventoryItems: [{ uid: "custom:t38:ward", itemId: "", custom: true, name: "Ward Charm", type: "Equipment", subType: "Trinket", cost: "", burden: "", quantity: 1, equipped: true, description: "You gain a +1 bonus to saving throws." }],
      activeEffects: [effect("t38-steady", "Steady Mind", { saveBonus: 2 })]
    } }));
    const named = await hook("rollSave");
    record.saveRolls.push(named);
    check("A: with an item and an effect the parts are named and add up",
      breakdownOf(named).replace(/^2d10: [^|]+\| /, ""),
      `Save bonus: +${named.saveBonus} (Toughness +${named.toughness}, Ward Charm equipped +1, other save modifiers (effects) +2)`);
    check("A: the total equals Toughness + item + effect", named.saveBonus, named.toughness + 3);
    check("A: the dice part is unchanged (2d10: a + b)", /^2d10: \d+ \+ \d+ \|/.test(breakdownOf(named)), true);
  });

  // -------------------------------------------------------------------------
  await part("B", "CCS permanent cells leave out temporary play effects (B14)", async () => {
    await hook("fixture", catfolk());
    const plain = await hook("ccs");
    // No active effects: the cells follow the same formula as before the fix.
    const expectedPlain = {
      H6: plain.derived.speed !== 20 ? plain.derived.speed : null,
      H7: (plain.derived.hpMax - (20 + plain.toughness * 10)) || null,
      K34: (plain.derived.manaMax - (6 + plain.power)) || null
    };
    check("B: no active effects: H6 / H7 / K34 export exactly as before", plain.cells, expectedPlain);
    check("B: the fixture has a non-default speed (Catfolk), so H6 is written", plain.cells.H6 !== null, true);
    const withEffects = catfolk({ play: { activeEffects: [
      effect("t38-slow", "Slow", { speedMultiplier: 0.5 }),
      effect("t38-elixir", "Bear Elixir", { hpMax: 10, rpMax: 1 }),
      effect("t38-tough", "Stone Skin", { Toughness: 1, manaMax: 2 })
    ] } });
    await hook("fixture", withEffects);
    const effected = await hook("ccs");
    record.ccs = { plain, effected };
    check("B: the effects really change the sheet (speed, max HP)", [effected.derived.speed < plain.derived.speed, effected.derived.hpMax > plain.derived.hpMax], [true, true]);
    check("B: with Slow, an HP elixir and a Toughness effect the permanent cells are unchanged", effected.cells, plain.cells);
    await hook("fixture", catfolk({ play: { activeEffects: [effect("t38-root", "Rooted", { speedSet: 0 })] } }));
    check("B: Rooted (speed set to 0) does not reach H6", (await hook("ccs")).cells.H6, plain.cells.H6);
  });

  // -------------------------------------------------------------------------
  await part("C", ".aschar breakthrough choices: export, import, round trip, notes (B15/B16)", async () => {
    const bt = (name) => page.evaluate((value) => window.__t38.id("breakthrough", value), name);
    const btIds = {
      ea: await bt("Elemental Affinity"), wt: await bt("Weapon Training"), lt: await bt("Language Training"),
      pst: await bt("Primary Stat Training"), st: await bt("Skill Training"), dc: await bt("Divine's Chosen"), ut: await bt("Universal Training")
    };
    const choiceSelections = {
      "breakthrough-elemental-affinity-elements": "Fire|Water",
      "breakthrough-weapon-training-groups": "Axes",
      "breakthrough-language-training-languages": "Sorthen",
      [`breakthrough-${btIds.pst}-main-stat`]: "Power",
      [`breakthrough-${btIds.st}-skill-mode`]: "skill",
      [`breakthrough-${btIds.st}-skill-target`]: "Stealth",
      [`breakthrough-${btIds.st}-skill-mode-2`]: "expertise",
      [`breakthrough-${btIds.st}-expertise-target-2`]: "Perception",
      [`breakthrough-${btIds.st}-expertise-specialty-2`]: "Tracking",
      [`breakthrough-${btIds.dc}-divine`]: "Kari",
      [`breakthrough-${btIds.ut}-main-stat`]: "Agility",
      [`breakthrough-${btIds.ut}-secondary-stat`]: "Cunning",
      [`breakthrough-${btIds.ut}-skill-target`]: "Athletics"
    };
    await hook("fixture", catfolk({ builder: {
      selectedBreakthroughIds: [btIds.ea, btIds.ea, btIds.wt, btIds.lt, btIds.pst, btIds.st, btIds.st, btIds.dc, btIds.ut],
      choiceSelections
    } }));
    const before = await hook("breakthroughState");
    check("C setup: the fixture holds every purchase and choice", [before.elements, before.names.length], [["Fire", "Water"], 9]);
    const exported = await hook("exportAschar");
    const exportedChoices = exported.breakthroughs.map((entry) => [entry.name, entry.choice || ""]);
    record.ascharExport = exportedChoices;
    check("C: export writes each purchase's choice", exportedChoices.map(([, choice]) => choice).sort(),
      ["Agility, Cunning, Athletics", "Axes", "Fire", "Kari", "Perception expertise: Tracking", "Power", "Sorthen", "Stealth", "Water"].sort());
    check("C: the two Elemental Affinity purchases carry their own element", exportedChoices.filter(([name]) => name === "Elemental Affinity").map(([, choice]) => choice), ["Fire", "Water"]);
    // Round trip: reset, then import our own file.
    await hook("fixture", {});
    const after = await hookArgs("importAschar", [exported]);
    const notes = (await hook("importModal")).items;
    await hook("closeModal");
    record.ascharRoundTrip = { after, notes };
    check("C: round trip keeps every purchase", after.names.slice().sort(), before.names.slice().sort());
    check("C: round trip keeps both elements", after.elements, ["Fire", "Water"]);
    const keep = (choices) => Object.fromEntries(Object.keys(choiceSelections).map((key) => [key, choices[key] || ""]));
    check("C: round trip restores every choice", keep(after.choices), choiceSelections);
    check("C: a clean round trip has no choice notes", notes.filter((note) => /Breakthrough (choice|purchase)/.test(note)), []);
    // An official-style file with bad and missing choices.
    const official = {
      name: "Bad Choices", gameMode: "lyrian",
      race: { primaryRaceId: ids.chimera, ancestryId: ids.catfolk },
      mainStats: { power: 2, focus: 3, agility: 3, toughness: 3 }, subStats: { fitness: 2, cunning: 1, reason: 1, awareness: 1, presence: 2 },
      classes: [{ classId: ids.fighter, name: "Fighter", levels: 1 }],
      breakthroughs: [
        { breakthroughId: btIds.ea, name: "Elemental Affinity", cost: 150, choice: "Plasma" },
        { breakthroughId: `${btIds.ea}::Wind`, name: "Elemental Affinity", cost: 150 },
        { breakthroughId: btIds.wt, name: "Weapon Training", cost: 25 },
        { breakthroughId: btIds.pst, name: "Primary Stat Training", cost: 400, choice: "Strength" },
        { breakthroughId: btIds.dc, name: "Divine's Chosen", cost: 0, choice: "Heira" }
      ]
    };
    const bad = await hookArgs("importAschar", [official]);
    const badNotes = (await hook("importModal")).items;
    await hook("closeModal");
    record.ascharBad = { bad, badNotes };
    check("C: a valid choice is applied (Divine's Chosen: Heira)", bad.choices[`breakthrough-${btIds.dc}-divine`] || "", "Heira");
    check("C: a choice carried in the official id ('::Wind') is applied", bad.elements, ["Wind"]);
    check("C: an unknown element is not added, a missing weapon group is not added", [bad.names.filter((name) => name === "Elemental Affinity").length, bad.names.includes("Weapon Training")], [1, false]);
    check("C: an unknown stat leaves Primary Stat Training without a choice", [bad.names.includes("Primary Stat Training"), bad.choices[`breakthrough-${btIds.pst}-main-stat`] || ""], [true, ""]);
    check("C: the import notes name the choice that did not match", badNotes.some((note) => /not matched/.test(note) && note.includes('Primary Stat Training "Strength"')), true);
    check("C: the import notes name the purchases that were not added", badNotes.some((note) => /not added/.test(note) && note.includes('Elemental Affinity "Plasma"') && note.includes("Weapon Training (no choice in the file)")), true);
  });

  // -------------------------------------------------------------------------
  await part("D", "xlsx import reads every Breakthrough and Inventory row (B17)", async () => {
    const names = await hook("catalogNames");
    check("D setup: 44 breakthrough and 60 item names", [names.breakthroughs.length, names.items.length], [44, 60]);
    const breakthroughCells = { A1: "Breakthrough" };
    names.breakthroughs.forEach((name, index) => { breakthroughCells[`A${index + 2}`] = name; }); // rows 2..45 (the template has 2..37)
    const inventoryCells = { A1: "Expedition Inventory" };
    names.items.forEach((name, index) => { inventoryCells[`A${index + 2}`] = name; inventoryCells[`B${index + 2}`] = 1; }); // rows 2..61
    inventoryCells.A137 = "Last Template Row Lantern";
    inventoryCells.A150 = "Added Row Trinket";
    const base64 = await hookArgs("xlsxBase64", [{ Core: { B2: "Many Rows", D2: "Chimera", D3: "Catfolk", A15: "Fighter", C15: 1 }, Breakthrough: breakthroughCells, Inventory: inventoryCells, Abilities: { A1: "Ability" } }]);
    const payload = await hook("xlsxPayload", base64);
    const capacity = payload.capacity;
    const overflow = names.items.length - capacity;
    record.xlsxPayload = { breakthroughs: payload.breakthroughNames.length, inventoryKept: payload.inventory.length, capacity, notes: payload.notes };
    check("D: every breakthrough row is read (44, old limit 40)", payload.breakthroughNames.length, 44);
    check("D: the breakthrough in the last row (45) is read", payload.breakthroughNames.includes(names.breakthroughs[43]), true);
    check("D setup: the builder holds 24 catalog items", capacity, 24);
    check("D: the builder's 24 catalog items are kept, in sheet order", payload.inventory.slice(0, capacity), names.items.slice(0, capacity));
    check("D: the template's last inventory row (137) and a row past it (150) are read", ["Last Template Row Lantern", "Added Row Trinket"].map((name) => payload.inventory.includes(name)), [true, true]);
    check("D: the catalog items past the 24 rows are read and named in the import notes (none dropped silently)",
      payload.notes.some((note) => note.startsWith(`${overflow} catalog item row(s) past the ${capacity} this builder can hold were not imported`) && note.includes(names.items[capacity])), true);
    check("D: every inventory row is accounted for (kept + reported = 62)", payload.inventory.length + overflow, 62);
    // The real import: the character carries every item the builder can hold,
    // including the 18th (the sheet has no item row 18; it used to vanish).
    await hook("fixture", {});
    await hookArgs("importBytes", ["many-rows.xlsx", base64]);
    await page.waitForTimeout(500);
    const imported = await hook("inventoryState");
    const modal = await hook("importModal");
    record.xlsxImported = { inventory: imported.entries.length, breakthroughs: imported.breakthroughs.length, notes: modal.items };
    check("D: the imported character carries 24 catalog items and the 2 custom rows", imported.entries.length, capacity + 2);
    check("D: the 18th and the 24th catalog item are on the character", [imported.entries.includes(names.items[17]), imported.entries.includes(names.items[23])], [true, true]);
    check("D: the imported character has the row-150 item", imported.entries.includes("Added Row Trinket"), true);
    check("D: the import notes window lists the items past the 24 rows", modal.items.some((item) => item.includes(`past the ${capacity} this builder can hold`)), true);
    await hook("closeModal").catch(() => {});
  });

  // -------------------------------------------------------------------------
  await part("E", "Every top-level state key is reset by clearSheet and by a load (B21)", async () => {
    const keys = await hook("topKeys");
    const defaults = await hook("defaults");
    record.stateKeys = keys;
    check("E setup: the state has its known top-level keys", keys.length >= 7, true);
    await hook("markThenClear");
    const afterClear = {};
    for (const key of keys) afterClear[key] = await hook("stateKey", key);
    const notReset = keys.filter((key) => JSON.stringify(afterClear[key]).includes("__t38"));
    check("E: clearSheet resets every top-level key (a key it misses keeps the marker)", notReset, []);
    check("E: clearSheet gives the default library selections and ability picks", [afterClear.librarySelections, afterClear.abilitySelections, afterClear.lastFocusedField], [defaults.librarySelections, defaults.abilitySelections, defaults.lastFocusedField]);
    // A load with none of the keys: each one must be replaced (default), not kept.
    await hook("markThenLoad", { fields: { Name: "Coverage" } });
    const afterEmptyLoad = {};
    for (const key of keys) afterEmptyLoad[key] = await hook("stateKey", key);
    check("E: a load replaces every top-level key, even ones the file lacks", keys.filter((key) => JSON.stringify(afterEmptyLoad[key]).includes("__t38")), []);
    // A load that carries every key: each one arrives.
    const parsed = Object.fromEntries(keys.map((key) => [key, typeof defaults[key] === "string" ? "Name" : defaults[key]]));
    parsed.fields = { Name: "Coverage Full", Power: "4" };
    parsed.librarySelections = { ...defaults.librarySelections, race: "t38-race" };
    parsed.abilitySelections = { t38: "kept" };
    await hook("markThenLoad", parsed);
    const afterFullLoad = {};
    for (const key of keys) afterFullLoad[key] = await hook("stateKey", key);
    check("E: a load with every key replaces every key", keys.filter((key) => JSON.stringify(afterFullLoad[key]).includes("__t38")), []);
    check("E: the loaded values arrive", [afterFullLoad.fields?.Name, afterFullLoad.librarySelections?.race, afterFullLoad.abilitySelections?.t38, afterFullLoad.lastFocusedField], ["Coverage Full", "t38-race", "kept", "Name"]);
  });

  // -------------------------------------------------------------------------
  await part("F", "A crafter role card previews the Job Clim it really pays (036 audit)", async () => {
    const BUILDS = ["gadgeteer", "potion-healer", "shield-warrior"];
    const problems = [];
    const rows = [];
    for (const species of ["human", "catfolk", "demon"]) {
      await fresh();
      const runs = await hookArgs("quickApply", [species, BUILDS]);
      for (const [buildId, run] of Object.entries(runs)) {
        const sentence = /Spare Interlude Points?: [^.]*for \+(\d+) Clim/.exec(run.detail);
        const previewed = sentence ? Number(sentence[1]) : null;
        rows.push({ species, buildId, previewed, applied: run.jobClim, jobs: run.jobs });
        if (previewed !== run.jobClim) problems.push(`${species}/${buildId}: card says +${previewed}, the build pays +${run.jobClim}`);
      }
    }
    record.roleCards = rows;
    check("F: every sampled role card previews the Job Clim the build pays", problems, []);
    check("F: the crafters' cards say +600 per Job (Human, Catfolk)", rows.filter((row) => row.species !== "demon" && row.buildId !== "shield-warrior").map((row) => row.previewed), [600, 600, 600, 600]);
    check("F: a non-crafter card says +300 (Human, Catfolk)", rows.filter((row) => row.species !== "demon" && row.buildId === "shield-warrior").map((row) => row.previewed), [300, 300]);
  });

  // -------------------------------------------------------------------------
  await part("G", "Human Gadgeteer card: the spare point may go to the Glove (036 audit)", async () => {
    const line = "With your GM's OK, the spare Interlude Point may go to the Glove instead of the Job.";
    const result = {};
    let humanCard = "";
    for (const species of ["human", "catfolk"]) {
      await fresh();
      const runs = await hookArgs("quickApply", [species, ["gadgeteer", "potion-healer"]]);
      result[species] = Object.fromEntries(Object.entries(runs).map(([buildId, run]) => [buildId, run.detail.includes(line)]));
      if (species === "human") humanCard = runs.gadgeteer.detail;
    }
    record.gadgeteerCard = (/Human optimization:[^]*?Job\./.exec(humanCard) || [""])[0];
    check("G: the Human Gadgeteer card has the Glove line", result.human.gadgeteer, true);
    check("G: the line follows the Human note that the extra EXP buys the Glove", /The extra 100 Human EXP buys Craft Artificer['’]s Glove[^.]*\. With your GM's OK/.test(humanCard), true);
    check("G: no other card gets the line (Human Potion Healer, Catfolk Gadgeteer and Potion Healer)", [result.human["potion-healer"], result.catfolk.gadgeteer, result.catfolk["potion-healer"]], [false, false, false]);
  });

  // -------------------------------------------------------------------------
  await part("H", "Pick-one proficiency grants count only the chosen group (036 audit)", async () => {
    const asClass = async (classId) => hook("fixture", { fields: { Name: "Matcher" }, builder: { selectedRaceId: ids.chimera, selectedAncestryId: ids.catfolk, selectedClassIds: [classId] } });
    const tracked = async (labels) => Object.fromEntries(await Promise.all(labels.map(async (label) => [label, await hook("groupTracked", label)])));
    // Forager: "your choice between Axes or Hori" (+ "You may use axes for harvesting").
    await asClass(ids.forager);
    check("H: Forager with no pick: neither Axes nor Hori", await tracked(["Axes", "Hori"]), { Axes: false, Hori: false });
    const foragerChoice = await hook("choiceIdByLabel", "^Forager: choose Axes or Hori");
    check("H setup: Forager has its pick screen", Boolean(foragerChoice), true);
    await hookArgs("setChoice", [foragerChoice, "Hori"]);
    check("H: Forager picks Hori: only Hori", await tracked(["Axes", "Hori"]), { Axes: false, Hori: true });
    await hookArgs("setChoice", [foragerChoice, "Axes"]);
    check("H: Forager picks Axes: only Axes", await tracked(["Axes", "Hori"]), { Axes: true, Hori: false });
    // Miner: "1 armor or in the shield".
    await asClass(ids.miner);
    check("H: Miner with no pick: no Shields, so Greatshield Training is not met", [await hook("groupTracked", "Shields"), await hook("breakthroughMet", "Greatshield Training")], [false, false]);
    const minerChoice = await hook("choiceIdByLabel", "^Miner: choose the armor or shield");
    await hookArgs("setChoice", [minerChoice, "Shields"]);
    check("H: Miner picks Shields: Shields, and Greatshield Training is met", [await hook("groupTracked", "Shields"), await hook("breakthroughMet", "Greatshield Training")], [true, true]);
    await hookArgs("setChoice", [minerChoice, "Light Armor"]);
    check("H: Miner picks Light Armor: Light Armor only", await tracked(["Light Armor", "Shields"]), { "Light Armor": true, Shields: false });
    // Adventurer: "Alternatively, you may pick the shield or greatshield."
    await asClass(ids.adventurer);
    check("H: Adventurer with no pick: neither Shields nor Greatshields; Greatshield Training not met",
      [await hook("groupTracked", "Shields"), await hook("groupTracked", "Greatshields"), await hook("breakthroughMet", "Greatshield Training")], [false, false, false]);
    const adventurerChoice = await hook("choiceIdByLabel", "^Adventurer: choose the armor or shield");
    await hookArgs("setChoice", [adventurerChoice, "Greatshields"]);
    check("H: Adventurer picks Greatshields: only Greatshields", await tracked(["Shields", "Greatshields"]), { Shields: false, Greatshields: true });
    await hookArgs("setChoice", [adventurerChoice, "Shields"]);
    check("H: Adventurer picks Shields: only Shields, Greatshield Training met", [await hook("groupTracked", "Shields"), await hook("groupTracked", "Greatshields"), await hook("breakthroughMet", "Greatshield Training")], [true, false, true]);
    // Outright grants are untouched.
    await asClass(ids.carpenter);
    check("H: Carpenter still gets Axes (granted outright)", await hook("groupTracked", "Axes"), true);
    await asClass(ids.fencer);
    check("H: Fencer still gets Dueling Weapons ('You gain proficiency with Dueling Weapons.')", await hook("groupTracked", "Dueling Weapons"), true);
    await asClass(ids.acolyte);
    check("H: Acolyte still gets Light Armor and Shields", await tracked(["Light Armor", "Shields"]), { "Light Armor": true, Shields: true });
  });

  // -------------------------------------------------------------------------
  await part("I", "Named key bonuses: Vampire Lord +1 Presence applied and named (036 audit)", async () => {
    await hook("fixture", catfolk());
    const base = await hook("statValues");
    await hook("fixture", catfolk({ builder: { selectedClassIds: [ids.fighter, ids.vampireLord] } }));
    const lord = await hook("statValues");
    record.namedBonus = { base, lord };
    check("I: the Vampire Lord key adds +1 Presence", lord.presence - base.presence, 1);
    check("I: the builder lists it as an applied bonus", lord.autoApplied.includes("Vampire Lord key ability: +1 Presence."), true);
    const card = await hook("presenceCardText");
    record.presenceCard = card;
    check("I: the sheet's Presence card names where the +1 comes from", card.includes("(Vampire Lord key ability +1)"), true);
    await hook("fixture", catfolk({ builder: { selectedClassIds: [ids.fighter, ids.antiMage] } }));
    const antiMage = await hook("statValues");
    check("I: Anti-Mage's '+2 bonus to your saves against Spells' (conditional) is not added to every save", antiMage.saveBonus, base.saveBonus);
    await hook("fixture", catfolk({ builder: { selectedClassIds: [ids.fighter, ids.gunslinger] } }));
    const gun = await hook("statValues");
    check("I: the Gunslinger key's named +1 initiative still applies (task 036)", gun.initiative - base.initiative >= 1, true);
  });

  // -------------------------------------------------------------------------
  await part("J", "Slot loads land a built character on Review and keep its pools (037 audit finding 1)", async () => {
    await fresh();
    await quickBuild("human", "gunslinger", "Slot Lander");
    const wounded = await usePools(8);
    await js('[data-play-mode="table"]');
    await js('[data-table-tool-action="save"]');
    await page.fill("#save-slot-name-input", "Slot Lander");
    await js('[data-save-slot-submit="new"]');
    await page.waitForFunction(() => /Saved Slot Lander/.test(document.getElementById("status-pill")?.textContent || ""));
    await page.keyboard.press("Escape");
    // Load Saved from the sheet's Table Tools.
    await js('[data-play-mode="table"]');
    await js('[data-table-tool-action="load"]');
    await js('[data-slot-action="load"]');
    await page.waitForFunction(() => /Loaded Slot Lander/.test((document.getElementById("status-pill")?.textContent || "") + (document.getElementById("builder-status-pill")?.textContent || "")));
    await onBuilder();
    const loadedView = await hook("view");
    record.slotLoad = { wounded, loadedView };
    check("J: Load Saved from the sheet lands on Advanced Build, Review the Character", [loadedView.label, loadedView.title, loadedView.stepId, loadedView.quickBuildActive], ["Advanced Build", "Review the Character", "review", false]);
    await continueToSheet();
    const afterLoad = await hook("pools");
    check("J: Load Saved + Continue keeps HP, Mana, RP and AP", afterLoad, wounded);
    // A reload with the active slot, sitting on the sheet.
    await page.waitForTimeout(300);
    await page.reload({ waitUntil: "load" });
    await ready();
    const reloadView = await hook("view");
    check("J: a reload with an active slot lands on Review (not Choose a Primary Race)", [reloadView.builder, reloadView.label, reloadView.stepId], [true, "Advanced Build", "review"]);
    await continueToSheet();
    check("J: reload + Continue keeps HP, Mana, RP and AP", await hook("pools"), wounded);
    // Reset Character and a fresh Quick Build are unchanged.
    await js("#return-to-builder");
    await onBuilder();
    await js("#builder-start-over-sidebar");
    await js("[data-reset-character-confirm]");
    const resetView = await hook("view");
    check("J: Reset Character still opens step 1", [resetView.label, resetView.progress], ["Advanced Build", "Step 1 of 10"]);
    await quickBuild("catfolk", "hunter-archer");
    const freshPools = await hook("pools");
    check("J: a fresh Quick Build still starts full", [freshPools.hp === freshPools.hpMax, freshPools.mana === freshPools.manaMax, freshPools.rp === freshPools.rpMax, freshPools.ap === freshPools.apMax], [true, true, true, true]);
    // A slot holding a character with no class yet still opens step 1.
    const halfBuilt = { fields: { Name: "No Class" }, builder: { selectedRaceId: ids.chimera, selectedAncestryId: ids.catfolk } };
    await page.evaluate(([slotsKey, activeKey, snapshot]) => {
      localStorage.clear();
      localStorage.setItem(slotsKey, JSON.stringify({ version: 1, slots: [{ id: "slot-t38-half", name: "No Class", savedAt: new Date().toISOString(), snapshot }] }));
      localStorage.setItem(activeKey, "slot-t38-half");
    }, [SAVE_SLOTS_KEY, ACTIVE_SAVE_SLOT_KEY, halfBuilt]);
    await page.reload({ waitUntil: "load" });
    await ready();
    check("J: a slot character with no class yet still opens on step 1", (await hook("view")).progress, "Step 1 of 10");
  });

  // -------------------------------------------------------------------------
  await part("K", "No Quick Build card on a built character (037 audit finding 2)", async () => {
    await fresh();
    check("K: a fresh state shows the Quick Build card", (await hook("view")).quickBuildCardShown, true);
    for (const mode of ["standard", "mirane"]) {
      await fresh();
      await quickBuild("human", "gunslinger", `Card ${mode}`, mode);
      await page.fill('[data-play-transaction-amount="Exp"]', "120");
      await js('[data-play-transaction-field="Exp"][data-play-transaction-action="add"]');
      await js("#return-to-builder");
      await onBuilder();
      const view = await hook("view");
      check(`K (${mode}): the built character's landing shows no Quick Build card`, [view.stepId, view.quickBuildCardShown], ["review", false]);
      const before = await hook("identity");
      // The card's own handler, reached anyway: nothing changes, no Quick Build.
      await js("#quick-build-entry");
      await page.waitForTimeout(150);
      const returnButton = await page.evaluate(() => !document.getElementById("builder-return-advanced").classList.contains("is-hidden"));
      if (returnButton) await js("#builder-return-advanced");
      const after = await hook("identity");
      check(`K (${mode}): nothing on the landing rewrites Spirit Core, the start mode or the Quick Build record`, after, before);
      check(`K (${mode}): the start mode is still ${mode}`, after.startMode, mode);
    }
    await js("#builder-start-over-sidebar");
    await js("[data-reset-character-confirm]");
    check("K: after Reset Character the card is back", (await hook("view")).quickBuildCardShown, true);
  });

  // -------------------------------------------------------------------------
  await part("L", "The Review landing shows EXP spent and EXP banked, at the top (037 audit finding 3; 038b)", async () => {
    await fresh();
    await quickBuild("human", "gunslinger", "Exp Shower");
    await page.fill('[data-play-transaction-amount="Exp"]', "300");
    await js('[data-play-transaction-field="Exp"][data-play-transaction-action="add"]');
    await js("#return-to-builder");
    await onBuilder();
    const numbers = await hook("expNumbers");
    const text = await hook("reviewText");
    record.reviewExp = { numbers, excerpt: (/EXP[^]{0,90}/.exec(text) || [""])[0] };
    check("L setup: the landing is Review and 300 EXP are banked", [(await hook("view")).stepId, numbers.banked], ["review", 300]);
    check("L: Review shows EXP spent in the Quick Build review's wording", text.includes(`Spent ${numbers.spent} / ${numbers.budget}; remaining ${numbers.remaining}`), true);
    check("L: Review shows the banked EXP", text.includes(`Banked EXP: ${numbers.banked}`), true);
    // 038b: the 038 audit found the card only in the lower grid (2,400 px down on a
    // desktop, 5,000 on a phone). The player lands on the TOP Current Build panel.
    const top = await hook("topPanelExp");
    record.topPanelExp = top;
    check("L (038b): the top Current Build panel has an EXP card", top.present, true);
    check("L (038b): the top card shows EXP spent in the same wording", top.text.includes(`Spent ${numbers.spent} / ${numbers.budget}; remaining ${numbers.remaining}`), true);
    check("L (038b): the top card shows the banked EXP", top.text.includes(`Banked EXP: ${numbers.banked}`), true);
    check("L (038b): the card is inside the Current Build panel, above the step content", [top.inSummaryPanel, top.aboveStepContent], [true, true]);
    check("L (038b): the card is on the first screen of the landing (top of page under 900 px)", top.top !== null && top.top < 900, true);
    // Task 042 (033b/038b audit break A3).
    await fresh();
    const unsynced = await hook("unsyncedTopPanelExp");
    record.unsyncedTopPanelExp = unsynced;
    check("L (042): setup: with a blank Exp field the remaining EXP and the bank differ", [unsynced.remaining > 0, unsynced.banked], [true, 0]);
    check("L (042): the top card's 'Banked EXP' line reads the bank (0), not the remaining EXP", [unsynced.text.includes("Banked EXP: 0"), unsynced.text.includes(`Banked EXP: ${unsynced.remaining}`)], [true, false]);
  });

  // -------------------------------------------------------------------------
  await part("M", "037 test gaps: flush before leaving, full Mana/RP/AP stay full, name without opener", async () => {
    await fresh();
    await quickBuild("human", "gunslinger", "Gap Tester");
    await page.click('[data-play-mode="combat"]:visible').catch(() => {});
    // M1 (037 audit N07): a sheet field edited and the Lyrian symbol pressed
    // in the same moment. The sheet's 180 ms sync must run before the pools
    // are remembered: Toughness +1 on a wounded character gives max HP +10 and
    // the sheet's own rule (the wound moves up with the maximum).
    const wounded = await usePools(6);
    await page.waitForFunction(() => Boolean(document.querySelector('#sheet-stack [data-field="Toughness"]')), null, { timeout: 15000 });
    await page.evaluate(() => {
      const input = document.querySelector('#sheet-stack [data-field="Toughness"]');
      input.value = String(Number(input.value || 0) + 1);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.getElementById("return-to-builder").click();
    });
    await onBuilder();
    await page.waitForTimeout(400);
    await continueToSheet();
    const flushed = await hook("pools");
    record.flush = { wounded, flushed };
    check("M1: a sheet edit made just before leaving is applied first (max HP +10, the wound kept, HP +10)", [flushed.hpMax, flushed.hp], [wounded.hpMax + 10, wounded.hp + 10]);
    // M2: full pools, then a builder visit raises the Mana, RP and AP maximums.
    await page.click('[data-play-mode="combat"]:visible').catch(() => {});
    const beforeFill = await hook("pools");
    await page.fill('[data-play-resource="manaCurrent"]', String(beforeFill.manaMax));
    await page.fill('[data-play-resource="rpCurrent"]', String(beforeFill.rpMax));
    await page.fill('[data-play-resource="apCurrent"]', String(beforeFill.apMax));
    await page.waitForTimeout(400);
    const full = await hook("pools");
    check("M2 setup: Mana, RP and AP are full", [full.mana === full.manaMax, full.rp === full.rpMax, full.ap === full.apMax], [true, true, true]);
    const changeStats = async (deltas) => {
      await js("#return-to-builder");
      await onBuilder();
      await js('[data-step-index="3"]');
      await page.selectOption('[data-builder-mode="mainStatMode"]', "custom");
      for (const [stat, delta] of Object.entries(deltas)) {
        const current = Number(await page.inputValue(`[data-stat-field="${stat}"]`));
        await page.fill(`[data-stat-field="${stat}"]`, String(current + delta));
        // Leave the field so its change is applied before the next field
        // (the stat step re-renders on change).
        await page.press(`[data-stat-field="${stat}"]`, "Tab");
        await page.waitForTimeout(300);
      }
    };
    // Trip 1: Power +1 (max Mana +1), AP max +1, Agility -1 (max RP -1: a full
    // pool is cut to the new max and stays full).
    await changeStats({ Power: 1, Agility: -1 });
    await hook("setApMax", String(full.apMax + 1));
    await continueToSheet();
    const trip1 = await hook("pools");
    // Trip 2: Agility +1 again (max RP +1) with RP full.
    await changeStats({ Agility: 1 });
    await continueToSheet();
    const trip2 = await hook("pools");
    record.fullStaysFull = { full, trip1, trip2 };
    check("M2: the maximums rose (Mana and AP on trip 1, RP on trip 2)", [trip1.manaMax > full.manaMax, trip1.apMax > full.apMax, trip2.rpMax > trip1.rpMax], [true, true, true]);
    check("M2 setup: RP was full before trip 2", trip1.rp, trip1.rpMax);
    check("M2: full Mana, AP and RP stay full when the maximum rises", [trip1.mana, trip1.ap, trip2.rp], [trip1.manaMax, trip1.apMax, trip2.rpMax]);
    // M3: the Companion popup name but no opener (the Owlbear tab closed).
    const working = await hook("serialized");
    const lonely = await context.newPage();
    const lonelyErrors = [];
    lonely.on("pageerror", (error) => lonelyErrors.push(String(error)));
    await lonely.goto(baseUrl, { waitUntil: "load" });
    await lonely.evaluate(([key, value, popupName]) => {
      const parsed = JSON.parse(value);
      parsed.ui = { ...(parsed.ui || {}), mode: "builder", builderStep: 0 };
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(parsed));
      sessionStorage.clear();
      window.name = popupName;
    }, [STORAGE_KEY, working, COMPANION_POPUP_NAME]);
    await lonely.reload({ waitUntil: "load" });
    await ready(lonely);
    const lonelyView = await hook("view", undefined, lonely);
    const lonelyName = await lonely.evaluate(() => window.name);
    check("M3 setup: the window carries the Companion popup name and has no opener", [lonelyName, await lonely.evaluate(() => Boolean(window.opener))], [COMPANION_POPUP_NAME, false]);
    check("M3: without an opener it is not treated as a Companion window (stays in the builder)", [lonelyView.builder, lonelyView.sheet], [true, false]);
    check("M3: ... and writes no Companion window memory", await hook("windowMode", undefined, lonely), null);
    check("M3: no page errors", lonelyErrors, []);
    await lonely.close();
  });

  // -------------------------------------------------------------------------
  await part("N", "No picture: the token step says to choose one with Change Image (041a)", async () => {
    await fresh();
    await quickBuild("human", "gunslinger", "No Picture");
    const openGuide = async () => {
      await js('[data-play-mode="table"]');
      await js('[data-table-tool-guide="owlbear"]');
      await page.waitForSelector("#sheet-modal:not([hidden]) .owlbear-setup-guide");
    };
    await openGuide();
    const missing = await hook("tokenNote");
    record.tokenNote = missing;
    check("N: with no picture the token step shows the line", missing?.shown, true);
    check("N: the line names Change Image and Download Token Image", Boolean(missing && missing.text.includes("Change Image") && missing.text.includes("Download Token Image")), true);
    await page.setInputFiles("#owlbear-token-file", { name: "token.png", mimeType: "image/png", buffer: Buffer.from(ONE_PIXEL_PNG, "base64") });
    await page.waitForFunction(() => document.querySelector("[data-owlbear-token-missing]")?.classList.contains("is-hidden"), null, { timeout: 5000 });
    check("N: after Change Image picks a picture the line is gone", (await hook("tokenNote"))?.shown, false);
    // A character with a portrait (and no saved token crop) never shows it.
    await page.keyboard.press("Escape");
    await page.evaluate((key) => localStorage.removeItem(key), TOKEN_CROP_KEY);
    await page.reload({ waitUntil: "load" });
    await ready();
    await hook("setPortrait", `data:image/png;base64,${ONE_PIXEL_PNG}`);
    await openGuide();
    check("N: a character with a portrait has no line", (await hook("tokenNote"))?.shown, false);
  });

  check("no page errors in the builder runs", pageErrors, []);
  await writeFile(path.join(output, "task-038-record.json"), JSON.stringify(record, null, 2));
  await context.close();
} finally {
  await browser?.close().catch(() => {});
  server?.child.kill();
}

console.log(`\n${passed} checks passed, ${failures.length} failed. Evidence: ${output}`);
if (failures.length) {
  console.log(`Failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("Task 038 checks: PASS");
