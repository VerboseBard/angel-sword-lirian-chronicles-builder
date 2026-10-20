// Task 028 checks: the Owlbear setup guide, Table Tools card and Companion
// panel describe the real public release, and the two install-link Copy
// buttons work for every visitor.
//
// What this proves:
//   1. On a NON-localhost host (the repo's own dev server bound to 127.0.0.2,
//      which Windows routes to loopback) the setup guide shows both public
//      Copy buttons enabled, no disabled "Coming Soon" button, no local block,
//      and clicking each button writes the exact manifest URL to the
//      clipboard (the page's writeText call is recorded; the real clipboard
//      is read back too when the browser allows it).
//   2. On localhost the public buttons are still there AND the local test
//      block is added with differently labelled buttons.
//   3. The stale strings are gone from source, the built app bundle (and its
//      map) and the built Owlbear extensions, and the new copy is present in
//      the built files (so a stale build cannot pass).
//
// Run:  node scripts/test-028-owlbear-copy.mjs   (npm run test:028)
// Env:  T28_PORT (default 4240; the second server uses the next port).
// Needs a fresh `npm run build` first (it checks the built bundle).
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { fork } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "qa-test-results/task-028-owlbear-copy");
await mkdir(output, { recursive: true });
const basePort = Number(process.env.T28_PORT || 4240);

const COMPANION_URL = "https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/owlbear/manifest.json";
const DICE_URL = "https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/owlbear-dice/manifest.json";

const failures = [];
let passed = 0;
const check = (name, actual, expected) => {
  try {
    assert.deepEqual(actual, expected, name);
    passed += 1;
  } catch {
    failures.push(name);
    const short = (value) => { const text = JSON.stringify(value) ?? "undefined"; return text.length > 400 ? `${text.slice(0, 400)}... (${text.length} chars)` : text; };
    console.log(`  FAIL ${name}\n       actual:   ${short(actual)}\n       expected: ${short(expected)}`);
  }
};
const section = (title) => console.log(`\n== ${title}`);
const squash = (text) => String(text || "").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Part 1: static strings in source and built files
// ---------------------------------------------------------------------------
section("Stale strings are gone from source and built files");
const STALE = [
  "Public Install Coming Soon",
  "Public release not published",
  "Planned public addresses (not deployed yet)",
  "The public extensions are not deployed yet",
  "public extension publishing and live-room verification remain",
  "arrive here automatically",
  "connect to this room automatically"
];
const DEAD_HANDLERS = ["data-owlbear-setup-guide", "owlbear-manifest\""];

async function filesIn(directory, extensions) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && extensions.includes(path.extname(entry.name)))
    .map((entry) => `${directory}/${entry.name}`);
}
const sourceFiles = [
  ...(await filesIn("src/js", [".js"])),
  ...(await filesIn("owlbear", [".js", ".html"])),
  ...(await filesIn("owlbear-dice", [".js", ".html"]))
];
const builtFiles = [
  "assets/app.bundle.js",
  "assets/app.bundle.js.map",
  ...(await filesIn("owlbear/dist", [".js"])),
  ...(await filesIn("owlbear-dice/dist", [".js"]))
];
const fileText = new Map();
for (const file of [...sourceFiles, ...builtFiles]) {
  fileText.set(file, await readFile(path.join(root, file), "utf8"));
}
for (const phrase of STALE) {
  const hits = [...fileText].filter(([, text]) => text.includes(phrase)).map(([file]) => file);
  check(`no file contains "${phrase}"`, hits, []);
}
for (const phrase of DEAD_HANDLERS) {
  const hits = [...fileText].filter(([file, text]) => (file.endsWith("ui.js") || file.endsWith("app.bundle.js")) && text.includes(phrase)).map(([file]) => file);
  check(`dead handler marker ${phrase} is removed`, hits, []);
}

section("New copy is present in the built files");
const bundle = fileText.get("assets/app.bundle.js");
for (const phrase of [
  "Public install links ready",
  "Install links (copy each one, then paste it into Add Extension):",
  "data-owlbear-copy-public-install",
  "data-owlbear-copy-public-dice-install",
  "Copy Local Test Link",
  "Copy Local Dice Test Link",
  "Companion install link copied. Paste it into Owlbear's Add Extension box.",
  "Dice install link copied. Paste it into Owlbear's Add Extension box.",
  "If a card in your Owlbear profile says localhost, it is an old test install and will not load. Add the links above instead.",
  "Share your character and dice rolls with your Owlbear Rodeo room. Your GM installs two free extensions once; you open your sheet from the room and send your character.",
  "press Open My Character Sheet to link up, then press Send Character to Room in that sheet."
]) {
  check(`app bundle contains "${phrase.slice(0, 60)}"`, bundle.includes(phrase), true);
}
const panelHtml = fileText.get("owlbear/panel.html");
check("panel.html has the corrected Open Sheet explanation", panelHtml.includes("linked to this room. Your sheet's dice rolls reach the room on their own."), true);
check("panel.html has the corrected empty-feed text", panelHtml.includes("No shared rolls yet. Open your sheet from the Character tab and roll from its Combat tab, or use the connection check."), true);
// Task 031 (owner token flow, 2026-10-18): first time = Download Token Image,
// drag the file onto the map, choose Character; later = Place My Token;
// binding is optional. These pins replace task 028's library-first wording.
check("panel.html first-session token text follows the owner's flow (download, drag onto the map, choose Character)", /<strong>First time:<\/strong> press <strong>Download Token Image<\/strong>, then drag the downloaded file onto the Owlbear map\. When Owlbear asks what kind of image it is, choose <strong>Character<\/strong> \(the sword\)\./.test(panelHtml), true);
check("panel.html later-sessions text offers Place My Token", panelHtml.includes("<strong>Later sessions:</strong> your token stays on the map in that scene. For a new scene, drag it in from your Owlbear Characters list, or press <strong>Place My Token</strong> and pick it"), true);
check("panel.html marks binding as optional", panelHtml.includes("<strong>Optional, also for GM repairs:</strong> link a token on the map to this character.") && panelHtml.includes("Rolls work without this."), true);
const OLD_PANEL_TOKEN_TEXT = [
  "add the file to your Owlbear asset library as a <strong>Character</strong>",
  "Every session after:",
  "Manual controls, mostly for GM repairs",
  "Select its Owlbear token next.",
  " Place My Token is ready.",
  "add the file to Owlbear's asset library as a Character, then press Place My Token again."
];
for (const phrase of OLD_PANEL_TOKEN_TEXT) {
  const hits = [...fileText].filter(([file, text]) => file.startsWith("owlbear/") && text.includes(phrase)).map(([file]) => file);
  check(`Companion no longer says "${phrase.slice(0, 50)}"`, hits, []);
}
check("app bundle has the owner's first-time token steps", bundle.includes("drag the file onto the Owlbear map and choose <em>Character</em> when Owlbear asks"), true);
check("app bundle no longer has the library-first token steps", bundle.includes("add the file to your Owlbear asset library as a <em>Character</em>, then press <em>Place My Token</em>"), false);
const builtPanel = fileText.get("owlbear/dist/panel.js");
check("built Companion panel.js has the corrected sheet-opened message", builtPanel.includes("Its rolls now reach this room. To bring your character here, press Send Character to Room in that sheet."), true);
check("panel.js (source) gives the owner's first-time token help when nothing is picked", fileText.get("owlbear/panel.js").includes("Drag your downloaded token onto the map first, choose Character, then try again."), true);
check("built Companion panel.js has the first-time token help", builtPanel.includes("Drag your downloaded token onto the map first, choose Character, then try again."), true);

// ---------------------------------------------------------------------------
// Servers and browser
// ---------------------------------------------------------------------------
function startServer(host, port) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(root, "scripts/server.mjs"), [], {
      env: { ...process.env, LYRIAN_HOST: host, LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" },
      silent: true
    });
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`Server on ${host}:${port} did not start.`)), 15000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = /running at (http:\/\/[^\s]+)/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve({ child, url: match[1] });
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`Server on ${host}:${port} exited early (${code}).`)));
  });
}

const OLD_CARD_TEXTS = [
  "Character binding is built; public extension publishing and live-room verification remain.",
  "straight into your Owlbear room, place it with one click"
];
const CARD_TEXT = "Share your character and dice rolls with your Owlbear Rodeo room. Your GM installs two free extensions once; you open your sheet from the room and send your character.";
const HEART_SENTENCE = "After adding each one, click the heart on its card to favorite it — every new room you create will offer it automatically. Then switch both on in the room's Extensions Manager and invite players with Owlbear's Invite Players button.";

async function openGuide(browser, serverUrl, label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const origin = new URL(serverUrl).origin;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin }).catch(() => {});
  await context.addInitScript(() => {
    // Record every clipboard write (modern API and the textarea fallback).
    window.__clipboardWrites = [];
    try {
      const original = navigator.clipboard?.writeText?.bind(navigator.clipboard);
      if (original) {
        navigator.clipboard.writeText = async (text) => {
          window.__clipboardWrites.push(String(text));
          return original(text);
        };
      }
    } catch { /* fallback listener below still records */ }
    document.addEventListener("copy", () => {
      const active = document.activeElement;
      if (active && active.tagName === "TEXTAREA") {
        window.__clipboardWrites.push(String(active.value));
      }
    }, true);
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(serverUrl, { waitUntil: "load" });
  // Seed a minimal saved character (a primary species is required before the
  // sheet opens), then reload so the app hydrates from it.
  const humanId = await page.evaluate(() =>
    (window.LYRIAN_DETAIL_DATA?.races || []).find((race) => race.name?.trim() === "Human")?.id || ""
  );
  assert.ok(humanId, "The Human species fixture could not be resolved.");
  await page.evaluate((selectedRaceId) => {
    localStorage.clear();
    localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
      ui: { mode: "builder", gameVersion: "0.13.2" },
      fields: { Name: "Install Link Test" },
      builder: { selectedRaceId }
    }));
  }, humanId);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#builder-sheet-shortcut-top") && !document.querySelector("#builder-sheet-shortcut-top").disabled);
  await page.click("#builder-sheet-shortcut-top");
  await page.waitForSelector('[data-play-mode="table"]:visible');
  await page.click('[data-play-mode="table"]:visible');
  await page.waitForSelector("#play-table-tools:not([hidden])");

  const card = page.locator('[data-table-tool-guide="owlbear"]');
  const cardInfo = {
    status: squash(await card.locator(".integration-status").textContent()),
    body: squash(await card.textContent())
  };
  await card.click();
  await page.waitForSelector("#sheet-modal:not([hidden]) .owlbear-setup-guide");
  await page.screenshot({ path: path.join(output, `${label}-setup-guide.png`), fullPage: false });
  return { context, page, cardInfo, pageErrors, origin };
}

async function buttonInfo(page) {
  return page.evaluate(() => [...document.querySelectorAll(".owlbear-setup-guide button, .owlbear-setup-guide a.sheet-modal-action")].map((node) => ({
    tag: node.tagName.toLowerCase(),
    text: node.textContent.replace(/\s+/g, " ").trim(),
    disabled: Boolean(node.disabled),
    visible: node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0,
    data: Object.keys(node.dataset).join(",")
  })));
}

async function clickAndRead(page, selector) {
  await page.evaluate(() => { window.__clipboardWrites.length = 0; });
  const block = page.locator(selector).locator("xpath=ancestor::*[@data-owlbear-install-block][1]");
  // Clear the feedback line first so we wait for THIS click's message.
  await block.locator("[data-owlbear-install-feedback]").evaluate((node) => { node.textContent = ""; });
  await page.locator(selector).click();
  await page.waitForFunction(() => window.__clipboardWrites.length >= 1, null, { timeout: 5000 });
  await block.locator("[data-owlbear-install-feedback]").evaluate((node) =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        if (node.textContent.trim()) { resolve(); return; }
        if (Date.now() - started > 5000) { reject(new Error("No install-link feedback appeared.")); return; }
        setTimeout(poll, 25);
      };
      poll();
    })
  );
  const writes = await page.evaluate(() => [...window.__clipboardWrites]);
  const feedback = squash(await block.locator("[data-owlbear-install-feedback]").textContent());
  const feedbackIsError = await block.locator("[data-owlbear-install-feedback]").evaluate((node) => node.classList.contains("is-error"));
  let realClipboard = "unavailable";
  try {
    realClipboard = await page.evaluate(() => navigator.clipboard.readText());
  } catch { /* reading may be refused outside a focused headed window */ }
  return { writes, feedback, feedbackIsError, realClipboard };
}

const servers = [];
let browser;
try {
  const publicServer = await startServer("127.0.0.2", basePort);
  servers.push(publicServer.child);
  const localServer = await startServer("127.0.0.1", basePort + 1);
  servers.push(localServer.child);
  browser = await chromium.launch();

  // -------------------------------------------------------------------------
  // Part 2: public (non-localhost) host
  // -------------------------------------------------------------------------
  section(`Public host (${publicServer.url})`);
  {
    const { context, page, cardInfo, pageErrors } = await openGuide(browser, publicServer.url, "public");
    check("host is not treated as localhost", await page.evaluate(() => /^(?:127\.0\.0\.1|localhost)$/i.test(location.hostname)), false);
    check("Table Tools Owlbear badge is exactly Alpha", cardInfo.status, "Alpha");
    check("Table Tools Owlbear card has the new text", cardInfo.body.includes(CARD_TEXT), true);
    for (const old of OLD_CARD_TEXTS) check(`card no longer says "${old.slice(0, 40)}..."`, cardInfo.body.includes(old), false);

    const guideText = squash(await page.locator(".owlbear-setup-guide").textContent());
    const buttons = await buttonInfo(page);
    const companionBtn = buttons.filter((b) => b.text === "Copy Companion Install Link");
    const diceBtn = buttons.filter((b) => b.text === "Copy Dice Install Link");
    check("one enabled visible Copy Companion Install Link button", companionBtn.map((b) => [b.tag, b.disabled, b.visible]), [["button", false, true]]);
    check("one enabled visible Copy Dice Install Link button", diceBtn.map((b) => [b.tag, b.disabled, b.visible]), [["button", false, true]]);
    check("Open Owlbear Profile link is still there", buttons.filter((b) => b.text === "Open Owlbear Profile").length, 1);
    check("no disabled button in the setup guide", buttons.filter((b) => b.disabled).map((b) => b.text), []);
    check("no Coming Soon text in the setup guide", /coming soon/i.test(guideText), false);
    check("no local test buttons on a public host", buttons.filter((b) => /Local/.test(b.text)).map((b) => b.text), []);
    check("no local install block on a public host", await page.locator('[data-owlbear-install-block="local"]').count(), 0);
    check("guide mentions no localhost address", /localhost:\d+|127\.0\.0\.\d/.test(await page.locator(".owlbear-setup-guide code").allTextContents().then((all) => all.join(" "))), false);
    check("the ready badge text includes Public install links ready", (await page.locator(".owlbear-setup-guide .table-tools-status-row .integration-status.is-ready").allTextContents()).map(squash).includes("Public install links ready"), true);
    check("install-links label", guideText.includes("Install links (copy each one, then paste it into Add Extension):"), true);
    check("both public addresses are shown as text", [guideText.includes(`Companion: ${COMPANION_URL}`), guideText.includes(`Dice: ${DICE_URL}`)], [true, true]);
    check("old-localhost-card warning is shown", guideText.includes("If a card in your Owlbear profile says localhost, it is an old test install and will not load. Add the links above instead."), true);
    check("heart/favorite sentence is unchanged (confirmed correct by the owner 2026-10-18)", guideText.includes(HEART_SENTENCE), true);
    check("not-linked room text says Send Character to Room afterwards", guideText.includes("That opens a linked copy of this sheet: check your character is loaded there, then press Send Character to Room. Dice rolls from the linked sheet reach the table on their own; your character only arrives when you send it."), true);
    // Task 031 (owner token flow, 2026-10-18) replaced 028's library-first steps.
    check("token text: first time / later sessions / optional bind", guideText.includes("First time: press Download Token Image, drag the file onto the Owlbear map and choose Character when Owlbear asks. Your token is on the map and saved in your Owlbear Characters list. Later sessions: it stays in that scene; for a new scene drag it in from your Characters list or press Place My Token. Bind Selected Token (optional) links a token on the map to this character."), true);
    check("token text: the library-first steps are gone", guideText.includes("add the file to your Owlbear asset library"), false);
    check("token small print", guideText.includes("Fallback: import a Character JSON or an official .aschar.json with Choose File in the panel. The Angel Sword extensions don't track damage, movement, conditions or initiative yet."), true);
    check("Players never install anything is kept", guideText.includes("Players never install anything — they just join your room."), true);

    const companion = await clickAndRead(page, "[data-owlbear-copy-public-install]");
    check("Companion copy writes exactly the Companion manifest URL", companion.writes, [COMPANION_URL]);
    check("Companion copy feedback", companion.feedback, "Companion install link copied. Paste it into Owlbear's Add Extension box.");
    check("Companion copy feedback is not an error", companion.feedbackIsError, false);
    check("real clipboard (when readable) holds the Companion URL", companion.realClipboard === "unavailable" ? COMPANION_URL : companion.realClipboard, COMPANION_URL);

    const dice = await clickAndRead(page, "[data-owlbear-copy-public-dice-install]");
    check("Dice copy writes exactly the Dice manifest URL", dice.writes, [DICE_URL]);
    check("Dice copy feedback", dice.feedback, "Dice install link copied. Paste it into Owlbear's Add Extension box.");
    check("Dice copy feedback is not an error", dice.feedbackIsError, false);
    check("real clipboard (when readable) holds the Dice URL", dice.realClipboard === "unavailable" ? DICE_URL : dice.realClipboard, DICE_URL);
    console.log(`  (real clipboard readback: Companion ${companion.realClipboard === "unavailable" ? "not readable here" : "read OK"}, Dice ${dice.realClipboard === "unavailable" ? "not readable here" : "read OK"})`);

    check("no page errors on the public host", pageErrors, []);
    await page.screenshot({ path: path.join(output, "public-after-copy.png") });
    await context.close();
  }

  // -------------------------------------------------------------------------
  // Part 3: localhost
  // -------------------------------------------------------------------------
  section(`Localhost (${localServer.url})`);
  {
    const { context, page, cardInfo, pageErrors } = await openGuide(browser, localServer.url, "localhost");
    const localManifest = `http://localhost:${new URL(localServer.url).port}/owlbear/manifest.json`;
    const localDiceManifest = `http://localhost:${new URL(localServer.url).port}/owlbear-dice/manifest.json`;
    check("host is localhost", await page.evaluate(() => /^(?:127\.0\.0\.1|localhost)$/i.test(location.hostname)), true);
    check("Table Tools Owlbear badge is exactly Alpha", cardInfo.status, "Alpha");
    check("Table Tools Owlbear card text is the same on localhost", cardInfo.body.includes(CARD_TEXT), true);
    const buttons = await buttonInfo(page);
    const labels = buttons.map((b) => b.text);
    check("public buttons are present exactly once each", [labels.filter((t) => t === "Copy Companion Install Link").length, labels.filter((t) => t === "Copy Dice Install Link").length], [1, 1]);
    check("relabelled local buttons are present exactly once each", [labels.filter((t) => t === "Copy Local Test Link").length, labels.filter((t) => t === "Copy Local Dice Test Link").length], [1, 1]);
    check("every install button is enabled and visible", buttons.filter((b) => /Copy /.test(b.text)).every((b) => !b.disabled && b.visible), true);
    check("no disabled button on localhost", buttons.filter((b) => b.disabled).map((b) => b.text), []);
    check("local block exists once", await page.locator('[data-owlbear-install-block="local"]').count(), 1);
    check("public block exists once", await page.locator('[data-owlbear-install-block="public"]').count(), 1);

    const publicCompanion = await clickAndRead(page, "[data-owlbear-copy-public-install]");
    check("localhost: public Companion button still copies the public URL", publicCompanion.writes, [COMPANION_URL]);
    check("localhost: public Companion feedback", publicCompanion.feedback, "Companion install link copied. Paste it into Owlbear's Add Extension box.");
    const publicDice = await clickAndRead(page, "[data-owlbear-copy-public-dice-install]");
    check("localhost: public Dice button still copies the public URL", publicDice.writes, [DICE_URL]);
    const localCompanion = await clickAndRead(page, "[data-owlbear-copy-local-install]");
    check("localhost: Copy Local Test Link copies the local Companion manifest", localCompanion.writes, [localManifest]);
    check("localhost: local Companion feedback names it as a local test link", localCompanion.feedback, "Local Companion test link copied. Keep this builder server running while Owlbear loads it.");
    const localDice = await clickAndRead(page, "[data-owlbear-copy-local-dice-install]");
    check("localhost: Copy Local Dice Test Link copies the local Dice manifest", localDice.writes, [localDiceManifest]);
    check("localhost: local Dice feedback names it as a local test link", localDice.feedback, "Local Dice test link copied. Keep this builder server running while Owlbear loads it.");
    check("no page errors on localhost", pageErrors, []);
    await page.screenshot({ path: path.join(output, "localhost-after-copy.png") });
    await context.close();
  }
} finally {
  await browser?.close().catch(() => {});
  for (const child of servers) {
    child.kill();
  }
}

console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.log(`Failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("Task 028 checks: PASS");
