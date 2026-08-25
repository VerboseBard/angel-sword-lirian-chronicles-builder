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
        const left = pct(xs, 0.05);
        const right = pct(xs, 0.95);
        const top = pct(ys, 0.05);
        const bottom = pct(ys, 0.95);
        return {
          cx: (left + right) / 2,
          cy: (top + bottom) / 2,
          top,
          bottom,
          left,
          right,
          height: bottom - top
        };
      };

      /* Faces that are deliberate ART, not numerals — measured clusters are
         meaningless there, so they are excluded from stats and flags. */
      const ART_FACES = new Set([
        "new-angelsword:d20:20",
        "asari-full-set-draft:d20:20",
        "leaflit-full-set:d20:20",
        "rana-full-set:d20:20",
        "rana-full-set:d20:1"
      ]);

      const results = [];
      const sheets = {};
      const roller = window.LyrianAccurateDiceRoller;
      const allFaces = Object.entries(DIE_KEYS).flatMap(([dieKey]) => (geo.DIE_FACE_KEYS[dieKey] || []).map((key) => ({ dieKey, key })));
      const work = document.createElement("canvas");
      work.width = SIZE;
      work.height = SIZE;
      const workContext = work.getContext("2d", { willReadFrequently: true });

      /* Phase A — measure every face of every set. */
      const measuredBySet = {};
      for (const setId of SETS) {
        if (typeof roller.preloadFaceArtReady === "function") {
          await roller.preloadFaceArtReady(setId);
        }
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
          const isArtFace = ART_FACES.has(`${setId}:${face.dieKey}:${face.key}`);
          measured.push({ ...face, m: isArtFace ? { art: true } : m, image });
        }
        measuredBySet[setId] = measured;
      }

      /* Phase B — the standard. Owner's geometric anchor (the centroid: the
         point equidistant from the corners) plus the DESIGN OFFSET the art
         family actually uses, derived as the cross-set median offset per die
         shape (triangles run ~6% above centroid by design — the frame owns
         the bottom corners). The derived offsets are reported so the owner
         can bless them as the standing tokens for the promote gate. */
      const median = (values) => {
        const sorted = [...values].sort((left, right) => left - right);
        return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
      };
      const shapeOffsets = {};
      for (const [dieKey] of Object.entries(DIE_KEYS)) {
        const polygon = geo.facePolygon(dieKey, SIZE);
        const centroid = {
          x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
          y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length
        };
        const pool = SETS.flatMap((setId) => measuredBySet[setId]
          .filter((entry) => entry.dieKey === dieKey && entry.m && !entry.m.art)
          .map((entry) => entry.m));
        shapeOffsets[dieKey] = {
          centroid,
          offsetY: median(pool.map((m) => ((m.cy - centroid.y) / SIZE) * 100)),
          offsetX: median(pool.map((m) => ((m.cx - centroid.x) / SIZE) * 100))
        };
      }
      for (const setId of SETS) {
        for (const [dieKey] of Object.entries(DIE_KEYS)) {
          const group = measuredBySet[setId].filter((entry) => entry.dieKey === dieKey && entry.m && !entry.m.art);
          if (!group.length) {
            continue;
          }
          const standard = shapeOffsets[dieKey];
          const target = {
            x: standard.centroid.x + (standard.offsetX / 100) * SIZE,
            y: standard.centroid.y + (standard.offsetY / 100) * SIZE
          };
          const medianHeight = median(group.map((entry) => entry.m.height)) || 1;
          group.forEach((entry) => {
            entry.devY = ((entry.m.cy - target.y) / SIZE) * 100;
            entry.devX = ((entry.m.cx - target.x) / SIZE) * 100;
            entry.sizeDev = ((entry.m.height - medianHeight) / medianHeight) * 100;
            entry.anchor = target;
            entry.heightPct = (entry.m.height / SIZE) * 100;
          });
        }
      }

      /* Phase C — draw the per-set sheets against the standard. */
      for (const setId of SETS) {
        const measured = measuredBySet[setId];
        const cellW = 128;
        const cellH = 164;
        const cols = 10;
        const rows = Math.ceil(allFaces.length / cols);
        const sheet = document.createElement("canvas");
        sheet.width = cols * cellW;
        sheet.height = rows * cellH;
        const sheetContext = sheet.getContext("2d");
        sheetContext.fillStyle = "#10141f";
        sheetContext.fillRect(0, 0, sheet.width, sheet.height);
        measured.forEach((entry, index) => {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const x = col * cellW;
          const y = row * cellH;
          if (entry.image) {
            sheetContext.drawImage(entry.image, x + 4, y + 30, cellW - 8, cellW - 8);
          }
          /* Position is judged everywhere except the kite dice (owner:
             d10/d100 placement is aesthetic and currently approved); glyph
             size consistency is judged on every die. */
          const kite = entry.dieKey === "d10" || entry.dieKey === "d100";
          const positionOff = entry.devY !== undefined && !kite
            && (Math.abs(entry.devY) > flagPct || Math.abs(entry.devX) > flagPct);
          const sizeOff = entry.sizeDev !== undefined && Math.abs(entry.sizeDev) > 12;
          const flagged = positionOff || sizeOff;
          sheetContext.fillStyle = flagged ? "#ff8a8a" : "#ffe59a";
          sheetContext.font = "700 12px Segoe UI";
          sheetContext.fillText(`${entry.dieKey} ${entry.key}`, x + 5, y + 13);
          sheetContext.font = "400 11px Segoe UI";
          sheetContext.fillStyle = flagged ? "#ff8a8a" : "#9fb0d8";
          sheetContext.fillText(
            entry.m?.art ? "art face" : entry.devY === undefined ? "no read"
              : `dy${entry.devY >= 0 ? "+" : ""}${entry.devY.toFixed(1)} dx${entry.devX >= 0 ? "+" : ""}${entry.devX.toFixed(1)} s${entry.sizeDev >= 0 ? "+" : ""}${entry.sizeDev.toFixed(0)}%`,
            x + 5,
            y + 26
          );
          if (entry.m && !entry.m.art && entry.devY !== undefined) {
            const scale = (cellW - 8) / SIZE;
            const cellLeft = x + 4;
            const cellTop = y + 30;
            const ax = cellLeft + entry.anchor.x * scale;
            const ay = cellTop + entry.anchor.y * scale;
            sheetContext.strokeStyle = "#ffd558";
            sheetContext.lineWidth = 1.3;
            sheetContext.beginPath();
            sheetContext.moveTo(ax - 8, ay);
            sheetContext.lineTo(ax + 8, ay);
            sheetContext.moveTo(ax, ay - 8);
            sheetContext.lineTo(ax, ay + 8);
            sheetContext.stroke();
            sheetContext.strokeStyle = flagged ? "#ff5050" : "#7fd8a8";
            sheetContext.lineWidth = 1.2;
            sheetContext.strokeRect(
              cellLeft + entry.m.left * scale,
              cellTop + entry.m.top * scale,
              (entry.m.right - entry.m.left) * scale,
              (entry.m.bottom - entry.m.top) * scale
            );
          }
          if (entry.devY !== undefined) {
            results.push({
              setId,
              dieKey: entry.dieKey,
              key: entry.key,
              devYpct: Number(entry.devY.toFixed(2)),
              devXpct: Number(entry.devX.toFixed(2)),
              sizeDevPct: Number(entry.sizeDev.toFixed(1)),
              glyphHeightPct: Number(entry.heightPct.toFixed(2)),
              correctionPx768: {
                dx: Math.round((-entry.devX / 100) * 768),
                dy: Math.round((-entry.devY / 100) * 768),
                scale: Number((1 / (1 + entry.sizeDev / 100)).toFixed(3))
              },
              positionOff,
              sizeOff,
              flagged
            });
          } else {
            results.push({ setId, dieKey: entry.dieKey, key: entry.key, unmeasured: entry.m?.art ? "art-face" : "no-read" });
          }
        });
        sheets[setId] = sheet.toDataURL("image/png");
      }
      const offsets = Object.fromEntries(Object.entries(shapeOffsets).map(([dieKey, entry]) => [dieKey, {
        offsetYpct: Number(entry.offsetY.toFixed(2)),
        offsetXpct: Number(entry.offsetX.toFixed(2))
      }]));
      return { results, sheets, offsets };
    }, { flagPct: FLAG_PCT });

    for (const [setId, dataUrl] of Object.entries(report.sheets)) {
      await writeFile(path.join(outDir, `placement--${setId}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
    }
    await writeFile(path.join(outDir, "numeral-placement.json"), JSON.stringify({ designOffsets: report.offsets, faces: report.results }, null, 2));
    console.log("Derived design offsets (centroid-relative, for owner blessing as standard tokens):");
    Object.entries(report.offsets).forEach(([dieKey, entry]) => console.log(`  ${dieKey}: y ${entry.offsetYpct >= 0 ? "+" : ""}${entry.offsetYpct}% x ${entry.offsetXpct >= 0 ? "+" : ""}${entry.offsetXpct}%`));
    const flagged = report.results.filter((entry) => entry.flagged);
    const positionOff = report.results.filter((entry) => entry.positionOff);
    const sizeOff = report.results.filter((entry) => entry.sizeOff);
    const unmeasured = report.results.filter((entry) => entry.unmeasured === "no-read");
    console.log(`Measured ${report.results.length} faces vs geometric anchors. Position off: ${positionOff.length}. Size off: ${sizeOff.length}. Total flagged: ${flagged.length}. Unreadable: ${unmeasured.length}.`);
    flagged
      .sort((left, right) => (Math.abs(right.devYpct) + Math.abs(right.sizeDevPct) / 8) - (Math.abs(left.devYpct) + Math.abs(left.sizeDevPct) / 8))
      .forEach((entry) => console.log(`  ${entry.setId} ${entry.dieKey} "${entry.key}": dy ${entry.devYpct >= 0 ? "+" : ""}${entry.devYpct}% dx ${entry.devXpct >= 0 ? "+" : ""}${entry.devXpct}% size ${entry.sizeDevPct >= 0 ? "+" : ""}${entry.sizeDevPct}% -> fix ${JSON.stringify(entry.correctionPx768)}`));
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
