/* One-off zoom captures: render specific set/die/value combos at large size
   for close inspection. Usage:
   node scripts/dice-face-zoom.mjs <setId> <dieKey> <value> [<value> ...] */

import { fork } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 4215;
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = path.join(root, "qa-test-results", "dice-face-audit", "zoom");

const [setId = "asari-full-set-draft", dieKey = "d10", ...valueArgs] = process.argv.slice(2);
const values = valueArgs.length ? valueArgs.map(Number) : [9];
const SIDES = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100 };

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
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    await page.goto(`${baseUrl}/dice-face-audit.html?set=${encodeURIComponent(setId)}&die=${dieKey}&zoomsize=${process.env.ZOOM_SIZE || 640}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 60000 });
    for (const value of values) {
      const data = await page.evaluate(({ sides, value: v, setId: s }) => {
        const roller = window.LyrianAccurateDiceRoller;
        const label = sides === 10 ? (v === 10 ? "0" : String(v)) : sides === 100 ? (v >= 100 ? "00" : String(Math.floor(v / 10) * 10).padStart(2, "0")) : String(v);
        return {
          render: roller.buildPreviewDataUrl({ setId: s, sides, value: v, size: Number(new URLSearchParams(location.search).get("zoomsize")) || 640 }) || "",
          art: roller.debugFaceTexture ? roller.debugFaceTexture(sides === 100 ? "d100" : `d${sides}`, label, s) || "" : "",
          label
        };
      }, { sides: SIDES[dieKey], value, setId });
      for (const [kind, url] of [["render", data.render], ["art", data.art]]) {
        if (!url) continue;
        const base64 = url.split(",")[1];
        await writeFile(path.join(outDir, `${setId}--${dieKey}--${value}--${kind}.png`), Buffer.from(base64, "base64"));
      }
      console.log(`${setId} ${dieKey} value ${value} (face key "${data.label}") captured.`);
    }
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
