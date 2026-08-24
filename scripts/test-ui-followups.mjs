import { chromium } from "playwright";
import { fork } from "node:child_process";

const port = 4210;
const url = `http://127.0.0.1:${port}/`;
const server = fork(new URL("./server.mjs", import.meta.url), [], {
  env: { ...process.env, LYRIAN_PORT: String(port) },
  silent: true
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await wait(700);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => {
    window.__diceAudioEvents = [];
    const NativeAudio = window.Audio;
    window.Audio = function TrackedDiceAudio(src) {
      const audio = new NativeAudio(src);
      const nativePlay = audio.play.bind(audio);
      const nativePause = audio.pause.bind(audio);
      audio.play = () => {
        window.__diceAudioEvents.push({ type: "play", src: audio.src, time: performance.now() });
        const promise = nativePlay();
        promise?.then(() => {
          window.__diceAudioEvents.push({ type: "playing", src: audio.src, time: performance.now() });
        }).catch((error) => {
          window.__diceAudioEvents.push({ type: "error", src: audio.src, error: String(error), time: performance.now() });
        });
        return promise;
      };
      audio.pause = () => {
        window.__diceAudioEvents.push({ type: "pause", src: audio.src, time: performance.now() });
        return nativePause();
      };
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
  });

  await page.goto(url, { waitUntil: "load" });
  const humanId = await page.evaluate(() =>
    (window.LYRIAN_DETAIL_DATA?.races || []).find((race) => race.name?.trim() === "Human")?.id || ""
  );
  if (!humanId) throw new Error("The Human species fixture could not be resolved.");
  await page.evaluate((selectedRaceId) => {
    localStorage.clear();
    localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
      ui: { mode: "builder", builderStep: 7, gameVersion: "0.13.1" },
      fields: { Name: "Legacy Expertise Assignment", Expertise1: "+2" },
      builder: { selectedRaceId, skillExpertiseEntries: [] }
    }));
  }, humanId);
  await page.reload({ waitUntil: "load" });
  await page.click('[data-step-index="7"]');
  await page.waitForSelector('[data-assign-skill-expertise]');
  const legacyPanel = page.locator(".builder-skill-expertise-panel").first();
  const budgetBefore = await page.locator("#builder-step-content").textContent();
  await legacyPanel.locator("select[data-skill-expertise-name]").selectOption("Jumping");
  await legacyPanel.locator("[data-assign-skill-expertise]").click();
  await page.waitForFunction(() => {
    const text = document.querySelector(".builder-skill-expertise-panel")?.textContent || "";
    return text.includes("Jumping") && !text.includes("Unassigned creation expertise");
  });
  const budgetAfter = await page.locator("#builder-step-content").textContent();
  if (!budgetBefore.includes("Skill Points Spent: 1 / 10") || !budgetAfter.includes("Skill Points Spent: 1 / 10")) {
    throw new Error("Assigning a legacy expertise point changed the creation-point budget.");
  }

  await page.click('[data-step-index="6"]');
  await page.waitForSelector('[data-builder-search="class"]');
  await page.fill('[data-builder-search="class"]', "Blacksmith");
  await page.getByRole("button", { name: /^Blacksmith Blacksmith Tier 1/ }).click();
  await page.waitForSelector('[data-builder-action="inspect-class"]');
  const selectedText = await page.locator(".builder-selected-classes-panel").textContent();
  if (!selectedText.includes("Blacksmith")) {
    throw new Error("Selected Classes did not retain the chosen class.");
  }
  await page.locator('[data-builder-action="inspect-class"]').first().click();
  await page.waitForFunction(() => document.querySelector("#builder-detail-card h3")?.textContent?.trim() === "Blacksmith");

  await page.click("#builder-sheet-shortcut-top");
  await page.waitForSelector("[data-dice-toggle]");
  const sheetTools = await page.evaluate(() => ({
    labels: [...document.querySelectorAll(".sheet-toolbar-actions > button, .sheet-toolbar-actions > details > summary")]
      .map((node) => node.textContent.replace(/\s+/g, " ").trim()),
    removedToolsAbsent: !document.getElementById("save-browser")
      && !document.getElementById("export-json")
      && !document.getElementById("sheet-integrations")
      && !document.getElementById("recalc-basics")
      && !document.getElementById("load-browser")
      && !document.getElementById("import-json")
      && !document.getElementById("clear-sheet"),
    builderToolsPresent: Boolean(document.getElementById("builder-load-browser")
      && document.getElementById("builder-import-character")
      && document.getElementById("builder-start-over-sidebar"))
  }));
  if (sheetTools.labels.length !== 0
    || !sheetTools.removedToolsAbsent
    || !sheetTools.builderToolsPresent) {
    throw new Error(`Play-sheet tool separation is incorrect: ${JSON.stringify(sheetTools)}`);
  }
  await page.click('[data-play-mode="table"]:visible');
  await page.waitForSelector('#play-table-tools:not([hidden])');
  const tableTools = await page.evaluate(() => ({
    modeLabels: [...document.querySelectorAll('#play-header-card [data-play-mode]')].map((button) => button.innerText.trim()),
    actions: [...document.querySelectorAll('#play-table-tools [data-table-tool-action]')].map((button) => button.dataset.tableToolAction),
    guides: [...document.querySelectorAll('#play-table-tools [data-table-tool-guide]')].map((button) => button.dataset.tableToolGuide),
    platformStatuses: [...document.querySelectorAll('#play-table-tools .table-platform-card')].map((card) => ({
      name: card.querySelector('strong')?.textContent?.trim() || '',
      status: card.querySelector('.integration-status')?.textContent?.trim() || ''
    })),
    hasRedundantAllConnections: document.querySelector('#play-table-tools')?.textContent.includes('All Connections') || false
  }));
  if (tableTools.modeLabels.join("|") !== "Combat|Crafting|Gathering|Table Tools"
    || !["save", "load", "export", "import", "recalculate", "builder"].every((action) => tableTools.actions.includes(action))
    || tableTools.actions.includes("connections")
    || !["character-files", "roll20", "owlbear", "foundry", "world-anvil", "official-builder"].every((guide) => tableTools.guides.includes(guide))
    || tableTools.platformStatuses.find((entry) => entry.name === "Owlbear Rodeo")?.status !== "Alpha"
    || tableTools.platformStatuses.find((entry) => entry.name === "Official Clio Builder")?.status !== "Verified"
    || tableTools.platformStatuses.filter((entry) => !["Owlbear Rodeo", "Official Clio Builder"].includes(entry.name)).some((entry) => entry.status !== "Coming Soon")
    || tableTools.hasRedundantAllConnections) {
    throw new Error(`Table Tools workspace is incomplete: ${JSON.stringify(tableTools)}`);
  }
  await page.click('[data-table-tool-action="recalculate"]');
  if (!(await page.locator("#status-pill").textContent()).includes("Recalculated HP")) {
    throw new Error("Table Tools did not recalculate the sheet.");
  }
  await page.click('[data-play-mode="combat"]');
  await page.click("[data-dice-toggle]");
  await page.click("[data-dice-change]");
  await page.waitForSelector("[data-dice-use]");
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll(".dice-set-card-preview"));
    const cards = Array.from(document.querySelectorAll(".dice-set-card"));
    const panel = document.querySelector(".dice-tray-panel");
    return images.length === 4
      && images.every((image) => image.complete && image.naturalWidth > 0)
      && cards.length === 4
      && panel?.getBoundingClientRect().width <= 451
      && cards.every((card) => {
        const box = card.getBoundingClientRect();
        return box.height > 0 && Math.abs((box.width / box.height) - 1.6) < 0.03;
      });
  });
  await page.waitForFunction(() => {
    const panel = document.querySelector(".dice-tray-panel");
    const useButton = document.querySelector("[data-dice-use]");
    if (!panel || !useButton) {
      return false;
    }
    const panelBox = panel.getBoundingClientRect();
    const useBox = useButton.getBoundingClientRect();
    const expectedScroll = Math.max(
      0,
      useButton.offsetTop + useButton.offsetHeight - panel.clientHeight
    );
    return Math.abs(panel.scrollTop - expectedScroll) < 3
      && useBox.top >= panelBox.top
      && useBox.bottom <= panelBox.bottom
      && (panelBox.bottom - useBox.bottom) < 3;
  });
  const availableSets = page.locator("[data-dice-set]");
  const availableSetIds = await availableSets.evaluateAll((buttons) => buttons.map((button) => button.dataset.diceSet));
  for (const setId of availableSetIds) {
    await page.locator(`[data-dice-set="${setId}"]`).click();
    await page.waitForSelector("[data-dice-use]");
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll(".dice-choice-icon img"));
      const sources = images.map((image) => image.currentSrc || image.src);
      return images.length === 7
        && images.every((image) => image.complete && image.naturalWidth > 0)
        && new Set(sources).size === 7;
    }, null, { timeout: 15000 });
  }
  await page.click("[data-dice-use]");
  if (await page.locator("[data-dice-use]").count()) {
    throw new Error("Use Dice did not collapse the expanded set gallery.");
  }
  await page.click('[data-dice-add="20"]');
  await page.click("[data-dice-roll]");
  await page.waitForSelector("#dice-flight-layer canvas", { timeout: 15000 });
  await page.waitForFunction(() => window.LyrianAccurateDiceRoller?.getStatus?.().shared?.motionMode === "scripted-fallback", null, { timeout: 15000 });
  await page.waitForFunction(() => window.__diceAudioEvents.some((event) => event.type === "play" && event.src.includes("dice-impact")), null, { timeout: 5000 });
  const diceAudio = await page.evaluate(() => {
    const events = window.__diceAudioEvents;
    const bedPlay = events.find((event) => event.type === "play" && event.src.includes("dice-roll-bed"));
    const prematurePause = bedPlay && events.find((event) =>
      event.type === "pause"
      && event.src.includes("dice-roll-bed")
      && event.time - bedPlay.time < 700
    );
    return {
      bedPlayed: Boolean(bedPlay),
      impactPlayCount: events.filter((event) => event.type === "play" && event.src.includes("dice-impact")).length,
      prematurePause: Boolean(prematurePause),
      errors: events.filter((event) => event.type === "error")
    };
  });
  if (!diceAudio.bedPlayed || diceAudio.impactPlayCount < 1 || diceAudio.prematurePause || diceAudio.errors.length) {
    throw new Error(`First-roll dice audio regression: ${JSON.stringify(diceAudio)}`);
  }
  const flightLayerAlphas = await page.locator("#dice-flight-layer canvas").evaluate((source) => {
    const probe = document.createElement("canvas");
    probe.width = source.width;
    probe.height = source.height;
    const context = probe.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0);
    return [
      [0.08, 0.65],
      [0.15, 0.78],
      [0.85, 0.78],
      [0.92, 0.65]
    ].map(([x, y]) => context.getImageData(
      Math.floor(source.width * x),
      Math.floor(source.height * y),
      1,
      1
    ).data[3]);
  });
  if (flightLayerAlphas.some((alpha) => alpha > 4)) {
    throw new Error(`Dice canvas is tinting the page away from the dice: alpha samples ${flightLayerAlphas.join(", ")}`);
  }

  await page.click("#return-to-builder");
  await page.waitForSelector("#builder-view:not(.is-hidden)");
  await page.click("#builder-start-over-sidebar");
  await page.waitForSelector("#sheet-modal:not([hidden])");
  const confirmationText = await page.locator("#sheet-modal").textContent();
  if (!confirmationText.includes("Are you sure you wish to erase this character and start over?")
    || !confirmationText.includes("Yes, Erase Character")
    || !confirmationText.includes("No, Keep Character")) {
    throw new Error(`Reset Character confirmation copy is incomplete: ${confirmationText}`);
  }
  await page.getByRole("button", { name: "No, Keep Character" }).click();
  if (!await page.locator("#builder-view:not(.is-hidden)").count()
    || !(await page.locator("#builder-summary").textContent()).includes("Legacy Expertise Assignment")) {
    throw new Error("Cancelling Reset Character did not preserve the current character.");
  }

  await page.click("#builder-start-over-sidebar");
  await page.click("[data-reset-character-confirm]");
  await page.waitForSelector("#builder-view:not(.is-hidden)");
  const clearedState = await page.evaluate(() => JSON.parse(localStorage.getItem("lyrian-chronicles-character-suite-v2") || "{}"));
  if (clearedState.fields?.Name || clearedState.builder?.selectedClasses?.length) {
    throw new Error(`Confirming Reset Character did not erase the working character: ${JSON.stringify(clearedState)}`);
  }

  const officialJobCharacter = {
    format: "angelssword-character",
    version: 1,
    character: {
      name: "Official Job Interop",
      gameMode: "mirane",
      race: { primaryRaceId: "fae", primaryRaceName: "Fae", ancestryId: "high-fae", ancestryName: "High Fae" },
      mainStats: { power: 3, focus: 4, agility: 5, toughness: 2 },
      subStats: { fitness: 1, cunning: 4, reason: 3, awareness: 2, presence: 5 },
      classes: [],
      breakthroughs: [],
      skills: {},
      interludeActions: ["job"],
      equipment: [
        { itemId: "pistol--one-handed-", name: "Pistol (One-Handed)", baseName: "Pistol (One-Handed)", cost: 1000 },
        { itemId: "armor--clothing-", name: "Armor (Clothing)", baseName: "Armor (Clothing)", cost: 500 },
        { itemId: "adventurer-s-kit", name: "Adventurer's Kit", baseName: "Adventurer's Kit", cost: 100 },
        { itemId: "parrot-elixir", name: "Parrot Elixir", baseName: "Parrot Elixir", cost: 500, qty: 1 },
        { itemId: "silencer", name: "Silencer", baseName: "Silencer", cost: 1500 },
        { itemId: "smoke-flask", name: "Smoke Flask", baseName: "Smoke Flask", cost: 250, qty: 1 },
        { itemId: "weak-spider-poison", name: "Weak Spider Poison", baseName: "Weak Spider Poison", cost: 150, qty: 1 }
      ],
      resources: { clim: 300, classExp: 1000, interludePoints: 2 }
    }
  };
  await page.setInputFiles("#import-file", {
    name: "official-job-interop.aschar.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(officialJobCharacter))
  });
  await page.waitForSelector("#sheet-modal:not([hidden])");
  const jobImportText = await page.locator("#sheet-modal").textContent();
  const jobImportState = await page.evaluate(() => JSON.parse(localStorage.getItem("lyrian-chronicles-character-suite-v2") || "{}"));
  if (
    !jobImportText.includes("1 creation interlude action(s)")
    || !jobImportText.includes("Clim matched: 300 remaining, including 1 Job interlude action")
    || JSON.stringify(jobImportState.builder?.creationInterludeActions) !== JSON.stringify(["job"])
  ) {
    throw new Error(`Official Job interlude import did not preserve the 300 Clim round trip: ${JSON.stringify({ jobImportText, actions: jobImportState.builder?.creationInterludeActions })}`);
  }
  await page.locator("#sheet-modal-close").click();
  await page.click('[data-step-index="6"]');
  const interludePanelText = await page.locator(".builder-creation-interlude-panel").textContent();
  if (!interludePanelText.includes("Job: +300 Clim") || !interludePanelText.includes("Train — +25 class EXP")) {
    throw new Error(`Creation interlude controls did not render the imported Job action: ${interludePanelText}`);
  }

  await browser.close();
  console.log("Expertise assignment, class interaction, play-sheet tools, dice chooser, scripted roll, builder reset, and official Job interlude import tests passed.");
} finally {
  server.kill();
}
