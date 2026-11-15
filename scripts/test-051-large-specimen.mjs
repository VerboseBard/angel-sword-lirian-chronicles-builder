import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";

const candidate = new URL("../", import.meta.url);
function evaluateAsset(asset) {
  const file = new URL(asset, candidate);
  runInThisContext(readFileSync(file, "utf8"), { filename: file.pathname });
}

const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
function element() {
  const listeners = new Map();
  return {
    classList, dataset: {}, style: { setProperty() {}, removeProperty() {} }, listeners,
    addEventListener(type, handler) { listeners.set(type, handler); },
    appendChild() {}, scrollIntoView() {}, setAttribute() {}, removeAttribute() {}, remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}
const html = readFileSync(new URL("index.html", candidate), "utf8");
const nodes = new Map(Array.from(html.matchAll(/\bid="([^"]+)"/g), ([, id]) => [id, element()]));
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};
globalThis.FileReader = class {
  readAsText(file) {
    file.text().then((value) => {
      this.result = value;
      this.onload();
    }, (error) => {
      this.error = error;
      this.onerror();
    });
  }
};
globalThis.window = {
  addEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  setTimeout, clearTimeout, clearInterval,
  setInterval: (...args) => setInterval(...args).unref()
};
globalThis.BroadcastChannel = undefined;
globalThis.document = {
  addEventListener() {},
  body: element(),
  head: {
    appendChild(script) {
      evaluateAsset(script.src);
      script.onload();
    }
  },
  getElementById: id => nodes.get(id) || null,
  createElement: element,
  querySelector: selector => selector === "#sheet-view .play-dashboard" ? element() : null,
  querySelectorAll: () => []
};

for (const asset of ["lyrian-form-map.js", "versions/manifest.js", "versions/0.13.3/lyrian-data.js", "versions/0.13.3/lyrian-detail-data.js"]) {
  evaluateAsset("assets/" + asset);
}

const ui = await import("../src/js/ui.js");
const rules = await import("../src/js/rules.js");
const saves = await import("../src/js/io.js");
const { state, createDefaultState } = await import("../src/js/state.js");
const { ASCHAR_FORMAT } = await import("../src/js/aschar.js");
const { LARGE_SPECIMEN_BREAKTHROUGH: largeSpecimen } = await import("../src/js/constants.js");
const prior = largeSpecimen.historical;
const current = largeSpecimen.maleOni;

let checks = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}
function reset(ancestry, gender = "") {
  Object.assign(state, createDefaultState());
  state.ui.gameVersion = window.LYRIAN_DATA.version;
  state.builder.selectedRaceId = ["nio", "oni"].includes(ancestry) ? "youkai" : "chimera";
  state.builder.selectedAncestryId = ancestry;
  state.fields.Gender = gender;
}
async function selectRule(version) {
  const result = await rules.applyGameVersion(version, { persistSelection: false, status: false });
  if (!result) throw new Error(nodes.get("status-pill").textContent);
  return result;
}
function eligible(reference) {
  return ui.getBreakthroughRequirementStatus(rules.lookup.breakthroughs.resolve(reference)).met;
}
function officialFile({ gender, breakthrough }) {
  const character = {
    name: "Oni fixture",
    gender,
    race: { primaryRaceId: "youkai", ancestryId: "oni" },
    mainStats: { power: 5, focus: 4, agility: 4, toughness: 3 },
    breakthroughs: [{ breakthroughId: breakthrough.id, name: breakthrough.name }]
  };
  return new File([JSON.stringify({ format: ASCHAR_FORMAT, version: 1, character })], "oni.aschar.json");
}

check(rules.lookup.breakthroughs.resolve(prior.id).id, current.id, "old slug aliases to current data");
check(rules.lookup.breakthroughs.resolve(prior.name).id, current.id, "old visible name aliases to current data");
for (const [ancestry, gender, expected] of [
  ["nio", "", true], ["bullfolk", "", true], ["bearfolk", "", true],
  ["oni", " Male ", true], ["oni", "Female", false], ["oni", "", false],
  ["pigfolk", "Male", false]
]) {
  reset(ancestry, gender);
  check(eligible(current.id), expected, "0.13.3 eligibility for " + ancestry + " " + gender);
}

reset("nio");
state.builder.selectedBreakthroughIds = [prior.id, current.id, "unknown-kept-breakthrough"];
state.builder.gmApprovedBreakthroughIds = [prior.id, current.id, "other-approval"];
state.builder.inspected.breakthrough = prior.id;
ui.hydrateBuilderSelectionsFromFields();
check(state.builder.selectedBreakthroughIds, [current.id, "unknown-kept-breakthrough"], "normalize and deduplicate this purchase only");
check(state.builder.gmApprovedBreakthroughIds, [current.id, "other-approval"], "normalize GM approval");
check(state.builder.inspected.breakthrough, current.id, "normalize inspection");
check(rules.getBreakthroughBudgetState().spent, 100, "charge one purchase");

check(await selectRule("0.13.2"), true, "switch to historical rules");
check(state.builder.selectedBreakthroughIds, [prior.id, "unknown-kept-breakthrough"], "keep purchase across backward switch");
check(state.builder.gmApprovedBreakthroughIds, [prior.id, "other-approval"], "keep approval across backward switch");
check(rules.lookup.breakthroughs.resolve(current.name).id, prior.id, "current visible name aliases to historical data");
check(await selectRule("0.13.3"), true, "switch back to current rules");
check(state.builder.selectedBreakthroughIds, [current.id, "unknown-kept-breakthrough"], "keep purchase across forward switch");

const olderSnapshot = createDefaultState();
olderSnapshot.ui.gameVersion = "0.13.2";
olderSnapshot.builder.selectedRaceId = "youkai";
olderSnapshot.builder.selectedAncestryId = "nio";
olderSnapshot.builder.selectedBreakthroughIds = [prior.id];
olderSnapshot.builder.gmApprovedBreakthroughIds = [prior.id];
check(saves.loadSavedState(olderSnapshot), true, "load older snapshot");
check(state.builder.selectedBreakthroughIds, [prior.id], "keep old ID while old bundle is pending");
check(await rules.alignLoadedStateGameVersion(), true, "align loaded snapshot with older rules");
check(state.builder.selectedBreakthroughIds, [prior.id], "older saved ID survives hydration");
check(state.builder.gmApprovedBreakthroughIds, [prior.id], "older GM approval survives hydration");
check(await selectRule("0.13.3"), true, "switch older saved character to current rules");
check(state.builder.selectedBreakthroughIds, [current.id], "older saved purchase uses the new ID");

check(await saves.handleImportedCharacterFile(officialFile({ gender: "Male", breakthrough: prior })), true, "import representative official envelope");
check(state.fields.Gender, "Male", "official character gender survives import");
check(state.builder.selectedBreakthroughIds, [current.id], "official historical slug uses the current ID");
check(state.builder.unmetBreakthroughIds, [], "male Oni import satisfies requirement");
check(await selectRule("0.13.2"), true, "switch male Oni import to older rules");
check(state.builder.selectedBreakthroughIds, [prior.id], "older rules retain incompatible purchase for review");
check(state.builder.unmetBreakthroughIds, [prior.id], "older rules flag the Oni purchase");
check(eligible(prior.id), false, "older rules exclude even male Oni");
check(await selectRule("0.13.3"), true, "switch Oni back to current rules");
check(state.builder.selectedBreakthroughIds, [current.id], "Oni purchase canonicalizes again");
check(state.builder.unmetBreakthroughIds, [], "current rules clear the review flag");

check(await saves.handleImportedCharacterFile(officialFile({ gender: "Female", breakthrough: current })), true, "import representative female Oni envelope");
check(state.builder.unmetBreakthroughIds, [current.id], "ineligible import kept and flagged");
check(state.builder.selectedBreakthroughIds, [current.id], "ineligible imported purchase remains present");

state.ui.builderStep = 5;
ui.renderBuilder();
const content = nodes.get("builder-step-content");
check(content.innerHTML.includes('data-id="' + current.id + '"'), true, "ineligible saved purchase renders on breakthrough step");
await ui.bindEvents();
const toggle = content.listeners.get("click");
const trigger = element();
trigger.dataset = { builderAction: "toggle-breakthrough", id: prior.id };
await toggle({ target: { closest: selector => selector === "[data-builder-action]" ? trigger : null } });
check(state.builder.selectedBreakthroughIds, [], "remove a kept purchase using the historical ID");
check(state.builder.unmetBreakthroughIds, [], "removal clears the review flag");
check(rules.getBreakthroughBudgetState().creationRemaining, 300, "remove refunds its 100 creation EXP");
await toggle({ target: { closest: selector => selector === "[data-builder-action]" ? trigger : null } });
check(state.builder.selectedBreakthroughIds, [], "female Oni cannot repurchase the breakthrough");

console.log("Task 051 source integration passed " + checks + " checks.");
