import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// One-off asset conversion using the Playwright Chromium already installed as
// a devDependency (no native image tooling required on the machine).
// - Re-encodes the two large decorative PNGs as WebP for the startup payload.
// - Renders 192x192 and 512x512 PWA icons from the Lyrian symbol.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const JOBS = [
  { src: "assets/lyrian-homepage-castle.png", out: "assets/lyrian-homepage-castle.webp", type: "image/webp", quality: 0.82 },
  { src: "assets/lyrian-chronicles-logo.png", out: "assets/lyrian-chronicles-logo.webp", type: "image/webp", quality: 0.85 },
  { src: "assets/lyrian-symbol.png", out: "assets/icon-192.png", type: "image/png", size: 192 },
  { src: "assets/lyrian-symbol.png", out: "assets/icon-512.png", type: "image/png", size: 512 }
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const job of JOBS) {
  const sourcePath = path.resolve(ROOT, job.src);
  const dataUrl = `data:image/png;base64,${fs.readFileSync(sourcePath).toString("base64")}`;
  const result = await page.evaluate(async ({ dataUrl, type, quality, size }) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("could not decode image"));
      image.src = dataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size || image.naturalWidth;
    canvas.height = size || image.naturalHeight;
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      sourceWidth: image.naturalWidth,
      sourceHeight: image.naturalHeight,
      encoded: canvas.toDataURL(type, quality)
    };
  }, { dataUrl, type: job.type, quality: job.quality, size: job.size });

  const base64 = result.encoded.split(",")[1];
  const outPath = path.resolve(ROOT, job.out);
  fs.writeFileSync(outPath, Buffer.from(base64, "base64"));
  const inKb = Math.round(fs.statSync(sourcePath).size / 1024);
  const outKb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`${job.src} (${result.sourceWidth}x${result.sourceHeight}, ${inKb} KB) -> ${job.out} (${outKb} KB)`);
}

await browser.close();
