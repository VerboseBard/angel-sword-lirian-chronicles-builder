/* Live interop verification (checklist items 4 & 5, automated halves):
   1. Drives the REAL app in headless Chromium against the running dev server,
      clicks the actual Export .aschar.json and Export CCS Spreadsheet buttons,
      and captures the genuine downloaded files.
   2. Validates the .aschar file's envelope/content.
   3. Uploads the .aschar file to Angel's Sword's LIVE official vault page and
      confirms their import code accepts it and lists the character.
   The CCS xlsx is saved for the follow-up cell-value validation step.

   Prereq: dev server running (node scripts/server.mjs), default port 4176.
   Run: node scripts/verify-interop-live.mjs [baseUrl] [outDir] */

import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.argv[2] || "http://localhost:4176";
const OUT_DIR = process.argv[3] || path.join(process.cwd(), "qa-test-results", "interop-live");
let failures = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok: ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log(`— building a character at ${BASE_URL} —`);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-builder-action="pick-race"].builder-option-card', { timeout: 15000 });
  await page.locator('[data-builder-action="pick-race"].builder-option-card').first().click();
  await page.locator("#builder-sheet-shortcut-top").click();
  await page.waitForSelector("#sheet-view:not(.is-hidden)", { timeout: 10000 });
  await page.evaluate(() => {
    const nameField = document.querySelector('[data-field="Name"]');
    if (nameField) {
      nameField.value = "Interop Probe";
      nameField.dispatchEvent(new Event("input", { bubbles: true }));
      nameField.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await page.locator("#open-table-tools").click();
  await page.waitForSelector('#play-table-tools:not([hidden])', { timeout: 5000 });
  await page.locator('[data-table-tool-guide="official-builder"]').click();
  await page.waitForSelector("#sheet-modal:not([hidden])", { timeout: 5000 });

  console.log("— exporting .aschar.json through the real button —");
  const [ascharDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator("[data-integration-aschar-export]").click()
  ]);
  const ascharPath = path.join(OUT_DIR, ascharDownload.suggestedFilename());
  await ascharDownload.saveAs(ascharPath);
  const ascharJson = JSON.parse(await readFile(ascharPath, "utf8"));
  check(".aschar filename carries the double extension", ascharDownload.suggestedFilename().endsWith(".aschar.json"));
  check("envelope format marker", ascharJson.format === "angelssword-character" && ascharJson.version === 1);
  check("character name survived", ascharJson.character?.name === "Interop Probe");
  check("race block present", Boolean(ascharJson.character?.race?.primaryRaceId));
  check("resources block present", typeof ascharJson.character?.resources?.clim === "number");

  console.log("— exporting the CCS spreadsheet through the real button —");
  const [ccsDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.locator("[data-integration-ccs-export]").click()
  ]);
  const ccsPath = path.join(OUT_DIR, ccsDownload.suggestedFilename());
  await ccsDownload.saveAs(ccsPath);
  const ccsBytes = await readFile(ccsPath);
  check("CCS file downloads with content", ccsBytes.length > 400000, `${ccsBytes.length} bytes`);
  check("CCS file is a zip container", ccsBytes[0] === 0x50 && ccsBytes[1] === 0x4b);
  console.log(`  saved for cell validation: ${ccsPath}`);

  console.log("— live official-vault import (clio.angelssword.com) —");
  try {
    await page.goto("https://clio.angelssword.com/characterbuilder/vault.html", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("#vault-import-input", { state: "attached", timeout: 15000 });
    const before = await page.evaluate(() => (JSON.parse(localStorage.getItem("angelssword_vault") || "[]")).length);
    await page.setInputFiles("#vault-import-input", ascharPath);
    await page.waitForFunction(
      (previous) => (JSON.parse(localStorage.getItem("angelssword_vault") || "[]")).length > previous,
      before,
      { timeout: 10000 }
    );
    const vault = await page.evaluate(() => JSON.parse(localStorage.getItem("angelssword_vault") || "[]"));
    const imported = vault.find((entry) => entry.name === "Interop Probe");
    check("official vault accepted the import", Boolean(imported));
    check("official vault kept the race", Boolean(imported?.race?.primaryRaceId));
    const pageText = await page.evaluate(() => document.body.innerText);
    check("official vault page lists the character", pageText.includes("Interop Probe"));
  } catch (error) {
    failures += 1;
    console.error(`  FAIL: live vault import — ${error.message}`);
  }

  await browser.close();
  if (failures > 0) {
    console.error(`\n[INTEROP LIVE FAILURE] ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\n[INTEROP LIVE SUCCESS] Real downloads verified and the official vault accepted our export.");
}

main().catch((error) => {
  console.error("[INTEROP LIVE ERROR]", error);
  process.exit(1);
});
