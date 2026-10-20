// Task 030 checks: every Quick Build character is min-maxed and legal.
//
// What this proves, for every Quick Build species x every build, in the
// Standard and Mirane starts (21 x 15 x 2 = 630 characters, applied through the
// real Quick Build screens):
//   1. Class EXP is fully spent (Human 1100 / 1100, everyone else 1000 / 1000),
//      breakthrough EXP is 300 of 300, at most 3 Interlude Points are used, and
//      Clim is never negative.
//   2. No racial or class skill pool has a point left to assign, no skill is
//      over the 15-point cap, and the builder lists no pending choice at all.
//   3. Every equipped weapon, armor and shield is covered by a granted
//      proficiency (independent oracle: the fixed grants read by hand from the
//      0.13.2 key abilities below, plus the stored picks), and the builder's
//      own proficiency hint says "Proficiency tracked" for each weapon.
//   4. No weapon group is granted twice when one of the grants is a pick
//      (class weapon choice, Human weapon group, Weapon Training, Speciality
//      Weapon Training).
//   5. No selected class or breakthrough reports "requirements not met".
//   6. Every Skill Training pick is in the builder's own Skill Training list.
//   7. Carried burden is at most 10 (the rulebook limit), and the Mirane start
//      removes nothing from any package.
//   8. Gunslinger has the Gunslinger class and two pistols; Scout Sniper has
//      Speciality Weapon Training (Sniper Rifle) and a Sniper Rifle; the Human
//      note says what the extra 100 EXP buys.
//   9. (task 036) Every starting Interlude Point is used: the classes take some
//      and each spare one is a Job, credited at the rulebook rate (300 Clim, 600
//      while a crafting class is mastered). Nothing is left over, in both start
//      modes.
//  10. (task 036) The Gunslinger's sheet initiative is Agility + the key's +1 +
//      On the Draw's +1 - Light armor's 1, with each part named.
// Plus: choosing Demon and then Human no longer leaves a stale Demon clan as the
// identity (or as the Human's ancestry after a role is applied), and the owner's
// live-check items show on the Review screen.
//
// The real src/js is bundled in memory with a test-only hook block appended to
// ui.js (the test-025/029 pattern); nothing in the shipped source is altered.
//
// Run:  node scripts/test-030-quick-build-minmax.mjs   (npm run test:030)
// Env:  T30_PORT (default 4260); T30_SPECIES=human,catfolk limits the sweep.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "qa-test-results/task-030-quick-build-minmax");
await mkdir(output, { recursive: true });
const port = Number(process.env.T30_PORT || 4260);
const url = `http://localhost:${port}/`;
const speciesFilter = (process.env.T30_SPECIES || "").split(",").map((entry) => entry.trim()).filter(Boolean);

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
const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const EXPECTED_BUILDS = [
  "shield-warrior", "great-weapon-striker", "seven-sorrows-rush", "sneak-thief", "unarmed-monk",
  "hunter-archer", "scout-sniper-path", "gunslinger", "control-wizard", "elemental-blaster",
  "cleric-support", "performance-support", "bard-expertise-rush", "gadgeteer", "potion-healer"
];

// Independent oracle: what each class key grants outright, read by hand from
// the 0.13.2 key abilities (assets/versions/0.13.2/lyrian-detail-data.js).
// Groups a class only offers as a choice are not listed; the stored pick
// covers them. "Channeling Weapons" covers wands and staves.
const CLASS_FIXED_GRANTS = {
  fighter: ["Light Armor", "Medium Armor", "Shields"],
  guardian: ["Heavy Armor"],
  rogue: ["Light Armor"],
  saboteur: ["Saboteur Thread Daggers"],
  mage: ["Channeling Weapons"],
  "martial artist": ["Unarmed"],
  cultivator: ["Unarmed", "Light Armor", "Light Swords"],
  ranger: ["Light Armor", "Medium Armor"],
  gunslinger: ["Pistol"],
  sorcerer: ["Channeling Weapons", "Light Armor"],
  acolyte: ["Light Armor", "Shields"],
  medic: ["Small Weapons", "Set of Missiles", "Light Armor"],
  idol: ["Wands", "Small Weapons", "Light Armor"],
  maid: ["Staves", "Small Weapons", "Set of Missiles", "Light Armor"],
  artificer: ["Musket"],
  miner: ["Pickaxe"]
};
const BREAKTHROUGH_GRANTS = {
  "greatshield training": ["Greatshields"],
  "light armor training": ["Light Armor", "Shields"],
  "medium armor training": ["Medium Armor"],
  "heavy armor training": ["Heavy Armor"]
};
const WEAPON_GROUPS = new Set([
  "Small Weapons", "Polearms", "Light Swords", "Longsword", "Dueling Weapons", "Axes", "Bludgeoning Weapons",
  "Katana", "Heavy Blades", "Twinblade", "Thrown", "Set of Missiles", "Bow", "Crossbow", "Musket", "Sling",
  "Pistol", "Shotgun", "Sniper Rifle", "Saboteur Thread Daggers", "Lance", "Whip", "Chainsaw", "Channeling Weapons",
  "Wands", "Staves", "Unarmed", "Pickaxe"
].map(norm));
// Which proficiency an item needs, by its 0.13.2 name. Items not listed
// (kits, tools, potions, shells, gadgets) need none.
const ITEM_PROFICIENCY = [
  [/^Pistol\b/, "Pistol"], [/^Sniper Rifle\b/, "Sniper Rifle"], [/^Shotgun\b/, "Shotgun"], [/^Musket\b/, "Musket"],
  [/^Crossbow\b/, "Crossbow"], [/^Bow\b/, "Bow"], [/^Small Weapons\b/, "Small Weapons"], [/^Light Sword\b/, "Light Swords"],
  [/^Longsword\b/, "Longsword"], [/^Katana\b/, "Katana"], [/^Axe\b/, "Axes"], [/^Dueling Weapon\b/, "Dueling Weapons"],
  [/^Bludgeoning Weapon\b/, "Bludgeoning Weapons"], [/^Thrown\b/, "Thrown"], [/^Set of Missiles\b/, "Set of Missiles"],
  [/^Polearm\b/, "Polearms"], [/^Heavy Blade\b/, "Heavy Blades"], [/^Wand\b/, "Wands"], [/^Staff\b/, "Staves"],
  [/^Gauntlets\b/, "Unarmed"], [/^Armor \(Light\)/, "Light Armor"], [/^Armor \(Medium\)/, "Medium Armor"],
  [/^Armor \(Heavy\)/, "Heavy Armor"], [/^Shield \(Great\)/, "Greatshields"], [/^Shield$/, "Shields"]
];
const itemProficiency = (name) => ITEM_PROFICIENCY.find(([pattern]) => pattern.test(name))?.[1] || "";
const covers = (granted, need) => {
  const n = norm(need);
  return granted.has(n)
    || ((n === "wands" || n === "staves") && granted.has(norm("Channeling Weapons")));
};

// ---------------------------------------------------------------------------
// Test-only hooks, appended to ui.js in the in-memory bundle.
// ---------------------------------------------------------------------------
const hooks = `
window.__t30 = {
  read() {
    const budget = getClassUnlockBudgetState();
    const funds = getStartingFundsState();
    const effects = getSelectedBreakthroughEffects();
    const classChoiceIds = new Set();
    getSelectedClassProgress().forEach(({ record }) => getClassProficiencyChoiceDefinitions(record).forEach((choice) => classChoiceIds.add(choice.id)));
    const inventory = getPlayInventoryEntries().map((entry) => {
      const record = findRecordByName(lookup.items.entries, entry.name);
      const hint = record && entry.equipped ? getWeaponProficiencyHintText(record) : "";
      return { name: entry.name, quantity: Math.max(1, toNumber(entry.quantity, 1)), equipped: Boolean(entry.equipped), hint };
    });
    const skillTrainingPicks = getBuilderChoiceDefinitions()
      .filter((choice) => isBuilderChoiceVisible(choice) && normalizePhrase(choice.source).startsWith("skill training") && /choose the skill for \\+1/i.test(choice.label))
      .map((choice) => getBuilderChoiceValue(choice.id));
    return {
      race: getSelectedRaceDetail()?.name || "",
      ancestry: getSelectedAncestryDetail()?.name || "",
      classes: getSelectedClassProgress().map((entry) => ({ name: entry.record.name, purchased: entry.purchasedCount, met: getClassRequirementStatus(entry.record).met })),
      exp: { spent: budget.spentExp, budget: budget.expBudget, remaining: budget.remainingExp, ip: budget.spentInterlude, ipRemaining: budget.remainingInterlude, classIp: budget.spentClassInterlude },
      jobs: (state.builder.creationInterludeActions || []).filter((id) => id === "job").length,
      otherActions: (state.builder.creationInterludeActions || []).filter((id) => id !== "job"),
      jobClim: funds.creationInterludeClim,
      initiative: getDerivedCombatStats().initiative,
      agility: getComputedMainStatValue("Agility"),
      initiativeParts: getInitiativeBreakdown().parts.map((part) => part.label + " " + part.amount),
      breakthroughs: getSelectedBreakthroughRecords().map((record) => ({ name: record.name, cost: parseNumericCost(record.cost), met: getBreakthroughRequirementStatus(record).met })),
      clim: funds.availableClim,
      pools: [...getVisibleRacialSkillPoolChoices().map((choice) => ({ id: choice.id, ...getRacialSkillPoolState(choice) })),
        ...getVisibleClassSkillPoolChoices().map((choice) => ({ id: choice.id, ...getClassSkillPoolState(choice) }))]
        .map((pool) => ({ id: pool.id, remaining: pool.remaining })),
      overCap: SKILL_DEFINITIONS.map((definition, index) => ({ name: definition.name, uncapped: getSkillRowData(index + 1).uncappedSkillPoints })).filter((row) => row.uncapped > 15),
      pending: [...effects.pendingChoices],
      choices: { ...(state.builder.choiceSelections || {}) },
      classChoiceIds: [...classChoiceIds],
      inventory,
      burden: getInventoryBurdenState().carriedBurden,
      skillTrainingPicks,
      skillTrainingAllowed: getSkillTrainingSkillOptions(),
      summary: state.builder.quickBuild?.summary || "",
      identity: (document.querySelector("#builder-summary")?.textContent || "").replace(/\\s+/g, " ")
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
        const detail = (document.getElementById("builder-detail-card")?.textContent || "").replace(/\\s+/g, " ");
        click("#builder-next");
        const review = [...document.querySelectorAll(".review-panel")].map((panel) => panel.textContent.replace(/\\s+/g, " ").trim());
        runs.push({ mode, species: species.id, build: entry.id, startMode: state.builder.startMode, detail, review, ...this.read() });
        click('[data-quick-build-action="back-to-build"]');
      }
    }
    return runs;
  },
  buildIds() { return QUICK_BUILD_ROLES.flatMap((role) => role.builds.map((entry) => entry.id)); }
};`;

const bundle = await build({
  absWorkingDir: root,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "task030-test-access", setup(buildApi) {
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

  // -------------------------------------------------------------------------
  section("The built bundle carries the task 030 builds and text");
  const built = await readFile(path.join(root, "assets/app.bundle.js"), "utf8");
  check("built bundle has the Gunslinger build", built.includes('id: "gunslinger"') || built.includes('id:"gunslinger"'), true);
  check("built bundle has the Scout Sniper label", built.includes('"Scout Sniper"'), true);
  check("built bundle has the Human EXP sentence", built.includes("The extra 100 Human EXP buys"), true);
  check("built bundle no longer says the Human EXP is banked", built.includes("is kept in your EXP bank"), false);

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
    await page.waitForFunction(() => window.__t30 && window.LYRIAN_DATA?.version === "0.13.2" && (document.getElementById("builder-step-content")?.innerHTML || "").length > 100);
    await page.waitForTimeout(1600); // the production idle sheet build
  };

  // -------------------------------------------------------------------------
  section("Quick Build offers the 15 builds");
  await freshPage();
  check("build list", await page.evaluate(() => window.__t30.buildIds()), EXPECTED_BUILDS);

  // -------------------------------------------------------------------------
  const allRuns = [];
  for (const mode of ["standard", "mirane"]) {
    await freshPage();
    const runs = await page.evaluate(([startMode, filter]) => window.__t30.sweep(startMode, filter), [mode, speciesFilter]);
    allRuns.push(...runs);
  }
  section(`Sweep: ${allRuns.length} characters (species x builds x start modes)`);
  const speciesSeen = new Set(allRuns.map((run) => run.species));
  if (!speciesFilter.length) {
    check("sweep covers 21 species x 15 builds x 2 modes", allRuns.length, 21 * 15 * 2);
  }
  const fixedOverlaps = new Set();
  const perRun = [];
  for (const run of allRuns) {
    const key = `${run.mode}/${run.species}/${run.build}`;
    const human = run.race === "Human";
    const problems = [];
    const expBudget = human ? 1100 : 1000;
    if (run.startMode !== run.mode) problems.push(`start mode ${run.startMode}`);
    if (run.exp.spent !== expBudget || run.exp.budget !== expBudget || run.exp.remaining !== 0) problems.push(`class EXP ${run.exp.spent}/${run.exp.budget}`);
    const btSpent = run.breakthroughs.reduce((total, entry) => total + entry.cost, 0);
    if (btSpent !== 300) problems.push(`breakthrough EXP ${btSpent}`);
    if (run.exp.ip !== 3 || run.exp.ipRemaining !== 0) problems.push(`IP ${run.exp.ip} used, ${run.exp.ipRemaining} left`);
    // Task 036: spare starting IP are Jobs, paid at the rulebook rate.
    const crafter = run.classes.some((entry) => entry.met && ["Artificer", "Alchemist"].includes(entry.name) && entry.purchased >= 7);
    if (run.otherActions.length) problems.push(`creation actions other than Job: ${run.otherActions}`);
    if (run.jobs + run.exp.classIp !== 3) problems.push(`class IP ${run.exp.classIp} + Jobs ${run.jobs} is not 3`);
    if (run.jobs < 1) problems.push("no spare IP went to a Job");
    if (run.jobClim !== run.jobs * (crafter ? 600 : 300)) problems.push(`Job Clim ${run.jobClim} for ${run.jobs} Job(s), crafter ${crafter}`);
    if (!run.summary.includes("Interlude Points:")) problems.push("build summary has no Interlude Points line");
    if (run.clim < 0) problems.push(`Clim ${run.clim}`);
    const stranded = run.pools.filter((pool) => pool.remaining !== 0);
    if (stranded.length) problems.push(`unassigned skill points ${JSON.stringify(stranded)}`);
    if (run.overCap.length) problems.push(`over cap ${JSON.stringify(run.overCap)}`);
    if (run.pending.length) problems.push(`pending ${run.pending.join(" | ")}`);
    if (run.classes.some((entry) => !entry.met)) problems.push(`class requirements not met ${run.classes.filter((entry) => !entry.met).map((entry) => entry.name)}`);
    if (run.breakthroughs.some((entry) => !entry.met)) problems.push(`breakthrough requirements not met ${run.breakthroughs.filter((entry) => !entry.met).map((entry) => entry.name)}`);
    const badTraining = run.skillTrainingPicks.filter((skill) => !run.skillTrainingAllowed.includes(skill));
    if (badTraining.length) problems.push(`Skill Training outside the list ${badTraining}`);
    if (run.burden > 10) problems.push(`burden ${run.burden}`);

    // Grants: oracle fixed grants plus every stored pick.
    const grants = [];
    run.classes.forEach((entry) => (CLASS_FIXED_GRANTS[norm(entry.name)] || []).forEach((group) => grants.push({ group, source: entry.name, pick: false })));
    run.breakthroughs.forEach((entry) => (BREAKTHROUGH_GRANTS[norm(entry.name)] || []).forEach((group) => grants.push({ group, source: entry.name, pick: false })));
    run.classChoiceIds.forEach((id) => { if (run.choices[id]) grants.push({ group: run.choices[id], source: id, pick: true }); });
    if (human && run.choices["race-human-weapon-group"]) grants.push({ group: run.choices["race-human-weapon-group"], source: "Human", pick: true });
    if (run.race === "Demon" && run.choices["race-demon-bonus-mode"] === "weapon" && run.choices["race-demon-weapon-group"]) grants.push({ group: run.choices["race-demon-weapon-group"], source: "Demon", pick: true });
    ["breakthrough-weapon-training-groups", "breakthrough-speciality-weapon-training-groups"].forEach((id) => String(run.choices[id] || "").split("|").filter(Boolean)
      .forEach((group) => grants.push({ group, source: id, pick: true })));
    const granted = new Set(grants.map((entry) => norm(entry.group)));
    const uncovered = run.inventory.filter((entry) => entry.equipped && itemProficiency(entry.name) && !covers(granted, itemProficiency(entry.name)))
      .map((entry) => `${entry.name} needs ${itemProficiency(entry.name)}`);
    if (uncovered.length) problems.push(`not proficient: ${uncovered.join("; ")}`);
    const untracked = run.inventory.filter((entry) => entry.equipped && entry.hint && !entry.hint.startsWith("Proficiency tracked")).map((entry) => `${entry.name}: ${entry.hint}`);
    if (untracked.length) problems.push(`builder hint: ${untracked.join("; ")}`);
    const weaponGrants = grants.filter((entry) => WEAPON_GROUPS.has(norm(entry.group)));
    weaponGrants.forEach((entry, index) => weaponGrants.slice(index + 1).forEach((other) => {
      if (norm(entry.group) !== norm(other.group)) return;
      if (entry.pick || other.pick) problems.push(`duplicate grant ${entry.group}: ${entry.source} + ${other.source}`);
      else fixedOverlaps.add(`${run.build}: ${entry.group} (${entry.source} + ${other.source})`);
    }));

    // Build-specific promises.
    const items = run.inventory;
    if (run.build === "gunslinger") {
      if (run.initiative !== run.agility + 1) problems.push(`initiative ${run.initiative}, expected Agility ${run.agility} + 1`);
      if (JSON.stringify(run.initiativeParts) !== JSON.stringify(["On the Draw 1", "Gunslinger key ability 1", "Armor (Light) equipped -1"])) problems.push(`initiative parts ${run.initiativeParts}`);
      const pistols = items.find((entry) => entry.name === "Pistol (One-Handed)");
      if (!run.classes.some((entry) => entry.name === "Gunslinger")) problems.push("Gunslinger class missing");
      if (!pistols || pistols.quantity !== 2 || !pistols.equipped) problems.push(`pistols ${JSON.stringify(pistols)}`);
    }
    if (run.build === "scout-sniper-path") {
      const rifle = items.find((entry) => entry.name === "Sniper Rifle (Two-Handed)");
      if (!run.breakthroughs.some((entry) => entry.name === "Speciality Weapon Training") || run.choices["breakthrough-speciality-weapon-training-groups"] !== "Sniper Rifle") problems.push("Speciality Weapon Training (Sniper Rifle) missing");
      if (!rifle || !rifle.equipped) problems.push("Sniper Rifle missing");
    }
    if (human) {
      if (!run.summary.includes("The extra 100 Human EXP buys")) problems.push("Human note does not say what the 100 EXP buys");
      if (!run.review.some((text) => text.includes(`Spent 1100 / 1100; remaining 0`))) problems.push("review EXP panel not 1100 / 1100");
    }
    if (run.summary.includes("kept in your EXP bank")) problems.push("old banked-EXP text");
    if (run.summary.includes("Unavailable in Mirane and removed:")) problems.push("Mirane removed part of the package");
    if (run.ancestry && /NONE/.test(run.ancestry) && run.race !== "Demon") problems.push(`stale ancestry ${run.ancestry}`);
    if (human && run.ancestry) problems.push(`Human has ancestry ${run.ancestry}`);
    perRun.push({ key, problems });
  }
  const bySpecies = {};
  perRun.forEach(({ key, problems }) => {
    const [mode, species] = key.split("/");
    const bucket = (bySpecies[`${mode}/${species}`] ||= []);
    problems.forEach((problem) => bucket.push(`${key.split("/")[2]}: ${problem}`));
  });
  Object.entries(bySpecies).forEach(([name, problems]) => check(`${name}: all 15 builds clean`, problems, []));
  console.log(`   ${speciesSeen.size} species, ${perRun.filter((entry) => !entry.problems.length).length} of ${perRun.length} characters clean.`);
  console.log(`   Fixed-grant overlaps (two class keys naming the same group; no pick involved): ${fixedOverlaps.size ? [...fixedOverlaps].slice(0, 6).join("; ") : "none"}`);

  // -------------------------------------------------------------------------
  section("Choosing Demon and then Human leaves no stale Demon clan");
  await freshPage();
  const staleResult = await page.evaluate(() => {
    window.confirm = () => true;
    const click = (selector) => document.querySelector(selector).click();
    click("#quick-build-entry");
    click('[data-quick-build-action="select-species"][data-id="demon"]');
    const demonIdentity = (document.querySelector("#builder-summary")?.textContent || "").replace(/\s+/g, " ");
    click('[data-quick-build-action="select-species"][data-id="human"]');
    const humanIdentity = (document.querySelector("#builder-summary")?.textContent || "").replace(/\s+/g, " ");
    click("#builder-next");
    click("#builder-next");
    click('[data-quick-build-action="select-build"][data-id="cleric-support"]');
    click("#builder-next");
    return { demonIdentity, humanIdentity, ...window.__t30.read() };
  });
  check("Demon identity shows the clan placeholder", staleResult.demonIdentity.includes("Demon"), true);
  check("Human identity right after Demon has no Demon clan", /NONE|Those without family skills/.test(staleResult.humanIdentity), false);
  check("Human identity right after Demon reads Human", staleResult.humanIdentity.includes("Human"), true);
  check("Human Cleric after Demon has no ancestry", staleResult.ancestry, "");
  check("Human Cleric after Demon pays for Medic itself (EXP 1100 / 1100)", staleResult.exp.spent, 1100);

  // -------------------------------------------------------------------------
  section("Owner live-check items on the Review screen");
  const reviewOf = (species, buildId) => allRuns.find((run) => run.mode === "standard" && run.species === species && run.build === buildId);
  if (!speciesFilter.length || (speciesFilter.includes("human") && speciesFilter.includes("catfolk"))) {
    const gun = reviewOf("human", "gunslinger");
    check("Human Gunslinger review lists the Gunslinger key", gun.review.some((text) => text.includes("Gunslinger")), true);
    check("Human Gunslinger review lists two pistols", gun.review.some((text) => text.includes("Pistol (One-Handed) x2")), true);
    check("Human Gunslinger review EXP 1100 / 1100", gun.review.some((text) => text.includes("Spent 1100 / 1100")), true);
    const sniper = reviewOf("catfolk", "scout-sniper-path");
    check("Catfolk Scout Sniper review lists the Sniper Rifle", sniper.review.some((text) => text.includes("Sniper Rifle (Two-Handed)")), true);
    check("Catfolk Scout Sniper review lists Speciality Weapon Training (Sniper Rifle)", sniper.review.some((text) => text.includes("Speciality Weapon Training: Sniper Rifle")), true);
    const gadget = reviewOf("catfolk", "gadgeteer");
    check("Gadgeteer keeps Rich Parents and buys its gadgets (D7)", {
      richParents: gadget.breakthroughs.map((entry) => entry.name),
      gadgets: ["Silencer", "Grappling Hook Artifice", "Artificer's Kit", "Artificer's Multitool", "Musket (Two-Handed)"].every((name) => gadget.inventory.some((entry) => entry.name === name))
    }, { richParents: ["Rich Parents"], gadgets: true });
  }

  check("No uncaught browser JavaScript errors", pageErrors, []);
  console.log(`\n${passed} passed, ${failures.length} failed. Evidence: ${output}`);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed, failed: failures.length, failures, perRun, fixedOverlaps: [...fixedOverlaps] }, null, 2));
  await writeFile(path.join(output, "runs.json"), JSON.stringify(allRuns.map(({ detail, review, ...rest }) => rest), null, 1));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: error.stack, failures, serverLog }, null, 2));
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
