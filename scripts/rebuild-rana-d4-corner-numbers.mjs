// Rebuilds Rana's embedded D4 face textures with larger, point-aligned corner numbers.
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("C:/Users/bulld/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const faceArtPath = path.join(projectRoot, "assets", "dice-3d", "promoted", "rana-full-set.js");
const qaDir = path.join(projectRoot, "assets", "dice", "qa-rolls", "rana-d4-large-corners");
const extractOnly = process.argv.includes("--extract-only");

function readFaceArt(source) {
  const marker = "const faceArt = ";
  const start = source.indexOf(marker);
  const end = source.indexOf(";\n  root.LYRIAN_DICE_FACE_ART", start);
  if (start < 0 || end < 0) {
    throw new Error("Could not locate Rana's embedded face-art object.");
  }
  return JSON.parse(source.slice(start + marker.length, end));
}

const source = await fs.readFile(faceArtPath, "utf8");
const entries = readFaceArt(source);
await fs.mkdir(qaDir, { recursive: true });

const sourcePngs = [];
for (const face of [1, 2, 3, 4]) {
  const key = `rana-full-set:d4:face-${face}`;
  const dataUrl = entries[key];
  const match = dataUrl?.match(/^data:image\/webp;base64,(.+)$/);
  if (!match) throw new Error(`Missing embedded WebP for ${key}.`);
  const sourcePngPath = path.join(qaDir, `face-${face}-source.png`);
  try {
    await fs.access(sourcePngPath);
  } catch {
    await sharp(Buffer.from(match[1], "base64")).png().toFile(sourcePngPath);
  }
  sourcePngs.push(await fs.readFile(sourcePngPath));
  console.log(sourcePngPath);
}

async function makeContactSheet(images, fileName) {
  const masked = await Promise.all(images.map((png) => sharp(png)
    .resize(384, 384)
    .png()
    .toBuffer()));
  const sheet = await sharp({
    create: { width: 800, height: 800, channels: 4, background: "#062823" }
  }).composite([
    { input: masked[0], left: 8, top: 8 },
    { input: masked[1], left: 408, top: 8 },
    { input: masked[2], left: 8, top: 408 },
    { input: masked[3], left: 408, top: 408 }
  ]).png().toFile(path.join(qaDir, fileName));
  return sheet;
}

await makeContactSheet(sourcePngs, "rana-d4-source-contact-sheet.png");
if (extractOnly) process.exit(0);

// The D4 physical faces use the same validated tetrahedral numbering as the
// Asari and Leaflit sets. Each corner numeral points toward its nearest vertex.
const physicalFaceNumbers = {
  1: { top: "2", left: "3", right: "4" },
  2: { top: "1", left: "4", right: "3" },
  3: { top: "1", left: "2", right: "4" },
  4: { top: "1", left: "3", right: "2" }
};

function numberText(value, x, y, rotation) {
  const common = `x="${x}" y="${y}" transform="rotate(${rotation} ${x} ${y})" text-anchor="middle" dominant-baseline="central" font-family="Georgia, Times New Roman, serif" font-weight="700" font-size="68" paint-order="stroke fill"`;
  return `
    <text ${common} fill="#f8d49a" stroke="#061713" stroke-width="8" stroke-linejoin="round">${value}</text>
    <text ${common} fill="#ffe1aa" stroke="#9c6c2d" stroke-width="2" stroke-linejoin="round">${value}</text>`;
}

function numberOverlay(numbers) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">
      <defs>
        <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.3" flood-color="#000b08" flood-opacity="0.85"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        ${numberText(numbers.top, 384, 143, 0)}
        ${numberText(numbers.left, 104, 648, -120)}
        ${numberText(numbers.right, 664, 648, 120)}
      </g>
    </svg>
  `);
}

const replacements = new Map();
const rebuiltPngs = [];
for (const face of [1, 2, 3, 4]) {
  const key = `rana-full-set:d4:face-${face}`;
  const rebuiltPng = await sharp(sourcePngs[face - 1])
    .composite([{ input: numberOverlay(physicalFaceNumbers[face]), blend: "over" }])
    .png()
    .toBuffer();
  const rebuiltWebp = await sharp(rebuiltPng)
    .webp({ quality: 94, alphaQuality: 100, effort: 6 })
    .toBuffer();
  await fs.writeFile(path.join(qaDir, `face-${face}-large-corners.png`), rebuiltPng);
  rebuiltPngs.push(rebuiltPng);
  replacements.set(key, `data:image/webp;base64,${rebuiltWebp.toString("base64")}`);
}

let updatedSource = source;
for (const [key, dataUrl] of replacements) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`("${escapedKey}":)"data:image\\/webp;base64,[^"]+"`);
  if (!matcher.test(updatedSource)) throw new Error(`Could not replace ${key}.`);
  updatedSource = updatedSource.replace(matcher, `$1${JSON.stringify(dataUrl)}`);
}
await fs.writeFile(faceArtPath, updatedSource, "utf8");
await makeContactSheet(rebuiltPngs, "rana-d4-large-corner-numbers.png");
console.log(path.join(qaDir, "rana-d4-large-corner-numbers.png"));
