// Rebuilds the embedded Angel Sword D4 face textures with large, point-aligned corner numbers.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("C:/Users/bulld/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const faceArtPath = path.join(projectRoot, "assets", "dice-3d", "new-angelsword-dice-face-art.384-webp.js");
const qaDir = path.join(projectRoot, "assets", "dice", "qa-rolls", "angel-sword-d4-corner-number-source");
const canonicalBlankPath = path.join(projectRoot, "assets", "dice", "new-angelsword", "d4-canonical-blank.png");

function readEntries(source) {
  const marker = "const entries = ";
  const start = source.indexOf(marker);
  const end = source.indexOf("window.LYRIAN_DICE_FACE_ART", start);
  if (start < 0 || end < 0) {
    throw new Error("Could not locate the embedded face-art entries object.");
  }
  const serialized = source.slice(start + marker.length, end).trim().replace(/;$/, "");
  return JSON.parse(serialized);
}

function writeEntries(source, entries) {
  const marker = "const entries = ";
  const start = source.indexOf(marker);
  const end = source.indexOf("window.LYRIAN_DICE_FACE_ART", start);
  if (start < 0 || end < 0) {
    throw new Error("Could not locate the embedded face-art entries object.");
  }
  return `${source.slice(0, start + marker.length)}${JSON.stringify(entries)};\n  ${source.slice(end)}`;
}

const source = await fs.readFile(faceArtPath, "utf8");
const entries = readEntries(source);
await fs.mkdir(qaDir, { recursive: true });

const d4CornerNumbers = {
  1: { top: "4", left: "1", right: "2" },
  2: { top: "3", left: "4", right: "2" },
  3: { top: "3", left: "1", right: "4" },
  4: { top: "3", left: "2", right: "1" }
};

const d4PhysicalFaceNumbers = {
  1: { top: "2", left: "3", right: "4" },
  2: { top: "1", left: "4", right: "3" },
  3: { top: "1", left: "2", right: "4" },
  4: { top: "1", left: "3", right: "2" }
};

function numberText(value, x, y, rotation, size) {
  const transform = `rotate(${rotation} ${x} ${y})`;
  const common = `x="${x}" y="${y}" transform="${transform}" text-anchor="middle" dominant-baseline="central" font-family="Georgia, Times New Roman, serif" font-weight="700" font-size="${size}" paint-order="stroke fill"`;
  return `
    <text ${common} fill="#f8d472" stroke="#4b2908" stroke-width="6" stroke-linejoin="round">${value}</text>
    <text ${common} fill="#fff0ad" stroke="#c7891b" stroke-width="1.8" stroke-linejoin="round">${value}</text>`;
}

function makeNumberOverlay(numbers) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 384 384">
      <defs>
        <filter id="numberShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.8" flood-color="#2a1300" flood-opacity="0.7"/>
        </filter>
      </defs>
      <g filter="url(#numberShadow)">
        ${numberText(numbers.top, 192, 122, 0, 58)}
        ${numberText(numbers.left, 106, 305, -120, 52)}
        ${numberText(numbers.right, 278, 305, 120, 52)}
      </g>
    </svg>
  `);
}

const canonicalBlankPng = await fs.readFile(canonicalBlankPath);
await fs.writeFile(path.join(qaDir, "canonical-blank.png"), canonicalBlankPng);
const canonicalBlankWebp = await sharp(canonicalBlankPng)
  .webp({ quality: 94, alphaQuality: 100, effort: 6 })
  .toBuffer();
entries["new-angelsword:d4:blank"] = `data:image/webp;base64,${canonicalBlankWebp.toString("base64")}`;

const replacements = new Map();
const generatedPngs = [];
const physicalPngs = [];

for (const result of [1, 2, 3, 4]) {
  const key = `new-angelsword:d4:${result}`;
  const rebuiltPng = await sharp(canonicalBlankPng)
    .composite([{ input: makeNumberOverlay(d4CornerNumbers[result]), blend: "over" }])
    .png()
    .toBuffer();
  const rebuiltWebp = await sharp(rebuiltPng).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toBuffer();
  const rebuiltPngPath = path.join(qaDir, `result-${result}-large-corners.png`);
  await fs.writeFile(rebuiltPngPath, rebuiltPng);
  generatedPngs.push(rebuiltPng);
  replacements.set(key, `data:image/webp;base64,${rebuiltWebp.toString("base64")}`);
  console.log(rebuiltPngPath);
}

for (const face of [1, 2, 3, 4]) {
  const key = `new-angelsword:d4:face-${face}`;
  const rebuiltPng = await sharp(canonicalBlankPng)
    .composite([{ input: makeNumberOverlay(d4PhysicalFaceNumbers[face]), blend: "over" }])
    .png()
    .toBuffer();
  const rebuiltWebp = await sharp(rebuiltPng).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toBuffer();
  const rebuiltPngPath = path.join(qaDir, `face-${face}-large-corners.png`);
  await fs.writeFile(rebuiltPngPath, rebuiltPng);
  physicalPngs.push(rebuiltPng);
  replacements.set(key, `data:image/webp;base64,${rebuiltWebp.toString("base64")}`);
  console.log(rebuiltPngPath);
}

for (const [key, dataUrl] of replacements) {
  entries[key] = dataUrl;
}
await fs.writeFile(faceArtPath, writeEntries(source, entries), "utf8");

const triangleMask = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 384 384">
    <polygon points="192,25 29,359 356,359" fill="#fff"/>
  </svg>
`);
const maskedPhysicalPngs = await Promise.all(physicalPngs.map((png) => sharp(png)
  .composite([{ input: triangleMask, blend: "dest-in" }])
  .png()
  .toBuffer()));

const contactSheet = await sharp({
  create: { width: 800, height: 800, channels: 4, background: "#071a2d" }
}).composite([
  { input: maskedPhysicalPngs[0], left: 8, top: 8 },
  { input: maskedPhysicalPngs[1], left: 408, top: 8 },
  { input: maskedPhysicalPngs[2], left: 8, top: 408 },
  { input: maskedPhysicalPngs[3], left: 408, top: 408 }
]).png().toBuffer();
const contactSheetPath = path.join(qaDir, "angel-sword-d4-large-corner-numbers.png");
await fs.writeFile(contactSheetPath, contactSheet);
console.log(contactSheetPath);
