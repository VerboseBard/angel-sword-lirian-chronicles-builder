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
    console.log("[OWLBEAR PANEL TEST SUCCESS] Import UI, standalone safeguards, tabs, and local CORS passed.");
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error("[OWLBEAR PANEL TEST FAILURE]", error);
  process.exit(1);
});
