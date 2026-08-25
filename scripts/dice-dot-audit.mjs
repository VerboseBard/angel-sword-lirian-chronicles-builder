/* Rotation-ambiguity dot audit: for every set and every ambiguous face key
   (6/9-family per die), render the RAW artist art beside the FINAL composited
   texture. Verifies each ambiguous face ends with exactly one dot — stamped
   where the art had none, not doubled where the artist painted one.
   Run: node scripts/dice-dot-audit.mjs -> qa-test-results/dice-face-audit/dots.png */

import { fork } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 4218;
const baseUrl = `http://127.0.0.1:${port}`;
const outFile = path.join(root, "qa-test-results", "dice-face-audit", "dots.png");

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
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    await page.goto(`${baseUrl}/dice-face-audit.html?set=new-angelsword&die=d6`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 60000 });
    const sheet = await page.evaluate(async () => {
      const roller = window.LyrianAccurateDiceRoller;
      const KEYS = { d6: ["6"], d8: ["6"], d10: ["6", "9"], d12: ["6", "9"], d20: ["6", "9"] };
      const SETS = ["new-angelsword", "asari-full-set-draft", "leaflit-full-set", "rana-full-set"];
      const cells = [];
      for (const setId of SETS) {
        if (typeof roller.preloadFaceArtReady === "function") {
          await roller.preloadFaceArtReady(setId);
        }
        for (const [dieKey, keys] of Object.entries(KEYS)) {
          for (const key of keys) {
            cells.push({
              setId,
              dieKey,
              key,
              raw: window.DiceSkinStudio?.getFaceImage?.(setId, dieKey, key) || "",
              composited: roller.debugFaceTexture(dieKey, key, setId) || ""
            });
          }
        }
      }
      const cellW = 150;
      const cellH = 196;
      const cols = 9;
      const rows = Math.ceil(cells.length / cols);
      const canvas = document.createElement("canvas");
      canvas.width = cols * cellW * 2;
      canvas.height = rows * cellH;
      const context = canvas.getContext("2d");
      context.fillStyle = "#10141f";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const drawImage = (src, x, y, size) => new Promise((resolve) => {
        if (!src) {
          resolve();
          return;
        }
        const image = new Image();
        image.onload = () => {
          context.drawImage(image, x, y, size, size);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = src;
      });
      for (let index = 0; index < cells.length; index += 1) {
        const cell = cells[index];
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = col * cellW * 2;
        const y = row * cellH;
        context.fillStyle = "#ffe59a";
        context.font = "700 13px Segoe UI";
        const setShort = cell.setId.replace("new-angelsword", "angel").replace("-full-set-draft", "").replace("-full-set", "");
        context.fillText(`${setShort} ${cell.dieKey} "${cell.key}"`, x + 6, y + 16);
        context.font = "400 11px Segoe UI";
        context.fillStyle = "#9fb0d8";
        context.fillText("raw / final", x + 6, y + 30);
        await drawImage(cell.raw, x + 4, y + 36, cellW - 8);
        await drawImage(cell.composited, x + cellW + 4, y + 36, cellW - 8);
      }
      return canvas.toDataURL("image/png");
    });
    await writeFile(outFile, Buffer.from(sheet.split(",")[1], "base64"));
    console.log(`Dot audit sheet written: ${outFile}`);
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
