/* d4 corner-number audit: renders every set's four composited d4 faces at
   high resolution in one sheet, for judging whether each corner numeral
   sits centered inside its painted medallion circle.
   Run: node scripts/dice-d4-audit.mjs -> qa-test-results/dice-face-audit/d4.png */

import { fork } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 4220;
const baseUrl = `http://127.0.0.1:${port}`;
const outFile = path.join(root, "qa-test-results", "dice-face-audit", "d4.png");

async function main() {
  await mkdir(path.dirname(outFile), { recursive: true });
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
    const page = await browser.newPage({ viewport: { width: 1700, height: 900 } });
    await page.goto(`${baseUrl}/dice-face-audit.html?set=new-angelsword&die=d4`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 60000 });
    const sheet = await page.evaluate(async () => {
      const roller = window.LyrianAccurateDiceRoller;
      const SETS = ["new-angelsword", "asari-full-set-draft", "leaflit-full-set", "rana-full-set"];
      const FACES = ["face-1", "face-2", "face-3", "face-4"];
      const cell = 400;
      const canvas = document.createElement("canvas");
      canvas.width = FACES.length * cell;
      canvas.height = SETS.length * (cell + 26);
      const context = canvas.getContext("2d");
      context.fillStyle = "#10141f";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const drawImage = (src, x, y) => new Promise((resolve) => {
        if (!src) {
          resolve();
          return;
        }
        const image = new Image();
        image.onload = () => {
          context.drawImage(image, x, y, cell - 8, cell - 8);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = src;
      });
      for (let s = 0; s < SETS.length; s += 1) {
        if (typeof roller.preloadFaceArtReady === "function") {
          await roller.preloadFaceArtReady(SETS[s]);
        }
        for (let f = 0; f < FACES.length; f += 1) {
          const x = f * cell;
          const y = s * (cell + 26);
          context.fillStyle = "#ffe59a";
          context.font = "700 15px Segoe UI";
          context.fillText(`${SETS[s].replace("new-angelsword", "angel").replace("-full-set-draft", "").replace("-full-set", "")} d4 ${FACES[f]}`, x + 6, y + 18);
          await drawImage(roller.debugFaceTexture("d4", FACES[f], SETS[s]) || "", x + 4, y + 26);
        }
      }
      return canvas.toDataURL("image/png");
    });
    await writeFile(outFile, Buffer.from(sheet.split(",")[1], "base64"));
    console.log(`d4 audit sheet written: ${outFile}`);
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
