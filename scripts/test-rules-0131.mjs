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
      expectedProficiency: "Magic Staff",
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
