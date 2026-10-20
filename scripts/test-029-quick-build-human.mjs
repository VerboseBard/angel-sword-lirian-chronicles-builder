// Task 029 checks: Quick Build never shows race choice dropdowns, no control on
// a Quick Build screen drops the player onto an Advanced Build screen, and a
// Human's racial bonuses are picked for the chosen role and shown before
// Continue and in the review.
//
// What this proves:
//   1. The built app bundle carries the new Human text (a stale build fails).
//   2. Quick Build -> Human / Demon / Catfolk -> Continue: the Name screen has
//      no builder choice controls and no "Profile Choices" box.
//   3. Typing in every profile text field keeps the Quick Build body, header
//      and detail panel. A guard: the old profile choice box is injected into
//      the Quick Build body (it is no longer rendered there) and its dropdowns
//      and Clear button are used; the page must stay on Quick Build.
//   4. All 15 roles as Human, in Standard and Mirane starts: the role detail
//      shows the Human picks before Continue, the review summary shows the
//      same text, the stored picks match the per-role table, the weapon group
//      is not one a class already grants, all 5 Human skill points are
//      placed, no skill goes over the 15-point cap, no class skill points are
//      left unplaced, and the +100 Human EXP buys the role's next ability
//      (1100 / 1100; task 030 replaced the old "kept in your EXP bank").
//   5. Catfolk, Bearfolk (both Chimera) and Demon: every role's stored result
//      is byte-for-byte the recorded one (digests re-recorded on the task 030
//      code with T29_RECORD=1; task 030 changed every role on purpose).
//   6. (029 audit follow-ups) The Human weapon pick really avoids a group a
//      class already picked: the test forces a collision (a role's Human group
//      set to the group its class picks) and checks the stored pick moved to a
//      group no class grants; this fails if the de-duplication is switched off
//      or the Human pick runs before the class choices. And Advanced Build
//      still shows the Profile Choices box (Human language and weapon group).
//
// The real src/js is bundled in memory with a small test-only hook block
// appended to ui.js (as test-025 does); nothing in the shipped source is
// altered for testing.
//
// Run:  node scripts/test-029-quick-build-human.mjs   (npm run test:029)
// Env:  T29_PORT (default 4250); T29_RECORD=1 prints the spot-check digests.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "qa-test-results/task-029-quick-build-human");
await mkdir(output, { recursive: true });
const port = Number(process.env.T29_PORT || 4250);
const url = `http://localhost:${port}/`;
const RECORD = process.env.T29_RECORD === "1";

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
const squash = (text) => String(text || "").replace(/\s+/g, " ").trim();

const BUILD_IDS = [
  "shield-warrior", "great-weapon-striker", "seven-sorrows-rush", "sneak-thief", "unarmed-monk",
  "hunter-archer", "scout-sniper-path", "gunslinger", "control-wizard", "elemental-blaster", "cleric-support",
  "performance-support", "bard-expertise-rush", "gadgeteer", "potion-healer"
];

// The per-role Human picks. Stats are the task 029 table (027a report section
// 2.3); language Sorthen for all. Weapon groups are the task 029 table except
// where task 030 changed them (Great Weapon Striker and Seven Sorrows: Musket,
// because Fighter now picks Thrown; Unarmed Monk: Thrown, because Cultivator
// now picks Set of Missiles; Scout Sniper: Crossbow, because Ranger now picks
// Musket; Gunslinger is new). "bought" names the weapon the role buys for the
// Human group. Skill placements are what the task 030 allocator produces:
// after the class skill pools and Skill Training, into the role's skills in
// priority order, only where there is room under the 15-point cap, split when
// needed, Human-legal skills only (listed in the note's order). "extra" is
// what the +100 Human EXP buys. Task 036 lifted the extra bar on Artifice,
// Appraise, Animal Husbandry and Survival, which changed two rows: the Gadgeteer's
// +5 now goes to Artifice (its main skill, was Magic) and the Hunter Archer's
// skill order puts Stealth first, so its +5 goes to Perception (was Perception 1,
// Stealth 4).
const HUMAN_TABLE = {
  "shield-warrior": { stat: "Toughness", secondary: "Fitness", weapon: "Thrown", skills: [["Athletics", 5]], extra: "Provoke (Guardian)" },
  "great-weapon-striker": { stat: "Power", secondary: "Fitness", weapon: "Musket", skills: [["Athletics", 5]], extra: "Steady Stance (Highlander)" },
  "seven-sorrows-rush": { stat: "Power", secondary: "Fitness", weapon: "Musket", skills: [["Athletics", 5]], extra: "Lone Wolf Stance (Seven Sorrows Sword Style)" },
  "sneak-thief": { stat: "Focus", secondary: "Cunning", weapon: "Set of Missiles", bought: "Set of Missiles", skills: [["Roguecraft", 5]], extra: "Mage's class skill bonus (+5 skill points)" },
  "unarmed-monk": { stat: "Agility", secondary: "Fitness", weapon: "Thrown", skills: [["Perception", 5]], extra: "Cultivator's class skill bonus (+5 skill points)" },
  "hunter-archer": { stat: "Focus", secondary: "Awareness", weapon: "Musket", skills: [["Perception", 5]], extra: "Rogue's class skill bonus (+5 skill points)" },
  "scout-sniper-path": { stat: "Focus", secondary: "Awareness", weapon: "Crossbow", skills: [["Stealth", 5]], extra: "Rogue's class skill bonus (+5 skill points)" },
  gunslinger: { stat: "Focus", secondary: "Awareness", weapon: "Light Swords", skills: [["Perception", 5]], extra: "Ricochet (Gunslinger)" },
  "control-wizard": { stat: "Focus", secondary: "Reason", weapon: "Small Weapons", skills: [["History", 5]], extra: "Magic Blast II (Elementalist)" },
  "elemental-blaster": { stat: "Focus", secondary: "Reason", weapon: "Small Weapons", skills: [["Magic", 1], ["Intimidation", 4]], extra: "Magic Blast (Sorcerer)" },
  "cleric-support": { stat: "Toughness", secondary: "Presence", weapon: "Bludgeoning Weapons", skills: [["Religion", 2], ["Insight", 3]], extra: "Medic's class skill bonus (+5 skill points)" },
  "performance-support": { stat: "Toughness", secondary: "Presence", weapon: "Dueling Weapons", skills: [["Negotiation", 5]], extra: "Never Miss The Beat (Jewel Idol)" },
  "bard-expertise-rush": { stat: "Toughness", secondary: "Presence", weapon: "Dueling Weapons", skills: [["Art", 4], ["Negotiation", 1]], extra: "This is our moment! (Idol)" },
  gadgeteer: { stat: "Focus", secondary: "Reason", weapon: "Small Weapons", skills: [["Artifice", 5]], extra: "Craft Artificer's Glove (Magitechnician)" },
  "potion-healer": { stat: "Focus", secondary: "Reason", weapon: "Crossbow", skills: [["Medicine", 1], ["Magic", 4]], extra: "Acolyte's class skill bonus (+5 skill points)" }
};

// Independent oracle for "a class already grants this weapon group": the
// fixed common weapon groups named in each class key ability (0.13.2 data,
// read by hand), plus whatever the stored class weapon choices picked.
const CLASS_FIXED_WEAPON_GROUPS = {
  medic: ["Small Weapons", "Set of Missiles"],
  idol: ["Small Weapons"],
  cultivator: ["Light Swords"],
  artificer: ["Musket"],
  gunslinger: ["Pistol"]
};

// 029 audit follow-up: forced collisions. Each role's Human weapon group is
// temporarily set to a group its class always picks for that role; the stored
// Human pick must then be some other group that no class grants.
const FORCED_COLLISIONS = {
  "hunter-archer": "Bow",
  "potion-healer": "Small Weapons",
  "great-weapon-striker": "Axes"
};

// Digests of the stored result for every role. Recorded on e2f8030 for task
// 029; re-recorded on the task 030 code with T29_RECORD=1, because task 030
// changed every role on purpose (gear, allocator, picks; see
// reports/030-quick-build-min-max-report.md). Re-recorded again on the task 036
// code (twice, identical), because task 036 changed every role on purpose too:
// each build now stores its spare Interlude Point as a Job, seven builds got more
// gear for the Job money, and the Hunter Archer and Gadgeteer use the skills the
// rules now allow (reports/036-skill-list-per-rules-report.md). Task 045 changed
// the three Scout Sniper digests on purpose and nothing else: the Sniper Rifle
// scope's conditional +10 Perception is no longer added, so the stored Perception
// bonus (Bonus17) reads +23, not +33 (Demon +22, not +32). The other 42 stored
// results are byte-identical (reports/045-gate-wave2-fixes-report.md). Any other
// change now is a regression.
const BASELINE_DIGESTS = {
  "catfolk/shield-warrior": "de81178645d20230a08d76fe75a88d5e0ca2af5b9207db19c89365beae4f25a4",
  "catfolk/great-weapon-striker": "a54adc6ab2db3817bb7a7acdbfd9a32ac7961ef5dd6525c6a8455b4bd6dcc953",
  "catfolk/seven-sorrows-rush": "af71e7ae27037e3402aa0119859a8fcbdf0284725c306cb9b30ed0058eb8cc1d",
  "catfolk/sneak-thief": "d2b324f60635c6cbc7cbf4e4e26bd4340808c8c480ea82bd6f9b9539d734f4cf",
  "catfolk/unarmed-monk": "dd19ddee4b228a72f95e838b18a12e964b0fe46ed8ae9ccc68b0fe733346db6a",
  "catfolk/hunter-archer": "00c1ad892111793f25918ff239f56a8e35dc79fcb96887d8f128fcce2711676a",
  "catfolk/scout-sniper-path": "7ce16eec285db0828e7ad47a2bd04cb89437ea1d373bd9431c58f81cb50a9806",
  "catfolk/gunslinger": "eafb6588d4a5199cad20c732400ca698f46fab32cb6c6e0fd5ba459f98ec9240",
  "catfolk/control-wizard": "ff250b0d793563d2de69e2a2ef870f3fab1a602eca6631041d8898bfa61d333f",
  "catfolk/elemental-blaster": "5c44edc434513c7414070c43d4a7938d9fdc87bdc8458fe83aaebd5adf63eb4e",
  "catfolk/cleric-support": "d33cf6c249bbecd38107576af63d60b9ea9a3817ddf32a31d3e75b5e03fcdc56",
  "catfolk/performance-support": "4544e8e2209792dbfe48229267ae06687505bdae95d453f4bdb01a9c49278ac4",
  "catfolk/bard-expertise-rush": "3ad8e2e79657dce51a66d2e7de269b19bc94a820c78dd76e8048c813e1a038a0",
  "catfolk/gadgeteer": "dfac39e1d5ac492183e0c862ce4997c57cba9bf2d5ca4b71e974905664702ef4",
  "catfolk/potion-healer": "caa74a2f22a99ef20ccba03750fa60f5eb5c23862b645f33c7ba77977bbd1967",
  "bearfolk/shield-warrior": "62783ad3ae3c28a4225007d65901cbfd8db99ada5867af4a48d760e862effff9",
  "bearfolk/great-weapon-striker": "bfc8f0d043800f8044e0e94dbc4dbf4047b736aff4c914039bfa2e289aa16f96",
  "bearfolk/seven-sorrows-rush": "c1f645ce37532d1551fc0df45030c0c471f2dd7e10a693b026e7567f3f8446d8",
  "bearfolk/sneak-thief": "710337cf7e63049c08668eaef23326728ff98eadb6fe2f7260ef5416f09b59c0",
  "bearfolk/unarmed-monk": "d1c523babfba6ee21eb9f8ea4a98afa892ce195d5ff2073365842904ac3f3170",
  "bearfolk/hunter-archer": "c68f210ba377375bef8ce5539a14372dbffbc496bc824a30aee0edc5b9675bf3",
  "bearfolk/scout-sniper-path": "4e0f81a28bc6f5af703f908caafb677c77fb31001129dea206ef6e7982cd3cc8",
  "bearfolk/gunslinger": "4f7886a3fa705c0ed526261fa8dcfaa1ef44f04b004ecd96fdd5413502f4440f",
  "bearfolk/control-wizard": "2bdf3cc360ddeee21b8258d2f85f7bc44a9fe80b36044a6472af6faeefb818ce",
  "bearfolk/elemental-blaster": "3cc72f7471854878860391e229ca541c0058efd935fce930b1c455d7a497734d",
  "bearfolk/cleric-support": "c6d47a6050deed8ba927414e4cf3f0b323f899c6f756d8842d601ae5c6d2e66c",
  "bearfolk/performance-support": "47829dd605997f8aae8d3fa9329d8ab00b5402b66997d462e80134ce89458c3f",
  "bearfolk/bard-expertise-rush": "d10bf70ccd9f20752ef983e3ec0e88a4522649966904b36ab91a54b97af8c35f",
  "bearfolk/gadgeteer": "8117176ead37d4e573b12788d3fc1e26724d8c5567001e09e271ecc7a38f4986",
  "bearfolk/potion-healer": "a892cbd058654641bb06afbda83f69690f6ea6256ef606701b2d79a6458f14f6",
  "demon/shield-warrior": "4a9fbf4ccd7fc7348f3df9f7f1c990f4ddf3d1f84367948d59b2b7a05c0b0c73",
  "demon/great-weapon-striker": "a38d7fc09c19782b02251447b32e92760e58522d6609f89635a3734d51ffd413",
  "demon/seven-sorrows-rush": "4abf63a9dedc34a2b693ebe58de1f01f6fe8f19b3dd8657277daa74efc65003e",
  "demon/sneak-thief": "5a5dcd3fa666254d588f51443b264c46892085fae27ed9aa472ba3c7a346ca79",
  "demon/unarmed-monk": "374fbe0e59a65898729d181854dccc85ca87ff30c2e3956e83e2965e03dce503",
  "demon/hunter-archer": "685f8efcf7444946a9d7cd1561dad86886ff5f64b4bd54c2f66b3b87242f4f55",
  "demon/scout-sniper-path": "a91daad5b1a94993d6246c598cf634ef99a4c48dedb099d40e831022e987772b",
  "demon/gunslinger": "630c4a75ae99bc26bc5de8a62fca081d1dcf5bb7b703d1f18a92509356a9ec8e",
  "demon/control-wizard": "171bd8a76475961f697060dba3afe6daa6c13429a9040b37a50343d8d155a817",
  "demon/elemental-blaster": "1ed98bf3a490181124f936040864238d16ec5a27f868693055063a59024af916",
  "demon/cleric-support": "476896a3d03942a288786a4be5a4925e101455d50c8cc0735cb1a75b5d8be6df",
  "demon/performance-support": "bfb637a62ef60a546f1134d88999e4b6841128c203f315a0dd62c0a1d1d985e8",
  "demon/bard-expertise-rush": "908ce2931ad10a54f2c8078f5d75ae25a2052db28254efaf84e664634fc96d8e",
  "demon/gadgeteer": "5ca3cba2d26c76c81a5ffcecebd8c58b8fda5af682ef07067293817e6a0bc066",
  "demon/potion-healer": "6674de91b81b8de52d4c411f6c6748fc11a1b1596f35b34f7052fa7f31b0a112"
};

// ---------------------------------------------------------------------------
// Test-only hooks, appended to ui.js in the in-memory bundle.
// ---------------------------------------------------------------------------
const hooks = `
window.__t29 = {
  skillRows() {
    return SKILL_DEFINITIONS.map((definition, index) => {
      const row = getSkillRowData(index + 1);
      return { name: row.name, creation: row.creationSkillPoints, racial: row.racialSkillPoints, feature: row.featureSkillPoints, uncapped: row.uncappedSkillPoints };
    });
  },
  classPools() {
    return getVisibleClassSkillPoolChoices().map((choice) => ({ id: choice.id, source: choice.source, ...getClassSkillPoolState(choice) }));
  },
  humanPool() {
    const choice = getVisibleRacialSkillPoolChoices().find((entry) => entry.id === "race-human-skill");
    if (!choice) return null;
    return {
      ...getRacialSkillPoolState(choice),
      allocations: SKILL_DEFINITIONS.map((definition, index) => [definition.name, getRacialSkillSpend(choice, index + 1)]).filter(([, points]) => points > 0)
    };
  },
  humanSkillOptions() { return getHumanRaceSkillChoiceOptions(); },
  exp() { const budget = getClassUnlockBudgetState(); return { spent: budget.spentExp, budget: budget.expBudget, remaining: budget.remainingExp }; },
  classIds() { return [...state.builder.selectedClassIds]; },
  choices() { return { ...(state.builder.choiceSelections || {}) }; },
  snapshot() {
    const builder = state.builder;
    const fields = Object.fromEntries(Object.entries(state.fields).filter(([, value]) => value !== "" && value !== undefined && value !== null));
    return {
      builder: {
        selectedRaceId: builder.selectedRaceId,
        selectedAncestryId: builder.selectedAncestryId,
        selectedClassIds: builder.selectedClassIds,
        classAbilityProgress: builder.classAbilityProgress,
        selectedBreakthroughIds: builder.selectedBreakthroughIds,
        selectedItemIds: builder.selectedItemIds,
        itemQuantities: builder.itemQuantities,
        choiceSelections: builder.choiceSelections,
        skillExpertiseEntries: builder.skillExpertiseEntries,
        startMode: builder.startMode,
        autoExpBank: builder.autoExpBank,
        autoSpiritCore: builder.autoSpiritCore,
        quickBuildSummary: builder.quickBuild?.summary || ""
      },
      fields,
      inventory: (state.play.inventoryItems || []).map((entry) => ({ itemId: entry.itemId || "", name: entry.name || "", equipped: Boolean(entry.equipped), quantity: entry.quantity ?? "" }))
    };
  },
  setHumanWeaponGroup(buildId, group) {
    const build = QUICK_BUILD_ROLES.flatMap((role) => role.builds).find((entry) => entry.id === buildId);
    const previous = build.human?.weaponGroup || "";
    build.human = { ...(build.human || {}), weaponGroup: group };
    quickBuildHumanPickPreviewCache.clear();
    return previous;
  },
  openAdvancedProfile(raceId) {
    state.ui.quickBuildActive = false;
    setBuilderRace(raceId);
    state.ui.builderStep = BUILDER_STEPS.findIndex((step) => step.id === "profile");
    renderBuilder();
    const content = document.getElementById("builder-step-content");
    return {
      profileChoicesBox: /Profile Choices/.test(content?.textContent || ""),
      choiceIds: [...content.querySelectorAll("[data-builder-choice-select], [data-builder-choice-field]")].map((node) => node.dataset.builderChoiceSelect || node.dataset.builderChoiceField || "")
    };
  },
  injectProfileChoices() {
    const content = document.getElementById("builder-step-content");
    content.insertAdjacentHTML("afterbegin", renderBuilderChoiceSection("profile", "Profile Choices"));
    return content.querySelectorAll("[data-builder-choice-select], [data-builder-choice-field]").length;
  }
};`;

const bundle = await build({
  absWorkingDir: root,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "task029-test-access", setup(buildApi) {
    buildApi.onLoad({ filter: /[/\\]src[/\\]js[/\\]ui\.js$/ }, async ({ path: file }) => ({
      contents: await readFile(file, "utf8") + hooks, loader: "js"
    }));
  } }]
});

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
};
const digest = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

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
  if (!RECORD) {
    section("The built bundle carries the new Human text");
    const built = await readFile(path.join(root, "assets/app.bundle.js"), "utf8");
    check("built bundle has the Human optimization note", built.includes("Human optimization: +1 "), true);
    check("built bundle has the new Human species text", built.includes("Human bonuses are picked for you to fit your role."), true);
    check("built bundle no longer promises a later Human choice", built.includes("Human bonuses are chosen after role selection."), false);
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
  const call = (name, ...args) => page.evaluate(([fn, argList]) => window.__t29[fn](...argList), [name, args]);

  const freshPage = async () => {
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__t29 && window.LYRIAN_DATA?.version === "0.13.2" && (document.getElementById("builder-step-content")?.innerHTML || "").length > 100);
    await page.waitForTimeout(1600); // the production idle sheet build
  };
  const startQuickBuild = async (speciesId, startMode = "standard") => {
    await page.click("#quick-build-entry");
    await page.locator(`[data-quick-build-action="select-species"][data-id="${speciesId}"]`).click();
    await page.click("#builder-next");
    await page.waitForSelector("[data-quick-start-mode=\"standard\"]", { timeout: 5000 });
    if (startMode === "mirane") {
      await page.click("[data-quick-start-mode=\"mirane\"]");
    }
  };
  const toRoleStep = async () => {
    await page.click("#builder-next");
    await page.waitForSelector("[data-quick-build-action=\"select-build\"]", { timeout: 5000 });
  };
  const screenState = () => page.evaluate(() => ({
    mode: document.getElementById("builder-mode-label")?.textContent || "",
    title: document.getElementById("builder-step-title")?.textContent || "",
    progress: document.getElementById("builder-progress-text")?.textContent || "",
    choiceControls: document.querySelectorAll("#builder-step-content [data-builder-choice-select], #builder-step-content [data-builder-choice-field], #builder-step-content [data-builder-choice-clear]").length,
    profileChoicesBox: /Profile Choices/.test(document.getElementById("builder-step-content")?.textContent || ""),
    advancedRaceCards: document.querySelectorAll("#builder-step-content [data-builder-action]").length,
    profileFields: document.querySelectorAll("#builder-step-content [data-profile-field]").length,
    quickStartControl: document.querySelectorAll("#builder-step-content [data-quick-start-mode]").length,
    detailTitle: document.querySelector("#builder-detail-card h3")?.textContent || ""
  }));
  const QUICK_NAME_SCREEN = {
    mode: "Quick Build", title: "Name the Character", progress: "Quick Build 2 of 4",
    choiceControls: 0, profileChoicesBox: false, advancedRaceCards: 0, profileFields: 5, quickStartControl: 2, detailTitle: "Quick Build"
  };

  // -------------------------------------------------------------------------
  if (!RECORD) {
    section("Name screen shows no race choices (Human, Demon, Catfolk)");
    for (const speciesId of ["human", "demon", "catfolk"]) {
      await freshPage();
      await startQuickBuild(speciesId);
      check(`${speciesId}: Name screen is Quick Build with no choice controls`, await screenState(), QUICK_NAME_SCREEN);
    }

    section("Typing and any choice control keep the Quick Build screen");
    for (const speciesId of ["human", "demon"]) {
      await freshPage();
      await startQuickBuild(speciesId);
      for (const field of ["Name", "Gender", "Age", "Height", "Weight"]) {
        await page.fill(`#builder-step-content [data-profile-field="${field}"]`, `${field} test`);
        await page.waitForTimeout(80);
        check(`${speciesId}: typing in ${field} keeps Quick Build`, await screenState(), QUICK_NAME_SCREEN);
      }
      check(`${speciesId}: typed Gender is kept`, await page.inputValue("#builder-step-content [data-profile-field=\"Gender\"]"), "Gender test");

      // Guard: put the old profile choice box back into the Quick Build body
      // and use every control in it; each redraw must stay on Quick Build.
      const used = [];
      for (let round = 0; round < 4; round++) {
        const injected = await call("injectProfileChoices");
        if (!injected) break;
        const control = page.locator("#builder-step-content [data-builder-choice-select], #builder-step-content select[data-builder-choice-field]").nth(round % injected);
        if (!(await control.count())) break;
        const values = await control.evaluate((select) => [...select.options].map((option) => option.value).filter((value) => value && value !== "__custom__"));
        const pick = speciesId === "demon" && round === 0 ? "weapon" : values[values.length - 1];
        await control.selectOption(pick);
        await page.waitForTimeout(80);
        used.push(pick);
        check(`${speciesId}: choosing "${pick}" in an injected choice keeps Quick Build`, await screenState(), QUICK_NAME_SCREEN);
      }
      check(`${speciesId}: the guard used at least one choice control`, used.length > 0, true);
      await call("injectProfileChoices");
      const clear = page.locator("#builder-step-content [data-builder-choice-clear]").first();
      check(`${speciesId}: the injected box offers a Clear button`, await clear.count(), 1);
      if (await clear.count()) {
        await clear.click();
        await page.waitForTimeout(80);
        check(`${speciesId}: Clear keeps Quick Build`, await screenState(), QUICK_NAME_SCREEN);
      }
    }
  }

  // -------------------------------------------------------------------------
  if (!RECORD) {
    for (const startMode of ["standard", "mirane"]) {
      section(`All 15 roles as Human (${startMode})`);
      await freshPage();
      await startQuickBuild("human", startMode);
      await toRoleStep();
      const humanOptions = await call("humanSkillOptions");
      for (const buildId of BUILD_IDS) {
        const expected = HUMAN_TABLE[buildId];
        const skillText = expected.skills.map(([skill, points]) => `${skill} +${points}`).join(", ");
        const weaponText = expected.bought ? `${expected.weapon} weapon group proficiency (the build buys a ${expected.bought} for it)` : `${expected.weapon} weapon group proficiency`;
        const expectedNote = `Human optimization: +1 ${expected.stat} (main stat), +1 ${expected.secondary} (sub stat), 5 skill points (${skillText}), ${weaponText}, Sorthen as the extra language. The extra 100 Human EXP buys ${expected.extra}.`;
        const beforeClick = await call("snapshot");
        await page.locator(`[data-quick-build-action="select-build"][data-id="${buildId}"]`).click();
        await page.waitForTimeout(60);
        const afterClick = await call("snapshot");
        delete beforeClick.builder.quickBuildSummary;
        delete afterClick.builder.quickBuildSummary;
        check(`${startMode}/${buildId}: showing the picks before Continue changes nothing stored`, digest(afterClick), digest(beforeClick));
        const detailNote = await page.evaluate(() => [...document.querySelectorAll("#builder-detail-card p")].map((node) => node.textContent.replace(/\s+/g, " ").trim()).find((text) => text.startsWith("Human optimization:")) || "");
        check(`${startMode}/${buildId}: role detail lists the Human picks before Continue`, detailNote.startsWith(expectedNote), true);
        if (!detailNote.startsWith(expectedNote)) console.log(`       detail: ${detailNote}`);

        await page.click("#builder-next");
        await page.waitForSelector(".quick-build-review-actions", { timeout: 5000 });
        await page.waitForTimeout(60);
        const choices = await call("choices");
        check(`${startMode}/${buildId}: stored Human picks match the table`, {
          stat: choices["race-human-main-stat"], secondary: choices["race-human-secondary-stat"], weapon: choices["race-human-weapon-group"], language: choices["race-human-language"]
        }, { stat: expected.stat, secondary: expected.secondary, weapon: expected.weapon, language: "Sorthen" });

        const classGranted = new Set();
        const classIds = await call("classIds");
        classIds.forEach((id) => (CLASS_FIXED_WEAPON_GROUPS[id] || []).forEach((group) => classGranted.add(group)));
        Object.entries(choices).filter(([id, value]) => /^class-.*weapon-proficiency/.test(id) && value).forEach(([, value]) => classGranted.add(value));
        check(`${startMode}/${buildId}: Human weapon group is not one a class already grants`, classGranted.has(choices["race-human-weapon-group"]), false);

        const pool = await call("humanPool");
        const sortPairs = (pairs) => [...(pairs || [])].sort((left, right) => left[0].localeCompare(right[0]));
        check(`${startMode}/${buildId}: all 5 Human skill points are placed where the rule puts them`, { spent: pool?.spent, remaining: pool?.remaining, allocations: sortPairs(pool?.allocations) }, { spent: 5, remaining: 0, allocations: sortPairs(expected.skills) });
        check(`${startMode}/${buildId}: Human skill points only go to Human-legal skills`, (pool?.allocations || []).every(([skill]) => humanOptions.includes(skill)), true);
        const rows = await call("skillRows");
        const overCap = rows.filter((row) => row.racial > 0 && row.uncapped > 15).map((row) => `${row.name} ${row.uncapped}`);
        check(`${startMode}/${buildId}: no skill with Human points is over the 15-point cap`, overCap, []);
        const stranded = (await call("classPools")).filter((entry) => entry.remaining > 0).map((entry) => `${entry.id} ${entry.remaining}`);
        check(`${startMode}/${buildId}: no class skill points are left unplaced`, stranded, []);
        check(`${startMode}/${buildId}: the +100 Human EXP is spent`, await call("exp"), { spent: 1100, budget: 1100, remaining: 0 });

        const review = await page.evaluate(() => [...document.querySelectorAll(".review-panel")].map((panel) => panel.textContent.replace(/\s+/g, " ").trim()));
        const why = review.find((text) => text.startsWith("Why This Build")) || "";
        check(`${startMode}/${buildId}: review summary lists the same Human picks`, why.includes(detailNote) && detailNote.length > 0, true);
        check(`${startMode}/${buildId}: review EXP panel shows 1100 / 1100`, review.some((text) => text.includes("Spent 1100 / 1100; remaining 0")), true);

        if (startMode === "standard" && buildId === "hunter-archer") {
          await page.click("[data-step-index=\"1\"]");
          await page.waitForTimeout(80);
          const backState = await screenState();
          check("after applying, going back to the Name screen still shows no choice controls", { mode: backState.mode, title: backState.title, choiceControls: backState.choiceControls, advancedRaceCards: backState.advancedRaceCards }, { mode: "Quick Build", title: "Name the Character", choiceControls: 0, advancedRaceCards: 0 });
          await page.click("[data-step-index=\"3\"]");
          await page.waitForSelector(".quick-build-review-actions", { timeout: 5000 });
        }
        await page.click("[data-quick-build-action=\"back-to-build\"]");
        await page.waitForSelector("[data-quick-build-action=\"select-build\"]", { timeout: 5000 });
      }
    }
  }

  // -------------------------------------------------------------------------
  if (!RECORD) {
    section("Forced collision: the Human weapon pick avoids a group a class picked");
    for (const [buildId, group] of Object.entries(FORCED_COLLISIONS)) {
      await freshPage();
      const previous = await call("setHumanWeaponGroup", buildId, group);
      await startQuickBuild("human");
      await toRoleStep();
      await page.locator(`[data-quick-build-action="select-build"][data-id="${buildId}"]`).click();
      await page.click("#builder-next");
      await page.waitForSelector(".quick-build-review-actions", { timeout: 5000 });
      const choices = await call("choices");
      const classPicks = Object.entries(choices).filter(([id, value]) => /^class-.*proficiency/.test(id) && value).map(([, value]) => value);
      const classIds = await call("classIds");
      const fixed = classIds.flatMap((id) => CLASS_FIXED_WEAPON_GROUPS[id] || []);
      check(`${buildId}: a class really picks ${group} (the collision is real)`, classPicks.includes(group), true);
      check(`${buildId}: the Human pick moved off ${group}`, choices["race-human-weapon-group"] !== group && Boolean(choices["race-human-weapon-group"]), true);
      check(`${buildId}: the moved Human pick is not granted by a class`, [...classPicks, ...fixed].includes(choices["race-human-weapon-group"]), false);
      await call("setHumanWeaponGroup", buildId, previous);
    }

    section("Advanced Build still shows the Profile Choices box");
    await freshPage();
    const advanced = await call("openAdvancedProfile", "human");
    check("Advanced Human Name step shows Profile Choices", advanced.profileChoicesBox, true);
    check("Advanced Human Name step offers the language and weapon-group choices", ["race-human-language", "race-human-weapon-group"].every((id) => advanced.choiceIds.includes(id)), true);
  }

  // -------------------------------------------------------------------------
  section("Catfolk, Bearfolk and Demon results are unchanged");
  const recorded = {};
  for (const speciesId of ["catfolk", "bearfolk", "demon"]) {
    await freshPage();
    await startQuickBuild(speciesId);
    await toRoleStep();
    for (const buildId of BUILD_IDS) {
      await page.locator(`[data-quick-build-action="select-build"][data-id="${buildId}"]`).click();
      await page.click("#builder-next");
      await page.waitForSelector(".quick-build-review-actions", { timeout: 5000 });
      await page.waitForTimeout(60);
      const snapshot = await call("snapshot");
      const key = `${speciesId}/${buildId}`;
      recorded[key] = digest(snapshot);
      await writeFile(path.join(output, `snapshot-${speciesId}-${buildId}.json`), JSON.stringify(canonical(snapshot), null, 1));
      if (!RECORD) {
        check(`${key}: stored result unchanged`, recorded[key], BASELINE_DIGESTS[key]);
      }
      await page.click("[data-quick-build-action=\"back-to-build\"]");
      await page.waitForSelector("[data-quick-build-action=\"select-build\"]", { timeout: 5000 });
    }
  }
  if (RECORD) {
    console.log(JSON.stringify(recorded, null, 2));
  }

  check("No uncaught browser JavaScript errors", pageErrors, []);
  console.log(`\n${passed} passed, ${failures.length} failed. Evidence: ${output}`);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed, failed: failures.length, failures, recorded }, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: error.stack, failures, serverLog }, null, 2));
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
