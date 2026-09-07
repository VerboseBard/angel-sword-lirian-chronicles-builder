import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "qa-test-results/patch-2026-09-07-ui");
await mkdir(output, { recursive: true });
const results = [];
const check = (name, actual, expected) => {
  assert.deepEqual(actual, expected, name);
  results.push({ name, actual });
};

// Expose the real source functions in this test's memory-only bundle. No
// shipped source/export is altered to provide test hooks or fake calculations.
const hooks = `
window.__patch0132 = {
  fixture(input = {}) {
    const revision = (state.revision || 0) + 1;
    const defaults = createDefaultState();
    Object.assign(state, defaults, input);
    state.revision = revision;
    state.fields = { ...defaults.fields, ...(input.fields || {}) };
    state.ui = { ...defaults.ui, gameVersion: "0.13.2", ...(input.ui || {}) };
    state.builder = { ...defaults.builder, ...(input.builder || {}) };
    state.play = mergePlayState(input.play || {});
  },
  classStatus(id) { return getClassRequirementStatus(getClassDetail(id)); },
  breakthroughStatus(id) { return getBreakthroughRequirementStatus(lookup.breakthroughs.resolve(id)); },
  choices() { return getBuilderChoiceDefinitions().map(c => ({ id: c.id, options: c.options })); },
  masteries() { return [...getTrackedElementalMasteries()].sort(); },
  divine: getSelectedDivineOption,
  version(id) { return applyGameVersion(id, { render: false, status: false, persistSelection: false }); },
  useItem: useInventoryItem,
  clearEffect: removePlayActiveEffect,
  rest: performPlayRest,
  abilities() { return getQuickPlayAbilities(); },
  cellMap: buildCcsCellMap,
  exportCcs: exportCcsState,
  parseCost: parseResourceCost,
  item(id) { const item = lookup.items.resolve(id); return { item, weapon: isWeaponItem(item), ranged: isRangedWeaponItem(item), baseText: getBaseItemRulesText(item) }; },
  snapshot() { return JSON.parse(serializeCurrentState()); },
  sync: syncBuilderSelectionsIntoSheet,
  bonuses: getComputedBonuses,
  derived: getDerivedCombatStats
};`;
const bundle = await build({
  absWorkingDir: root,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "patch-ui-test-access", setup(buildApi) {
    buildApi.onLoad({ filter: /[/\\]src[/\\]js[/\\]ui\.js$/ }, async ({ path: file }) => ({
      contents: await readFile(file, "utf8") + hooks, loader: "js"
    }));
  } }]
});

function unzip(bytes) {
  const result = new Map();
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  assert(end >= 0, "XLSX ZIP end record exists");
  let at = bytes.readUInt32LE(end + 16);
  for (let count = bytes.readUInt16LE(end + 10); count > 0; count--) {
    assert.equal(bytes.readUInt32LE(at), 0x02014b50);
    const method = bytes.readUInt16LE(at + 10);
    const size = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + size);
    assert([0, 8].includes(method));
    result.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

const port = Number(process.env.PATCH_UI_PORT || 4216);
const url = `http://127.0.0.1:${port}/`;
const server = fork(path.join(root, "scripts/server.mjs"), [], {
  cwd: root, env: { ...process.env, LYRIAN_PORT: String(port) }, silent: true
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/assets/app.bundle.js*", route => route.fulfill({
    contentType: "application/javascript", body: bundle.outputFiles[0].text
  }));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__patch0132 && window.LYRIAN_DATA.version === "0.13.2");
  await page.waitForTimeout(1600); // Allow the production idle sheet build to finish.
  const fixture = input => page.evaluate(value => window.__patch0132.fixture(value), input);
  const classes = (ids = [], counts = 7, other = {}) => ({
    selectedRaceId: "human", selectedClassIds: ids,
    classAbilityProgress: Object.fromEntries(ids.map(id => [id, counts])), ...other
  });
  const gateCases = [
    ["Manifestor has no prerequisite", "manifestor", classes(), true],
    ["Fusilier needs Ranger mastery", "fusilier", classes(["ranger"], 6), false],
    ["Fusilier accepts mastered Ranger", "fusilier", classes(["ranger"]), true],
    ["Still Stone Testament needs its style", "still-stone-testament", classes(["fighter"]), false],
    ["Still Stone Testament accepts mastered Still Stone Style", "still-stone-testament", classes(["still-stone-style"]), true],
    ["Deadeye accepts newly allowed Harrier", "deadeye", classes(["harrier"]), true],
    ["Deadeye rejects unmastered Harrier", "deadeye", classes(["harrier"], 6), false],
    ["Venomancer accepts Medic", "venomancer", classes(["medic"]), true],
    ["Venomblade accepts Medic", "venomblade", classes(["medic"]), true],
    ["Venomancer rejects unrelated Fighter", "venomancer", classes(["fighter"]), false],
    ["Petrification accepts Evil Eye route", "mystic-eyes-of-petrification", classes(["evil-eye"]), true],
    ["Petrification rejects non-Lamia unrelated tier 2", "mystic-eyes-of-petrification", classes(["armiger"]), false],
    ["Petrification accepts Lamia plus tier 2", "mystic-eyes-of-petrification", classes(["armiger"], 7, { selectedRaceId: "chimera", selectedAncestryId: "lamiafolk" }), true],
    ["Petrification rejects Lamia with only tier 1", "mystic-eyes-of-petrification", classes(["fighter"], 7, { selectedRaceId: "chimera", selectedAncestryId: "lamiafolk" }), false],
    ["Petrification rejects full eye slots", "mystic-eyes-of-petrification", classes(["evil-eye", "faerie-light-eyes"]), false],
    ["Petrification accepts Third Eye free slot", "mystic-eyes-of-petrification", classes(["evil-eye", "faerie-light-eyes"], 7, { selectedBreakthroughIds: ["third-eye"] }), true]
  ];
  for (const [name, id, builder, expected] of gateCases) {
    await fixture({ builder });
    const status = await page.evaluate(id => window.__patch0132.classStatus(id), id);
    check(name, status.met, expected);
    if (expected) check(`${name}: all requirements tracked`, status.unsupportedLabels, []);
  }

  await fixture({ builder: classes(["armiger"]) });
  const soulOptions = await page.evaluate(() => window.__patch0132.choices().find(c => c.id === "class-armiger-soul-stat")?.options);
  check("Armiger's four Soul stat choices", soulOptions?.sort(), ["Agility", "Focus", "Power", "Toughness"]);
  await fixture({ builder: { selectedRaceId: "chimera", selectedAncestryId: "pigfolk" } });
  const pig = await page.evaluate(() => window.__patch0132.abilities().map(a => ({ name: a.name, cost: a.costLabel })));
  check("Pigfolk has all three usable racial traits", ["Mercantile", "Eat Anything", "Break Piggy Bank"].every(name => pig.some(a => a.name === name)), true);
  check("Break Piggy Bank costs 0 RP", pig.find(a => a.name === "Break Piggy Bank")?.cost, "0 RP");
  check("Chimera Fight or Flight now costs 0 RP", pig.find(a => a.name === "Fight or Flight")?.cost, "0 RP");

  for (const [ancestry, expected] of [["high-fae", true], ["pixie", false]]) {
    await fixture({ builder: { selectedRaceId: "fae", selectedAncestryId: ancestry } });
    const rapid = await page.evaluate(() => window.__patch0132.breakthroughStatus("rapid-flash--high-fae-"));
    check(`Rapid Flash checks actual ${ancestry} trait`, rapid.met, expected);
    if (expected) check("Rapid Flash needs no manual override", rapid.manualOnly, false);
  }
  await fixture({ builder: classes(["sorcerer"], 0, { choiceSelections: { "class-sorcerer-elemental-mastery": "Water" } }) });
  check("Sorcerer starts with Arcane but saved future mastery grants no Water", await page.evaluate(() => window.__patch0132.masteries()), ["arcane"]);
  await fixture({ builder: classes(["sorcerer"], 7, { choiceSelections: { "class-sorcerer-elemental-mastery": "Water" } }) });
  check("Mastered Sorcerer gains selected Water", await page.evaluate(() => window.__patch0132.masteries()), ["arcane", "water"]);
  await fixture({ builder: classes([], 0, { choiceSelections: { "class-sorcerer-elemental-mastery": "Water" } }) });
  check("Removed class grants neither Arcane nor saved Water", await page.evaluate(() => window.__patch0132.masteries()), []);

  for (const [version, type] of [["0.13.1", "Slashing"], ["0.13.2", "Physical"]]) {
    await page.evaluate(version => window.__patch0132.version(version), version);
    await fixture({ ui: { gameVersion: version }, builder: classes(["acolyte"], 7, {
      selectedRaceId: "fae", selectedAncestryId: "high-fae",
      selectedBreakthroughIds: ["divine-s-chosen"],
      choiceSelections: { "breakthrough-divine-s-chosen-divine": "Eisen" }
    }) });
    check(`${version}: Eisen uses selected rules damage type`, await page.evaluate(() => window.__patch0132.divine()), { value: "Eisen", label: `Eisen - ${type}`, damageType: type });
    check(`${version}: mastered Acolyte gets selected Eisen mastery`, await page.evaluate(() => window.__patch0132.masteries().filter(value => ["physical", "slashing"].includes(value))), [type.toLowerCase()]);
    const eisenOption = await page.evaluate(() => window.__patch0132.choices().find(c => c.id === "breakthrough-divine-s-chosen-divine")?.options?.find(o => o.value === "Eisen"));
    check(`${version}: visible divine option follows rules`, eisenOption?.label, `Eisen - ${type}`);
    check(`${version}: saved divine selection stays Eisen`, await page.evaluate(() => window.__patch0132.snapshot().builder.choiceSelections["breakthrough-divine-s-chosen-divine"]), "Eisen");
  }

  await fixture({ builder: classes(["fighter"], 0) });
  check("Battle Mage rejects melee proficiency without a spell", await page.evaluate(() => window.__patch0132.classStatus("battle-mage").met), false);
  await fixture({ builder: classes(["fighter", "mage"], 3, {
    selectedBreakthroughIds: ["weapon-training"],
    choiceSelections: { "breakthrough-weapon-training-groups": "Light Swords" }
  }) });
  check("Battle Mage accepts learned spell plus melee proficiency", await page.evaluate(() => window.__patch0132.classStatus("battle-mage").met), true);
  const cannon = await page.evaluate(() => window.__patch0132.item("cannon--two-handed-"));
  check("Cannon is a ranged weapon", [cannon.weapon, cannon.ranged], [true, true]);
  check("Optional Cannon mods do not become base abilities", /IFF Off|Pie Launcher|Side Barrel/.test(cannon.baseText), false);
  const material = await page.evaluate(() => window.__patch0132.item("alchemical-materials"));
  check("Crafting material reference is not a weapon", material.weapon, false);

  // Old saves learn the Gunslinger's Warning Shot by purchased class slot, and
  // manual sheet slots store the name. Neither depends on its changed slug.
  await fixture({ abilitySelections: { Ability1: "Warning Shot" }, builder: classes(["gunslinger"]) });
  const warning = await page.evaluate(() => ({
    ability: window.__patch0132.abilities().find(a => a.name === "Warning Shot"),
    saved: window.__patch0132.snapshot()
  }));
  check("Warning Shot uses new slug with stable API identity", [warning.ability?.id, warning.ability?.indexId], ["warning-shot", "38d587b1-7ed6-4c69-a0a1-a543e49b08d9"]);
  check("Legacy Warning Shot manual selection survives", warning.saved.abilitySelections.Ability1, "Warning Shot");
  check("Legacy Gunslinger purchased levels survive", warning.saved.builder.classAbilityProgress.gunslinger, 7);

  const elixirFixture = (version = "0.13.2", floor = false) => ({
    ui: { gameVersion: version, mode: "play" },
    fields: { Name: "Elixir lifecycle", Power: "4", Focus: "4", Agility: "4", Toughness: floor ? "-2" : "4" },
    builder: { selectedItemIds: ["bear-elixir", "blood-elixir"], itemQuantities: { "bear-elixir": 3, "blood-elixir": 3 } },
    play: {
      hpHasManualChange: false,
      resources: { hpCurrent: floor ? 0 : 60, hpMax: floor ? 0 : 60, manaCurrent: 0, manaMax: 10, rpCurrent: 6, rpMax: 6, apCurrent: 4, apMax: 4 },
      inventoryItems: [
        // Old inventory snapshots may carry their old description. Updated
        // official restrictions must still follow the selected rules version.
        { uid: "bear-test", itemId: "bear-elixir", quantity: 3, description: "When drunk, you take 11 true damage. You immediately gain 1 RP." },
        { uid: "blood-test", itemId: "blood-elixir", quantity: 3 }
      ]
    }
  });
  const elixirState = () => page.evaluate(() => {
    const s = window.__patch0132.snapshot();
    return { resources: s.play.resources, quantities: s.builder.itemQuantities, effects: s.play.activeEffects.map(e => ({ id: e.id, name: e.name, duration: e.duration })) };
  });
  await fixture(elixirFixture());
  await page.evaluate(() => window.__patch0132.useItem("bear-test"));
  const bearFirst = await elixirState();
  check("First Bear use applies damage/current+maxRP and consumes one", [bearFirst.resources.hpCurrent, bearFirst.resources.hpMax, bearFirst.resources.rpCurrent, bearFirst.resources.rpMax, bearFirst.quantities["bear-elixir"]], [49, 60, 7, 7, 2]);
  await page.evaluate(() => window.__patch0132.useItem("bear-test"));
  check("Repeated Bear use changes no quantity or resources", await elixirState(), bearFirst);
  await page.evaluate(() => window.__patch0132.useItem("blood-test"));
  const bloodFirst = await elixirState();
  check("First Blood use loses current+maxHP before recovering mana", [bloodFirst.resources.hpCurrent, bloodFirst.resources.hpMax, bloodFirst.resources.manaCurrent, bloodFirst.quantities["blood-elixir"]], [34, 45, 3, 2]);
  await page.evaluate(() => window.__patch0132.useItem("blood-test"));
  check("Repeated Blood use changes no quantity or resources", await elixirState(), bloodFirst);
  await page.evaluate(id => window.__patch0132.clearEffect(id), bearFirst.effects.find(e => e.name === "Bear Elixir").id);
  const afterEncounter = await elixirState();
  check("Clearing ended Bear effect restores maxRP and keeps Blood", [afterEncounter.resources.rpMax, afterEncounter.resources.hpMax, afterEncounter.effects.map(e => e.name)], [6, 45, ["Blood Elixir"]]);
  await page.evaluate(() => window.__patch0132.useItem("bear-test"));
  check("Bear can be used after its effect ends", (await elixirState()).quantities["bear-elixir"], 1);
  await page.evaluate(() => window.__patch0132.rest("floor"));
  const afterRest = await elixirState();
  check("Rest removes Blood penalty and preserves encounter-duration Bear", [afterRest.resources.hpMax, afterRest.effects.map(e => e.name)], [60, ["Bear Elixir"]]);
  await page.evaluate(() => window.__patch0132.useItem("blood-test"));
  check("Blood can be used after next rest", [(await elixirState()).resources.hpMax, (await elixirState()).quantities["blood-elixir"]], [45, 1]);
  await fixture(elixirFixture("0.13.2", true));
  await page.evaluate(() => window.__patch0132.useItem("blood-test"));
  const bloodFloor = await elixirState();
  check("Blood grants no mana when maxHP cannot decrease", [bloodFloor.resources.hpMax, bloodFloor.resources.manaCurrent], [0, 0]);
  const lowHp = elixirFixture();
  lowHp.fields.Toughness = "-1";
  Object.assign(lowHp.play.resources, { hpCurrent: 8, hpMax: 10 });
  lowHp.play.hpHasManualChange = true;
  await fixture(lowHp);
  await page.evaluate(() => window.__patch0132.useItem("blood-test"));
  const lowBlood = await elixirState();
  check("Blood subtracts 15 current HP at low max, and mana requires actual max loss", [lowBlood.resources.hpCurrent, lowBlood.resources.hpMax, lowBlood.resources.manaCurrent], [0, 0, 3]);
  await page.evaluate(() => window.__patch0132.version("0.13.1"));
  await fixture(elixirFixture("0.13.1"));
  await page.evaluate(() => { window.__patch0132.useItem("bear-test"); window.__patch0132.useItem("bear-test"); });
  const oldBear = await elixirState();
  check("Historical Bear retains repeat consumption and manual maxRP", [oldBear.quantities["bear-elixir"], oldBear.resources.hpCurrent, oldBear.resources.rpMax], [1, 38, 6]);
  await page.evaluate(() => window.__patch0132.version("0.13.2"));

  const templateBytes = await readFile(path.join(root, "data/ccs-template.xlsx"));
  check("Exact captured official template", createHash("sha256").update(templateBytes).digest("hex"), "3aba3065ae76dcbb86baf712446c13f8fd1ff13f7dc052252a609affb127b6c6");
  const template = unzip(templateBytes);
  const mainKeys = ["Power", "Focus", "Agility", "Toughness"];
  const subKeys = ["Fitness", "Cunning", "Reason", "Awareness", "Presence"];
  const exports = [
    {
      name: "Default-arrays",
      fields: { Power: "5", Focus: "4", Agility: "4", Toughness: "3", Fitness: "5", Cunning: "4", Reason: "3", Awareness: "2", Presence: "1" },
      builder: {}, main: [5, 4, 4, 3], sub: [5, 4, 3, 2, 1]
    },
    {
      name: "Custom-arrays-with-bonuses",
      fields: { Power: "2", Focus: "8", Agility: "1", Toughness: "6", Fitness: "0", Cunning: "7", Reason: "2", Awareness: "4", Presence: "-1" },
      builder: classes(["armiger"], 7, {
        selectedRaceId: "chimera", selectedAncestryId: "pigfolk",
        selectedBreakthroughIds: ["primary-stat-training", "secondary-stat-training"],
        choiceSelections: { "class-armiger-soul-stat": "Focus", "class-armiger-heart-stat": "Fitness", "breakthrough-primary-stat-training-main-stat": "Power", "breakthrough-secondary-stat-training-secondary-stat": "Reason" }
      }), main: [3, 9, 1, 7], sub: [1, 7, 3, 5, -1]
    },
    {
      name: "Tied-custom-arrays",
      fields: Object.fromEntries([...mainKeys, ...subKeys].map(key => [key, "2"])),
      builder: {}, main: [2, 2, 2, 2], sub: [2, 2, 2, 2, 2]
    }
  ];
  for (const entry of exports) {
    await fixture({ fields: { Name: entry.name, ...entry.fields }, builder: entry.builder });
    const map = await page.evaluate(() => window.__patch0132.cellMap());
    const downloadPromise = page.waitForEvent("download");
    await page.evaluate(() => window.__patch0132.exportCcs());
    const download = await downloadPromise;
    const destination = path.join(output, download.suggestedFilename());
    await download.saveAs(destination);
    const actual = unzip(await readFile(destination));
    check(`${entry.name}: XLSX entries preserved`, [...actual.keys()].filter(key => !key.endsWith("/")).sort(), [...template.keys()].filter(key => !key.endsWith("/")).sort());
    const parsed = await page.evaluate(({ before, after }) => {
      const parse = source => new DOMParser().parseFromString(source, "application/xml");
      const a = parse(before), b = parse(after);
      const formulas = document => [...document.querySelectorAll("c")].filter(c => c.querySelector("f")).map(c => [c.getAttribute("r"), c.querySelector("f").textContent]);
      const attrs = document => [...document.querySelectorAll("c")].filter(c => c.hasAttribute("s")).map(c => [c.getAttribute("r"), c.getAttribute("s")]);
      const cells = Object.fromEntries([...b.querySelectorAll("c")].map(c => [c.getAttribute("r"), c.getAttribute("t") === "inlineStr" ? c.querySelector("is t")?.textContent : Number(c.querySelector("v")?.textContent)]));
      const structures = document => ["mergeCells", "dataValidations", "cols"].map(name => document.querySelector(name)?.outerHTML);
      return { cells, formulasBefore: formulas(a), formulasAfter: formulas(b), attrsBefore: attrs(a), attrsAfter: attrs(b), structureBefore: structures(a), structureAfter: structures(b) };
    }, { before: template.get("xl/worksheets/sheet1.xml").toString(), after: actual.get("xl/worksheets/sheet1.xml").toString() });
    check(`${entry.name}: Core formulas retained`, parsed.formulasAfter, parsed.formulasBefore);
    check(`${entry.name}: Core styles retained`, parsed.attrsAfter, parsed.attrsBefore);
    check(`${entry.name}: Core validation/merge/width structure retained`, parsed.structureAfter, parsed.structureBefore);
    const c = parsed.cells;
    check(`${entry.name}: main selectors contain each stat name`, [45, 46, 47, 48].map(row => c[`B${row}`]).sort(), [...mainKeys].sort());
    check(`${entry.name}: sub selectors contain each stat name`, [45, 46, 47, 48, 49].map(row => c[`D${row}`]).sort(), [...subKeys].sort());
    // Independently evaluate the template's SUMIF array assignment plus its
    // labeled residual cells, rather than comparing only the outgoing map.
    const mainResidualRows = { Focus: 45, Power: 46, Agility: 47, Toughness: 48 };
    const main = mainKeys.map(key => [45, 46, 47, 48].reduce((sum, row) => sum + (c[`B${row}`] === key ? c[`A${row}`] : 0), 0) + c[`F${mainResidualRows[key]}`]);
    const sub = subKeys.map((key, index) => [45, 46, 47, 48, 49].reduce((sum, row) => sum + (c[`D${row}`] === key ? c[`C${row}`] : 0), 0) + c[`H${45 + index}`]);
    check(`${entry.name}: exported main totals equal independent character expectation`, main, entry.main);
    check(`${entry.name}: exported sub totals equal independent character expectation`, sub, entry.sub);
    for (const [name, bytes] of template) {
      if (name.endsWith("/") || ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml", "xl/worksheets/sheet4.xml"].includes(name)) continue;
      assert(bytes.equals(actual.get(name)), `${entry.name}: untouched ${name}`);
    }
    results.push({ name: `${entry.name}: untouched workbook parts byte-preserved`, map, exportedMain: main, exportedSub: sub, artifact: destination });
  }
  check("No browser JavaScript errors", pageErrors, []);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed: results.length, results }, null, 2));
  console.log(`PASS ${results.length} focused UI/rules/CCS checks. Evidence: ${output}`);
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: error.stack, completed: results, serverLog }, null, 2));
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
