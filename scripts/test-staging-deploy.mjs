/*
  WS2 staging publish pipeline — deploy-simulation check.

  Proves the folder scripts/publish-staging.mjs emits actually works when
  served by a dumb static file server: no manifest rewriting, no path
  aliasing, no /api/* relay endpoints, and zero custom response headers
  (no CORS, no cache-control, no COOP/COEP) — the artifact must not depend
  on any of that to function. (A real host must still not send COOP headers
  itself, since that severs window.opener — that is a hosting-choice
  constraint for the owner, not something this local sim can prove either
  way, and is recorded in the report instead.)

  Runs a FRESH emit (default base URL: https://staging.invalid/as — the
  brief's own example, on the IANA/RFC 2606 .invalid TLD reserved for
  "definitely not a real host", so this default never favors or resembles a
  real staging host) and then verifies:
    - both extension manifests are served and parse as JSON
    - every URL-bearing manifest field (icon, background_url, action.icon,
      action.popover) is an absolute http(s) URL baked under the given base
      URL, and homepage_url was left alone
    - every asset the manifests + extension HTML/JS entry pages reference
      resolves HTTP 200 from the sim server — re-derived independently by
      crawling the STAGED tree, not by trusting the emit step's own list

  Task 005 / audit M2: this file also supports a verify-in-place mode
  (--no-emit, or --artifact=<dir> which implies it) that SKIPS the fresh
  emit and points the same checks at a directory that already exists. The
  default emit-then-verify mode still exists (npm run test:staging keeps
  working unchanged) but a verify-in-place pass over a corrupted or
  incomplete tree now actually goes red, because nothing re-emits over the
  corruption first.

  Usage:
    node scripts/test-staging-deploy.mjs
    node scripts/test-staging-deploy.mjs --base-url=https://example.test/as
    node scripts/test-staging-deploy.mjs --no-emit --base-url=https://example.test/as
    node scripts/test-staging-deploy.mjs --artifact=dist-staging --base-url=https://example.test/as
*/

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishStaging, normalizeBaseUrl } from "./publish-staging.mjs";
import {
  EXTENSION_DIRS,
  crawlExtensionAssets,
  manifestUrlEntries,
  extractRegistrySidecars,
  PINNED_SENTINEL_ASSETS,
  REGISTRY_RELATIVE_PATH
} from "./lib/owlbear-staging-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
// RFC 2606 reserves .invalid for addresses guaranteed not to resolve — a
// self-test default, never a real host, and never what publish:staging uses
// (that script requires an explicit --base-url and has no default at all).
const DEFAULT_BASE_URL = "https://staging.invalid/as";
const DEFAULT_OUT_DIR = "dist-staging";

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  // Audit M4 companion: served with real types now too, so the sim reflects
  // a real static host's behavior once WS4's sound files land in the closure
  // instead of falling back to application/octet-stream.
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".wav", "audio/wav"],
  [".m4a", "audio/mp4"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"]
]);

function parseArgs(argv) {
  const args = { baseUrl: null, outDir: null, noEmit: false };
  for (const raw of argv) {
    if (raw.startsWith("--base-url=")) args.baseUrl = raw.slice("--base-url=".length);
    else if (raw.startsWith("--out=")) args.outDir = raw.slice("--out=".length);
    else if (raw === "--no-emit") args.noEmit = true;
    else if (raw.startsWith("--artifact=")) {
      args.outDir = raw.slice("--artifact=".length);
      args.noEmit = true;
    }
  }
  return args;
}

/** Mirrors the traversal guard in scripts/server.mjs's safeStaticPath. */
function safeResolve(rootDir, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const relative = normalized.replace(/^[/\\]+/, "");
  const absolute = path.resolve(rootDir, relative);
  const boundary = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  if (absolute !== rootDir && !absolute.startsWith(boundary)) return null;
  return absolute;
}

/** The dumbest possible static host: serves existing files, 404s otherwise, adds nothing else. */
function startDumbStaticServer(rootDir) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const absolute = safeResolve(rootDir, url.pathname);
      if (!absolute) {
        res.writeHead(403);
        res.end();
        return;
      }
      let stat;
      try {
        stat = await fs.stat(absolute);
      } catch {
        res.writeHead(404);
        res.end();
        return;
      }
      if (!stat.isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }
      const type = MIME_TYPES.get(path.extname(absolute).toLowerCase()) || "application/octet-stream";
      const body = await fs.readFile(absolute);
      // Deliberately the ONLY header: no CORS, no cache-control, no COOP/COEP.
      res.writeHead(200, { "content-type": type });
      res.end(body);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error?.message || error));
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function fetchLocal(origin, relPosixPath) {
  const url = `${origin}/${relPosixPath}`;
  const response = await fetch(url);
  return { url, status: response.status, response };
}

/** Audit M2: a friendly pre-check for --no-emit, instead of surfacing a raw ENOENT deep in the crawl. */
async function assertArtifactLooksStaged(absOutDir) {
  let stat;
  try {
    stat = await fs.stat(absOutDir);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `--no-emit was given but "${absOutDir}" does not exist. Run "npm run publish:staging" first, ` +
          "or omit --no-emit / --artifact= to let this script emit one."
      );
    }
    throw error;
  }
  if (!stat.isDirectory()) {
    throw new Error(`--no-emit was given but "${absOutDir}" is not a directory.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args.baseUrl || process.env.LYRIAN_STAGING_BASE_URL || DEFAULT_BASE_URL;
  const outDir = args.outDir || DEFAULT_OUT_DIR;
  const failures = [];
  let checked = 0;
  let server;

  let absOutDir;
  let normalizedBase;
  if (args.noEmit) {
    absOutDir = path.isAbsolute(outDir) ? outDir : path.join(PROJECT_ROOT, outDir);
    normalizedBase = normalizeBaseUrl(baseUrl);
    console.log(`--- WS2 deploy-simulation: verifying EXISTING artifact at ${absOutDir} (--no-emit) for ${normalizedBase} ---`);
    await assertArtifactLooksStaged(absOutDir);
  } else {
    console.log(`--- WS2 deploy-simulation: fresh emit for ${baseUrl} ---`);
    const emitResult = await publishStaging({ baseUrl, outDir, projectRoot: PROJECT_ROOT, log: (m) => console.log(m) });
    absOutDir = emitResult.outDir;
    normalizedBase = emitResult.baseUrl;
  }

  try {
    console.log("\nStarting a plain static server (no rewriting, no relay, zero custom headers)...");
    server = await startDumbStaticServer(absOutDir);
    const { port } = server.address();
    const origin = `http://127.0.0.1:${port}`;
    console.log(`Sim server listening at ${origin}, serving ${absOutDir}`);

    for (const extDir of EXTENSION_DIRS) {
      const manifestRel = `${extDir}/manifest.json`;
      const { status, response } = await fetchLocal(origin, manifestRel);
      checked += 1;
      if (status !== 200) {
        failures.push(`${manifestRel}: expected HTTP 200, got ${status}`);
        continue;
      }
      let manifest;
      try {
        manifest = await response.json();
      } catch (error) {
        failures.push(`${manifestRel}: response did not parse as JSON (${error.message})`);
        continue;
      }

      const expectedPrefix = `${normalizedBase}/${extDir}/`;
      const fields = manifestUrlEntries(manifest);
      if (fields.length === 0) {
        failures.push(`${manifestRel}: no URL-bearing fields found at all (expected icon/background_url/action.icon/action.popover).`);
      }
      for (const { field, value } of fields) {
        checked += 1;
        let parsedField;
        try {
          parsedField = new URL(value);
        } catch {
          failures.push(`${manifestRel}: field "${field}" is not an absolute URL: "${value}"`);
          continue;
        }
        if (parsedField.protocol !== "http:" && parsedField.protocol !== "https:") {
          failures.push(`${manifestRel}: field "${field}" has non-http(s) protocol: "${value}"`);
          continue;
        }
        if (!value.startsWith(expectedPrefix)) {
          failures.push(`${manifestRel}: field "${field}" = "${value}" is not baked under base URL prefix "${expectedPrefix}"`);
          continue;
        }
        const relBack = `${extDir}/${value.slice(expectedPrefix.length)}`;
        checked += 1;
        const { status: assetStatus } = await fetchLocal(origin, relBack);
        if (assetStatus !== 200) {
          failures.push(`${manifestRel}: field "${field}" -> "${relBack}" resolved HTTP ${assetStatus}, expected 200`);
        }
      }

      if (typeof manifest.homepage_url === "string" && manifest.homepage_url.startsWith(normalizedBase)) {
        failures.push(
          `${manifestRel}: homepage_url was unexpectedly rewritten to the staging base ("${manifest.homepage_url}") ` +
            "— it should stay the real external homepage untouched."
        );
      }
    }

    console.log("\nRe-deriving the full asset closure from the STAGED tree (independent of the emit step's own bookkeeping)...");
    const { perExtension, sharedAssets } = await crawlExtensionAssets(absOutDir);
    const closureFiles = [...Object.values(perExtension).flat(), ...sharedAssets];
    for (const relPath of closureFiles) {
      checked += 1;
      const { status } = await fetchLocal(origin, relPath);
      if (status !== 200) {
        failures.push(`${relPath}: expected HTTP 200 from the static sim server, got ${status}`);
      }
    }

    // Audit M2: the closure just derived above is read FROM the staged
    // pages' own markup — if a page were ever corrupted in a way that also
    // ate the text referencing one of these files, that derivation would
    // shrink right along with it and stop checking for the missing file.
    // These two passes are independent of that derivation: a fixed list the
    // engine cannot run without, and a fresh read of the STAGED registry
    // (not whatever the HTML crawl happened to find).
    console.log("\nAsserting pinned sentinel files (independent of what the staged pages' own markup currently references)...");
    for (const relPath of PINNED_SENTINEL_ASSETS) {
      checked += 1;
      const { status } = await fetchLocal(origin, relPath);
      if (status !== 200) {
        failures.push(`${relPath}: pinned sentinel asset expected HTTP 200 from the static sim server, got ${status}`);
      }
    }
    const stagedRegistrySidecars = await extractRegistrySidecars(absOutDir, REGISTRY_RELATIVE_PATH);
    if (stagedRegistrySidecars.length === 0) {
      failures.push(
        `${REGISTRY_RELATIVE_PATH}: no faceArtScript sidecars could be read from the staged registry ` +
          "(missing file, or every promoted set lost its faceArtScript field)."
      );
    }
    for (const relPath of stagedRegistrySidecars) {
      checked += 1;
      const { status } = await fetchLocal(origin, relPath);
      if (status !== 200) {
        failures.push(`${relPath}: registry-named sidecar expected HTTP 200 from the static sim server, got ${status}`);
      }
    }

    console.log(`\nChecked ${checked} condition(s) covering ${EXTENSION_DIRS.length} manifests and ${closureFiles.length} closure files.`);
    if (failures.length) {
      console.error(`\nFAIL - ${failures.length} problem(s):`);
      failures.forEach((f) => console.error(`  - ${f}`));
      process.exitCode = 1;
    } else {
      console.log(`\nPASS - deploy-simulation green for base URL ${normalizedBase}.`);
    }
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log("Sim server closed.");
    }
  }
}

main().catch((error) => {
  console.error(`\ntest-staging-deploy crashed: ${error.stack || error.message || error}`);
  process.exitCode = 1;
});
