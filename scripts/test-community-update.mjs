import { fork } from "node:child_process";
import { chromium } from "playwright";

const PORT = 4203;
const BASE_URL = `http://127.0.0.1:${PORT}/`;
const SAVE_KEY = "lyrian-chronicles-character-suite-v2";

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Community update test server did not start at ${BASE_URL}`);
}

async function seed(page, builder = {}, fields = {}, ui = {}) {
  await page.evaluate(({ saveKey, builderState, fieldState, uiState }) => {
    localStorage.clear();
    localStorage.setItem(saveKey, JSON.stringify({
      ui: { mode: "builder", gameVersion: "0.13.1", ...uiState },
      fields: { Name: "Community Update Probe", ...fieldState },
      builder: builderState
    }));
  }, {
    saveKey: SAVE_KEY,
    builderState: builder,
    fieldState: fields,
    uiState: ui
  });
  await page.reload({ waitUntil: "load" });
}

async function main() {
  const server = fork("scripts/server.mjs", [], {
    env: {
      ...process.env,
      LYRIAN_PORT: String(PORT),
      LYRIAN_NO_OPEN: "1"
    },
    stdio: "ignore"
  });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(BASE_URL, { waitUntil: "load" });
    const ids = await page.evaluate(() => {
      const byName = (records, name) => records.find((entry) => entry.name === name)?.id || "";
      return {
        human: byName(window.LYRIAN_DATA?.races || [], "Human"),
        mage: byName(window.LYRIAN_DATA?.classes || [], "Mage"),
        martialArtist: byName(window.LYRIAN_DATA?.classes || [], "Martial Artist")
      };
    });
    if (!ids.human || !ids.mage || !ids.martialArtist) {
      throw new Error(`Could not resolve focused community-test records: ${JSON.stringify(ids)}`);
    }

    await seed(page, {
      selectedRaceId: "fae",
      selectedAncestryId: "pixie",
      selectedBreakthroughIds: ["mystic-eyes-of-faerie-light--fae-"]
    }, {}, { mode: "sheet", sheetTab: "abilities" });
    await page.waitForSelector("#play-skills");
    const perceptionRow = page.locator("#play-skills .play-skill-mini-row")
      .filter({ has: page.locator(".play-skill-mini-copy strong", { hasText: /^Perception$/ }) });
    const fleText = await perceptionRow.textContent();
    if (!fleText.includes("Perception") || !fleText.includes("Illusion") || !fleText.includes("+10")) {
      const debug = await page.evaluate((saveKey) => {
        const saved = JSON.parse(localStorage.getItem(saveKey) || "{}");
        return {
          selectedBreakthroughIds: saved.builder?.selectedBreakthroughIds || [],
          raceId: saved.builder?.selectedRaceId || "",
          ancestryId: saved.builder?.selectedAncestryId || "",
          matchingBreakthroughs: (window.LYRIAN_DATA?.breakthroughs || [])
            .filter((entry) => /faerie light/i.test(entry.name || ""))
            .map((entry) => ({ id: entry.id, name: entry.name })),
          breakthroughPanel: document.querySelector("#play-breakthroughs")?.textContent.replace(/\s+/g, " ").trim() || ""
        };
      }, SAVE_KEY);
      throw new Error(`FLE expertise is missing from the skill model: ${JSON.stringify(debug)} ${fleText}`);
    }

    await seed(page, {
      selectedRaceId: ids.human,
      selectedClassIds: [ids.mage, ids.martialArtist],
      classAbilityProgress: { [ids.mage]: 0, [ids.martialArtist]: 0 }
    }, {}, { mode: "sheet", sheetTab: "proficiencies" });
    await page.waitForFunction(() =>
      document.querySelector("#play-proficiencies")?.textContent.includes("Channeling Weapons"));
    const proficiencyText = await page.locator("#play-proficiencies").textContent();
    for (const expected of ["Channeling Weapons", "Unarmed (as One-Handed)", "Gauntlets"]) {
      if (!proficiencyText.includes(expected)) {
        const savedBuilder = await page.evaluate((saveKey) =>
          JSON.parse(localStorage.getItem(saveKey) || "{}").builder || {}, SAVE_KEY);
        throw new Error(`Missing ${expected} in the proficiency projection: ${JSON.stringify({ ids, savedBuilder })} ${proficiencyText}`);
      }
    }

    await seed(page, {
      selectedRaceId: ids.human
    }, {}, { mode: "sheet", sheetTab: "abilities" });
    await page.waitForSelector("#play-quick-abilities .play-action-card");
    const abilityText = await page.locator("#play-quick-abilities").innerText();
    for (const expected of ["Divine Providence", "Human Adaptability"]) {
      if (!abilityText.includes(expected)) {
        throw new Error(`Missing ${expected} from Battle Mode: ${abilityText}`);
      }
    }

    console.log("[COMMUNITY UPDATE SUCCESS] FLE expertise, proficiency projection, and racial Battle Mode abilities passed.");
  } finally {
    await browser?.close().catch(() => {});
    server.kill();
  }
}

main().catch((error) => {
  console.error("[COMMUNITY UPDATE FAILURE]", error);
  process.exitCode = 1;
});
