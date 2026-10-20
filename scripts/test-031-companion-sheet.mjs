// Task 031 checks, builder side: the numbers the sheet sends to the Owlbear
// Companion (vttSummary) are the numbers its play sheet shows, for a Catfolk
// with race bonuses, Slow active (current speed) and EXP changed by hand.
//
// What this proves, in a real browser against the built app:
//   1. Send Character to Room posts a character whose vttSummary equals the
//      play sheet's displayed stats, Speed, EXP, Spirit Core and Clim.
//   2. Export Character JSON carries the same vttSummary; the new file and an
//      old file without it both import cleanly in the builder (no vttSummary
//      leaks into the saved state) and in the Companion's Choose File.
//   3. Opening the sheet from the Companion (Open My Character Sheet) lands on
//      the play sheet when a complete character is loaded, including from an
//      active save slot (ledger B19); opening the builder normally is
//      unchanged, and an incomplete character still opens the builder.
//
// Run:  npm run test:031   (builds first)
// Env:  T31_PORT (default 4252).
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "qa-test-results/task-031-companion");
await mkdir(output, { recursive: true });
const port = Number(process.env.T31_PORT || 4252);

const STORAGE_KEY = "lyrian-chronicles-character-suite-v2";
const SAVE_SLOTS_KEY = "lyrian-chronicles-character-suite-slots-v1";
const ACTIVE_SAVE_SLOT_KEY = "lyrian-chronicles-character-suite-active-slot-v1";
const COMPANION_CHARACTER_KEY = "asb.owlbear.character.v1";

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

function startServer() {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(root, "scripts/server.mjs"), [], {
      env: { ...process.env, LYRIAN_HOST: "127.0.0.1", LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" },
      silent: true
    });
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("Server did not start.")), 15000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = /running at (http:\/\/[^\s]+)/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve({ child, url: match[1].endsWith("/") ? match[1] : `${match[1]}/` });
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`Server exited early (${code}).`)));
  });
}

/* Reads the numbers the main play sheet shows right now, from the DOM. */
async function readDisplayedSheet(page) {
  return page.evaluate(() => {
    const num = (value) => Number(String(value || "").trim());
    const mainCards = [...document.querySelectorAll("#play-main-stat-strip .play-main-stat-card")];
    const secondaryCards = [...document.querySelectorAll("#play-secondary-grid .play-secondary-card")];
    const stats = {};
    mainCards.forEach((card) => { stats[card.querySelector("strong").textContent.trim().toLowerCase()] = num(card.querySelector(".play-main-stat-value").textContent); });
    secondaryCards.forEach((card) => { stats[card.querySelector("strong").textContent.trim().toLowerCase()] = num(card.querySelector(".play-secondary-value").textContent); });
    const derivedCard = (container, label) => [...document.querySelectorAll(`${container} .play-derived-card`)]
      .find((card) => card.querySelector("strong")?.textContent.trim() === label);
    return {
      stats,
      exp: num(derivedCard("#play-derived-grid", "Banked EXP")?.querySelector(".play-derived-value")?.textContent),
      spiritCore: num(derivedCard("#play-derived-grid", "Spirit Core")?.querySelector(".play-derived-value")?.textContent),
      clim: num(document.querySelector("#play-derived-grid .play-spirit-clim-head strong")?.textContent),
      speed: num(derivedCard("#play-utility-grid", "Speed")?.querySelector(".play-derived-value")?.textContent),
      hp: document.querySelector("#play-mobile-hp-status strong")?.textContent.trim() || ""
    };
  });
}

const summaryShape = (summary) => ({
  stats: summary?.stats,
  speed: summary?.speed,
  exp: summary?.exp,
  spiritCore: summary?.spiritCore,
  clim: summary?.clim
});
const displayedShape = (shown) => ({ stats: shown.stats, speed: shown.speed, exp: shown.exp, spiritCore: shown.spiritCore, clim: shown.clim });

let server;
let browser;
try {
  server = await startServer();
  browser = await chromium.launch();
  const baseUrl = server.url;

  // Resolve real ids for a Chimera / Catfolk with one class.
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const relayPosts = [];
  await context.route("**/api/vtt-relay/events*", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      try {
        relayPosts.push(JSON.parse(request.postData() || "null"));
      } catch {
        relayPosts.push(null);
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, seq: relayPosts.length }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, boot: "t31", seq: 0, events: [] }) });
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(baseUrl, { waitUntil: "load" });
  const ids = await page.evaluate(() => {
    const data = window.LYRIAN_DETAIL_DATA || {};
    const race = (data.races || []).find((entry) => entry.name?.trim() === "Chimera");
    const ancestry = (data.ancestries || []).find((entry) => entry.name?.trim() === "Catfolk");
    const klass = (data.classes || []).find((entry) => Number(entry.tier) === 1) || (data.classes || [])[0];
    // Task 038 item 6 (031 audit break B02): the character also owns gear, so
    // "Clim = total instead of available" changes the sent number.
    const gear = (window.LYRIAN_DATA?.items || []).find((entry) => entry.name?.trim() === "Healing Potion");
    return { raceId: race?.id || "", ancestryId: ancestry?.id || "", classId: klass?.id || "", className: klass?.name || "", gearId: gear?.id || "" };
  });
  assert.ok(ids.raceId && ids.ancestryId && ids.classId && ids.gearId, `Fixture ids missing: ${JSON.stringify(ids)}`);
  const catfolk = (extra = {}) => ({
    ui: { mode: "sheet", gameVersion: "0.13.2", ...(extra.ui || {}) },
    fields: { Name: "Mira Vale", Power: "2", Focus: "3", Agility: "3", Toughness: "3", Fitness: "2", Cunning: "1", Reason: "1", Awareness: "1", Presence: "2", "Earned Clim": "500", ...(extra.fields || {}) },
    builder: { selectedRaceId: ids.raceId, selectedAncestryId: ids.ancestryId, selectedClassIds: [ids.classId], selectedItemIds: [ids.gearId], ...(extra.builder || {}) },
    play: {
      activeEffects: [{ id: "t31-slow", name: "Slow", source: "Test", summary: "Movement speed is halved.", duration: "Until cleared", rules: { id: "slow", sourceType: "official", modifiers: { speedMultiplier: 0.5 } } }],
      ...(extra.play || {})
    }
  });
  await page.evaluate(({ key, state }) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(state)); }, { key: STORAGE_KEY, state: catfolk() });
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("#sheet-view:not(.is-hidden) #play-main-stat-strip .play-main-stat-card");

  // EXP changed by hand on the sheet: Subtract 100 on the EXP card.
  const expBefore = (await readDisplayedSheet(page)).exp;
  await page.fill('[data-play-transaction-amount="Exp"]', "100");
  await page.click('[data-play-transaction-field="Exp"][data-play-transaction-action="subtract"]');
  await page.waitForFunction((before) => {
    const card = [...document.querySelectorAll("#play-derived-grid .play-derived-card")].find((entry) => entry.querySelector("strong")?.textContent.trim() === "Banked EXP");
    return Number(card?.querySelector(".play-derived-value")?.textContent) === before - 100;
  }, expBefore);

  section("The play sheet shows race bonuses and the current speed");
  const shown = await readDisplayedSheet(page);
  console.log(`  displayed: ${JSON.stringify(shown)}`);
  check("Catfolk race bonus shows on Toughness (base 3)", shown.stats.toughness > 3, true);
  check("Catfolk race bonus shows on Awareness (base 1)", shown.stats.awareness > 1, true);
  check("Slow halves the shown Speed (current speed)", shown.speed < 20, true);
  check("EXP shows the hand change", shown.exp, expBefore - 100);
  check("Clim shows starting Clim plus the 500 earned", shown.clim > 500, true);
  // Task 038 item 6: the gear is on the sheet, so its cost is out of the Clim
  // shown (available Clim, not the total before purchases).
  check("the fixture owns gear (Healing Potion on the sheet)", (await page.evaluate(() => document.getElementById("sheet-view").textContent)).includes("Healing Potion"), true);

  section("Send Character to Room sends the shown numbers");
  await page.click('[data-play-mode="table"]:visible');
  await page.waitForSelector("#play-table-tools:not([hidden])");
  await page.locator('[data-table-tool-guide="owlbear"]').click();
  await page.waitForSelector("#sheet-modal:not([hidden]) .owlbear-setup-guide");
  const guideText = (await page.locator(".owlbear-setup-guide").textContent()).replace(/\s+/g, " ");
  check("setup guide gives the owner's first-time token steps", guideText.includes("First time: press Download Token Image, drag the file onto the Owlbear map and choose Character when Owlbear asks."), true);
  await page.click("[data-owlbear-send]");
  await page.waitForFunction(() => /Sent Mira Vale/.test(document.getElementById("owlbear-setup-feedback")?.textContent || ""), null, { timeout: 15000 });
  const handoff = relayPosts.find((entry) => entry?.kind === "character-handoff");
  check("the send carried a character handoff", Boolean(handoff), true);
  const sentSummary = handoff?.character?.vttSummary;
  check("sent vttSummary schemaVersion is 1", sentSummary?.schemaVersion, 1);
  check("sent vttSummary says current values", sentSummary?.basis, "current");
  check("sent vttSummary equals what the play sheet shows", summaryShape(sentSummary), displayedShape(shown));
  check("the rest of the send is the unchanged state snapshot", ["ui", "fields", "builder", "play"].every((key) => key in (handoff?.character || {})), true);
  await page.keyboard.press("Escape");
  await page.waitForSelector("#sheet-modal", { state: "hidden" });

  section("Export Character JSON carries the same summary");
  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  downloadPromise.catch(() => {});
  // The real Export Character flow: the export button opens the format
  // chooser, then the JSON File option.
  await page.evaluate(() => document.getElementById("builder-export-character").click());
  await page.click("#sheet-modal:not([hidden]) [data-export-mode=\"json\"]");
  const download = await downloadPromise;
  const exportPath = path.join(output, "mira-vale-new.json");
  await download.saveAs(exportPath);
  const exported = JSON.parse(await readFile(exportPath, "utf8"));
  check("exported JSON has the same vttSummary as the send", summaryShape(exported.vttSummary), displayedShape(shown));
  const oldFile = { ...exported };
  delete oldFile.vttSummary;
  const oldPath = path.join(output, "mira-vale-old.json");
  await writeFile(oldPath, JSON.stringify(oldFile, null, 2));

  section("Both files import cleanly in the builder");
  for (const [label, filePath] of [["new file (with vttSummary)", exportPath], ["old file (no vttSummary)", oldPath]]) {
    await page.evaluate((key) => { localStorage.removeItem(key); document.getElementById("status-pill").textContent = ""; }, STORAGE_KEY);
    await page.locator("#import-file").setInputFiles(filePath);
    await page.waitForFunction(() => /Imported mira-vale/.test(document.getElementById("status-pill")?.textContent || ""), null, { timeout: 15000 });
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), STORAGE_KEY);
    check(`builder import of the ${label} keeps the character`, saved.fields?.Name, "Mira Vale");
    check(`builder import of the ${label} does not store vttSummary in the save`, "vttSummary" in saved, false);
  }

  section("Both files import cleanly in the Companion");
  const companion = await context.newPage();
  const companionErrors = [];
  companion.on("pageerror", (error) => companionErrors.push(String(error)));
  await companion.goto(`${baseUrl}owlbear/panel.html`, { waitUntil: "domcontentloaded" });
  const companionStored = {};
  for (const [label, filePath] of [["new", exportPath], ["old", oldPath]]) {
    await companion.evaluate((key) => { localStorage.removeItem(key); document.getElementById("feedback").textContent = ""; }, COMPANION_CHARACTER_KEY);
    await companion.locator("#character-file").setInputFiles(filePath);
    await companion.waitForFunction(() => /^Imported Mira Vale\./.test(document.getElementById("feedback")?.textContent || ""), null, { timeout: 10000 });
    companionStored[label] = await companion.evaluate((key) => JSON.parse(localStorage.getItem(key)), COMPANION_CHARACTER_KEY);
  }
  const fromCompanion = (stored) => ({ stats: stored.stats, speed: stored.speed, exp: stored.resources.exp, spiritCore: stored.resources.spiritCore, clim: stored.resources.clim });
  check("Companion stores the shown numbers from the new file", fromCompanion(companionStored.new), displayedShape(shown));
  check("Companion stores the same character id from old and new files", companionStored.new.characterId, companionStored.old.characterId);
  check("old file in the Companion: EXP and Spirit Core still match the sheet (corrected field names)", [companionStored.old.resources.exp, companionStored.old.resources.spiritCore], [shown.exp, shown.spiritCore]);
  check("no Companion page errors", companionErrors, []);
  await writeFile(path.join(output, "companion-stored.json"), JSON.stringify({ shown, sent: sentSummary, companion: companionStored }, null, 2));
  await companion.close();
  check("no builder page errors", pageErrors, []);
  await page.close();

  section("Opening the sheet from the Companion lands on the play sheet");
  const landing = async (label, seed) => {
    const seedPage = await context.newPage();
    await seedPage.goto(`${baseUrl}owlbear/panel.html`, { waitUntil: "domcontentloaded" });
    await seedPage.evaluate(seed);
    // Normal open: a plain tab of the builder.
    const plain = await context.newPage();
    await plain.goto(baseUrl, { waitUntil: "load" });
    await plain.waitForFunction(() => /Loaded|Ready/.test(document.getElementById("status-pill")?.textContent || ""), null, { timeout: 15000 });
    await plain.waitForTimeout(300);
    const plainView = await plain.evaluate(() => (document.getElementById("sheet-view").classList.contains("is-hidden") ? "builder" : "sheet"));
    await plain.close();
    // Companion open: the panel's Open My Character Sheet button.
    const popupPromise = seedPage.waitForEvent("popup", { timeout: 20000 });
    await seedPage.locator("#open-sheet").click();
    const popup = await popupPromise;
    const popupErrors = [];
    popup.on("pageerror", (error) => popupErrors.push(String(error)));
    await popup.waitForLoadState("load");
    await popup.waitForFunction(() => /Loaded|Ready|Owlbear room/.test(document.getElementById("status-pill")?.textContent || ""), null, { timeout: 15000 });
    await popup.waitForTimeout(300);
    const popupView = await popup.evaluate(() => (document.getElementById("sheet-view").classList.contains("is-hidden") ? "builder" : "sheet"));
    const popupName = await popup.evaluate(() => window.name);
    await popup.close();
    await seedPage.close();
    console.log(`  ${label}: plain tab -> ${plainView}, from Companion -> ${popupView} (window.name ${popupName})`);
    return { plainView, popupView, popupErrors };
  };
  const slotSnapshot = catfolk({ ui: { mode: "builder" } });
  const fromSlot = await landing("complete character in an active save slot", new Function(`
    localStorage.clear();
    localStorage.setItem(${JSON.stringify(SAVE_SLOTS_KEY)}, JSON.stringify({ version: 1, slots: [{ id: "slot-t31", name: "Mira Vale", savedAt: new Date().toISOString(), snapshot: ${JSON.stringify(slotSnapshot)} }] }));
    localStorage.setItem(${JSON.stringify(ACTIVE_SAVE_SLOT_KEY)}, "slot-t31");
  `));
  check("active slot, plain tab: still lands on the builder (unchanged)", fromSlot.plainView, "builder");
  check("active slot, from the Companion: lands on the play sheet (B19)", fromSlot.popupView, "sheet");
  check("active slot, from the Companion: no page errors", fromSlot.popupErrors, []);
  const working = await landing("complete character, working save in builder mode", new Function(`
    localStorage.clear();
    localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, JSON.stringify(${JSON.stringify(catfolk({ ui: { mode: "builder", builderStep: 0 } }))}));
  `));
  check("working save, plain tab: lands on the builder (unchanged)", working.plainView, "builder");
  check("working save, from the Companion: lands on the play sheet", working.popupView, "sheet");
  const incomplete = await landing("character with no class yet", new Function(`
    localStorage.clear();
    localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, JSON.stringify(${JSON.stringify(catfolk({ ui: { mode: "builder", builderStep: 0 }, builder: { selectedClassIds: [] } }))}));
  `));
  check("incomplete character, from the Companion: stays in the builder", incomplete.popupView, "builder");
  const fresh = await landing("no character at all", new Function("localStorage.clear();"));
  check("no character, from the Companion: the builder opens", fresh.popupView, "builder");
  await context.close();
} finally {
  await browser?.close().catch(() => {});
  server?.child.kill();
}

console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.log(`Failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("Task 031 checks: PASS");
