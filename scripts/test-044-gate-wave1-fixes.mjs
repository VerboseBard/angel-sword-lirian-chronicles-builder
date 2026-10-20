// Task 044 checks: the fixes from the 040 pre-release gate, wave 1 (Opus and
// Fable audits).
//
// What this proves, in a real browser through the real app:
//   R. The rule text the fixes rest on is in the repo's 0.13.2 data, word for
//      word (the report quotes the same lines).
//   A. Spirit Core, every Quick Build species x build x start mode (21 x 15 x 2
//      = 630 characters, through the real Quick Build screens): Human 1100,
//      everyone else 1000 (it was 1200 for every Human: the Human +100 was
//      counted twice). The EXP spent and banked are unchanged (Human 1100 /
//      1100 spent, 0 banked; everyone else 1000 / 1000, 0 banked). The room
//      summary carries the same number. After Use This Character the play
//      sheet shows it (header and Spirit Core card).
//   B. Advanced Build Humans through the builder's own class and breakthrough
//      handlers: the +100 counts once whether it is spent or still banked, a
//      refund gives it back, EXP spent on breakthroughs counts the same way,
//      EXP added on the sheet counts in full, Slow Starter and the
//      Human-Chimera Hybrid follow the same rule, a hand-set Spirit Core is
//      never overwritten, and a non-Human is unchanged.
//   C. Old saves: the five files the live site exported (tests/fixtures/
//      043-live-3346d32/) keep their Spirit Core and EXP; a save the old code
//      wrote with the double count (Spirit Core 1200, builder-managed) opens at
//      1100 through Import Character and through a reload; a hand-set Spirit
//      Core opens as stored.
//   D. Initiative rolls 1d4 + the bonus and never goes below 0 (it rolled a
//      d20). The breakdown still names Agility, the Gunslinger key, On the Draw
//      and armor; the tray shows a d4; the room event carries formula d4 and
//      the d4's value; the real Roll Initiative button does the same.
//   E. The "Latest update" list: the crafting line claims only the basics, and
//      task 043's two fixes have their lines (test-042 part A0 pins every word).
//   F. The repo's current-state text: README lines 1-3, VERSION.txt, the
//      tester handout and the dev server's terminal and status text.
//   G. (044b) Import Character says so in its notes window when a file holds
//      no free racial skill points (files older than Beta 1.4, other tools):
//      one plain line naming the pools, for Human, Catfolk and Demon. Files
//      that hold the points (our own exports, the five live-site files) open
//      no notes window, and an unmatched-entry note keeps its old window.
//   H. (044b) Equip and Unequip are saved to the browser at once, also for an
//      item that changes no sheet number (it used to be lost on a reload), and
//      each click redraws the play sheet once (it used to be twice).
//
// The real src/js is bundled in memory with a test-only hook block appended to
// ui.js (the test-030/043 pattern); nothing in the shipped source is altered.
//
// Run:  npm run test:044   (builds first)
// Env:  T44_PORT (default 4480); T44_SRC=<folder with src/js, index.html and the
//       repo text files> runs against another source tree (used to show the old
//       code fails); T44_ONLY=A,D limits parts; T44_SPECIES=human,catfolk
//       limits the part A sweep.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.env.T44_SRC ? path.resolve(process.env.T44_SRC) : root;
const output = path.join(root, "qa-test-results/task-044-gate-wave1-fixes");
await mkdir(output, { recursive: true });
const port = Number(process.env.T44_PORT || 4480);
const url = `http://localhost:${port}/`;
const only = (process.env.T44_ONLY || "").split(",").map((entry) => entry.trim().toUpperCase()).filter(Boolean);
const wants = (part) => !only.length || only.includes(part);
const speciesFilter = (process.env.T44_SPECIES || "").split(",").map((entry) => entry.trim()).filter(Boolean);
const STORAGE_KEY = "lyrian-chronicles-character-suite-v2";
const LIVE_FIXTURES = path.join(root, "tests/fixtures/043-live-3346d32");

const failures = [];
let passed = 0;
const check = (name, actual, expected) => {
  try {
    assert.deepEqual(actual, expected, name);
    passed += 1;
  } catch {
    failures.push(name);
    const short = (value) => { const text = JSON.stringify(value) ?? "undefined"; return text.length > 600 ? `${text.slice(0, 600)}... (${text.length} chars)` : text; };
    if (failures.length <= 80) {
      console.log(`  FAIL ${name}\n       actual:   ${short(actual)}\n       expected: ${short(expected)}`);
    }
  }
};
const section = (title) => console.log(`\n== ${title}`);
const results = {};

// ---------------------------------------------------------------------------
// Test-only hooks, appended to ui.js in the in-memory bundle.
// ---------------------------------------------------------------------------
const hooks = `
import { mergeBuilderState as __t44MergeBuilder } from "./state.js";
import { VTT_RELAY_CHANNEL as __t44Channel } from "./vtt-relay.js";
window.__t44 = {
  events: [],
  listen() {
    if (this.channel) return;
    this.channel = new BroadcastChannel(__t44Channel);
    this.channel.onmessage = (event) => { this.events.push(event.data); };
  },
  read() {
    const budget = getClassUnlockBudgetState();
    const breakthroughs = getBreakthroughBudgetState();
    return {
      race: getSelectedRaceDetail()?.name || "",
      spiritCore: state.fields["Spirit Core"] || "",
      autoSpiritCore: state.builder.autoSpiritCore || "",
      exp: state.fields.Exp || "",
      autoExp: state.builder.autoExpBank || "",
      spent: budget.spentExp,
      general: breakthroughs.generalSpent,
      budget: budget.expBudget,
      remaining: budget.remainingExp,
      start: budget.startingExpBudget,
      humanBonus: budget.humanExpBonus,
      summarySpiritCore: buildVttSummary().spiritCore,
      summaryExp: buildVttSummary().exp
    };
  },
  sweep(mode, speciesFilter) {
    window.confirm = () => true;
    const click = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error("missing " + selector);
      element.click();
    };
    if (!state.ui.quickBuildActive) click("#quick-build-entry");
    const runs = [];
    const speciesList = QUICK_BUILD_SPECIES.filter((entry) => !speciesFilter.length || speciesFilter.includes(entry.id));
    const builds = QUICK_BUILD_ROLES.flatMap((role) => role.builds);
    let first = true;
    for (const species of speciesList) {
      click('[data-step-index="0"]');
      click('[data-quick-build-action="select-species"][data-id="' + species.id + '"]');
      click("#builder-next");
      if (first && mode === "mirane") click('[data-quick-start-mode="mirane"]');
      first = false;
      click("#builder-next");
      for (const entry of builds) {
        click('[data-quick-build-action="select-build"][data-id="' + entry.id + '"]');
        click("#builder-next");
        const review = [...document.querySelectorAll(".review-panel")].map((panel) => panel.textContent.replace(/\\s+/g, " ").trim());
        runs.push({ mode, species: species.id, build: entry.id, startMode: state.builder.startMode, review, ...this.read() });
        click('[data-quick-build-action="back-to-build"]');
      }
    }
    return runs;
  },
  // One Quick Build character through the real screens, then Use This Character.
  quick(speciesId, buildId, mode = "standard") {
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
    if (nameInput) { nameInput.value = "T44 " + speciesId + " " + buildId; nameInput.dispatchEvent(new Event("input", { bubbles: true })); }
    if (mode === "mirane") click('[data-quick-start-mode="mirane"]');
    click("#builder-next");
    click('[data-quick-build-action="select-build"][data-id="' + buildId + '"]');
    click("#builder-next");
    click("#builder-next"); // Use This Character
    return { mode: state.ui.mode, ...this.read() };
  },
  sheetView() {
    renderPlayDashboard();
    const pills = [...document.querySelectorAll(".detail-pill")].map((node) => node.textContent.trim()).filter((text) => /Spirit Core/.test(text));
    const cards = [...document.querySelectorAll("#play-derived-grid .play-derived-card")].map((node) => ({
      title: node.querySelector("strong")?.textContent.trim() || "",
      value: node.querySelector(".play-derived-value")?.textContent.trim() || ""
    }));
    return { pills, spiritCoreCard: cards.find((card) => card.title === "Spirit Core")?.value || "", bankedCard: cards.find((card) => /EXP/.test(card.title))?.value || "" };
  },
  id(kind, name) {
    const entries = kind === "class" ? lookup.classes.entries : (kind === "item" ? lookup.items.entries : lookup.breakthroughs.entries);
    return findRecordByName(entries, name)?.id || "";
  },
  fixture(input = {}) {
    const revision = (state.revision || 0) + 1;
    const defaults = createDefaultState();
    Object.assign(state, defaults, input);
    state.revision = revision;
    state.fields = { ...defaults.fields, ...(input.fields || {}) };
    state.ui = { ...defaults.ui, gameVersion: "0.13.2", ...(input.ui || {}) };
    state.builder = __t44MergeBuilder({ ...defaults.builder, ...(input.builder || {}) });
    state.play = mergePlayState(input.play || {});
  },
  sync() { syncBuilderSelectionsIntoSheet(); return this.read(); },
  clear() { clearSheet(); state.ui.mode = "builder"; return this.read(); },
  setRace(id) { setBuilderRace(id); return this.read(); },
  toggleClass(id) { toggleBuilderClass(id); return this.read(); },
  learn(id) { learnNextClassAbility(id); return this.read(); },
  refund(id) { refundLastClassAbility(id); return this.read(); },
  toggleBreakthrough(id) { toggleBuilderBreakthrough(id); return this.read(); },
  // Learn class levels in the given classes, in order, until "spent" reaches target.
  spendTo(target, classIds) {
    for (const id of classIds) {
      if (!state.builder.selectedClassIds.includes(id)) toggleBuilderClass(id);
      let guard = 0;
      while (getClassUnlockBudgetState().spentExp < target && guard < 20) {
        const before = getClassUnlockBudgetState().spentExp;
        learnNextClassAbility(id);
        guard += 1;
        if (getClassUnlockBudgetState().spentExp === before) break;
      }
      if (getClassUnlockBudgetState().spentExp >= target) break;
    }
    return this.read();
  },
  // A 100 EXP breakthrough this character can take now (not a pick-an-option card).
  hundredBreakthrough() {
    const pick = lookup.breakthroughs.entries.find((record) => parseNumericCost(record.cost) === 100
      && !state.builder.selectedBreakthroughIds.includes(record.id)
      && normalizePhrase(record.name) !== "elemental affinity"
      && !getRepeatableUniqueBreakthroughConfig(record)
      && !isStackableBreakthrough(record)
      && getBreakthroughRequirementStatus(record).met);
    return pick ? { id: pick.id, name: pick.name } : null;
  },
  lastClass() { return state.builder.selectedClassIds[state.builder.selectedClassIds.length - 1] || ""; },
  lastBoughtClass() { return [...state.builder.selectedClassIds].reverse().find((id) => getClassPurchasedAbilityCount(getClassDetail(id)) > getClassGrantedAbilityCount(getClassDetail(id))) || ""; },
  learnableClass() { return state.builder.selectedClassIds.find((id) => getClassPurchasedAbilityCount(getClassDetail(id)) < getClassProgressSlotCount(getClassDetail(id))) || ""; },
  typeSpiritCore(value) { updateFieldValue("Spirit Core", String(value)); return this.read(); },
  addExp(amount) {
    const input = document.querySelector('[data-play-transaction-amount="Exp"]');
    const button = document.querySelector('[data-play-transaction-field="Exp"][data-play-transaction-action="add"]');
    if (!input || !button) throw new Error("no EXP card");
    input.value = String(amount);
    button.click();
    return this.read();
  },
  snapshot() { return JSON.parse(JSON.stringify(createVttCharacterSnapshot())); },
  async importText(fileName, text) {
    await handleImportedCharacterFile(new File([text], fileName, { type: "application/json" }));
    return this.read();
  },
  // --- D: initiative ------------------------------------------------------
  derived() { return getDerivedCombatStats(); },
  rollInitiative() {
    rollPlayCheck("initiative");
    return {
      lines: [...(state.play.log[0]?.lines || [])],
      title: state.play.log[0]?.title || state.play.log[0]?.label || "",
      dieType: document.getElementById("roll-overlay-die-type")?.textContent || "",
      overlayBreakdown: document.getElementById("roll-overlay-breakdown")?.textContent || "",
      overlayTotal: document.getElementById("roll-overlay-total")?.textContent || "",
      bonus: getDerivedCombatStats().initiative
    };
  },
  clickRollInitiative() {
    state.ui.mode = "sheet";
    renderPlayDashboard();
    const button = document.querySelector('#play-roll-actions [data-play-roll="initiative"]');
    if (!button) throw new Error("no Roll Initiative button");
    button.click();
    return { lines: [...(state.play.log[0]?.lines || [])], dieType: document.getElementById("roll-overlay-die-type")?.textContent || "", label: button.textContent.trim() };
  },
  takeEvents() { const list = this.events.slice(); this.events.length = 0; return list; },
  // --- G: import notes (044b) ---------------------------------------------
  modal() {
    const modal = document.getElementById("sheet-modal");
    const open = Boolean(modal && !modal.hidden);
    return {
      open,
      eyebrow: open ? document.getElementById("sheet-modal-eyebrow")?.textContent || "" : "",
      title: open ? document.getElementById("sheet-modal-title")?.textContent || "" : "",
      lead: open ? document.getElementById("sheet-modal-lead")?.textContent || "" : "",
      items: open ? [...document.querySelectorAll("#sheet-modal-content li")].map((li) => li.textContent.replace(/\\s+/g, " ").trim()) : []
    };
  },
  closeModal() { closeSheetModal(); },
  skillRow(name) { return SKILL_DEFINITIONS.findIndex((definition) => definition.name === name) + 1; },
  racialPools() { return getVisibleRacialSkillPoolChoices().map((choice) => ({ id: choice.id, label: choice.label, ...getRacialSkillPoolState(choice) })); },
  // --- H: Equip saves at once, one render per click (044b) ----------------
  inventoryEntry(name) {
    const entry = (state.play.inventoryItems || []).find((item) => mergeInventoryEntryWithRecord(item).name === name);
    return entry ? { uid: entry.uid, equipped: Boolean(entry.equipped) } : null;
  },
  clickEquip(uid) {
    renderPlayDashboard();
    const host = document.getElementById("play-roll-actions");
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    let renders = 0;
    Object.defineProperty(host, "innerHTML", { configurable: true, get() { return descriptor.get.call(this); }, set(value) { renders += 1; descriptor.set.call(this, value); } });
    const fieldsBefore = JSON.stringify(state.fields);
    const button = document.querySelector('[data-inventory-toggle-equip="' + uid + '"]');
    if (!button) { delete host.innerHTML; throw new Error("no Equip button for " + uid); }
    const label = button.textContent.trim();
    button.click();
    delete host.innerHTML;
    const entry = (state.play.inventoryItems || []).find((item) => item.uid === uid);
    return { label, renders, equipped: Boolean(entry?.equipped), numbersChanged: JSON.stringify(state.fields) !== fieldsBefore };
  }
};`;

const bundle = await build({
  absWorkingDir: sourceRoot,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "task044-test-access", setup(buildApi) {
    buildApi.onLoad({ filter: /[/\\]src[/\\]js[/\\]ui\.js$/ }, async ({ path: file }) => ({
      contents: await readFile(file, "utf8") + hooks, loader: "js"
    }));
  } }]
});
const bundleText = bundle.outputFiles[0].text;
const sourceIndex = await readFile(path.join(sourceRoot, "index.html"), "utf8");

const server = fork(path.join(root, "scripts/server.mjs"), [], {
  cwd: root, env: { ...process.env, LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" }, silent: true
});
let serverLog = "";
server.stdout.on("data", (data) => { serverLog += data; });
server.stderr.on("data", (data) => { serverLog += data; });
let browser;
const pageErrors = [];
try {
  // -------------------------------------------------------------------------
  if (wants("R")) {
    section("R. The rule text (0.13.2 data in the repo)");
    const rulebook = String(JSON.parse(await readFile(path.join(root, "data/angelssword/decoded/rulebook.json"), "utf8")).contentText || "");
    const races = JSON.parse(await readFile(path.join(root, "data/angelssword/decoded/primary_race_details.json"), "utf8"));
    const human = (Array.isArray(races) ? races : Object.values(races)).find((entry) => /^human$/i.test(String(entry?.name || "")));
    check("R: rulebook: initiative is 1d4 + the bonus", rulebook.includes("every participant rolls a 1d4 and adds their initiative bonus to it"), true);
    check("R: rulebook: initiative cannot go below 0", rulebook.includes("Initiative cannot go below 0."), true);
    check("R: rulebook: Spirit Core is the EXP spent", rulebook.includes("Your spirit core value is equal to your total EXP spent."), true);
    check("R: rulebook: EXP you spend is added to Spirit Core", rulebook.includes("Any EXP you spend is added to your Spirit Core."), true);
    check("R: Human: the extra 100 EXP is also added to Spirit Core", human?.ambition, "You start with an additional 100 exp that is also added to your spirit core.");
  }

  // -------------------------------------------------------------------------
  if (wants("E")) {
    section("E. The Latest update list (fix 3 and fix 6)");
    const notes = await import(pathToFileURL(path.join(sourceRoot, "src/js/release-notes.js")).href).catch(() => ({}));
    const list = [...(notes.APP_RELEASE_NOTES || [])];
    check("E: the summary is unchanged (the owner's words)", notes.APP_RELEASE_SUMMARY, "Multiple dice sets, Owlbear Rodeo connection, quality-of-life improvements.");
    check("E: no line says all of crafting follows the rulebook", list.filter((line) => /^Crafting follows the 0\.13\.2 rulebook/.test(line)), []);
    check("E: the crafting line claims the basics only", list.filter((line) => line.startsWith("Crafting basics now follow the 0.13.2 rulebook: 5 dice, your skill on each basic craft roll, crafting HP to succeed.")).length, 1);
    check("E: task 043's import fix has its line", list.includes("Import Character and Load Saved now keep every free skill point and choice: class picks, Skill Training and the Divine's Chosen god."), true);
    check("E: task 043's Equip/Unequip fix has its line", list.includes("Equip and Unequip on the play sheet now update Guard, Evasion, Dodge, Block, Initiative and skills at once."), true);
    check("E: nothing planned is announced", list.filter((line) => /\b(soon|will|coming|planned)\b/i.test(line)), []);
  }

  // -------------------------------------------------------------------------
  if (wants("F")) {
    section("F. The repo's current-state text (fix 4)");
    const read = (name) => readFile(path.join(sourceRoot, name), "utf8").catch(() => "");
    const readme = (await read("README.md")).split(/\r?\n/);
    check("F: README line 1 names Beta 3.0, not the Sept 7 candidate", [readme[0]?.includes("Beta 3.0"), /patch candidate/i.test(readme[0] || "")], [true, false]);
    check("F: README lines 1-3 no longer say 'has not been published'", readme.slice(0, 3).some((line) => /has not been published/i.test(line)), false);
    check("F: README line 3 gives the default rules 0.13.2", /0\.13\.2/.test(readme[2] || ""), true);
    check("F: README line 5 still names Beta 3.0 as the standard public web build (test-042 G)", readme[4]?.includes("Beta 3.0 is the standard public web build"), true);
    const versionTxt = (await read("VERSION.txt")).split(/\r?\n/);
    check("F: VERSION.txt rules default is 0.13.2", versionTxt.includes("Rules default: 0.13.2"), true);
    check("F: VERSION.txt keeps 0.13.1 as a historical version", versionTxt.includes("Historical rules retained: 0.13.1, 0.13.0, 0.12.6, 0.12.5"), true);
    check("F: VERSION.txt no longer names 0.13.1 as current", versionTxt.filter((line) => /0\.13\.1/.test(line) && !/^Historical/.test(line)), []);
    const testers = (await read("README - Beta Testers.txt")).split(/\r?\n/);
    check("F: tester handout: a fresh browser starts on 0.13.2", testers.includes("- A fresh browser starts on rules 0.13.2."), true);
    check("F: tester handout: 0.13.1 is among the selectable older versions", testers.includes("- Rules 0.13.1, 0.13.0, 0.12.6, and 0.12.5 remain selectable and survive reload."), true);
    const serverSource = await read("scripts/server.mjs");
    check("F: the dev server's text says Beta 3.0, never Beta 2.13", [serverSource.includes("Beta 2.13"), serverSource.includes("Lyrian Beta 3.0 public build running at"), serverSource.includes("Beta 3.0 public build local development server is connected.")], [false, true, true]);
  }

  for (let retry = 0; ; retry++) {
    if (/running at/.test(serverLog)) {
      try { if ((await fetch(url)).ok) break; } catch {}
    }
    if (retry === 120 || server.exitCode !== null) throw new Error(`Test server failed: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (wants("F") && !process.env.T44_SRC) {
    check("F: the running dev server prints Beta 3.0", /Lyrian Beta 3\.0 public build running at/.test(serverLog), true);
    const status = await (await fetch(`${url}api/status`)).json().catch(() => ({}));
    check("F: the dev server's status message says Beta 3.0", status.message, "Beta 3.0 public build local development server is connected.");
  }

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route("**/assets/app.bundle.js*", (route) => route.fulfill({ contentType: "application/javascript", body: bundleText }));
  await context.route(/\/index\.html(\?.*)?$|\/(\?.*)?$/, (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname === "/" || requestUrl.pathname.endsWith("/index.html")) {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: sourceIndex });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  const freshPage = async () => {
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__t44 && window.LYRIAN_DATA?.version === "0.13.2" && (document.getElementById("builder-step-content")?.innerHTML || "").length > 100, null, { timeout: 30000 });
    await page.waitForTimeout(1600); // the production idle sheet build
  };
  const call = (name, ...args) => page.evaluate(([fn, list]) => window.__t44[fn](...list), [name, args]);
  const fixture = (input) => page.evaluate((value) => window.__t44.fixture(value), input);

  // -------------------------------------------------------------------------
  if (wants("A")) {
    const allRuns = [];
    for (const mode of ["standard", "mirane"]) {
      await freshPage();
      if (mode === "standard") check("A: a fresh browser starts on rules 0.13.2", await page.evaluate(() => window.LYRIAN_DATA?.version), "0.13.2");
      allRuns.push(...await page.evaluate(([startMode, filter]) => window.__t44.sweep(startMode, filter), [mode, speciesFilter]));
    }
    section(`A. Spirit Core sweep: ${allRuns.length} characters (species x builds x start modes)`);
    if (!speciesFilter.length) check("A: the sweep covers 21 species x 15 builds x 2 modes", allRuns.length, 630);
    const bySpecies = {};
    const tally = { human: 0, other: 0, wrong: 0 };
    for (const run of allRuns) {
      const human = run.race === "Human";
      const rule = human ? 1100 : 1000;
      const problems = [];
      if (run.startMode !== run.mode) problems.push(`start mode ${run.startMode}`);
      if (run.spiritCore !== String(rule)) problems.push(`Spirit Core ${run.spiritCore}, rules ${rule}`);
      if (run.autoSpiritCore !== String(rule)) problems.push(`builder-managed Spirit Core ${run.autoSpiritCore}`);
      if (run.summarySpiritCore !== rule) problems.push(`room summary Spirit Core ${run.summarySpiritCore}`);
      if (run.spent !== rule || run.budget !== rule || run.remaining !== 0) problems.push(`EXP spent ${run.spent} / ${run.budget}, banked ${run.remaining}`);
      if (run.exp !== "0" || run.summaryExp !== 0) problems.push(`EXP field ${run.exp}, summary ${run.summaryExp}`);
      if (run.general !== 0) problems.push(`breakthrough general EXP ${run.general}`);
      if (problems.length) tally.wrong += 1; else if (human) tally.human += 1; else tally.other += 1;
      (bySpecies[`${run.mode}/${run.species}`] ||= []).push(...problems.map((problem) => `${run.build}: ${problem}`));
    }
    Object.entries(bySpecies).forEach(([name, problems]) => check(`A ${name}: Spirit Core and EXP match the rules on all 15 builds`, problems, []));
    results.sweep = { characters: allRuns.length, ...tally, values: [...new Set(allRuns.map((run) => `${run.race === "Human" ? "Human" : "other"}=${run.spiritCore}`))] };
    console.log(`   ${tally.human} Human characters at 1100, ${tally.other} others at 1000, ${tally.wrong} wrong. Values seen: ${results.sweep.values.join(", ")}`);
    await writeFile(path.join(output, "sweep.json"), JSON.stringify(allRuns.map(({ review, ...rest }) => rest), null, 1));

    section("A. The play sheet after Use This Character");
    await freshPage();
    for (const [species, buildId, mode, rule] of [["human", "gunslinger", "standard", 1100], ["human", "shield-warrior", "mirane", 1100], ["catfolk", "hunter-archer", "standard", 1000]]) {
      const made = await call("quick", species, buildId, mode);
      const view = await call("sheetView");
      results[`sheet-${species}-${buildId}`] = { made, view };
      check(`A ${species} ${buildId} (${mode}): the sheet opens with Spirit Core ${rule}`, [made.mode, made.spiritCore, made.summarySpiritCore], ["sheet", String(rule), rule]);
      check(`A ${species} ${buildId} (${mode}): the header and the Spirit Core card show ${rule}`, [view.pills.some((text) => text === `Spirit Core ${rule}`), view.spiritCoreCard], [true, String(rule)]);
      check(`A ${species} ${buildId} (${mode}): Banked EXP 0`, view.bankedCard, "0");
    }
  }

  // -------------------------------------------------------------------------
  if (wants("B")) {
    section("B. Advanced Build Humans: the +100 counts once");
    await freshPage();
    const ids = await page.evaluate(() => ({
      fighter: window.__t44.id("class", "Fighter"),
      rogue: window.__t44.id("class", "Rogue"),
      slowStarter: window.__t44.id("breakthrough", "Slow Starter"),
      hybrid: window.__t44.id("breakthrough", "Human-Chimera Hybrid (Race)")
    }));
    await call("clear");
    let now = await call("setRace", "human");
    check("B1: a new Human starts with Spirit Core 100 (the +100) and 1100 EXP to spend", [now.spiritCore, now.remaining, now.humanBonus], ["100", 1100, 100]);
    now = await call("toggleClass", ids.fighter);
    check("B1: Fighter unlocked (100 EXP spent): Spirit Core 200", [now.spent, now.spiritCore, now.remaining], [100, "200", 1000]);
    now = await call("spendTo", 1000, [ids.fighter, ids.rogue]);
    check("B1: 1000 spent, 100 banked: Spirit Core 1100 (unchanged by the fix)", [now.spent, now.remaining, now.spiritCore, now.exp], [1000, 100, "1100", "100"]);
    now = await call("spendTo", 1100, [ids.fighter, ids.rogue]);
    check("B1: all 1100 spent: Spirit Core 1100 (was 1200), 0 banked", [now.spent, now.remaining, now.spiritCore, now.exp, now.summarySpiritCore], [1100, 0, "1100", "0", 1100]);
    const lastClass = await call("lastClass");
    now = await call("refund", lastClass);
    check("B1: refund one level: 1000 spent, 100 banked, Spirit Core 1100", [now.spent, now.remaining, now.spiritCore], [1000, 100, "1100"]);
    now = await call("refund", lastClass);
    check("B1: refund a second level: 900 spent, 200 banked, Spirit Core 1000 (900 + the +100)", [now.spent, now.remaining, now.spiritCore], [900, 200, "1000"]);
    now = await call("spendTo", 1100, [ids.fighter, ids.rogue]);
    check("B1: spend it all again: Spirit Core 1100", [now.spent, now.remaining, now.spiritCore], [1100, 0, "1100"]);
    results.b1 = now;

    section("B. EXP spent on breakthroughs counts the same way");
    await freshPage();
    now = await call("quick", "human", "gunslinger", "standard");
    check("B2 setup: Human Gunslinger, 1100 spent, Spirit Core 1100", [now.spent, now.general, now.spiritCore], [1100, 0, "1100"]);
    // The last class with a bought level (Gunslinger), so Ranger mastery stays.
    const gunClass = await call("lastBoughtClass");
    now = await call("refund", gunClass);
    check("B2: refund one class level: 100 banked, Spirit Core 1100", [now.spent, now.remaining, now.spiritCore], [1000, 100, "1100"]);
    const extra = await call("hundredBreakthrough");
    check("B2 setup: a 100 EXP breakthrough the character can take exists", Boolean(extra), true);
    if (extra) {
      now = await call("toggleBreakthrough", extra.id);
      results.b2 = { extra, now };
      check(`B2: buy ${extra.name} with the banked 100 (general EXP): Spirit Core 1100 (was 1200), 0 banked`, [now.general, now.remaining, now.spiritCore], [100, 0, "1100"]);
      now = await call("toggleBreakthrough", extra.id);
      check(`B2: remove ${extra.name} again: 100 banked, Spirit Core 1100`, [now.general, now.remaining, now.spiritCore], [0, 100, "1100"]);
    }

    section("B. EXP added on the sheet counts in full");
    await freshPage();
    await call("quick", "human", "gunslinger", "standard");
    now = await call("addExp", 500);
    check("B3: the GM adds 500 EXP on the sheet: Banked 500, Spirit Core still 1100", [now.exp, now.spiritCore], ["500", "1100"]);
    const progressClass = await call("learnableClass");
    now = await call("learn", progressClass);
    check("B3: spend 100 of it on a class level: Spirit Core 1200 (1200 spent; was 1300), Banked 400", [now.spent, now.spiritCore, now.exp], [1200, "1200", "400"]);

    section("B. Slow Starter, Human-Chimera Hybrid, a non-Human, a hand-set Spirit Core");
    const classFixture = (raceId, breakthroughIds, progress) => ({
      fields: { Name: "T44 fixture" },
      builder: { selectedRaceId: raceId, selectedClassIds: Object.keys(progress), classAbilityProgress: progress, selectedBreakthroughIds: breakthroughIds }
    });
    // Fighter + Rogue: 100 unlock + 100 per purchased level each.
    await fixture(classFixture("human", [ids.slowStarter], { [ids.fighter]: 7, [ids.rogue]: 0 }));
    now = await call("sync");
    check("B4: Slow Starter Human, 900 of 900 spent: Spirit Core 900 (was 1000)", [now.start, now.spent, now.spiritCore], [900, 900, "900"]);
    await fixture(classFixture("human", [ids.slowStarter], { [ids.fighter]: 6, [ids.rogue]: 0 }));
    now = await call("sync");
    check("B4: Slow Starter Human, 800 spent, 100 banked: Spirit Core 900 (800 + the +100)", [now.spent, now.remaining, now.spiritCore], [800, 100, "900"]);
    await fixture(classFixture("human", [ids.hybrid], { [ids.fighter]: 7, [ids.rogue]: 1 }));
    now = await call("sync");
    check("B5: Human-Chimera Hybrid (no Human +100), 1000 spent: Spirit Core 1000", [now.humanBonus, now.spent, now.spiritCore], [0, 1000, "1000"]);
    await fixture(classFixture("chimera", [], { [ids.fighter]: 7, [ids.rogue]: 1 }));
    now = await call("sync");
    check("B6: a non-Human, 1000 spent: Spirit Core 1000 (unchanged)", [now.humanBonus, now.spent, now.spiritCore], [0, 1000, "1000"]);
    await fixture(classFixture("human", [], { [ids.fighter]: 7, [ids.rogue]: 2 }));
    now = await call("sync");
    check("B7 setup: Human, 1100 spent: Spirit Core 1100", now.spiritCore, "1100");
    now = await call("typeSpiritCore", 1500);
    now = await call("refund", ids.rogue);
    check("B7: a hand-set Spirit Core is never replaced by the builder's number (1500 - 100 refunded)", [now.spiritCore, now.autoSpiritCore], ["1400", ""]);
  }

  // -------------------------------------------------------------------------
  if (wants("C")) {
    section("C. Old saves");
    await freshPage();
    const liveFiles = (await readdir(LIVE_FIXTURES)).filter((name) => name.endsWith(".json") && name !== "expected.json").sort();
    results.liveFiles = [];
    for (const name of liveFiles) {
      const text = await readFile(path.join(LIVE_FIXTURES, name), "utf8");
      const file = JSON.parse(text);
      await call("clear");
      const loaded = await call("importText", name, text);
      results.liveFiles.push({ name, file: { spiritCore: file.fields["Spirit Core"], exp: file.fields.Exp }, loaded: { spiritCore: loaded.spiritCore, exp: loaded.exp } });
      check(`C1 live file ${name}: Spirit Core and EXP open as stored (${file.fields["Spirit Core"]}, ${file.fields.Exp})`, [loaded.spiritCore, loaded.exp], [file.fields["Spirit Core"], file.fields.Exp]);
    }

    // A save the old code wrote for a Human who spent all 1100: everything as
    // the new code writes it, except Spirit Core 1200 (builder-managed).
    await call("quick", "human", "gunslinger", "standard");
    const fresh = await call("snapshot");
    const oldSave = JSON.parse(JSON.stringify(fresh));
    oldSave.fields["Spirit Core"] = "1200";
    oldSave.builder.autoSpiritCore = "1200";
    if (oldSave.vttSummary) oldSave.vttSummary.spiritCore = 1200;
    await call("clear");
    let loaded = await call("importText", "old-double-count.json", JSON.stringify(oldSave));
    check("C2: an old double-count save (1200, builder-managed) opens at 1100 through Import Character", [loaded.spiritCore, loaded.autoSpiritCore, loaded.summarySpiritCore], ["1100", "1100", 1100]);
    check("C2: and its EXP is unchanged (1100 spent, 0 banked)", [loaded.spent, loaded.exp], [1100, "0"]);
    await page.evaluate(([key, value]) => { localStorage.clear(); localStorage.setItem(key, value); }, [STORAGE_KEY, JSON.stringify(oldSave)]);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__t44 && window.LYRIAN_DATA?.version === "0.13.2", null, { timeout: 30000 });
    await page.waitForTimeout(1600);
    loaded = await call("read");
    check("C2: the same save as the browser's autosave opens at 1100 after a reload", [loaded.spiritCore, loaded.summarySpiritCore], ["1100", 1100]);

    const handSet = JSON.parse(JSON.stringify(fresh));
    handSet.fields["Spirit Core"] = "1250";
    handSet.builder.autoSpiritCore = "";
    await call("clear");
    loaded = await call("importText", "old-hand-set.json", JSON.stringify(handSet));
    check("C3: an old save with a hand-set Spirit Core (1250) opens as stored", [loaded.spiritCore, loaded.autoSpiritCore], ["1250", ""]);
  }

  // -------------------------------------------------------------------------
  if (wants("D")) {
    section("D. Initiative: 1d4 + the bonus, never below 0");
    await freshPage();
    await call("listen");
    const gun = await page.evaluate(() => ({
      gunslinger: window.__t44.id("class", "Gunslinger"),
      onTheDraw: window.__t44.id("breakthrough", "On the draw"),
      light: window.__t44.id("item", "Armor (Light)"),
      heavy: window.__t44.id("item", "Armor (Heavy)")
    }));
    await fixture({
      fields: { Name: "T44 initiative", Agility: "4" },
      builder: { selectedRaceId: "human", selectedClassIds: [gun.gunslinger], classAbilityProgress: {}, selectedBreakthroughIds: [gun.onTheDraw], selectedItemIds: [gun.light] },
      play: { inventoryItems: [{ uid: "t44-light", itemId: gun.light, quantity: 1, equipped: true }] }
    });
    await call("sync");
    check("D setup: the Gunslinger's initiative bonus is 5 (Agility 4 + 1 + 1 - 1)", (await call("derived")).initiative, 5);
    const rolls = [];
    for (let index = 0; index < 400; index += 1) rolls.push(await call("rollInitiative"));
    const parsed = rolls.map((roll) => {
      const breakdown = roll.lines[0] || "";
      const die = /^d4: (\d+) \|/.exec(breakdown);
      const total = /^Total: (-?\d+)$/.exec(roll.lines[roll.lines.length - 1] || "");
      return { die: die ? Number(die[1]) : null, total: total ? Number(total[1]) : null, breakdown, dieType: roll.dieType, overlayTotal: roll.overlayTotal };
    });
    const faces = [...new Set(parsed.map((entry) => entry.die))].sort();
    check("D1: 400 rolls: the die is a d4 every time (1 to 4), never a d20", [parsed.every((entry) => entry.die >= 1 && entry.die <= 4), faces], [true, [1, 2, 3, 4]]);
    check("D1: every total is the d4 + 5", parsed.filter((entry) => entry.total !== entry.die + 5).length, 0);
    check("D1: the breakdown still names every part", parsed[0].breakdown.replace(/^d4: \d+/, "d4: N"), "d4: N | Agility: +4 | On the Draw: +1 | Gunslinger key ability: +1 | Armor (Light) equipped: -1");
    check("D1: no breakdown mentions a d20", parsed.some((entry) => /d20/.test(entry.breakdown)), false);
    check("D1: the roll tray shows a d4 and the total", [...new Set(parsed.map((entry) => entry.dieType))], ["d4"]);
    check("D1: the tray's total matches the log", parsed.filter((entry) => entry.overlayTotal !== `Total ${entry.total}`).length, 0);
    await page.waitForTimeout(300);
    const events = (await call("takeEvents")).filter((event) => event.kind === "check" && event.label === "Initiative");
    results.initiativeEvent = events[0] || null;
    check("D1: the room gets every roll as formula d4 with the d4's value", [events.length, events.every((event) => event.formula === "d4" && event.dice?.length === 1 && event.dice[0].sides === 4 && event.total === event.dice[0].value + 5)], [400, true]);

    // A negative bonus: Agility 0 in heavy armor (-3).
    await fixture({
      fields: { Name: "T44 slow", Agility: "0" },
      builder: { selectedRaceId: "human", selectedItemIds: [gun.heavy] },
      play: { inventoryItems: [{ uid: "t44-heavy", itemId: gun.heavy, quantity: 1, equipped: true }] }
    });
    await call("sync");
    const slowBonus = (await call("derived")).initiative;
    check("D2 setup: initiative bonus -3 (Agility 0, Heavy armor -3)", slowBonus, -3);
    const slow = [];
    for (let index = 0; index < 200; index += 1) slow.push(await call("rollInitiative"));
    const slowParsed = slow.map((roll) => ({
      die: Number((/^d4: (\d+)/.exec(roll.lines[0] || "") || [])[1]),
      total: Number((/^Total: (-?\d+)$/.exec(roll.lines[roll.lines.length - 1] || "") || [])[1]),
      breakdown: roll.lines[0] || ""
    }));
    check("D2: 200 rolls with a -3 bonus never go below 0", slowParsed.filter((entry) => !(entry.total >= 0)).length, 0);
    check("D2: each total is the d4 - 3, counted as 0 when lower", slowParsed.filter((entry) => entry.total !== Math.max(0, entry.die - 3)).length, 0);
    const clamped = slowParsed.find((entry) => entry.die === 1);
    check("D2: a clamped roll says so in its breakdown", clamped ? clamped.breakdown.endsWith("| Initiative cannot go below 0 (-2 counts as 0)") : null, true);
    const unclamped = slowParsed.find((entry) => entry.die === 4);
    check("D2: a roll that is not clamped has no such note", unclamped ? /cannot go below 0/.test(unclamped.breakdown) : null, false);
    await call("takeEvents");

    section("D. The real Roll Initiative button");
    const clicked = await call("clickRollInitiative");
    check("D3: the play sheet's Roll Initiative button rolls a d4", [clicked.label, /^d4: [1-4] \|/.test(clicked.lines[0] || ""), clicked.dieType], ["Roll Initiative", true, "d4"]);
    check("D3: the sheet's action list describes 1d4 + the bonus, never below 0", bundleText.includes("1d4 plus the current Initiative bonus from the character's derived stats. Initiative cannot go below 0."), true);
  }

  // -------------------------------------------------------------------------
  if (wants("G")) {
    section("G. Import notes say when a file has no free skill points (044b)");
    await freshPage();
    const strip = (snapshot) => {
      const copy = JSON.parse(JSON.stringify(snapshot));
      Object.keys(copy.fields).filter((key) => key.startsWith("RacialSkillPoint:")).forEach((key) => { delete copy.fields[key]; });
      return copy;
    };
    const freePointLine = (labels) => `This file has no record of the free racial skill points (${labels}), so they show as not assigned yet. Check them on the Skills step.`;
    const importFresh = async (name, data) => {
      await call("closeModal");
      await call("clear");
      const loaded = await call("importText", name, typeof data === "string" ? data : JSON.stringify(data));
      return { loaded, modal: await call("modal"), pools: await call("racialPools") };
    };

    await call("quick", "human", "gunslinger", "standard");
    const human = await call("snapshot");
    check("G setup: the Human file holds its free points", Object.keys(human.fields).some((key) => key.startsWith("RacialSkillPoint:race-human-skill:") && Number(human.fields[key]) > 0), true);
    let run = await importFresh("human-with-points.json", human);
    check("G1: a file that holds the free points opens no notes window", run.modal.open, false);
    check("G1: and its pool is fully assigned", run.pools.map((pool) => pool.remaining), [0]);

    run = await importFresh("human-pre-1.4.json", strip(human));
    results.g2 = run.modal;
    check("G2: a Human file with no free-point data opens the notes window", [run.modal.open, run.modal.eyebrow, run.modal.title], [true, "Import Notes", "Check the free skill points"]);
    check("G2: one plain line names the pool", run.modal.items, [freePointLine("Human bonus: spend 5 racial skill points")]);
    check("G2: the lead says everything in the file was applied", run.modal.lead, "human-pre-1.4.json was loaded. Everything in it was applied.");
    check("G2: the pool shows its 5 points to assign, as before", run.pools.map((pool) => [pool.id, pool.remaining]), [["race-human-skill", 5]]);

    await call("quick", "catfolk", "hunter-archer", "standard");
    const catfolk = await call("snapshot");
    run = await importFresh("catfolk-no-points.json", strip(catfolk));
    const catfolkLabels = run.pools.map((pool) => pool.label).join("; ");
    check("G3: a Catfolk file with no free-point data gets the same one line", [run.modal.open, run.modal.items], [true, [freePointLine(catfolkLabels)]]);
    run = await importFresh("catfolk-with-points.json", catfolk);
    check("G3: the same Catfolk with its points opens no notes window", run.modal.open, false);

    await call("quick", "demon", "sneak-thief", "standard");
    const demon = await call("snapshot");
    run = await importFresh("demon-no-points.json", strip(demon));
    results.g4 = { modal: run.modal, pools: run.pools };
    check("G4: a Demon file with no free-point data names both pools in one line", [run.pools.length, run.modal.items], [2, [freePointLine(run.pools.map((pool) => pool.label).join("; "))]]);

    // A file that holds its points but names a class these rules do not have:
    // the old window and wording, and no free-point line.
    const retired = JSON.parse(JSON.stringify(human));
    retired.builder.selectedClassIds = [...retired.builder.selectedClassIds, "retired-class"];
    run = await importFresh("human-retired-class.json", retired);
    check("G5: an unmatched class keeps the old window and adds no free-point line",
      [run.modal.title, run.modal.items.length, run.modal.items.some((item) => /free racial skill points/.test(item))], ["Some entries could not be imported", 1, false]);

    // A file that does hold free points, but only on a skill the Human pool does
    // not allow (a crafting skill): the load drops them (older rule, task 036),
    // so the line must not claim the file has no record of them.
    const barredRow = await call("skillRow", "Alchemy");
    const barred = strip(human);
    barred.fields[`RacialSkillPoint:race-human-skill:${barredRow}`] = "5";
    run = await importFresh("human-points-on-alchemy.json", barred);
    check("G7: a file with free points on a barred skill does not get the no-record line", run.modal.items.some((item) => /no record of the free racial skill points/.test(item)), false);

    const liveFiles = (await readdir(LIVE_FIXTURES)).filter((name) => name.endsWith(".json") && name !== "expected.json").sort();
    const liveNotes = [];
    for (const name of liveFiles) {
      run = await importFresh(name, await readFile(path.join(LIVE_FIXTURES, name), "utf8"));
      if (run.modal.open) liveNotes.push(`${name}: ${run.modal.items.join(" | ")}`);
    }
    check(`G6: the ${liveFiles.length} live-site files hold their points and open no notes window`, liveNotes, []);
    await call("closeModal");
  }

  // -------------------------------------------------------------------------
  if (wants("H")) {
    section("H. Equip and Unequip are saved at once, one render per click (044b)");
    await freshPage();
    await call("quick", "human", "gunslinger", "standard");
    await page.waitForTimeout(400);
    const storedEquipped = (uid) => page.evaluate(([key, id]) => {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      const entry = (saved.play?.inventoryItems || []).find((item) => item.uid === id);
      return entry ? Boolean(entry.equipped) : null;
    }, [STORAGE_KEY, uid]);
    const reloadAndRead = async (name) => {
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction(() => window.__t44 && window.LYRIAN_DATA?.version === "0.13.2", null, { timeout: 30000 });
      await page.waitForTimeout(1600);
      return call("inventoryEntry", name);
    };
    for (const [name, changesNumbers] of [["Pistol (One-Handed)", false], ["Armor (Light)", true]]) {
      const entry = await call("inventoryEntry", name);
      check(`H setup: ${name} is equipped`, entry?.equipped, true);
      if (!entry) continue;
      const off = await call("clickEquip", entry.uid);
      await page.waitForTimeout(400);
      check(`H (${name}): Unequip ${changesNumbers ? "changes" : "changes no"} sheet number`, [off.label, off.equipped, off.numbersChanged], ["Unequip", false, changesNumbers]);
      check(`H (${name}): Unequip is saved in the browser at once`, await storedEquipped(entry.uid), false);
      check(`H (${name}): one play-sheet render for the click`, off.renders, 1);
      check(`H (${name}): still unequipped after a reload`, (await reloadAndRead(name))?.equipped, false);
      const on = await call("clickEquip", entry.uid);
      await page.waitForTimeout(400);
      check(`H (${name}): Equip again is saved at once, one render`, [on.label, on.equipped, await storedEquipped(entry.uid), on.renders], ["Equip", true, true, 1]);
      check(`H (${name}): equipped after a reload`, (await reloadAndRead(name))?.equipped, true);
    }
  }

  check("No uncaught browser JavaScript errors", pageErrors, []);
  console.log(`\n${passed} passed, ${failures.length} failed. Evidence: ${output}`);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed, failed: failures.length, failures, results }, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: error.stack, failures, serverLog }, null, 2));
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
