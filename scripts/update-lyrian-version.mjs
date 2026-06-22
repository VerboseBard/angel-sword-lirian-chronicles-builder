import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID, webcrypto } from "node:crypto";

const OFFICIAL_MANUAL_URL = "https://rpg.angelssword.com/game/online-manual";
const OFFICIAL_API_VERSION_LIST = "https://api.angelssword.com/ttrpg/version/list";
const OFFICIAL_AES_KEY = "CSRITDuXKJgTfpN20FthTQ";
const VERSION_PATTERN = /\b(?:0|1)\.\d+\.\d+(?:\s*-\s*Lyrian Chronicles)?\b/g;

function compareVersions(a, b) {
  const left = String(a || "").match(/\d+/g)?.map(Number) || [];
  const right = String(b || "").match(/\d+/g)?.map(Number) || [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff) {
      return diff;
    }
  }
  return 0;
}

function cleanVersion(value) {
  return String(value || "")
    .replace(/\s*-\s*Lyrian Chronicles\s*$/i, "")
    .trim();
}

function uniqueVersions(values) {
  return Array.from(new Set(values.map(cleanVersion).filter(Boolean)))
    .sort(compareVersions);
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "LyrianCharacterSuiteLocalUpdater/0.1"
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while reading ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function base64Text(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

async function buildOfficialApiHeaders() {
  const key = await webcrypto.subtle.importKey(
    "jwk",
    { kty: "oct", k: OFFICIAL_AES_KEY, alg: "A128CBC", ext: true },
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );
  const sessionid = base64Text(randomUUID());
  const requestid = base64Text(Date.now().toString());
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-CBC", iv: new TextEncoder().encode(requestid.slice(0, 16)) },
    key,
    new TextEncoder().encode(sessionid)
  );
  return {
    requestid,
    requestkey: Buffer.from(new Uint8Array(encrypted)).toString("base64"),
    sessionid,
    referer: "https://rpg.angelssword.com/",
    accept: "application/json, text/plain, */*",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
  };
}

async function fetchOfficialVersionRecords() {
  const response = await fetch(OFFICIAL_API_VERSION_LIST, {
    headers: await buildOfficialApiHeaders()
  });
  if (!response.ok) {
    throw new Error(`Official version API returned HTTP ${response.status}.`);
  }
  const records = await response.json();
  if (!Array.isArray(records)) {
    throw new Error("Official version API returned an unexpected payload.");
  }
  return records
    .map((record) => ({
      versionNumber: cleanVersion(record.versionNumber),
      versionId: String(record.versionId || ""),
      name: String(record.name || "Lyrian Chronicles")
    }))
    .filter((record) => record.versionNumber);
}

function resolveAssetUrls(html, baseUrl) {
  const urls = new Set();
  const baseHref = /<base\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(html)?.[1] || "";
  const resolvedBase = baseHref ? new URL(baseHref, baseUrl).href : baseUrl;
  const srcPattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = srcPattern.exec(html))) {
    const asset = match[1];
    if (!/\.(?:js|json)(?:\?|$)/i.test(asset)) {
      continue;
    }
    try {
      urls.add(new URL(asset, resolvedBase).href);
    } catch {
      // Ignore malformed assets from the remote page.
    }
  }
  return Array.from(urls);
}

function extractVersions(text) {
  return uniqueVersions(text.match(VERSION_PATTERN) || []);
}

export async function readLocalManifest(projectRoot) {
  const manifestPath = path.join(projectRoot, "assets", "versions", "manifest.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}

export async function discoverOfficialVersions(options = {}) {
  const manualUrl = options.manualUrl || OFFICIAL_MANUAL_URL;
  try {
    const records = await fetchOfficialVersionRecords();
    const versions = uniqueVersions(records.map((record) => record.versionNumber));
    return {
      ok: true,
      sourceUrl: OFFICIAL_API_VERSION_LIST,
      checkedAt: new Date().toISOString(),
      versions,
      records,
      latestVersion: versions.at(-1) || ""
    };
  } catch (apiError) {
    // Keep a text-scrape fallback so the checker still explains itself if the protected API changes.
    console.warn(apiError);
  }

  const html = await fetchText(manualUrl);
  const found = new Set(extractVersions(html));
  const assetUrls = resolveAssetUrls(html, manualUrl).slice(0, 18);

  await Promise.allSettled(
    assetUrls.map(async (assetUrl) => {
      const text = await fetchText(assetUrl, 12000);
      extractVersions(text).forEach((version) => found.add(version));
    })
  );

  const versions = uniqueVersions(Array.from(found));
  return {
    ok: true,
    sourceUrl: manualUrl,
    checkedAt: new Date().toISOString(),
    versions,
    latestVersion: versions.at(-1) || ""
  };
}

export async function planVersionUpdate(projectRoot, targetVersion) {
  const manifest = await readLocalManifest(projectRoot);
  const normalizedTarget = cleanVersion(targetVersion);
  if (!normalizedTarget) {
    throw new Error("No target version was supplied.");
  }
  if (manifest.versions?.some((entry) => entry.id === normalizedTarget)) {
    return {
      ok: true,
      alreadyInstalled: true,
      version: normalizedTarget,
      message: `${normalizedTarget} is already installed locally.`
    };
  }

  const official = await discoverOfficialVersions({ manualUrl: manifest.officialManualUrl });
  if (!official.versions.includes(normalizedTarget)) {
    throw new Error(`${normalizedTarget} was not found in the official Lyrian version list.`);
  }

  const pullResult = await runNodeScript(projectRoot, "scripts/pull-angels-sword-data.js", [normalizedTarget], {
    LYRIAN_SKIP_SNAPSHOTS: "1"
  });
  const buildResult = await runNodeScript(projectRoot, "scripts/build-version-assets.mjs", [normalizedTarget]);
  const updatedManifest = await readLocalManifest(projectRoot);
  const installed = updatedManifest.versions?.find((entry) => entry.id === normalizedTarget);
  if (!installed) {
    throw new Error(`The ${normalizedTarget} data pull completed, but the version manifest was not updated.`);
  }

  return {
    ok: true,
    version: normalizedTarget,
    message: `Installed Lyrian rules version ${normalizedTarget}.`,
    pullOutput: pullResult.stdout.slice(-1200),
    buildOutput: buildResult.stdout.slice(-1200),
    manifestEntry: installed
  };
}

function runNodeScript(projectRoot, scriptRelativePath, args = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(projectRoot, scriptRelativePath), ...args], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...extraEnv
      },
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${scriptRelativePath} failed with exit code ${code}: ${stderr || stdout}`));
    });
  });
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const projectRoot = process.argv[2] || process.cwd();
  const targetVersion = process.argv[3] || "";
  const result = targetVersion
    ? await planVersionUpdate(projectRoot, targetVersion)
    : await discoverOfficialVersions();
  console.log(JSON.stringify(result, null, 2));
}
