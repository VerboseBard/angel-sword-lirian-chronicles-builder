/*
  WS2 staging publish pipeline — emit step.

  Emits an uploadable static folder containing BOTH Owlbear extensions
  (owlbear panel + owlbear-dice) with absolute manifest URLs baked for a
  caller-supplied base URL. Static hosts (GitHub Pages, Cloudflare Pages,
  ...) cannot rewrite manifests at request time the way scripts/server.mjs
  does for local dev — this bakes the same four fields server.mjs
  absolutizes (icon, background_url, action.icon, action.popover) once, at
  emit time, instead.

  No host is chosen, hardcoded, or favored here: the base URL is a required
  input (CLI --base-url=, positional arg, or LYRIAN_STAGING_BASE_URL env).
  Nothing this script does uploads anything anywhere.

  Usage:
    node scripts/publish-staging.mjs --base-url=https://example.test/angel-sword-staging
    node scripts/publish-staging.mjs --base-url=https://example.test/as --out=dist-staging
    LYRIAN_STAGING_BASE_URL=https://example.test/as node scripts/publish-staging.mjs
*/

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { EXTENSION_DIRS, crawlExtensionAssets, absolutizeManifest } from "./lib/owlbear-staging-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUT_DIR = "dist-staging";

function parseArgs(argv) {
  const args = { baseUrl: null, outDir: null, skipBuild: false };
  for (const raw of argv) {
    if (raw.startsWith("--base-url=")) {
      args.baseUrl = raw.slice("--base-url=".length);
    } else if (raw.startsWith("--out=")) {
      args.outDir = raw.slice("--out=".length);
    } else if (raw === "--skip-build") {
      args.skipBuild = true;
    } else if (!raw.startsWith("--") && !args.baseUrl) {
      args.baseUrl = raw;
    }
  }
  return args;
}

function normalizeBaseUrl(candidate) {
  if (!candidate || typeof candidate !== "string") {
    throw new Error(
      "A base URL is required: --base-url=https://host/path (or a positional arg, or the " +
        "LYRIAN_STAGING_BASE_URL env var). No host is hardcoded or favored by this pipeline."
    );
  }
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (error) {
    throw new Error(`Base URL "${candidate}" is not a valid absolute URL: ${error.message}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Base URL "${candidate}" must use http or https (got "${parsed.protocol}").`);
  }
  return candidate.replace(/\/+$/, "");
}

async function copyDirWholesale(src, dest) {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true });
}

async function copySharedAsset(projectRoot, outDir, relPosixPath) {
  const segments = relPosixPath.split("/");
  const src = path.join(projectRoot, ...segments);
  const dest = path.join(outDir, ...segments);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

/**
 * Emit the staging artifact. Exported so test-staging-deploy.mjs can drive
 * the exact same emit in-process for its own fresh-emit-then-verify pass.
 */
export async function publishStaging({
  baseUrl,
  outDir = DEFAULT_OUT_DIR,
  projectRoot = PROJECT_ROOT,
  skipBuild = false,
  log = () => {}
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const absOutDir = path.isAbsolute(outDir) ? outDir : path.join(projectRoot, outDir);

  if (!skipBuild) {
    log("Building Owlbear extension bundles (node scripts/build-owlbear.mjs)...");
    execFileSync(process.execPath, [path.join(projectRoot, "scripts", "build-owlbear.mjs")], {
      cwd: projectRoot,
      stdio: "inherit"
    });
  }

  log(`Emitting staging artifact to ${absOutDir} for base URL ${normalizedBaseUrl}`);
  // Full clean before every emit: reruns can never double-nest or leave
  // stale files behind, by construction.
  await fs.rm(absOutDir, { recursive: true, force: true });
  await fs.mkdir(absOutDir, { recursive: true });

  for (const extDir of EXTENSION_DIRS) {
    await copyDirWholesale(path.join(projectRoot, extDir), path.join(absOutDir, extDir));
  }

  const { sharedAssets } = await crawlExtensionAssets(projectRoot);
  for (const relPath of sharedAssets) {
    await copySharedAsset(projectRoot, absOutDir, relPath);
  }

  const manifests = [];
  for (const extDir of EXTENSION_DIRS) {
    const manifestPath = path.join(absOutDir, extDir, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const absolutized = absolutizeManifest(manifest, normalizedBaseUrl, extDir);
    await fs.writeFile(manifestPath, `${JSON.stringify(absolutized, null, 2)}\n`, "utf8");
    manifests.push({ extDir, manifest: absolutized });
  }

  return {
    outDir: absOutDir,
    baseUrl: normalizedBaseUrl,
    sharedAssets,
    manifests
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args.baseUrl || process.env.LYRIAN_STAGING_BASE_URL || null;
  const result = await publishStaging({
    baseUrl,
    outDir: args.outDir || DEFAULT_OUT_DIR,
    skipBuild: args.skipBuild,
    log: (msg) => console.log(msg)
  });

  console.log(
    `\nEmitted ${EXTENSION_DIRS.length} extensions + ${result.sharedAssets.length} shared dice asset(s) to ${result.outDir}`
  );
  for (const { extDir, manifest } of result.manifests) {
    console.log(`\n${extDir}/manifest.json ->`);
    console.log(`  icon:            ${manifest.icon}`);
    console.log(`  background_url:  ${manifest.background_url}`);
    console.log(`  action.icon:     ${manifest.action?.icon}`);
    console.log(`  action.popover:  ${manifest.action?.popover}`);
  }
  console.log(
    `\nNothing was uploaded. Upload the contents of "${path.relative(PROJECT_ROOT, result.outDir) || result.outDir}" ` +
      "to your chosen static host, unchanged."
  );
}

function isRunAsScript() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (isRunAsScript()) {
  main().catch((error) => {
    console.error(`\npublish-staging failed: ${error.message}`);
    process.exitCode = 1;
  });
}
