import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

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
