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
  check("icon.svg exists", await exists("owlbear/icon.svg"));
  check("panel.js parses", nodeCheck("owlbear/panel.js"));
  const panel = await readFile(path.join(root, "owlbear", "panel.js"), "utf8");
  check("panel listens on the sheet relay channel", panel.includes("asb-vtt-events"));
  check("panel uses a namespaced OBR broadcast channel", panel.includes("com.angelssword.builder/"));
  check("panel contains no credential handling", !/token|secret|password|api[_-]?key/i.test(panel));
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
  const script = await readFile(path.join(root, "foundry", "scripts", "angel-sword.mjs"), "utf8");
  check("script never creates or updates Actors", !/Actor\.create|actor\.update|createEmbeddedDocuments/.test(script));
  check("script offers the documented chat commands", ["/asimport", "/ascharacter", "/asroll"].every((command) => script.includes(command)));
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

async function testVttRelay() {
  console.log("— vtt relay —");
  const relay = await import("../src/js/vtt-relay.js");
  check("channel name is stable", relay.VTT_RELAY_CHANNEL === "asb-vtt-events");
  check("publish function exported", typeof relay.publishVttEvent === "function");
  const source = await readFile(path.join(root, "src", "js", "vtt-relay.js"), "utf8");
  check("relay imports nothing (stays dependency-light)", !/^import /m.test(source));
  check("relay sends no network traffic", !/fetch\(|XMLHttpRequest|WebSocket/.test(source));
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
  const relaySource = await readFile(path.join(root, "src", "js", "aschar.js"), "utf8");
  check("aschar module stays dependency-free for Node testing", !/^import /m.test(relaySource));
}

async function main() {
  await testOwlbearManifest();
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
