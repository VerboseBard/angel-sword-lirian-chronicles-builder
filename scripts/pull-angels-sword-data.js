const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const Module = require("module");

initNodePath();

const API_BASE_URL = "https://api.angelssword.com";
const SITE_BASE_URL = "https://rpg.angelssword.com";
const EDGE_PATH =
  process.env.EDGE_PATH ||
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUTPUT_ROOT = path.join(process.cwd(), "data", "angelssword");
const RAW_DIR = path.join(OUTPUT_ROOT, "raw");
const DECODED_DIR = path.join(OUTPUT_ROOT, "decoded");
const JOINED_DIR = path.join(OUTPUT_ROOT, "joined");

const SECTION_URLS = {
  site: SITE_BASE_URL,
  onlineManual: `${SITE_BASE_URL}/game/online-manual`,
  latestUpdate: `${SITE_BASE_URL}/game/latest/latest-update`,
  settingsGuide: `${SITE_BASE_URL}/game/latest/settings-guide`,
  rulebook: `${SITE_BASE_URL}/game/latest/rulebook`,
  breakthroughs: `${SITE_BASE_URL}/game/latest/breakthroughs`,
  keywords: `${SITE_BASE_URL}/game/latest/keywords`,
  races: `${SITE_BASE_URL}/game/latest/races`,
  classes: `${SITE_BASE_URL}/game/latest/classes`,
  abilities: `${SITE_BASE_URL}/game/latest/abilities`,
  items: `${SITE_BASE_URL}/game/latest/items`,
  monsters: `${SITE_BASE_URL}/game/latest/monsters`,
  monsterAbilities: `${SITE_BASE_URL}/game/latest/monster-abilities`,
};

const MANUAL_INDEX = [
  { slug: "latest-update", title: "Latest update", url: SECTION_URLS.latestUpdate },
  { slug: "settings-guide", title: "Settings guide", url: SECTION_URLS.settingsGuide },
  { slug: "rulebook", title: "Rulebook", url: SECTION_URLS.rulebook },
  { slug: "breakthroughs", title: "Breakthroughs", url: SECTION_URLS.breakthroughs },
  { slug: "keywords", title: "Keywords", url: SECTION_URLS.keywords },
  { slug: "races", title: "Races", url: SECTION_URLS.races },
  { slug: "classes", title: "Classes", url: SECTION_URLS.classes },
  { slug: "abilities", title: "Abilities", url: SECTION_URLS.abilities },
  { slug: "items", title: "Items", url: SECTION_URLS.items },
  { slug: "monsters", title: "Monsters", url: SECTION_URLS.monsters },
  {
    slug: "monster-abilities",
    title: "Monster abilities",
    url: SECTION_URLS.monsterAbilities,
  },
];

const HTMLISH_FIELDS = new Set([
  "description",
  "descriptions",
  "guide",
  "requirements",
  "requirement",
  "content",
  "benefit1",
  "benefit2",
  "benefit3",
  "benefit4",
  "lore",
  "strategy",
  "runningMonster",
]);

async function main() {
  await ensureDirs();

  const versions = await apiGet("ttrpg/version/list");
  const requestedVersion = process.argv[2] || "";
  const latestVersion = requestedVersion
    ? versions.find((entry) => entry.versionNumber === requestedVersion) || versions[0]
    : versions[0];
  const versionNumber = latestVersion.versionNumber;

  const topLevel = await fetchTopLevel(versionNumber);
  const details = await fetchDetailCollections(versionNumber, topLevel);

  const rawData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      latestVersion,
      sourceUrls: SECTION_URLS,
      manualIndex: MANUAL_INDEX,
    },
    versions,
    ...topLevel,
    ...details,
  };

  const decodedData = decodeBase64Html(rawData);
  const joinedData = buildJoinedData(decodedData);
  const siteSnapshots = process.env.LYRIAN_SKIP_SNAPSHOTS === "1"
    ? { note: "Site snapshots skipped by the Beta 1.3 local updater." }
    : repairTextTree(await captureSiteSnapshots());
  const manifest = buildManifest(decodedData, joinedData, siteSnapshots);

  await writeSectionFiles(RAW_DIR, rawData);
  await writeSectionFiles(DECODED_DIR, decodedData);
  await writeSectionFiles(JOINED_DIR, joinedData);
  await writeJson(path.join(OUTPUT_ROOT, "site_snapshots.json"), siteSnapshots);
  await writeJson(path.join(OUTPUT_ROOT, "manifest.json"), manifest);
  await writeReadme(manifest);

  console.log(`Pulled Angel's Sword data for version ${versionNumber}`);
  console.log(`Output: ${OUTPUT_ROOT}`);
}

function initNodePath() {
  const fallbackNodeModules = path.join(
    os.homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "node",
    "node_modules"
  );
  const entries = [process.env.NODE_PATH, fallbackNodeModules]
    .filter(Boolean)
    .flatMap((value) => value.split(path.delimiter))
    .filter(Boolean);
  process.env.NODE_PATH = Array.from(new Set(entries)).join(path.delimiter);
  Module._initPaths();
}

async function ensureDirs() {
  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.mkdir(DECODED_DIR, { recursive: true });
  await fs.mkdir(JOINED_DIR, { recursive: true });
}

async function fetchTopLevel(versionNumber) {
  return {
    classes: await apiGet(`ttrpg/${versionNumber}/classes`),
    keyAbilities: await apiGet(`ttrpg/${versionNumber}/key-abilities`),
    trueAbilities: await apiGet(`ttrpg/${versionNumber}/true-abilities`),
    items: await apiGet(`ttrpg/${versionNumber}/items`),
    monsters: await apiGet(`ttrpg/${versionNumber}/monsters`),
    monsterAbilities: await apiGet(`ttrpg/${versionNumber}/monsters-abilities`),
    monsterAbilityLists: await apiGet(`ttrpg/${versionNumber}/monsters-abilities-lists`),
    monsterActiveActions: await apiGet(`ttrpg/${versionNumber}/monsters-active-actions`),
    monsterActiveActionLists: await apiGet(
      `ttrpg/${versionNumber}/monsters-active-actions-lists`
    ),
    primaryRaces: await apiGet(`ttrpg/${versionNumber}/primary-races`),
    ancestries: await apiGet(`ttrpg/${versionNumber}/ancestries`),
    breakthroughs: await apiGet(`ttrpg/${versionNumber}/breakthroughs`),
    keywords: await apiGet(`ttrpg/${versionNumber}/keywords`),
    rulebook: await apiGet(`ttrpg/${versionNumber}/rulebook`),
    settingsGuide: await apiGet(`ttrpg/${versionNumber}/settings-guide`),
    patchNotes: await apiGet(`ttrpg/${versionNumber}/patch-notes`),
  };
}

async function fetchDetailCollections(versionNumber, topLevel) {
  const classIds = topLevel.classes.map((item) => item.classId);
  const itemIds = topLevel.items.map((item) => item.itemId);
  const monsterIds = topLevel.monsters.map((item) => item.monsterId);
  const primaryRaceIds = topLevel.primaryRaces.map((item) => item.primaryRaceId);
  const ancestryIds = topLevel.ancestries.map((item) => item.ancestryId);

  const [classDetails, itemDetails, monsterDetails, primaryRaceDetails, ancestryDetails] =
    await Promise.all([
      mapLimit(classIds, 10, (id) => apiGet(`ttrpg/${versionNumber}/class/${id}`)),
      mapLimit(itemIds, 12, (id) => apiGet(`ttrpg/${versionNumber}/item/${id}`)),
      mapLimit(monsterIds, 8, (id) => apiGet(`ttrpg/${versionNumber}/monster/${id}`)),
      mapLimit(primaryRaceIds, 5, (id) => apiGet(`ttrpg/${versionNumber}/primary-race/${id}`)),
      mapLimit(ancestryIds, 8, (id) => apiGet(`ttrpg/${versionNumber}/ancestry/${id}`)),
    ]);

  return {
    classDetails,
    itemDetails,
    monsterDetails,
    primaryRaceDetails,
    ancestryDetails,
  };
}

async function apiGet(endpoint) {
  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    headers: await buildHeaders(),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GET ${endpoint} failed: ${response.status} ${body.slice(0, 200)}`);
  }
  return response.json();
}

async function buildHeaders() {
  const sessionId = toBase64(crypto.randomUUID());
  const requestId = toBase64(Date.now().toString());
  return {
    requestId,
    sessionId,
    requestkey: await buildRequestKey(sessionId, requestId),
    accept: "application/json, text/plain, */*",
    dnt: "1",
    referer: `${SITE_BASE_URL}/`,
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) HeadlessChrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
    "sec-ch-ua": '"Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  };
}

async function buildRequestKey(sessionId, requestId) {
  const jwk = {
    kty: "oct",
    k: "CSRITDuXKJgTfpN20FthTQ",
    alg: "A128CBC",
    ext: true,
  };
  const key = await crypto.webcrypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );
  const iv = new TextEncoder().encode(requestId.slice(0, 16));
  const data = new TextEncoder().encode(sessionId);
  const encrypted = await crypto.webcrypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    key,
    data
  );
  return Buffer.from(encrypted).toString("base64");
}

function toBase64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function decodeBase64Html(value) {
  if (Array.isArray(value)) {
    return value.map((item) => decodeBase64Html(item));
  }
  if (value && typeof value === "object") {
    const decoded = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string") {
        decoded[key] = item;
        const htmlPayload = maybeDecodeHtmlPayload(item, key);
        if (htmlPayload) {
          decoded[`${key}Html`] = htmlPayload.html;
          decoded[`${key}Text`] = htmlPayload.text;
        }
      } else {
        decoded[key] = decodeBase64Html(item);
      }
    }
    return decoded;
  }
  return value;
}

function maybeDecodeHtmlPayload(value, key) {
  if (!HTMLISH_FIELDS.has(key) && !looksLikeBase64(value)) {
    return null;
  }
  if (!looksLikeBase64(value)) {
    return null;
  }
  try {
    const html = repairMojibake(Buffer.from(value, "base64").toString("utf8"));
    if (!looksLikeHtml(html)) {
      return null;
    }
    return {
      html,
      text: htmlToText(html),
    };
  } catch {
    return null;
  }
}

function looksLikeBase64(value) {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/=]+$/.test(value)
  );
}

function looksLikeHtml(value) {
  return /<\s*(p|h[1-6]|ul|ol|li|div|strong|em|span|table|br|img|blockquote)\b/i.test(value);
}

function htmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li>/gi, "- ")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/td>/gi, " ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(value) {
  return repairMojibake(
    value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#8217;/gi, "'")
    .replace(/&#8220;/gi, '"')
    .replace(/&#8221;/gi, '"')
    .replace(/&#8211;/gi, "-")
    .replace(/&#8230;/gi, "...")
  );
}

function repairMojibake(value) {
  if (!value || typeof value !== "string") {
    return value;
  }
  const repaired = Buffer.from(value, "latin1").toString("utf8");
  const best = mojibakeScore(repaired) < mojibakeScore(value) ? repaired : value;
  return best
    .replace(/â€”/g, "—")
    .replace(/â€“/g, "–")
    .replace(/â€™/g, "’")
    .replace(/â€œ/g, "“")
    .replace(/â€�/g, "”")
    .replace(/â€˜/g, "‘")
    .replace(/â€¦/g, "…")
    .replace(/Â /g, " ")
    .replace(/Â/g, "");
}

function mojibakeScore(value) {
  const matches = value.match(/[ÃÂâ€™â€œâ€�â€“â€”â€¦â¬©]/g);
  return matches ? matches.length : 0;
}

function repairTextTree(value) {
  if (Array.isArray(value)) {
    return value.map((item) => repairTextTree(item));
  }
  if (value && typeof value === "object") {
    const repaired = {};
    for (const [key, item] of Object.entries(value)) {
      repaired[key] = repairTextTree(item);
    }
    return repaired;
  }
  if (typeof value === "string") {
    return repairMojibake(value);
  }
  return value;
}

function buildJoinedData(data) {
  const trueAbilityLookup = buildLookup(data.trueAbilities, [
    "id",
    "indexId",
    "trueAbilityId",
    "name",
  ]);
  const keyAbilityLookup = buildLookup(data.keyAbilities, [
    "id",
    "indexId",
    "abilityId",
    "name",
  ]);
  const monsterAbilityLookup = buildLookup(data.monsterAbilities, [
    "id",
    "indexId",
    "monsterAbilityId",
    "name",
  ]);
  const monsterAbilityListLookup = buildLookup(data.monsterAbilityLists, [
    "id",
    "indexId",
    "monsterAbilityListId",
    "name",
  ]);
  const monsterActiveActionLookup = buildLookup(data.monsterActiveActions, [
    "id",
    "indexId",
    "monsterActiveActionsId",
    "name",
  ]);
  const monsterActiveActionListLookup = buildLookup(data.monsterActiveActionLists, [
    "id",
    "indexId",
    "monsterActiveActionsListId",
    "name",
  ]);

  const resolvedKeyAbilities = data.keyAbilities.map((item) => ({
    ...item,
    associatedAbilityRef: resolveRef(item.associatedAbility, trueAbilityLookup),
  }));

  const classesResolved = data.classDetails.map((item) => ({
    ...item,
    keyAbilityRef: resolveRef(item.keyAbility, buildLookup(resolvedKeyAbilities, [
      "id",
      "indexId",
      "abilityId",
      "name",
    ])),
    ability1Ref: resolveRef(item.ability1, trueAbilityLookup),
    ability2Ref: resolveRef(item.ability2, trueAbilityLookup),
    ability3Ref: resolveRef(item.ability3, trueAbilityLookup),
    ultimateAbilityRef: resolveRef(item.ultimateAbility, trueAbilityLookup),
  }));

  const monstersResolved = data.monsterDetails.map((item) => {
    const activeList = resolveRef(item.activeActions, monsterActiveActionListLookup);
    const abilityList = resolveRef(item.abilities, monsterAbilityListLookup);
    return {
      ...item,
      activeActionsListRef: activeList,
      monsterAbilitiesListRef: abilityList,
      activeActionRefs: expandListRefs(activeList, "action", monsterActiveActionLookup),
      monsterAbilityRefs: expandListRefs(abilityList, "ability", monsterAbilityLookup),
    };
  });

  const primaryRacesResolved = data.primaryRaceDetails.map((item) => {
    const lineageChoices = {};
    for (const key of ["wi", "lir", "d", "ar", "lu", "ni", "un", "vi", "none"]) {
      if (item[key]) {
        lineageChoices[key] = {
          ...item[key],
          abilityRef: resolveRef(item[key].ability, trueAbilityLookup),
        };
      }
    }
    return {
      ...item,
      ability1Ref: resolveRef(item.ability1, trueAbilityLookup),
      ability2Ref: resolveRef(item.ability2, trueAbilityLookup),
      lineageChoices,
    };
  });

  const ancestriesResolved = data.ancestryDetails.map((item) => ({
    ...item,
    trait1Ref: resolveRef(item.trait1, trueAbilityLookup),
    trait2Ref: resolveRef(item.trait2, trueAbilityLookup),
    trait3Ref: resolveRef(item.trait3, trueAbilityLookup),
  }));

  return {
    manualIndex: MANUAL_INDEX,
    keyAbilitiesResolved: resolvedKeyAbilities,
    classDetailsResolved: classesResolved,
    monsterDetailsResolved: monstersResolved,
    primaryRaceDetailsResolved: primaryRacesResolved,
    ancestryDetailsResolved: ancestriesResolved,
  };
}

function buildLookup(records, keys) {
  const lookup = new Map();
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value) {
        lookup.set(value, record);
      }
    }
  }
  return lookup;
}

function resolveRef(value, lookup) {
  if (!value || typeof value !== "string") {
    return null;
  }
  return lookup.get(value) || null;
}

function expandListRefs(record, prefix, lookup) {
  if (!record) {
    return [];
  }
  return Object.entries(record)
    .filter(([key, value]) => key.startsWith(prefix) && typeof value === "string" && value)
    .map(([, value]) => resolveRef(value, lookup))
    .filter(Boolean);
}

async function captureSiteSnapshots() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    return {
      note: "Playwright was unavailable, so site snapshots were skipped.",
    };
  }

  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: EDGE_PATH,
  });

  try {
    const home = await snapshotPage(browser, SECTION_URLS.site);
    const onlineManual = await snapshotPage(browser, SECTION_URLS.onlineManual);
    return { home, onlineManual };
  } finally {
    await browser.close();
  }
}

async function snapshotPage(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    return await page.evaluate((pageUrl) => {
      const normalize = (value) => value.replace(/\s+/g, " ").trim();
      const unique = (items) => Array.from(new Set(items.filter(Boolean)));
      const headings = unique(
        Array.from(document.querySelectorAll("h1, h2, h3"))
          .map((node) => normalize(node.textContent || ""))
          .filter(Boolean)
      );
      const links = unique(
        Array.from(document.querySelectorAll("a[href]"))
          .map((node) => {
            const text = normalize(node.textContent || "");
            const href = node.href;
            return text || href ? JSON.stringify({ text, href }) : "";
          })
          .filter(Boolean)
      ).map((item) => JSON.parse(item));

      const manualLinks = links.filter((link) => /\/game\/latest\//.test(link.href));
      return {
        url: pageUrl,
        title: document.title,
        metaDescription:
          document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
        headings,
        manualLinks,
        externalLinks: links.filter(
          (link) =>
            /^https?:\/\//.test(link.href) && !link.href.startsWith("https://rpg.angelssword.com")
        ),
      };
    }, url);
  } catch (error) {
    return {
      url,
      error: error.message,
    };
  } finally {
    await page.close();
  }
}

function buildManifest(decodedData, joinedData, siteSnapshots) {
  const latestVersion = decodedData.metadata.latestVersion.versionNumber;
  return {
    generatedAt: decodedData.metadata.generatedAt,
    latestVersion,
    sourceUrls: decodedData.metadata.sourceUrls,
    manualIndex: decodedData.metadata.manualIndex,
    counts: {
      versions: decodedData.versions.length,
      classes: decodedData.classes.length,
      classDetails: decodedData.classDetails.length,
      keyAbilities: decodedData.keyAbilities.length,
      trueAbilities: decodedData.trueAbilities.length,
      items: decodedData.items.length,
      itemDetails: decodedData.itemDetails.length,
      monsters: decodedData.monsters.length,
      monsterDetails: decodedData.monsterDetails.length,
      monsterAbilities: decodedData.monsterAbilities.length,
      monsterAbilityLists: decodedData.monsterAbilityLists.length,
      monsterActiveActions: decodedData.monsterActiveActions.length,
      monsterActiveActionLists: decodedData.monsterActiveActionLists.length,
      primaryRaces: decodedData.primaryRaces.length,
      primaryRaceDetails: decodedData.primaryRaceDetails.length,
      ancestries: decodedData.ancestries.length,
      ancestryDetails: decodedData.ancestryDetails.length,
      breakthroughs: decodedData.breakthroughs.length,
      keywords: decodedData.keywords.length,
    },
    files: {
      raw: path.relative(OUTPUT_ROOT, RAW_DIR),
      decoded: path.relative(OUTPUT_ROOT, DECODED_DIR),
      joined: path.relative(OUTPUT_ROOT, JOINED_DIR),
      siteSnapshots: "site_snapshots.json",
      readme: "README.md",
    },
    joinedHighlights: {
      classDetailsResolved: joinedData.classDetailsResolved.length,
      monsterDetailsResolved: joinedData.monsterDetailsResolved.length,
      primaryRaceDetailsResolved: joinedData.primaryRaceDetailsResolved.length,
      ancestryDetailsResolved: joinedData.ancestryDetailsResolved.length,
    },
    siteSnapshots,
  };
}

async function writeSectionFiles(rootDir, data) {
  for (const [key, value] of Object.entries(data)) {
    await writeJson(path.join(rootDir, `${toSnakeCase(key)}.json`), value);
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeReadme(manifest) {
  const lines = [
    "# Angel's Sword Data Pull",
    "",
    `Generated: ${manifest.generatedAt}`,
    `Latest version: ${manifest.latestVersion}`,
    "",
    "## Source URLs",
    ...Object.entries(manifest.sourceUrls).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Counts",
    ...Object.entries(manifest.counts).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Files",
    ...Object.entries(manifest.files).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Manual Index",
    ...manifest.manualIndex.map((item) => `- ${item.title}: ${item.url}`),
    "",
    "Raw files preserve the API payloads as returned by the site.",
    "Decoded files add readable `...Html` and `...Text` companion fields next to base64 HTML payloads.",
    "Joined files add resolved references for classes, monsters, primary races, and ancestries.",
  ];
  await fs.writeFile(path.join(OUTPUT_ROOT, "README.md"), `${lines.join("\n")}\n`, "utf8");
}

function toSnakeCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
