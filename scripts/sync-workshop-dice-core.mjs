import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workshopRoot = path.resolve(projectRoot, "..", "Dice Builder Workshop");
const pairs = [
  [path.join(workshopRoot, "dice roller", "dice-geometry.js"), path.join(projectRoot, "assets", "dice-3d", "dice-geometry.js")],
  [path.join(workshopRoot, "dice roller", "dice-roller-core.js"), path.join(projectRoot, "assets", "dice-3d", "shared-dice-roller-core.js")]
];
const checkOnly = process.argv.includes("--check");
const normalize = (text) => text.replace(/\r\n/g, "\n").trimEnd();

let mismatch = false;
for (const [source, target] of pairs) {
  const sourceText = await fs.readFile(source, "utf8");
  let targetText = "";
  try {
    targetText = await fs.readFile(target, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (normalize(sourceText) === normalize(targetText)) {
    console.log(`in sync: ${path.basename(source)} -> ${path.relative(projectRoot, target)}`);
    continue;
  }
  mismatch = true;
  if (checkOnly) {
    console.error(`out of sync: ${path.basename(source)} -> ${path.relative(projectRoot, target)}`);
  } else {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, sourceText, "utf8");
    console.log(`updated: ${path.basename(source)} -> ${path.relative(projectRoot, target)}`);
  }
}

if (checkOnly && mismatch) process.exitCode = 1;
