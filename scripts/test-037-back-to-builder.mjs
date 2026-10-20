// Task 037 checks: from the play sheet, every way back into the builder opens
// the full Advanced builder with the character intact.
//
// What this proves, in a real browser, through the real screens:
//   1. For a Quick Build Human Gunslinger, a Quick Build Catfolk Gadgeteer, an
//      Advanced Build character, a save-slot character and a JSON-imported
//      character: accept -> play sheet -> each sheet control that goes back to
//      the builder (Lyrian symbol, status pill, Table Tools "Return to
//      Builder", phone "Builder" button) opens Advanced Build on Review &
//      Finish with no Quick Build screen; "Spend XP" opens Advanced Classes.
//   2. Nothing the player did not change changes: the whole character state
//      (fields, builder picks, Quick Build record, inventory, effects, log) is
//      the same in the builder and back on the sheet, and the current HP,
//      Mana, RP and AP the player had are kept (not refilled).
//   3. From that landing the player can buy the next class ability with
//      banked EXP, buy an item and drop another, and the sheet shows it.
//      A max change clamps a wounded pool; a full pool stays full.
//   4. A brand-new character still starts full; Reset Character and Quick
//      Build from a fresh state still work, and a new Quick Build started
//      during a builder visit does not inherit the old character's pools.
//   5. Owlbear Companion (031 audit finding 2): the first open lands on the
//      play sheet, and a reload keeps the mode the player chose (builder
//      stays builder, sheet stays sheet), from a save slot and a working save.
//   6. (031 audit break B11) A window with an opener but another name is never
//      treated as a Companion tab: it stays on the builder.
//
// The real src/js is bundled in memory with a test-only hook block appended to
// ui.js (the test-029/030 pattern); nothing in the shipped source is altered.
// The built bundle is also checked for the task's code.
//
// Run:  npm run test:037   (builds first)
// Env:  T37_PORT (default 4372); T37_SRC=<folder with src/js> bundles another
//       source tree (used to record the "before" behaviour).
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.env.T37_SRC ? path.resolve(process.env.T37_SRC) : root;
const output = path.join(root, "qa-test-results/task-037-back-to-builder");
await mkdir(output, { recursive: true });
const port = Number(process.env.T37_PORT || 4372);

const STORAGE_KEY = "lyrian-chronicles-character-suite-v2";
const SAVE_SLOTS_KEY = "lyrian-chronicles-character-suite-slots-v1";
const ACTIVE_SAVE_SLOT_KEY = "lyrian-chronicles-character-suite-active-slot-v1";
const COMPANION_WINDOW_KEY = "angel-sword-companion-window-mode-v1";
const REVIEW = { label: "Advanced Build", title: "Review the Character", progress: "Step 10 of 10", stepId: "review" };
const CLASSES = { label: "Advanced Build", title: "Choose Classes", progress: "Step 7 of 10", stepId: "classes" };

const failures = [];
let passed = 0;
const record = { controls: [], diffs: [], pools: [], companion: [] };
const check = (name, actual, expected) => {
  try {
    assert.deepEqual(actual, expected, name);
    passed += 1;
  } catch {
    failures.push(name);
    const short = (value) => { const text = JSON.stringify(value) ?? "undefined"; return text.length > 700 ? `${text.slice(0, 700)}... (${text.length} chars)` : text; };
    console.log(`  FAIL ${name}\n       actual:   ${short(actual)}\n       expected: ${short(expected)}`);
  }
};
const section = (title) => console.log(`\n== ${title}`);

// Paths (a.b.c) where two JSON values differ.
function diffPaths(left, right, prefix = "") {
  if (Object.is(left, right)) return [];
  const isObject = (value) => value && typeof value === "object";
  if (!isObject(left) || !isObject(right) || Array.isArray(left) !== Array.isArray(right)) {
    return [`${prefix || "(root)"}: ${JSON.stringify(left)} -> ${JSON.stringify(right)}`];
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].flatMap((key) => diffPaths(left[key], right[key], prefix ? `${prefix}.${key}` : key));
}

// ---------------------------------------------------------------------------
// Test-only hooks, appended to ui.js in the in-memory bundle.
// ---------------------------------------------------------------------------
const hooks = `
window.__t37 = {
  // Everything that makes up the character, minus view-only state.
  character() {
    const copy = JSON.parse(JSON.stringify(state));
    delete copy.ui;
    delete copy.revision;
    delete copy.lastFocusedField;
    if (copy.builder) delete copy.builder.inspected;
    if (copy.play) {
      delete copy.play.resourcesBeforeBuilderVisit;
      ["hpCurrent", "hpMax", "manaCurrent", "manaMax", "rpCurrent", "rpMax", "apCurrent", "apMax", "tempHp"].forEach((key) => {
        if (copy.play.resources && key in copy.play.resources) copy.play.resources[key] = Number(copy.play.resources[key]);
      });
    }
    const budget = getClassUnlockBudgetState();
    const funds = getStartingFundsState();
    const progress = getCampaignProgressState();
    const derived = getDerivedCombatStats();
    copy.derived = {
      classes: getSelectedClassProgress().map((entry) => entry.record.name + " " + entry.purchasedCount),
      breakthroughs: getSelectedBreakthroughRecords().map((entry) => entry.name),
      items: getSelectedItemRecords().map((entry) => entry.name + " x" + Math.max(1, toNumber(state.builder.itemQuantities?.[entry.id], 1))),
      exp: { spent: budget.spentExp, budget: budget.expBudget, remaining: budget.remainingExp, ip: budget.spentInterlude },
      clim: funds.availableClim,
      expBank: progress.expBank,
      spiritCore: progress.spiritCore,
      skills: getSkillRowsData().filter((row) => row.total).map((row) => row.name + " " + row.total),
      maxima: { hp: derived.hpMax, mana: derived.manaMax, rp: derived.rpMax, ap: derived.apMax, guard: derived.guard, initiative: derived.initiative }
    };
    return copy;
  },
  pools() {
    const resources = state.play.resources;
    return {
      hp: Number(resources.hpCurrent), hpMax: Number(resources.hpMax), tempHp: Number(resources.tempHp),
      mana: Number(resources.manaCurrent), manaMax: Number(resources.manaMax),
      rp: Number(resources.rpCurrent), rpMax: Number(resources.rpMax),
      ap: Number(resources.apCurrent), apMax: Number(resources.apMax),
      hpHasManualChange: Boolean(state.play.hpHasManualChange)
    };
  },
  ui() {
    return { mode: state.ui.mode, builderStep: state.ui.builderStep, quickBuildActive: Boolean(state.ui.quickBuildActive), quickBuildStep: state.ui.quickBuildStep };
  },
  view() {
    const text = (selector) => (document.querySelector(selector)?.textContent || "").replace(/\\s+/g, " ").trim();
    const shown = (id) => !document.getElementById(id).classList.contains("is-hidden");
    return {
      builder: shown("builder-view"),
      sheet: shown("sheet-view"),
      label: text("#builder-mode-label"),
      title: text("#builder-step-title"),
      progress: text("#builder-progress-text"),
      stepId: BUILDER_STEPS[state.ui.builderStep]?.id || "",
      quickBuildScreen: Boolean(document.querySelector("#builder-step-content [data-quick-build-action]"))
        || !document.getElementById("builder-return-advanced").classList.contains("is-hidden")
        || /Quick Build/.test(text("#builder-progress-text")),
      quickBuildActive: Boolean(state.ui.quickBuildActive)
    };
  },
  storable() { return createStorableStateSnapshot(); },
  serialized() { return serializeCurrentState(); },
  itemId(name) { return lookup.items.resolve(name)?.id || ""; },
  itemCost(name) { return parseClimCost(lookup.items.resolve(name)?.cost); },
  ownedItemIds() { return [...state.builder.selectedItemIds]; },
  classIds() { return getSelectedClassProgress().map((entry) => ({ id: entry.record.id, purchased: entry.purchasedCount })); },
  windowMode() { try { return sessionStorage.getItem(${JSON.stringify(COMPANION_WINDOW_KEY)}); } catch { return "unavailable"; } },
  enterQuickBuild() { enterQuickBuildMode(); }
};`;

const bundle = await build({
  absWorkingDir: sourceRoot,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "task037-test-access", setup(buildApi) {
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
  // -------------------------------------------------------------------------
  section("The built app carries the task 037 code");
  const builtBundle = await readFile(path.join(root, "assets/app.bundle.js"), "utf8");
  const indexHtml = await readFile(path.join(root, "index.html"), "utf8");
  check("built bundle has the Companion window memory key", builtBundle.includes(COMPANION_WINDOW_KEY), true);
  check("built bundle keeps pools across a builder visit", builtBundle.includes("resourcesBeforeBuilderVisit"), true);
  // Task 032 loosened this pin: later tasks must bump the token again, so it
  // checks that the bundle moved on from the tokens before task 037.
  const bundleToken = /app\.bundle\.js\?v=([^"]+)"/.exec(indexHtml)?.[1] || "";
  check("index.html loads the task 037 bundle or a later one (cache-buster bumped)",
    Boolean(bundleToken) && !["20261019-task036-skill-list", "20260916-alpha-labels"].includes(bundleToken), true);

  server = await startServer();
  const baseUrl = server.url;
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.route("**/assets/app.bundle.js*", (route) => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
  await context.route("**/api/vtt-relay/events*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, boot: "t37", seq: 0, events: [] }) }));
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("dialog", (dialog) => dialog.accept());

  const ready = async (target = page) => {
    await target.waitForFunction(() => window.__t37 && window.LYRIAN_DATA?.version === "0.13.2" && (document.getElementById("builder-step-content")?.innerHTML || "").length > 100, null, { timeout: 20000 });
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
  const hook = (name, arg, target = page) => target.evaluate(([fn, value]) => window.__t37[fn](value), [name, arg]);
  // The hit points sit in the combat panel; Table Tools hides it, so wait for
  // it to exist rather than to be visible.
  const onSheet = (target = page) => target.waitForSelector("#sheet-view:not(.is-hidden) #play-hit-points .play-hit-current", { timeout: 15000, state: "attached" });
  const onBuilder = (target = page) => target.waitForSelector("#builder-view:not(.is-hidden)", { timeout: 15000 });

  const quickBuild = async (speciesId, buildId, name = "") => {
    await js("#quick-build-entry");
    await js(`[data-quick-build-action="select-species"][data-id="${speciesId}"]`);
    await js("#builder-next");
    if (name) await page.fill("#builder-name-header", name);
    await js("#builder-next");
    await js(`[data-quick-build-action="select-build"][data-id="${buildId}"]`);
    await js("#builder-next");
    check(`${speciesId} ${buildId}: Quick Build reached its Review`, (await hook("view")).title.length > 0 && (await hook("ui")).quickBuildActive, true);
    await js("#builder-next"); // Use This Character
    await onSheet();
  };
  // Spend some of every pool on the sheet through its own controls.
  const usePools = async (damage = 7) => {
    const before = await hook("pools");
    await page.click('[data-play-mode="combat"]:visible').catch(() => {});
    await page.fill('[data-play-resource="manaCurrent"]', String(Math.max(0, before.manaMax - 2)));
    await page.fill('[data-play-resource="rpCurrent"]', String(Math.max(0, before.rpMax - 1)));
    await page.fill('[data-play-resource="apCurrent"]', "2");
    await page.fill("#play-hp-adjust-amount", String(damage));
    await page.click("#play-damage-button");
    await page.waitForFunction((hp) => Number(document.querySelector(".play-hit-current")?.textContent) === hp, before.hpMax - damage);
    return hook("pools");
  };
  const CONTROLS = [
    { name: "Lyrian symbol", press: () => js("#return-to-builder") },
    { name: "status pill", press: () => js("#status-pill") },
    { name: "Table Tools Return to Builder", press: async () => { await js('[data-play-mode="table"]'); await js('[data-table-tool-action="builder"]'); } },
    { name: "phone Builder button", press: () => js("[data-mobile-return-builder]") }
  ];
  const backToSheet = async () => {
    // The builder's own "Continue to Character Sheet" (Review's Next button).
    // Only the old code needs the step click (it did not land on Review).
    const view = await hook("view");
    if (view.stepId !== "review" && !view.quickBuildActive) await js('[data-step-index="9"]');
    await js("#builder-next");
    await onSheet();
    await js('[data-play-mode="combat"]').catch(() => {});
  };

  // One full round trip through every control; returns nothing, records checks.
  const roundTrips = async (label) => {
    for (const control of CONTROLS) {
      const sheetCharacter = await hook("character");
      const sheetPools = await hook("pools");
      await control.press();
      await onBuilder();
      const view = await hook("view");
      record.controls.push({ character: label, control: control.name, view });
      check(`${label} / ${control.name}: opens Advanced Build on Review, no Quick Build screen`,
        { builder: view.builder, sheet: view.sheet, label: view.label, title: view.title, progress: view.progress, stepId: view.stepId, quickBuildScreen: view.quickBuildScreen, quickBuildActive: view.quickBuildActive },
        { builder: true, sheet: false, ...REVIEW, quickBuildScreen: false, quickBuildActive: false });
      const builderCharacter = await hook("character");
      const inBuilderDiff = diffPaths(
        { ...sheetCharacter, play: { ...sheetCharacter.play, resources: null } },
        { ...builderCharacter, play: { ...builderCharacter.play, resources: null } });
      check(`${label} / ${control.name}: the builder holds the same character (state diff)`, inBuilderDiff, []);
      await backToSheet();
      const returnedCharacter = await hook("character");
      const returnedPools = await hook("pools");
      const tripDiff = diffPaths(sheetCharacter, returnedCharacter);
      record.diffs.push({ character: label, control: control.name, diff: tripDiff });
      record.pools.push({ character: label, control: control.name, before: sheetPools, after: returnedPools });
      check(`${label} / ${control.name}: back on the sheet nothing changed (state diff incl. pools)`, tripDiff, []);
      check(`${label} / ${control.name}: current HP, Mana, RP and AP kept`, returnedPools, sheetPools);
    }
    // Spend XP: an upgrade control, lands on Classes.
    const before = await hook("character");
    await js("[data-open-exp-spending]");
    await onBuilder();
    const view = await hook("view");
    record.controls.push({ character: label, control: "Spend XP", view });
    check(`${label} / Spend XP: opens Advanced Build on Classes, no Quick Build screen`,
      { builder: view.builder, label: view.label, title: view.title, progress: view.progress, stepId: view.stepId, quickBuildScreen: view.quickBuildScreen, quickBuildActive: view.quickBuildActive },
      { builder: true, ...CLASSES, quickBuildScreen: false, quickBuildActive: false });
    await js('[data-step-index="9"]');
    await backToSheet();
    check(`${label} / Spend XP: back on the sheet nothing changed`, diffPaths(before, await hook("character")), []);
  };

  // Buy the next class ability with banked EXP, buy an item, drop another;
  // the sheet shows all of it and the pools are kept.
  const upgrades = async (label, { buyItem, dropItem }) => {
    await page.fill('[data-play-transaction-amount="Exp"]', "100");
    await page.click('[data-play-transaction-field="Exp"][data-play-transaction-action="add"]');
    await page.waitForFunction(() => document.querySelector('[data-play-transaction-amount="Exp"]') !== null);
    const sheetPools = await hook("pools");
    const before = await hook("character");
    await js("#return-to-builder");
    await onBuilder();
    await js('[data-step-index="6"]');
    const learnable = await page.evaluate(() => [...document.querySelectorAll('[data-builder-action="learn-class-ability"]:not([disabled])')].map((button) => button.dataset.id));
    check(`${label}: banked EXP makes a next class ability buyable`, learnable.length > 0, true);
    const classBefore = (await hook("classIds")).find((entry) => entry.id === learnable[0]);
    const levelOnSheet = (target = page) => target.evaluate((id) => (document.querySelector(`#play-header-card .play-header-class-card[data-play-class-reference="${id}"] .play-header-class-level`)?.textContent || "").trim(), learnable[0] || "");
    const sheetLevelBefore = await levelOnSheet();
    if (learnable.length) await js(`[data-builder-action="learn-class-ability"][data-id="${learnable[0]}"]`);
    const classAfter = (await hook("classIds")).find((entry) => entry.id === learnable[0]);
    check(`${label}: the next ability was bought`, (classAfter?.purchased || 0) - (classBefore?.purchased || 0), 1);
    await js('[data-step-index="8"]');
    const buyId = await hook("itemId", buyItem);
    const dropId = await hook("itemId", dropItem);
    await js(`[data-builder-action="add-item"][data-id="${buyId}"]`);
    await js(`[data-builder-action="remove-item"][data-id="${dropId}"]`);
    await js('[data-step-index="9"]');
    await backToSheet();
    const after = await hook("character");
    check(`${label}: EXP bank spent on the ability`, after.derived.exp.remaining < before.derived.exp.remaining, true);
    check(`${label}: class shows one more ability`, after.derived.classes.length === before.derived.classes.length && after.derived.classes.join() !== before.derived.classes.join(), true);
    const quantity = (items, name) => {
      const entry = items.find((item) => item.replace(/ x\d+$/, "") === name);
      return entry ? Number(entry.match(/ x(\d+)$/)?.[1] || 1) : 0;
    };
    check(`${label}: bought one more ${buyItem}`, quantity(after.derived.items, buyItem) - quantity(before.derived.items, buyItem), 1);
    check(`${label}: dropped one ${dropItem}`, quantity(before.derived.items, dropItem) - quantity(after.derived.items, dropItem), 1);
    const buyCost = await hook("itemCost", buyItem);
    const dropCost = await hook("itemCost", dropItem);
    check(`${label}: Clim moved by the two purchases (-${buyCost} +${dropCost})`, after.derived.clim - before.derived.clim, dropCost - buyCost);
    const sheetText = await page.evaluate(() => document.getElementById("sheet-view").textContent.replace(/\s+/g, " "));
    check(`${label}: the sheet inventory lists ${buyItem}`, sheetText.includes(buyItem), true);
    const sheetLevelAfter = await levelOnSheet();
    check(`${label}: the sheet's class card shows the new level`, [sheetLevelBefore !== "", Number(sheetLevelAfter.replace(/\D/g, "")) - Number(sheetLevelBefore.replace(/\D/g, ""))], [true, 1]);
    const changedPaths = diffPaths(before, after).map((entry) => entry.split(":")[0]);
    const unexpected = changedPaths.filter((entry) => !/^(fields|builder\.(classAbilityProgress|selectedItemIds|itemQuantities|autoExpBank|autoSpiritCore)|abilitySelections|derived|play\.(inventoryItems|log|resources\.(hpMax|manaMax|rpMax|apMax)))/.test(entry));
    check(`${label}: only the bought ability, items and their numbers changed`, unexpected, []);
    const afterPools = await hook("pools");
    check(`${label}: pools kept through the upgrade trip`, { hp: afterPools.hp, mana: afterPools.mana, rp: afterPools.rp, ap: afterPools.ap },
      { hp: Math.min(sheetPools.hp, afterPools.hpMax), mana: Math.min(sheetPools.mana, afterPools.manaMax), rp: Math.min(sheetPools.rp, afterPools.rpMax), ap: Math.min(sheetPools.ap, afterPools.apMax) });
  };

  // Each lettered part starts from a fresh page; if one stops early it is a
  // failure and the next part still runs (so a run on the old code reports
  // every part). T37_ONLY=A,G limits the run.
  const only = (process.env.T37_ONLY || "").split(",").map((entry) => entry.trim().toUpperCase()).filter(Boolean);
  const part = async (letter, title, fn) => {
    if (only.length && !only.includes(letter)) return;
    section(`${letter}. ${title}`);
    try {
      await fn();
    } catch (error) {
      failures.push(`${letter}: part stopped early`);
      const where = String(error.stack || "").split("\n").filter((line) => line.includes("test-037-back-to-builder.mjs")).slice(0, 3).map((line) => line.trim().replace(/^at /, "").replace(/\(.*test-037-back-to-builder\.mjs:/, "(line ")).join(" <- ");
      console.log(`  FAIL ${letter}: part stopped early: ${String(error.message || error).split("\n")[0]}${where ? `\n       at ${where}` : ""}`);
    }
  };

  // -------------------------------------------------------------------------
  await part("A", "Quick Build Human Gunslinger (and max HP changes)", async () => {
  await fresh();
  await quickBuild("human", "gunslinger");
  const fullPools = await hook("pools");
  check("A: a brand-new Quick Build character starts with full pools",
    [fullPools.hp === fullPools.hpMax, fullPools.mana === fullPools.manaMax, fullPools.rp === fullPools.rpMax, fullPools.ap === fullPools.apMax], [true, true, true, true]);
  await usePools();
  await roundTrips("Human Gunslinger");
  await upgrades("Human Gunslinger", { buyItem: "Military Ration", dropItem: "Healing Potion" });

  // Max changes: a wounded pool is clamped, a full pool stays full.
  const setToughness = async (delta) => {
    await js("#return-to-builder");
    await onBuilder();
    await js('[data-step-index="3"]');
    await page.selectOption('[data-builder-mode="mainStatMode"]', "custom");
    const current = Number(await page.inputValue('[data-stat-field="Toughness"]'));
    await page.fill('[data-stat-field="Toughness"]', String(current + delta));
    await js('[data-step-index="9"]');
    await backToSheet();
    return hook("pools");
  };
  let pools = await hook("pools");
  check("A2 setup: HP is below max", pools.hp < pools.hpMax, true);
  const woundedHp = pools.hp;
  const lowered = await setToughness(-1);
  record.pools.push({ character: "Human Gunslinger", control: "Toughness -1 (max -10)", before: pools, after: lowered });
  check("A2: Toughness -1 lowers max HP by 10 and the wounded HP is clamped to it", [lowered.hpMax, lowered.hp], [pools.hpMax - 10, Math.min(woundedHp, pools.hpMax - 10)]);
  pools = lowered;
  const raised = await setToughness(+1);
  record.pools.push({ character: "Human Gunslinger", control: "Toughness +1 (max +10)", before: pools, after: raised });
  if (pools.hp === pools.hpMax) {
    check("A2: a full HP pool stays full when max HP goes up", [raised.hpMax, raised.hp], [pools.hpMax + 10, pools.hpMax + 10]);
  }
  await page.fill("#play-hp-adjust-amount", "4");
  await page.click("#play-damage-button");
  pools = await hook("pools");
  const raisedAgain = await setToughness(+1);
  record.pools.push({ character: "Human Gunslinger", control: "wounded, Toughness +1 (max +10)", before: pools, after: raisedAgain });
  check("A2: a wounded HP pool keeps its number when max HP goes up (no free healing)", [raisedAgain.hpMax, raisedAgain.hp, raisedAgain.hpHasManualChange], [pools.hpMax + 10, pools.hp, true]);
  check("A2: Mana, RP and AP kept through the stat changes", [raisedAgain.mana, raisedAgain.rp, raisedAgain.ap], [pools.mana, pools.rp, pools.ap]);
  });

  // -------------------------------------------------------------------------
  await part("B", "Quick Build Catfolk Gadgeteer", async () => {
  await fresh();
  await quickBuild("catfolk", "gadgeteer");
  await usePools(5);
  await roundTrips("Catfolk Gadgeteer");
  await upgrades("Catfolk Gadgeteer", { buyItem: "Healing Potion", dropItem: "Small Shell" });
  });

  // -------------------------------------------------------------------------
  await part("C", "Advanced Build character", async () => {
  await fresh();
  await page.fill("#builder-name-header", "Advanced Tester");
  await js('[data-builder-action="pick-race"][data-id="human"]').catch(async () => {
    await page.locator('[data-builder-action="pick-race"]').filter({ hasText: "Human" }).first().click();
  });
  // A half-built character (no class yet) that peeks at the sheet goes back
  // to the step it was on, as before.
  await js('[data-step-index="3"]');
  await js("#builder-sheet-shortcut-top");
  await onSheet();
  await js("#return-to-builder");
  await onBuilder();
  const halfBuilt = await hook("view");
  record.controls.push({ character: "Advanced, no class yet", control: "Lyrian symbol", view: halfBuilt });
  check("C: a character with no class yet returns to the step it was on (Main Stats)", [halfBuilt.label, halfBuilt.stepId, halfBuilt.quickBuildActive], ["Advanced Build", "main-stats", false]);
  await js('[data-step-index="6"]');
  await js('[data-builder-action="toggle-class"][data-id="fighter"]');
  await js('[data-builder-action="learn-class-ability"][data-id="fighter"]');
  await js('[data-step-index="8"]');
  await js(`[data-builder-action="add-item"][data-id="${await hook("itemId", "Healing Potion")}"]`);
  await js(`[data-builder-action="add-item"][data-id="${await hook("itemId", "Military Ration")}"]`);
  // Leave from the Equipment step with the top "Continue to Character Sheet".
  await js("#builder-sheet-shortcut-top");
  await onSheet();
  check("C: the Advanced character reached the sheet from Equipment", (await hook("ui")).mode, "sheet");
  await usePools(6);
  await roundTrips("Advanced Fighter");
  await upgrades("Advanced Fighter", { buyItem: "Smoke Flask", dropItem: "Military Ration" });
  });

  // -------------------------------------------------------------------------
  await part("D", "Character loaded from a save slot", async () => {
  await fresh();
  await quickBuild("human", "gunslinger", "Slot Tester");
  await js('[data-play-mode="table"]');
  await js('[data-table-tool-action="save"]');
  await page.fill("#save-slot-name-input", "Slot Tester");
  await js('[data-save-slot-submit="new"]');
  await page.waitForFunction(() => /Saved Slot Tester/.test(document.getElementById("status-pill")?.textContent || ""));
  await page.keyboard.press("Escape");
  // Reset Character, then Load Saved.
  await js("#return-to-builder");
  await onBuilder();
  await js("#builder-start-over-sidebar");
  await js("[data-reset-character-confirm]");
  check("D: Reset Character cleared the character", (await hook("character")).fields.Name || "", "");
  await js("#builder-load-browser");
  await js('[data-slot-action="load"]');
  await page.waitForFunction(() => /Loaded Slot Tester/.test(document.getElementById("builder-status-pill")?.textContent || "") || /Loaded Slot Tester/.test(document.getElementById("status-pill")?.textContent || ""));
  const loadedView = await hook("view");
  record.controls.push({ character: "Slot Tester", control: "(after Load Saved, before the sheet)", view: loadedView });
  check("D: the slot character loads into Advanced Build (not Quick Build)", [loadedView.label, loadedView.quickBuildActive], ["Advanced Build", false]);
  await js("#builder-sheet-shortcut-top");
  await onSheet();
  await usePools(9);
  await roundTrips("Slot Tester");
  await upgrades("Slot Tester", { buyItem: "Military Ration", dropItem: "Healing Potion" });
  // A builder visit survives a reload from the active slot.
  const slotPools = await hook("pools");
  await js("#return-to-builder");
  await onBuilder();
  await page.waitForTimeout(200);
  await page.reload({ waitUntil: "load" });
  await ready();
  check("D: reload during a builder visit stays in the builder", (await hook("view")).builder, true);
  await js("#builder-sheet-shortcut-top");
  await onSheet();
  check("D: pools kept across a reload from the active save slot", await hook("pools"), slotPools);
  });

  // -------------------------------------------------------------------------
  await part("E", "Character imported from a JSON file (then a brand-new character)", async () => {
  await fresh();
  await quickBuild("catfolk", "gadgeteer", "Import Tester");
  await usePools(4);
  await js('[data-play-mode="table"]');
  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  downloadPromise.catch(() => {});
  await js('[data-table-tool-action="export"]');
  await js('#sheet-modal:not([hidden]) [data-export-mode="json"]');
  const download = await downloadPromise;
  const exportPath = path.join(output, "import-tester.json");
  await download.saveAs(exportPath);
  const exported = JSON.parse(await readFile(exportPath, "utf8"));
  check("E: the exported file still says Quick Build was active (the old flag a file can carry)", Boolean(exported.ui?.quickBuildActive), true);
  await page.keyboard.press("Escape").catch(() => {});
  await js("#return-to-builder");
  await onBuilder();
  await js("#builder-start-over-sidebar");
  await js("[data-reset-character-confirm]");
  await page.locator("#import-file").setInputFiles(exportPath);
  await page.waitForFunction(() => /Imported import-tester/.test((document.getElementById("status-pill")?.textContent || "") + (document.getElementById("builder-status-pill")?.textContent || "")), null, { timeout: 15000 });
  await onSheet();
  await js('[data-play-mode="combat"]').catch(() => {});
  await roundTrips("Import Tester");
  await upgrades("Import Tester", { buyItem: "Healing Potion", dropItem: "Small Shell" });

  // Starting a brand-new character still works (continues from the import).
  await js("#return-to-builder");
  await onBuilder();
  // Task 038 item 12: a built character's builder hides the Quick Build card
  // (Reset Character starts over). The Quick Build start itself is still
  // checked here through its code path, so a new Quick Build begun during a
  // builder visit keeps dropping the old character's pools.
  check("E: a built character's builder hides the Quick Build card (task 038)",
    await page.evaluate(() => document.getElementById("quick-build-entry").classList.contains("is-hidden")), true);
  await hook("enterQuickBuild");
  const startedView = await hook("view");
  check("E: Quick Build still opens (code path)", [startedView.quickBuildActive, startedView.label], [true, "Quick Build"]);
  await js('[data-quick-build-action="select-species"][data-id="human"]');
  await js("#builder-next");
  await js("#builder-next");
  await js('[data-quick-build-action="select-build"][data-id="shield-warrior"]');
  await js("#builder-next");
  await js("#builder-next");
  await onSheet();
  const newPools = await hook("pools");
  check("E: a new Quick Build made during a builder visit starts full (old pools not inherited)",
    [newPools.hp === newPools.hpMax, newPools.mana === newPools.manaMax, newPools.rp === newPools.rpMax, newPools.ap === newPools.apMax], [true, true, true, true]);
  await js("#return-to-builder");
  await onBuilder();
  await js("#builder-start-over-sidebar");
  await js("[data-reset-character-confirm]");
  const resetView = await hook("view");
  check("E: Reset Character opens a fresh Advanced Build step 1", [resetView.label, resetView.progress, (await hook("character")).builder.selectedClassIds.length], ["Advanced Build", "Step 1 of 10", 0]);
  await quickBuild("catfolk", "hunter-archer");
  const freshPools = await hook("pools");
  check("E: Quick Build from a fresh state starts full",
    [freshPools.hp === freshPools.hpMax, freshPools.mana === freshPools.manaMax, freshPools.rp === freshPools.rpMax, freshPools.ap === freshPools.apMax], [true, true, true, true]);
  });
  check("no page errors in the builder runs", pageErrors, []);

  // -------------------------------------------------------------------------
  let roomSlot = null;
  let roomWorking = "";
  await part("F", "Owlbear Companion: one landing per window; a reload keeps the mode", async () => {
  await fresh();
  await quickBuild("human", "gunslinger", "Room Tester");
  roomSlot = await hook("storable");
  roomWorking = await hook("serialized");
  const companionCase = async (label, seed) => {
    const seedPage = await context.newPage();
    await seedPage.goto(`${baseUrl}owlbear/panel.html`, { waitUntil: "domcontentloaded" });
    await seedPage.evaluate(seed);
    const popupPromise = seedPage.waitForEvent("popup", { timeout: 20000 });
    await seedPage.locator("#open-sheet").click();
    const popup = await popupPromise;
    const errors = [];
    popup.on("pageerror", (error) => errors.push(String(error)));
    await popup.waitForLoadState("load");
    await ready(popup);
    const steps = [];
    const look = async (what) => {
      const view = await hook("view", undefined, popup);
      steps.push({ what, view: view.sheet ? "sheet" : `builder: ${view.label} / ${view.title}`, windowMode: await hook("windowMode", undefined, popup) });
      return view;
    };
    const first = await look("first open from the Companion");
    check(`${label}: first open lands on the play sheet`, first.sheet, true);
    await js("#return-to-builder", popup);
    await onBuilder(popup);
    await look("pressed the Lyrian symbol");
    await popup.waitForTimeout(200);
    await popup.reload({ waitUntil: "load" });
    await ready(popup);
    const afterReload = await look("reload");
    check(`${label}: after pressing Builder, a reload stays in the builder`, [afterReload.builder, afterReload.sheet], [true, false]);
    check(`${label}: ... in Advanced Build on Review, not Quick Build`, [afterReload.label, afterReload.stepId, afterReload.quickBuildScreen], ["Advanced Build", "review", false]);
    await js("#builder-next", popup);
    await onSheet(popup);
    await look("Continue to Character Sheet");
    await popup.waitForTimeout(200);
    await popup.reload({ waitUntil: "load" });
    await ready(popup);
    const sheetReload = await look("reload");
    check(`${label}: on the sheet, a reload stays on the sheet`, sheetReload.sheet, true);
    check(`${label}: no page errors`, errors, []);
    record.companion.push({ case: label, steps });
    await popup.close();
    await seedPage.close();
  };
  await companionCase("Companion, active save slot (B19 case)", new Function(`
    localStorage.clear();
    localStorage.setItem(${JSON.stringify(SAVE_SLOTS_KEY)}, JSON.stringify({ version: 1, slots: [{ id: "slot-t37", name: "Room Tester", savedAt: new Date().toISOString(), snapshot: ${JSON.stringify(roomSlot)} }] }));
    localStorage.setItem(${JSON.stringify(ACTIVE_SAVE_SLOT_KEY)}, "slot-t37");
  `));
  await companionCase("Companion, working save", new Function(`
    localStorage.clear();
    localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(roomWorking)});
  `));

  // First open with no character spends the window's one landing: a
  // character finished later in that window's builder is not pushed onto the
  // sheet by a reload.
  {
    const seedPage = await context.newPage();
    await seedPage.goto(`${baseUrl}owlbear/panel.html`, { waitUntil: "domcontentloaded" });
    await seedPage.evaluate(() => localStorage.clear());
    const popupPromise = seedPage.waitForEvent("popup", { timeout: 20000 });
    await seedPage.locator("#open-sheet").click();
    const popup = await popupPromise;
    await popup.waitForLoadState("load");
    await ready(popup);
    const empty = await hook("view", undefined, popup);
    check("F: first open with no character: the builder opens", [empty.builder, empty.sheet], [true, false]);
    // The character is finished in this window's builder (not sent to the sheet).
    await popup.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, roomWorking.replace('"mode":"sheet"', '"mode":"builder"')]);
    await popup.reload({ waitUntil: "load" });
    await ready(popup);
    const later = await hook("view", undefined, popup);
    record.companion.push({ case: "Companion, first open with no character", steps: [
      { what: "first open", view: empty.sheet ? "sheet" : `builder: ${empty.label}` },
      { what: "reload with a finished character", view: later.sheet ? "sheet" : `builder: ${later.label} / ${later.title}`, windowMode: await hook("windowMode", undefined, popup) }] });
    check("F: ... a reload with a finished character keeps the builder (the landing was spent)", [later.builder, later.sheet], [true, false]);
    await popup.close();
    await seedPage.close();
  }
  });

  // -------------------------------------------------------------------------
  await part("G", "A window with an opener but another name is not a Companion tab (B11)", async () => {
  if (!roomWorking) {
    await fresh();
    await quickBuild("human", "gunslinger", "Room Tester");
    roomWorking = await hook("serialized");
  }
  const opener = await context.newPage();
  await opener.goto(`${baseUrl}owlbear/panel.html`, { waitUntil: "domcontentloaded" });
  await opener.evaluate(new Function(`
    localStorage.clear();
    localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(roomWorking.replace('"mode":"sheet"', '"mode":"builder"'))});
  `));
  const otherPromise = opener.waitForEvent("popup", { timeout: 20000 });
  await opener.evaluate((url) => { window.open(url, "some-other-window"); }, baseUrl);
  const other = await otherPromise;
  await other.waitForLoadState("load");
  await ready(other);
  const otherInfo = await other.evaluate(() => ({ hasOpener: Boolean(window.opener), name: window.name }));
  const otherView = await hook("view", undefined, other);
  record.companion.push({ case: "opener + other window name (B11)", steps: [{ what: "open", view: otherView.sheet ? "sheet" : `builder: ${otherView.label}`, windowMode: await hook("windowMode", undefined, other) }] });
  check("G: the window has an opener and another name", otherInfo, { hasOpener: true, name: "some-other-window" });
  check("G: it stays on the builder (never treated as a Companion tab)", [otherView.builder, otherView.sheet], [true, false]);
  check("G: it writes no Companion window memory", await hook("windowMode", undefined, other), null);
  // Switching modes in that window still writes nothing.
  await js("#builder-sheet-shortcut-top", other);
  await onSheet(other);
  await js("#return-to-builder", other);
  await onBuilder(other);
  check("G: going to the sheet and back there still writes no Companion window memory", await hook("windowMode", undefined, other), null);
  await other.close();
  await opener.close();
  });
  await context.close();
} finally {
  await browser?.close().catch(() => {});
  server?.child.kill();
  await writeFile(path.join(output, "results.json"), JSON.stringify({ sourceRoot, passed, failures, record }, null, 2)).catch(() => {});
}

console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.log(`Failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("Task 037 checks: PASS");
