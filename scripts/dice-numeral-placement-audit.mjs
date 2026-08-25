/* Numeral placement audit: measures where each face's numeral actually sits
   (high-contrast pixel cluster in the plate zone) across every numeric face
   of every set, and flags faces whose numeral drifts from that die's own
   mean position. Answers "which faces need a Workshop re-bake" with numbers.
   Outputs:
     qa-test-results/dice-face-audit/numeral-placement.json  (measurements)
     qa-test-results/dice-face-audit/placement--<set>.png    (annotated sheets)
   Run: node scripts/dice-numeral-placement-audit.mjs */

import { fork } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 4219;
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = path.join(root, "qa-test-results", "dice-face-audit");
const FLAG_PCT = 1.6;

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
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    await page.goto(`${baseUrl}/dice-face-audit.html?set=new-angelsword&die=d6`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 60000 });
    const report = await page.evaluate(async ({ flagPct }) => {
      const geo = window.LyrianDiceGeometry;
      const SETS = ["new-angelsword", "asari-full-set-draft", "leaflit-full-set", "rana-full-set"];
      const DIE_KEYS = { d6: 6, d8: 8, d10: 10, d100: 100, d12: 12, d20: 20 };
      const SIZE = 384;

      const scalePolygon = (polygon, factor) => {
        const cx = polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length;
        const cy = polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length;
        return polygon.map((point) => ({ x: cx + (point.x - cx) * factor, y: cy + (point.y - cy) * factor }));
      };
      const pointInPolygon = (x, y, polygon) => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
          const a = polygon[i];
          const b = polygon[j];
          if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
            inside = !inside;
          }
        }
        return inside;
      };

      const loadImage = (src) => new Promise((resolve) => {
        if (!src) {
          resolve(null);
          return;
        }
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });

      const measure = (context, dieKey) => {
        const polygon = geo.facePolygon(dieKey, SIZE);
        const cx = polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length;
        const zone = scalePolygon(polygon, 0.58);
        const halfColumn = SIZE * 0.24;
        const data = context.getImageData(0, 0, SIZE, SIZE).data;
        const samples = [];
        for (let y = 0; y < SIZE; y += 2) {
          for (let x = 0; x < SIZE; x += 2) {
            if (Math.abs(x - cx) > halfColumn || !pointInPolygon(x, y, zone)) {
              continue;
            }
            const offset = (y * SIZE + x) * 4;
            samples.push({ x, y, r: data[offset], g: data[offset + 1], b: data[offset + 2] });
          }
        }
        if (samples.length < 80) {
          return null;
        }
        const med = (key) => {
          const sorted = samples.map((sample) => sample[key]).sort((left, right) => left - right);
          return sorted[Math.floor(sorted.length / 2)];
        };
        const median = { r: med("r"), g: med("g"), b: med("b") };
        const outliers = samples.filter((sample) => {
          const dr = sample.r - median.r;
          const dg = sample.g - median.g;
          const db = sample.b - median.b;
          return Math.sqrt(dr * dr + dg * dg + db * db) > 88;
        });
        if (outliers.length < 25) {
          return null;
        }
        if (outliers.length > samples.length * 0.55) {
          return { art: true };
        }
        const xs = outliers.map((sample) => sample.x).sort((left, right) => left - right);
        const ys = outliers.map((sample) => sample.y).sort((left, right) => left - right);
        const pct = (sorted, fraction) => sorted[Math.floor((sorted.length - 1) * fraction)];
        return {
          cx: (pct(xs, 0.05) + pct(xs, 0.95)) / 2,
          cy: (pct(ys, 0.05) + pct(ys, 0.95)) / 2,
          top: pct(ys, 0.05),
          bottom: pct(ys, 0.95)
        };
      };

      const results = [];
      const sheets = {};
      for (const setId of SETS) {
        const roller = window.LyrianAccurateDiceRoller;
        if (typeof roller.preloadFaceArtReady === "function") {
          await roller.preloadFaceArtReady(setId);
        }
        const cellW = 128;
        const cellH = 164;
        const cols = 10;
        const allFaces = Object.entries(DIE_KEYS).flatMap(([dieKey]) => (geo.DIE_FACE_KEYS[dieKey] || []).map((key) => ({ dieKey, key })));
        const rows = Math.ceil(allFaces.length / cols);
        const sheet = document.createElement("canvas");
        sheet.width = cols * cellW;
        sheet.height = rows * cellH;
        const sheetContext = sheet.getContext("2d");
        sheetContext.fillStyle = "#10141f";
        sheetContext.fillRect(0, 0, sheet.width, sheet.height);

        const work = document.createElement("canvas");
        work.width = SIZE;
        work.height = SIZE;
        const workContext = work.getContext("2d", { willReadFrequently: true });

        const measured = [];
        for (const face of allFaces) {
          const src = window.DiceSkinStudio?.getFaceImage?.(setId, face.dieKey, face.key) || "";
          const image = await loadImage(src);
          let m = null;
          if (image) {
            workContext.clearRect(0, 0, SIZE, SIZE);
            workContext.drawImage(image, 0, 0, SIZE, SIZE);
            m = measure(workContext, face.dieKey);
          }
          measured.push({ ...face, m, image });
        }
        for (const [dieKey] of Object.entries(DIE_KEYS)) {
          const group = measured.filter((entry) => entry.dieKey === dieKey && entry.m && !entry.m.art);
          if (!group.length) {
            continue;
          }
          const meanY = group.reduce((sum, entry) => sum + entry.m.cy, 0) / group.length;
          const meanX = group.reduce((sum, entry) => sum + entry.m.cx, 0) / group.length;
          group.forEach((entry) => {
            entry.devY = ((entry.m.cy - meanY) / SIZE) * 100;
            entry.devX = ((entry.m.cx - meanX) / SIZE) * 100;
          });
        }
        measured.forEach((entry, index) => {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const x = col * cellW;
          const y = row * cellH;
          if (entry.image) {
            sheetContext.drawImage(entry.image, x + 4, y + 30, cellW - 8, cellW - 8);
          }
          const flagged = entry.devY !== undefined && (Math.abs(entry.devY) > flagPct || Math.abs(entry.devX) > flagPct);
          sheetContext.fillStyle = flagged ? "#ff8a8a" : "#ffe59a";
          sheetContext.font = "700 12px Segoe UI";
          sheetContext.fillText(`${entry.dieKey} ${entry.key}`, x + 5, y + 13);
          sheetContext.font = "400 11px Segoe UI";
          sheetContext.fillStyle = flagged ? "#ff8a8a" : "#9fb0d8";
          sheetContext.fillText(
            entry.m?.art ? "art face" : entry.devY === undefined ? "no read" : `y${entry.devY >= 0 ? "+" : ""}${entry.devY.toFixed(1)}% x${entry.devX >= 0 ? "+" : ""}${entry.devX.toFixed(1)}%`,
            x + 5,
            y + 26
          );
          if (entry.m && !entry.m.art) {
            const scale = (cellW - 8) / SIZE;
            const px = x + 4 + entry.m.cx * scale;
            const py = y + 30 + entry.m.cy * scale;
            sheetContext.strokeStyle = flagged ? "#ff5050" : "#7fd8a8";
            sheetContext.lineWidth = 1.4;
            sheetContext.beginPath();
            sheetContext.moveTo(px - 7, py);
            sheetContext.lineTo(px + 7, py);
            sheetContext.moveTo(px, py - 7);
            sheetContext.lineTo(px, py + 7);
            sheetContext.stroke();
          }
          if (entry.devY !== undefined) {
            results.push({
              setId,
              dieKey: entry.dieKey,
              key: entry.key,
              devYpct: Number(entry.devY.toFixed(2)),
              devXpct: Number(entry.devX.toFixed(2)),
              flagged
            });
          } else {
            results.push({ setId, dieKey: entry.dieKey, key: entry.key, unmeasured: entry.m?.art ? "art-face" : "no-read" });
          }
        });
        sheets[setId] = sheet.toDataURL("image/png");
      }
      return { results, sheets };
    }, { flagPct: FLAG_PCT });

    for (const [setId, dataUrl] of Object.entries(report.sheets)) {
      await writeFile(path.join(outDir, `placement--${setId}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
    }
    await writeFile(path.join(outDir, "numeral-placement.json"), JSON.stringify(report.results, null, 2));
    const flagged = report.results.filter((entry) => entry.flagged);
    const unmeasured = report.results.filter((entry) => entry.unmeasured === "no-read");
    console.log(`Measured ${report.results.length} faces. Flagged beyond ${FLAG_PCT}%: ${flagged.length}. Unreadable: ${unmeasured.length}.`);
    flagged
      .sort((left, right) => Math.max(Math.abs(right.devYpct), Math.abs(right.devXpct)) - Math.max(Math.abs(left.devYpct), Math.abs(left.devXpct)))
      .forEach((entry) => console.log(`  ${entry.setId} ${entry.dieKey} "${entry.key}": y ${entry.devYpct >= 0 ? "+" : ""}${entry.devYpct}% x ${entry.devXpct >= 0 ? "+" : ""}${entry.devXpct}%`));
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
