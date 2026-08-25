/* Anchor legend: one large face per shape with the owner's corner-vector
   construction drawn in yellow, the design target (anchor + blessed shape
   offset) as a gold crosshair, and the numeral's measured footprint as a
   box. Explains exactly what the placement sheets mark.
   Run: node scripts/dice-anchor-legend.mjs [setId] -> qa-test-results/dice-face-audit/anchor-legend.png */

import { fork } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 4221;
const baseUrl = `http://127.0.0.1:${port}`;
const outFile = path.join(root, "qa-test-results", "dice-face-audit", "anchor-legend.png");
const setId = process.argv[2] || "rana-full-set";

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
    const page = await browser.newPage({ viewport: { width: 1900, height: 700 } });
    await page.goto(`${baseUrl}/dice-face-audit.html?set=${encodeURIComponent(setId)}&die=d6`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 60000 });
    const sheet = await page.evaluate(async ({ setId: sid }) => {
      const geo = window.LyrianDiceGeometry;
      const roller = window.LyrianAccurateDiceRoller;
      if (typeof roller.preloadFaceArtReady === "function") {
        await roller.preloadFaceArtReady(sid);
      }
      const SIZE = 384;
      const CELL = 440;
      const SHOW = [
        { dieKey: "d6", key: "3", offsetY: 0.52, offsetX: 0.26, title: "d6 - diagonals cross at center" },
        { dieKey: "d8", key: "5", offsetY: -2.89, offsetX: 0, title: "d8 - corner-to-side lines cross" },
        { dieKey: "d10", key: "7", offsetY: -17.33, offsetX: 0, title: "d10 - pole-tail x wing-wing" },
        { dieKey: "d12", key: "3", offsetY: 0.49, offsetX: 0.26, title: "d12 - corner spokes cross" }
      ];
      const canvas = document.createElement("canvas");
      canvas.width = SHOW.length * CELL;
      canvas.height = CELL + 96;
      const context = canvas.getContext("2d");
      context.fillStyle = "#10141f";
      context.fillRect(0, 0, canvas.width, canvas.height);

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
      const measure = (workContext, dieKey) => {
        const polygon = geo.facePolygon(dieKey, SIZE);
        const cx = polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length;
        const zone = scalePolygon(polygon, 0.58);
        const half = SIZE * 0.24;
        const data = workContext.getImageData(0, 0, SIZE, SIZE).data;
        const samples = [];
        for (let y = 0; y < SIZE; y += 2) {
          for (let x = 0; x < SIZE; x += 2) {
            if (Math.abs(x - cx) > half || !pointInPolygon(x, y, zone)) continue;
            const offset = (y * SIZE + x) * 4;
            samples.push({ x, y, r: data[offset], g: data[offset + 1], b: data[offset + 2] });
          }
        }
        const med = (key) => {
          const sorted = samples.map((sample) => sample[key]).sort((a, b) => a - b);
          return sorted[Math.floor(sorted.length / 2)];
        };
        const m = { r: med("r"), g: med("g"), b: med("b") };
        const outliers = samples.filter((sample) => {
          const dr = sample.r - m.r;
          const dg = sample.g - m.g;
          const db = sample.b - m.b;
          return Math.sqrt(dr * dr + dg * dg + db * db) > 88;
        });
        const xs = outliers.map((sample) => sample.x).sort((a, b) => a - b);
        const ys = outliers.map((sample) => sample.y).sort((a, b) => a - b);
        const pct = (sorted, fraction) => sorted[Math.floor((sorted.length - 1) * fraction)];
        return outliers.length < 25 ? null : { left: pct(xs, 0.05), right: pct(xs, 0.95), top: pct(ys, 0.05), bottom: pct(ys, 0.95) };
      };
      const loadImage = (src) => new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });

      const work = document.createElement("canvas");
      work.width = SIZE;
      work.height = SIZE;
      const workContext = work.getContext("2d", { willReadFrequently: true });

      for (let index = 0; index < SHOW.length; index += 1) {
        const spec = SHOW[index];
        const originX = index * CELL + 20;
        const originY = 64;
        const drawScale = (CELL - 40) / SIZE;
        const polygon = geo.facePolygon(spec.dieKey, SIZE);
        const src = window.DiceSkinStudio?.getFaceImage?.(sid, spec.dieKey, spec.key) || "";
        const image = await loadImage(src);
        if (image) {
          context.drawImage(image, originX, originY, SIZE * drawScale, SIZE * drawScale);
          workContext.clearRect(0, 0, SIZE, SIZE);
          workContext.drawImage(image, 0, 0, SIZE, SIZE);
        }
        const toSheet = (point) => ({ x: originX + point.x * drawScale, y: originY + point.y * drawScale });

        context.strokeStyle = "#ffe100";
        context.lineWidth = 2.5;
        const line = (a, b) => {
          const p = toSheet(a);
          const q = toSheet(b);
          context.beginPath();
          context.moveTo(p.x, p.y);
          context.lineTo(q.x, q.y);
          context.stroke();
        };
        let anchor;
        if (spec.dieKey === "d6") {
          line(polygon[0], polygon[2]);
          line(polygon[1], polygon[3]);
          anchor = { x: polygon.reduce((s, p) => s + p.x, 0) / 4, y: polygon.reduce((s, p) => s + p.y, 0) / 4 };
        } else if (spec.dieKey === "d10") {
          line(polygon[0], polygon[2]);
          line(polygon[1], polygon[3]);
          anchor = { x: (polygon[0].x + polygon[2].x) / 2, y: (polygon[1].y + polygon[3].y) / 2 };
        } else {
          for (let v = 0; v < polygon.length; v += 1) {
            const a = polygon[v];
            const b = polygon[(v + Math.floor(polygon.length / 2)) % polygon.length];
            const c = polygon[(v + Math.ceil(polygon.length / 2)) % polygon.length];
            line(a, { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 });
          }
          anchor = { x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length, y: polygon.reduce((s, p) => s + p.y, 0) / polygon.length };
        }

        const target = toSheet({ x: anchor.x + (spec.offsetX / 100) * SIZE, y: anchor.y + (spec.offsetY / 100) * SIZE });
        context.strokeStyle = "#ffd558";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(target.x - 16, target.y);
        context.lineTo(target.x + 16, target.y);
        context.moveTo(target.x, target.y - 16);
        context.lineTo(target.x, target.y + 16);
        context.stroke();

        const box = image ? measure(workContext, spec.dieKey) : null;
        if (box) {
          const a = toSheet({ x: box.left, y: box.top });
          const b = toSheet({ x: box.right, y: box.bottom });
          context.strokeStyle = "#57ff9a";
          context.lineWidth = 2.5;
          context.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        }

        context.fillStyle = "#ffe59a";
        context.font = "700 19px Segoe UI";
        context.fillText(`${spec.title}`, originX, 34);
        context.font = "400 15px Segoe UI";
        context.fillStyle = "#9fb0d8";
        context.fillText(`${sid.replace("-full-set", "")} ${spec.dieKey} "${spec.key}"`, originX, 56);
      }
      context.font = "400 17px Segoe UI";
      context.fillStyle = "#ffe100";
      context.fillText("yellow = your corner vectors", 24, CELL + 82);
      context.fillStyle = "#ffd558";
      context.fillText("gold cross = where the number SHOULD be (vector crossing + the family's blessed offset)", 330, CELL + 82);
      context.fillStyle = "#57ff9a";
      context.fillText("green box = where the number actually IS", 1180, CELL + 82);
      return canvas.toDataURL("image/png");
    }, { setId });
    await writeFile(outFile, Buffer.from(sheet.split(",")[1], "base64"));
    console.log(`Anchor legend written: ${outFile}`);
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
