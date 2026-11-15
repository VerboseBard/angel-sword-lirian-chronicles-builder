import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = 4571;
const origin = `http://127.0.0.1:${port}`;
const latest = "0.13.3";
const prior = "0.13.2";
const keys = {
  working: "lyrian-chronicles-character-suite-v2",
  slots: "lyrian-chronicles-character-suite-slots-v1",
  active: "lyrian-chronicles-character-suite-active-slot-v1",
  preferred: "lyrian-chronicles-selected-game-version-v2",
  baseline: "lyrian-chronicles-selected-game-version-latest-v1",
};
const fixturePath = path.join(root, "tests/fixtures/043-live-3346d32/human-sneak-thief-standard-used.json");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

const server = fork(path.join(root, "scripts/server.mjs"), [], {
  cwd: root,
  env: { ...process.env, LYRIAN_HOST: "127.0.0.1", LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" },
  silent: true,
});
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The isolated server did not start on port " + port)), 8000);
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("The isolated server exited with " + code));
    });
    let output = "";
    server.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("http://localhost:" + port + "/") || output.includes(origin + "/")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin
    ? route.continue()
    : route.abort("blockedbyclient"));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const select = page.locator("#game-version-select");
  const ready = (version) => page.waitForFunction((id) =>
    document.querySelector("#game-version-select")?.value === id &&
    window.LYRIAN_DATA?.version === id &&
    window.LYRIAN_DETAIL_DATA?.version === id,
  version);
  const stored = () => page.evaluate((k) => {
    const slotId = localStorage.getItem(k.active);
    return {
      working: JSON.parse(localStorage.getItem(k.working)),
      slots: JSON.parse(localStorage.getItem(k.slots))?.slots || [],
      slotId,
      preferred: localStorage.getItem(k.preferred),
      baseline: localStorage.getItem(k.baseline),
      selected: document.querySelector("#game-version-select")?.value,
      base: window.LYRIAN_DATA?.version,
      detail: window.LYRIAN_DETAIL_DATA?.version,
    };
  }, keys);
  const waitForStored = (version, message, slotId = null) => page.waitForFunction(({ k, id, slot }) => {
    if (JSON.parse(localStorage.getItem(k.working))?.ui?.gameVersion !== id) return false;
    if (!slot) return true;
    const slots = JSON.parse(localStorage.getItem(k.slots))?.slots || [];
    return slots.find((entry) => entry.id === slot)?.snapshot?.ui?.gameVersion === id;
  }, { k: keys, id: version, slot: slotId }, { timeout: 2500 }).catch((error) => {
    throw new Error(message, { cause: error });
  });
  const nameAndChoices = (snapshot) => ({
    name: snapshot.fields.Name,
    race: snapshot.builder.selectedRaceId,
    classes: snapshot.builder.selectedClassIds,
    choices: snapshot.builder.choiceSelections,
    skills: Object.fromEntries(Object.entries(snapshot.fields).filter(([field]) =>
      /^(RacialSkillPoint|ClassSkillPoint|ClassExpertiseSpend):/.test(field))),
    expertise: snapshot.builder.skillExpertiseEntries,
    campaign: snapshot.builder.startMode,
  });
  const change = async (version) => {
    await select.selectOption(version);
    await ready(version);
    await page.locator("#builder-status-pill").filter({ hasText: "Loaded Lyrian rules version " + version }).waitFor();
  };

  await page.goto(origin);
  await ready(latest);
  await change(prior);
  await page.reload();
  await ready(prior);
  assert.equal((await stored()).preferred, prior);
  console.log("PASS fresh rules preference survives reload");

  await page.locator('[data-builder-action="pick-race"][data-id="human"]').click();
  await page.locator("#builder-name-header").fill("Rules Switch Test");
  await waitForStored(prior, "Editing should create a working snapshot");
  await page.waitForFunction(({ key, name }) => JSON.parse(localStorage.getItem(key))?.fields?.Name === name,
    { key: keys.working, name: "Rules Switch Test" });
  const draft = await stored();
  await change(latest);
  await waitForStored(latest, "A successful explicit switch must persist the edited working snapshot");
  assert.equal((await stored()).working.fields.Name, draft.working.fields.Name);
  assert.equal((await stored()).working.builder.selectedRaceId, draft.working.builder.selectedRaceId);
  await page.reload();
  await ready(latest);
  assert.equal((await stored()).working.fields.Name, "Rules Switch Test");
  await change(prior);
  await waitForStored(prior, "The reverse version switch must also persist");
  await page.reload();
  await ready(prior);
  console.log("PASS edited character switches both ways and survives reload");

  await change(latest);
  await page.locator("#import-file").setInputFiles(fixturePath);
  await ready(prior);
  await page.waitForFunction(({ key, name }) => JSON.parse(localStorage.getItem(key))?.fields?.Name === name,
    { key: keys.working, name: fixture.fields.Name });
  const imported = await stored();
  assert.equal(imported.working.ui.gameVersion, prior);
  assert.deepEqual(imported.working.builder.selectedClassIds, fixture.builder.selectedClassIds);
  assert.equal(imported.preferred, latest, "import preserves standalone preference");
  console.log("PASS imported character retains its own rules version and class selections");
  const returnToBuilder = page.locator("#return-to-builder");
  if (await returnToBuilder.isVisible()) await returnToBuilder.click();

  async function saveSlot(name) {
    await page.locator("#builder-save-browser").click();
    await page.locator("#save-slot-name-input").fill(name);
    await page.getByRole("button", { name: "Save New Slot" }).click();
    await page.waitForFunction(({ slotsKey, name }) =>
      JSON.parse(localStorage.getItem(slotsKey))?.slots?.some((entry) => entry.name === name),
    { slotsKey: keys.slots, name });
    const close = page.locator("#sheet-modal-close");
    if (await close.isVisible()) await close.click();
  }

  await saveSlot("Inactive 0.13.2 Test");
  await saveSlot("Active Rules Switch Test");
  const before = await stored();
  const inactive = before.slots.find((slot) => slot.name === "Inactive 0.13.2 Test");
  const active = before.slots.find((slot) => slot.id === before.slotId);
  assert.equal(active.name, "Active Rules Switch Test");
  assert.ok(Object.keys(nameAndChoices(before.working).skills).length, "the test must include assigned skill points");
  assert.ok(Object.keys(before.working.builder.choiceSelections).length, "the test must include character choices");
  const preservedPools = before.working.play.resourcesBeforeBuilderVisit;
  assert.ok(preservedPools?.hp.current < preservedPools?.hp.max, "the test must include depleted play pools");
  await change(latest);
  await waitForStored(latest, "The active named slot should retain the successful rules switch", active.id);
  const after = await stored();
  assert.deepEqual(nameAndChoices(after.working), nameAndChoices(before.working));
  assert.deepEqual(after.working.play.resourcesBeforeBuilderVisit, preservedPools);
  assert.deepEqual(after.slots.find((slot) => slot.id === active.id).snapshot.play.resourcesBeforeBuilderVisit, preservedPools);
  assert.deepEqual(after.slots.find((slot) => slot.id === inactive.id), inactive);
  await page.reload();
  await ready(latest);
  await page.locator("#builder-status-pill").filter({ hasText: "Loaded the active saved character slot" }).waitFor();
  const reloaded = await stored();
  assert.equal(reloaded.slotId, active.id);
  assert.deepEqual(nameAndChoices(reloaded.working), nameAndChoices(before.working));
  await page.locator("#builder-next").filter({ hasText: "Continue to Character Sheet" }).click();
  assert.equal(Number(await page.locator("#play-hit-points .play-hit-current").innerText()), preservedPools.hp.current, "hp");
  for (const [pool, key] of [["mana", "manaCurrent"], ["rp", "rpCurrent"], ["ap", "apCurrent"]]) {
    assert.equal(Number(await page.locator(`[data-play-resource="${key}"]`).inputValue()), preservedPools[pool].current, pool);
  }
  await returnToBuilder.click();
  await page.waitForFunction(({ k, pools }) => {
    const current = JSON.parse(localStorage.getItem(k.working))?.play?.resourcesBeforeBuilderVisit;
    return current?.hp?.current === pools.hp.current && current?.mana?.current === pools.mana.current;
  }, { k: keys, pools: preservedPools });
  console.log("PASS active slot retains version, choices and resources while the inactive slot keeps its snapshot");

  const blockedDetail = "**/assets/versions/0.13.1/lyrian-detail-data.js*";
  await page.route(blockedDetail, (route) => route.abort("failed"));
  const priorState = await stored();
  await select.selectOption("0.13.1");
  await page.locator("#builder-status-pill").filter({ hasText: /could not load.*0\.13\.1.*lyrian-detail-data/i }).waitFor();
  assert.deepEqual(await stored(), priorState, "failure after the base script must preserve the old data and saves");
  await page.unroute(blockedDetail);
  await change("0.13.1");
  await waitForStored("0.13.1", "Retry should update the active character", active.id);
  console.log("PASS failed detail load leaves both datasets and saves intact and allows a retry");

  const promotionPage = await context.newPage();
  await promotionPage.goto(origin);
  await promotionPage.evaluate(({ k, snapshot }) => {
    localStorage.removeItem(k.active);
    localStorage.removeItem(k.slots);
    localStorage.setItem(k.working, JSON.stringify(snapshot));
    localStorage.setItem(k.preferred, snapshot.ui.gameVersion);
    localStorage.setItem(k.baseline, snapshot.ui.gameVersion);
  }, { k: keys, snapshot: fixture });
  await promotionPage.reload();
  await promotionPage.waitForFunction((id) =>
    document.querySelector("#game-version-select")?.value === id &&
    window.LYRIAN_DETAIL_DATA?.version === id,
  latest);
  const originalWorking = await promotionPage.evaluate((k) => localStorage.getItem(k.working), keys);
  assert.equal(originalWorking, JSON.stringify(fixture), "startup promotion remains in memory until an edit");
  assert.deepEqual(errors, []);
  console.log("PASS startup promotion preserves saved bytes until edit");
} finally {
  await browser?.close();
  server.kill();
}
