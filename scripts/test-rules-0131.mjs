import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  await page.goto(pathToFileURL(path.join(projectRoot, "index.html")).href, { waitUntil: "load" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
      ui: { mode: "builder", gameVersion: "0.13.1" },
      fields: { Name: "Focused 0.13.1 Tester" },
      builder: {
        selectedRaceId: "fae",
        selectedAncestryId: "pixie",
        selectedBreakthroughIds: ["divine-s-chosen"],
        selectedClassIds: ["acolyte"],
        classAbilityProgress: { acolyte: 7 },
        choiceSelections: { "breakthrough-divine-s-chosen-divine": "Heira" }
      }
    }));
  });
  await page.reload({ waitUntil: "load" });
  await page.click('[data-step-index="5"]');
  await page.waitForTimeout(250);

  const result = await page.evaluate(() => ({
    version: window.LYRIAN_DATA?.version || "",
    selectedBreakthroughs: JSON.parse(localStorage.getItem("lyrian-chronicles-character-suite-v2") || "{}").builder?.selectedBreakthroughIds || [],
    choiceIds: [...document.querySelectorAll("[data-builder-choice-select]")].map((entry) => entry.dataset.builderChoiceSelect),
    selected: document.querySelector('[data-builder-choice-select="breakthrough-divine-s-chosen-divine"]')?.value || "",
    panels: [...document.querySelectorAll(".review-panel")].map((entry) => entry.textContent.replace(/\s+/g, " ").trim())
  }));
  console.log(JSON.stringify(result, null, 2));
  if (result.version !== "0.13.1" || result.selected !== "Heira") process.exitCode = 1;

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
      ui: { mode: "builder", gameVersion: "0.13.1" },
      fields: { Name: "Selkie Grant Tester" },
      builder: {
        selectedRaceId: "fae",
        selectedAncestryId: "selkie",
        selectedClassIds: ["hydromancer"],
        classAbilityProgress: { hydromancer: 0 }
      }
    }));
  });
  await page.reload({ waitUntil: "load" });
  await page.click('[data-step-index="6"]');
  const selkie = await page.evaluate(() => {
    const card = [...document.querySelectorAll(".class-progress-card")]
      .find((entry) => entry.querySelector("h4")?.textContent?.trim() === "Hydromancer");
    return {
      text: card?.textContent.replace(/\s+/g, " ").trim() || "",
      refundDisabled: card?.querySelector('[data-builder-action="refund-class-ability"]')?.disabled,
      budget: [...document.querySelectorAll(".selected-chip-list")].map((entry) => entry.textContent.replace(/\s+/g, " ").trim()).join(" | ")
    };
  });
  console.log(JSON.stringify({ selkie }, null, 2));
  if (!selkie.text.includes("Level 2") || !selkie.text.includes("0 EXP") || selkie.refundDisabled !== true || !selkie.budget.includes("Interlude: 0 / 3")) process.exitCode = 1;

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
      ui: { mode: "builder", gameVersion: "0.13.1" },
      fields: { Name: "Seven Sorrows Tester" },
      builder: {
        selectedRaceId: "human",
        selectedBreakthroughIds: ["weapon-training"],
        selectedClassIds: ["fighter"],
        classAbilityProgress: { fighter: 7 },
        choiceSelections: { "breakthrough-weapon-training-groups": "Katanas" }
      }
    }));
  });
  await page.reload({ waitUntil: "load" });
  await page.click('[data-step-index="6"]');
  const sevenSorrows = await page.evaluate(() => {
    const card = [...document.querySelectorAll(".builder-option-card")]
      .find((entry) => entry.querySelector("strong")?.textContent?.trim() === "Seven Sorrows Sword Style");
    return { found: Boolean(card), locked: card?.classList.contains("locked") || false };
  });
  console.log(JSON.stringify({ sevenSorrows }, null, 2));
  if (!sevenSorrows.found || sevenSorrows.locked) process.exitCode = 1;

  const creationBudgetCases = [
    {
      name: "Pure Human",
      raceId: "human",
      breakthroughIds: [],
      expectedBudget: 1100,
      expectedNote: ["Human adds 100"]
    },
    {
      name: "Human-Chimera Hybrid",
      raceId: "human",
      breakthroughIds: ["human-chimera-hybrid--race-"],
      expectedBudget: 1000,
      expectedNote: ["Human-Chimera Hybrid removes the Human +100"]
    },
    {
      name: "Human Slow Starter",
      raceId: "human",
      breakthroughIds: ["slow-starter"],
      expectedBudget: 900,
      expectedNote: ["Human adds 100", "Slow Starter removes 200"]
    },
    {
      name: "Chimera Slow Starter",
      raceId: "chimera",
      ancestryId: "slimefolk",
      breakthroughIds: ["slow-starter"],
      expectedBudget: 800,
      expectedNote: ["Slow Starter removes 200"]
    }
  ];
  const creationBudgetResults = [];
  for (const testCase of creationBudgetCases) {
    await page.evaluate((entry) => {
      localStorage.clear();
      localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
        ui: { mode: "builder", gameVersion: "0.13.1" },
        fields: { Name: `${entry.name} Budget Tester` },
        builder: {
          selectedRaceId: entry.raceId,
          selectedAncestryId: entry.ancestryId || "",
          selectedBreakthroughIds: entry.breakthroughIds
        }
      }));
    }, testCase);
    await page.reload({ waitUntil: "load" });
    await page.click('[data-step-index="6"]');
    const budgetResult = await page.evaluate(() => ({
      chips: [...document.querySelectorAll(".selected-chip")]
        .map((entry) => entry.textContent.replace(/\s+/g, " ").trim())
        .join(" | "),
      note: document.querySelector(".builder-note")?.textContent.replace(/\s+/g, " ").trim() || ""
    }));
    creationBudgetResults.push({ ...testCase, ...budgetResult });
  }
  console.log(JSON.stringify({ creationBudgetResults }, null, 2));
  for (const result of creationBudgetResults) {
    if (
      !result.chips.includes(`Class EXP: 0 / ${result.expectedBudget}`)
      || !result.chips.includes(`Remaining EXP: ${result.expectedBudget}`)
      || !result.expectedNote.every((text) => result.note.includes(text))
    ) process.exitCode = 1;
  }

  const skilledFlierCases = [
    { name: "Harpy trait", raceId: "chimera", ancestryId: "harpy", selected: [], expectedLocked: false },
    { name: "Pixie trait", raceId: "fae", ancestryId: "pixie", selected: [], expectedLocked: false },
    { name: "Tengu trait", raceId: "youkai", ancestryId: "tengu", selected: [], expectedLocked: false },
    { name: "Sylph activated Fly", raceId: "fae", ancestryId: "sylph", selected: [], expectedLocked: true },
    { name: "Mothfolk Racial Flight", raceId: "chimera", ancestryId: "mothfolk", selected: ["racial-flight"], expectedLocked: false }
  ];
  const skilledFlierResults = [];
  for (const testCase of skilledFlierCases) {
    await page.evaluate((entry) => {
      localStorage.clear();
      localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
        ui: { mode: "builder", gameVersion: "0.13.1" },
        fields: { Name: `${entry.name} Tester` },
        builder: {
          selectedRaceId: entry.raceId,
          selectedAncestryId: entry.ancestryId,
          selectedBreakthroughIds: entry.selected
        }
      }));
    }, testCase);
    await page.reload({ waitUntil: "load" });
    await page.click('[data-step-index="5"]');
    const status = await page.evaluate(() => {
      const card = [...document.querySelectorAll(".builder-option-card")]
        .find((entry) => entry.querySelector("strong")?.textContent.trim() === "Skilled Flier");
      return {
        found: Boolean(card),
        locked: card?.classList.contains("locked") || false,
        text: card?.textContent.replace(/\s+/g, " ").trim() || ""
      };
    });
    skilledFlierResults.push({ ...testCase, ...status });
  }
  console.log(JSON.stringify({ skilledFlierResults }, null, 2));
  for (const result of skilledFlierResults) {
    if (!result.found || result.locked !== result.expectedLocked) process.exitCode = 1;
  }

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
      ui: { mode: "builder", gameVersion: "0.13.1" },
      fields: { Name: "Speciality Weapon List Tester" },
      builder: {
        selectedRaceId: "human",
        selectedBreakthroughIds: ["speciality-weapon-training"],
        inspected: { breakthrough: "speciality-weapon-training" }
      }
    }));
  });
  await page.reload({ waitUntil: "load" });
  await page.click('[data-step-index="5"]');
  const specialityWeaponCard = page.locator('.builder-repeatable-choice-card').filter({ hasText: 'Speciality Weapon Training' });
  const specialityWeaponOptions = await specialityWeaponCard.locator('[data-repeatable-breakthrough-select] option').allTextContents();
  const requiredSpecialityWeapons = ["Chainsaw", "Channeling Weapons"];
  const retiredSpecialityWeapons = ["Gauntlets", "Wand", "Magic Staff", "Scythe", "Giant Scissors", "Pickaxe", "Hori", "Sickle", "Smith's Hammer"];
  console.log(JSON.stringify({ specialityWeaponOptions }, null, 2));
  if (
    !requiredSpecialityWeapons.every((name) => specialityWeaponOptions.includes(name))
    || retiredSpecialityWeapons.some((name) => specialityWeaponOptions.includes(name))
  ) process.exitCode = 1;

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
      ui: { mode: "builder", gameVersion: "0.13.1" },
      fields: { Name: "Skill Model Tester", Fitness: "2", SkillPoint1: "20" },
      builder: {
        selectedRaceId: "human",
        skillExpertiseEntries: [{ skillIndex: 1, name: "Climbing", source: "creation", choiceId: "", points: 8 }]
      }
    }));
  });
  await page.reload({ waitUntil: "load" });
  await page.click('[data-step-index="7"]');
  const skillModel = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".builder-skill-row")];
    const byName = (name) => rows.find((row) => row.querySelector(".builder-skill-copy strong")?.textContent?.trim() === name);
    const athletics = byName("Athletics");
    const gatheringNames = ["Mining", "Herbalism", "Foraging", "Fishing", "Hunting", "Logging"];
    return {
      names: rows.map((row) => row.querySelector(".builder-skill-copy strong")?.textContent?.trim()).filter(Boolean),
      gatheringLabels: gatheringNames.map((name) => byName(name)?.querySelector(".builder-skill-copy span")?.textContent?.trim() || ""),
      athleticsText: athletics?.textContent.replace(/\s+/g, " ").trim() || ""
    };
  });
  console.log(JSON.stringify({ skillModel }, null, 2));
  if (
    !["Artificer", "Herbalism", "Fishing", "Hunting", "Logging", "Blacksmith"].every((name) => skillModel.names.includes(name))
    || skillModel.names.includes("Blacksmithing")
    || !skillModel.gatheringLabels.every((label) => label.includes("no linked sub-stat"))
    || !skillModel.athleticsText.includes("Base Roll +17")
    || !skillModel.athleticsText.includes("exceed the 15-point cap by 5")
    || !skillModel.athleticsText.includes("= +15")
  ) process.exitCode = 1;

  const acolyteGateCases = [
    { name: "Human", raceId: "human", ancestryId: "", breakthroughs: [], expectedLocked: false },
    { name: "Nonhuman without Divine's Chosen", raceId: "fae", ancestryId: "selkie", breakthroughs: [], expectedLocked: true },
    { name: "Nonhuman with Divine's Chosen", raceId: "fae", ancestryId: "selkie", breakthroughs: ["divine-s-chosen"], expectedLocked: false }
  ];
  const acolyteGateResults = [];
  for (const testCase of acolyteGateCases) {
    await page.evaluate((entry) => {
      localStorage.clear();
      localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
        ui: { mode: "builder", gameVersion: "0.13.1" },
        fields: { Name: `${entry.name} Acolyte Gate Tester` },
        builder: {
          selectedRaceId: entry.raceId,
          selectedAncestryId: entry.ancestryId,
          selectedBreakthroughIds: entry.breakthroughs
        }
      }));
    }, testCase);
    await page.reload({ waitUntil: "load" });
    await page.click('[data-step-index="6"]');
    acolyteGateResults.push(await page.evaluate(() => {
      const card = [...document.querySelectorAll(".builder-option-card")]
        .find((entry) => entry.querySelector("strong")?.textContent?.trim() === "Acolyte");
      return { found: Boolean(card), locked: card?.classList.contains("locked") || false };
    }));
  }
  console.log(JSON.stringify({ acolyteGateResults }, null, 2));
  if (acolyteGateResults.some((result, index) => !result.found || result.locked !== acolyteGateCases[index].expectedLocked)) process.exitCode = 1;

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
      ui: { mode: "builder", gameVersion: "0.13.1" },
      fields: { Name: "Rogue Key Skill Grant Tester" },
      builder: {
        selectedRaceId: "human",
        selectedClassIds: ["rogue"],
        classAbilityProgress: { rogue: 0 }
      }
    }));
  });
  await page.reload({ waitUntil: "load" });
  await page.click('[data-step-index="7"]');
  const rogueGrantButton = page.locator('[data-adjust-class-skill="1"][data-class-skill-choice="class-rogue-key-skill-pool-1"][data-class-skill-kind="skill"]');
  for (let point = 0; point < 5; point += 1) await rogueGrantButton.click();
  const rogueSkillGrant = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".builder-skill-row")]
      .find((entry) => entry.querySelector(".builder-skill-copy strong")?.textContent?.trim() === "Roguecraft");
    return row?.textContent.replace(/\s+/g, " ").trim() || "";
  });
  console.log(JSON.stringify({ rogueSkillGrant }, null, 2));
  if (!rogueSkillGrant.includes("Class Benefit Skill 0 skill points left - 5") || !rogueSkillGrant.includes("Base Roll +5")) process.exitCode = 1;

  const fixedRacialExpertiseCases = [
    { raceId: "fae", ancestryId: "cu-sith", skill: "Perception", specialty: "Smell", bonus: "+5" },
    { raceId: "chimera", ancestryId: "mothfolk", skill: "Perception", specialty: "Vibration Sense", bonus: "+10" }
  ];
  const fixedRacialExpertiseResults = [];
  await page.waitForTimeout(300);
  for (const testCase of fixedRacialExpertiseCases) {
    await page.evaluate((entry) => {
      localStorage.clear();
      localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
        ui: { mode: "builder", gameVersion: "0.13.1" },
        fields: { Name: `${entry.ancestryId} Expertise Tester` },
        builder: { selectedRaceId: entry.raceId, selectedAncestryId: entry.ancestryId }
      }));
    }, testCase);
    await page.reload({ waitUntil: "load" });
    await page.click("#builder-sheet-shortcut-top");
    await page.waitForSelector("#play-skills .play-skill-mini-row");
    fixedRacialExpertiseResults.push(await page.evaluate((entry) => {
      const row = [...document.querySelectorAll("#play-skills .play-skill-mini-row")]
        .find((candidate) => candidate.textContent.includes(entry.skill));
      return row?.querySelector(".play-skill-expertise-options")?.textContent.replace(/\s+/g, " ").trim() || "";
    }, testCase));
  }
  console.log(JSON.stringify({ fixedRacialExpertiseResults }, null, 2));
  if (fixedRacialExpertiseResults.some((text, index) => !text.includes(`${fixedRacialExpertiseCases[index].specialty} ${fixedRacialExpertiseCases[index].bonus}`))) process.exitCode = 1;

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
      ui: { mode: "builder", gameVersion: "0.13.1" },
      fields: { Name: "All Paladins Override Tester" },
      builder: {
        selectedRaceId: "chimera",
        selectedAncestryId: "dogfolk",
        selectedBreakthroughIds: ["divine-s-chosen", "the-unknown-paladin", "light-armor-training", "medium-armor-training", "weapon-training"],
        selectedClassIds: ["ranger"],
        classAbilityProgress: { ranger: 7 },
        choiceSelections: { "breakthrough-weapon-training-groups": "Bludgeoning Weapons" }
      }
    }));
  });
  await page.reload({ waitUntil: "load" });
  await page.click('[data-step-index="6"]');
  const paladinGateResults = await page.evaluate(() => ["Gun Paladin", "Shield Paladin", "Sword Paladin"].map((name) => {
    const card = [...document.querySelectorAll(".builder-option-card")]
      .find((entry) => entry.querySelector("strong")?.textContent?.trim() === name);
    return { name, found: Boolean(card), locked: card?.classList.contains("locked") || false, note: card?.textContent.replace(/\s+/g, " ").trim() || "" };
  }));
  console.log(JSON.stringify({ paladinGateResults }, null, 2));
  if (paladinGateResults.some((result) => !result.found || result.locked)) process.exitCode = 1;

  const quickBuildCases = [
    {
      speciesId: "gnome",
      buildId: "seven-sorrows-rush",
      expectedClasses: ["Fighter", "Seven Sorrows Sword Style", "Miner"],
      expectedGear: "Katana (Two-Handed)",
      expectedProficiency: "Katana"
    },
    {
      speciesId: "raijin",
      buildId: "bard-expertise-rush",
      expectedClasses: ["Bard", "Idol", "Flash Star Blade Style"],
      expectedGear: "Small Weapons (One-Handed)",
      expectsBardExpertise: true
    },
    {
      speciesId: "selkie",
      buildId: "cleric-support",
      expectedClasses: ["Acolyte", "Medic", "Hydromancer"],
      expectedGear: "Staff (One-Handed)",
      expectedProficiency: "Staves",
      expectsDivineChoice: true
    }
  ];
  const quickBuildResults = [];
  for (const testCase of quickBuildCases) {
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    page.once("dialog", async (dialog) => dialog.accept());
    await page.click("#quick-build-entry");
    await page.click(`[data-quick-build-action="select-species"][data-id="${testCase.speciesId}"]`);
    await page.click("#builder-next");
    await page.click("#builder-next");
    await page.click(`[data-quick-build-action="select-build"][data-id="${testCase.buildId}"]`);
    await page.click("#builder-next");
    await page.waitForSelector(".quick-build-review-actions");
    await page.waitForTimeout(200);
    const quickResult = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("lyrian-chronicles-character-suite-v2") || "{}");
      const classNames = new Map((window.LYRIAN_DETAIL_DATA?.classes || []).map((entry) => [entry.id, entry.name]));
      const breakthroughRecords = new Map((window.LYRIAN_DATA?.breakthroughs || []).map((entry) => [entry.id, entry]));
      const itemNames = new Map((window.LYRIAN_DATA?.items || []).map((entry) => [entry.id, entry.name]));
      return {
        classes: (saved.builder?.selectedClassIds || []).map((id) => classNames.get(id) || id),
        breakthroughs: (saved.builder?.selectedBreakthroughIds || []).map((id) => breakthroughRecords.get(id)?.name || id),
        breakthroughSpend: (saved.builder?.selectedBreakthroughIds || []).reduce((total, id) => total + (Number.parseInt(breakthroughRecords.get(id)?.cost, 10) || 0), 0),
        divine: saved.builder?.choiceSelections?.["breakthrough-divine-s-chosen-divine"] || "",
        choices: saved.builder?.choiceSelections || {},
        expertise: saved.builder?.skillExpertiseEntries || [],
        inventory: (saved.play?.inventoryItems || []).map((entry) => ({
          name: itemNames.get(entry.itemId) || entry.name || entry.itemId,
          equipped: Boolean(entry.equipped)
        })),
        exp: [...document.querySelectorAll(".review-panel")]
          .map((entry) => entry.textContent.replace(/\s+/g, " ").trim())
          .find((entry) => entry.startsWith("EXP")) || ""
      };
    });
    quickBuildResults.push({ ...testCase, ...quickResult });
  }
  console.log(JSON.stringify({ quickBuildResults }, null, 2));
  for (const result of quickBuildResults) {
    const classesValid = result.expectedClasses.every((name) => result.classes.includes(name));
    const expertiseValid = !result.expectsBardExpertise || result.expertise.some((entry) =>
      entry.name === "Singing" && Number(entry.points) === 3 && entry.source === "creation"
    );
    const divineValid = !result.expectsDivineChoice || (result.breakthroughs.includes("Divine's Chosen") && result.divine === "Kari");
    const gearValid = result.inventory.some((entry) => entry.name === result.expectedGear && entry.equipped);
    const proficiencyValues = Object.entries(result.choices)
      .filter(([id]) => id.startsWith("class-") && id.includes("proficiency"))
      .map(([, value]) => value);
    const proficiencyValid = !result.expectedProficiency || proficiencyValues.includes(result.expectedProficiency);
    const uniqueFighterProficienciesValid = result.buildId !== "seven-sorrows-rush"
      || new Set(Object.entries(result.choices)
        .filter(([id]) => id.startsWith("class-fighter-common-weapon-proficiency"))
        .map(([, value]) => value)).size === 5;
    if (
      !classesValid
      || !expertiseValid
      || !divineValid
      || !gearValid
      || !proficiencyValid
      || !uniqueFighterProficienciesValid
      || result.breakthroughSpend !== 300
      || !result.exp.includes("Spent 1000 / 1000; remaining 0")
    ) process.exitCode = 1;
  }
} finally {
  await browser.close();
}
