import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

await build({
  absWorkingDir: projectRoot,
  entryPoints: {
    panel: "owlbear/panel.js",
    background: "owlbear/background.js"
  },
  outdir: "owlbear/dist",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020", "safari15"],
  minify: true,
  legalComments: "inline",
  logLevel: "info"
});
