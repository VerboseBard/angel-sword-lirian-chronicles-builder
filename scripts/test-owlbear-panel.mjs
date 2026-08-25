import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 4214;
const baseUrl = `http://127.0.0.1:${port}`;

async function main() {
  const server = fork(path.join(root, "scripts", "server.mjs"), {
    cwd: root,
    env: { ...process.env, LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" },
    silent: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Local Owlbear test server did not start.")), 10000);
      server.stdout.on("data", (chunk) => {
        if (String(chunk).includes(`:${port}/`)) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.once("exit", (code) => reject(new Error(`Local Owlbear test server exited with ${code}.`)));
    });

    const manifestResponse = await fetch(`${baseUrl}/owlbear/manifest.json`, {
      headers: { Origin: "https://www.owlbear.rodeo" }
    });
    if (manifestResponse.headers.get("access-control-allow-origin") !== "https://www.owlbear.rodeo") {
      throw new Error("Local Owlbear assets are missing the required Owlbear CORS header.");
    }

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/owlbear/panel.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#character-file").setInputFiles({
      name: "jefferson-stone.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        fields: { Name: "Jefferson Stone", "Primary Race": "Human", "Sub Race": "Mirane", Speed: 20 },
        builder: { selectedClassIds: ["gunslinger"] },
        play: { resources: { hpCurrent: 42, hpMax: 50, manaCurrent: 6, manaMax: 8, apCurrent: 3, apMax: 4, rpCurrent: 2, rpMax: 5 } }
      }))
    });
    await page.waitForSelector("#character-card:not([hidden])");
    const summary = await page.locator("#character-summary").textContent();
    if (!summary.includes("Jefferson Stone") || !summary.includes("Human") || !summary.includes("Mirane") || !summary.includes("42/50") || !summary.includes("3/4")) {
      throw new Error(`Imported character summary is incomplete: ${summary}`);
    }
    if (!await page.locator("#bind-token").isDisabled()) {
      throw new Error("Token binding must remain disabled outside an Owlbear room.");
    }
    await page.locator('[data-tab="rolls"]').click();
    if (!await page.locator('[data-panel="rolls"]').isVisible()) {
      throw new Error("Room Rolls tab did not open.");
    }
    if (pageErrors.length) {
      throw new Error(`Owlbear panel page errors: ${pageErrors.join(" | ")}`);
    }
    const tokenImageResponse = await fetch(`${baseUrl}/api/vtt-relay/token-image`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "gone", dataUrl: "data:image/png;base64,AA==" })
    });
    if (tokenImageResponse.status !== 404) {
      throw new Error(`Deleted token-image endpoint still answers (${tokenImageResponse.status}).`);
    }
    console.log("[OWLBEAR PANEL TEST SUCCESS] Import UI, standalone safeguards, tabs, and local CORS passed.");

    /* ── Opener-bridge phase: the acceptance proof ──────────────────────
       Dev relay blocked and BroadcastChannel removed in BOTH pages, so a
       character or roll can only arrive over the window.opener postMessage
       bridge — a green run cannot be a false positive from the local
       fallbacks quietly carrying the data. */
    const bridgeContext = await browser.newContext({ viewport: { width: 390, height: 700 } });
    await bridgeContext.route("**/api/vtt-relay/**", (route) => route.abort());
    await bridgeContext.addInitScript(() => {
      Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true });
    });
    const bridgeErrors = [];
    const panelPage = await bridgeContext.newPage();
    panelPage.on("pageerror", (error) => bridgeErrors.push(`panel: ${error.message}`));
    await panelPage.goto(`${baseUrl}/owlbear/panel.html`, { waitUntil: "domcontentloaded" });

    const popupPromise = panelPage.waitForEvent("popup", { timeout: 20000 });
    await panelPage.locator("#open-sheet").click();
    const sheetPopup = await popupPromise;
    sheetPopup.on("pageerror", (error) => bridgeErrors.push(`sheet: ${error.message}`));
    await sheetPopup.waitForLoadState("domcontentloaded");

    await panelPage.waitForFunction(
      () => document.getElementById("sheet-link-status")?.textContent?.includes("connected"),
      undefined,
      { timeout: 25000 }
    );

    await sheetPopup.evaluate(() => {
      window.opener.postMessage({
        v: 1,
        id: "bridge-test-handoff-1",
        ts: Date.now(),
        kind: "character-handoff",
        relaySource: "angel-sword-sheet",
        characterName: "Bridge Test Pecorine",
        character: {
          fields: { Name: "Bridge Test Pecorine", "Primary Race": "Human", "Sub Race": "Mirane", Speed: 20 },
          builder: { selectedClassIds: ["medic"] },
          play: { resources: { hpCurrent: 30, hpMax: 30, manaCurrent: 5, manaMax: 5, apCurrent: 4, apMax: 4, rpCurrent: 1, rpMax: 1 } }
        }
      }, window.location.origin);
    });
    await panelPage.waitForFunction(
      () => document.getElementById("character-summary")?.textContent?.includes("Bridge Test Pecorine"),
      undefined,
      { timeout: 10000 }
    );

    const rollEvent = {
      v: 1,
      id: "bridge-test-roll-1",
      ts: Date.now(),
      kind: "dice",
      relaySource: "angel-sword-sheet",
      character: "Bridge Test Pecorine",
      label: "Bridge Test Roll",
      formula: "1d20",
      breakdown: "d20: 11",
      total: 11
    };
    await sheetPopup.evaluate((event) => {
      window.opener.postMessage(event, window.location.origin);
      window.opener.postMessage(event, window.location.origin);
    }, rollEvent);
    await panelPage.locator('[data-tab="rolls"]').click();
    await panelPage.waitForFunction(
      () => document.querySelectorAll('#feed li[data-roll-id="bridge-test-roll-1"]').length === 1,
      undefined,
      { timeout: 10000 }
    );
    const duplicateCount = await panelPage.evaluate(
      () => document.querySelectorAll('#feed li[data-roll-id="bridge-test-roll-1"]').length
    );
    if (duplicateCount !== 1) {
      throw new Error(`Bridge roll rendered ${duplicateCount} times; dedup by id failed.`);
    }
    if (bridgeErrors.length) {
      throw new Error(`Opener bridge page errors: ${bridgeErrors.join(" | ")}`);
    }
    await bridgeContext.close();
    console.log("[OWLBEAR BRIDGE TEST SUCCESS] With the dev relay blocked and BroadcastChannel removed, the popup handshake connected, a character handoff landed, and a roll reached the feed exactly once over window.opener postMessage alone.");
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error("[OWLBEAR PANEL TEST FAILURE]", error);
  process.exit(1);
});
