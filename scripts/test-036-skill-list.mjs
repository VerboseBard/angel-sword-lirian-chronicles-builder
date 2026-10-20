// Task 036 checks: the Human +5 skill points and the Skill Training breakthrough
// follow the 0.13.2 rule text; the Gunslinger key's initiative bonus is applied
// and named; a Quick Build spends its spare Interlude Points on a Job; and the
// proficiency matcher no longer over-credits "pick one" grants.
//
// What this proves:
//   A. SKILL LISTS. The skills a Human may put the +5 into, the Skill Training
//      list (point and expertise), the Universal Training list and the class
//      "any non crafting" pools all equal the list derived from the rulebook:
//      the 21 main skills (parsed from rulebook.json) plus the three skills the
//      official class text and the Reason blurb name (Art Magic, Magic
//      Perception, Expert Knowledge). Artifice, Appraise, Animal Husbandry and
//      Survival are in; every crafting and gathering (artisan) skill is out. A
//      saved Human +5 / Skill Training pick that was allowed before still
//      loads, and a newly allowed one persists.
//   B. GUNSLINGER INITIATIVE. The key's "+1 Gunslinger bonus to Initiative" is
//      read, it stacks with On the Draw, Light armor's -1 still applies, and the
//      sheet value, the labeled parts and the roll breakdown all agree. It is the
//      only such text in 0.13.2; every other initiative text is listed so a new
//      data version makes this test ask for a look.
//   C. JOB. A creation Job pays 300 Clim, 600 while a crafting class is mastered
//      (rulebook, Interlude Actions), in both start modes.
//   D. MATCHER. Pick-one grants count only the chosen group: Fusilier (pistols,
//      muskets or crossbows) credits none until a pick exists, Carpenter (either
//      bows or crossbows) credits only its pick, and across all 185 classes the
//      only differences from the task 030 matcher are those two plus the task
//      038 pick-one fix (Forager, Miner, Adventurer) and three classes whose
//      either/or sentence only mentions a group (Colossus, Nomad, Peltast).
//   E. QUICK BUILD. The Hunter Archer and Gadgeteer use the newly allowed skills,
//      every Quick Build spends its spare starting Interlude Points on Jobs, and
//      the Gunslinger shows 5 initiative. (The full 21 x 15 x 2 sweep is
//      test-030, which checks the same things for all 630 characters.)
//
// The real src/js is bundled in memory with a test-only hook block appended to
// ui.js (the test-025/029/030 pattern); nothing in the shipped source is altered.
//
// Run:  node scripts/test-036-skill-list.mjs   (npm run test:036)
// Env:  T36_PORT (default 4270).
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "qa-test-results/task-036-skill-list");
await mkdir(output, { recursive: true });
const port = Number(process.env.T36_PORT || 4270);
const url = `http://localhost:${port}/`;

const failures = [];
let passed = 0;
const check = (name, actual, expected) => {
  try {
    assert.deepEqual(actual, expected, name);
    passed += 1;
  } catch {
    failures.push(name);
    const short = (value) => { const text = JSON.stringify(value) ?? "undefined"; return text.length > 600 ? `${text.slice(0, 600)}... (${text.length} chars)` : text; };
    console.log(`  FAIL ${name}\n       actual:   ${short(actual)}\n       expected: ${short(expected)}`);
  }
};
const section = (title) => console.log(`\n== ${title}`);
const sorted = (list) => [...list].sort();

// ---------------------------------------------------------------------------
// The rule text, read straight from the 0.13.2 data (not from the builder).
// ---------------------------------------------------------------------------
const decoded = async (name) => JSON.parse(await readFile(path.join(root, "data/angelssword/decoded", name), "utf8"));
const rulebook = (await decoded("rulebook.json")).contentText;
const races = await decoded("primary_race_details.json");
const breakthroughs = await decoded("breakthroughs.json");
const classDetails = await decoded("class_details.json");
const humanText = races.find((entry) => entry.name === "Human").skills;
const breakthroughText = (name) => breakthroughs.find((entry) => entry.name === name).descriptionText;

// The rulebook's "Main Skills List": every "Name:" line between the heading and
// the "Artisan Skills:" section.
const mainSkillsBlock = rulebook.slice(rulebook.indexOf("Main Skills List"), rulebook.indexOf("Artisan Skills:"));
const RULEBOOK_MAIN_SKILLS = [...mainSkillsBlock.matchAll(/^([A-Z][A-Za-z ]+?):\s/gm)].map((match) => match[1].trim());
// Named by the official text as skills too: the Reason blurb lists Expert
// Knowledge, and official class skill pools list Art Magic and Magic Perception.
const OFFICIAL_EXTRA_SKILLS = ["Art Magic", "Expert Knowledge", "Magic Perception"];
const RULE_ALLOWED = sorted([...RULEBOOK_MAIN_SKILLS, ...OFFICIAL_EXTRA_SKILLS]);
const ARTISAN_SKILLS = [
  "Alchemy", "Armorsmithing", "Blacksmith", "Carpentry", "Culinary", "Farming", "Artificer",
  "Foraging", "Mining", "Herbalism", "Fishing", "Hunting", "Logging"
];
const NEWLY_ALLOWED = ["Artifice", "Appraise", "Animal Husbandry", "Survival"];

// Old lists, for the before / after record.
const OLD_BARRED = new Set(NEWLY_ALLOWED);

// ---------------------------------------------------------------------------
// Test-only hooks, appended to ui.js in the in-memory bundle.
// ---------------------------------------------------------------------------
const hooks = `
import { mergeBuilderState as __t36MergeBuilder } from "./state.js";
window.__t36 = {
  fixture(input = {}) {
    const revision = (state.revision || 0) + 1;
    const defaults = createDefaultState();
    Object.assign(state, defaults, input);
    state.revision = revision;
    state.fields = { ...defaults.fields, ...(input.fields || {}) };
    state.ui = { ...defaults.ui, gameVersion: "0.13.2", ...(input.ui || {}) };
    state.builder = __t36MergeBuilder({ ...defaults.builder, ...(input.builder || {}) });
    state.play = mergePlayState(input.play || {});
  },
  id(kind, name) {
    const entries = kind === "class" ? lookup.classes.entries : (kind === "item" ? lookup.items.entries : lookup.breakthroughs.entries);
    return findRecordByName(entries, name)?.id || "";
  },
  sync: syncBuilderSelectionsIntoSheet,
  bump() { state.revision = (state.revision || 0) + 1; },
  skillLists() {
    return {
      human: getHumanRaceSkillChoiceOptions(),
      training: getSkillTrainingSkillOptions(),
      classPoolNonCrafting: getClassSkillPoolOptionsFromText("You gain +5 skill points to spend on any non crafting skill."),
      classPoolNonCraftingGathering: getClassSkillPoolOptionsFromText("You gain +5 skill points to spend on any non crafting or gathering skill."),
      classPoolNonNon: getClassSkillPoolOptionsFromText("You gain +5 skill points to spend on any non-crafting and non-gathering skill.")
    };
  },
  choiceOptions(predicate) {
    return getBuilderChoiceDefinitions().filter(predicate).map((choice) => ({ id: choice.id, label: choice.label, options: getChoiceOptionList(choice).map((option) => cleanText(option.value)) }));
  },
  humanSkillChoice() {
    const choice = getVisibleRacialSkillPoolChoices().find((entry) => entry.id === "race-human-skill");
    return choice ? { id: choice.id, options: getChoiceOptionList(choice).map((option) => cleanText(option.value)), pool: getRacialSkillPoolState(choice) } : null;
  },
  skillRow(name) {
    const index = SKILL_DEFINITIONS.findIndex((entry) => entry.name === name) + 1;
    const row = getSkillRowData(index);
    return { index, racial: row.racialSkillPoints, feature: row.featureSkillPoints, total: row.uncappedSkillPoints };
  },
  choiceIdByLabel(source) { return getBuilderChoiceDefinitions().find((choice) => new RegExp(source, "i").test(choice.label))?.id || ""; },
  setChoice(id, value) { setBuilderChoiceValue(id, value); state.revision = (state.revision || 0) + 1; },
  skillTrainingTarget() {
    return getBuilderChoiceDefinitions().find((choice) => /choose the skill for \\+1/i.test(choice.label) && normalizePhrase(choice.source).startsWith("skill training"))?.id || "";
  },
  computedSkillPoints() { return { ...getComputedBonuses().skillPoints }; },
  pending() { return [...getSelectedBreakthroughEffects().pendingChoices]; },
  // --- B: initiative ------------------------------------------------------
  derived: getDerivedCombatStats,
  breakdown: getInitiativeBreakdown,
  autoApplied() { return [...getSelectedBreakthroughEffects().autoApplied]; },
  rollInitiative() { rollPlayCheck("initiative"); return { top: state.play.log[0] }; },
  sheetInitiative() { recalcBasics(false); return { field: state.fields.Initiative, derived: getDerivedCombatStats().initiative, hint: describeInitiativeParts() }; },
  // --- C: job -------------------------------------------------------------
  funds() { const funds = getStartingFundsState(); return { creationInterludeClim: funds.creationInterludeClim, suggestedTotal: funds.suggestedTotal, available: funds.availableClim }; },
  // --- D: matcher ---------------------------------------------------------
  groupTracked(label) { return hasTrackedSpecificProficiency([label]); },
  hintFor(itemName) {
    const record = findRecordByName(lookup.items.entries, itemName);
    return record ? getWeaponProficiencyHintText(record) : "missing item";
  },
  matcherSweep() {
    const labels = ["Light Armor", "Medium Armor", "Heavy Armor", "Shields", "Greatshields", ...COMMON_WEAPON_GROUP_OPTIONS, ...SPECIALITY_WEAPON_GROUP_OPTIONS];
    // The task 030 matcher, copied: any plural counts, even inside a pick-one list.
    const oldMatch = (options) => {
      const text = getTrackedProficiencyText();
      return options.some((option) => {
        const normalized = normalizePhrase(option);
        const variants = new Set([normalized]);
        if (normalized === "staves") variants.add("staff");
        else if (normalized.endsWith("ies") && normalized.length > 3) variants.add(normalized.slice(0, -3) + "y");
        else if (normalized.endsWith("s") && !normalized.endsWith("ss") && normalized.length > 1) variants.add(normalized.slice(0, -1));
        else variants.add(normalized + "s");
        return [...variants].some((variant) => includesPhrase(text, variant));
      });
    };
    const rows = [];
    for (const entry of lookup.classes.entries) {
      state.builder.selectedClassIds = [entry.id];
      state.revision = (state.revision || 0) + 1;
      const oldOnly = [];
      const newOnly = [];
      const both = [];
      for (const label of labels) {
        const before = oldMatch([label]);
        const after = hasTrackedSpecificProficiency([label]);
        if (before && after) both.push(label);
        else if (before && !after) oldOnly.push(label);
        else if (!before && after) newOnly.push(label);
      }
      rows.push({ name: entry.name, oldOnly, newOnly, both });
    }
    return rows;
  },
  // --- E: Quick Build -----------------------------------------------------
  quickRead() {
    const budget = getClassUnlockBudgetState();
    const funds = getStartingFundsState();
    const skills = SKILL_DEFINITIONS.map((definition, index) => getSkillRowData(index + 1))
      .filter((row) => row && row.uncappedSkillPoints)
      .map((row) => ({ name: row.name, points: row.uncappedSkillPoints, total: row.uncappedSkillPoints + row.substatValue }));
    const stPicks = getBuilderChoiceDefinitions()
      .filter((choice) => isBuilderChoiceVisible(choice) && normalizePhrase(choice.source).startsWith("skill training") && /choose the skill for \\+1/i.test(choice.label))
      .map((choice) => getBuilderChoiceValue(choice.id));
    const derived = getDerivedCombatStats();
    return {
      ip: budget.spentInterlude, ipRemaining: budget.remainingInterlude, classIp: budget.spentClassInterlude,
      jobs: (state.builder.creationInterludeActions || []).filter((id) => id === "job").length,
      jobClim: funds.creationInterludeClim, clim: funds.availableClim,
      skills, stPicks,
      initiative: derived.initiative, agility: getComputedMainStatValue("Agility"),
      parts: getInitiativeBreakdown().parts,
      summary: state.builder.quickBuild?.summary || ""
    };
  },
  quickApply(mode, speciesId, buildIds) {
    window.confirm = () => true;
    const click = (selector) => { const element = document.querySelector(selector); if (!element) throw new Error("missing " + selector); element.click(); };
    if (!state.ui.quickBuildActive) click("#quick-build-entry");
    click('[data-step-index="0"]');
    click('[data-quick-build-action="select-species"][data-id="' + speciesId + '"]');
    click("#builder-next");
    if (mode === "mirane") click('[data-quick-start-mode="mirane"]');
    click("#builder-next");
    const out = {};
    for (const id of buildIds) {
      click('[data-quick-build-action="select-build"][data-id="' + id + '"]');
      const detail = (document.getElementById("builder-detail-card")?.textContent || "").replace(/\\s+/g, " ");
      click("#builder-next");
      out[id] = { detail, ...this.quickRead() };
      click('[data-quick-build-action="back-to-build"]');
    }
    return out;
  }
};`;

const bundle = await build({
  absWorkingDir: root,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "task036-test-access", setup(buildApi) {
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
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/assets/app.bundle.js*", (route) => route.fulfill({
    contentType: "application/javascript", body: bundle.outputFiles[0].text
  }));
  const freshPage = async () => {
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__t36 && window.LYRIAN_DATA?.version === "0.13.2" && (document.getElementById("builder-step-content")?.innerHTML || "").length > 100);
    await page.waitForTimeout(1600); // the production idle sheet build
  };
  const fixture = (input) => page.evaluate((value) => window.__t36.fixture(value), input);
  const call = (name, ...args) => page.evaluate(([fn, list]) => window.__t36[fn](...list), [name, args]);

  // =========================================================================
  section("The rule text this test is built on");
  check("rulebook Main Skills List has the 21 main skills", RULEBOOK_MAIN_SKILLS.length, 21);
  check("rulebook lists Artifice, Appraise, Animal Husbandry and Survival as main skills", NEWLY_ALLOWED.every((name) => RULEBOOK_MAIN_SKILLS.includes(name)), true);
  check("Human text (quoted in the report)", humanText.trim(), "You gain +5 skill points in any non-crafting or gathering skill of your choice.");
  check("Skill Training text bars crafting skills", breakthroughText("Skill Training").includes("Crafting skills cannot be selected with this training."), true);
  check("Universal Training text bars crafting and gathering", breakthroughText("Universal Training").includes("any normal skill, except crafting and gathering skills"), true);
  check("rulebook Artisan rule bars gathering from any feature that picks skills", rulebook.includes("Artisan skills are skills used by gathering and crafting classes. These cannot be selected normally by any class or feature that lets you pick skills"), true);
  check("the three extra official skills are named in the official text",
    [rulebook.includes("Expert Knowledge"), JSON.stringify(classDetails).includes("Art Magic"), JSON.stringify(classDetails).includes("Magic Perception")], [true, true, true]);
  const classPoolTexts = classDetails.map((entry) => entry.skills || "").filter((text) => /to spend on any non[- ]crafting/i.test(text));
  check("12 classes word their skill pool 'any non crafting ...'", classPoolTexts.length, 12);

  // =========================================================================
  section("A. The allowed skill lists equal the rule-derived list");
  await freshPage();
  const lists = await call("skillLists");
  check("Human +5 list equals the rule-derived list", sorted(lists.human), RULE_ALLOWED);
  check("Skill Training list equals the rule-derived list", sorted(lists.training), RULE_ALLOWED);
  check("class pool 'any non crafting' equals the rule-derived list", sorted(lists.classPoolNonCrafting), RULE_ALLOWED);
  check("class pool 'any non crafting or gathering' equals the rule-derived list", sorted(lists.classPoolNonCraftingGathering), RULE_ALLOWED);
  check("class pool 'any non-crafting and non-gathering' equals the rule-derived list", sorted(lists.classPoolNonNon), RULE_ALLOWED);
  check("the four newly allowed skills are in the Human list", NEWLY_ALLOWED.map((name) => lists.human.includes(name)), [true, true, true, true]);
  check("the four newly allowed skills are in the Skill Training list", NEWLY_ALLOWED.map((name) => lists.training.includes(name)), [true, true, true, true]);
  check("no crafting or gathering skill is in the Human list", ARTISAN_SKILLS.filter((name) => lists.human.includes(name)), []);
  check("no crafting or gathering skill is in the Skill Training list", ARTISAN_SKILLS.filter((name) => lists.training.includes(name)), []);
  check("before / after: the Human list grew by exactly the four skills",
    sorted(lists.human.filter((name) => !OLD_BARRED.has(name))).length + NEWLY_ALLOWED.length, lists.human.length);

  // The lists as the builder screens present them.
  const ids = await page.evaluate(() => ({
    skillTraining: window.__t36.id("breakthrough", "Skill Training"),
    universal: window.__t36.id("breakthrough", "Universal Training")
  }));
  await fixture({ fields: { Name: "List test" }, builder: { selectedRaceId: "human", selectedBreakthroughIds: [ids.skillTraining, ids.universal] } });
  const human = await call("humanSkillChoice");
  check("the Human +5 choice on the skills step lists the rule-derived skills", sorted(human.options), RULE_ALLOWED);
  const trainingChoices = await page.evaluate(() => window.__t36.choiceOptions((choice) =>
    /^skill training: choose the skill for/i.test(choice.label) || /^universal training: assign/i.test(choice.label)));
  check("Skill Training (point), Skill Training (expertise) and Universal Training screens are all present", trainingChoices.length, 3);
  check("each of those screens lists the rule-derived skills", trainingChoices.map((choice) => sorted(choice.options)), [RULE_ALLOWED, RULE_ALLOWED, RULE_ALLOWED]);

  section("A. Existing saves keep working");
  // A Human +5 that was allowed before (Perception) and one that was barred
  // before (Survival), stored the way the builder stores them.
  const perceptionRow = (await call("skillRow", "Perception")).index;
  const survivalRow = (await call("skillRow", "Survival")).index;
  await fixture({
    fields: { Name: "Old save", [`RacialSkillPoint:race-human-skill:${perceptionRow}`]: "3", [`RacialSkillPoint:race-human-skill:${survivalRow}`]: "2" },
    builder: { selectedRaceId: "human" }
  });
  await call("sync");
  const oldPick = await call("humanSkillChoice");
  check("a stored Human +5 split (Perception 3, Survival 2) fills the pool exactly", [oldPick.pool.spent, oldPick.pool.remaining], [5, 0]);
  check("the previously allowed pick (Perception) is still counted", (await call("skillRow", "Perception")).racial, 3);
  check("the newly allowed pick (Survival) persists", (await call("skillRow", "Survival")).racial, 2);
  await fixture({ fields: { Name: "Old save" }, builder: { selectedRaceId: "human", selectedBreakthroughIds: [ids.skillTraining] } });
  const targetId = await call("skillTrainingTarget");
  const modeId = await call("choiceIdByLabel", "skill point or expertise");
  await page.evaluate(([mode]) => window.__t36.setChoice(mode, "skill"), [modeId]);
  await page.evaluate(([target]) => window.__t36.setChoice(target, "Insight"), [targetId]);
  check("a stored Skill Training pick that was allowed before (Insight) still applies", (await call("computedSkillPoints")).Insight, 1);
  await page.evaluate(([target]) => window.__t36.setChoice(target, "Survival"), [targetId]);
  check("a newly allowed Skill Training pick (Survival) applies", (await call("computedSkillPoints")).Survival, 1);
  check("neither Skill Training pick leaves a pending Skill Training choice", (await call("pending")).filter((text) => /skill training/i.test(text)), []);

  // =========================================================================
  section("B. Gunslinger initiative: the key's +1 stacks with On the Draw");
  const gun = await page.evaluate(() => ({
    gunslinger: window.__t36.id("class", "Gunslinger"),
    onTheDraw: window.__t36.id("breakthrough", "On the draw"),
    light: window.__t36.id("item", "Armor (Light)")
  }));
  const gunFixture = ({ onTheDraw, light, gunslinger = true, agility = "4" }) => ({
    fields: { Name: "Gun test", Agility: agility },
    builder: {
      selectedRaceId: "human",
      selectedClassIds: gunslinger ? [gun.gunslinger] : [],
      classAbilityProgress: {},
      selectedBreakthroughIds: onTheDraw ? [gun.onTheDraw] : [],
      selectedItemIds: light ? [gun.light] : []
    },
    play: { inventoryItems: light ? [{ uid: "t36-light", itemId: gun.light, quantity: 1, equipped: true }] : [] }
  });
  const initiative = async (options) => {
    await fixture(gunFixture(options));
    await call("sync");
    return { derived: (await call("derived")).initiative, breakdown: await call("breakdown") };
  };
  const both = await initiative({ onTheDraw: true, light: true });
  check("Gunslinger + On the Draw + Light armor, Agility 4: initiative is 5 (4 + 1 + 1 - 1)", both.derived, 5);
  check("the parts are named: On the Draw +1, Gunslinger key ability +1, Armor (Light) equipped -1",
    both.breakdown.parts, [
      { label: "On the Draw", amount: 1 },
      { label: "Gunslinger key ability", amount: 1 },
      { label: "Armor (Light) equipped", amount: -1 }
    ]);
  check("nothing is left unexplained", [both.breakdown.agility, both.breakdown.other, both.breakdown.total], [4, 0, 5]);
  check("Gunslinger without On the Draw, Light armor: 4 (4 + 1 - 1)", (await initiative({ onTheDraw: false, light: true })).derived, 4);
  check("Gunslinger with On the Draw, no armor: 6 (4 + 1 + 1)", (await initiative({ onTheDraw: true, light: false })).derived, 6);
  check("On the Draw alone (no Gunslinger class), Light armor: 4 (4 + 1 - 1)", (await initiative({ onTheDraw: true, light: true, gunslinger: false })).derived, 4);
  check("no Gunslinger, no On the Draw, no armor: bare Agility 4", (await initiative({ onTheDraw: false, light: false, gunslinger: false })).derived, 4);
  const applied = (await initiative({ onTheDraw: true, light: false })) && (await call("autoApplied"));
  check("the auto-applied list names both initiative bonuses", [applied.includes("On the draw: +1 initiative."), applied.includes("Gunslinger key ability: +1 Initiative.")], [true, true]);
  await fixture(gunFixture({ onTheDraw: true, light: true }));
  await call("sync");
  const rolled = await call("rollInitiative");
  const rollLines = rolled.top.lines.join(" | ");
  check("the roll breakdown names Agility and every part",
    ["Agility: +4", "On the Draw: +1", "Gunslinger key ability: +1", "Armor (Light) equipped: -1"].map((text) => rollLines.includes(text)), [true, true, true, true]);
  // Task 044: the 0.13.2 rulebook rolls initiative as 1d4 + the bonus (it was a d20).
  const totalMatch = rollLines.match(/d4: (\d+)[\s\S]*Total: (\d+)/);
  check("the roll total is the d4 plus the sheet's 5", totalMatch ? Number(totalMatch[2]) - Number(totalMatch[1]) : null, 5);
  check("no 'Other initiative modifiers' lump when every part has a name", /Other initiative modifiers/.test(rollLines), false);
  const sheet = await call("sheetInitiative");
  check("the sheet's Initiative field is 5", [sheet.field, sheet.derived], ["5", 5]);
  check("the play sheet's Initiative card names the parts", sheet.hint, "Agility +4, On the Draw +1, Gunslinger key ability +1, Armor (Light) equipped -1.");

  // Every initiative sentence in the 0.13.2 class, race and breakthrough data.
  const sentences = (text) => String(text || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
  const initiativeTexts = [];
  const scan = (source, name, text) => sentences(text).forEach((sentence) => { if (/initiative/i.test(sentence)) initiativeTexts.push({ source, name, sentence }); });
  const { default: dataWindow } = await (async () => {
    const vm = await import("node:vm");
    const context = { window: {} };
    vm.createContext(context);
    for (const file of ["lyrian-data.js", "lyrian-detail-data.js"]) {
      vm.runInContext(await readFile(path.join(root, "assets/versions/0.13.2", file), "utf8"), context);
    }
    return { default: context.window };
  })();
  for (const entry of dataWindow.LYRIAN_DETAIL_DATA.classes) {
    const key = entry.keyAbility || {};
    [key.benefit1, key.benefit2, key.benefit3, key.benefit4].forEach((text) => scan("key", key.name, text));
    (entry.abilities || []).forEach((ability) => scan("ability", ability.name, ability.descriptionText));
  }
  dataWindow.LYRIAN_DATA.breakthroughs.forEach((entry) => scan("breakthrough", entry.name, entry.description));
  dataWindow.LYRIAN_DETAIL_DATA.races.forEach((entry) => scan("race", entry.name, [entry.attributes, entry.skills, entry.proficiencies].join(" ")));
  dataWindow.LYRIAN_DETAIL_DATA.ancestries.forEach((entry) => (entry.traits || []).forEach((trait) => scan("ancestry", trait.name, trait.descriptionText)));
  const keyTexts = initiativeTexts.filter((entry) => entry.source === "key");
  check("the Gunslinger key is the only key ability with an initiative text", keyTexts.map((entry) => entry.name), ["Gunslinger's Agility"]);
  check("On the Draw is the only breakthrough with an initiative text", initiativeTexts.filter((entry) => entry.source === "breakthrough").map((entry) => entry.name), ["On the draw"]);
  check("no race or ancestry has an initiative text", initiativeTexts.filter((entry) => entry.source === "race" || entry.source === "ancestry").length, 0);
  // Class abilities: all active or per-encounter effects (a bonus granted by using the
  // ability), none a permanent passive. A new one in a later data version fails here.
  check("class abilities that mention initiative (all active effects, not passives)", sorted([...new Set(initiativeTexts.filter((entry) => entry.source === "ability").map((entry) => entry.name))]),
    sorted(["Independent Action", "Share Armor", "Accelerating Strike", "Accelerando", "Raise Undead II", "Secret Art: Skeletal Champion", "Summon Lesser Eidolon", "Secret Art: Summon Eidolon", "Stratagem: Lightning", "Steal Time", "Tailwind"]));

  // =========================================================================
  section("C. A Job pays 300 Clim, 600 while a crafting class is mastered");
  const job = await page.evaluate(() => ({
    artificer: window.__t36.id("class", "Artificer"),
    miner: window.__t36.id("class", "Miner"),
    fighter: window.__t36.id("class", "Fighter")
  }));
  const jobFunds = async (classId, purchased, mode, jobs) => {
    await fixture({
      fields: { Name: "Job test" },
      builder: { selectedRaceId: "human", selectedClassIds: classId ? [classId] : [], classAbilityProgress: classId ? { [classId]: purchased } : {}, creationInterludeActions: jobs, startMode: mode }
    });
    return (await call("funds")).creationInterludeClim;
  };
  check("one Job, no class: 300", await jobFunds("", 0, "standard", ["job"]), 300);
  check("one Job, Artificer mastered (7 abilities): 600", await jobFunds(job.artificer, 7, "standard", ["job"]), 600);
  check("one Job, Artificer only unlocked (not mastered): 300", await jobFunds(job.artificer, 3, "standard", ["job"]), 300);
  check("one Job, Miner mastered (a gathering class): 300", await jobFunds(job.miner, 7, "standard", ["job"]), 300);
  check("one Job, Fighter mastered (not a crafting class): 300", await jobFunds(job.fighter, 7, "standard", ["job"]), 300);
  check("two Jobs, Artificer mastered: 1200 (the bonus is per Job, not once)", await jobFunds(job.artificer, 7, "standard", ["job", "job"]), 1200);
  check("one Job, Artificer mastered, Mirane start: 600 (creation uses the rulebook rate)", await jobFunds(job.artificer, 7, "mirane", ["job"]), 600);
  check("Train and Other pay no Clim", await jobFunds(job.artificer, 7, "standard", ["train", "other"]), 0);

  // =========================================================================
  section("D. Pick-one proficiency grants count only the chosen group");
  const classIds = await page.evaluate(() => ({
    fusilier: window.__t36.id("class", "Fusilier"),
    carpenter: window.__t36.id("class", "Carpenter")
  }));
  const tracked = (hint) => hint.startsWith("Proficiency tracked");
  const hints = async (names) => Object.fromEntries(await Promise.all(names.map(async (name) => [name, tracked(await call("hintFor", name))])));
  const WEAPONS = ["Pistol (One-Handed)", "Musket (Two-Handed)", "Crossbow (One-Handed)", "Bow (Two-Handed)", "Axe (Two-Handed)"];
  await fixture({ fields: { Name: "Fusilier" }, builder: { selectedRaceId: "chimera", selectedClassIds: [classIds.fusilier] } });
  await call("sync");
  check("Fusilier ('pistols, muskets or crossbows'): none of the three is credited", await hints(WEAPONS.slice(0, 3)), { "Pistol (One-Handed)": false, "Musket (Two-Handed)": false, "Crossbow (One-Handed)": false });
  await fixture({ fields: { Name: "Carpenter" }, builder: { selectedRaceId: "chimera", selectedClassIds: [classIds.carpenter] } });
  await call("sync");
  check("Carpenter with no pick: neither Bow nor Crossbow is credited, Axes (granted outright) is", await hints(WEAPONS.slice(2)), { "Crossbow (One-Handed)": false, "Bow (Two-Handed)": false, "Axe (Two-Handed)": true });
  const carpenterChoice = await call("choiceIdByLabel", "carpenter: choose bows or crossbows");
  check("Carpenter has a Bow or Crossbow pick", Boolean(carpenterChoice), true);
  await page.evaluate(([id]) => window.__t36.setChoice(id, "Bow"), [carpenterChoice]);
  check("Carpenter picks Bow: only Bow is credited", await hints(WEAPONS.slice(2)), { "Crossbow (One-Handed)": false, "Bow (Two-Handed)": true, "Axe (Two-Handed)": true });
  await page.evaluate(([id]) => window.__t36.setChoice(id, "Crossbow"), [carpenterChoice]);
  check("Carpenter picks Crossbow: only Crossbow is credited", await hints(WEAPONS.slice(2)), { "Crossbow (One-Handed)": true, "Bow (Two-Handed)": false, "Axe (Two-Handed)": true });

  // The classes that name their groups in the plural outright still get them.
  const OUTRIGHT = [
    ["Gunslinger", "Pistol (One-Handed)"], ["Mogul", "Pistol (One-Handed)"], ["Tactician", "Pistol (One-Handed)"],
    ["Idol", "Wand (One-Handed)"], ["Maid", "Set of Missiles (One-Handed)"], ["Ninja", "Set of Missiles (One-Handed)"],
    ["Ninja", "Small Weapons (One-Handed)"], ["Cavalier", "Lance (One-Handed)"], ["Botanist", "Chainsaw Artifice (Two-Handed Weapon)"]
  ];
  for (const [className, weapon] of OUTRIGHT) {
    const id = await page.evaluate(([name]) => window.__t36.id("class", name), [className]);
    await fixture({ fields: { Name: className }, builder: { selectedRaceId: "chimera", selectedClassIds: [id] } });
    await call("sync");
    const hint = await call("hintFor", weapon);
    check(`${className} still gets ${weapon} (granted outright)`, [hint === "missing item", tracked(hint)], [false, true]);
  }
  const rangerId = await page.evaluate(() => window.__t36.id("class", "Ranger"));
  await fixture({ fields: { Name: "Ranger" }, builder: { selectedRaceId: "chimera", selectedClassIds: [rangerId] } });
  await call("sync");
  check("Ranger still gets Light Armor ('light and medium armor')", await call("groupTracked", "Light Armor"), true);

  // All 185 classes, every armor and weapon label: the only difference from the
  // task 030 matcher is the two over-credited pick-one lists.
  const sweep = await call("matcherSweep");
  check("185 classes compared", sweep.length, 185);
  const changed = sweep.filter((row) => row.oldOnly.length || row.newOnly.length);
  // Task 038 item 9 (036 audit finding 3) applies the pick-one rule to every
  // way of naming a group, so the three pick-one classes the plain name still
  // over-credited change too (Forager, Miner, Adventurer), and so do three
  // classes whose either/or sentence only mentions a group without granting it
  // (Colossus "a second weapon or shield", Nomad "light armor or no armor",
  // Peltast "a throwing weapon, or ... the light sword passive").
  check("only Fusilier and Carpenter (036) and the task 038 pick-one and mention-only classes change", changed.map((row) => row.name).sort(),
    ["Adventurer", "Carpenter", "Colossus", "Forager", "Fusilier", "Miner", "Nomad", "Peltast"]);
  const lostBy = (name) => (changed.find((row) => row.name === name)?.oldOnly || []).slice().sort();
  check("task 038: Forager, Miner and Adventurer lose only their pick-one groups; the mention-only classes lose only the mentioned groups",
    { Adventurer: lostBy("Adventurer"), Forager: lostBy("Forager"), Miner: lostBy("Miner"), Colossus: lostBy("Colossus"), Nomad: lostBy("Nomad"), Peltast: lostBy("Peltast") },
    { Adventurer: ["Greatshields", "Shields"], Forager: ["Axes"], Miner: ["Shields"], Colossus: ["Shields"], Nomad: ["Light Armor"], Peltast: ["Light Swords", "Thrown"] });
  check("Fusilier loses Pistol, Musket and Crossbow", changed.find((row) => row.name === "Fusilier").oldOnly.sort(), ["Crossbow", "Musket", "Pistol"]);
  check("Carpenter loses Bow and Crossbow (Axes stays)", [changed.find((row) => row.name === "Carpenter").oldOnly.sort(), changed.find((row) => row.name === "Carpenter").both.includes("Axes")], [["Bow", "Crossbow"], true]);
  check("no class gains a group", sweep.filter((row) => row.newOnly.length).length, 0);
  const plural = sweep.filter((row) => ["Gunslinger", "Mogul", "Tactician", "Idol", "Maid", "Ninja", "Cavalier", "Botanist", "Ranger"].includes(row.name));
  check("the nine classes the task 030 matcher got right keep every group it gave them", plural.filter((row) => row.oldOnly.length).length, 0);

  // =========================================================================
  section("E. Quick Build: skills, spare Interlude Points, Gunslinger initiative");
  await freshPage();
  const ROLES = ["hunter-archer", "gadgeteer", "gunslinger", "potion-healer", "cleric-support", "scout-sniper-path", "control-wizard", "shield-warrior"];
  const quick = {};
  for (const species of ["human", "catfolk", "demon"]) {
    await freshPage();
    quick[species] = await page.evaluate(([id, builds]) => window.__t36.quickApply("standard", id, builds), [species, ROLES]);
  }
  await freshPage();
  const miraneCatfolk = await page.evaluate(([builds]) => window.__t36.quickApply("mirane", "catfolk", builds), [ROLES]);
  const total = (run, skill) => run.skills.find((entry) => entry.name === skill)?.total || 0;
  const points = (run, skill) => run.skills.find((entry) => entry.name === skill)?.points || 0;
  const archerHuman = quick.human["hunter-archer"];
  const archerCat = quick.catfolk["hunter-archer"];
  check("Hunter Archer (Catfolk) Skill Training: Perception, Stealth, Survival, Animal Husbandry", sorted(archerCat.stPicks), sorted(["Perception", "Stealth", "Survival", "Animal Husbandry"]));
  check("Hunter Archer (Human) Skill Training uses Survival and Animal Husbandry", ["Survival", "Animal Husbandry"].every((name) => archerHuman.stPicks.includes(name)), true);
  check("Hunter Archer: Stealth, Survival and Animal Husbandry are all at least 11 for a Human and a Catfolk",
    [archerHuman, archerCat].map((run) => ["Stealth", "Survival", "Animal Husbandry", "Perception"].map((skill) => total(run, skill) >= 11)), [[true, true, true, true], [true, true, true, true]]);
  const gadgetHuman = quick.human.gadgeteer;
  check("Gadgeteer (Human): the +5 goes to Artifice, the role's main skill", points(gadgetHuman, "Artifice") >= 14, true);
  check("Gadgeteer: Artifice is its top skill for a Human and a Catfolk", [quick.human.gadgeteer, quick.catfolk.gadgeteer].map((run) => run.skills.slice().sort((a, b) => b.points - a.points)[0].name), ["Artifice", "Artifice"]);

  const everyRun = [];
  for (const [label, group] of [["human", quick.human], ["catfolk", quick.catfolk], ["demon", quick.demon], ["catfolk-mirane", miraneCatfolk]]) {
    for (const [buildId, run] of Object.entries(group)) everyRun.push({ key: `${label}/${buildId}`, buildId, label, run });
  }
  const crafters = new Set(["gadgeteer", "potion-healer"]);
  const jobProblems = [];
  for (const { key, buildId, run } of everyRun) {
    const perJob = crafters.has(buildId) ? 600 : 300;
    if (run.ip !== 3 || run.ipRemaining !== 0) jobProblems.push(`${key}: IP ${run.ip} used, ${run.ipRemaining} left`);
    if (run.jobs + run.classIp !== 3) jobProblems.push(`${key}: ${run.classIp} class IP + ${run.jobs} Jobs`);
    if (run.jobClim !== run.jobs * perJob) jobProblems.push(`${key}: Job Clim ${run.jobClim}, expected ${run.jobs * perJob}`);
    if (!run.summary.includes("Interlude Points:")) jobProblems.push(`${key}: no Interlude Points line in the build summary`);
    if (!/spare points? goes? to a Job|spare points go to \d Jobs/.test(run.summary)) jobProblems.push(`${key}: summary does not say the spare point(s) go to Job(s)`);
    if (run.clim < 0) jobProblems.push(`${key}: Clim ${run.clim}`);
  }
  check("every sampled Quick Build spends all 3 starting IP (classes + Jobs) and credits the Job at the rulebook rate", jobProblems, []);
  check("a Demon clan with a free class has 2 spare points: Cleric Support and Potion Healer get 2 Jobs", [quick.demon["cleric-support"].jobs, quick.demon["potion-healer"].jobs], [2, 2]);
  check("everyone else sampled has exactly 1 Job", everyRun.filter(({ label, buildId }) => label !== "demon" || !["cleric-support", "potion-healer"].includes(buildId)).filter(({ run }) => run.jobs !== 1).map(({ key }) => key), []);
  check("the role details preview the Job before Continue", quick.catfolk["gadgeteer"].detail.includes("a mastered crafting class doubles the Job") && quick.catfolk["shield-warrior"].detail.includes("goes to a Job for +300 Clim"), true);
  const gunHuman = quick.human.gunslinger;
  check("Gunslinger (Human) shows initiative Agility + 1 + 1 - 1 on the sheet", gunHuman.initiative, gunHuman.agility + 1);
  check("Gunslinger's labeled parts: On the Draw, key ability, Light armor", gunHuman.parts.map((part) => `${part.label} ${part.amount}`), ["On the Draw 1", "Gunslinger key ability 1", "Armor (Light) equipped -1"]);
  check("Gunslinger's build summary has the Interlude Points line", gunHuman.summary.includes("Interlude Points:"), true);

  check("No uncaught browser JavaScript errors", pageErrors, []);
  console.log(`\n${passed} passed, ${failures.length} failed. Evidence: ${output}`);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed, failed: failures.length, failures, lists, matcher: changed, quick: Object.fromEntries(Object.entries(quick).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([b, run]) => [b, { ...run, detail: undefined, summary: undefined }]))])) }, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: error.stack, failures, serverLog }, null, 2));
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
