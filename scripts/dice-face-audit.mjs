/* Dice face audit driver: for every set x die, load dice-face-audit.html and
   screenshot the grid of [expected value | 3D settled render | flat face art]
   cells, for human/vision verification that the art shown matches the number
   registered. One page load per set x die keeps WebGL context churn low.
   Run: node scripts/dice-face-audit.mjs   (outputs to qa-test-results/dice-face-audit/) */

import { fork } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 4213;
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = path.join(root, "qa-test-results", "dice-face-audit");

const SETS = ["new-angelsword", "asari-full-set-draft", "leaflit-full-set", "rana-full-set"];
const DICE = ["d20", "d12", "d100", "d10", "d8", "d6", "d4"];

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = fork(path.join(root, "scripts", "server.mjs"), {
    cwd: root,
    env: { ...process.env, LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" },
    silent: true
  });
  let browser;
  const summary = [];
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Audit server did not start.")), 10000);
      server.stdout.on("data", (chunk) => {
        if (String(chunk).includes(`:${port}/`)) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.once("exit", (code) => reject(new Error(`Audit server exited with ${code}.`)));
    });

    browser = await chromium.launch({ headless: true });
    for (const setId of SETS) {
      for (const dieKey of DICE) {
        const page = await browser.newPage({ viewport: { width: 1560, height: 900 } });
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.goto(`${baseUrl}/dice-face-audit.html?set=${encodeURIComponent(setId)}&die=${dieKey}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 60000 });
        const result = await page.evaluate(() => window.DiceFaceAudit);
        const missing = (result.cells || []).filter((cell) => !cell.hasRender || !cell.hasArt);
        const file = `${setId}--${dieKey}.png`;
        await page.locator("#grid").screenshot({ path: path.join(outDir, file) });
        summary.push({
          setId,
          dieKey,
          file,
          faces: result.cells.length,
          engineSelfCheckOk: result.validation ? result.validation.ok !== false : null,
          topologyOk: result.topology ? result.topology.ok !== false : null,
          missingImages: missing.map((cell) => cell.label),
          errors: [...(result.errors || []), ...pageErrors]
        });
        console.log(`${setId} ${dieKey}: ${result.cells.length} faces, ${missing.length} missing images, ${result.errors.length + pageErrors.length} errors`);
        await page.close();
      }
    }
    await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
    const problems = summary.filter((entry) => entry.missingImages.length || entry.errors.length || entry.engineSelfCheckOk === false || entry.topologyOk === false);
    console.log(`\nCaptured ${summary.length} grids to ${outDir}`);
    console.log(problems.length ? `${problems.length} grids reported problems — see summary.json` : "No capture-level problems; visual verification is the next step.");
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error("[DICE FACE AUDIT FAILURE]", error);
  process.exit(1);
});
