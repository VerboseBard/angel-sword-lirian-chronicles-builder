import { fork } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 4214;
const baseUrl = `http://127.0.0.1:${port}`;

/* ── Task 031: fake-room harness ────────────────────────────────────────
   The real owlbear/panel.js is bundled in memory with only ./sdk.js swapped
   for a stub that returns window.__ASB_FAKE_OBR__ (an in-page stand-in for
   Owlbear's OBR object). Production code has no test hook; the stand-in
   records every call so the test can check what the panel asked Owlbear for. */
async function buildFakeRoomPanelBundle() {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["owlbear/panel.js"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    write: false,
    logLevel: "silent",
    plugins: [{
      name: "fake-owlbear-sdk-loader",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^\.\/sdk\.js$/ }, () => ({ path: "fake-sdk", namespace: "fake-sdk" }));
        pluginBuild.onLoad({ filter: /^fake-sdk$/, namespace: "fake-sdk" }, () => ({
          contents: "export async function loadOwlbearSdk() { return globalThis.__ASB_FAKE_OBR__ || null; }",
          loader: "js"
        }));
        /* The SDK's buildImage() reads the signed-in Owlbear user id and
           throws outside a real room, so the panel's buildImage import uses
           the SDK's own ImageBuilder class with a stand-in user. */
        pluginBuild.onResolve({ filter: /^@owlbear-rodeo\/sdk$/ }, (args) => (
          args.importer.endsWith(path.join("owlbear", "panel.js")) ? { path: "fake-sdk-builders", namespace: "fake-sdk" } : undefined
        ));
        pluginBuild.onLoad({ filter: /^fake-sdk-builders$/, namespace: "fake-sdk" }, () => ({
          contents: `import { ImageBuilder } from ${JSON.stringify(path.join(root, "node_modules", "@owlbear-rodeo", "sdk", "lib", "builders", "ImageBuilder.js").replace(/\\/g, "/"))};
            export function buildImage(image, grid) { return new ImageBuilder({ id: "fake-owlbear-user" }, image, grid); }`,
          loader: "js",
          resolveDir: root
        }));
      }
    }]
  });
  return result.outputFiles[0].text;
}

function installFakeObr(config) {
  const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
  const state = {
    playerId: config.playerId,
    role: config.role || "PLAYER",
    items: clone(config.items || []),
    playerMetadata: clone(config.playerMetadata || {}),
    roomMetadata: {},
    selection: [],
    pickResolvers: [],
    broadcastListeners: []
  };
  const calls = [];
  window.__obrState = state;
  window.__obrCalls = calls;
  // Task 031b: lets a test deliver a roll the way Owlbear's broadcast does.
  window.__deliverBroadcast = (data) => {
    state.broadcastListeners.forEach((callback) => callback({ data: clone(data), connectionId: "fake-connection" }));
  };
  window.__resolvePick = (picks) => {
    const resolve = state.pickResolvers.shift();
    if (resolve) {
      resolve(picks);
    }
    return Boolean(resolve);
  };
  window.__ASB_FAKE_OBR__ = {
    onReady(callback) { setTimeout(callback, 0); },
    player: {
      get id() { return state.playerId; },
      getId: async () => state.playerId,
      getName: async () => config.playerName || "Test Player",
      getRole: async () => state.role,
      getMetadata: async () => clone(state.playerMetadata),
      setMetadata: async (update) => { calls.push(["player.setMetadata", clone(update)]); Object.assign(state.playerMetadata, clone(update)); },
      getSelection: async () => state.selection,
      onChange: () => () => {}
    },
    room: {
      getMetadata: async () => clone(state.roomMetadata),
      setMetadata: async (update) => { Object.assign(state.roomMetadata, clone(update)); },
      onMetadataChange: () => () => {}
    },
    broadcast: {
      onMessage: (channel, callback) => { state.broadcastListeners.push(callback); return () => {}; },
      sendMessage: async () => {}
    },
    scene: {
      isReady: async () => true,
      onReadyChange: () => () => {},
      items: {
        getItems: async (filter) => clone(Array.isArray(filter)
          ? state.items.filter((item) => filter.map((entry) => (typeof entry === "string" ? entry : entry.id)).includes(item.id))
          : state.items),
        updateItems: async (filter, updater) => {
          const ids = filter.map((entry) => (typeof entry === "string" ? entry : entry.id));
          calls.push(["scene.items.updateItems", ids]);
          const drafts = state.items.filter((item) => ids.includes(item.id));
          updater(drafts);
          state.items = clone(state.items);
        },
        addItems: async (items) => { calls.push(["scene.items.addItems", clone(items)]); state.items.push(...clone(items)); }
      }
    },
    viewport: {
      getWidth: async () => 1000,
      getHeight: async () => 800,
      inverseTransformPoint: async (point) => ({ x: point.x + 5000, y: point.y + 5000 })
    },
    assets: {
      downloadImages: (multiple, search) => {
        calls.push(["assets.downloadImages", search]);
        return new Promise((resolve) => state.pickResolvers.push(resolve));
      },
      uploadImages: async () => { calls.push(["assets.uploadImages"]); }
    }
  };
}

const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const BINDING_KEY = "com.angelssword.lyrian-chronicles/character-binding";
const PLAYER_BINDING_KEY = "com.angelssword.lyrian-chronicles/player-binding";
/* The Place My Token watchdog, in ms: owlbear/panel.js PLACE_TOKEN_WATCHDOG_MS
   (read from the source below, so the test follows the panel). */
const WATCHDOG_MS = Number(/const PLACE_TOKEN_WATCHDOG_MS = (\d+);/.exec(await readFile(path.join(root, "owlbear", "panel.js"), "utf8"))?.[1] || 0);

/* What the LIVE builder (main 3346d32) sends: the whole working state
   (createStateSnapshot), sheet inputs as strings, no vttSummary. */
function liveBuilderCharacter(overrides = {}) {
  return {
    ui: { mode: "sheet", builderStep: 9, gameVersion: "0.13.2", quickBuildActive: false, quickBuildStep: 0 },
    fields: { Name: "Mira Vale", "Primary Race": "Chimera", "Sub Race": "Catfolk", Class1: "Fighter", Power: "2", Focus: "3", Agility: "3", Toughness: "3", Fitness: "2", Cunning: "1", Reason: "1", Awareness: "1", Presence: "2", Speed: "25", Exp: "1000", "Spirit Core": "1100", ...(overrides.fields || {}) },
    abilitySelections: {},
    lastFocusedField: "",
    librarySelections: {},
    builder: { startMode: "standard", selectedRaceId: "chimera", selectedAncestryId: "catfolk", selectedClassIds: ["fighter"], autoSpiritCore: "1100", autoExpBank: "1000", ...(overrides.builder || {}) },
    play: { resources: { hpCurrent: 60, hpMax: 60, tempHp: 0, manaCurrent: 8, manaMax: 8, rpCurrent: 5, rpMax: 5, apCurrent: 4, apMax: 4, ...(overrides.resources || {}) }, activeEffects: [] }
  };
}

function handoffEvent(id, character, withToken = true) {
  return {
    v: 1, id, ts: Date.now(), kind: "character-handoff", relaySource: "angel-sword-sheet",
    characterName: character.fields.Name,
    character,
    tokenImages: withToken ? { full: TINY_PNG, sync: TINY_PNG } : null
  };
}

async function waitFor(page, predicate, arg, label, timeout = 10000) {
  try {
    await page.waitForFunction(predicate, arg, { timeout });
  } catch (error) {
    const feedback = await page.locator("#feedback").textContent().catch(() => "");
    throw new Error(`${label} (feedback: ${feedback})`);
  }
}

async function runFakeRoomPhase(browser) {
  const bundle = await buildFakeRoomPanelBundle();
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const relayEvents = [];
  let relaySeq = 0;
  await context.route("**/owlbear/dist/panel.js*", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: bundle }));
  await context.route("**/api/vtt-relay/events*", (route) => {
    relaySeq += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, boot: "fake-room", seq: relaySeq, events: relayEvents }) });
  });
  const errors = [];
  const openRoomPage = async (config) => {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${config.playerId}: ${error.message}`));
    await page.addInitScript(installFakeObr, config);
    await page.goto(`${baseUrl}/owlbear/panel.html`, { waitUntil: "domcontentloaded" });
    await waitFor(page, () => document.getElementById("status")?.textContent?.includes("connected"), undefined, "fake room did not connect");
    return page;
  };
  const feedbackOf = (page) => page.locator("#feedback").textContent();
  const callsOf = (page, name) => page.evaluate((callName) => window.__obrCalls.filter(([entry]) => entry === callName), name);

  // 1. A new-builder send (with vttSummary) arrives with its token picture.
  const page = await openRoomPage({ playerId: "player-a", playerName: "Player A" });
  const newBuilderCharacter = { ...liveBuilderCharacter(), vttSummary: { schemaVersion: 1, basis: "current", stats: { power: 2, focus: 3, agility: 3, toughness: 4, fitness: 2, cunning: 1, reason: 1, awareness: 2, presence: 2 }, speed: 25, clim: 3500, exp: 1000, spiritCore: 1100 } };
  relayEvents.push(handoffEvent("fake-handoff-1", newBuilderCharacter));
  await waitFor(page, () => document.getElementById("character-summary")?.textContent?.includes("Mira Vale"), undefined, "handoff 1 did not land");
  const firstFeedback = await feedbackOf(page);
  if (!firstFeedback.includes("Your token picture is ready: use Download Token Image the first time.") || firstFeedback.includes("Place My Token is ready")) {
    throw new Error(`Handoff feedback does not use the new token wording: ${firstFeedback}`);
  }
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("asb.owlbear.character.v1")));
  if (stored.stats.toughness !== 4 || stored.stats.awareness !== 2 || stored.resources.clim !== 3500 || stored.speed !== 25) {
    throw new Error(`Companion did not store the vttSummary numbers: ${JSON.stringify(stored)}`);
  }

  // 2. Place My Token: double-click guard, no hidden upload, clear message.
  await page.locator("#place-token").click();
  await waitFor(page, () => window.__obrCalls.some(([name]) => name === "assets.downloadImages"), undefined, "picker did not open");
  if (!await page.locator("#place-token").isDisabled()) {
    throw new Error("Place My Token must be disabled while Owlbear's picker is open.");
  }
  /* Two forced clicks go past the disabled state to test the in-flight guard
     on its own. The button is then put back to disabled, exactly as the panel
     left it: the test must never leave it enabled itself, because the panel
     has to re-enable it when the picker closes (031 audit break E20). */
  await page.evaluate(() => {
    const button = document.getElementById("place-token");
    button.disabled = false;
    button.click();
    button.click();
    button.disabled = true;
  });
  await page.waitForTimeout(150);
  const pickerCalls = await callsOf(page, "assets.downloadImages");
  if (pickerCalls.length !== 1 || pickerCalls[0][1] !== "Mira Vale Token") {
    throw new Error(`A second click while the picker was open started another run: ${JSON.stringify(pickerCalls)}`);
  }
  await page.evaluate(() => window.__resolvePick([]));
  await waitFor(page, () => document.getElementById("feedback")?.textContent?.includes("No token was picked."), undefined, "no-pick message missing");
  const noPick = await feedbackOf(page);
  if (!noPick.includes("Drag your downloaded token onto the map first, choose Character, then try again.")) {
    throw new Error(`No-pick message is not the first-time help: ${noPick}`);
  }
  await page.waitForTimeout(1800);
  if ((await callsOf(page, "assets.uploadImages")).length || (await callsOf(page, "assets.downloadImages")).length !== 1) {
    throw new Error("Place My Token still tried a hidden upload or a second picker.");
  }
  if (await page.locator("#place-token").isDisabled()) {
    throw new Error("Place My Token stayed disabled after the picker closed.");
  }

  // 2b. Watchdog (task 031b): if Owlbear never answers the picker, the button
  //     comes back by itself after the watchdog time, with fake timers. A pick
  //     that arrives after that places nothing, binds nothing and throws nothing.
  const pickFor = (width, height) => ({
    name: "Mira Vale Token", type: "CHARACTER", visible: true, locked: false, rotation: 0, scale: { x: 1, y: 1 },
    image: { width, height, mime: "image/webp", url: "https://example.invalid/mira-token.webp" },
    grid: { dpi: 150, offset: { x: 75, y: 75 } },
    text: { richText: [], plainText: "", style: {}, type: "PLAIN", width: "AUTO", height: "AUTO" }, textItemType: "LABEL"
  });
  if (!(WATCHDOG_MS >= 20000 && WATCHDOG_MS <= 60000)) {
    throw new Error(`The Place My Token watchdog must be between 20 and 60 seconds (it is ${WATCHDOG_MS} ms).`);
  }
  const panelConsoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error" && message.text().includes("Angel Sword")) { panelConsoleErrors.push(message.text()); } });
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  await page.locator("#place-token").click();
  await waitFor(page, () => window.__obrCalls.filter(([name]) => name === "assets.downloadImages").length === 2, undefined, "watchdog test: the picker did not open");
  await page.clock.fastForward(WATCHDOG_MS - 1000);
  if (!await page.locator("#place-token").isDisabled()) {
    throw new Error("Place My Token came back before the watchdog time.");
  }
  await page.clock.fastForward(2000);
  await waitFor(page, () => !document.getElementById("place-token").disabled, undefined, "the watchdog did not bring Place My Token back");
  const watchdogFeedback = await feedbackOf(page);
  if (!watchdogFeedback.includes(`did not answer in ${WATCHDOG_MS / 1000} seconds`) || !watchdogFeedback.includes("Press it again")) {
    throw new Error(`The watchdog gave no clear message: ${watchdogFeedback}`);
  }
  // The player presses it again (run 3). Then the OLD picker answers, late.
  await page.locator("#place-token").click();
  await waitFor(page, () => window.__obrCalls.filter(([name]) => name === "assets.downloadImages").length === 3, undefined, "watchdog test: the second press did not open a picker");
  await page.evaluate((pick) => window.__resolvePick([pick]), pickFor(720, 720));
  await page.waitForTimeout(300);
  if ((await callsOf(page, "scene.items.addItems")).length || (await callsOf(page, "player.setMetadata")).length) {
    throw new Error("A pick that arrived after the watchdog placed or bound a token.");
  }
  if (!await page.locator("#place-token").isDisabled() || !(await feedbackOf(page)).includes("Pick Mira Vale Token in Owlbear's dialog")) {
    throw new Error("A late answer from the old picker disturbed the newer run.");
  }

  // 3. A real pick (on the newer picker) is placed at one grid square and
  //    bound to this player. The picture is TALL (540 x 720): the square size
  //    is the longer side, so a width-only size would be caught (audit E10).
  await page.evaluate((pick) => window.__resolvePick([pick]), pickFor(540, 720));
  await waitFor(page, () => document.getElementById("feedback")?.textContent?.includes("Placed and bound"), undefined, "token was not placed");
  // Task 038 item 15 (03xb audit break X5): the clock stays paused through the
  // real pick, then runs past the watchdog time. A watchdog timer that was not
  // cleared would now replace "Placed and bound" with "did not answer".
  await page.clock.fastForward(WATCHDOG_MS + 1000);
  const afterWatchdogTime = await feedbackOf(page);
  if (!afterWatchdogTime.includes("Placed and bound") || afterWatchdogTime.includes("did not answer")) {
    throw new Error(`The watchdog fired after a good pick (its timer was not cleared): ${afterWatchdogTime}`);
  }
  await page.clock.resume();
  if ((await callsOf(page, "scene.items.addItems")).length !== 1
    || (await callsOf(page, "player.setMetadata")).filter(([, update]) => update[PLAYER_BINDING_KEY]).length !== 1) {
    throw new Error("The late answer and the real pick together placed or bound more than once.");
  }
  await page.waitForTimeout(150);
  if (await page.locator("#place-token").isDisabled()) {
    throw new Error("Place My Token stayed disabled after a token was placed.");
  }
  if (panelConsoleErrors.length) {
    throw new Error(`Place My Token logged an error (a late answer must not throw): ${panelConsoleErrors.join(" | ")}`);
  }
  const [[, added]] = await callsOf(page, "scene.items.addItems");
  const token = added[0];
  if (token.layer !== "CHARACTER" || token.grid.dpi !== 720 || token.grid.offset.x !== 270 || token.grid.offset.y !== 360) {
    throw new Error(`Placed token is not one grid square on the Character layer: ${JSON.stringify(token.grid)} ${token.layer}`);
  }
  if (token.metadata[BINDING_KEY]?.ownerPlayerId !== "player-a") {
    throw new Error("Placed token was not bound to the placing player.");
  }
  const placedPosition = token.position;

  // 4. A re-send of the same character refreshes the bound token's numbers
  //    without moving, rebinding or adding a token.
  const resent = { ...liveBuilderCharacter({ resources: { hpCurrent: 41 }, fields: { Exp: "900" }, builder: { autoExpBank: "" } }), vttSummary: { ...newBuilderCharacter.vttSummary, speed: 12, exp: 900 } };
  relayEvents.push(handoffEvent("fake-handoff-2", resent));
  await waitFor(page, () => document.getElementById("feedback")?.textContent?.includes("Updated the numbers on your token"), undefined, "re-send did not refresh the bound token");
  const sceneAfter = await page.evaluate(() => window.__obrState.items);
  const playerAfter = await page.evaluate((key) => window.__obrState.playerMetadata[key], PLAYER_BINDING_KEY);
  const refreshed = sceneAfter[0].metadata[BINDING_KEY];
  if (sceneAfter.length !== 1 || sceneAfter[0].id !== token.id || JSON.stringify(sceneAfter[0].position) !== JSON.stringify(placedPosition)) {
    throw new Error("A re-send moved, replaced or added a token.");
  }
  if (refreshed.resources.hpCurrent !== 41 || refreshed.resources.exp !== 900 || refreshed.speed !== 12 || refreshed.tokenId !== token.id || refreshed.ownerPlayerId !== "player-a") {
    throw new Error(`Bound token numbers were not refreshed correctly: ${JSON.stringify(refreshed)}`);
  }
  if (playerAfter?.resources?.hpCurrent !== 41 || playerAfter.tokenId !== token.id) {
    throw new Error("The player's own binding record was not refreshed.");
  }
  if ((await callsOf(page, "scene.items.addItems")).length !== 1) {
    throw new Error("A re-send added another token.");
  }

  // 5. The LIVE builder's send (no vttSummary) still works: no errors, the
  //    corrected fallbacks, the bound token refreshed.
  relayEvents.push(handoffEvent("fake-handoff-live", liveBuilderCharacter({ fields: { Exp: "850", Speed: "" }, builder: { autoExpBank: "" }, resources: { hpCurrent: 33 } })));
  await waitFor(page, () => JSON.parse(localStorage.getItem("asb.owlbear.character.v1") || "{}")?.resources?.hpCurrent === 33, undefined, "live-builder handoff did not land");
  const liveStored = await page.evaluate(() => JSON.parse(localStorage.getItem("asb.owlbear.character.v1")));
  if (liveStored.resources.exp !== 850 || liveStored.speed !== 20 || liveStored.stats.toughness !== 3 || liveStored.resources.spiritCore !== 1100) {
    throw new Error(`Live-builder fallbacks are wrong: ${JSON.stringify(liveStored)}`);
  }
  await waitFor(page, () => window.__obrState.items[0]?.metadata?.["com.angelssword.lyrian-chronicles/character-binding"]?.resources?.hpCurrent === 33, undefined, "live-builder re-send did not refresh the token");

  // 6. A file from a newer version imports with a clear note.
  await page.locator("#character-file").setInputFiles({
    name: "newer.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...liveBuilderCharacter(), vttSummary: { schemaVersion: 2, stats: { toughness: 5 }, futureField: 1 } }))
  });
  await waitFor(page, () => document.getElementById("feedback")?.textContent?.startsWith("Imported Mira Vale."), undefined, "newer file did not import");
  const newerFeedback = await feedbackOf(page);
  if (!newerFeedback.includes("newer Angel Sword version (format 2; this Companion reads format 1)")) {
    throw new Error(`Newer-schema file imported silently: ${newerFeedback}`);
  }
  if (newerFeedback.includes("Select its Owlbear token next")) {
    throw new Error("File import still uses the old token wording.");
  }

  // 6b. A class change or a rename is another characterId, so the bound token
  //     is not refreshed. Task 031b: the panel says what to do instead of going
  //     quiet, and still never rebinds or touches the token by itself.
  const tokenRecordBefore = await page.evaluate((key) => JSON.stringify(window.__obrState.items[0].metadata[key]), BINDING_KEY);
  const updatesBefore = (await callsOf(page, "scene.items.updateItems")).length;
  const playerBindingBefore = JSON.stringify(await page.evaluate((key) => window.__obrState.playerMetadata[key], PLAYER_BINDING_KEY));
  relayEvents.push(handoffEvent("fake-handoff-classchange", liveBuilderCharacter({ fields: { Class1: "Mage" }, builder: { selectedClassIds: ["mage"] } })));
  await waitFor(page, () => document.getElementById("feedback")?.textContent?.includes("arrived from the builder"), undefined, "the class-change send did not arrive");
  const classChangeFeedback = await feedbackOf(page);
  if (!classChangeFeedback.includes("This may be a new version of Mira Vale. To link it, select your token and press Bind Selected Token.")) {
    throw new Error(`A class change gave no new-version sentence: ${classChangeFeedback}`);
  }
  relayEvents.push(handoffEvent("fake-handoff-rename", liveBuilderCharacter({ fields: { Name: "Mira Vale-Hart" } })));
  await waitFor(page, () => document.getElementById("character-summary")?.textContent?.includes("Mira Vale-Hart"), undefined, "the rename send did not arrive");
  const renameFeedback = await feedbackOf(page);
  if (!renameFeedback.includes("This may be a new version of Mira Vale. To link it, select your token and press Bind Selected Token.")) {
    throw new Error(`A rename gave no new-version sentence (it names the bound character): ${renameFeedback}`);
  }
  if (await page.evaluate((key) => JSON.stringify(window.__obrState.items[0].metadata[key]), BINDING_KEY) !== tokenRecordBefore
    || (await callsOf(page, "scene.items.updateItems")).length !== updatesBefore
    || JSON.stringify(await page.evaluate((key) => window.__obrState.playerMetadata[key], PLAYER_BINDING_KEY)) !== playerBindingBefore
    || (await callsOf(page, "scene.items.addItems")).length !== 1) {
    throw new Error("A renamed or class-changed character touched, rebound or replaced the token by itself.");
  }
  if (!(await page.locator("#binding-summary").textContent()).includes("Mira Vale is bound to")) {
    throw new Error("The panel changed its binding on its own after a rename.");
  }
  await page.close();

  // 7. Reconnect safety (A6): player A must not adopt player B's token for
  //    the same character identity; A's own token is still restored.
  const characterId = stored.characterId;
  const recordFor = (playerId, tokenId) => ({ schemaVersion: 1, characterId, characterName: "Mira Vale", tokenId, tokenName: `Mira (${playerId})`, ownerPlayerId: playerId, ownerPlayerName: playerId, resources: {}, speed: 25, updatedAt: new Date().toISOString() });
  const itemFor = (playerId, tokenId) => ({ id: tokenId, layer: "CHARACTER", name: tokenId, position: { x: 0, y: 0 }, metadata: { [BINDING_KEY]: recordFor(playerId, tokenId) } });
  const onlyTheirs = await openRoomPage({ playerId: "player-a", items: [itemFor("player-b", "token-b")] });
  await onlyTheirs.waitForTimeout(500);
  const onlyTheirsSummary = await onlyTheirs.locator("#binding-summary").textContent();
  const adopted = await onlyTheirs.evaluate((key) => window.__obrState.playerMetadata[key], PLAYER_BINDING_KEY);
  if (!onlyTheirsSummary.includes("No character-token binding yet.") || adopted) {
    throw new Error(`Reconnect adopted another player's token: ${onlyTheirsSummary}`);
  }
  await onlyTheirs.close();
  const both = await openRoomPage({ playerId: "player-a", items: [itemFor("player-b", "token-b"), itemFor("player-a", "token-a")] });
  await waitFor(both, () => document.getElementById("binding-summary")?.textContent?.includes("Mira (player-a)"), undefined, "own token was not restored");
  await both.close();

  // 8. A second player is in the room (task 031b, audit break E23). Player A's
  //    own binding points at a token whose record now belongs to player B.
  //    A re-send must refresh A's binding but never rewrite B's token.
  const foreignItem = itemFor("player-b", "token-b");
  const foreignBefore = JSON.stringify(foreignItem.metadata[BINDING_KEY]);
  const sharing = await openRoomPage({ playerId: "player-a", items: [foreignItem], playerMetadata: { [PLAYER_BINDING_KEY]: recordFor("player-a", "token-b") } });
  relayEvents.push(handoffEvent("fake-handoff-e23", liveBuilderCharacter({ resources: { hpCurrent: 17 } })));
  await waitFor(sharing, () => document.getElementById("feedback")?.textContent?.includes("arrived from the builder"), undefined, "second-player re-send did not arrive");
  await waitFor(sharing, () => window.__obrCalls.some(([name]) => name === "player.setMetadata"), undefined, "second-player re-send did not refresh the player's own binding");
  if (JSON.stringify(await sharing.evaluate((key) => window.__obrState.items[0].metadata[key], BINDING_KEY)) !== foreignBefore) {
    throw new Error("A re-send from player A rewrote the binding record on player B's token.");
  }
  const playerOwn = await sharing.evaluate((key) => window.__obrState.playerMetadata[key], PLAYER_BINDING_KEY);
  if (playerOwn?.resources?.hpCurrent !== 17 || playerOwn.ownerPlayerId !== "player-a") {
    throw new Error(`Player A's own binding was not refreshed: ${JSON.stringify(playerOwn)}`);
  }
  // Closed so it cannot consume the next send (open pages share the consumed list).
  await sharing.close();

  // 9. The newer-version notes on a Send, a shared roll and a reconnect
  //    (audit breaks E24, E25, E28). The file-import note is step 6.
  const notes = await openRoomPage({ playerId: "player-a" });
  relayEvents.push(handoffEvent("fake-handoff-e24", { ...liveBuilderCharacter(), vttSummary: { schemaVersion: 2, stats: { toughness: 5 }, futureField: 1 } }));
  await waitFor(notes, () => document.getElementById("feedback")?.textContent?.includes("arrived from the builder"), undefined, "newer-format send did not arrive");
  if (!(await feedbackOf(notes)).includes("This character came from a newer Angel Sword version (format 2; this Companion reads format 1)")) {
    throw new Error(`A Send from a newer builder arrived with no note: ${await feedbackOf(notes)}`);
  }
  await notes.evaluate(() => window.__deliverBroadcast({ v: 1, id: "fake-roll-newer", kind: "dice", character: "Mira Vale", label: "Future Roll", formula: "1d20", breakdown: "d20: 14", total: 14, schemaVersion: 2, futureRollField: "x" }));
  await waitFor(notes, () => document.getElementById("feedback")?.textContent?.includes("A shared roll came from a newer Angel Sword version"), undefined, "newer-format roll gave no note");
  if (!(await feedbackOf(notes)).includes("(format 2; this Companion reads format 1)") || await notes.locator('#feed li[data-roll-id="fake-roll-newer"]').count() !== 1) {
    throw new Error(`The newer roll's note or its roll line is wrong: ${await feedbackOf(notes)}`);
  }
  await notes.close();
  const newerBinding = { ...recordFor("player-a", "token-new"), schemaVersion: 2 };
  const reconnect = await openRoomPage({ playerId: "player-a", items: [{ ...itemFor("player-a", "token-new"), metadata: { [BINDING_KEY]: newerBinding } }] });
  await waitFor(reconnect, () => document.getElementById("feedback")?.textContent?.includes("Restored binding:"), undefined, "a newer binding was not restored");
  if (!(await feedbackOf(reconnect)).includes("This binding came from a newer Angel Sword version (format 2; this Companion reads format 1)")) {
    throw new Error(`A newer token binding was restored with no note: ${await feedbackOf(reconnect)}`);
  }
  await reconnect.close();

  if (errors.length) {
    throw new Error(`Fake-room page errors: ${errors.join(" | ")}`);
  }
  await context.close();
  console.log("[OWLBEAR FAKE-ROOM TEST SUCCESS] vttSummary stored; Place My Token: one picker, guarded, no upload, one grid square (tall picture too), clear first-time message, a watchdog that frees the button and ignores a late pick; a re-send refreshed the bound token without moving it and never rewrote another player's token; a rename or class change explains itself; the live builder's send works with the corrected fallbacks; newer-version notes on a file, a send, a roll and a reconnect; reconnect adopts only this player's token.");
}

async function main() {
  const server = fork(path.join(root, "scripts", "server.mjs"), {
    cwd: root,
    env: { ...process.env, LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" },
    silent: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Local Owlbear test server did not start.")), 10000);
      server.stdout.on("data", (chunk) => {
        if (String(chunk).includes(`:${port}/`)) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.once("exit", (code) => reject(new Error(`Local Owlbear test server exited with ${code}.`)));
    });

    const manifestResponse = await fetch(`${baseUrl}/owlbear/manifest.json`, {
      headers: { Origin: "https://www.owlbear.rodeo" }
    });
    if (manifestResponse.headers.get("access-control-allow-origin") !== "https://www.owlbear.rodeo") {
      throw new Error("Local Owlbear assets are missing the required Owlbear CORS header.");
    }

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/owlbear/panel.html`, { waitUntil: "domcontentloaded" });
    await page.locator("#character-file").setInputFiles({
      name: "jefferson-stone.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        fields: { Name: "Jefferson Stone", "Primary Race": "Human", "Sub Race": "Mirane", Speed: 20 },
        builder: { selectedClassIds: ["gunslinger"] },
        play: { resources: { hpCurrent: 42, hpMax: 50, manaCurrent: 6, manaMax: 8, apCurrent: 3, apMax: 4, rpCurrent: 2, rpMax: 5 } }
      }))
    });
    await page.waitForSelector("#character-card:not([hidden])");
    const summary = await page.locator("#character-summary").textContent();
    if (!summary.includes("Jefferson Stone") || !summary.includes("Human") || !summary.includes("Mirane") || !summary.includes("42/50") || !summary.includes("3/4")) {
      throw new Error(`Imported character summary is incomplete: ${summary}`);
    }
    if (!await page.locator("#bind-token").isDisabled()) {
      throw new Error("Token binding must remain disabled outside an Owlbear room.");
    }
    await page.locator('[data-tab="rolls"]').click();
    if (!await page.locator('[data-panel="rolls"]').isVisible()) {
      throw new Error("Room Rolls tab did not open.");
    }
    if (pageErrors.length) {
      throw new Error(`Owlbear panel page errors: ${pageErrors.join(" | ")}`);
    }
    const tokenImageResponse = await fetch(`${baseUrl}/api/vtt-relay/token-image`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "gone", dataUrl: "data:image/png;base64,AA==" })
    });
    if (tokenImageResponse.status !== 404) {
      throw new Error(`Deleted token-image endpoint still answers (${tokenImageResponse.status}).`);
    }
    console.log("[OWLBEAR PANEL TEST SUCCESS] Import UI, standalone safeguards, tabs, and local CORS passed.");

    /* ── Opener-bridge phase: the acceptance proof ──────────────────────
       Dev relay blocked and BroadcastChannel removed in BOTH pages, so a
       character or roll can only arrive over the window.opener postMessage
       bridge — a green run cannot be a false positive from the local
       fallbacks quietly carrying the data. */
    const bridgeContext = await browser.newContext({ viewport: { width: 390, height: 700 } });
    await bridgeContext.route("**/api/vtt-relay/**", (route) => route.abort());
    await bridgeContext.addInitScript(() => {
      Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true });
    });
    const bridgeErrors = [];
    const panelPage = await bridgeContext.newPage();
    panelPage.on("pageerror", (error) => bridgeErrors.push(`panel: ${error.message}`));
    await panelPage.goto(`${baseUrl}/owlbear/panel.html`, { waitUntil: "domcontentloaded" });

    const popupPromise = panelPage.waitForEvent("popup", { timeout: 20000 });
    await panelPage.locator("#open-sheet").click();
    const sheetPopup = await popupPromise;
    sheetPopup.on("pageerror", (error) => bridgeErrors.push(`sheet: ${error.message}`));
    await sheetPopup.waitForLoadState("domcontentloaded");

    await panelPage.waitForFunction(
      () => document.getElementById("sheet-link-status")?.textContent?.includes("connected"),
      undefined,
      { timeout: 25000 }
    );

    await sheetPopup.evaluate(() => {
      window.opener.postMessage({
        v: 1,
        id: "bridge-test-handoff-1",
        ts: Date.now(),
        kind: "character-handoff",
        relaySource: "angel-sword-sheet",
        characterName: "Bridge Test Pecorine",
        character: {
          fields: { Name: "Bridge Test Pecorine", "Primary Race": "Human", "Sub Race": "Mirane", Speed: 20 },
          builder: { selectedClassIds: ["medic"] },
          play: { resources: { hpCurrent: 30, hpMax: 30, manaCurrent: 5, manaMax: 5, apCurrent: 4, apMax: 4, rpCurrent: 1, rpMax: 1 } }
        }
      }, window.location.origin);
    });
    await panelPage.waitForFunction(
      () => document.getElementById("character-summary")?.textContent?.includes("Bridge Test Pecorine"),
      undefined,
      { timeout: 10000 }
    );

    const rollEvent = {
      v: 1,
      id: "bridge-test-roll-1",
      ts: Date.now(),
      kind: "dice",
      relaySource: "angel-sword-sheet",
      character: "Bridge Test Pecorine",
      label: "Bridge Test Roll",
      formula: "1d20",
      breakdown: "d20: 11",
      total: 11
    };
    await sheetPopup.evaluate((event) => {
      window.opener.postMessage(event, window.location.origin);
      window.opener.postMessage(event, window.location.origin);
    }, rollEvent);
    await panelPage.locator('[data-tab="rolls"]').click();
    await panelPage.waitForFunction(
      () => document.querySelectorAll('#feed li[data-roll-id="bridge-test-roll-1"]').length === 1,
      undefined,
      { timeout: 10000 }
    );
    const duplicateCount = await panelPage.evaluate(
      () => document.querySelectorAll('#feed li[data-roll-id="bridge-test-roll-1"]').length
    );
    if (duplicateCount !== 1) {
      throw new Error(`Bridge roll rendered ${duplicateCount} times; dedup by id failed.`);
    }
    if (bridgeErrors.length) {
      throw new Error(`Opener bridge page errors: ${bridgeErrors.join(" | ")}`);
    }
    await bridgeContext.close();
    console.log("[OWLBEAR BRIDGE TEST SUCCESS] With the dev relay blocked and BroadcastChannel removed, the popup handshake connected, a character handoff landed, and a roll reached the feed exactly once over window.opener postMessage alone.");

    await runFakeRoomPhase(browser);
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error("[OWLBEAR PANEL TEST FAILURE]", error);
  process.exit(1);
});
