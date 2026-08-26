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

/**
 * Which raw path segments (before the URL parser resolves "." / ".." away)
 * the candidate string contains, ignoring the scheme/host/port prefix and
 * anything after "?" or "#". Used only to detect and refuse dot-segments —
 * by the time a WHATWG URL object exists, `.pathname` has already silently
 * resolved them, which is the exact silent-subpath-loss bug (audit M3).
 */
function rawPathSegments(candidate) {
  const withoutSchemeAndHost = candidate.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, "");
  const pathOnly = withoutSchemeAndHost.split(/[?#]/)[0];
  return pathOnly.split("/").filter((segment) => segment.length > 0);
}

export function normalizeBaseUrl(candidate) {
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
  // Audit M3: a query string or fragment on the base URL is silently
  // dropped (along with everything after it, INCLUDING a real subpath) the
  // moment it is used as the base of a relative URL() resolution later in
  // absolutizeManifest(). Refuse instead of baking a silently-wrong manifest.
  if (parsed.search) {
    throw new Error(
      `Base URL "${candidate}" must not include a query string ("${parsed.search}"): it would be ` +
        "silently dropped (taking any subpath before it with it) when baked into manifest URLs."
    );
  }
  if (parsed.hash) {
    throw new Error(
      `Base URL "${candidate}" must not include a fragment ("${parsed.hash}"): it would be silently ` +
        "dropped (taking any subpath before it with it) when baked into manifest URLs."
    );
  }
  // Beyond the audit's four DECIDED base-URL fixes but small/obviously safe
  // and surfaced by the same audit (item 4): credentials in the base URL
  // would be baked verbatim into a manifest that is, by definition, about to
  // be hosted publicly.
  if (parsed.username || parsed.password) {
    throw new Error(
      `Base URL "${candidate}" must not embed credentials (user:pass@...): they would be baked into ` +
        "a public manifest."
    );
  }
  // Audit M3: "." / ".." path segments resolve away silently (the URL
  // parser already collapsed them in `parsed`, which is exactly why the old
  // code's `candidate.replace(...)` on the RAW string produced a mismatch
  // downstream) — refuse rather than guess whether the caller meant that.
  if (rawPathSegments(candidate).some((segment) => segment === "." || segment === "..")) {
    throw new Error(
      `Base URL "${candidate}" must not contain "." or ".." path segments; write the fully-resolved ` +
        "path directly."
    );
  }
  // Return the URL-parser-normalized form (lowercased scheme/host, percent-
  // encoded path) rather than the raw candidate string, so this value is
  // byte-identical to what extensionBaseUrl()/absolutizeManifest() compute
  // from it downstream (both re-parse through `new URL()` too). Fixes the
  // audit's secondary finding that a mixed-case or space-containing base URL
  // baked correctly but made test-staging-deploy.mjs's prefix comparison
  // falsely red, because it compared against the un-normalized raw string.
  return parsed.href.replace(/\/+$/, "");
}

/**
 * Audit M1 (HIGH): the staging output directory is wiped with
 * `fs.rm(..., { recursive: true, force: true })` before every emit. Before
 * this guard, that target was un-anchored: `--out=.` resolved to the
 * worktree root (deleting `.git`), `--out=..` / `--out=../../..` walked
 * above the worktree entirely (as far as the drive root), and
 * `--out=../Angel Sword Lirian Chronicles Public Beta 2.20` reached the
 * FROZEN sibling the project state forbids touching — all reachable from a
 * single operator typo on the documented `--out=` flag. Refuses BEFORE any
 * delete. No override flag by design (DECIDED — add only if the owner asks).
 */
async function assertSafeOutDir(absOutDir, projectRoot) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedOut = path.resolve(absOutDir);
  const boundary = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;

  if (resolvedOut === resolvedRoot) {
    throw new Error(
      `Refusing to use "${absOutDir}" as the staging output directory: it resolves to the worktree ` +
        `root itself (${resolvedRoot}), which is about to be recursively deleted. --out must name a ` +
        "subdirectory."
    );
  }
  if (!resolvedOut.startsWith(boundary)) {
    throw new Error(
      `Refusing to use "${absOutDir}" as the staging output directory: it resolves to ${resolvedOut}, ` +
        `which is outside the worktree root (${resolvedRoot}). This directory is recursively deleted ` +
        "before every emit, so it must stay strictly inside the worktree."
    );
  }
  // Being "inside the worktree root" alone still permits --out=.git, which
  // is strictly inside and not the root itself yet would wipe the actual
  // git repository metadata. Refuse any path that passes through a ".git"
  // entry, not just an exact match, so ".git", ".git/objects", and
  // "sub/.git" are all caught.
  const relFromRoot = path.relative(resolvedRoot, resolvedOut);
  if (relFromRoot.split(path.sep).includes(".git")) {
    throw new Error(
      `Refusing to use "${absOutDir}" as the staging output directory: its path passes through a ` +
        `".git" entry (resolved: ${resolvedOut}). Recursive delete refused.`
    );
  }
  // Defense in depth: if the resolved target already exists and itself
  // contains a ".git" entry — i.e. it looks like a git repository or
  // worktree checked out inside this project, not a disposable build
  // output — refuse rather than delete someone else's history.
  let containsNestedGit = false;
  try {
    await fs.stat(path.join(resolvedOut, ".git"));
    containsNestedGit = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (containsNestedGit) {
    throw new Error(
      `Refusing to use "${absOutDir}" as the staging output directory: it already contains a ".git" ` +
        "entry, so it looks like a git repository or worktree rather than a disposable build output. " +
        "Recursive delete refused."
    );
  }
}

/**
 * Audit M8 (LOW, bundled with M1 by the audit): resolveRelative() in the
 * crawler can in principle produce a "../"-escaping relative path (e.g. a
 * future HTML literal like "../../../secret.js"). Without this check,
 * copySharedAsset would silently path.join() its way outside projectRoot on
 * the read side and/or outside outDir on the write side. No live asset
 * triggers this today; this is a boundary assert for defense in depth.
 */
function assertWithinRoot(resolvedPath, root, relPosixPath, label) {
  const resolvedRoot = path.resolve(root);
  const boundary = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  const resolved = path.resolve(resolvedPath);
  if (resolved !== resolvedRoot && !resolved.startsWith(boundary)) {
    throw new Error(
      `Refusing to copy shared asset "${relPosixPath}": its ${label} path resolves to ${resolved}, ` +
        `which escapes ${resolvedRoot}.`
    );
  }
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
  assertWithinRoot(src, projectRoot, relPosixPath, "source");
  assertWithinRoot(dest, outDir, relPosixPath, "destination");
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
  // Audit M1: refuse before ANY delete, before even the build step, so a
  // hostile/typo --out never gets far enough to touch the filesystem.
  await assertSafeOutDir(absOutDir, projectRoot);

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
