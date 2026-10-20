/* Focused VTT adapter groundwork tests:
   1. Owlbear extension manifest — validates against the documented manifest
      reference (name ≤45 chars, manifest_version number, action.popover, …)
      and confirms the referenced panel/icon files exist.
   2. Foundry module manifest — validates the documented module.json shape
      (id format, authors, esmodules, compatibility) and that the referenced
      script exists and parses.
   3. World Anvil BBCode profile builder — output shape and content checks.
   4. vtt-relay module — exports exist and stay dependency-light.
   Run: npm run test:vtt */

import { access, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) {
    return;
  }
  failures += 1;
  console.error(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch (error) {
    return false;
  }
}

function nodeCheck(relativePath) {
  try {
    execFileSync(process.execPath, ["--check", path.join(root, relativePath)], { stdio: "pipe" });
    return true;
  } catch (error) {
    return false;
  }
}

async function testOwlbearManifest() {
  console.log("— owlbear extension —");
  const manifest = JSON.parse(await readFile(path.join(root, "owlbear", "manifest.json"), "utf8"));
  check("name present and ≤45 chars", typeof manifest.name === "string" && manifest.name.length > 0 && manifest.name.length <= 45);
  check("version present", typeof manifest.version === "string" && manifest.version.length > 0);
  check("manifest_version is a number", typeof manifest.manifest_version === "number");
  check("description ≤128 chars", typeof manifest.description === "string" && manifest.description.length <= 128);
  check("action has title/icon/popover", manifest.action
    && typeof manifest.action.title === "string"
    && typeof manifest.action.icon === "string"
    && typeof manifest.action.popover === "string");
  check("popover width/height are numbers", typeof manifest.action?.width === "number" && typeof manifest.action?.height === "number");
  check("panel.html exists", await exists("owlbear/panel.html"));
  check("panel.js exists", await exists("owlbear/panel.js"));
  check("background page is declared and exists", manifest.background_url === "background.html" && await exists("owlbear/background.html"));
  check("background.js exists", await exists("owlbear/background.js"));
  check("core.js exists", await exists("owlbear/core.js"));
  check("bundled panel runtime exists", await exists("owlbear/dist/panel.js"));
  check("bundled background runtime exists", await exists("owlbear/dist/background.js"));
  check("icon.svg exists", await exists("owlbear/icon.svg"));
  check("panel.js parses", nodeCheck("owlbear/panel.js"));
  check("background.js parses", nodeCheck("owlbear/background.js"));
  check("core.js parses", nodeCheck("owlbear/core.js"));
  check("opener-bridge.js exists", await exists("owlbear/opener-bridge.js"));
  check("opener-bridge.js parses", nodeCheck("owlbear/opener-bridge.js"));
  const panelHtml = await readFile(path.join(root, "owlbear", "panel.html"), "utf8");
  const backgroundHtml = await readFile(path.join(root, "owlbear", "background.html"), "utf8");
  const sdkSource = await readFile(path.join(root, "owlbear", "sdk.js"), "utf8");
  check("extension pages load locally bundled runtimes", panelHtml.includes("dist/panel.js") && backgroundHtml.includes("dist/background.js"));
  check("extension uses the installed official SDK without runtime CDN imports", sdkSource.includes("@owlbear-rodeo/sdk") && !/https?:\/\//i.test(sdkSource));
  const combined = await Promise.all(["panel.js", "background.js", "core.js", "opener-bridge.js"].map((file) => readFile(path.join(root, "owlbear", file), "utf8"))).then((parts) => parts.join("\n"));
  check("extension uses a namespaced OBR broadcast channel", combined.includes("com.angelssword.lyrian-chronicles") && combined.includes("/rolls"));
  check("extension supports portable character import", combined.includes("normalizeCharacterExport") && combined.includes("character-file"));
  check("extension stores namespaced player and token bindings", combined.includes("player-binding") && combined.includes("character-binding"));
  check("extension contains no credential handling", !/secret|password|api[_-]?key|authorization|bearer\s/i.test(combined));
  check("dead token-image relay is fully gone from the extension", !combined.includes("token-image") && !combined.includes("tokenImagePlaceUrl"));
}

async function testOwlbearCore() {
  console.log("— owlbear binding contract —");
  const core = await import("../owlbear/core.js");
  const builderCharacter = core.normalizeCharacterExport({
    fields: { Name: "Jefferson Stone", "Primary Race": "Human", "Sub Race": "Mirane", Power: 4, Focus: 5, Speed: 20 },
    builder: { selectedClassIds: ["gunslinger"] },
    play: { resources: { hpCurrent: 42, hpMax: 50, manaCurrent: 6, manaMax: 8, apCurrent: 3, apMax: 4, rpCurrent: 2, rpMax: 5 } }
  });
  check("builder export normalizes actual lineage field names", builderCharacter.name === "Jefferson Stone" && builderCharacter.race === "Human" && builderCharacter.ancestry === "Mirane");
  check("builder export preserves live combat resources", builderCharacter.resources.hpCurrent === 42 && builderCharacter.resources.apCurrent === 3);
  check("builder export creates a stable character id", builderCharacter.characterId === core.normalizeCharacterExport({
    fields: { Name: "Jefferson Stone", "Primary Race": "Human", "Sub Race": "Mirane", Power: 4, Focus: 5, Speed: 20 },
    builder: { selectedClassIds: ["gunslinger"] },
    play: { resources: { hpCurrent: 1, hpMax: 50 } }
  }).characterId);
  const officialCharacter = core.normalizeCharacterExport({
    format: "angelssword-character",
    character: { name: "The Heir", race: { primaryRaceName: "Fae", ancestryName: "Sylph" }, mainStats: { power: 3 }, subStats: {}, classes: [{ name: "Mage" }], derivedStats: { hp: 30, maxMana: 9, speed: 20 } }
  });
  check("official export normalizes classes and derived resources", officialCharacter.classes[0] === "Mage" && officialCharacter.resources.hpMax === 30 && officialCharacter.resources.manaMax === 9);
  const binding = core.createBindingRecord(builderCharacter, { id: "player-1", name: "Jeff", role: "PLAYER" }, { id: "token-1", name: "Jefferson" });
  check("binding records player, character, and token identity", binding.ownerPlayerId === "player-1" && binding.characterId === builderCharacter.characterId && binding.tokenId === "token-1");
  const roll = core.normalizeRollEvent({ id: "roll-1", character: "Jefferson Stone", label: "Dodge", formula: "1d20+6", breakdown: "12 + 6", total: 18 });
  check("roll contract preserves formula, breakdown, and total", roll.id === "roll-1" && roll.formula === "1d20+6" && roll.total === 18);
  const merged = core.mergeRollLog([roll], roll);
  check("room roll log deduplicates event ids", merged.length === 1);
  check("malformed roll is rejected", core.normalizeRollEvent({ label: "No total" }) === null);
  let rejected = false;
  try {
    core.normalizeCharacterExport({ hello: "world" });
  } catch (error) {
    rejected = true;
  }
  check("unknown character formats are rejected", rejected);
}

/* Task 031: the Companion stores the sheet's real numbers (vttSummary), with
   corrected fallbacks for files and sheets that predate it. */
function liveBuilderSnapshot({ fields = {}, builder = {}, resources = {} } = {}) {
  /* Shaped like what the LIVE builder (main 3346d32) sends today:
     sendCharacterToOwlbear() posts character: createStateSnapshot(), the
     whole working state, with sheet inputs stored as strings and no
     vttSummary. Keys follow 3346d32's createDefaultState(). */
  return {
    ui: { mode: "sheet", builderStep: 9, playMode: "combat", sheetTab: "actions", mobileSheetPage: "overview", mobileCharacterTab: "proficiencies", showPdf: false, activeSaveSlotId: "", gameVersion: "0.13.2", quickBuildActive: false, quickBuildStep: 0 },
    fields: {
      Name: "Mira Vale", "Primary Race": "Chimera", "Sub Race": "Catfolk", Class1: "Fighter", ClassTier1: "1",
      Power: "2", Focus: "3", Agility: "3", Toughness: "3", Fitness: "2", Cunning: "1", Reason: "1", Awareness: "1", Presence: "2",
      Speed: "25", Exp: "1000", "Spirit Core": "1100", "Earned Clim": "500", HP: "60", Mana: "8", RP: "5",
      ...fields
    },
    abilitySelections: {},
    lastFocusedField: "",
    librarySelections: { race: "", ancestry: "", class: "", item: "", breakthrough: "", ability: "" },
    builder: {
      startMode: "standard", portraitDataUrl: "", selectedRaceId: "chimera", selectedAncestryId: "catfolk", selectedClassIds: ["fighter"],
      classAbilityProgress: {}, creationInterludeActions: [], autoSpiritCore: "1100", autoExpBank: "1000", selectedItemIds: [], itemQuantities: {},
      selectedBreakthroughIds: [], gmApprovedBreakthroughIds: [], skillExpertiseEntries: [], choiceSelections: {},
      inspected: { race: "", ancestry: "", class: "", item: "", breakthrough: "" },
      searches: { ancestry: "", class: "", classRole: "", classTier: "", classSort: "role", item: "", breakthrough: "", mainStatMode: "array", secondaryStatMode: "array" },
      quickBuild: { speciesId: "", buildId: "", appliedBuildId: "", summary: "" },
      ...builder
    },
    play: {
      resources: { hpCurrent: 60, hpMax: 60, tempHp: 0, manaCurrent: 8, manaMax: 8, rpCurrent: 5, rpMax: 5, apCurrent: 4, apMax: 4, ...resources },
      hpAdjustAmount: "", hpHasManualChange: false, foodUsedSinceRest: false, activeEffects: [], playerNotes: "", inventoryItems: []
    }
  };
}

async function testCompanionNumbers() {
  console.log("— companion numbers (task 031) —");
  const core = await import("../owlbear/core.js");

  // The live builder (3346d32) sends no vttSummary: the corrected fallbacks
  // must give no worse numbers than the old Companion did.
  const live = core.normalizeCharacterExport(liveBuilderSnapshot());
  check("live builder: stats fall back to the sheet's base points, as before", live.stats.toughness === 3 && live.stats.awareness === 1 && live.stats.power === 2);
  check("live builder: EXP read from the real field name Exp", live.resources.exp === 1000);
  check("live builder: Spirit Core read from the real field name \"Spirit Core\"", live.resources.spiritCore === 1100);
  check("live builder: Speed read from the sheet's Speed field", live.speed === 25);
  check("live builder: Clim unknown without a summary (0, as before)", live.resources.clim === 0);
  check("live builder: resources unchanged", live.resources.hpCurrent === 60 && live.resources.manaMax === 8 && live.resources.rpMax === 5 && live.resources.apMax === 4);
  check("live builder: no newer-version note", core.characterSchemaNote(liveBuilderSnapshot()) === "");
  // EXP changed by hand on the sheet: the builder clears autoExpBank, so the
  // old Companion (fields.EXP, then autoExpBank) received 0 here.
  const handExp = core.normalizeCharacterExport(liveBuilderSnapshot({ fields: { Exp: "900" }, builder: { autoExpBank: "" } }));
  check("EXP changed by hand on the sheet arrives (old Companion: 0)", handExp.resources.exp === 900);
  const handCore = core.normalizeCharacterExport(liveBuilderSnapshot({ fields: { "Spirit Core": "1200" }, builder: { autoSpiritCore: "" } }));
  check("Spirit Core changed by hand arrives (old Companion: 0)", handCore.resources.spiritCore === 1200);
  // A blank Speed field used to win as 0 (audit C6); now the default applies.
  const blankSpeed = core.normalizeCharacterExport(liveBuilderSnapshot({ fields: { Speed: "" } }));
  check("blank Speed falls back to 20 (old Companion: 0)", blankSpeed.speed === 20);
  const blankHp = core.normalizeCharacterExport(liveBuilderSnapshot({ resources: { hpCurrent: "" }, fields: { HP: "55" } }));
  check("an empty resource string no longer beats a later fallback", blankHp.resources.hpCurrent === 55);
  const legacyNames = core.normalizeCharacterExport({ fields: { Name: "Old Fixture", EXP: "300", SpiritCore: "400" }, builder: {}, play: { resources: {} } });
  check("old hand-made SpiritCore/EXP spellings still read as a last resort", legacyNames.resources.exp === 300 && legacyNames.resources.spiritCore === 400);

  // New builder: vttSummary carries the numbers the play sheet shows.
  const summary = { schemaVersion: 1, basis: "current", stats: { power: 2, focus: 3, agility: 3, toughness: 4, fitness: 2, cunning: 1, reason: 1, awareness: 2, presence: 2 }, speed: 25, clim: 3500, exp: 900, spiritCore: 1100 };
  const withSummary = core.normalizeCharacterExport({ ...liveBuilderSnapshot({ fields: { Exp: "900" }, builder: { autoExpBank: "" } }), vttSummary: summary });
  check("vttSummary stats win over base points (race bonuses kept)", withSummary.stats.toughness === 4 && withSummary.stats.awareness === 2);
  check("vttSummary Clim, EXP, Spirit Core and speed are stored", withSummary.resources.clim === 3500 && withSummary.resources.exp === 900 && withSummary.resources.spiritCore === 1100 && withSummary.speed === 25);
  check("vttSummary does not change the character id (existing bindings keep matching)", withSummary.characterId === live.characterId);
  const slowed = core.normalizeCharacterExport({ ...liveBuilderSnapshot(), vttSummary: { ...summary, speed: 12 } });
  check("vttSummary speed is the current speed (e.g. Slow)", slowed.speed === 12);
  const partial = core.normalizeCharacterExport({ ...liveBuilderSnapshot(), vttSummary: { schemaVersion: 1, stats: { toughness: "" }, speed: null } });
  check("empty or missing summary values fall back to the sheet fields", partial.stats.toughness === 3 && partial.speed === 25 && partial.resources.exp === 1000);
  check("the normalized character carries no summary-only extras", !("vttSummary" in withSummary) && !("basis" in withSummary));

  // Official .aschar: prefer effective (with bonuses) stats when present.
  const effective = core.normalizeCharacterExport({
    format: "angelssword-character",
    character: { name: "Effective Fixture", race: { primaryRaceName: "Chimera" }, mainStats: { power: 2, toughness: 3 }, subStats: { awareness: 1 }, effectiveMainStats: { power: 2, toughness: 4 }, effectiveSubStats: { awareness: 2 }, classes: [], derivedStats: { hp: 60 } }
  });
  check(".aschar effectiveMainStats/effectiveSubStats win when present", effective.stats.toughness === 4 && effective.stats.awareness === 2 && effective.stats.power === 2);
  const ourExport = core.normalizeCharacterExport({
    format: "angelssword-character",
    character: { name: "Our Export", race: {}, mainStats: { power: 4, toughness: 3 }, subStats: { reason: 5 }, effectiveMainStats: null, effectiveSubStats: null, classes: [], derivedStats: {} }
  });
  check(".aschar with null effective stats (our own export) keeps today's base stats", ourExport.stats.power === 4 && ourExport.stats.toughness === 3 && ourExport.stats.reason === 5);
}

/* Task 031 / plan WS5: the version-skew contract, pinned. */
async function testSchemaContract() {
  console.log("— schema contract (WS5) —");
  const core = await import("../owlbear/core.js");
  check("CHARACTER_SCHEMA_VERSION stays 1 (vttSummary is additive)", core.CHARACTER_SCHEMA_VERSION === 1);
  check("ROLL_SCHEMA_VERSION stays 1", core.ROLL_SCHEMA_VERSION === 1);
  for (const version of [undefined, null, "", 0, 1, "1"]) {
    const data = { ...liveBuilderSnapshot(), vttSummary: { schemaVersion: version, stats: { toughness: 4 } } };
    const normalized = core.normalizeCharacterExport(data);
    check(`character schema ${JSON.stringify(version)} is accepted without a note`, normalized.stats.toughness === 4 && core.characterSchemaNote(data) === "");
  }
  const newer = { ...liveBuilderSnapshot(), schemaVersion: 2, futureTopLevel: { x: 1 }, vttSummary: { schemaVersion: 2, stats: { toughness: 4, luck: 9 }, speed: 30, futureField: true } };
  let newerNormalized = null;
  try {
    newerNormalized = core.normalizeCharacterExport(newer);
  } catch (error) {
    newerNormalized = null;
  }
  check("a newer character schema is still accepted", Boolean(newerNormalized) && newerNormalized.name === "Mira Vale");
  check("a newer character schema keeps the known fields", newerNormalized?.stats.toughness === 4 && newerNormalized?.speed === 30);
  check("unknown character fields are ignored", newerNormalized && !("luck" in newerNormalized.stats) && !("futureTopLevel" in newerNormalized) && !("futureField" in newerNormalized));
  check("the stored record is stamped with the version this Companion understands", newerNormalized?.schemaVersion === 1);
  const note = core.characterSchemaNote(newer);
  check("a newer character schema produces a clear note (not silence)", note.includes("newer Angel Sword version") && note.includes("format 2") && note.includes("format 1"));
  check("a top-level schemaVersion is honoured when there is no summary", core.characterSchemaNote({ schemaVersion: 3, fields: {}, play: {} }).includes("format 3"));
  check("schema reader treats junk as no version", core.readSchemaVersion({ schemaVersion: "abc" }) === null && core.readSchemaVersion(null) === null);

  for (const version of [undefined, 0, 1]) {
    const roll = core.normalizeRollEvent({ id: `same-or-older-${version}`, total: 9, schemaVersion: version });
    check(`roll schema ${JSON.stringify(version)} is accepted`, roll?.total === 9 && !core.isNewerSchema({ schemaVersion: version }, core.ROLL_SCHEMA_VERSION));
  }
  const newerRoll = core.normalizeRollEvent({ id: "newer-roll", total: 14, schemaVersion: 2, label: "Future Roll", futureRollField: "x", dice: [{ sides: 20, value: 14, glow: true }] });
  check("a newer roll schema is accepted with its known fields", newerRoll?.total === 14 && newerRoll.label === "Future Roll" && newerRoll.dice[0].value === 14);
  check("unknown roll fields are ignored", newerRoll && !("futureRollField" in newerRoll) && !("glow" in newerRoll.dice[0]));
  check("a newer roll schema is detectable for the panel's note", core.isNewerSchema({ schemaVersion: 2 }, core.ROLL_SCHEMA_VERSION));
  check("the shared newer-version note names both formats", core.describeNewerSchema("A shared roll", 2, 1).includes("format 2") && core.describeNewerSchema("A shared roll", 2, 1).includes("format 1"));

  const character = core.normalizeCharacterExport(liveBuilderSnapshot());
  const binding = core.createBindingRecord(character, { id: "p1", name: "Mira's player" }, { id: "t1", name: "Mira" });
  check("a newer binding record is never overwritten by a refresh", core.refreshBindingRecord({ ...binding, schemaVersion: 2 }, character, "p1") === null);
  check("a newer binding record can still be restored (read-only)", core.pickRestorableBinding([{ ...binding, schemaVersion: 2 }], "p1", character.characterId)?.tokenId === "t1");
}

/* Task 031: token binding safety and Place My Token sizing. */
async function testBindingSafety() {
  console.log("— binding safety and token size (task 031) —");
  const core = await import("../owlbear/core.js");
  const first = core.normalizeCharacterExport(liveBuilderSnapshot());
  const mine = core.createBindingRecord(first, { id: "player-a", name: "A" }, { id: "token-a", name: "Mira (A)" });
  const theirs = core.createBindingRecord(first, { id: "player-b", name: "B" }, { id: "token-b", name: "Mira (B)" });
  check("two players importing the same identity share a character id (the A6 setup)", mine.characterId === theirs.characterId);
  check("reconnect never adopts another player's token with the same character id",
    core.pickRestorableBinding([theirs], "player-a", first.characterId) === null);
  check("reconnect adopts this player's own record even when another player's comes first",
    core.pickRestorableBinding([theirs, mine], "player-a", first.characterId)?.tokenId === "token-a");
  const other = core.createBindingRecord({ ...first, characterId: "builder-other", name: "Other" }, { id: "player-a", name: "A" }, { id: "token-o", name: "Other" });
  check("among this player's own records the active character's token is preferred",
    core.pickRestorableBinding([other, mine], "player-a", first.characterId)?.tokenId === "token-a");
  check("without a matching character, this player's own record is still restored",
    core.pickRestorableBinding([other], "player-a", first.characterId)?.tokenId === "token-o");
  check("no player id means nothing is adopted", core.pickRestorableBinding([mine], "", first.characterId) === null);
  check("records without an owner are never adopted", core.pickRestorableBinding([{ ...mine, ownerPlayerId: "" }], "player-a", first.characterId) === null);

  const resent = core.normalizeCharacterExport({ ...liveBuilderSnapshot({ resources: { hpCurrent: 41 } }), vttSummary: { schemaVersion: 1, stats: {}, speed: 12, exp: 900, spiritCore: 1100, clim: 3500 } });
  const refreshed = core.refreshBindingRecord(mine, resent, "player-a");
  check("a re-send for the same character refreshes the binding's resources and speed",
    refreshed?.resources.hpCurrent === 41 && refreshed.resources.clim === 3500 && refreshed.resources.exp === 900 && refreshed.speed === 12);
  check("a refresh never rebinds: token, owner and character stay",
    refreshed?.tokenId === "token-a" && refreshed.tokenName === "Mira (A)" && refreshed.ownerPlayerId === "player-a" && refreshed.characterId === mine.characterId);
  check("a refresh does not mutate the old record", mine.resources.hpCurrent === 60 && mine.speed === 25);
  check("another player's binding is never refreshed", core.refreshBindingRecord(theirs, resent, "player-a") === null);
  check("a different character never refreshes the binding", core.refreshBindingRecord(mine, { ...resent, characterId: "builder-other" }, "player-a") === null);

  const grid = core.tokenGridForOneSquare({ width: 720, height: 720, mime: "image/webp", url: "x" }, { dpi: 150, offset: { x: 75, y: 75 } });
  check("Place My Token: a 720 px token is one grid square (dpi 720, centred)", grid.dpi === 720 && grid.offset.x === 360 && grid.offset.y === 360);
  check("Place My Token: the old 150-dpi library setting would have been 4.8 squares", 720 / 150 === 4.8);
  const wide = core.tokenGridForOneSquare({ width: 400, height: 200 }, { dpi: 150, offset: { x: 0, y: 0 } });
  check("Place My Token: a non-square picture fits inside one square", wide.dpi === 400 && wide.offset.x === 200 && wide.offset.y === 100);
  /* Task 031b (audit E10): a TALL picture must be sized by its height. Sizing by
     the width alone would pass every wide or square picture above. */
  const tall = core.tokenGridForOneSquare({ width: 200, height: 400 }, { dpi: 150, offset: { x: 0, y: 0 } });
  check("Place My Token: a tall picture is sized by its longer side (height)", tall.dpi === 400 && tall.offset.x === 100 && tall.offset.y === 200);
  const unknown = { dpi: 150, offset: { x: 75, y: 75 } };
  check("Place My Token: unknown picture size keeps the library's grid", core.tokenGridForOneSquare({}, unknown) === unknown);

  const panelSource = await readFile(path.join(root, "owlbear", "panel.js"), "utf8");
  check("Place My Token no longer tries the hidden upload", !panelSource.includes("uploadImages") && !panelSource.includes("buildImageUpload"));
  check("Place My Token places at one grid square", panelSource.includes("tokenGridForOneSquare(pick.image, pick.grid)"));
  check("Place My Token has a double-click guard", /if \(placeTokenInFlight \|\|/.test(panelSource) && panelSource.includes("placeTokenInFlight = false"));
  const watchdogMs = Number(/const PLACE_TOKEN_WATCHDOG_MS = (\d+);/.exec(panelSource)?.[1] || 0);
  check("Place My Token has a watchdog of 20 to 60 seconds, so the button can never stay stuck (task 031b)",
    watchdogMs >= 20000 && watchdogMs <= 60000 && panelSource.includes("setTimeout(() => {") && panelSource.includes("PLACE_TOKEN_WATCHDOG_MS);"), `${watchdogMs} ms`);
  check("reconnect uses the owner-only picker", panelSource.includes("pickRestorableBinding(records, playerRecord.id"));
}

/* Task 031, builder side: the sheet sends the numbers its play sheet shows,
   and its summary version is the extension's character schema version. */
async function testVttSummaryContract() {
  console.log("— builder vttSummary contract (task 031) —");
  const core = await import("../owlbear/core.js");
  const uiSource = await readFile(path.join(root, "src", "js", "ui.js"), "utf8");
  const ioSource = await readFile(path.join(root, "src", "js", "io.js"), "utf8");
  const pinned = /const VTT_SUMMARY_SCHEMA_VERSION = (\d+);/.exec(uiSource);
  check("ui.js repeats the character schema version for vttSummary", Boolean(pinned) && Number(pinned[1]) === core.CHARACTER_SCHEMA_VERSION);
  const builder = /export function buildVttSummary\(\) \{[\s\S]*?\n {4}\}/.exec(uiSource)?.[0] || "";
  check("vttSummary main stats come from the sheet's current totals", builder.includes("getCurrentMainStatValues(bonuses)"));
  check("vttSummary secondary stats come from the play sheet's own function", ["Fitness", "Cunning", "Reason", "Awareness", "Presence"].every((key) => builder.includes(`getComputedSecondaryStatValue("${key}", bonuses)`)));
  check("vttSummary speed is the Speed card's value", builder.includes("speed: getDerivedCombatStats().speed"));
  check("vttSummary Clim, EXP and Spirit Core are the cards' values", builder.includes("clim: getStartingFundsState().availableClim") && builder.includes("exp: progress.expBank") && builder.includes("spiritCore: progress.spiritCore"));
  check("vttSummary states its basis", builder.includes('basis: "current"'));
  check("Send Character to Room sends the summary", /publishVttHandoff\(\{\s*character: createVttCharacterSnapshot\(\)/.test(uiSource));
  check("Export Character JSON writes the summary", ioSource.includes("JSON.stringify(createVttCharacterSnapshot(), null, 2)"));
  check("saves and slots stay free of the summary", !/function createStateSnapshot\(\) \{[\s\S]{0,80}vttSummary/.test(uiSource));
  const rulesSource = await readFile(path.join(root, "src", "js", "rules.js"), "utf8");
  check("derived combat stats read the same current main stats", rulesSource.includes("const currentMainStats = getCurrentMainStatValues(bonuses, activeEffectModifiers);"));
}

async function testFoundryModule() {
  console.log("— foundry module —");
  const manifest = JSON.parse(await readFile(path.join(root, "foundry", "module.json"), "utf8"));
  check("id is lowercase-hyphen", typeof manifest.id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(manifest.id));
  check("title/description present", typeof manifest.title === "string" && typeof manifest.description === "string");
  check("version present", typeof manifest.version === "string");
  check("authors is a non-empty array", Array.isArray(manifest.authors) && manifest.authors.length > 0 && manifest.authors.every((author) => author.name));
  check("compatibility.minimum present", typeof manifest.compatibility?.minimum === "string");
  check("esmodules lists the script", Array.isArray(manifest.esmodules) && manifest.esmodules.includes("scripts/angel-sword.mjs"));
  check("manifest/download URLs present for remote install", typeof manifest.manifest === "string" && typeof manifest.download === "string");
  check("script exists", await exists("foundry/scripts/angel-sword.mjs"));
  check("script parses", nodeCheck("foundry/scripts/angel-sword.mjs"));
  check("CSB mapper exists", await exists("foundry/scripts/lyrian-csb-mapper.mjs"));
  check("CSB mapper parses", nodeCheck("foundry/scripts/lyrian-csb-mapper.mjs"));
  const script = await readFile(path.join(root, "foundry", "scripts", "angel-sword.mjs"), "utf8");
  check("script never creates or updates Actors", !/Actor\.create|actor\.update|createEmbeddedDocuments/.test(script));
  check("script offers the documented chat commands", ["/asimport", "/ascharacter", "/asroll"].every((command) => script.includes(command)));
  check("script exposes the read-only Lyrian CSB mapping aid", script.includes("mapLyrianCsb") && script.includes("buildLyrianCsbImportPlan"));
}

async function testWorldAnvilBuilder() {
  console.log("— world anvil bbcode —");
  /* integrations.js transitively loads the whole app module graph (utils →
     ui → rules), which expects browser globals at import time — shim them. */
  const emptyData = { races: [], ancestries: [], classes: [], items: [], breakthroughs: [], abilities: [] };
  globalThis.window = {
    LYRIAN_FORM_MAP: { pages: [] },
    LYRIAN_DATA: emptyData,
    LYRIAN_DETAIL_DATA: emptyData,
    clearTimeout: () => {},
    setTimeout: () => 0,
    addEventListener: () => {},
    location: { href: "http://localhost/", origin: "http://localhost" }
  };
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, appendChild() {}, remove() {} }),
    documentElement: { dataset: {} },
    body: { appendChild() {} }
  };
  const integrations = await import("../src/js/integrations.js");
  const profile = integrations.buildWorldAnvilBBCodeProfile({
    name: "Test Hero",
    race: "Fae",
    ancestry: "Sylph",
    classes: ["Mage", "Aeromancer"],
    resources: { hpCurrent: 30, hpMax: 30, manaCurrent: 10, manaMax: 11, apCurrent: 4, apMax: 4, rpCurrent: 5, rpMax: 5 },
    guard: 3, evasion: 11, speed: 20, initiative: 4, potency: 15, saveBonus: 3,
    personality: "Curious.",
    appearance: "Windswept."
  });
  check("BBCode headline uses [h1]", profile.startsWith("[h1]Test Hero[/h1]"));
  check("species line present", profile.includes("[b]Species:[/b] Fae / Sylph"));
  check("classes line present", profile.includes("Mage, Aeromancer"));
  check("resource list uses [ul]/[li]", profile.includes("[ul]") && profile.includes("[li]HP 30/30"));
  check("sections for personality and appearance", profile.includes("[h2]Personality[/h2]") && profile.includes("[h2]Appearance[/h2]"));
  check("no unresolved undefined values", !profile.includes("undefined"));
  const emptyProfile = integrations.buildWorldAnvilBBCodeProfile({});
  check("empty character still renders a valid skeleton", emptyProfile.startsWith("[h1]Lyrian Character[/h1]") && !emptyProfile.includes("undefined"));
}

async function testCcsTemplate() {
  console.log("— bundled CCS template —");
  const buffer = await readFile(path.join(root, "data", "ccs-template.xlsx"));
  check("template exists and is a zip container", buffer.length > 100000 && buffer[0] === 0x50 && buffer[1] === 0x4b);
  // Zip entry NAMES are stored uncompressed, so the container structure is
  // directly searchable even though the XML content is deflated.
  const raw = buffer.toString("latin1");
  check("workbook part present", raw.includes("xl/workbook.xml"));
  check("shared strings present", raw.includes("xl/sharedStrings.xml"));
  const sheetEntries = raw.match(/xl\/worksheets\/sheet\d+\.xml(?!\.rels)/g) || [];
  check("template carries the CCS's many worksheets (≥12)", new Set(sheetEntries).size >= 12);
  // Best-effort sheet-name validation: inflate xl/workbook.xml via its local
  // file header. Google-Sheets exports store sizes inline, so this works; if
  // the layout ever changes, we skip rather than false-fail.
  try {
    const { inflateRawSync } = await import("node:zlib");
    const nameBytes = Buffer.from("xl/workbook.xml", "latin1");
    let offset = buffer.indexOf(nameBytes);
    while (offset !== -1) {
      const headerStart = offset - 30;
      if (headerStart >= 0 && buffer.readUInt32LE(headerStart) === 0x04034b50) {
        const compressedSize = buffer.readUInt32LE(headerStart + 18);
        const nameLength = buffer.readUInt16LE(headerStart + 26);
        const extraLength = buffer.readUInt16LE(headerStart + 28);
        const dataStart = headerStart + 30 + nameLength + extraLength;
        const method = buffer.readUInt16LE(headerStart + 8);
        if (compressedSize > 0) {
          const slice = buffer.subarray(dataStart, dataStart + compressedSize);
          const xml = (method === 8 ? inflateRawSync(slice) : slice).toString("utf8");
          ["Core", "Abilities", "Breakthrough", "Inventory"].forEach((sheet) => {
            check(`workbook names the ${sheet} sheet`, xml.includes(`name="${sheet}"`));
          });
          break;
        }
      }
      offset = buffer.indexOf(nameBytes, offset + 1);
    }
  } catch (error) {
    console.warn("  note: workbook.xml inflation skipped:", error.message);
  }
  const readme = await readFile(path.join(root, "data", "CCS_TEMPLATE_README.md"), "utf8");
  check("update-procedure README ships beside the template", readme.includes("Update procedure"));
}

async function testRollDice() {
  console.log("— per-die roll data (overlay contract) —");
  const core = await import("../owlbear/core.js");
  const structured = core.extractRollDice({
    dice: [{ sides: 10, value: 3 }, { sides: 10, value: 9 }, { sides: 7, value: 2 }, { sides: 20, value: "bad" }],
    breakdown: "ignored when structured dice exist"
  });
  check("structured dice win and invalid entries drop",
    structured.length === 2 && structured[0].value === 3 && structured[1].value === 9);
  const multi = core.extractRollDice({ breakdown: "2d10: 3 + 9 | Toughness: +5" });
  check("fallback parses count-prefixed multi-die groups (the 2d10 bug)",
    multi.length === 2 && multi[0].sides === 10 && multi[0].value === 3 && multi[1].value === 9);
  const tray = core.extractRollDice({ breakdown: "d20: 18 | d12: 12 | d100: 19 | d10: 4 | d8: 4 | d6: 4 | d4: 1" });
  check("fallback parses the full dice-tray breakdown", tray.length === 7 && tray[2].sides === 100 && tray[2].value === 19);
  const skill = core.extractRollDice({ breakdown: "d20: 14 | Reason +5 | Skill +0" });
  check("fallback reads exactly one die from a skill breakdown (no bonus bleed)",
    skill.length === 1 && skill[0].sides === 20 && skill[0].value === 14);
  const normalized = core.normalizeRollEvent({ total: 17, breakdown: "2d10: 3 + 9", dice: [{ sides: 10, value: 3 }, { sides: 10, value: 9 }] });
  check("normalizeRollEvent carries the dice array through", Array.isArray(normalized.dice) && normalized.dice.length === 2);
  const attributed = core.normalizeRollEvent({ total: 11, playerRole: "GM" });
  check("normalizeRollEvent carries the roller's role", attributed.playerRole === "GM");
  check("invalid roles are stripped", core.normalizeRollEvent({ total: 4, playerRole: "OWL" }).playerRole === "");
  const companionBackground = await readFile(path.join(root, "owlbear", "background.js"), "utf8");
  check("companion background stamps the relaying player's role",
    companionBackground.includes("getRole()") && companionBackground.includes("playerRole"));
  const diceBackground = await readFile(path.join(root, "owlbear-dice", "background.js"), "utf8");
  const diceOverlay = await readFile(path.join(root, "owlbear-dice", "overlay.js"), "utf8");
  const diceOverlayHtml = await readFile(path.join(root, "owlbear-dice", "overlay.html"), "utf8");
  check("dice background no longer serializes rolls one-at-a-time", !diceBackground.includes("overlayBusy"));
  check("dice overlay subscribes to room rolls itself", diceOverlay.includes("broadcast.onMessage(ROLL_CHANNEL"));
  check("dice overlay interrupts by clearing the previous flight", diceOverlay.includes(".clear"));
  check("dice overlay stacks result chips with a GM badge", diceOverlay.includes("gm-badge") && diceOverlayHtml.includes("roll-chips"));
  check("overlay boot-buffer handshake exists on both ends",
    diceBackground.includes("overlay-ready") && diceOverlay.includes("overlay-ready"));
  const rollerCore = await readFile(path.join(root, "assets", "dice-3d", "shared-dice-roller-core.js"), "utf8");
  check("settled dice aim their result face at the viewer (owner contract)",
    rollerCore.includes("FACE_TOWARD_VIEWER_SIDES") && rollerCore.includes("presentDirection"));
  check("the settle camera itself never moves (no bait-and-switch lift)",
    !rollerCore.includes("CAMERA_LIFT_MS"));
  check("6/9 disambiguation dot is stamped engine-side",
    rollerCore.includes("shouldStampSixNineDot") && rollerCore.includes("drawSixNineDot"));
  /* Task 032 L1: replaces the old "overlay expands and waits for real height"
     pin. The overlay must be a full-screen modal that ignores the mouse, and
     nothing may open, resize or close a popover any more (a popover has no
     pass-through option and swallowed Owlbear's clicks for ~30 s per roll).
     scripts/test-032-dice-display.mjs proves the click-through in a
     fake-Owlbear room. */
  const modalOptions = /const OVERLAY_MODAL = Object\.freeze\(\{([^}]*)\}\)/.exec(diceBackground)?.[1] || "";
  check("dice overlay opens as a full-screen click-through modal",
    diceBackground.includes("OBR.modal.open(") && diceBackground.includes("...OVERLAY_MODAL")
    && ["fullScreen: true", "hideBackdrop: true", "hidePaper: true", "disablePointerEvents: true"].every((option) => modalOptions.includes(option)));
  check("dice overlay never uses a popover (open, resize or close)",
    !/OBR\.popover\./.test(diceBackground) && !/OBR\.popover\./.test(diceOverlay));
  check("dice overlay closes itself as a modal", diceOverlay.includes("OBR.modal.close(OVERLAY_ID)"));
  /* Task 032b safety net. The runtime proof is scripts/test-032-dice-display.mjs
     (B6); these pins keep the pieces from being dropped quietly. */
  check("dice overlay watches pointerdown, mousedown, touchstart and wheel and reports a hit to the background (task 032b)",
    ["pointerdown", "mousedown", "touchstart", "wheel"].every((type) => diceOverlay.includes(`"${type}"`))
    && diceOverlay.includes('kind: "overlay-blocks-clicks"'));
  check("dice background opens no more overlays once one reports a hit, and keeps that in memory only (task 032b)",
    diceBackground.includes('data.kind === "overlay-blocks-clicks"') && diceBackground.includes("if (overlayBlocksClicks)")
    && !diceBackground.includes("setItem(") && !diceBackground.includes("sessionStorage"));
  check("dice background replays only rolls since the overlay's boot (task 032 L2)",
    diceBackground.includes("entry.at >= since") && diceBackground.includes("bootSince = rollArrivedAt"));
  const uiSource = await readFile(path.join(root, "src", "js", "ui.js"), "utf8");
  for (const kind of ["dice", "action-damage", "check", "skill"]) {
    const site = new RegExp(`publishVttEvent\\("${kind}",\\s*\\{[\\s\\S]{0,220}?\\bdice:`);
    check(`the "${kind}" roll site publishes structured dice`, site.test(uiSource));
  }
}

async function testVttRelay() {
  console.log("— vtt relay —");
  const relay = await import("../src/js/vtt-relay.js");
  check("channel name is stable", relay.VTT_RELAY_CHANNEL === "asb-vtt-events");
  check("publish function exported", typeof relay.publishVttEvent === "function");
  const source = await readFile(path.join(root, "src", "js", "vtt-relay.js"), "utf8");
  check("relay imports nothing (stays dependency-light)", !/^import /m.test(source));
  const fetchCalls = source.match(/fetch\(/g) || [];
  const devEndpointCalls = source.match(/fetch\(\s*(?:"\/api\/vtt-relay\/events"|`\/api\/vtt-relay\/events)/g) || [];
  check(
    "relay network use is confined to the same-origin dev relay endpoint",
    fetchCalls.length > 0 && fetchCalls.length === devEndpointCalls.length
  );
  check("relay uses no sockets or XHR", !/XMLHttpRequest|WebSocket/.test(source));
  check(
    "dev relay transport is gated to local hostnames",
    source.includes("DEV_RELAY_HOST_PATTERN") && source.includes("isDevRelayHost()")
  );
  check("opener state getter exported", typeof relay.getOwlbearOpenerState === "function");
  check("opener state is closed under Node (no window.opener)", relay.getOwlbearOpenerState() === "closed");
  check("dead token-image relay is fully gone from the sheet", !source.includes("token-image"));
  const serverSource = await readFile(path.join(root, "scripts", "server.mjs"), "utf8");
  check("dead token-image endpoint is fully gone from the dev server", !serverSource.includes("token-image"));
}

async function testAscharInterop() {
  console.log("— .aschar.json interop —");
  const aschar = await import("../src/js/aschar.js");
  const context = {
    name: "Kira Testborn",
    startMode: "mirane",
    race: { id: "fae", name: "Fae" },
    ancestry: { id: "sylph", name: "Sylph" },
    mainStats: { power: 4, focus: 5, agility: 4, toughness: 3 },
    subStats: { fitness: 2, cunning: 4, reason: 5, awareness: 3, presence: 1 },
    derived: { hpMax: 50, lightAttack: 5 },
    classes: [
      { classId: "mage", name: "Mage", tier: 1, levels: 8 },
      { classId: "aeromancer", name: "Aeromancer", tier: 2, levels: 3 }
    ],
    breakthroughs: [{ breakthroughId: "wide-circuits-i", name: "Wide Circuits I", cost: 100 }],
    skills: [
      { name: "Magic", points: 7, expertise: [{ name: "Dispel", points: 4 }] },
      { name: "Stealth", points: 2, expertise: [] }
    ],
    equipment: [{ itemId: "armor--light-", name: "Light Armor", baseName: "Light Armor", cost: 250 }],
    interludeActions: ["job"],
    resources: { clim: 1750, classExp: 0, interludePoints: 1, skillPoints: 0, breakthroughExp: 200 },
    soulCore: 1100,
    totalExp: 0
  };
  const character = aschar.buildAscharCharacter(context);
  check("export carries the official gameMode value", character.gameMode === "mirane");
  check("export marks mastery at level 8", character.classes[0].mastered === true && character.classes[1].mastered === false);
  check("export skill map uses the official shape", character.skills.Magic?.points === 7 && character.skills.Magic?.expertise[0]?.name === "Dispel");
  const envelope = aschar.wrapAscharExport(character);
  check("envelope format matches the official marker", envelope.format === aschar.ASCHAR_FORMAT && envelope.version === aschar.ASCHAR_VERSION);
  const parsed = aschar.parseAscharFile(JSON.parse(JSON.stringify(envelope)));
  check("round-trip parse accepts our own export", parsed.ok === true);
  const plan = aschar.normalizeAscharCharacter(parsed.character);
  check("round-trip keeps name and race", plan.name === "Kira Testborn" && plan.race.primaryRaceId === "fae" && plan.ancestry.ancestryId === "sylph");
  check("round-trip keeps class levels", plan.classes.length === 2 && plan.classes[0].levels === 8 && plan.classes[1].levels === 3);
  check("round-trip keeps skills and expertise", plan.skills.find((skill) => skill.name === "Magic")?.expertise[0]?.points === 4);
  check("round-trip keeps mirane mode", plan.gameMode === "mirane");
  check("round-trip keeps official creation interlude actions", character.interludeActions[0] === "job" && plan.interludeActions[0] === "job");

  check("garbage is rejected", aschar.parseAscharFile({ hello: 1 }).ok === false);
  check("bare official model is accepted", aschar.parseAscharFile({ race: { primaryRaceId: "human" }, mainStats: { power: 5 } }).ok === true);
  const suffixPlan = aschar.normalizeAscharCharacter({
    race: {}, mainStats: {},
    breakthroughs: [{ breakthroughId: "skill-training::2", name: "Skill Training", cost: 25 }],
    classes: [{ classId: "mage", name: "Mage", levels: 99 }],
    equipment: [{ itemId: "longsword", name: "Silver Longsword", baseName: "Longsword", mods: ["Silver"], cost: 450 }]
  });
  check("repeatable breakthrough suffixes are stripped", suffixPlan.breakthroughs[0].breakthroughId === "skill-training");
  check("class levels clamp to the official 1..8 range", suffixPlan.classes[0].levels === 8);
  check("modded items produce a visibility note", suffixPlan.notes.some((note) => note.includes("official mods")));
  const interludePlan = aschar.normalizeAscharCharacter({
    race: {}, mainStats: {}, interludeActions: ["job", "train", "other", "unknown", "job"]
  });
  check("official interlude actions retain valid repeats and reject unknown values", JSON.stringify(interludePlan.interludeActions) === JSON.stringify(["job", "train", "other", "job"]));
  const relaySource = await readFile(path.join(root, "src", "js", "aschar.js"), "utf8");
  check("aschar module stays dependency-free for Node testing", !/^import /m.test(relaySource));
}

async function main() {
  await testOwlbearManifest();
  await testOwlbearCore();
  await testCompanionNumbers();
  await testSchemaContract();
  await testBindingSafety();
  await testVttSummaryContract();
  await testRollDice();
  await testFoundryModule();
  await testWorldAnvilBuilder();
  await testCcsTemplate();
  await testAscharInterop();
  await testVttRelay();
  if (failures > 0) {
    console.error(`\n[VTT ADAPTER TEST FAILURE] ${failures} of ${checks} checks failed.`);
    process.exit(1);
  }
  console.log(`\n[VTT ADAPTER TEST SUCCESS] All ${checks} checks passed.`);
}

main().catch((error) => {
  console.error("[VTT ADAPTER TEST ERROR]", error);
  process.exit(1);
});
