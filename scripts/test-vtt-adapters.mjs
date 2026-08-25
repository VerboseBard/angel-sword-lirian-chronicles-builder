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
  check("overlay expands and waits for real height before rolling (no stretch)",
    diceOverlay.includes("expandOverlay().then") && diceOverlay.includes("window.innerHeight - targetHeight"));
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
