import { chromium, firefox, webkit } from "playwright";
import { fork } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const qaDir = path.join(projectRoot, "qa-test-results");
const port = 4212;
const url = `http://127.0.0.1:${port}/`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = [
  {
    name: "Chrome",
    browserType: chromium,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
  },
  {
    name: "Edge",
    browserType: chromium,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  },
  {
    name: "Brave",
    browserType: chromium,
    executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
    optional: true
  },
  { name: "Chromium (Brave-engine proxy)", browserType: chromium },
  { name: "Firefox (Playwright)", browserType: firefox },
  { name: "WebKit (Safari engine)", browserType: webkit }
];

const viewports = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 }
];

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runCase(browser, targetName, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown failure";
    const replacedImageRequest = request.resourceType() === "image"
      && /abort|cancel|NS_BINDING_ABORTED|ERR_ABORTED/i.test(failure);
    if (request.url().startsWith(url)
      && !replacedImageRequest
      && !(request.url().match(/\.mp3(?:[?#]|$)/i) && /abort|cancel/i.test(failure))) {
      failedRequests.push(`${request.url()} (${failure})`);
    }
  });

  try {
    const startedAt = Date.now();
    await page.goto(url, { waitUntil: "load", timeout: 15000 });
    const humanId = await page.evaluate(() =>
      (window.LYRIAN_DETAIL_DATA?.races || []).find((race) => race.name?.trim() === "Human")?.id || ""
    );
    if (!humanId) throw new Error("Human fixture was unavailable.");
    await page.evaluate((selectedRaceId) => {
      localStorage.clear();
      localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
        ui: { mode: "builder", builderStep: 6, gameVersion: "0.13.1" },
        fields: { Name: "Dice Browser Matrix" },
        builder: { selectedRaceId }
      }));
    }, humanId);
    await page.reload({ waitUntil: "load", timeout: 15000 });
    await page.click("#builder-sheet-shortcut-top");
    await page.waitForSelector("[data-dice-toggle]", { timeout: 10000 });
    const sheetReadyMs = Date.now() - startedAt;

    const galleryStartedAt = Date.now();
    await page.click("[data-dice-toggle]");
    await page.click("[data-dice-change]");
    await page.waitForSelector("[data-dice-use]", { timeout: 10000 });
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll(".dice-set-card")];
      const images = [...document.querySelectorAll(".dice-set-card-preview")];
      const panel = document.querySelector(".dice-tray-panel");
      const useButton = document.querySelector("[data-dice-use]");
      if (cards.length !== 4 || images.length !== 4 || !panel || !useButton) return false;
      const panelBox = panel.getBoundingClientRect();
      const useBox = useButton.getBoundingClientRect();
      return images.every((image) => image.complete && image.naturalWidth > 0)
        && panelBox.left >= -1
        && panelBox.right <= window.innerWidth + 1
        && useBox.top >= panelBox.top
        && useBox.bottom <= panelBox.bottom + 1;
    }, null, { timeout: 15000 });
    const galleryReadyMs = Date.now() - galleryStartedAt;

    const setIds = await page.locator("[data-dice-set]").evaluateAll((buttons) =>
      buttons.map((button) => button.dataset.diceSet)
    );
    const setPreviewMs = {};
    for (const setId of setIds) {
      const setStartedAt = Date.now();
      await page.locator(`[data-dice-set="${setId}"]`).click();
      await page.waitForFunction((expectedSetId) => {
        const active = document.querySelector(`.dice-set-card.is-active[data-dice-set="${expectedSetId}"]`);
        const images = [...document.querySelectorAll(".dice-choice-icon img")];
        const sources = images.map((image) => image.currentSrc || image.src);
        return Boolean(active)
          && images.length === 7
          && images.every((image) => image.complete && image.naturalWidth > 0)
          && new Set(sources).size === 7;
      }, setId, { timeout: 15000 });
      setPreviewMs[setId] = Date.now() - setStartedAt;
    }

    await page.click("[data-dice-use]");
    for (const sides of [20, 6, 4]) {
      await page.click(`[data-dice-add="${sides}"]`);
    }
    const rollStartedAt = Date.now();
    await page.click("[data-dice-roll]");
    await page.waitForSelector("#dice-flight-layer canvas", { timeout: 15000 });
    await page.waitForFunction(() => {
      const overlay = document.getElementById("roll-overlay");
      const total = document.getElementById("roll-overlay-total")?.textContent || "";
      return overlay && !overlay.hidden && /Total\s+\d+/.test(total);
    }, null, { timeout: 15000 });
    const rollVisibleMs = Date.now() - rollStartedAt;
    await page.waitForTimeout(1300);

    const runtime = await page.evaluate(() => ({
      motionMode: window.LyrianAccurateDiceRoller?.getStatus?.().shared?.motionMode || "",
      resultText: document.getElementById("roll-overlay-breakdown")?.textContent?.replace(/\s+/g, " ").trim() || "",
      canvasCount: document.querySelectorAll("#dice-flight-layer canvas").length,
      panelWidth: document.querySelector(".dice-tray-panel")?.getBoundingClientRect().width || 0
    }));
    const screenshotName = `dice-matrix-${safeName(targetName)}-${viewport.name}.png`;
    await page.screenshot({ path: path.join(qaDir, screenshotName) });

    if (errors.length || failedRequests.length) {
      throw new Error(JSON.stringify({ errors, failedRequests }));
    }
    // The shared renderer intentionally draws every queued die in one WebGL
    // canvas. A canvas per die would add contexts and memory without improving
    // the result, especially on mobile devices.
    if (runtime.motionMode !== "scripted-fallback" || runtime.canvasCount !== 1 || !runtime.resultText) {
      throw new Error(`Unexpected dice runtime state: ${JSON.stringify(runtime)}`);
    }

    return {
      status: "passed",
      viewport: `${viewport.width}x${viewport.height}`,
      sheetReadyMs,
      galleryReadyMs,
      setPreviewMs,
      rollVisibleMs,
      runtime,
      screenshot: screenshotName
    };
  } finally {
    await context.close();
  }
}

await fs.mkdir(qaDir, { recursive: true });
const server = fork(path.join(projectRoot, "scripts", "server.mjs"), [], {
  cwd: projectRoot,
  env: { ...process.env, LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" },
  silent: true
});
const results = { generatedAt: new Date().toISOString(), url, targets: {} };
let failed = false;

try {
  await wait(900);
  for (const target of targets) {
    if (target.executablePath && !(await fileExists(target.executablePath))) {
      results.targets[target.name] = { status: "unavailable", reason: `${target.name} executable is not installed.` };
      continue;
    }
    let browser;
    try {
      browser = await target.browserType.launch(target.executablePath ? { executablePath: target.executablePath } : {});
      results.targets[target.name] = { status: "passed", cases: {} };
      for (const viewport of viewports) {
        try {
          results.targets[target.name].cases[viewport.name] = await runCase(browser, target.name, viewport);
        } catch (error) {
          failed = true;
          results.targets[target.name].status = "failed";
          results.targets[target.name].cases[viewport.name] = { status: "failed", error: error.message };
        }
      }
    } catch (error) {
      failed = !target.optional || failed;
      results.targets[target.name] = { status: target.optional ? "unavailable" : "failed", reason: error.message };
    } finally {
      await browser?.close().catch(() => {});
    }
  }
} finally {
  server.kill();
  await fs.writeFile(path.join(qaDir, "dice-browser-matrix.json"), JSON.stringify(results, null, 2), "utf8");
}

console.log(JSON.stringify(results, null, 2));
if (failed) process.exitCode = 1;
