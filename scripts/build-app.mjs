import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { bundleTokenFor, readBundleToken, writeBundleToken } from "./bundle-token.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

await build({
  absWorkingDir: projectRoot,
  entryPoints: ["src/js/main.js"],
  outfile: "assets/app.bundle.js",
  bundle: true,
  format: "iife",
  globalName: "LyrianApp",
  target: ["es2020", "safari15"],
  minify: true,
  sourcemap: true,
  logLevel: "info"
});

// Task 038 item 16: the index.html cache-buster follows the bundle's content,
// so a changed bundle always gets a new ?v= and an unchanged one keeps it.
// Players still load the same file name (assets/app.bundle.js).
const indexPath = path.join(projectRoot, "index.html");
const bundleText = await readFile(path.join(projectRoot, "assets/app.bundle.js"), "utf8");
const token = bundleTokenFor(bundleText);
const indexHtml = await readFile(indexPath, "utf8");
if (readBundleToken(indexHtml) !== token) {
  await writeFile(indexPath, writeBundleToken(indexHtml, token), "utf8");
  console.log(`index.html: app bundle cache-buster set to ?v=${token}`);
} else {
  console.log(`index.html: app bundle cache-buster already ?v=${token}`);
}
