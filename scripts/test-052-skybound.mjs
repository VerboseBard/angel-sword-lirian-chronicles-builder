import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = process.env.LYRIAN_052_SKYBOUND_OUT || path.join(root, "qa-test-results", "task-052-skybound");
const port = Number(process.env.LYRIAN_052_SKYBOUND_PORT || 4579);
const origin = "http://127.0.0.1:" + port;
const latest = "0.13.3";
const older = "0.13.2";
const workingKey = "lyrian-chronicles-character-suite-v2";
const fixture = JSON.parse(await readFile(path.join(root, "tests/fixtures/043-live-3346d32/human-sneak-thief-standard-used.json"), "utf8"));
const app = path.join(root, "assets/app.bundle.js");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const appHash = digest(await readFile(app));
const checks = [];
const issues = { errors: [], external: [], localFailures: [] };
let browser, context, page, server;
let serverLog = "";

function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  checks.push({ name, actual });
  console.log("PASS " + name);
}

await mkdir(output, { recursive: true });
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
});

try {
  server = fork(path.join(root, "scripts/server.mjs"), [], {
    cwd: root, env: { ...process.env, LYRIAN_HOST: "127.0.0.1", LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" }, silent: true,
  });
  server.stdout.on("data", chunk => { serverLog += chunk; });
  server.stderr.on("data", chunk => { serverLog += chunk; });
  for (let n = 0; !serverLog.includes("http://localhost:" + port + "/"); n++) {
    if (n === 80 || server.exitCode !== null) throw new Error("Loopback server failed: " + serverLog);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", acceptDownloads: true });
  await context.route("**/*", route => {
    const url = route.request().url();
    if (new URL(url).origin === origin) return route.continue();
    issues.external.push(url);
    return route.abort("blockedbyclient");
  });
  page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("pageerror", error => issues.errors.push(error.message));
  page.on("response", response => {
    if (new URL(response.url()).origin === origin && response.status() >= 400) {
      issues.localFailures.push([response.status(), response.url()]);
    }
  });
  const served = page.waitForResponse(response => new URL(response.url()).pathname === "/assets/app.bundle.js");
  await page.goto(origin, { waitUntil: "load" });
  check("served production app bundle matches candidate SHA-256", digest(await (await served).body()), appHash);

  const state = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), workingKey);
  const values = snapshot => [
    Number(snapshot.fields["Spirit Core"]), Number(snapshot.fields.Exp),
    snapshot.play.skyboundTrial?.heldExp || 0, snapshot.play.skyboundTrial?.completed === true,
  ];
  const waitValues = expected => page.waitForFunction(({ key, expected }) => {
    const current = JSON.parse(localStorage.getItem(key) || "null");
    return !!current && Number(current.fields["Spirit Core"]) === expected[0]
      && Number(current.fields.Exp) === expected[1]
      && (current.play.skyboundTrial?.heldExp || 0) === expected[2]
      && (current.play.skyboundTrial?.completed === true) === expected[3];
  }, { key: workingKey, expected });
  const status = text => page.waitForFunction(value => ["status-pill", "builder-status-pill"]
    .some(id => document.getElementById(id)?.textContent?.includes(value)), text);
  const seed = async ({ core, bank, version = latest, campaign = "standard", breakthroughPoolUnused = false, crafting }) => {
    const save = structuredClone(fixture);
    save.fields["Spirit Core"] = String(core);
    save.fields.Exp = String(bank);
    save.ui = { ...save.ui, mode: "sheet", playMode: "combat", gameVersion: version, quickBuildActive: false };
    save.builder.startMode = campaign;
    save.builder.autoExpBank = "";
    save.builder.autoSpiritCore = "";
    if (breakthroughPoolUnused) {
      save.builder.selectedBreakthroughIds = [];
      save.fields.BName = "";
      save.fields.BDescription = "";
    }
    if (crafting) save.play.crafting = { ...save.play.crafting, ...crafting };
    delete save.play.skyboundTrial;
    await page.evaluate(({ key, save, latest }) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(save));
      localStorage.setItem("lyrian-chronicles-selected-game-version-v2", save.ui.gameVersion);
      localStorage.setItem("lyrian-chronicles-selected-game-version-latest-v1", latest);
    }, { key: workingKey, save, latest });
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(version => window.LYRIAN_DATA?.version === version
      && !document.querySelector("#sheet-view")?.classList.contains("is-hidden"), version);
    await page.locator('[data-play-transaction-amount="Exp"]').waitFor();
    await waitValues([core, bank, 0, false]);
  };
  const award = async (amount, expected) => {
    await page.locator('[data-play-transaction-amount="Exp"]').fill(String(amount));
    await page.locator('[data-play-transaction-field="Exp"][data-play-transaction-action="add"]').click();
    await waitValues(expected);
  };
  const trial = page.locator("[data-record-skybound-trial]");
  const spendPage = () => page.locator("[data-open-exp-spending]").click();
  const learnMage = () => page.locator('[data-builder-action="learn-class-ability"][data-id="mage"]').click();

  await seed({ core: 9899, bank: 0 });
  await award(300, [9899, 100, 200, false]);
  check("Standard 300 XP at 9899 fills 100 bank and holds 200", values(await state()), [9899, 100, 200, false]);
  await award(900, [9899, 100, 1000, false]);
  await status("100 EXP exceeded the 1,000 held EXP limit");
  check("Standard award caps held EXP at 1000", values(await state()), [9899, 100, 1000, false]);
  await page.reload({ waitUntil: "load" });
  await trial.waitFor();
  check("pending Trial holds the same EXP after reload", values(await state()), [9899, 100, 1000, false]);

  const decideTrial = async accept => {
    const dialog = page.waitForEvent("dialog");
    const click = trial.click();
    const confirmation = await dialog;
    assert.match(confirmation.message(), /GM confirmed/);
    await (accept ? confirmation.accept() : confirmation.dismiss());
    await click;
  };
  await decideTrial(false);
  check("declining GM confirmation keeps held EXP and Trial pending", values(await state()), [9899, 100, 1000, false]);
  await decideTrial(true);
  await waitValues([9899, 1100, 0, true]);
  check("GM confirmation releases the full held balance once", values(await state()), [9899, 1100, 0, true]);
  check("a completed Trial has no repeat completion control", await trial.count(), 0);
  await page.reload({ waitUntil: "load" });
  await page.getByText("Skybound Trial completed.", { exact: true }).waitFor();
  check("completed Trial and released balance survive reload", values(await state()), [9899, 1100, 0, true]);
  await spendPage();
  await learnMage();
  await waitValues([9999, 1000, 0, true]);
  await learnMage();
  await waitValues([10099, 900, 0, true]);
  check("normal class ability advancement spends above 9999 after completion",
    [values(await state()), (await state()).builder.classAbilityProgress.mage], [[10099, 900, 0, true], 3]);
  await page.locator('[data-builder-action="refund-class-ability"][data-id="mage"]').click();
  await waitValues([9999, 1000, 0, true]);
  check("refund returns EXP and keeps recorded Trial completion", values(await state()), [9999, 1000, 0, true]);

  await page.locator("#builder-export-character").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-export-mode="json"]').click(),
  ]);
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  check("JSON snapshot exports Trial completion and zero held EXP", exported.play.skyboundTrial, { completed: true, heldExp: 0 });

  await seed({ core: 9900, bank: 200 });
  await spendPage();
  await learnMage();
  await status("Complete the Skybound Trial");
  check("pre-Trial 9900 + 100 ability spend blocked before mutation",
    [values(await state()), (await state()).builder.classAbilityProgress.mage], [[9900, 200, 0, false], 1]);
  await page.locator('#builder-step-content button[data-builder-action="toggle-class"][data-id="ranger"]').click();
  await status("Complete the Skybound Trial");
  check("pre-Trial class unlock blocked before mutation", (await state()).builder.selectedClassIds, ["rogue", "mage"]);

  await seed({ core: 9899, bank: 0, campaign: "mirane" });
  await award(150, [9899, 100, 50, false]);
  check("Mirane award shares the available and held EXP rule", values(await state()), [9899, 100, 50, false]);
  await spendPage();
  await learnMage();
  await waitValues([9999, 0, 50, false]);
  check("Mirane exact 9999 spend succeeds before Trial", [values(await state()), (await state()).builder.startMode], [[9999, 0, 50, false], "mirane"]);

  await seed({ core: 9999, bank: 0, campaign: "mirane", crafting: {
    activityMode: "crafting", selectionMode: "recipe", selectedRecipeId: "healing-potion",
    craftingWizardStep: 4, miraneUseNaturalIp: true, miraneInterludeExpClaimed: false, lastCraftOutcome: null,
  } });
  await page.locator('#sheet-view button[data-play-mode="crafting"]:visible').first().click();
  const craftFailed = page.locator('[data-crafting-action="craft-failure"]');
  await craftFailed.click();
  await waitValues([9999, 0, 20, false]);
  check("Mirane natural IP craft puts the 20 EXP award into the held balance at 9999",
    [values(await state()), (await state()).play.crafting.miraneInterludeExpClaimed], [[9999, 0, 20, false], true]);
  check("resolved Mirane craft cannot award EXP again through the same outcome", await craftFailed.isDisabled(), true);

  await seed({ core: 9999, bank: 50, breakthroughPoolUnused: true });
  await spendPage();
  await page.getByRole("button", { name: /breakthroughs/i }).first().click();
  await page.locator('#builder-step-content button[data-builder-action="toggle-breakthrough"][data-id="light-armor-training"]').click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || "null")?.builder.selectedBreakthroughIds.includes("light-armor-training"), workingKey);
  check("creation-only breakthrough spends no general EXP at 9999",
    [values(await state()), (await state()).builder.selectedBreakthroughIds], [[9999, 50, 0, false], ["light-armor-training"]]);
  await page.locator('#builder-step-content button[data-builder-action="toggle-breakthrough"][data-id="rich-parents"]').click();
  await status("Complete the Skybound Trial");
  check("breakthrough needing general EXP cannot spend beyond 9999",
    [values(await state()), (await state()).builder.selectedBreakthroughIds], [[9999, 50, 0, false], ["light-armor-training"]]);

  await seed({ core: 9900, bank: 0, version: older });
  await award(300, [9900, 300, 0, false]);
  check("0.13.2 award leaves all EXP spendable and shows no Trial control", [values(await state()), await trial.count()], [[9900, 300, 0, false], 0]);
  await spendPage();
  await learnMage();
  await waitValues([10000, 200, 0, false]);
  check("0.13.2 ability spend can cross 9999", values(await state()), [10000, 200, 0, false]);
  await page.locator('#builder-step-content button[data-builder-action="toggle-class"][data-id="ranger"]').click();
  await waitValues([10100, 100, 0, false]);
  check("0.13.2 class unlock can also cross 9999",
    [values(await state()), (await state()).builder.selectedClassIds], [[10100, 100, 0, false], ["rogue", "mage", "ranger"]]);

  check("no uncaught browser errors or local HTTP failures", [issues.errors, issues.localFailures], [[], []]);
  assert.equal(digest(await readFile(app)), appHash, "candidate bundle changed during the run");
  await writeFile(path.join(output, "browser-result.json"), JSON.stringify({ passed: true, appHash, checks, issues }, null, 2) + "\n");
} catch (error) {
  await page?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
  await writeFile(path.join(output, "browser-result.json"), JSON.stringify({ passed: false, appHash, checks, issues, error: error.stack }, null, 2) + "\n");
  throw error;
} finally {
  await context?.close();
  await browser?.close();
  server?.kill();
}
