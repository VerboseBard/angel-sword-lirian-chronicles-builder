/* Top-down face audit: renders every settled die with a camera looking
   STRAIGHT DOWN at the top face (no foreshortening), one grid image per
   set x die. The numeral on every capture must read upright (glyph top
   pointing up-screen). Any rotated/flipped glyph is a real orientation bug,
   free of perspective ambiguity. Uses the engine's own createDie +
   finalQuaternionForDie via the QA __testInternals hook, so what is
   measured is exactly what the game shows after settle.
   Run: node scripts/dice-topdown-audit.mjs [setId ...] */

import { fork } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 4217;
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = path.join(root, "qa-test-results", "dice-face-audit", "topdown");

const SETS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["new-angelsword", "asari-full-set-draft", "leaflit-full-set", "rana-full-set"];
const DICE = ["d20", "d12", "d100", "d10", "d8", "d6", "d4"];

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = fork(path.join(root, "scripts", "server.mjs"), {
    cwd: root,
    env: { ...process.env, LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" },
    silent: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("server start timeout")), 10000);
      server.stdout.on("data", (chunk) => {
        if (String(chunk).includes(`:${port}/`)) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.once("exit", (code) => reject(new Error(`server exited ${code}`)));
    });
    browser = await chromium.launch({ headless: true });
    for (const setId of SETS) {
      for (const dieKey of DICE) {
        const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
        await page.goto(`${baseUrl}/dice-face-audit.html?set=${encodeURIComponent(setId)}&die=${dieKey}&zoomsize=1`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 60000 });
        const grid = await page.evaluate(({ dieKey: dk, setId: sid }) => {
          const roller = window.LyrianAccurateDiceRoller;
          const THREE = window.THREE;
          const internals = roller.__testInternals;
          if (!internals) {
            return { error: "no __testInternals" };
          }
          const plans = {
            d4: { sides: 4, values: [1, 2, 3, 4] },
            d6: { sides: 6, values: [1, 2, 3, 4, 5, 6] },
            d8: { sides: 8, values: [1, 2, 3, 4, 5, 6, 7, 8] },
            d10: { sides: 10, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
            d12: { sides: 12, values: Array.from({ length: 12 }, (_, i) => i + 1) },
            d20: { sides: 20, values: Array.from({ length: 20 }, (_, i) => i + 1) },
            d100: { sides: 100, values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] }
          };
          const plan = plans[dk];
          const cell = 220;
          const cols = Math.min(5, plan.values.length);
          const rows = Math.ceil(plan.values.length / cols);
          const rowHeight = cell + 26;
          const sheet = document.createElement("canvas");
          sheet.width = cols * cell;
          sheet.height = rows * rowHeight;
          const sheetContext = sheet.getContext("2d");
          sheetContext.fillStyle = "#10141f";
          sheetContext.fillRect(0, 0, sheet.width, sheet.height);

          const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
          renderer.setSize(cell, cell);
          const scene = new THREE.Scene();
          const camera = new THREE.OrthographicCamera(-1.35, 1.35, 1.35, -1.35, 0.1, 20);
          camera.position.set(0, 6, 0);
          camera.up.set(0, 0, -1);
          camera.lookAt(0, 0, 0);
          scene.add(new THREE.AmbientLight(0xffffff, 1.05));
          const keyLight = new THREE.DirectionalLight(0xffffff, 0.55);
          keyLight.position.set(2, 6, 2);
          scene.add(keyLight);

          const palette = internals.getTheme(sid);
          plan.values.forEach((value, index) => {
            const die = internals.createDie(plan.sides, value, palette);
            die.quaternion.copy(internals.finalQuaternionForDie(die));
            scene.add(die);
            renderer.render(scene, camera);
            const col = index % cols;
            const row = Math.floor(index / cols);
            sheetContext.drawImage(renderer.domElement, col * cell, row * rowHeight + 26, cell, cell);
            sheetContext.fillStyle = "#ffe59a";
            sheetContext.font = "700 15px Segoe UI";
            sheetContext.fillText(`expected ${value}`, col * cell + 8, row * rowHeight + 18);
            scene.remove(die);
          });
          renderer.dispose();
          renderer.forceContextLoss?.();
          return { dataUrl: sheet.toDataURL("image/png") };
        }, { dieKey, setId });
        if (grid.error) {
          throw new Error(grid.error);
        }
        const base64 = grid.dataUrl.split(",")[1];
        await writeFile(path.join(outDir, `${setId}--${dieKey}.png`), Buffer.from(base64, "base64"));
        console.log(`${setId} ${dieKey}: top-down grid captured`);
        await page.close();
      }
    }
    console.log(`\nTop-down grids in ${outDir}`);
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
