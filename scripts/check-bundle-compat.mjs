import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards the published bundle against JavaScript that old Safari cannot parse.
// Safari only gained regex lookbehind support in 16.4, and a lookbehind literal
// anywhere in the bundle is a parse-time SyntaxError that white-screens the
// whole app on older iPhones. The esbuild target (es2020,safari15) converts
// unsupported regex literals into new RegExp(...) calls, but those still throw
// at runtime, so the source should not use lookbehind at all.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.resolve(__dirname, "..", "assets", "app.bundle.js");
const source = fs.readFileSync(bundlePath, "utf8");

const failures = [];

["(?<=", "(?<!"].forEach((needle) => {
  let index = source.indexOf(needle);
  while (index !== -1) {
    failures.push(`Found regex lookbehind "${needle}" at offset ${index}: ...${source.slice(Math.max(0, index - 40), index + 40)}...`);
    index = source.indexOf(needle, index + 1);
  }
});

if (failures.length) {
  console.error("Bundle compatibility check FAILED. Regex lookbehind is not supported before Safari 16.4.");
  failures.slice(0, 10).forEach((line) => console.error(`  ${line}`));
  console.error("Replace the lookbehind (see splitSentences in src/js/utils.js for the pattern used in Beta 2.12).");
  process.exit(1);
}

console.log(`Bundle compatibility check passed: no regex lookbehind in ${path.basename(bundlePath)} (${(source.length / 1024).toFixed(0)} KB).`);
