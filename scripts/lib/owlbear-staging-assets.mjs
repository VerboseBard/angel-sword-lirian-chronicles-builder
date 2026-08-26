/*
  Shared crawler + manifest helpers for the WS2 staging publish pipeline.

  Used by BOTH scripts/publish-staging.mjs (to know what to copy and how to
  bake absolute manifest URLs) and scripts/test-staging-deploy.mjs (to
  independently re-derive the same closure against the STAGED output, so the
  deploy-sim isn't just trusting the emit step's own bookkeeping).

  Design: rather than guessing a copy list, this crawls the real files:
    1. Each extension's manifest.json URL-bearing fields are the seeds.
    2. Known JS-opened pages that aren't manifest-declared (EXTRA_ENTRY_HTML)
       are added as extra seeds.
    3. Every HTML seed is scanned for further script/link/img references AND
       the dice extension's inline runtime-loader asset list.
    4. Any promoted-dice-skins registry found is parsed for its sidecar
       (faceArtScript) paths.
  Anything discovered outside an extension's own directory (i.e. everything
  under assets/) is reported separately as "sharedAssets" — the dice payload
  that must be explicitly copied since the emit does not copy assets/
  wholesale (it is 22MB+ of QA screenshots and glamour renders the
  extensions never load; only ~45MB of that is the actual dice engine +
  promoted sidecars the pages request).
*/

import fs from "node:fs/promises";
import path from "node:path";

export const EXTENSION_DIRS = ["owlbear", "owlbear-dice"];

// owlbear-dice/background.js opens this with `new URL("overlay.html", ...)`
// at runtime — it is never referenced by manifest.json or by another HTML
// page's markup, so a pure manifest+markup crawl would miss it. Verified by
// reading owlbear-dice/background.js directly (2026-08-25).
export const EXTRA_ENTRY_HTML = {
  "owlbear-dice": ["overlay.html"]
};

const QUOTED_STRING_RE = /["']([^"'<>\s]+)["']/g;
// Task 005 / audit M4: audio + font extensions added so WS4's overlay
// sounds (and any future web font) are crawled the day they land instead
// of silently vanishing from the staging closure.
const ASSET_EXT_RE = /\.(?:js|mjs|css|svg|png|jpg|jpeg|webp|json|mp3|ogg|wav|m4a|woff2?|ttf|otf)$/i;
const PATH_LIKE_RE = /^(?:\.\.\/)*[\w.-]+(?:\/[\w.-]+)*$/;
const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

// Task 005 / audit M2: a fixed list of files the dice engine cannot run
// without, checked directly against the STAGED tree regardless of what the
// staged pages' own markup currently says. This exists because the normal
// crawl derives its ground truth FROM those pages — if a page were ever
// corrupted or truncated in a way that also ate the reference to one of
// these files, the crawl-derived closure would shrink right along with it
// and silently stop checking for the very file that went missing. Pinning
// these paths breaks that self-reference. Sourced by reading
// owlbear-dice/panel.html and owlbear-dice/overlay.html directly
// (2026-08-25) — both load these four relative to the project root.
export const REGISTRY_RELATIVE_PATH = "assets/dice/promoted-dice-skins.registry.js";
export const PINNED_SENTINEL_ASSETS = [
  "assets/dice-3d/dice-3d-embedded.js",
  "assets/vendor/three.min.js",
  "assets/vendor/GLTFLoader.js",
  REGISTRY_RELATIVE_PATH
];

async function readIfExists(absPath) {
  try {
    return await fs.readFile(absPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function toFsPath(rootDir, posixRelPath) {
  return path.join(rootDir, ...posixRelPath.split("/"));
}

function resolveRelative(fromDir, relPath) {
  return path.posix.normalize(path.posix.join(fromDir, relPath));
}

/** Extract every quoted string in `text` that looks like a relative asset path. */
function extractAssetLiterals(text) {
  const found = new Set();
  for (const match of text.matchAll(QUOTED_STRING_RE)) {
    // Task 005 / audit M6: strip a trailing "?v=..." BEFORE testing, same as
    // extractRegistrySidecars already does for faceArtScript. Previously a
    // literal that already carried its own query string (as opposed to the
    // "...js" + V concatenation the current pages use) failed PATH_LIKE_RE
    // (which rejects "?") and vanished from the closure with no warning.
    const candidate = match[1].split("?")[0];
    if (ASSET_EXT_RE.test(candidate) && PATH_LIKE_RE.test(candidate)) {
      found.add(candidate);
    }
  }
  return found;
}

/** The manifest fields Owlbear fetches cross-origin (server.mjs rewrites these same four at serve time). */
export function manifestUrlEntries(manifest) {
  const entries = [];
  if (typeof manifest.icon === "string" && manifest.icon) {
    entries.push({ field: "icon", value: manifest.icon });
  }
  if (typeof manifest.background_url === "string" && manifest.background_url) {
    entries.push({ field: "background_url", value: manifest.background_url });
  }
  if (manifest.action && typeof manifest.action === "object") {
    if (typeof manifest.action.icon === "string" && manifest.action.icon) {
      entries.push({ field: "action.icon", value: manifest.action.icon });
    }
    if (typeof manifest.action.popover === "string" && manifest.action.popover) {
      entries.push({ field: "action.popover", value: manifest.action.popover });
    }
  }
  return entries;
}

/**
 * Turn a manifest field value into an extDir-relative posix path, whether
 * the manifest is still source-relative ("icon.svg") or has already been
 * absolutized by a previous emit ("https://host/base/owlbear/icon.svg").
 * Needed because test-staging-deploy.mjs re-crawls the STAGED tree, whose
 * manifests already carry baked absolute URLs.
 */
function manifestValueToExtRelative(value, extDir) {
  if (ABSOLUTE_URL_RE.test(value)) {
    const { pathname } = new URL(value);
    const marker = `/${extDir}/`;
    const idx = pathname.lastIndexOf(marker);
    if (idx === -1) {
      return `${extDir}/${path.posix.basename(pathname)}`;
    }
    return pathname.slice(idx + 1);
  }
  return resolveRelative(extDir, value);
}

async function extractHtmlAssetRefs(rootDir, extDir, htmlFileName) {
  const text = await readIfExists(toFsPath(rootDir, `${extDir}/${htmlFileName}`));
  if (text === null) return [];
  const refs = [];
  for (const literal of extractAssetLiterals(text)) {
    refs.push(resolveRelative(extDir, literal));
  }
  return refs;
}

/**
 * Read the sidecar (faceArtScript) paths named by a promoted-dice-skins
 * registry file. Exported (task 005) so test-staging-deploy.mjs can assert
 * every registry-named sidecar exists by reading the STAGED registry
 * directly, independent of whatever the staged pages' own HTML crawl finds.
 */
export async function extractRegistrySidecars(rootDir, registryRelPath) {
  const text = await readIfExists(toFsPath(rootDir, registryRelPath));
  if (text === null) return [];
  const sidecars = new Set();
  for (const match of text.matchAll(/"faceArtScript"\s*:\s*"([^"]+)"/g)) {
    sidecars.add(match[1].split("?")[0].replace(/\\/g, "/"));
  }
  return [...sidecars];
}

/**
 * Crawl `rootDir` (the real project root, or a staged copy with the same
 * relative layout) for every file an Owlbear extension loads at runtime.
 *
 * Returns:
 *   perExtension: { owlbear: string[], "owlbear-dice": string[] } — project-
 *     root-relative posix paths, always starting with the extension's own
 *     directory.
 *   sharedAssets: string[] — referenced paths OUTSIDE any extension dir
 *     (the assets/ dice payload: registry + sidecars + engine + vendor).
 *   registryPaths: string[] — which sharedAssets were promoted-dice-skins
 *     registries (informational).
 */
export async function crawlExtensionAssets(rootDir) {
  const perExtension = {};
  const sharedSet = new Set();

  for (const extDir of EXTENSION_DIRS) {
    const manifestRel = `${extDir}/manifest.json`;
    const manifestText = await readIfExists(toFsPath(rootDir, manifestRel));
    if (manifestText === null) {
      throw new Error(`Missing manifest for "${extDir}": ${toFsPath(rootDir, manifestRel)}`);
    }
    const manifest = JSON.parse(manifestText);

    const seeds = new Set([manifestRel]);
    for (const { value } of manifestUrlEntries(manifest)) {
      seeds.add(manifestValueToExtRelative(value, extDir));
    }
    for (const extra of EXTRA_ENTRY_HTML[extDir] || []) {
      seeds.add(resolveRelative(extDir, extra));
    }

    // One crawl pass over the HTML seeds is sufficient: nested references
    // discovered here (dist/*.js, assets/*) are leaf files, not more HTML.
    for (const seed of [...seeds]) {
      if (seed.toLowerCase().endsWith(".html")) {
        const htmlName = path.posix.basename(seed);
        const refs = await extractHtmlAssetRefs(rootDir, extDir, htmlName);
        refs.forEach((ref) => seeds.add(ref));
      }
    }

    const withinExt = [];
    for (const file of seeds) {
      if (file === extDir || file.startsWith(`${extDir}/`)) {
        withinExt.push(file);
      } else {
        sharedSet.add(file);
      }
    }
    perExtension[extDir] = withinExt.sort();
  }

  const registryPaths = [...sharedSet]
    .filter((p) => p.endsWith("promoted-dice-skins.registry.js"))
    .sort();
  for (const registryPath of registryPaths) {
    const sidecars = await extractRegistrySidecars(rootDir, registryPath);
    sidecars.forEach((sc) => sharedSet.add(sc));
  }

  return {
    perExtension,
    sharedAssets: [...sharedSet].sort(),
    registryPaths
  };
}

/** The base URL server.mjs would compute for one extension's manifest, but baked instead of per-request. */
export function extensionBaseUrl(baseUrl, extDir) {
  const rootBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(`${extDir}/`, rootBase).href;
}

/** Mirrors server.mjs's per-request manifest absolutize() — baked at emit time instead of computed per-request. */
export function absolutizeManifest(manifest, baseUrl, extDir) {
  const base = extensionBaseUrl(baseUrl, extDir);
  const absolutize = (value) => (typeof value === "string" && value ? new URL(value, base).href : value);
  const next = { ...manifest };
  next.icon = absolutize(next.icon);
  next.background_url = absolutize(next.background_url);
  if (next.action && typeof next.action === "object") {
    next.action = { ...next.action };
    next.action.icon = absolutize(next.action.icon);
    next.action.popover = absolutize(next.action.popover);
  }
  return next;
}
