// Task 033 checks: the Crafting and Gathering tabs follow the 0.13.2 rulebook
// on the basics, and old saves keep working.
//
// What this proves (rule text first, then what the sheet does):
//   A. DICE. A new character starts with 5 crafting dice ("you are give 5
//      Crafting Dice"). Rolling needs no typing first.
//   B. SAVE MIGRATION. A save written before this task (no `diceStartMigrated`
//      flag) with the untouched default 0 / 0 becomes 5 / 5. A value the player
//      set by hand stays, including a hand-set 0 once the save carries the flag.
//      Checked through all three routes: the autosave on reload, a named slot
//      (Load Saved) and a JSON import.
//   C. THE ROLL. "D10 + Crafting Skill (+Expertise) + Modifiers": each recipe
//      category adds its own crafting skill (checked for all six categories,
//      with a decoy on the knowledge skill Artifice), stacked with the manual
//      bonus and the facility bonus, and the breakdown names the skill. The
//      facility skill names match the skill list, so a d20 Blacksmith check
//      gets the Blacksmith Workshop bonus and Artifice does not.
//   D. MOD NOTES. The free-text mod notes survive Reset Session, Start New
//      Craft, a reload, a named slot and a JSON export / import, and a
//      successful craft stores them on the crafted item, which shows them in the
//      inventory.
//   E. CRAFT SUCCESS. The rulebook's John Carpenter example is replayed: points
//      left after a mod must reach the crafting HP ("a minimum of 30", "30
//      points is enough"). Craft Succeeded is locked below that and open at it;
//      Craft Failed is always open; success does not spend the HP; the old
//      "Spend Recipe Points" button is gone.
//   F. FAILURE TEXT. A failed craft says the materials are lost, as the
//      rulebook says, and no message claims the rules are silent.
//   G. FACILITY SKILL NAMES. Every facility profile names a crafting skill that
//      is in the skill list.
//   H. TIER-3 NODE. The Escudo Deposit is labeled as a GM option outside the
//      0.13.2 rules and no longer needs "Advanced Ore Hunter"; "Ore Hunter" is a
//      real ability in the data and opens tier 2.
//   I. EXPERTISE IN THE ROLL (task 033b). "D10 + Crafting Skill (+Expertise)
//      + Modifiers", e.g. "Blacksmithing 5 and Longsword 10 ... +15". The roll
//      has a picker (default none) listing only named expertise the character
//      owns on the recipe's own crafting skill; one at a time; the breakdown
//      names it; it stacks with the manual and facility bonuses; it clears with
//      the recipe; a stale, forged or foreign name adds nothing; the +10 cap
//      holds; an old save without the field rolls exactly as before. This is
//      the fixture the 033 audit asked for (its break Y2 survived 166 checks).
//   J. ALCHEMY MAKES 3 (task 033b). "Alchemists always craft at least 3 of the
//      item": all 58 Alchemy recipes make 3, every other recipe 1; the log,
//      status line and inventory say so; Undo removes all 3; using one of the
//      three leaves two and no phantom second stack.
//   K. NOTES AFTER A SUCCESS (task 033b). Start New Craft clears the mod notes
//      only when the craft just resolved was a success (they are on the item);
//      after a failure, after an Undo, or with no craft yet, they stay.
//
// The real src/js is bundled in memory with a test-only hook block appended to
// ui.js (the test-025/029/036/037 pattern); nothing in the shipped source is
// altered. The built assets/app.bundle.js is also checked for the task's code.
//
// Run:  node scripts/test-033-crafting.mjs   (npm run test:033)
// Env:  T33_PORT (default 4433); T33_SRC=<folder with src/js> bundles another
//       source tree (used to run this test against the code before the task,
//       and against deliberately broken copies); T33_OUT=<folder> for the
//       evidence files. T33_SKIP=B leaves out the slow three-route save
//       migration loop of section B (for quick runs against deliberately broken
//       copies of code that has nothing to do with saves; the gate runs it all).
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.env.T33_SRC ? path.resolve(process.env.T33_SRC) : root;
const output = process.env.T33_OUT ? path.resolve(process.env.T33_OUT) : path.join(root, "qa-test-results/task-033-crafting");
await mkdir(output, { recursive: true });
const port = Number(process.env.T33_PORT || 4433);
const skipSections = new Set((process.env.T33_SKIP || "").split(",").map((entry) => entry.trim()).filter(Boolean));
const url = `http://localhost:${port}/`;

const failures = [];
let passed = 0;
const check = (name, actual, expected) => {
  try {
    assert.deepEqual(actual, expected, name);
    passed += 1;
  } catch {
    failures.push(name);
    const short = (value) => { const text = JSON.stringify(value) ?? "undefined"; return text.length > 500 ? `${text.slice(0, 500)}... (${text.length} chars)` : text; };
    console.log(`  FAIL ${name}\n       actual:   ${short(actual)}\n       expected: ${short(expected)}`);
  }
};
const section = (title) => console.log(`\n== ${title}`);

// ---------------------------------------------------------------------------
// The rule text, read straight from the 0.13.2 data (not from the builder).
// ---------------------------------------------------------------------------
const decoded = async (name) => JSON.parse(await readFile(path.join(root, "data/angelssword/decoded", name), "utf8"));
const rulebook = (await decoded("rulebook.json")).contentText;
const keyAbilities = await decoded("key_abilities.json");
const STORAGE_KEY = "lyrian-chronicles-character-suite-v2";
const SAVE_SLOTS_KEY = "lyrian-chronicles-character-suite-slots-v1";
const OLD_BUNDLE_TOKEN = "20261019-task032-dice";

// ---------------------------------------------------------------------------
// Test-only hooks, appended to ui.js in the in-memory bundle.
// ---------------------------------------------------------------------------
const hooks = `
window.__t33 = {
  state() { return JSON.parse(JSON.stringify(state)); },
  recipeId(name) { return findRecordByName(lookup.items.entries, name)?.id || ""; },
  recipePoints(name) { return findRecordByName(lookup.items.entries, name)?.craftingPoints ?? null; },
  recipeEntries() { return lookup.items.entries.filter((entry) => entry.craftingType && entry.craftingType !== "-").map((entry) => [entry.name, entry.craftingType, entry.craftingPoints ?? null]); },
  classId(name) { return findRecordByName(lookup.classes.entries, name)?.id || ""; },
  skillIndex(name) { return SKILL_DEFINITIONS.findIndex((definition) => definition.name === name) + 1; },
  craftingSkillNames() { return SKILL_DEFINITIONS.filter((definition) => definition.group === "crafting").map((definition) => definition.name); },
  allSkillNames() { return SKILL_DEFINITIONS.map((definition) => definition.name); },
  profiles() { return JSON.parse(JSON.stringify(CRAFTING_FACILITY_PROFILES)); },
  nodeProfile(key) { return JSON.parse(JSON.stringify(GATHERING_RESOURCE_PROFILES[key] || null)); },
  nodeKeysAtTier(tier) { return Object.entries(GATHERING_RESOURCE_PROFILES).filter(([, profile]) => profile.tier === tier).map(([key]) => key); },
  resolveCraft(didSucceed) { resolveCraftOutcome(didSucceed); return { status: document.getElementById("status-pill")?.textContent || "", crafting: JSON.parse(JSON.stringify(state.play.crafting)) }; },
  // Task 033b hooks.
  setRollExpertise(name) { if (typeof setCraftingRollExpertise !== "function") return { status: "(no such function)", rollExpertise: null }; setCraftingRollExpertise(name); return { status: document.getElementById("status-pill")?.textContent || "", rollExpertise: state.play.crafting.rollExpertise }; },
  craftedQuantities() { return lookup.items.entries.filter((entry) => entry.craftingType && entry.craftingType !== "-").map((entry) => [entry.name, entry.craftingType, typeof getCraftedQuantity === "function" ? getCraftedQuantity(entry) : null]); },
  ownOfficial(name) { const id = this.recipeId(name); setBuilderItemQuantity(id, 1); ensurePlayInventoryFromBuilder(); return id; },
  consumeOne(uid) {
    const entry = state.play.inventoryItems.find((candidate) => candidate.uid === uid);
    const message = consumeInventoryItemUse(uid, mergeInventoryEntryWithRecord(entry));
    ensurePlayInventoryFromBuilder();
    renderPlayDashboard();
    return message;
  },
  install(spec = {}) {
    Object.entries(spec.skillPoints || {}).forEach(([name, points]) => { state.fields["SkillPoint" + this.skillIndex(name)] = String(points); });
    // spec.expertise = { "<skill>": [["<specialty>", <points, +2 each>], ...] }
    if (spec.expertise) state.builder.skillExpertiseEntries = Object.entries(spec.expertise).flatMap(([skill, list]) => list.map(([name, points]) => ({ skillIndex: this.skillIndex(skill), name, source: "creation", choiceId: "", points })));
    if (spec.classes) state.builder.selectedClassIds = spec.classes.map((name) => this.classId(name)).filter(Boolean);
    state.play = mergePlayState(state.play);
    (spec.tools || []).forEach((name) => state.play.inventoryItems.push({ uid: "t33:" + name, itemId: "", custom: true, equipped: false, quantity: 1, name, type: "Tool", subType: "", cost: "", burden: "", description: name }));
    Object.assign(state.play.crafting, spec.crafting || {});
    state.ui.mode = "sheet";
    state.ui.playMode = spec.playMode || "crafting";
    persistWorkingState(false);
  }
};`;

const bundle = await build({
  absWorkingDir: sourceRoot,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "task033-test-access", setup(buildApi) {
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
try {
  for (let retry = 0; ; retry++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    if (retry === 80 || server.exitCode !== null) throw new Error(`Test server failed: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // =========================================================================
  section("0. The built app carries the task 033 code");
  const builtBundle = await readFile(path.join(root, "assets/app.bundle.js"), "utf8");
  const indexHtml = await readFile(path.join(root, "index.html"), "utf8");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const bundleToken = /app\.bundle\.js\?v=([^"]+)"/.exec(indexHtml)?.[1] || "";
  check("built bundle has the dice migration flag", builtBundle.includes("diceStartMigrated"), true);
  check("built bundle has no Spend Recipe Points action", builtBundle.includes("spend-recipe"), false);
  check("built bundle no longer says the rules do not spell out failure costs", builtBundle.includes("do not spell out failure costs"), false);
  check("built bundle has no 'Advanced Ore Hunter'", builtBundle.includes("Advanced Ore Hunter"), false);
  check("index.html bumped the app bundle cache-buster past the 032 token", Boolean(bundleToken) && bundleToken !== OLD_BUNDLE_TOKEN, true);
  check("package.json has npm run test:033", packageJson.scripts["test:033"], "npm run build && node scripts/test-033-crafting.mjs");

  // The crafting HP data. The shipped per-version item data has none, so the
  // sheet could never compare points with an item's crafting HP (and the old
  // Spend Recipe Points button was always disabled). src/js/crafting-points.js
  // supplies it, generated from the official item_details.json.
  section("0b. The crafting HP of each item reaches the sheet");
  const itemDetails = await decoded("item_details.json");
  const shippedData = await readFile(path.join(root, "assets/versions/0.13.2/lyrian-data.js"), "utf8");
  const shippedItems = new Function("window", shippedData + "; return window.LYRIAN_DATA.items;")({}).map((entry) => ({ name: entry.name, craftingType: entry.craftingType, craftingPoints: entry.craftingPoints }));
  check("the shipped 0.13.2 item data has no craftingPoints at all (why the table exists)", shippedItems.filter((entry) => entry.craftingPoints !== undefined).length, 0);
  const wholeNumberRecipes = itemDetails.filter((entry) => entry.craftingType && entry.craftingType !== "-" && /^[0-9]+$/.test(String(entry.craftingPoints).trim()));
  check("item_details.json has 160 recipes with a whole-number crafting HP", wholeNumberRecipes.length, 160);
  // The table module of the source tree under test (the real one, or the T33_SRC copy).
  let tableModule;
  try {
    tableModule = await import(pathToFileURL(path.join(sourceRoot, "src/js/crafting-points.js")).href);
  } catch {
    check("src/js/crafting-points.js exists in the source under test", false, true);
    tableModule = await import(pathToFileURL(path.join(root, "src/js/crafting-points.js")).href);
  }
  const { CRAFTING_POINTS_BY_ITEM_NAME, CRAFTING_POINTS_VERSION, withCraftingPoints } = tableModule;
  check("the table is for rules 0.13.2", CRAFTING_POINTS_VERSION, "0.13.2");
  check("the table equals the official item_details.json (160 whole-number recipes)",
    [Object.keys(CRAFTING_POINTS_BY_ITEM_NAME).length, wholeNumberRecipes.every((entry) => CRAFTING_POINTS_BY_ITEM_NAME[entry.name] === String(entry.craftingPoints).trim())], [160, true]);
  check("every table name is a craftable item in the shipped 0.13.2 data, with the same crafting type",
    Object.keys(CRAFTING_POINTS_BY_ITEM_NAME).filter((name) => !shippedItems.some((entry) => entry.name === name && entry.craftingType === itemDetails.find((detail) => detail.name === name).craftingType)), []);
  check("the rulebook's own bow example: Bow (Two-Handed) has 30 crafting HP", [CRAFTING_POINTS_BY_ITEM_NAME["Bow (Two-Handed)"], rulebook.includes("Bow (Two-Handed)")], ["30", true]);
  check("rules 0.13.1 get no crafting HP from the table", withCraftingPoints([{ name: "Bow (Two-Handed)" }], "0.13.1"), [{ name: "Bow (Two-Handed)" }]);
  check("rules 0.13.2 get it, and an item's own value is kept", withCraftingPoints([{ name: "Bow (Two-Handed)" }, { name: "Bow (Two-Handed)", craftingPoints: "99" }], "0.13.2"),
    [{ name: "Bow (Two-Handed)", craftingPoints: "30" }, { name: "Bow (Two-Handed)", craftingPoints: "99" }]);

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.route("**/assets/app.bundle.js*", (route) => route.fulfill({
    contentType: "application/javascript", body: bundle.outputFiles[0].text
  }));
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());

  // ---- helpers ------------------------------------------------------------
  const hook = (name, ...args) => page.evaluate(([fn, list]) => window.__t33[fn](...list), [name, args]);
  const state = () => hook("state");
  const craftingState = async () => (await state()).play.crafting;
  const waitBooted = async () => {
    await page.waitForFunction(() => window.__t33 && window.LYRIAN_DATA?.version === "0.13.2" && document.getElementById("builder-step-content"), null, { timeout: 20000 });
    await page.waitForTimeout(1400); // the production idle sheet build
  };
  const fresh = async () => {
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: "load" });
    await waitBooted();
  };
  const reload = async () => {
    await page.reload({ waitUntil: "load" });
    await waitBooted();
  };
  // Start from a clean browser, put a character on the crafting tab, reload so
  // the sheet loads it through the real autosave path.
  const install = async (spec) => {
    await fresh();
    await page.evaluate((value) => window.__t33.install(value), spec);
    await reload();
    await page.waitForSelector(spec.playMode === "gathering" ? "#play-gathering:not([hidden])" : "#play-crafting:not([hidden])", { timeout: 8000 });
  };
  const js = (selector) => page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) throw new Error("missing " + sel);
    element.click();
  }, selector);
  const gotoStep = (index) => js(`#play-crafting [data-crafting-wizard-goto="${index}"]`);
  const selectRecipe = (id) => js(`#play-crafting [data-crafting-select-recipe="${id}"]`);
  const fillCraftingField = async (field, value) => {
    await page.locator(`#play-crafting [data-crafting-field="${field}"]`).first().fill(String(value));
  };
  // Press Roll d10 with a forced d10 value. The override, the click and the
  // restore happen in one synchronous run, so no timer can use the forced value.
  const rollWith = (value) => page.evaluate((forced) => {
    const button = document.querySelector('#play-crafting [data-crafting-action="roll-die"]');
    if (!button || button.disabled) throw new Error("Roll d10 is missing or disabled");
    const original = Math.random;
    Math.random = () => (forced - 0.5) / 10;
    try { button.click(); } finally { Math.random = original; }
  }, value);
  const topLog = async () => (await state()).play.log[0] || { title: "", lines: [] };
  const statusText = () => page.evaluate(() => document.getElementById("status-pill")?.textContent || "");
  const buttonState = (selector) => page.evaluate((sel) => {
    const element = document.querySelector(sel);
    return element ? { present: true, disabled: Boolean(element.disabled) } : { present: false, disabled: false };
  }, selector);
  const SUCCESS = '#play-crafting [data-crafting-action="craft-success"]';
  const FAILURE = '#play-crafting [data-crafting-action="craft-failure"]';
  // Press Craft Succeeded when it is open; when it is locked, record a failed
  // check and carry on (so a broken build reports many failures, not a timeout).
  let successPresses = 0;
  const pressSuccess = async () => {
    successPresses += 1;
    const now = await buttonState(SUCCESS);
    check(`Craft Succeeded is open for press #${successPresses} (points reach the HP)`, now, { present: true, disabled: false });
    if (!now.present || now.disabled) return false;
    await page.click(SUCCESS);
    return true;
  };
  // Text of an element, or null when it is not there (so an older build reports a failed check, not a timeout).
  const textOf = (selector) => page.locator(selector).first().textContent({ timeout: 2000 }).catch(() => null);
  const pagePlayText = () => page.evaluate(() => document.getElementById("play-crafting")?.innerText || "");

  const ALL_CRAFTERS = {
    classes: ["Alchemist", "Armorsmith", "Artificer", "Blacksmith", "Carpenter", "Culinarian"],
    tools: ["Alchemist's Alembic", "Smith's Hammer", "Artificer's Multitool", "Carpenter's Chisel", "Frying Pan"]
  };

  // =========================================================================
  section("A. Crafting dice start at 5 (rulebook: 'you are give 5 Crafting Dice')");
  await fresh();
  const runtimePoints = await Promise.all(["Bow (Two-Handed)", "Axolotl Elixir", "Armor (Light)", "Gourmet Cooking Stock", "Adjustable Lens Refractor Gun", "Aetherie Sensory Station"].map((name) => hook("recipePoints", name)));
  check("at runtime the recipes carry their crafting HP (Bow 30, Axolotl 50, Armor 30, Stock 35, Gun 30; the 'lol' item none)", runtimePoints, ["30", "50", "30", "35", "30", null]);
  const runtimeRecipes = await hook("recipeEntries");
  check("160 of the craftable items have a crafting HP at runtime", runtimeRecipes.filter(([, , points]) => /^[0-9]+$/.test(points || "")).length, 160);
  check("rulebook text says 5 Crafting Dice, d10", /you are give 5 .{0,3}Crafting Dice.{0,3}, d10 dice/.test(rulebook), true);
  await fresh();
  let crafting = await craftingState();
  check("a new character: dice max 5, remaining 5, flagged", [crafting.diceMax, crafting.diceRemaining, crafting.diceStartMigrated], [5, 5, true]);
  await install({ ...ALL_CRAFTERS, skillPoints: { Carpentry: 5 }, crafting: { selectedRecipeId: "", craftingWizardStep: 3 } });
  const diceInputs = await page.evaluate(() => ({
    remaining: document.querySelector('#play-crafting [data-crafting-field="diceRemaining"]')?.value,
    max: document.querySelector('#play-crafting [data-crafting-field="diceMax"]')?.value,
    chip: [...document.querySelectorAll("#play-crafting .play-wizard-summary .selected-chip")].map((chip) => chip.textContent.trim()).find((text) => text.startsWith("Dice")) || ""
  }));
  check("the Roll Points step shows 5 / 5 in both boxes and the summary chip", diceInputs, { remaining: "5", max: "5", chip: "Dice 5 / 5" });
  await rollWith(4);
  crafting = await craftingState();
  check("the first roll works without typing anything (5 -> 4 dice left)", [crafting.diceRemaining, crafting.diceMax], [4, 5]);
  await js('#play-crafting [data-crafting-action="reset-session"]');
  crafting = await craftingState();
  check("Reset Session refills the dice to the maximum of 5", [crafting.diceRemaining, crafting.diceMax], [5, 5]);

  // =========================================================================
  section("B. Save migration: the old untouched 0 becomes 5, a hand-set value stays");
  // A save written before this task: take a real state and take out the flag.
  const makeOldSave = async (craftingPatch, { removeCrafting = false } = {}) => {
    await fresh();
    await page.evaluate(() => window.__t33.install({ skillPoints: { Carpentry: 3 }, crafting: { pointsGenerated: 12, selectedMods: "Recurve A" } }));
    const snapshot = await state();
    delete snapshot.play.crafting.diceStartMigrated;
    snapshot.play.crafting = { ...snapshot.play.crafting, ...craftingPatch };
    if (removeCrafting) delete snapshot.play.crafting;
    snapshot.ui.mode = "sheet";
    snapshot.ui.playMode = "crafting";
    return snapshot;
  };
  const CASES = [
    { id: "old-untouched", label: "old save, untouched 0 / 0", patch: { diceMax: 0, diceRemaining: 0 }, expect: [5, 5], keepsPoints: true },
    { id: "old-hand-3-2", label: "old save, hand-set 3 max / 2 left", patch: { diceMax: 3, diceRemaining: 2 }, expect: [3, 2] },
    { id: "old-hand-8-8", label: "old save, hand-set 8 / 8", patch: { diceMax: 8, diceRemaining: 8 }, expect: [8, 8] },
    { id: "old-hand-5-1", label: "old save, hand-set 5 max / 1 left", patch: { diceMax: 5, diceRemaining: 1 }, expect: [5, 1] },
    { id: "old-max-only", label: "old save, hand-set 4 max / 0 left (used up)", patch: { diceMax: 4, diceRemaining: 0 }, expect: [4, 0] },
    { id: "new-hand-0", label: "new save, hand-set 0 / 0 (flagged)", patch: { diceMax: 0, diceRemaining: 0, diceStartMigrated: true }, expect: [0, 0] },
    { id: "old-no-block", label: "old save with no crafting block", patch: {}, removeCrafting: true, expect: [5, 5] }
  ];
  const readDice = async () => {
    const c = await craftingState();
    return { dice: [c.diceMax, c.diceRemaining], flag: c.diceStartMigrated, points: c.pointsGenerated, mods: c.selectedMods };
  };
  for (const entry of (skipSections.has("B") ? [] : CASES)) {
    const old = await makeOldSave(entry.patch, { removeCrafting: entry.removeCrafting });
    const expectedRest = entry.removeCrafting ? { points: 0, mods: "" } : { points: 12, mods: "Recurve A" };
    // Route 1: the autosave, loaded when the page reloads.
    await page.evaluate(([key, json]) => localStorage.setItem(key, json), [STORAGE_KEY, JSON.stringify(old)]);
    await reload();
    let seen = await readDice();
    check(`autosave: ${entry.label} -> dice ${entry.expect.join(" / ")}, flagged, other crafting data kept`,
      { dice: seen.dice, flag: seen.flag, points: seen.points, mods: seen.mods }, { dice: entry.expect, flag: true, ...expectedRest });
    // Route 2: a named slot, loaded from Load Saved.
    await fresh();
    await page.evaluate(([key, json]) => localStorage.setItem(key, JSON.stringify({ version: 1, slots: [{ id: "slot-t33", name: "Old Crafter", savedAt: new Date().toISOString(), snapshot: JSON.parse(json) }] })), [SAVE_SLOTS_KEY, JSON.stringify(old)]);
    await js("#builder-load-browser");
    await js('[data-slot-action="load"]');
    await page.waitForFunction(() => /Loaded Old Crafter/.test(document.getElementById("builder-status-pill")?.textContent || "") || /Loaded Old Crafter/.test(document.getElementById("status-pill")?.textContent || ""), null, { timeout: 8000 });
    seen = await readDice();
    check(`named slot: ${entry.label} -> dice ${entry.expect.join(" / ")}, flagged, other crafting data kept`,
      { dice: seen.dice, flag: seen.flag, points: seen.points, mods: seen.mods }, { dice: entry.expect, flag: true, ...expectedRest });
    // Route 3: a JSON file import.
    await fresh();
    await page.setInputFiles("#import-file", { name: "old-crafter.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(old)) });
    await page.waitForFunction(() => /Imported old-crafter\.json/.test(document.getElementById("builder-status-pill")?.textContent || "") || /Imported old-crafter\.json/.test(document.getElementById("status-pill")?.textContent || ""), null, { timeout: 8000 });
    seen = await readDice();
    check(`JSON import: ${entry.label} -> dice ${entry.expect.join(" / ")}, flagged, other crafting data kept`,
      { dice: seen.dice, flag: seen.flag, points: seen.points, mods: seen.mods }, { dice: entry.expect, flag: true, ...expectedRest });
  }
  // The migration happens once: after it, a hand-set 0 stays through a save and a reload.
  const migrated = await makeOldSave({ diceMax: 0, diceRemaining: 0 });
  await page.evaluate(([key, json]) => localStorage.setItem(key, json), [STORAGE_KEY, JSON.stringify(migrated)]);
  await reload();
  check("the old default was migrated to 5 / 5", (await readDice()).dice, [5, 5]);
  await page.evaluate(() => window.__t33.install({ crafting: { diceMax: 0, diceRemaining: 0 } }));
  await reload();
  check("then a hand-set 0 / 0 stays 0 / 0 after a reload (no second migration)", (await readDice()).dice, [0, 0]);

  // =========================================================================
  section("C. The roll adds the crafting skill (rulebook: 'D10 + Crafting Skill (+Expertise) + Modifiers')");
  check("rulebook text gives the d10 roll formula", rulebook.includes("D10 + Crafting Skill (+Expertise) + Modifiers"), true);
  check("rulebook example: a +5 carpentry bonus is added to each roll", rulebook.includes("With his 5 bonus, he is now at an 11 Crafting points"), true);
  const SKILL_POINTS = { Alchemy: 1, Armorsmithing: 2, Artificer: 3, Blacksmith: 4, Carpentry: 5, Culinary: 6, Artifice: 9, Farming: 7 };
  const CATEGORIES = [
    { recipe: "Axolotl Elixir", category: "Alchemy", skill: "Alchemy" },
    { recipe: "Armor (Light)", category: "Armorsmithing", skill: "Armorsmithing" },
    { recipe: "Adjustable Lens Refractor Gun", category: "Artificing", skill: "Artificer" },
    { recipe: "Alchemist's Alembic", category: "Blacksmithing", skill: "Blacksmith" },
    { recipe: "Bow (Two-Handed)", category: "Carpentry", skill: "Carpentry" },
    { recipe: "Gourmet Cooking Stock", category: "Culinary", skill: "Culinary" }
  ];
  await install({ ...ALL_CRAFTERS, skillPoints: SKILL_POINTS, crafting: { craftingWizardStep: 0 } });
  const classCheck = await Promise.all(ALL_CRAFTERS.classes.map((name) => hook("classId", name)));
  check("every crafter class used by this test exists in the data", classCheck.every(Boolean), true);
  for (const entry of CATEGORIES) {
    const id = await hook("recipeId", entry.recipe);
    check(`${entry.recipe} exists`, Boolean(id), true);
    await gotoStep(3);
    await js('#play-crafting [data-crafting-action="reset-session"]'); // fresh dice and no points for each recipe
    await gotoStep(0);
    await selectRecipe(id);
    await gotoStep(3);
    const before = await craftingState();
    const formulaLabel = await textOf("#play-crafting [data-crafting-roll-formula]");
    check(`${entry.category}: the roll button names ${entry.skill} +${SKILL_POINTS[entry.skill]}`, formulaLabel, `d10 + ${entry.skill} +${SKILL_POINTS[entry.skill]} + bonuses`);
    await rollWith(7);
    const after = await craftingState();
    const log = await topLog();
    check(`${entry.category}: points gained = d10 7 + ${entry.skill} ${SKILL_POINTS[entry.skill]}`, after.pointsGenerated - before.pointsGenerated, 7 + SKILL_POINTS[entry.skill]);
    check(`${entry.category}: the breakdown names the skill and its bonus`, log.lines.find((line) => line.startsWith("d10:")) || "", `d10: 7 | Crafting skill (${entry.skill}): +${SKILL_POINTS[entry.skill]} | Manual bonus: +0`);
    check(`${entry.category}: the log says the points gained`, log.lines.includes(`Crafting Points gained: ${7 + SKILL_POINTS[entry.skill]}`), true);
  }
  // Skill + manual bonus + facility bonus stack; the breakdown shows each part.
  const bowId = await hook("recipeId", "Bow (Two-Handed)");
  await gotoStep(0); await selectRecipe(bowId); await gotoStep(2);
  await js('#play-crafting [data-crafting-facility-level="2"]');
  await gotoStep(3);
  await fillCraftingField("rollBonus", 3);
  let beforeStack = await craftingState();
  await rollWith(2);
  let afterStack = await craftingState();
  check("Carpentry +5, manual +3 and Carpentry Workshop level 2 (+4) all add: 2 + 5 + 3 + 4", afterStack.pointsGenerated - beforeStack.pointsGenerated, 14);
  check("the breakdown lists skill, manual bonus and the facility",
    (await topLog()).lines.find((line) => line.startsWith("d10:")), "d10: 2 | Crafting skill (Carpentry): +5 | Manual bonus: +3 | Carpentry Workshop: +4");
  // No recipe: the roll is the die plus the manual bonus, and says so.
  await js('#play-crafting [data-crafting-action="reset-session"]');
  await gotoStep(3);
  await fillCraftingField("rollBonus", 0);
  beforeStack = await craftingState();
  check("with no recipe the roll button asks for a recipe", await textOf("#play-crafting [data-crafting-roll-formula]"), "d10 + bonuses (pick a recipe to add its crafting skill)");
  await rollWith(6);
  afterStack = await craftingState();
  check("no recipe: only the die is added", afterStack.pointsGenerated - beforeStack.pointsGenerated, 6);
  check("no recipe: the breakdown says no skill was added", (await topLog()).lines.find((line) => line.startsWith("d10:")), "d10: 6 | Crafting skill: none, pick a recipe to add it (+0) | Manual bonus: +0");

  // The facility skill names are in the skill list, so d20 checks get the bonus.
  await gotoStep(0); await selectRecipe(await hook("recipeId", "Alchemist's Alembic")); await gotoStep(2);
  await js('#play-crafting [data-crafting-facility-level="1"]');
  await gotoStep(3);
  const rowButtons = async () => page.evaluate(() => {
    const out = {};
    document.querySelectorAll("#play-crafting [data-play-roll-skill]").forEach((button) => {
      out[button.closest(".play-skill-mini-row")?.querySelector("strong")?.textContent.trim() || "?"] = { index: button.dataset.playRollSkill, label: button.textContent.trim() };
    });
    return out;
  });
  const rows = await rowButtons();
  check("Blacksmith row shows its +4 skill plus the Blacksmith Workshop level 1 bonus (+2)", rows.Blacksmith?.label, "+6");
  check("the knowledge skill Artifice (+9) does not get the workshop bonus", rows.Artifice?.label, "+9");
  check("the Artificer row (+3) does not get the Blacksmith workshop bonus", rows.Artificer?.label, "+3");
  await page.click(`#play-crafting [data-play-roll-skill="${rows.Blacksmith.index}"]`);
  const d20Log = await topLog();
  check("a d20 Blacksmith check lists the Blacksmith Workshop bonus", d20Log.lines.some((line) => line.includes("Blacksmith Workshop: +2")), true);
  await page.click(`#play-crafting [data-play-roll-skill="${rows.Artifice.index}"]`);
  check("a d20 Artifice check does not", (await topLog()).lines.some((line) => line.includes("Blacksmith Workshop")), false);
  check("the d20 shortcuts are labeled as d20 skill checks, not crafting checks", await page.evaluate(() => [...document.querySelectorAll("#play-crafting h3")].map((h) => h.textContent.trim()).filter((t) => /Check/.test(t))), ["Skill Checks (d20)"]);

  // =========================================================================
  section("D. Mod notes survive and travel with the crafted item");
  const NOTE_ONE = "Recurve A (20 points)\nRing slot kept for later";
  const NOTE_TWO = "Hardened B mod";
  await install({ ...ALL_CRAFTERS, skillPoints: { Carpentry: 5 }, crafting: { craftingWizardStep: 0 } });
  await gotoStep(0); await selectRecipe(bowId); await gotoStep(4);
  await page.locator('#play-crafting summary:has-text("Mods, Alloys, and Session Notes")').click();
  await page.locator('#play-crafting [data-crafting-field="selectedMods"]').fill(NOTE_ONE);
  await page.locator('#play-crafting [data-crafting-field="notes"]').fill("Session note");
  check("typing a mod note is saved in the crafting state", (await craftingState()).selectedMods, NOTE_ONE);
  check("the notes box says the notes are kept and copied to the item", (await pagePlayText()).includes("copied onto the item when the craft succeeds"), true);
  await reload();
  check("the mod note is still there after a reload", (await craftingState()).selectedMods, NOTE_ONE);
  check("the textarea shows it after the reload", await page.evaluate(() => document.querySelector('#play-crafting [data-crafting-field="selectedMods"]')?.value), NOTE_ONE);
  // Reset Session mid-craft: points go, session notes go, mod notes stay.
  await gotoStep(3);
  await fillCraftingField("pendingPointSpend", 33);
  await js('#play-crafting [data-crafting-action="add-points"]');
  await js('#play-crafting [data-crafting-action="reset-session"]');
  crafting = await craftingState();
  check("Reset Session clears points and session notes but keeps the mod notes", [crafting.pointsGenerated, crafting.notes, crafting.selectedMods], [0, "", NOTE_ONE]);
  check("the reset log says the mod notes were kept", (await topLog()).lines.join(" ").includes("Mod notes were kept"), true);
  // Craft the bow with the notes (the recipe was cleared by the reset: pick it again).
  await gotoStep(0); await selectRecipe(bowId); await gotoStep(3);
  await fillCraftingField("pendingPointSpend", 30);
  await js('#play-crafting [data-crafting-action="add-points"]');
  await gotoStep(4);
  await pressSuccess();
  let sheet = await state();
  let craftedItems = sheet.play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:"));
  check("Craft Succeeded added one bow to the inventory", craftedItems.map((entry) => entry.name), ["Bow (Two-Handed)"]);
  check("the crafted bow carries the mod notes", craftedItems[0]?.modNotes, NOTE_ONE);
  check("the craft log says the notes were saved on the item", (await topLog()).lines.some((line) => line.startsWith("Mod notes saved on the item: Recurve A")), true);
  // Undo removes the item and keeps the notes. Start New Craft after a success
  // clears them (task 033b: they are already on the item); see section K.
  await page.click('#play-crafting [data-crafting-action="craft-undo"]');
  sheet = await state();
  check("Undo removes the crafted bow", sheet.play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:")).length, 0);
  check("Undo keeps the mod notes in the box", sheet.play.crafting.selectedMods, NOTE_ONE);
  await pressSuccess();
  await page.click('#play-crafting [data-crafting-action="reset-session"]'); // "Start New Craft"
  crafting = await craftingState();
  check("Start New Craft after a success clears the mod notes (they are on the item)", crafting.selectedMods, "");
  // A second craft with different notes: each item keeps its own.
  await gotoStep(4);
  await page.locator('#play-crafting summary:has-text("Mods, Alloys, and Session Notes")').click();
  await page.locator('#play-crafting [data-crafting-field="selectedMods"]').fill(NOTE_TWO);
  await gotoStep(0); await selectRecipe(bowId); await gotoStep(3);
  await fillCraftingField("pendingPointSpend", 30);
  await js('#play-crafting [data-crafting-action="add-points"]');
  await gotoStep(4);
  await pressSuccess();
  sheet = await state();
  craftedItems = sheet.play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:"));
  check("two crafted bows, each with the notes typed for it", craftedItems.map((entry) => entry.modNotes), [NOTE_ONE, NOTE_TWO]);
  // The inventory shows the notes.
  await js('[data-play-mode="combat"]');
  await js('[data-play-tab="inventory"]');
  const inventoryNotes = await page.evaluate(() => [...document.querySelectorAll("#play-inventory [data-item-mod-notes]")].map((node) => node.textContent.trim()));
  check("the inventory rows show 'Mod notes: ...' for each bow", inventoryNotes, [`Mod notes: ${NOTE_ONE}`, `Mod notes: ${NOTE_TWO}`]);
  // A craft with no notes stores no empty field.
  await js('[data-play-mode="crafting"]');
  await page.click('#play-crafting [data-crafting-action="reset-session"]');
  await gotoStep(4);
  await page.locator('#play-crafting summary:has-text("Mods, Alloys, and Session Notes")').click();
  await page.locator('#play-crafting [data-crafting-field="selectedMods"]').fill("");
  await gotoStep(0); await selectRecipe(bowId); await gotoStep(3);
  await fillCraftingField("pendingPointSpend", 30);
  await js('#play-crafting [data-crafting-action="add-points"]');
  await gotoStep(4);
  await pressSuccess();
  craftedItems = (await state()).play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:"));
  check("a craft with no mod notes stores no modNotes field", craftedItems.map((entry) => Object.hasOwn(entry, "modNotes")), [true, true, false]);
  // Reload (autosave), a named slot and a JSON export / import keep the notes on the items.
  const noteList = async () => (await state()).play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:")).map((entry) => entry.modNotes ?? null);
  check("before saving: the three bows hold [note one, note two, none]", await noteList(), [NOTE_ONE, NOTE_TWO, null]);
  await reload();
  check("after a reload (autosave) the notes are still on the items", await noteList(), [NOTE_ONE, NOTE_TWO, null]);
  await js('[data-play-mode="table"]');
  await js('[data-table-tool-action="save"]');
  await page.fill("#save-slot-name-input", "Bow Maker");
  await js('[data-save-slot-submit="new"]');
  await page.waitForFunction(() => /Saved Bow Maker/.test(document.getElementById("status-pill")?.textContent || ""), null, { timeout: 8000 });
  await page.keyboard.press("Escape");
  // The real Export Character flow: the export button opens the format chooser,
  // then the JSON File option.
  const exportDownload = page.waitForEvent("download", { timeout: 30000 });
  exportDownload.catch(() => {});
  await page.evaluate(() => document.getElementById("builder-export-character").click());
  await page.click('#sheet-modal:not([hidden]) [data-export-mode="json"]');
  const download = await exportDownload;
  const exportedJson = await readFile(await download.path(), "utf8");
  check("Export Character > JSON produced a file", exportedJson.length > 100, true);
  await page.keyboard.press("Escape");
  // Clear the working character but keep the saved slot, then load the slot.
  await page.evaluate(() => {
    localStorage.removeItem("lyrian-chronicles-character-suite-v2");
    localStorage.removeItem("lyrian-chronicles-character-suite-active-slot-v1");
  });
  await reload();
  check("a cleared working character has no crafted items", await noteList(), []);
  await js("#builder-load-browser");
  await js('[data-slot-action="load"]');
  await page.waitForFunction(() => /Loaded Bow Maker/.test(document.getElementById("builder-status-pill")?.textContent || "") || /Loaded Bow Maker/.test(document.getElementById("status-pill")?.textContent || ""), null, { timeout: 8000 });
  check("after loading the named slot the notes are still on the items", await noteList(), [NOTE_ONE, NOTE_TWO, null]);
  await fresh();
  check("a fresh browser has no crafted items", await noteList(), []);
  await page.setInputFiles("#import-file", { name: "bow-maker.json", mimeType: "application/json", buffer: Buffer.from(exportedJson) });
  await page.waitForFunction(() => /Imported bow-maker\.json/.test(document.getElementById("builder-status-pill")?.textContent || "") || /Imported bow-maker\.json/.test(document.getElementById("status-pill")?.textContent || ""), null, { timeout: 8000 });
  check("after a JSON export and import the notes are still on the items", await noteList(), [NOTE_ONE, NOTE_TWO, null]);

  // =========================================================================
  section("E. Craft Succeeded needs the points left after mods to reach the crafting HP");
  check("rulebook example: 'a minimum of 30 crafting points to succeed'", rulebook.includes("needs to get a minimum of 30 crafting points to succeed"), true);
  check("rulebook example: Recurve A mod 'leaving him with 30 points'", rulebook.includes("leaving him with 30 points"), true);
  check("rulebook example: '30 points is enough to complete the item'", rulebook.includes("30 points is enough to complete the item"), true);
  // Replay John Carpenter: +5 carpentry, Bow (Two-Handed) with crafting HP 30.
  await install({ ...ALL_CRAFTERS, skillPoints: { Carpentry: 5 }, crafting: { craftingWizardStep: 0 } });
  await gotoStep(0); await selectRecipe(bowId); await gotoStep(3);
  const johnTotals = [];
  for (const forced of [6, 7, 4]) {
    await rollWith(forced);
    johnTotals.push((await craftingState()).pointsGenerated);
  }
  check("John's three basic crafts total 11, 23, 32 (the rulebook's numbers)", johnTotals, [11, 23, 32]);
  await gotoStep(4);
  let hpCard = await textOf("#play-crafting [data-crafting-hp-check]");
  check("32 points on a 30 HP bow: the Crafting HP card says it is enough", (hpCard || "").includes("needs a minimum of 30 crafting points left after any mods. You have 32, which is enough"), true);
  check("32 points: Craft Succeeded is open", await buttonState(SUCCESS), { present: true, disabled: false });
  await gotoStep(3);
  await rollWith(3);
  check("his fourth craft brings the total to 40", (await craftingState()).pointsGenerated, 40);
  await fillCraftingField("pendingPointSpend", 10);
  await js('#play-crafting [data-crafting-action="add-points"]');
  check("Steady Craft (not built yet) is stood in for by adding 10 points by hand: 50", (await craftingState()).pointsGenerated, 50);
  await fillCraftingField("pendingPointSpend", 21);
  await js('#play-crafting [data-crafting-action="spend-points"]');
  crafting = await craftingState();
  check("paying 21 for a mod leaves 29 available", [crafting.pointsGenerated, crafting.pointsSpent, crafting.pointsGenerated - crafting.pointsSpent], [50, 21, 29]);
  await gotoStep(4);
  hpCard = await textOf("#play-crafting [data-crafting-hp-check]");
  check("29 of 30: the Crafting HP card says 1 short and that Craft Succeeded is locked", (hpCard || "").includes("You have 29, which is 1 short. Craft Succeeded stays locked"), true);
  check("29 of 30: Craft Succeeded is disabled, Craft Failed is open", [await buttonState(SUCCESS), await buttonState(FAILURE)], [{ present: true, disabled: true }, { present: true, disabled: false }]);
  const refused = await hook("resolveCraft", true);
  check("29 of 30: even calling the handler directly is refused with a clear message", refused.status.includes("Craft Succeeded needs a minimum of 30 crafting points left after any mods, and you have 29"), true);
  check("29 of 30: a refused success changes nothing (no outcome, no item)", [refused.crafting.lastCraftOutcome ?? null, (await state()).play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:")).length], [null, 0]);
  await gotoStep(3);
  await fillCraftingField("pendingPointSpend", 1);
  await js('#play-crafting [data-crafting-action="refund-points"]');
  crafting = await craftingState();
  check("refunding 1 point leaves exactly 30 available (mod cost 20)", [crafting.pointsSpent, crafting.pointsGenerated - crafting.pointsSpent], [20, 30]);
  await gotoStep(4);
  check("30 of 30 (the rulebook's final count): Craft Succeeded is open", await buttonState(SUCCESS), { present: true, disabled: false });
  check("the old Spend Recipe Points button is gone from the Resolve step", await page.evaluate(() => document.querySelectorAll('[data-crafting-action="spend-recipe"]').length), 0);
  await pressSuccess();
  crafting = await craftingState();
  check("Craft Succeeded at 30 of 30 works and records a success", crafting.lastCraftOutcome?.type, "success");
  check("success does not spend the crafting HP (points spent stay 20)", [crafting.pointsSpent, crafting.pointsGenerated], [20, 50]);
  const successLog = await topLog();
  check("the success log shows the points left against the HP", successLog.lines.includes("Crafting points left: 30 (the item needs a minimum of 30)."), true);
  await gotoStep(3);
  check("the Roll Points step has no Spend Recipe Points button either", await page.evaluate(() => document.querySelectorAll('[data-crafting-action="spend-recipe"]').length), 0);
  check("the Roll Points step shows a Crafting HP strip", (await pagePlayText()).includes("Crafting HP"), true);
  // A recipe with no numeric crafting HP completes with any total.
  await js('#play-crafting [data-crafting-action="reset-session"]');
  const noHpId = await hook("recipeId", "Aetherie Sensory Station");
  await gotoStep(0); await selectRecipe(noHpId); await gotoStep(4);
  hpCard = await textOf("#play-crafting [data-crafting-hp-check]");
  check("an item with no crafting HP in the data: the card says any total completes it", (hpCard || "").includes("has no crafting HP in the sheet's data, so any total completes it"), true);
  check("an item with no crafting HP in the data: Craft Succeeded is open with 0 points", await buttonState(SUCCESS), { present: true, disabled: false });
  check("(the item used above is a recipe in the data)", Boolean(noHpId), true);
  // Craft Failed is always open and says the rulebook line.
  await install({ ...ALL_CRAFTERS, skillPoints: { Carpentry: 5 }, crafting: { craftingWizardStep: 0 } });
  await gotoStep(0); await selectRecipe(bowId); await gotoStep(4);
  check("0 points: Craft Succeeded is locked, Craft Failed is open", [(await buttonState(SUCCESS)).disabled, (await buttonState(FAILURE)).disabled], [true, false]);

  // =========================================================================
  section("F. A failed craft says what the rulebook says");
  check("rulebook text: a failed craft loses all materials", rulebook.includes("You lose all materials used for crafting."), true);
  const wizardNote = await page.evaluate(() => [...document.querySelectorAll("#play-crafting .play-recipe-inferred-note")].map((node) => node.textContent).join(" "));
  check("before resolving, the Resolve step says a failed craft loses all the materials", wizardNote.includes("A failed craft loses all the materials used for crafting, as the rulebook says"), true);
  const wizardLead = await page.evaluate(() => document.querySelector("#play-crafting .play-wizard-lead")?.textContent || "");
  check("the Resolve step lead says a failed craft loses the materials too", wizardLead.includes("A failed craft loses all the materials too"), true);
  check("the Resolve step shows no message that calls failure costs unwritten or GM-adjustable",
    [/do not spell out/i.test(wizardNote + wizardLead), /GM-adjustable/i.test(wizardNote + wizardLead)], [false, false]);
  await page.click(FAILURE);
  const failureLog = await topLog();
  check("the log title is Craft Failed", failureLog.title, "Craft Failed");
  check("the log line is the rulebook rule", failureLog.lines.includes("Failed craft: the rulebook says you lose all materials used for crafting. Use Undo Last Outcome only if you pressed the wrong button."), true);
  check("the status line says all the materials are lost", (await statusText()).includes("all the materials used for the craft are lost, as the rulebook says"), true);
  check("a failed craft adds no item", (await state()).play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:")).length, 0);
  const afterFailureText = await pagePlayText();
  check("no message says the rules do not spell out failure costs or call it a GM-adjustable default",
    [/do not spell out/i.test(afterFailureText), /GM-adjustable/i.test(afterFailureText), /rules do not (say|spell)/i.test(JSON.stringify(failureLog))], [false, false, false]);

  // =========================================================================
  section("G. Facility skill names are in the skill list");
  const profiles = await hook("profiles");
  const craftingNames = await hook("craftingSkillNames");
  check("the seven facility profiles", Object.keys(profiles).sort(), ["alchemy", "armorsmithing", "artificing", "blacksmithing", "carpentry", "culinary", "farming"]);
  check("every facility profile names a crafting skill from the skill list", Object.entries(profiles).filter(([, profile]) => !craftingNames.includes(profile.skill)).map(([key, profile]) => `${key}: ${profile.skill}`), []);
  check("Artificer's Atelier is paired with Artificer, not the knowledge skill Artifice", profiles.artificing.skill, "Artificer");
  check("Blacksmith Workshop is paired with Blacksmith, not Blacksmithing", profiles.blacksmithing.skill, "Blacksmith");
  check("the rulebook names the skills Blacksmith and Artificer", [/^Blacksmith: Each weapon group/m.test(rulebook), /^Artificer: Pistol, Shotgun/m.test(rulebook)], [true, true]);

  // =========================================================================
  section("H. The tier-3 gathering node is labeled as a GM option");
  const escudo = await hook("nodeProfile", "escudo");
  const tierThreeKeys = await hook("nodeKeysAtTier", 3);
  check("Escudo Deposit is the only tier-3 node", tierThreeKeys, ["escudo"]);
  check("it is labeled 'GM option — not in the 0.13.2 rules'", escudo.variation, "GM option — not in the 0.13.2 rules");
  check("its basis text repeats the label and says Ore Hunter opens tier 2", [escudo.basis.startsWith("GM option — not in the 0.13.2 rules"), escudo.basis.includes("Ore Hunter opens tier 2")], [true, true]);
  check("it no longer needs 'Advanced Ore Hunter'", [escudo.requiredAbility.includes("Advanced"), escudo.requiredAbility], [false, "Ore Hunter or GM Permission"]);
  const oreHunter = keyAbilities.find((entry) => entry.name === "Ore Hunter");
  check("'Ore Hunter' is a real ability: 'You can gather Tier 2 mining outcrops.'", oreHunter?.benefit1, "You can gather Tier 2 mining outcrops.");
  check("there is no 'Advanced Ore Hunter' ability in the data", keyAbilities.some((entry) => /Advanced Ore Hunter/i.test(entry.name)), false);
  check("the rulebook lists tier 1 and tier 2 node tables only", [rulebook.includes("\nT1:"), rulebook.includes("\nT2:"), /\nT3:/.test(rulebook)], [true, true, false]);
  await install({ ...ALL_CRAFTERS, playMode: "gathering", crafting: { activityMode: "gathering" } });
  const gatheringCard = await page.evaluate(() => {
    const card = document.querySelector('#play-gathering [data-gathering-resource="Escudo"]');
    return card ? card.textContent : "";
  });
  check("the Escudo card on the Gathering tab shows the GM-option label", gatheringCard.includes("GM option — not in the 0.13.2 rules"), true);
  check("the Escudo card says Ore Hunter, not Advanced Ore Hunter", [gatheringCard.includes("Ability: Ore Hunter or GM Permission"), gatheringCard.includes("Advanced")], [true, false]);
  await js('#play-gathering [data-gathering-resource="Escudo"]');
  crafting = await craftingState();
  check("loading it keeps the label in the node's Variation and the new ability", [crafting.gatheringVariation, crafting.gatheringRequiredAbility], ["GM option — not in the 0.13.2 rules", "Ore Hunter or GM Permission"]);
  check("the tab is still labeled Alpha — still in testing", (await page.evaluate(() => document.body.textContent)).includes("Alpha — still in testing"), true);

  // =========================================================================
  // Task 033b, item 1.
  section("I. The roll can take the matching expertise (rulebook: 'Blacksmithing 5 and Longsword 10')");
  check("rulebook formula: 'D10 + Crafting Skill (+Expertise) + Modifiers'", rulebook.includes("D10 + Crafting Skill (+Expertise) + Modifiers"), true);
  check("rulebook example: 'Blacksmithing 5 and Longsword 10, then your crafting bonus would be +15'", rulebook.includes("you have Blacksmithing 5 and Longsword 10, then your crafting bonus would be +15"), true);
  await fresh();
  const swordId = await hook("recipeId", "Longsword (One-Handed/Two-Handed)");
  const alchemyId = await hook("recipeId", "Axolotl Elixir");
  check("the Longsword recipe is a Blacksmithing craft in the data", [Boolean(swordId), (await hook("recipeEntries")).find(([name]) => name.startsWith("Longsword"))?.[1]], [true, "Blacksmithing"]);
  // Blacksmith +5. Expertise: Longsword +10 (5 points), Axes +4 (2 points) and
  // 3 unnamed points on the same skill. Other skills hold expertise the sword
  // must NOT use: Carpentry "Bows" +10 and Artifice "Swords" +10.
  const SMITH = {
    ...ALL_CRAFTERS,
    skillPoints: { Blacksmith: 5, Carpentry: 4, Artifice: 6 },
    expertise: {
      Blacksmith: [["Longsword", 5], ["Axes", 2], ["Unassigned creation expertise", 3]],
      Carpentry: [["Bows", 5]],
      Artifice: [["Swords", 5]]
    },
    crafting: { craftingWizardStep: 0 }
  };
  const EXPERTISE_SELECT = "#play-crafting [data-crafting-roll-expertise]";
  const pickerState = () => page.evaluate((selector) => {
    const select = document.querySelector(selector);
    return select ? { options: [...select.options].map((option) => option.textContent.trim()), value: select.value } : null;
  }, EXPERTISE_SELECT);
  // Choose an expertise in the real control. A missing control is a failed check, not a crash.
  const chooseExpertise = async (name) => {
    const present = (await page.locator(EXPERTISE_SELECT).count()) > 0;
    check(`the Matching Expertise control is there to choose "${name || "No expertise"}"`, present, true);
    if (present) await page.selectOption(EXPERTISE_SELECT, name);
  };
  const formulaLabel = () => textOf("#play-crafting [data-crafting-roll-formula]");
  const diceLine = async () => (await topLog()).lines.find((line) => line.startsWith("d10:"));
  // Roll with a forced d10 and report the points gained.
  const rollGain = async (forced) => {
    const beforePoints = (await craftingState()).pointsGenerated;
    await rollWith(forced);
    return (await craftingState()).pointsGenerated - beforePoints;
  };
  await install(SMITH);
  await gotoStep(0); await selectRecipe(swordId); await gotoStep(3);
  check("the picker offers only expertise on the Blacksmith skill that has a name, none chosen",
    await pickerState(), { options: ["No expertise", "Longsword +10", "Axes +4"], value: "" });
  check("(Carpentry 'Bows' and Artifice 'Swords' are not offered, nor are the unnamed points)", (await page.evaluate((selector) => document.querySelector(selector)?.textContent ?? "", EXPERTISE_SELECT)).match(/Bows|Swords|Unassigned/), null);
  check("no expertise chosen: the roll button reads as before", await formulaLabel(), "d10 + Blacksmith +5 + bonuses");
  check("no expertise chosen = today's roll (d10 7 + Blacksmith 5 = 12)", await rollGain(7), 12);
  check("no expertise chosen: the breakdown has no expertise part", await diceLine(), "d10: 7 | Crafting skill (Blacksmith): +5 | Manual bonus: +0");
  // Choose Longsword in the real control.
  await chooseExpertise("Longsword");
  check("the choice is saved in the crafting state", (await craftingState()).rollExpertise, "Longsword");
  check("the picker keeps showing Longsword after the panel redraws", (await pickerState())?.value, "Longsword");
  check("the roll button names the expertise", await formulaLabel(), "d10 + Blacksmith +5 + Longsword +10 + bonuses");
  check("Longsword: d10 1 + Blacksmith 5 + Longsword 10 = 16 (the rulebook's +15 crafting bonus)", await rollGain(1), 16);
  check("Longsword: the breakdown names the expertise", await diceLine(), "d10: 1 | Crafting skill (Blacksmith): +5 | Expertise (Longsword): +10 | Manual bonus: +0");
  check("Longsword: the log says the points gained", (await topLog()).lines.includes("Crafting Points gained: 16"), true);
  // Only one expertise counts: picking Axes REPLACES Longsword.
  await chooseExpertise("Axes");
  check("Axes instead of Longsword: d10 6 + Blacksmith 5 + Axes 4 = 15 (they do not stack)", await rollGain(6), 15);
  check("Axes: the breakdown names Axes only", await diceLine(), "d10: 6 | Crafting skill (Blacksmith): +5 | Expertise (Axes): +4 | Manual bonus: +0");
  await chooseExpertise("");
  check("choosing 'No expertise' again returns to the plain roll (12)", [await rollGain(7), (await craftingState()).rollExpertise], [12, ""]);
  // Stacks with the manual bonus and the facility bonus.
  await chooseExpertise("Longsword");
  await gotoStep(2);
  await js('#play-crafting [data-crafting-facility-level="2"]');
  await gotoStep(3);
  await fillCraftingField("rollBonus", 3);
  check("Blacksmith 5 + Longsword 10 + manual 3 + Blacksmith Workshop level 2 (+4) + d10 2 = 24", await rollGain(2), 24);
  check("the breakdown lists all four parts in order", await diceLine(), "d10: 2 | Crafting skill (Blacksmith): +5 | Expertise (Longsword): +10 | Manual bonus: +3 | Blacksmith Workshop: +4");
  // The choice survives a reload.
  await reload();
  await gotoStep(3);
  check("after a reload the choice is still Longsword", [(await craftingState()).rollExpertise, (await pickerState())?.value], ["Longsword", "Longsword"]);
  // The d20 skill row still lists the named expertise only (the shared filter).
  const smithRowIndex = await hook("skillIndex", "Blacksmith");
  check("the d20 Blacksmith row's expertise menu lists the named groups only",
    await page.evaluate((index) => [...document.querySelectorAll(`#play-crafting [data-play-roll-skill-expertise="${index}"]`)].map((button) => button.textContent.trim()), String(smithRowIndex)),
    ["Longsword +10", "Axes +4"]);
  // Task 042 (033b/038b audit break A1): picking the SAME recipe again keeps
  // the choice; only another item drops it.
  await gotoStep(0); await selectRecipe(swordId);
  check("re-picking the same recipe keeps the expertise choice (Longsword)", (await craftingState()).rollExpertise, "Longsword");
  await gotoStep(3);
  check("and the picker still shows Longsword", (await pickerState())?.value, "Longsword");
  // Changing the item drops the choice (it was for the sword).
  await gotoStep(0); await selectRecipe(alchemyId);
  check("picking another recipe clears the expertise choice", (await craftingState()).rollExpertise, "");
  await gotoStep(3);
  check("an Alchemy recipe has no expertise on the Alchemy skill: no picker", await pickerState(), null);
  await gotoStep(0); await selectRecipe(swordId); await gotoStep(3);
  check("coming back to the sword does not bring the old choice back", [(await craftingState()).rollExpertise, (await pickerState())?.value], ["", ""]);
  await chooseExpertise("Longsword");
  await js('#play-crafting [data-crafting-action="reset-session"]');
  check("Reset Session clears the expertise choice with the recipe", (await craftingState()).rollExpertise, "");
  // Only expertise the character actually owns on that skill is ever added.
  await gotoStep(0); await selectRecipe(swordId); await gotoStep(3);
  const refusedBows = await hook("setRollExpertise", "Bows");
  check("choosing 'Bows' (Carpentry expertise) for a Blacksmith craft is refused", [refusedBows.rollExpertise, refusedBows.status], ["", "Crafting rolls add no expertise."]);
  const refusedUnassigned = await hook("setRollExpertise", "Unassigned creation expertise");
  check("choosing the unnamed points is refused too", refusedUnassigned.rollExpertise, "");
  const acceptedAxes = await hook("setRollExpertise", "axes");
  check("a real group is accepted whatever the capitals", [acceptedAxes.rollExpertise, acceptedAxes.status], ["Axes", "Crafting rolls now add Axes expertise +4 to Blacksmith."]);
  // A forged or stale saved name adds nothing at roll time.
  await install({ ...SMITH, crafting: { craftingWizardStep: 3, selectedRecipeId: swordId, rollExpertise: "Bows" } });
  check("a saved name the character does not own on that skill (Bows) adds nothing", [await rollGain(7), await diceLine()], [12, "d10: 7 | Crafting skill (Blacksmith): +5 | Manual bonus: +0"]);
  await install({ ...SMITH, crafting: { craftingWizardStep: 3, selectedRecipeId: swordId, rollExpertise: "Unassigned creation expertise" } });
  check("a saved 'Unassigned ...' name adds nothing", await rollGain(7), 12);
  await install({ ...SMITH, expertise: { Blacksmith: [["Axes", 2]] }, crafting: { craftingWizardStep: 3, selectedRecipeId: swordId, rollExpertise: "Longsword" } });
  check("the character no longer owns Longsword (stale saved choice): nothing is added, the picker shows none", [await rollGain(7), (await pickerState())?.value], [12, ""]);
  // No recipe: no skill, so no expertise either.
  await install({ ...SMITH, crafting: { craftingWizardStep: 3, selectedRecipeId: "", rollExpertise: "Longsword" } });
  check("no recipe: no picker, and a saved Longsword adds nothing (only the die)", [await pickerState(), await rollGain(6), await diceLine()], [null, 6, "d10: 6 | Crafting skill: none, pick a recipe to add it (+0) | Manual bonus: +0"]);
  // The builder's expertise cap (+15) holds: 8 points would be +16.
  await install({ ...SMITH, expertise: { Blacksmith: [["Longsword", 8]] }, crafting: { craftingWizardStep: 0 } });
  await gotoStep(0); await selectRecipe(swordId); await gotoStep(3);
  check("8 expertise points (+16) are capped at +15 in the picker", (await pickerState())?.options, ["No expertise", "Longsword +15"]);
  await chooseExpertise("Longsword");
  check("and in the roll: d10 1 + 5 + 15 = 21", await rollGain(1), 21);
  // Task 042 (033b/038b audit break A2): the breakdown names the capped +15 the
  // sum uses, not the uncapped +16.
  check("and the breakdown names the capped +15, not +16", await diceLine(), "d10: 1 | Crafting skill (Blacksmith): +5 | Expertise (Longsword): +15 | Manual bonus: +0");
  // A character with no expertise on the skill sees no picker and rolls as before.
  await install({ ...ALL_CRAFTERS, skillPoints: { Blacksmith: 5 }, crafting: { craftingWizardStep: 0 } });
  await gotoStep(0); await selectRecipe(swordId); await gotoStep(3);
  check("no expertise on the skill: no picker, the plain roll (d10 7 + 5 = 12)", [await pickerState(), await rollGain(7)], [null, 12]);
  // An old save (no rollExpertise field at all) loads as 'none' and rolls as today.
  await install({ ...SMITH, crafting: { craftingWizardStep: 3, selectedRecipeId: swordId } });
  const oldCraftingSave = await state();
  delete oldCraftingSave.play.crafting.rollExpertise;
  await page.evaluate(([key, json]) => localStorage.setItem(key, json), [STORAGE_KEY, JSON.stringify(oldCraftingSave)]);
  await reload();
  check("an old save without the field loads as 'no expertise'", [Object.hasOwn((await craftingState()), "rollExpertise"), (await craftingState()).rollExpertise], [true, ""]);
  check("and rolls exactly as before (12)", await rollGain(7), 12);
  await gotoStep(0);
  const guideText = await page.evaluate(() => document.getElementById("play-crafting")?.textContent || "");
  check("the guide tells players to pick the expertise next to Roll d10, not to type it into the Manual Crafting Bonus",
    [guideText.includes("pick it in the Matching Expertise box next to Roll d10"), guideText.includes("add an expertise through Manual Crafting Bonus")], [true, false]);

  // =========================================================================
  // Task 033b, item 2.
  section("J. An Alchemy craft makes 3 (rulebook: 'Alchemists always craft at least 3 of the item')");
  check("rulebook text: 'Alchemists always craft at least 3 of the item'", rulebook.includes("Alchemists always craft at least 3 of the item"), true);
  check("rulebook text: '... and this is reflected in the costs already'", rulebook.includes("this is reflected in the costs already"), true);
  await fresh();
  const craftedQuantities = await hook("craftedQuantities");
  const alchemyRecipes = craftedQuantities.filter(([, type]) => type === "Alchemy");
  check("the sheet has as many Alchemy recipes as the official data (58)", alchemyRecipes.length, itemDetails.filter((entry) => entry.craftingType === "Alchemy").length);
  check("every Alchemy recipe makes 3", alchemyRecipes.filter(([, , quantity]) => quantity !== 3).map(([name]) => name), []);
  check("every other recipe makes 1", craftedQuantities.filter(([, type]) => type !== "Alchemy").filter(([, , quantity]) => quantity !== 1).map(([name]) => name), []);
  check("Blacksmithing, Carpentry, Artificing, Armorsmithing and Culinary are all in the 'other' group", [...new Set(craftedQuantities.filter(([, type]) => type !== "Alchemy").map(([, type]) => type))].sort(), ["Armorsmithing", "Artificing", "Blacksmithing", "Carpentry", "Culinary"]);
  await install({ ...ALL_CRAFTERS, skillPoints: { Alchemy: 2 }, crafting: { craftingWizardStep: 0 } });
  await gotoStep(0); await selectRecipe(alchemyId); await gotoStep(3);
  await fillCraftingField("pendingPointSpend", 50);
  await js('#play-crafting [data-crafting-action="add-points"]');
  await gotoStep(4);
  const preResolveNote = await page.evaluate(() => [...document.querySelectorAll("#play-crafting .play-recipe-inferred-note")].map((node) => node.textContent).join(" "));
  check("before resolving, the Resolve step says an Alchemy craft makes 3 of the item", preResolveNote.includes("Success adds 3 of the crafted item (an Alchemy craft makes 3"), true);
  await pressSuccess();
  const alchemyItems = () => state().then((sheet) => sheet.play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:")).map((entry) => [entry.name, entry.quantity]));
  check("Craft Succeeded on Axolotl Elixir puts 3 in the inventory, in one stack", await alchemyItems(), [["Axolotl Elixir", 3]]);
  const alchemyLog = await topLog();
  check("the log says 'Crafted: 3 x Axolotl Elixir (added to inventory).'", alchemyLog.lines.includes("Crafted: 3 x Axolotl Elixir (added to inventory)."), true);
  check("the log gives the rule", alchemyLog.lines.some((line) => line.startsWith("Alchemy: the rulebook says Alchemists always craft at least 3 of the item")), true);
  check("the status line says 3 x", (await statusText()).includes("Craft succeeded: 3 x Axolotl Elixir added to inventory"), true);
  await js('[data-play-mode="combat"]');
  await js('[data-play-tab="inventory"]');
  check("the inventory row shows the x3 badge", await page.evaluate(() => [...document.querySelectorAll("#play-inventory .play-item-row")].filter((row) => /Axolotl Elixir/.test(row.textContent)).map((row) => [...row.querySelectorAll(".play-item-equipped-badge")].map((badge) => badge.textContent.trim()))), [["x3"]]);
  // Using one of the three must leave exactly two, with no second stack appearing.
  const stackUid = (await state()).play.inventoryItems.find((entry) => String(entry.uid).startsWith("crafted:")).uid;
  const consumeMessage = await hook("consumeOne", stackUid);
  const afterUse = await state();
  check("using one of three: the message says 2 remain", consumeMessage.includes("consumed one use. 2 remaining"), true);
  check("using one of three: the crafted stack holds 2", afterUse.play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:")).map((entry) => entry.quantity), [2]);
  check("using one of three: no second stack appears (no 'official' copy of the recipe)", afterUse.play.inventoryItems.map((entry) => entry.uid).filter((uid) => String(uid).startsWith("official:") && uid.includes(alchemyId)), []);
  check("using one of three: the builder's own item list does not get the recipe added", [afterUse.builder.selectedItemIds.includes(alchemyId), Object.hasOwn(afterUse.builder.itemQuantities || {}, alchemyId)], [false, false]);
  check("using one of three: the inventory still lists the elixir once, as x2", await page.evaluate(() => [...document.querySelectorAll("#play-inventory .play-item-row")].filter((row) => /Axolotl Elixir/.test(row.textContent)).map((row) => [...row.querySelectorAll(".play-item-equipped-badge")].map((badge) => badge.textContent.trim()))), [["x2"]]);
  await hook("consumeOne", stackUid);
  await hook("consumeOne", stackUid);
  const afterThree = await state();
  check("using all three removes the stack and leaves nothing behind", [afterThree.play.inventoryItems.filter((entry) => /Axolotl/.test(entry.name || "") || String(entry.uid).includes(alchemyId)).length, afterThree.builder.selectedItemIds.includes(alchemyId)], [0, false]);
  // A player who also BOUGHT an Elixir keeps it: using crafted ones never touches the bought copy.
  await js('[data-play-mode="crafting"]');
  await install({ ...ALL_CRAFTERS, skillPoints: { Alchemy: 2 }, crafting: { craftingWizardStep: 0 } });
  await page.evaluate(() => window.__t33.ownOfficial("Axolotl Elixir"));
  const ownedAlongside = async () => {
    const sheet = await state();
    return {
      bought: sheet.play.inventoryItems.filter((entry) => entry.uid === "official:" + alchemyId).map((entry) => entry.quantity),
      crafted: sheet.play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:")).map((entry) => entry.quantity),
      builderList: [sheet.builder.selectedItemIds.includes(alchemyId), sheet.builder.itemQuantities?.[alchemyId] ?? null]
    };
  };
  check("a bought Axolotl Elixir is in the inventory before crafting", await ownedAlongside(), { bought: [1], crafted: [], builderList: [true, 1] });
  await gotoStep(0); await selectRecipe(alchemyId); await gotoStep(3);
  await fillCraftingField("pendingPointSpend", 50);
  await js('#play-crafting [data-crafting-action="add-points"]');
  await gotoStep(4);
  await pressSuccess();
  check("crafting adds a separate stack of 3 and leaves the bought one alone", await ownedAlongside(), { bought: [1], crafted: [3], builderList: [true, 1] });
  const craftedUid = (await state()).play.inventoryItems.find((entry) => String(entry.uid).startsWith("crafted:")).uid;
  await hook("consumeOne", craftedUid);
  check("using one crafted elixir: the crafted stack drops to 2, the bought one is still 1", await ownedAlongside(), { bought: [1], crafted: [2], builderList: [true, 1] });
  await hook("consumeOne", craftedUid);
  await hook("consumeOne", craftedUid);
  check("using the last crafted elixir removes the crafted stack but not the bought one", await ownedAlongside(), { bought: [1], crafted: [], builderList: [true, 1] });
  // Undo takes all 3 back out.
  await js('[data-play-mode="crafting"]');
  await install({ ...ALL_CRAFTERS, skillPoints: { Alchemy: 2 }, crafting: { craftingWizardStep: 0 } });
  await gotoStep(0); await selectRecipe(alchemyId); await gotoStep(3);
  await fillCraftingField("pendingPointSpend", 50);
  await js('#play-crafting [data-crafting-action="add-points"]');
  await gotoStep(4);
  await pressSuccess();
  await page.click('#play-crafting [data-crafting-action="craft-undo"]');
  check("Undo removes the whole Alchemy stack of 3", await alchemyItems(), []);
  // A failed Alchemy craft makes nothing; a non-Alchemy craft still makes 1.
  await page.click(FAILURE);
  check("a failed Alchemy craft adds no items", await alchemyItems(), []);
  await install({ ...ALL_CRAFTERS, skillPoints: { Carpentry: 5 }, crafting: { craftingWizardStep: 0 } });
  await gotoStep(0); await selectRecipe(bowId); await gotoStep(3);
  await fillCraftingField("pendingPointSpend", 30);
  await js('#play-crafting [data-crafting-action="add-points"]');
  await gotoStep(4);
  const bowPreNote = await page.evaluate(() => [...document.querySelectorAll("#play-crafting .play-recipe-inferred-note")].map((node) => node.textContent).join(" "));
  check("a Carpentry recipe's Resolve step does not mention three", bowPreNote.includes("Success adds the crafted item to inventory"), true);
  await pressSuccess();
  check("a Carpentry craft still makes exactly 1", await alchemyItems(), [["Bow (Two-Handed)", 1]]);
  check("and says 'Crafted: 1 x Bow (Two-Handed)' with no Alchemy line", [(await topLog()).lines.includes("Crafted: 1 x Bow (Two-Handed) (added to inventory)."), (await topLog()).lines.some((line) => line.startsWith("Alchemy:"))], [true, false]);

  // =========================================================================
  // Task 033b, item 3.
  section("K. Start New Craft clears the mod notes only after a successful craft");
  const NOTES_A = "Recurve A (20 points)";
  const NOTES_B = "Hardened B mod";
  const NOTES_C = "Alloy plan, not used yet";
  const NOTES_D = "Reinforced limbs";
  const NOTES_E = "Gilded grip";
  // The notes box is drawn on the last wizard step (inside a closed panel; its value is still readable).
  const notesBox = async () => {
    await gotoStep(4);
    return page.evaluate(() => document.querySelector('#play-crafting [data-crafting-field="selectedMods"]')?.value ?? null);
  };
  const typeNotes = async (text) => {
    await gotoStep(4);
    await page.locator('#play-crafting summary:has-text("Mods, Alloys, and Session Notes")').click();
    await page.locator('#play-crafting [data-crafting-field="selectedMods"]').fill(text);
  };
  const prepareBow = async () => {
    await gotoStep(0); await selectRecipe(bowId); await gotoStep(3);
    await fillCraftingField("pendingPointSpend", 30);
    await js('#play-crafting [data-crafting-action="add-points"]');
    await gotoStep(4);
  };
  const START_NEW = '#play-crafting [data-crafting-action="reset-session"]';
  const craftedNotes = async () => (await state()).play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:")).map((entry) => entry.modNotes ?? null);
  await install({ ...ALL_CRAFTERS, skillPoints: { Carpentry: 5 }, crafting: { craftingWizardStep: 0 } });
  // (a) success, then Start New Craft: the box is cleared, the item keeps its notes.
  await prepareBow();
  await typeNotes(NOTES_A);
  await pressSuccess();
  check("(a) after a success: the notes are on the bow and still in the box", [await craftedNotes(), (await craftingState()).selectedMods], [[NOTES_A], NOTES_A]);
  check("(a) the Resolve step explains that Start New Craft will clear the notes", (await pagePlayText()).includes("Your mod notes are on the finished item, so Start New Craft clears the notes box for the next craft."), true);
  await page.click(START_NEW);
  check("(a) Start New Craft after a success clears the notes box", [(await craftingState()).selectedMods, await notesBox()], ["", ""]);
  check("(a) the bow keeps its notes", await craftedNotes(), [NOTES_A]);
  check("(a) the reset log says the notes went onto the item", (await topLog()).lines.some((line) => line.includes("The mod notes went onto the crafted item, so the box was cleared for the next craft.")), true);
  check("(a) the notes box hint tells players about the rule", (await page.evaluate(() => document.querySelector("[data-crafting-mod-notes-hint]")?.textContent || "")).includes("Start New Craft after a success clears the box"), true);
  // (b) failure, then Start New Craft: the notes stay.
  await gotoStep(0); await selectRecipe(bowId);
  await typeNotes(NOTES_B);
  await page.click(FAILURE);
  check("(b) a failed craft leaves the notes alone and adds no item", [(await craftingState()).selectedMods, (await craftingState()).lastCraftOutcome?.type, await craftedNotes()], [NOTES_B, "failure", [NOTES_A]]);
  check("(b) the Resolve step says the notes are kept for a retry", (await pagePlayText()).includes("Your mod notes are kept, so you can retry the same build."), true);
  await page.click(START_NEW);
  check("(b) Start New Craft after a failure keeps the notes", [(await craftingState()).selectedMods, await notesBox()], [NOTES_B, NOTES_B]);
  check("(b) the reset log says the notes were kept", (await topLog()).lines.some((line) => line.includes("Mod notes were kept.")), true);
  // (c) no craft yet: Reset Session keeps the notes.
  await typeNotes(NOTES_C);
  await gotoStep(3);
  await js(START_NEW);
  check("(c) Reset Session with no craft resolved keeps the notes", (await craftingState()).selectedMods, NOTES_C);
  // (d) success, Undo, then Reset Session: the craft was undone, so the notes stay.
  await prepareBow();
  await typeNotes(NOTES_D);
  await pressSuccess();
  await page.click('#play-crafting [data-crafting-action="craft-undo"]');
  await gotoStep(3);
  await js(START_NEW);
  check("(d) after Undo of a success, Reset Session keeps the notes (no craft stands)", [(await craftingState()).selectedMods, await craftedNotes()], [NOTES_D, [NOTES_A]]);
  // (e) the Reset Session button on the Roll step does the same when a success stands.
  await prepareBow();
  await typeNotes(NOTES_E);
  await pressSuccess();
  await gotoStep(3);
  await js(START_NEW);
  check("(e) Reset Session pressed while a success stands also clears the notes (the same reset)", [(await craftingState()).selectedMods, await craftedNotes()], ["", [NOTES_A, NOTES_E]]);
  // The empty box and the cleared state survive a reload.
  await reload();
  check("(f) after a reload the box is still empty and the items keep their notes", [(await craftingState()).selectedMods, await craftedNotes()], ["", [NOTES_A, NOTES_E]]);

  check("No uncaught browser JavaScript errors", pageErrors, []);
  console.log(`\n${passed} passed, ${failures.length} failed. Evidence: ${output}`);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed, failed: failures.length, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: error.stack, failures, serverLog }, null, 2));
  console.error(error.stack);
  console.log(`
${passed} passed, ${failures.length} failed, then the run stopped early (see the error above).`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
