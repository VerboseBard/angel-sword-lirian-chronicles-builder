// Task 042 checks: the final fix round before the pre-release gate.
//
// One lettered part per item, each in a real browser through the real app:
//   A. (items 1, 9, 10) The "Latest update" area is the owner's design: directly
//      under the rules-version selector, three short lines (Beta 3.0, the
//      selected rules version, the one-line summary) and a small button that
//      opens the full list in the builder's own popup. The rules line follows
//      the selector. The popup holds the full curated list (pinned here word for
//      word, with its count and heading) and closes three ways. The sidebar step
//      buttons sit no lower than on the live site. Phones show it too, compact.
//   B. (item 2)  Buying an item while carrying crafted copies of it charges for
//      one and adds one (crafted copies never count toward a purchase), on both
//      buy routes (inventory/shop Buy and the recipe's "buy requirement").
//   C. (item 3)  Remove on a crafted copy keeps the bought copy and its Clim.
//   D. (item 4)  The Blacksmith and Artificer specialty lists are filled.
//   E. (item 5)  Reset Session after a success clears the notes box only when it
//      still holds the notes that went onto the item.
//   F. (item 6)  The six top Current Build cards sit in one row at 1280 px; no
//      new sideways overflow at 1024 px; one column on a phone.
//   G. (item 11) The repo's own current-version lines say 3.0, not 2.13.
//   H. (item 12) The Lyrian symbol in the detail panel is drawn at its own size
//      (180 px), not stretched to the panel width; a portrait still fills it.
//   I. (item 13) Change Image says the new token picture loaded.
//   J. (item 14) The sheet's EXP card says what its number is: Banked EXP.
//   K. (item 15) Spend XP's Classes panel shows the character's own class, not
//      the catalog's first class (Abjurer), also for an older save.
// Item 7 (thin tests) is in test-033 part I and test-038 part L. Item 8 (notes
// wording) is pinned by part A.
//
// The real src/js is bundled in memory with a test-only hook block appended to
// ui.js (the test-033/038 pattern); nothing in the shipped source is altered.
//
// Run:  npm run test:042   (builds first)
// Env:  T42_PORT (default 4462); T42_SRC=<folder with src/js and index.html>
//       runs against another source tree (used to show the old code fails);
//       T42_ONLY=A,C limits parts.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.env.T42_SRC ? path.resolve(process.env.T42_SRC) : root;
const output = path.join(root, "qa-test-results/task-042-final-fixes");
await mkdir(output, { recursive: true });
const port = Number(process.env.T42_PORT || 4462);
const only = (process.env.T42_ONLY || "").split(",").map((entry) => entry.trim().toUpperCase()).filter(Boolean);

const STORAGE_KEY = "lyrian-chronicles-character-suite-v2";
const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// The owner's summary line (task 042 item 1) and the full curated list (task
// 039, reworded per the 039 audit in task 042 item 8). A later edit that drops
// or changes a line fails here (039 audit finding 5).
const EXPECTED_SUMMARY = "Multiple dice sets, Owlbear Rodeo connection, quality-of-life improvements.";
const EXPECTED_NOTES = [
  "The Owlbear Rodeo guide has buttons that copy the Companion and Dice install links.",
  "The Owlbear guide now teaches the token steps: Download Token Image, drag it onto the map, choose Character. Binding is optional.",
  "Send Character to Room now sends the stats, Clim and EXP your sheet shows.",
  "Open My Character Sheet is built to land on your play sheet when your character is finished.",
  "The 3D dice in Owlbear are built to let your clicks through. If a room blocks them, they turn off after one click.",
  "d100 rolls of 1 to 9 now show 00 on the tens die.",
  "New Quick Build: Gunslinger, with two pistols.",
  "Every Quick Build now spends all its EXP, skill points and spare Interlude Point.",
  "Quick Build with Human no longer drops you into Advanced Build on the Name step, and shows the Human picks before you continue.",
  "From the play sheet, the full builder opens with your character intact, never Quick Build.",
  "Characters loaded from a save slot open on Review and keep their current HP, Mana, RP and AP.",
  "The Current Build panel and Review show EXP spent and banked.",
  // Task 044c: live (3346d32) showed 1200 for a Human who spent all 1100 EXP in Advanced Build.
  "Humans who spend all 1100 EXP now show Spirit Core 1100, not 1200.",
  "Human bonus skills and Skill Training now allow Artifice, Appraise, Animal Husbandry and Survival.",
  "The Gunslinger's +1 initiative and the Vampire Lord's +1 Presence now count.",
  // Task 044c: live (3346d32) rolled a d20 for initiative.
  "Initiative now rolls 1d4 plus your bonus, as the 0.13.2 rules say, and never goes below 0.",
  // Task 044: "basics" (040 audit: the crafting actions are not built yet). Task 045: "each basic craft roll" (Beginner's Luck does not add the skill).
  "Crafting basics now follow the 0.13.2 rulebook: 5 dice, your skill on each basic craft roll, crafting HP to succeed.",
  "Alchemy crafts now make 3 of the item.",
  "Save slots now keep the Mirane start after a reload.",
  "Imports now list anything that did not match, instead of dropping it. Spreadsheet imports no longer lose your 18th item, and list any past the builder's 24.",
  // Task 044: task 043's two fixes (import/Load Saved keep every choice; Equip/Unequip refresh at once).
  "Import Character and Load Saved now keep every free skill point and choice: class picks, Skill Training and the Divine's Chosen god.",
  "Equip and Unequip on the play sheet now update Guard, Evasion, Dodge, Block, Initiative and skills at once.",
  "CCS exports now include armor and shield numbers and leave out temporary effects."
];
// Measured on the live site's code (3346d32) in headless Chromium at 1280 x 900:
// the old six-line list was 347 px tall and the first sidebar step button sat
// at 1,368 px (task 039 audit; task 042 report). The owner's design must not
// push the steps lower than that.
const LIVE_FIRST_STEP_TOP_1280 = 1368;
const PRE_039_LIST_HEIGHT_1280 = 347;

const failures = [];
let passed = 0;
const record = {};
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

// ---------------------------------------------------------------------------
// Test-only hooks, appended to ui.js in the in-memory bundle. Functions that
// only exist in the new code are guarded so the old code loads and fails check
// by check instead of crashing.
// ---------------------------------------------------------------------------
const hooks = `
window.__t42 = {
  state() { return JSON.parse(JSON.stringify(state)); },
  itemId(name) { return findRecordByName(lookup.items.entries, name)?.id || ""; },
  classId(name) { return findRecordByName(lookup.classes.entries, name)?.id || ""; },
  className(id) { return getClassDetail(id)?.name || ""; },
  firstCatalogClass() { return detailLookup.classes.entries[0]?.name || ""; },
  skillIndex(name) { return SKILL_DEFINITIONS.findIndex((definition) => definition.name === name) + 1; },
  funds() { return getStartingFundsState().availableClim; },
  install(spec = {}) {
    Object.entries(spec.skillPoints || {}).forEach(([name, points]) => { state.fields["SkillPoint" + this.skillIndex(name)] = String(points); });
    if (spec.classes) state.builder.selectedClassIds = spec.classes.map((name) => this.classId(name)).filter(Boolean);
    state.play = mergePlayState(state.play);
    (spec.tools || []).forEach((name) => state.play.inventoryItems.push({ uid: "t42:" + name, itemId: "", custom: true, equipped: false, quantity: 1, name, type: "Tool", subType: "", cost: "", burden: "", description: name }));
    (spec.inventory || []).forEach((entry) => state.play.inventoryItems.push(entry));
    Object.assign(state.play.crafting, spec.crafting || {});
    if (spec.fields) Object.assign(state.fields, spec.fields);
    if (spec.inspectedClass !== undefined) state.builder.inspected.class = spec.inspectedClass;
    state.ui.mode = "sheet";
    state.ui.playMode = spec.playMode || "crafting";
    persistWorkingState(false);
  },
  ownOfficial(name, quantity = 1) { const id = this.itemId(name); setBuilderItemQuantity(id, quantity); ensurePlayInventoryFromBuilder(); syncBuilderSelectionsIntoSheet(); persistWorkingState(false); renderPlayDashboard(); return id; },
  // The function behind every Buy button (inventory "Buy", crafting shop, tools).
  buy(name) { addOfficialInventoryItem(this.itemId(name), { confirmPurchase: true }); return document.getElementById("status-pill")?.textContent || ""; },
  // The 033b/038b audit's third buy path, the recipe's "buy requirement"
  // button. In the 0.13.2 data no recipe needs a craftable item (craftableCount
  // is 0), so a crafted copy of a material cannot happen there yet; the only
  // requirement that resolves to a priced item is Gourmet Cooking Stock's Food
  // Units. The check puts a crafted-style copy of it in the inventory, to pin
  // the guard for data where a material is craftable.
  craftableRequirement() {
    const recipes = lookup.items.entries.filter((entry) => entry.craftingType && entry.craftingType !== "-");
    let craftableCount = 0;
    let pick = null;
    for (const recipe of recipes) {
      for (const requirement of getRecipeRequirements(recipe)) {
        const material = findRecipeRequirementRecord(requirement);
        if (!material) continue;
        if (material.craftingType && material.craftingType !== "-") craftableCount += 1;
        if (!pick && parseClimCost(material.cost) > 0 && requirement.quantity >= 2 && getMaterialPackageQuantity(material, requirement) === 1) {
          pick = { recipeId: recipe.id, recipeName: recipe.name, materialId: material.id, materialName: material.name, quantity: requirement.quantity, unitCost: parseClimCost(material.cost) };
        }
      }
    }
    return pick ? { ...pick, craftableCount } : null;
  },
  requirementKey(recipeId, materialId) {
    const recipe = getCraftingRecipeById(recipeId);
    const inventory = getPlayInventoryEntries();
    const crafting = getCraftingTrackerState();
    return getRecipeRequirements(recipe).map((entry) => getRecipeRequirementState(entry, inventory, recipe, crafting)).find((entry) => entry.record?.id === materialId) || null;
  },
  specialties(skill) { return getSkillExpertiseOptionList(skill); },
  expertisePanelOptions(skill) {
    const entry = getSkillRowData(this.skillIndex(skill));
    const box = document.createElement("div");
    box.innerHTML = renderSkillExpertisePanelBody(entry);
    return [...box.querySelectorAll("[data-skill-expertise-name] option")].map((option) => option.textContent.trim());
  },
  inspectedClass() { return state.builder.inspected.class || ""; },
  gotoBuilderStep(id) { state.ui.builderStep = getBuilderStepIndex(id); renderBuilder(); return currentStep()?.id || ""; },
  detailTitle() { return (document.querySelector("#builder-detail-card h3")?.textContent || "").trim(); },
  setPortrait(dataUrl) { state.builder.portraitDataUrl = dataUrl; state.revision = (state.revision || 0) + 1; persistWorkingState(false); renderBuilder(); },
  view() { return { mode: state.ui.mode, stepId: currentStep()?.id || "", quickBuildActive: Boolean(state.ui.quickBuildActive), quickStep: state.ui.quickBuildStep }; },
  // Detail-panel picture: is it drawn at the picture's own size?
  detailFigure() {
    const figure = document.querySelector("#builder-detail-card .detail-figure");
    const img = figure?.querySelector("img");
    if (!figure || !img) return null;
    const box = img.getBoundingClientRect();
    const card = document.getElementById("builder-detail-card").getBoundingClientRect();
    return { src: img.getAttribute("src"), symbolClass: figure.classList.contains("detail-figure-symbol"), naturalWidth: img.naturalWidth, width: Math.round(box.width), height: Math.round(box.height), cardWidth: Math.round(card.width), complete: img.complete };
  }
};`;

const bundle = await build({
  absWorkingDir: sourceRoot,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "task042-test-access", setup(buildApi) {
    buildApi.onLoad({ filter: /[/\\]src[/\\]js[/\\]ui\.js$/ }, async ({ path: file }) => ({
      contents: await readFile(file, "utf8") + hooks, loader: "js"
    }));
  } }]
});
// Under T42_SRC the page, the stylesheet and the notes module come from that
// tree too, so the old code is judged as a whole.
const sourceIndex = await readFile(path.join(sourceRoot, "index.html"), "utf8");
const sourceCss = await readFile(path.join(sourceRoot, "src/css/main.css"), "utf8");

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
  // Part G reads files only; run it first.
  if (!only.length || only.includes("G")) {
    section("G. The repo's own current-version lines say Beta 3.0 (item 11)");
    const read = (name) => readFile(path.join(sourceRoot, name), "utf8").catch(() => "");
    const pkg = JSON.parse(await read("package.json") || "{}");
    const lock = JSON.parse(await read("package-lock.json") || "{}");
    check("G: package.json version is 3.0.0", pkg.version, "3.0.0");
    check("G: package.json description names Beta 3.0", [String(pkg.description).includes("Beta 3.0"), String(pkg.description).includes("2.13")], [true, false]);
    check("G: package-lock.json follows the package version", [lock.version, lock.packages?.[""]?.version], ["3.0.0", "3.0.0"]);
    const workflow = await read(".github/workflows/deploy-pages.yml");
    check("G: the GitHub Pages workflow is named for Beta 3.0", workflow.split(/\r?\n/)[0], "name: Deploy Beta 3.0 Web");
    const versionTxt = (await read("VERSION.txt")).split(/\r?\n/);
    check("G: VERSION.txt states 3.0 as the current build, not 2.13", [versionTxt.some((line) => /Beta 3\.0/.test(line)), versionTxt.slice(0, 3).some((line) => /2\.13/.test(line))], [true, false]);
    const readme = (await read("README.md")).split(/\r?\n/);
    check("G: README.md line 5 names Beta 3.0 as the standard public web build", [readme[4]?.includes("Beta 3.0 is the standard public web build"), readme[4]?.includes("2.13")], [true, false]);
    const testers = (await read("README - Beta Testers.txt")).split(/\r?\n/);
    check("G: 'README - Beta Testers.txt' names Beta 3.0 in its title and current-build lines", [testers[0]?.includes("Beta 3.0"), testers[6]?.includes("Beta 3.0"), [testers[0], testers[6]].some((line) => /2\.13/.test(line || ""))], [true, true, false]);
    // The page itself: the tab title and the summary's version line agree.
    const title = /<title>([^<]*)<\/title>/.exec(sourceIndex)?.[1] || "";
    check("G: the browser tab title names Beta 3.0", title.endsWith("Beta 3.0"), true);
  }

  // Part A pins the notes module itself before the browser runs.
  const notesModule = await import(pathToFileURL(path.join(sourceRoot, "src/js/release-notes.js")).href).catch(() => ({}));
  if (!only.length || only.includes("A")) {
    section("A0. The notes module (items 8 and 9)");
    check("A0: the summary line is the owner's words", notesModule.APP_RELEASE_SUMMARY, EXPECTED_SUMMARY);
    check(`A0: the full list has ${EXPECTED_NOTES.length} lines`, (notesModule.APP_RELEASE_NOTES || []).length, EXPECTED_NOTES.length);
    check("A0: the full list, word for word", [...(notesModule.APP_RELEASE_NOTES || [])], EXPECTED_NOTES);
    check("A0: nothing planned is announced (no 'soon', 'will', 'coming', 'planned')", EXPECTED_NOTES.filter((line) => /\b(soon|will|coming|planned)\b/i.test(line)), []);
  }

  server = await startServer();
  const baseUrl = server.url;
  browser = await chromium.launch();
  const makeContext = async (options) => {
    const context = await browser.newContext({ acceptDownloads: true, ...options });
    await context.route("**/assets/app.bundle.js*", (route) => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await context.route(/\/index\.html(\?.*)?$|\/(\?.*)?$/, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/" || url.pathname.endsWith("/index.html")) {
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: sourceIndex });
      }
      return route.continue();
    });
    await context.route("**/src/css/main.css*", (route) => route.fulfill({ contentType: "text/css; charset=utf-8", body: sourceCss }));
    await context.route("**/api/vtt-relay/events*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, boot: "t42", seq: 0, events: [] }) }));
    return context;
  };
  const context = await makeContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("dialog", (dialog) => dialog.accept());

  const ready = async (target = page) => {
    await target.waitForFunction(() => window.__t42 && window.LYRIAN_DATA?.version && (document.getElementById("builder-step-content")?.innerHTML || "").length > 100, null, { timeout: 20000 });
    await target.waitForTimeout(1500); // the production idle sheet build
  };
  const fresh = async (target = page) => {
    await target.goto(baseUrl, { waitUntil: "load" });
    await target.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await target.reload({ waitUntil: "load" });
    await ready(target);
  };
  const reload = async () => { await page.reload({ waitUntil: "load" }); await ready(); };
  const js = (selector, target = page) => target.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) throw new Error("missing " + sel);
    element.click();
  }, selector);
  const hook = (name, ...args) => page.evaluate(([fn, list]) => window.__t42[fn](...list), [name, args]);
  const state = () => hook("state");
  const statusText = () => page.evaluate(() => document.getElementById("status-pill")?.textContent || document.getElementById("builder-status-pill")?.textContent || "");
  const onSheet = () => page.waitForSelector("#sheet-view:not(.is-hidden) #play-hit-points .play-hit-current", { timeout: 15000, state: "attached" });
  const onBuilder = () => page.waitForSelector("#builder-view:not(.is-hidden)", { timeout: 15000 });
  const part = async (letter, title, fn) => {
    if (only.length && !only.includes(letter)) return;
    section(`${letter}. ${title}`);
    try {
      await fn();
    } catch (error) {
      failures.push(`${letter}: part stopped early`);
      const where = String(error.stack || "").split("\n").filter((line) => line.includes("test-042-final-fixes.mjs")).slice(0, 3).map((line) => line.trim().replace(/^at /, "").replace(/\(.*test-042-final-fixes\.mjs:/, "(line ")).join(" <- ");
      console.log(`  FAIL ${letter}: part stopped early: ${String(error.message || error).split("\n")[0]}${where ? `\n       at ${where}` : ""}`);
    }
  };

  // The Latest update area as the page draws it.
  const readSummary = (target = page) => target.evaluate(() => {
    const box = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { top: Math.round(rect.top + scrollY), bottom: Math.round(rect.bottom + scrollY), left: Math.round(rect.left), right: Math.round(rect.right), height: Math.round(rect.height), shown: style.display !== "none" && style.visibility !== "hidden" && rect.height > 0 };
    };
    const summary = document.querySelector("[data-latest-update-summary]");
    const visibleText = (node) => (node?.innerText || "").replace(/\s+/g, " ").trim();
    return {
      summary: box(summary),
      select: box(document.getElementById("game-version-select")),
      learn: box(document.querySelector(".version-learn-link")),
      learnHref: document.querySelector(".version-learn-link")?.getAttribute("href") || "",
      version: visibleText(summary?.querySelector(".builder-build-version strong")),
      versionBox: box(summary?.querySelector(".builder-build-version")),
      rules: visibleText(summary?.querySelector("[data-latest-update-rules]")),
      rulesBox: box(summary?.querySelector("[data-latest-update-rules]")),
      line: visibleText(summary?.querySelector("[data-latest-update-line]")),
      lineBox: box(summary?.querySelector("[data-latest-update-line]")),
      button: visibleText(summary?.querySelector("[data-latest-update-open]")),
      buttonBox: box(summary?.querySelector("[data-latest-update-open]")),
      sidebarListItems: document.querySelectorAll(".version-manager li").length,
      versionManager: box(document.querySelector(".version-manager")),
      firstStep: box(document.querySelector("#builder-step-nav button")),
      statusPill: box(document.getElementById("builder-status-pill")),
      selectValue: document.getElementById("game-version-select")?.value || "",
      title: document.title,
      docWidth: document.documentElement.scrollWidth,
      innerWidth
    };
  });
  const readPopup = (target = page) => target.evaluate(() => {
    const modal = document.getElementById("sheet-modal");
    return {
      open: Boolean(modal && !modal.hidden && !modal.classList.contains("is-hidden")),
      eyebrow: (document.getElementById("sheet-modal-eyebrow")?.textContent || "").trim(),
      title: (document.getElementById("sheet-modal-title")?.textContent || "").trim(),
      lead: (document.getElementById("sheet-modal-lead")?.textContent || "").trim(),
      items: [...document.querySelectorAll("#sheet-modal-content [data-release-notes-list] li")].map((li) => li.textContent.trim()),
      headings: [...document.querySelectorAll("#sheet-modal-content [data-release-notes-list] h3, #sheet-modal-content [data-release-notes-list] h4")].map((node) => node.textContent.trim()),
      closeButton: Boolean(document.querySelector("#sheet-modal-content [data-release-notes-list] [data-sheet-modal-close]")),
      builderShown: !document.getElementById("builder-view").classList.contains("is-hidden")
    };
  });
  const openPopup = async (target = page) => {
    const present = await target.locator("[data-latest-update-open]").count();
    if (!present) throw new Error("no 'See full update list' button");
    await target.locator("[data-latest-update-open]").click();
    await target.waitForSelector("#sheet-modal:not([hidden]) [data-release-notes-list]", { timeout: 5000 });
  };

  // -------------------------------------------------------------------------
  await part("A", "Latest update: three short lines under the selector, full list in a popup (items 1, 9, 10)", async () => {
    await fresh();
    const desk = await readSummary();
    record.desktop1280 = desk;
    check("A: the summary block is in the version box", Boolean(desk.summary), true);
    check("A: it sits directly under the rules-version selector, above Learn How to Play", Boolean(desk.summary && desk.select && desk.learn && desk.summary.top >= desk.select.bottom && desk.summary.top - desk.select.bottom <= 12 && desk.learn.top >= desk.summary.bottom), true);
    check("A: line 1 is our version, Beta 3.0", desk.version, "Beta 3.0");
    check("A: line 2 is the selected rules version", desk.rules, "Rules 0.13.2");
    check("A: line 3 is the owner's summary", desk.line, EXPECTED_SUMMARY);
    check("A: the three lines are stacked in that order", Boolean(desk.versionBox && desk.rulesBox && desk.lineBox && desk.versionBox.bottom <= desk.rulesBox.top + 1 && desk.rulesBox.bottom <= desk.lineBox.top + 1), true);
    check("A: a small button under them opens the full list", [desk.button, Boolean(desk.buttonBox?.shown && desk.lineBox && desk.buttonBox.top >= desk.lineBox.bottom), desk.buttonBox ? desk.buttonBox.height <= 34 : false], ["See full update list", true, true]);
    check("A: no long list in the sidebar any more", desk.sidebarListItems, 0);
    check("A: the version line matches the browser tab title", desk.title.endsWith(desk.version) && desk.version !== "", true);
    check("A: Learn How to Play is still there, same link", [Boolean(desk.learn?.shown), desk.learnHref], [true, "https://clio.angelssword.com/#"]);
    check(`A: the summary block is no taller than the old pre-039 list (${PRE_039_LIST_HEIGHT_1280} px)`, desk.summary ? desk.summary.height <= PRE_039_LIST_HEIGHT_1280 : false, true);
    check(`A: the first sidebar step button sits no lower than on the live site (${LIVE_FIRST_STEP_TOP_1280} px at 1280)`, desk.firstStep ? desk.firstStep.top <= LIVE_FIRST_STEP_TOP_1280 : false, true);
    check("A: no sideways scroll at 1280", desk.docWidth <= desk.innerWidth, true);
    // The rules line follows the selector, both ways, through the real control.
    await page.selectOption("#game-version-select", "0.12.5");
    await page.waitForFunction(() => window.LYRIAN_DATA?.version === "0.12.5", null, { timeout: 20000 });
    await page.waitForTimeout(600);
    const older = await readSummary();
    check("A: switching the selector to 0.12.5 changes line 2 to 'Rules 0.12.5'", [older.selectValue, older.rules], ["0.12.5", "Rules 0.12.5"]);
    check("A: the version and summary lines do not change with the rules", [older.version, older.line], ["Beta 3.0", EXPECTED_SUMMARY]);
    await openPopup();
    check(`A: under rules 0.12.5 the popup still lists the same ${EXPECTED_NOTES.length} lines (our notes, not the rules' news)`, (await readPopup()).items, EXPECTED_NOTES);
    await page.click("#sheet-modal-close");
    await page.selectOption("#game-version-select", "0.13.2");
    await page.waitForFunction(() => window.LYRIAN_DATA?.version === "0.13.2", null, { timeout: 20000 });
    await page.waitForTimeout(600);
    check("A: switching back gives 'Rules 0.13.2'", (await readSummary()).rules, "Rules 0.13.2");
    // The popup: the builder's own dialog, the full list, three ways to close.
    await openPopup();
    const popup = await readPopup();
    record.popup = popup;
    check("A: the button opens the builder's dialog", popup.open, true);
    check("A: the dialog is headed 'Latest update' (one heading, as before)", [popup.title, popup.headings], ["Latest update", []]);
    check("A: it names the builder version and repeats the summary", [popup.eyebrow, popup.lead], ["Builder Beta 3.0", EXPECTED_SUMMARY]);
    check(`A: it holds the full curated list, ${EXPECTED_NOTES.length} lines, word for word`, popup.items, EXPECTED_NOTES);
    check("A: it has a Close button, and the player stays in the builder", [popup.closeButton, popup.builderShown], [true, true]);
    check("A: keyboard focus moves into the dialog", await page.evaluate(() => document.activeElement?.id || ""), "sheet-modal-close");
    await page.screenshot({ path: path.join(output, "a-popup-1280.png") });
    await page.click("#sheet-modal-close");
    check("A: the x button closes it", (await readPopup()).open, false);
    await openPopup();
    await page.click("#sheet-modal-content [data-release-notes-list] [data-sheet-modal-close]");
    check("A: the Close button closes it", (await readPopup()).open, false);
    await openPopup();
    await page.keyboard.press("Escape");
    check("A: Escape closes it", (await readPopup()).open, false);
    const afterClose = await hook("view");
    check("A: after closing, the builder is unchanged (same step, still the builder)", [afterClose.mode, afterClose.stepId, afterClose.quickBuildActive], ["builder", "race", false]);

    // 1920 wide and a phone, each in its own window.
    for (const [width, height, label, mobile] of [[1920, 1080, "1920", false], [768, 1024, "768", false], [390, 844, "phone-390", true]]) {
      const ctx = await makeContext({ viewport: { width, height }, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
      const other = await ctx.newPage();
      other.on("pageerror", (error) => pageErrors.push(`${label}: ${error}`));
      other.on("dialog", (dialog) => dialog.accept());
      await fresh(other);
      const shot = await readSummary(other);
      record[`summary${label}`] = shot;
      check(`A (${label}): the summary shows, under the selector`, Boolean(shot.summary?.shown && shot.select && shot.summary.top >= shot.select.bottom), true);
      check(`A (${label}): the three lines and the button show`, [shot.version, shot.rules, shot.line, shot.button, Boolean(shot.versionBox?.shown && shot.rulesBox?.shown && shot.lineBox?.shown && shot.buttonBox?.shown)], ["Beta 3.0", "Rules 0.13.2", EXPECTED_SUMMARY, "See full update list", true]);
      check(`A (${label}): no sideways scroll`, shot.docWidth <= shot.innerWidth, true);
      if (mobile) {
        check("A (phone): compact, the block is at most 100 px tall", shot.summary ? shot.summary.height <= 100 : false, true);
        check("A (phone): the button is in the first row, beside Beta 3.0 and the rules", Boolean(shot.buttonBox && shot.versionBox && Math.abs(shot.buttonBox.top - shot.versionBox.top) <= 12), true);
      } else {
        check(`A (${label}): the first step button sits no lower than on the live site at 1280`, shot.firstStep ? shot.firstStep.top <= LIVE_FIRST_STEP_TOP_1280 : false, true);
      }
      await openPopup(other);
      const phonePopup = await readPopup(other);
      check(`A (${label}): the popup opens with the ${EXPECTED_NOTES.length} lines`, [phonePopup.open, phonePopup.items.length], [true, EXPECTED_NOTES.length]);
      await other.screenshot({ path: path.join(output, `a-popup-${label}.png`) });
      await other.locator("#sheet-modal-close").click();
      check(`A (${label}): and closes`, (await readPopup(other)).open, false);
      await ctx.close();
    }
  });

  // -------------------------------------------------------------------------
  const ALL_CRAFTERS = {
    classes: ["Alchemist", "Armorsmith", "Artificer", "Blacksmith", "Carpenter", "Culinarian"],
    tools: ["Alchemist's Alembic", "Smith's Hammer", "Artificer's Multitool", "Carpenter's Chisel", "Frying Pan"]
  };
  const install = async (spec) => {
    await fresh();
    await page.evaluate((value) => window.__t42.install(value), spec);
    await reload();
    if ((spec.playMode || "crafting") === "crafting") {
      await page.waitForSelector("#play-crafting:not([hidden])", { timeout: 8000 });
    } else {
      await onSheet();
    }
  };
  const gotoStep = (index) => js(`#play-crafting [data-crafting-wizard-goto="${index}"]`);
  const selectRecipe = (id) => js(`#play-crafting [data-crafting-select-recipe="${id}"]`);
  const fillCraftingField = (field, value) => page.locator(`#play-crafting [data-crafting-field="${field}"]`).first().fill(String(value));
  const SUCCESS = '#play-crafting [data-crafting-action="craft-success"]';
  const RESET = '#play-crafting [data-crafting-action="reset-session"]';
  // Craft one recipe through the real wizard: points, then Craft Succeeded.
  const craft = async (recipeId, points = 50) => {
    await gotoStep(0); await selectRecipe(recipeId); await gotoStep(3);
    await fillCraftingField("pendingPointSpend", points);
    await js('#play-crafting [data-crafting-action="add-points"]');
    await gotoStep(4);
    const ready = await page.evaluate((sel) => { const node = document.querySelector(sel); return Boolean(node && !node.disabled); }, SUCCESS);
    if (!ready) throw new Error("Craft Succeeded is locked");
    await page.click(SUCCESS);
  };
  const stacks = async (itemId) => {
    const sheet = await state();
    return {
      bought: sheet.play.inventoryItems.filter((entry) => entry.uid === "official:" + itemId).map((entry) => entry.quantity),
      crafted: sheet.play.inventoryItems.filter((entry) => String(entry.uid).startsWith("crafted:") && entry.itemId === itemId).map((entry) => entry.quantity),
      builder: [sheet.builder.selectedItemIds.includes(itemId), sheet.builder.itemQuantities?.[itemId] ?? null]
    };
  };

  await part("B", "Buying while carrying crafted copies charges for one and adds one (item 2)", async () => {
    await install({ ...ALL_CRAFTERS, skillPoints: { Alchemy: 2 }, crafting: { craftingWizardStep: 0 } });
    const elixir = await hook("itemId", "Axolotl Elixir");
    await craft(elixir);
    check("B setup: crafting makes a stack of 3 Axolotl Elixirs, nothing bought", await stacks(elixir), { bought: [], crafted: [3], builder: [false, null] });
    const before = await hook("funds");
    const status = await hook("buy", "Axolotl Elixir");
    const afterOne = await hook("funds");
    record.buyAfterCraft = { before, afterOne, status };
    check("B: buying one Elixir adds ONE bought copy; the 3 crafted stay a separate stack", await stacks(elixir), { bought: [1], crafted: [3], builder: [true, 1] });
    check("B: and charges the price of one (500 Clim), not four", before - afterOne, 500);
    check("B: the status line says one was bought, not 'Quantity: 4'", [status.includes("Purchased Axolotl Elixir for 500 Clim."), /Quantity: 4/.test(status)], [true, false]);
    await hook("buy", "Axolotl Elixir");
    check("B: buying a second adds to the bought stack only (x2), 1,000 Clim in all", [await stacks(elixir), before - await hook("funds")], [{ bought: [2], crafted: [3], builder: [true, 2] }, 1000]);
    // The recipe's own "buy requirement" route: a material that is itself a
    // craftable item, with one crafted copy already carried.
    const pick = await hook("craftableRequirement");
    record.requirementPick = pick;
    check("B setup: a recipe needs 2 or more of a priced item (the fixture for the buy-requirement route)", Boolean(pick), true);
    if (pick) {
      await install({ ...ALL_CRAFTERS, crafting: { craftingWizardStep: 0 }, inventory: [{ uid: "crafted:t42:one", itemId: pick.materialId, custom: true, equipped: false, quantity: 1, name: pick.materialName, type: "Crafted Item", subType: "", cost: "", burden: "", description: "Crafted by this character." }] });
      await gotoStep(0); await selectRecipe(pick.recipeId); await gotoStep(1);
      const requirement = await hook("requirementKey", pick.recipeId, pick.materialId);
      check(`B: the recipe needs ${pick.quantity} ${pick.materialName}; the crafted-style copy covers 1`, [requirement?.have, requirement?.need, requirement?.packagesNeeded], [1, pick.quantity - 1, pick.quantity - 1]);
      const fundsBefore = await hook("funds");
      await page.evaluate((key) => {
        const button = [...document.querySelectorAll("#play-crafting [data-crafting-purchase-requirement]")].find((node) => node.dataset.craftingPurchaseRequirement === key);
        if (!button) throw new Error("no buy button for " + key);
        button.click();
      }, requirement.customCostKey);
      check(`B: buying the missing ${pick.quantity - 1} adds exactly that many bought (the crafted-style copy is not added in)`, await stacks(pick.materialId), { bought: [pick.quantity - 1], crafted: [1], builder: [true, pick.quantity - 1] });
      check("B: and charges for exactly those", fundsBefore - await hook("funds"), pick.unitCost * (pick.quantity - 1));
    }
  });

  await part("C", "Remove on a crafted copy keeps the bought copy and its Clim (item 3)", async () => {
    await install({ ...ALL_CRAFTERS, skillPoints: { Alchemy: 2 }, crafting: { craftingWizardStep: 0 } });
    const elixir = await hook("itemId", "Axolotl Elixir");
    await hook("buy", "Axolotl Elixir");
    const afterBuy = await hook("funds");
    await craft(elixir);
    check("C setup: one bought Elixir and a crafted stack of 3", await stacks(elixir), { bought: [1], crafted: [3], builder: [true, 1] });
    await js('[data-play-mode="combat"]');
    await js('[data-play-tab="inventory"]');
    const craftedUid = (await state()).play.inventoryItems.find((entry) => String(entry.uid).startsWith("crafted:")).uid;
    await page.evaluate((uid) => {
      const button = [...document.querySelectorAll("#play-inventory [data-inventory-remove]")].find((node) => node.dataset.inventoryRemove === uid);
      if (!button) throw new Error("no Remove button for the crafted row");
      button.click();
    }, craftedUid);
    check("C: Remove on the crafted row removes only the crafted stack; the bought copy stays", await stacks(elixir), { bought: [1], crafted: [], builder: [true, 1] });
    check("C: no Clim comes back for the bought copy", await hook("funds"), afterBuy);
    // Removing the bought row still works as before (and gives its Clim back).
    await page.evaluate((uid) => document.querySelector(`#play-inventory [data-inventory-remove="${uid}"]`).click(), "official:" + elixir);
    check("C: Remove on the bought row still removes it from the builder, as before", await stacks(elixir), { bought: [], crafted: [], builder: [false, null] });
    check("C: and its 500 Clim come back, as before", (await hook("funds")) - afterBuy, 500);
  });

  await part("D", "Blacksmith and Artificer specialty lists are filled (item 4)", async () => {
    await fresh();
    const smith = await hook("specialties", "Blacksmith");
    const artificer = await hook("specialties", "Artificer");
    check("D: Blacksmith suggests its 17 specialties", [smith.length, smith[0], smith.includes("Longsword")], [17, "Small Weapons", true]);
    check("D: Artificer suggests its 8 specialties", [artificer.length, artificer[0], artificer.includes("Sniper Rifle")], [8, "Pistol", true]);
    check("D: the old names still find the same lists (aliases)", [(await hook("specialties", "Blacksmithing")).length, (await hook("specialties", "Artificing")).length], [17, 8]);
    const panel = await hook("expertisePanelOptions", "Blacksmith");
    check("D: the real expertise panel's menu for Blacksmith lists them between 'Select expertise...' and 'Custom'", [panel.length, panel[0], panel[1], panel[panel.length - 1]], [19, "Select expertise...", "Small Weapons", "Custom / DM-approved..."]);
    check("D: same for Artificer", (await hook("expertisePanelOptions", "Artificer")).length, 10);
    check("D: Alchemy is unchanged (5)", (await hook("specialties", "Alchemy")).length, 5);
  });

  await part("E", "Reset Session keeps notes typed for a new recipe after a success (item 5)", async () => {
    await install({ ...ALL_CRAFTERS, skillPoints: { Carpentry: 5, Alchemy: 2 }, crafting: { craftingWizardStep: 0 } });
    const bow = await hook("itemId", "Bow (Two-Handed)");
    const elixir = await hook("itemId", "Axolotl Elixir");
    const typeNotes = async (text) => {
      await gotoStep(4);
      await page.locator('#play-crafting summary:has-text("Mods, Alloys, and Session Notes")').click();
      await page.locator('#play-crafting [data-crafting-field="selectedMods"]').fill(text);
    };
    const crafting = async () => (await state()).play.crafting;
    // A success with notes A.
    await gotoStep(0); await selectRecipe(bow); await gotoStep(3);
    await fillCraftingField("pendingPointSpend", 30);
    await js('#play-crafting [data-crafting-action="add-points"]');
    await typeNotes("Recurve A");
    await page.click(SUCCESS);
    check("E setup: the bow carries notes A and the outcome remembers them", [(await crafting()).lastCraftOutcome?.type, (await crafting()).lastCraftOutcome?.modNotes], ["success", "Recurve A"]);
    // The audit's steps: pick another recipe, type notes B, roll once, Reset Session on the Roll step.
    await gotoStep(0); await selectRecipe(elixir);
    await typeNotes("Potion B");
    await gotoStep(3);
    await page.evaluate(() => {
      const original = Math.random; Math.random = () => 0.45;
      try { document.querySelector('#play-crafting [data-crafting-action="roll-die"]').click(); } finally { Math.random = original; }
    });
    await js(RESET);
    check("E: notes B, typed for the new recipe, survive Reset Session", (await crafting()).selectedMods, "Potion B");
    check("E: and the log does not claim they went onto the crafted item", (await state()).play.log[0]?.lines.some((line) => line.includes("The mod notes went onto the crafted item")), false);
    // Unchanged: the notes that DID go onto the item are still cleared.
    await gotoStep(0); await selectRecipe(bow); await gotoStep(3);
    await fillCraftingField("pendingPointSpend", 30);
    await js('#play-crafting [data-crafting-action="add-points"]');
    await typeNotes("Recurve C");
    await page.click(SUCCESS);
    await gotoStep(3);
    await js(RESET);
    check("E: notes that went onto the item are cleared by Reset Session, as in 033b", (await crafting()).selectedMods, "");
    check("E: and the log says so", (await state()).play.log[0]?.lines.some((line) => line.includes("The mod notes went onto the crafted item")), true);
    // An older save: a success record with no saved notes clears nothing.
    await install({ ...ALL_CRAFTERS, skillPoints: { Carpentry: 5 }, crafting: { craftingWizardStep: 4, selectedRecipeId: bow, selectedMods: "Typed before the update", lastCraftOutcome: { type: "success", recipeId: bow, recipeName: "Bow (Two-Handed)", at: "2026-09-16T00:00:00.000Z", snapshot: { inventoryItems: [], selectedItemIds: [], itemQuantities: {}, earnedClim: "" } } } });
    await js(RESET);
    check("E: an older success record (no saved notes) keeps the typed notes", (await crafting()).selectedMods, "Typed before the update");
  });

  // -------------------------------------------------------------------------
  await part("F", "Current Build: the six top cards in one row at 1280 (item 6)", async () => {
    const rows = async (width, height = 900, mobile = false) => {
      const ctx = await makeContext({ viewport: { width, height }, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
      const other = await ctx.newPage();
      other.on("pageerror", (error) => pageErrors.push(`F ${width}: ${error}`));
      await fresh(other);
      const result = await other.evaluate(() => {
        const grid = document.getElementById("builder-summary");
        const cards = [...grid.querySelectorAll(".summary-card")].map((card) => ({ title: card.querySelector("strong")?.textContent.trim(), top: Math.round(card.getBoundingClientRect().top), width: Math.round(card.getBoundingClientRect().width) }));
        const top = cards.filter((card) => card.title !== "Equipment");
        return { rows: new Set(top.map((card) => card.top)).size, titles: top.map((card) => card.title), widths: top.map((card) => card.width), gridOverflow: grid.scrollWidth - grid.clientWidth, docWidth: document.documentElement.scrollWidth, innerWidth };
      });
      if (width === 1280) {
        const box = await other.locator(".builder-stage-summary").boundingBox();
        await other.screenshot({ path: path.join(output, "f-current-build-1280.png"), clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 600) } });
      }
      await ctx.close();
      return result;
    };
    const at1280 = await rows(1280);
    const at1920 = await rows(1920, 1080);
    const at1024 = await rows(1024, 768);
    const at768 = await rows(768, 1024);
    const phone = await rows(390, 844, true);
    record.currentBuildRows = { at1280, at1920, at1024, at768, phone };
    check("F: at 1280 the six top cards (Skills included) are in one row", [at1280.titles.length, at1280.rows], [6, 1]);
    check("F: at 1920 too", at1920.rows, 1);
    check("F: at 1280 each card is still at least 120 px wide", at1280.widths.every((width) => width >= 120), true);
    check("F: at 1024 and 768 the cards do not overflow their panel (five columns stay)", [at1024.gridOverflow <= 0, at768.gridOverflow <= 0], [true, true]);
    check("F: at 1024 the page is no wider than before this task (26 px, an older overflow)", at1024.docWidth - at1024.innerWidth <= 26, true);
    check("F: on a phone the cards stack in one column", phone.rows, 6);
  });

  // -------------------------------------------------------------------------
  const quickBuild = async (speciesId, buildId, name = "") => {
    await js("#quick-build-entry");
    await js(`[data-quick-build-action="select-species"][data-id="${speciesId}"]`);
    await js("#builder-next");
    if (name) await page.fill("#builder-name-header", name);
    await js("#builder-next");
    await js(`[data-quick-build-action="select-build"][data-id="${buildId}"]`);
    await js("#builder-next");
    await js("#builder-next"); // Use This Character
    await onSheet();
  };

  await part("H", "The Lyrian symbol in the detail panel at its own size (item 12)", async () => {
    await fresh();
    await js("#quick-build-entry");
    await js('[data-quick-build-action="select-species"][data-id="human"]');
    await js("#builder-next");
    await page.waitForFunction(() => window.__t42.view().quickStep === 1);
    await page.waitForFunction(() => document.querySelector("#builder-detail-card .detail-figure img")?.complete);
    const nameStep = await hook("detailFigure");
    record.symbolName = nameStep;
    const atOwnSize = (figure) => Boolean(figure && figure.src.endsWith("lyrian-symbol.png") && figure.symbolClass && figure.width <= 180 && figure.width <= figure.naturalWidth && figure.width < figure.cardWidth * 0.75);
    check("H: Quick Build Name step: the symbol is drawn at its own size (at most 180 px), not panel-wide", atOwnSize(nameStep), true);
    await page.screenshot({ path: path.join(output, "h-symbol-name-step-1280.png") });
    await page.fill("#builder-name-header", "Symbol Tester");
    await js("#builder-next");
    await js('[data-quick-build-action="select-build"][data-id="gunslinger"]');
    await js("#builder-next");
    await page.waitForFunction(() => window.__t42.view().quickStep === 3);
    await page.waitForFunction(() => document.querySelector("#builder-detail-card .detail-figure img")?.complete);
    const review = await hook("detailFigure");
    record.symbolReview = review;
    check("H: Review Quick Build: the same", atOwnSize(review), true);
    await page.screenshot({ path: path.join(output, "h-symbol-review-1280.png") });
    await js("#builder-next"); // Use This Character
    await onSheet();
    await js("#return-to-builder");
    await onBuilder();
    await page.waitForFunction(() => document.querySelector("#builder-detail-card .detail-figure img")?.complete);
    check("H: Advanced Review ('Ready to Continue'), where the Lyrian symbol lands: the same", atOwnSize(await hook("detailFigure")), true);
    // A real picture still fills the panel as before.
    await js('[data-step-index="2"]');
    await hook("setPortrait", `data:image/png;base64,${ONE_PIXEL_PNG}`);
    await page.waitForTimeout(300);
    const portrait = await hook("detailFigure");
    check("H: a portrait on the Profile step still fills the panel (no symbol sizing)", Boolean(portrait && !portrait.symbolClass && portrait.width >= portrait.cardWidth * 0.9), true);
  });

  await part("I", "Change Image says the new token picture loaded (item 13)", async () => {
    await fresh();
    await quickBuild("human", "gunslinger", "Token Tester");
    await js('[data-play-mode="table"]');
    await js('[data-table-tool-guide="owlbear"]');
    await page.waitForSelector("#sheet-modal:not([hidden]) .owlbear-setup-guide");
    const feedback = () => page.evaluate(() => {
      const node = document.querySelector("[data-owlbear-token-feedback]");
      const buttons = document.querySelector("[data-owlbear-token-change]")?.closest(".sheet-modal-form-actions");
      return node ? { text: node.textContent.trim(), nearButtons: Boolean(buttons && node.previousElementSibling === buttons), live: node.getAttribute("aria-live") } : null;
    });
    check("I: before a picture, the line under the token buttons is empty", (await feedback())?.text, "");
    await page.setInputFiles("#owlbear-token-file", { name: "my-token.png", mimeType: "image/png", buffer: Buffer.from(ONE_PIXEL_PNG, "base64") });
    await page.waitForFunction(() => (document.querySelector("[data-owlbear-token-feedback]")?.textContent || "").trim().length > 0, null, { timeout: 5000 }).catch(() => {});
    const after = await feedback();
    record.tokenFeedback = after;
    check("I: after Change Image, one short line says it loaded, with the file name", after?.text, "Loaded token picture my-token.png.");
    check("I: the line sits right under the Change Image / Lock Token buttons and is announced", [after?.nearButtons, after?.live], [true, "polite"]);
    check("I: the status line says the same, as Add portrait does ('Loaded portrait ...')", (await statusText()).trim(), "Loaded token picture my-token.png.");
    check("I: the 'No picture yet' line is gone (task 038, unchanged)", await page.evaluate(() => document.querySelector("[data-owlbear-token-missing]")?.classList.contains("is-hidden")), true);
    await page.screenshot({ path: path.join(output, "i-change-image-1280.png") });
    await page.keyboard.press("Escape");
  });

  await part("J", "The sheet's EXP card says Banked EXP (item 14)", async () => {
    await fresh();
    await quickBuild("human", "gunslinger", "Exp Label");
    const card = () => page.evaluate(() => {
      const node = document.querySelector("#play-derived-grid .play-tracker-progression");
      return node ? { label: node.querySelector("strong")?.textContent.trim(), value: node.querySelector(".play-derived-value")?.textContent.trim(), summary: node.querySelector("p")?.textContent.trim(), spend: Boolean(node.querySelector("[data-open-exp-spending]")) } : null;
    });
    const fresh0 = await card();
    record.expCard = fresh0;
    check("J: the card's label says what the number is: 'Banked EXP'", fresh0?.label, "Banked EXP");
    check("J: the number is unchanged (0 banked after Quick Build spends all EXP), with Spend XP and the same summary", [fresh0?.value, fresh0?.spend, fresh0?.summary], ["0", true, "Unspent EXP available for progression. Spending it through upgrades increases Spirit Core."]);
    check("J: Spirit Core beside it is unchanged", await page.evaluate(() => [...document.querySelectorAll("#play-derived-grid .play-derived-card")].map((node) => node.querySelector("strong")?.textContent.trim())), ["Banked EXP", "Spirit Core", "Effects & Conditions"]);
    await page.fill('[data-play-transaction-amount="Exp"]', "250");
    await js('[data-play-transaction-field="Exp"][data-play-transaction-action="add"]');
    check("J: adding 250 EXP shows 250 under Banked EXP", (await card())?.value, "250");
    await page.screenshot({ path: path.join(output, "j-banked-exp-1280.png"), clip: await page.locator("#play-derived-grid").boundingBox() });
  });

  await part("K", "Spend XP's Classes panel shows the character's own class (item 15)", async () => {
    await fresh();
    check("K: a fresh character stores no default class (the catalog's first is only shown, not saved)", await hook("inspectedClass"), "");
    check("K setup: the Classes step opens", await hook("gotoBuilderStep", "classes"), "classes");
    await page.waitForTimeout(200);
    const firstCatalog = await hook("firstCatalogClass");
    check("K: with no class chosen, the Classes panel still shows the first catalog class, as before", await hook("detailTitle"), firstCatalog);
    check("K: and still stores nothing", await hook("inspectedClass"), "");
    await hook("gotoBuilderStep", "race");
    await quickBuild("human", "gunslinger", "Spend Tester");
    await js("[data-open-exp-spending]");
    await onBuilder();
    await page.waitForTimeout(300);
    const own = (await state()).builder.selectedClassIds;
    const shown = await hook("detailTitle");
    record.spendXp = { shown, own: await Promise.all(own.map((id) => hook("className", id))), firstCatalog };
    check("K: Spend XP lands on Classes", (await hook("view")).stepId, "classes");
    check(`K: its panel shows one of the character's own classes (${record.spendXp.own.join(", ")}), not ${firstCatalog}`, [record.spendXp.own.includes(shown), shown === firstCatalog], [true, false]);
    await page.screenshot({ path: path.join(output, "k-spend-xp-classes-1280.png") });
    // An older save that stored the catalog default before the character had classes.
    const abjurerId = await hook("classId", firstCatalog);
    const saved = await state();
    saved.builder.inspected.class = abjurerId;
    saved.ui.mode = "sheet";
    await page.evaluate(([key, json]) => localStorage.setItem(key, json), [STORAGE_KEY, JSON.stringify(saved)]);
    await reload();
    await onSheet();
    await js("[data-open-exp-spending]");
    await onBuilder();
    await page.waitForTimeout(300);
    check(`K: an older save holding ${firstCatalog}: Spend XP shows the character's own class instead`, record.spendXp.own.includes(await hook("detailTitle")), true);
  });

  check("no page errors in the builder runs", pageErrors, []);
  await writeFile(path.join(output, "task-042-record.json"), JSON.stringify(record, null, 2));
  await context.close();
} finally {
  await browser?.close().catch(() => {});
  server?.child.kill();
}

console.log(`\n${passed} passed, ${failures.length} failed${failures.length ? `:\n  - ${failures.join("\n  - ")}` : ""}`);
await writeFile(path.join(output, "results.json"), JSON.stringify({ passed, failed: failures.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
