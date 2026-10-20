// Task 045 checks: the fixes from the 040 pre-release gate, wave 2 (Sonnet and
// Haiku audits).
//
// What this proves:
//   R. The rule text the scope fix rests on is in the repo's 0.13.2 item data,
//      word for word.
//   A. Sniper Rifle scope (fix 1), through the real app in a browser. The scope's
//      +10 Perception holds only "when looking at things further than 60ft away",
//      so it is left out of the totals, as the builder does for its other
//      conditional bonuses. A Catfolk Scout Sniper Quick Build reads Perception
//      +23 (it read +33). Equipped or not, the rifle changes no number; its own
//      rules text, with the scope sentence, is still on the character. Every
//      unconditional "gives ... bonus to" text in all five rules versions (the
//      shields, the armor material table, Bone Armor, Windflow) still counts as
//      before.
//   B. provenance.json (fix 2): no machine path, repo-relative source files that
//      exist in the repo, and every recorded SHA-256 matches the file it names.
//   C. The crafting line of the Latest update list (fix 3).
//   D. Docs (fix 4): README run steps, the public script's wording, and the
//      real label for the export card, which every doc must quote correctly.
//   E. Status pills in the cream guide boxes (fix 6) are readable (7:1 or better);
//      the same pills on the dark Table Tools cards are unchanged.
//   F. The compat suite's browser mode (fix 5) reads each sheet's own default
//      rules version and copes with the hidden top shortcut. (The suite itself is
//      run for real against the live export; this part pins the two lines.)
//   G. The owner's email is not in the internal evidence file (fix 7).
//
// The real src/js is bundled in memory with a test-only hook block appended to
// ui.js (the test-030/043/044 pattern); nothing in the shipped source is altered.
//
// Run:  npm run test:045   (builds first)
// Env:  T45_PORT (default 4490); T45_SRC=<folder with src/js, index.html, src/css
//       and the repo text files> runs against another source tree (used to show
//       the old code fails); T45_ONLY=A,E limits parts.
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, readFile, readdir, writeFile, access } from "node:fs/promises";
import { fork } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.env.T45_SRC ? path.resolve(process.env.T45_SRC) : root;
const output = path.join(root, "qa-test-results/task-045-gate-wave2-fixes");
await mkdir(output, { recursive: true });
const port = Number(process.env.T45_PORT || 4490);
const url = `http://localhost:${port}/`;
const only = (process.env.T45_ONLY || "").split(",").map((entry) => entry.trim().toUpperCase()).filter(Boolean);
const wants = (part) => !only.length || only.includes(part);

const failures = [];
let passed = 0;
const check = (name, actual, expected) => {
  try {
    assert.deepEqual(actual, expected, name);
    passed += 1;
  } catch {
    failures.push(name);
    const short = (value) => { const text = JSON.stringify(value) ?? "undefined"; return text.length > 600 ? `${text.slice(0, 600)}... (${text.length} chars)` : text; };
    if (failures.length <= 80) {
      console.log(`  FAIL ${name}\n       actual:   ${short(actual)}\n       expected: ${short(expected)}`);
    }
  }
};
const section = (title) => console.log(`\n== ${title}`);
const results = {};
const exists = (file) => access(file).then(() => true, () => false);
// Text files in a Windows work tree use CRLF; the committed bytes (and every
// recorded hash) use LF. Hash the LF form so the check holds in both.
const sha256Lf = async (file) => crypto.createHash("sha256").update((await readFile(file, "latin1")).replace(/\r\n/g, "\n"), "latin1").digest("hex");

const SCOPE_TEXT = "Snipe: Looking through a sniper scope gives you a +10 bonus to Perception when looking at things further than 60ft away.";

// ---------------------------------------------------------------------------
// Test-only hooks, appended to ui.js in the in-memory bundle.
// ---------------------------------------------------------------------------
const hooks = `
window.__t45 = {
  effects(text) {
    const bucket = createComputedBonusBucket();
    collectComputedTextBonuses(bucket, "T", text);
    return JSON.parse(JSON.stringify({
      skillChecks: bucket.skillChecks,
      derived: Object.fromEntries(Object.entries(bucket.derived).filter(([, value]) => value)),
      autoApplied: bucket.autoApplied
    }));
  },
  quick(speciesId, buildId) {
    window.confirm = () => true;
    const click = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error("missing " + selector);
      element.click();
    };
    clearSheet();
    click("#quick-build-entry");
    click('[data-quick-build-action="select-species"][data-id="' + speciesId + '"]');
    click("#builder-next");
    const nameInput = document.getElementById("builder-name-header");
    if (nameInput) { nameInput.value = "T45 " + speciesId + " " + buildId; nameInput.dispatchEvent(new Event("input", { bubbles: true })); }
    click("#builder-next");
    click('[data-quick-build-action="select-build"][data-id="' + buildId + '"]');
    click("#builder-next");
    click("#builder-next"); // Use This Character
    return { mode: state.ui.mode };
  },
  perception() {
    const index = SKILL_DEFINITIONS.findIndex((definition) => definition.name === "Perception") + 1;
    const row = getSkillRowData(index);
    return {
      total: row.total,
      feature: row.bonusValue,
      awareness: row.substatValue,
      points: row.skillPoints,
      computed: getComputedBonuses().skillChecks.Perception || 0
    };
  },
  rifle() {
    const entry = (state.play.inventoryItems || []).find((item) => /sniper rifle/i.test(mergeInventoryEntryWithRecord(item).name));
    if (!entry) return null;
    const merged = mergeInventoryEntryWithRecord(entry);
    return { uid: entry.uid, name: merged.name, equipped: Boolean(entry.equipped), text: getBaseItemRulesText(merged) };
  },
  setEquipped(uid, wanted) {
    const entry = (state.play.inventoryItems || []).find((item) => item.uid === uid);
    if (!entry) throw new Error("no item " + uid);
    if (Boolean(entry.equipped) !== wanted) toggleInventoryEquipped(uid);
    return Boolean(entry.equipped);
  },
  sheetText() {
    state.ui.mode = "sheet";
    renderPlayDashboard();
    return document.body.textContent.replace(/\\s+/g, " ");
  },
  // --- E: status pills ------------------------------------------------------
  contrastOf(selectorList) {
    const parse = (value) => {
      const m = value.match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(",").map((part) => parseFloat(part));
      return { r, g, b, a };
    };
    const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (one, two) => { const a = lum(one), b = lum(two); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
    // The modal card paints a dark blue gradient; its first stop is the base.
    const base = { r: 7, g: 26, b: 58, a: 1 };
    return [...document.querySelectorAll(selectorList)].map((node) => {
      const layers = [];
      for (let el = node; el; el = el.parentElement) {
        const color = parse(getComputedStyle(el).backgroundColor);
        if (color && color.a > 0) { layers.push(color); if (color.a >= 1) break; }
      }
      let background = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : base;
      while (layers.length) background = over(layers.pop(), background);
      const style = getComputedStyle(node);
      const text = parse(style.color);
      return {
        text: node.textContent.trim(),
        classes: node.className,
        color: style.color,
        ratio: Math.round(ratio(over(text, background), background) * 100) / 100,
        visible: node.getBoundingClientRect().width > 0
      };
    });
  },
  openGuide(name) {
    state.ui.mode = "sheet";
    const guides = {
      owlbear: openOwlbearSetupGuide,
      roll20: openRoll20BridgeSetupModal,
      foundry: openFoundrySetupGuide,
      worldanvil: openWorldAnvilSetupGuide,
      official: openOfficialBuilderGuide
    };
    guides[name]();
    return document.querySelectorAll("#sheet-modal-content .integration-status").length;
  },
  // The app has no is-live pill today; the style exists, so measure a stand-in.
  addLivePill() {
    const box = document.querySelector("#sheet-modal-content .sheet-modal-success");
    const pill = document.createElement("span");
    pill.className = "integration-status is-live";
    pill.textContent = "Stand-in live pill";
    box.insertBefore(pill, box.firstChild);
    return true;
  },
  closeModal() { closeSheetModal(); },
  showTableTools() {
    state.ui.mode = "sheet";
    renderPlayDashboard();
    const tab = document.querySelector('[data-play-mode="table"]');
    if (tab) tab.click();
    return document.querySelectorAll(".table-tools-hero .integration-status").length;
  }
};`;

const bundle = await build({
  absWorkingDir: sourceRoot,
  entryPoints: ["src/js/main.js"], bundle: true, write: false, format: "iife",
  target: ["es2020", "safari15"], logLevel: "silent",
  plugins: [{ name: "task045-test-access", setup(buildApi) {
    buildApi.onLoad({ filter: /[/\\]src[/\\]js[/\\]ui\.js$/ }, async ({ path: file }) => ({
      contents: await readFile(file, "utf8") + hooks, loader: "js"
    }));
  } }]
});
const bundleText = bundle.outputFiles[0].text;
const sourceIndex = await readFile(path.join(sourceRoot, "index.html"), "utf8");
const sourceCss = await readFile(path.join(sourceRoot, "src/css/main.css"), "utf8");

const server = fork(path.join(root, "scripts/server.mjs"), [], {
  cwd: root, env: { ...process.env, LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" }, silent: true
});
let serverLog = "";
server.stdout.on("data", (data) => { serverLog += data; });
server.stderr.on("data", (data) => { serverLog += data; });
let browser;
const pageErrors = [];
try {
  // -------------------------------------------------------------------------
  if (wants("R")) {
    section("R. The rule text (0.13.2 data in the repo)");
    const items = JSON.parse(await readFile(path.join(root, "data/angelssword/decoded/item_details.json"), "utf8"));
    const rifle = items.find((entry) => entry.name === "Sniper Rifle (Two-Handed)");
    check("R: the 0.13.2 item data has the Sniper Rifle (Two-Handed)", Boolean(rifle), true);
    check("R: its scope text is conditional on distance", String(rifle?.descriptionText || "").includes(SCOPE_TEXT), true);
    const quote = "+10 bonus to Perception when looking at things further than 60ft away";
    check("R: the quoted rule words are in the item text", String(rifle?.descriptionText || "").includes(quote), true);
  }

  // -------------------------------------------------------------------------
  if (wants("B")) {
    section("B. docs/offline-reference/provenance.json (fix 2)");
    const dir = path.join(sourceRoot, "docs/offline-reference");
    const text = await readFile(path.join(dir, "provenance.json"), "utf8");
    const provenance = JSON.parse(text);
    check("B: no drive letter path anywhere in the file", /[A-Za-z]:[\\/]/.test(text), false);
    check("B: no backslash and no scratch folder name", [text.includes("\\"), /tmp_official_site|api-attempt/i.test(text), /Users[\\/]/i.test(text)], [false, false, false]);
    const named = [...provenance.sections.map((entry) => ({ file: entry.sourceFile, sha: entry.sourceSha256 })), { file: provenance.keywordsSourceFile, sha: provenance.keywordsSourceSha256 }];
    check("B: four source files are named (rulebook, campaign guide, patch notes, keywords)", named.map((entry) => entry.file), [
      "data/angelssword/decoded/rulebook.json", "data/angelssword/decoded/settings_guide.json",
      "data/angelssword/decoded/patch_notes.json", "data/angelssword/decoded/keywords.json"
    ]);
    for (const entry of named) {
      const file = path.join(root, entry.file);
      check(`B: ${entry.file} is a repo path that exists`, await exists(file), true);
      check(`B: ${entry.file} matches its recorded SHA-256`, (await exists(file)) ? await sha256Lf(file) : "missing", entry.sha);
    }
    check("B: the rules page matches the recorded output SHA-256", await sha256Lf(path.join(dir, "RULES_0.13.2.html")), provenance.outputSha256);
    check("B: the keyword count is unchanged", provenance.keywords, 92);
    check("B: the three sections are unchanged", provenance.sections.map((entry) => entry.section), ["rulebook", "settings_guide", "patch_notes"]);
    // The publish step copies this folder as it is; nothing reads the path fields.
    const readers = [];
    for (const folder of ["src/js", "scripts", "owlbear", "owlbear-dice"]) {
      const walk = async (dirPath) => {
        for (const entry of await readdir(dirPath, { withFileTypes: true }).catch(() => [])) {
          const full = path.join(dirPath, entry.name);
          if (entry.isDirectory()) { if (entry.name !== "node_modules" && entry.name !== "dist") await walk(full); }
          else if (/\.(mjs|js|html)$/.test(entry.name) && !/test-045/.test(entry.name)) {
            const body = await readFile(full, "utf8");
            if (/keywordsSourceFile|"sourceFile"|\.sourceFile\b/.test(body) && /provenance/.test(body)) readers.push(path.relative(root, full));
          }
        }
      };
      await walk(path.join(root, folder));
    }
    check("B: no script or page in the repo reads the provenance path fields", readers, []);
  }

  // -------------------------------------------------------------------------
  if (wants("C")) {
    section("C. The crafting line of the Latest update list (fix 3)");
    const notes = await import(pathToFileURL(path.join(sourceRoot, "src/js/release-notes.js")).href);
    const list = [...notes.APP_RELEASE_NOTES];
    check("C: the summary is unchanged (the owner's words)", notes.APP_RELEASE_SUMMARY, "Multiple dice sets, Owlbear Rodeo connection, quality-of-life improvements.");
    check("C: the list still has 23 lines", list.length, 23);
    check("C: the crafting line says each basic craft roll", list.filter((line) => /^Crafting basics/.test(line)), ["Crafting basics now follow the 0.13.2 rulebook: 5 dice, your skill on each basic craft roll, crafting HP to succeed."]);
    check("C: no crafting line says 'every roll'", list.filter((line) => /crafting/i.test(line) && /every roll/i.test(line)), []);
  }

  // -------------------------------------------------------------------------
  if (wants("D")) {
    section("D. Docs (fix 4)");
    const read = (name) => readFile(path.join(sourceRoot, name), "utf8").catch(() => "");
    const readme = await read("README.md");
    check("D: README no longer sends readers to the old candidate folder or port 4177", [/4177/.test(readme), /Angel Sword Patch Candidate/i.test(readme), /Run this local candidate/i.test(readme), /E:\\/.test(readme)], [false, false, false, false]);
    check("D: README gives the current run steps", [readme.includes("## Run it locally"), readme.includes("npm ci"), readme.includes("npm start"), readme.includes("http://localhost:4176/"), readme.includes("npm run build"), readme.includes("Commit `index.html` together with the bundle.")], [true, true, true, true, true, true]);
    check("D: README keeps its validation section", readme.includes("## Required validation") && readme.includes("`npm test`"), true);
    const script = await read("docs/owlbear-gm-video-walkthrough.md");
    check("D: the public script has no 'stage-2 push' wording", /stage[- ]2 push/i.test(script), false);
    check("D: step 1 still opens the public builder with a saved character", script.includes("Open the [public character builder](https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/) with an existing player demonstration character in character-sheet view."), true);
    const outline = await read("docs/owlbear-tutorial-recording-outline.md");
    check("D: the owner's outline keeps the meaning (local build before the stage-2 push, public site after)", outline.includes("**Which builder:** before the stage-2 push, `npm start` in the Beta 2.5 Online worktree"), true);
    // The export card's real label (src/js/ui.js), and no doc may say otherwise.
    const ui = await read("src/js/ui.js");
    check("D: the app card is titled 'Save, Load, Export, or Import' and has an Export Character button", [ui.includes("<h3>Save, Load, Export, or Import</h3>"), ui.includes('data-table-tool-action="export">Export Character</button>')], [true, true]);
    const docNames = (await readdir(path.join(sourceRoot, "docs")).catch(() => [])).filter((name) => name.endsWith(".md")).map((name) => `docs/${name}`);
    const wrong = [];
    for (const name of [...docNames, "OWNER_PHYSICAL_CHECKLIST.md", "README.md", "VERSION.txt", "README - Beta Testers.txt"]) {
      if (/Table Tools\s*(?:→|->)\s*Character Files/.test(await read(name))) wrong.push(name);
    }
    check("D: no doc says 'Table Tools -> Character Files'", wrong, []);
    const tutorial = await read("docs/owlbear-gm-setup-tutorial.md");
    const checklist = await read("OWNER_PHYSICAL_CHECKLIST.md");
    check("D: the setup page names the real card", /open \*\*Table Tools\*\*\. Under\s+\*\*Save, Load, Export, or Import\*\*, press \*\*Export Character\*\*/.test(tutorial), true);
    check("D: the owner checklist names the real card", /open \*\*Table Tools\*\*\. Under \*\*Save, Load, Export, or Import\*\*, press\s+\*\*Export Character\*\*/.test(checklist), true);
  }

  // -------------------------------------------------------------------------
  if (wants("F")) {
    section("F. Compat suite, browser mode (fix 5): the two stale lines");
    const suite = await readFile(path.join(sourceRoot, "scripts/test-patch-owlbear-compat.mjs"), "utf8");
    check("F: the older sheet's default is no longer hard-coded to 0.13.1", /sheetLane\.name === 'candidate' \? '0\.13\.2' : '0\.13\.1'/.test(suite), false);
    check("F: each sheet's default comes from its own assets/versions/manifest.json", suite.includes("path.join(sheetLane.root, 'assets/versions/manifest.json')") && suite.includes(".defaultVersion"), true);
    check("F: the hidden top shortcut is handled (it is hidden on the Review step)", suite.includes("if (await sheet.locator('#builder-sheet-shortcut-top').isVisible())") && suite.includes("else await sheet.locator('#builder-next').click();"), true);
    // The manifests the suite will read really name a default.
    for (const file of ["assets/versions/manifest.json"]) {
      const manifest = JSON.parse(await readFile(path.join(root, file), "utf8"));
      check("F: this tree's manifest names a default rules version", /^\d+\.\d+\.\d+$/.test(manifest.defaultVersion), true);
    }
  }

  // -------------------------------------------------------------------------
  if (wants("G")) {
    section("G. The owner's email in the internal evidence file (fix 7)");
    const evidence = path.join(sourceRoot, "BETA_2.5_TASKS/reports/020-owlbear-localhost-install-evidence.json");
    if (await exists(evidence)) {
      const text = await readFile(evidence, "utf8");
      check("G: the file is still valid JSON", (() => { try { JSON.parse(text); return true; } catch { return false; } })(), true);
      check("G: no e-mail address is left in the file", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text), false);
      check("G: both places say <owner email>", text.split("<owner email>").length - 1, 2);
    } else {
      console.log("  (internal record not present in this tree; part G skipped)");
    }
  }

  // ---- browser parts (A, E) -------------------------------------------------
  if (wants("A") || wants("E")) {
    for (let retry = 0; ; retry++) {
      if (/running at/.test(serverLog)) {
        try { if ((await fetch(url)).ok) break; } catch {}
      }
      if (retry === 120 || server.exitCode !== null) throw new Error(`Test server failed: ${serverLog}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route("**/assets/app.bundle.js*", (route) => route.fulfill({ contentType: "application/javascript", body: bundleText }));
    await context.route("**/src/css/main.css*", (route) => route.fulfill({ contentType: "text/css; charset=utf-8", body: sourceCss }));
    await context.route(/\/index\.html(\?.*)?$|\/(\?.*)?$/, (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.pathname === "/" || requestUrl.pathname.endsWith("/index.html")) {
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: sourceIndex });
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    const freshPage = async () => {
      await page.goto(url, { waitUntil: "load" });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction(() => window.__t45 && window.LYRIAN_DATA?.version === "0.13.2" && (document.getElementById("builder-step-content")?.innerHTML || "").length > 100, null, { timeout: 30000 });
      await page.waitForTimeout(1600); // the production idle sheet build
    };
    const call = (name, ...args) => page.evaluate(([fn, list]) => window.__t45[fn](...list), [name, args]);

    // -----------------------------------------------------------------------
    if (wants("A")) {
      section("A. Sniper Rifle scope (fix 1)");
      await freshPage();
      const scope = await call("effects", SCOPE_TEXT);
      check("A: the scope sentence adds nothing to any skill", scope.skillChecks, {});
      check("A: ...and nothing to any other number", [scope.derived, scope.autoApplied], [{}, []]);

      // The real item text from the shipped 0.13.2 data, not a typed copy.
      await call("quick", "catfolk", "scout-sniper-path");
      const rifle = await call("rifle");
      check("A: the Scout Sniper build carries the Sniper Rifle (Two-Handed)", [rifle?.name, rifle?.equipped], ["Sniper Rifle (Two-Handed)", true]);
      check("A: the rifle's own text still holds the scope sentence", String(rifle?.text || "").includes(SCOPE_TEXT), true);
      const itemEffects = await call("effects", rifle?.text || "");
      check("A: the item text, run through the same parser, adds no Perception", itemEffects.skillChecks, {});

      const equipped = await call("perception");
      check("A: Catfolk Scout Sniper: no feature bonus on Perception from the scope", equipped.feature, 0);
      check("A: Catfolk Scout Sniper: Perception is Awareness + skill points only (+23, was +33)", [equipped.total, equipped.awareness + equipped.points], [23, 23]);
      await call("setEquipped", rifle.uid, false);
      const unequipped = await call("perception");
      check("A: unequipping the rifle changes no Perception number", unequipped, equipped);
      await call("setEquipped", rifle.uid, true);
      check("A: equipping it again changes none either", await call("perception"), equipped);
      const sheet = await call("sheetText");
      check("A: the play sheet still shows the scope's own rules text (the note)", sheet.includes("looking at things further than 60ft away"), true);
      results.sniper = { equipped, unequipped, ruleText: rifle.text.slice(0, 160) };

      // Unconditional "gives ... bonus" texts still count, exactly as before.
      const shield = await call("effects", "Gives a +4 Shield bonus to your Block.\nMods\nA mods: Spiked Shield (20 points): You may treat your shield as a One-Handed weapon.");
      check("A: 'Gives a +4 Shield bonus to your Block.' still adds 4 Block", [shield.derived, shield.autoApplied], [{ block: 4 }, ["T: +4 Block."]]);
      const buckler = await call("effects", "Gives a +1 Shield bonus to your guard, but a -1 penalty to your Initiative and a -2 penalty to your Evasion and Dodge. When taking the Block action, this Shield bonus is increased to 8.");
      check("A: the Great Shield text keeps its guard bonus and penalties", buckler.derived, { guard: 1, evasion: -2, initiative: -1, dodge: -2, block: 8 });
      const bone = await call("effects", "You target and destroy a corpse within range to give yourself Bone Armor, which gives you a +2 bonus to your guard. Bone Armor lasts until the end of the encounter or until you take 2 or more damage from an attack.");
      check("A: a bonus that is not tied to a condition in its own sentence is not touched (Bone Armor +2 guard)", bone.derived, { guard: 2 });
      const wind = await call("effects", "Each stack of Windflow gives a +5 Windflow bonus to your movement speed. These stacks last until the end of the encounter or until you end your turn without having moved.");
      check("A: Windflow +5 speed is not touched", wind.derived, { speed: 5 });
      const other = await call("effects", "A sniper scope gives you a +10 Scope bonus to Perception.");
      check("A: the same words without a condition still count (+10 Perception)", other.skillChecks, { Perception: 10 });
      const during = await call("effects", "While you wear this cloak it gives you a +5 bonus to Stealth.");
      check("A: a 'while ...' gives-bonus is left out like the other conditional passes", during.skillChecks, {});

      // Every text in every rules version that has a "gives ... bonus to" clause.
      const corpus = new Map();
      const versions = (await readdir(path.join(root, "assets/versions"), { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^\d/.test(entry.name)).map((entry) => entry.name);
      const givesRe = /\bgives(?:\s+(?:you|the wearer|the armor they are attached to|this armor))?\s+(?:a\s+)?([-+]\d+)\s+(?:[a-z]+\s+){0,3}?bonus\s+to\s+(?:your\s+)?([^.\n]+)/i;
      const collect = (value) => {
        if (typeof value === "string") { if (value.length > 12 && givesRe.test(value)) corpus.set(value, true); }
        else if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === "object") Object.values(value).forEach(collect);
      };
      for (const version of versions) {
        for (const file of ["lyrian-data.js", "lyrian-detail-data.js"]) {
          const sandbox = {}; sandbox.window = sandbox; vm.createContext(sandbox);
          vm.runInContext(await readFile(path.join(root, "assets/versions", version, file), "utf8"), sandbox);
          collect(sandbox.LYRIAN_DATA || sandbox.LYRIAN_DETAIL_DATA);
        }
      }
      const texts = [...corpus.keys()];
      const swept = await page.evaluate((list) => list.map((text) => window.__t45.effects(text)), texts);
      check(`A: sweep found the gives-bonus texts in ${versions.length} rules versions (19 distinct)`, texts.length, 19);
      check("A: sweep: after the fix, no text in any rules version adds a skill check from a 'gives' clause", swept.filter((entry) => Object.keys(entry.skillChecks).length).length, 0);
      const scopeTexts = texts.filter((text) => /sniper scope/i.test(text));
      check("A: sweep: the scope text is in the data (5 versions share it as 2 distinct strings)", scopeTexts.length, 2);
      // Everything else sums to the same totals as before the fix (measured on the old code).
      const totals = {};
      swept.forEach((entry) => { for (const [key, value] of Object.entries(entry.derived)) totals[key] = (totals[key] || 0) + value; });
      check("A: sweep: the derived totals of all 19 texts are as before the fix", totals, { guard: 20, evasion: 6, dodge: 0, block: 96, initiative: -3, speed: 20 });
    }

    // -----------------------------------------------------------------------
    if (wants("E")) {
      section("E. Status pills in the cream guide boxes (fix 6)");
      await freshPage();
      await call("quick", "human", "gunslinger");
      const darkCount = await call("showTableTools");
      check("E: the Table Tools cards show their status pills", darkCount > 0, true);
      const dark = await call("contrastOf", ".table-tools-hero .integration-status, .table-tool-card .integration-status");
      const darkColors = [...new Set(dark.map((entry) => entry.color))].sort();
      check("E: the pills on the dark Table Tools cards keep their original colors", darkColors, ["rgb(159, 243, 201)", "rgb(255, 196, 174)", "rgb(255, 229, 154)"]);
      const guides = [["owlbear", 3], ["roll20", 3], ["foundry", 3], ["worldanvil", 2], ["official", 3]];
      const kinds = new Set();
      results.pills = {};
      for (const [name, expected] of guides) {
        const count = await call("openGuide", name);
        check(`E: the ${name} guide shows its ${expected} status pills`, count, expected);
        const pills = await call("contrastOf", "#sheet-modal-content .integration-status");
        for (const pill of pills) {
          kinds.add(pill.classes.replace("integration-status", "").trim() || "plain");
          check(`E: ${name} guide: "${pill.text}" is visible`, pill.visible, true);
          check(`E: ${name} guide: "${pill.text}" (${pill.classes.replace("integration-status", "").trim() || "plain"}) reads at 7:1 or better on the cream box (got ${pill.ratio})`, pill.ratio >= 7, true);
        }
        results.pills[name] = pills;
        if (name === "owlbear") {
          check("E: the Owlbear guide pills are the three Haiku named (the middle one follows the room link)", [pills[0]?.text, pills[2]?.text], ["Alpha connection", "Public install links ready"]);
          await page.screenshot({ path: path.join(output, "owlbear-guide-pills.png") });
          // Same box, with the pills in the "linked" state too is not reachable here (no room), so the
          // stand-in below covers the one style the app does not use today.
          await call("addLivePill");
          const live = (await call("contrastOf", "#sheet-modal-content .integration-status.is-live"))[0];
          kinds.add("is-live");
          check(`E: a stand-in is-live pill reads at 7:1 or better on the cream box (got ${live?.ratio})`, (live?.ratio || 0) >= 7, true);
        }
        await call("closeModal");
      }
      check("E: the guides covered all four pill kinds (plain, is-ready, is-warn, is-live)", [...kinds].sort(), ["is-live", "is-ready", "is-warn", "plain"]);
    }

    check("No uncaught browser JavaScript errors", pageErrors, []);
  }

  console.log(`\n${passed} passed, ${failures.length} failed. Evidence: ${output}`);
  await writeFile(path.join(output, "results.json"), JSON.stringify({ passed, failed: failures.length, failures, results }, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: error.stack, failures, serverLog }, null, 2));
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
