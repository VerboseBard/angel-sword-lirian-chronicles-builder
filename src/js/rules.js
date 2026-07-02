import { BASE_STARTING_CLIM, BREAKTHROUGH_CREATION_BUDGET, CLASS_ROWS, SELECTED_GAME_VERSION_KEY, SELECTED_GAME_VERSION_LATEST_KEY, SKILL_DEFINITIONS, STARTING_CLASS_EXP, STARTING_INTERLUDE_POINTS } from "./constants.js";
import { asArray, buildLookup, clamp, cleanText, formatModifier, normalizeKey, normalizePhrase, toNumber } from "./utils.js";
import { mergePlayState, persistWorkingState, state, trySetLocalStorage } from "./state.js";
import { parseNumericCost } from "./io.js";
import { appendPlayLog, applyStateToDom, buildComputedBonuses, buildDemonClanEntry, clearPlayFeedback, createDatalists, firstReadableText, formatCostLabelForDisplay, formatTrackedCostSpend, getAllSecondaryLineageOptions, getClassProgressCost, getClassProgressSlotCount, getClassPurchasedAbilityCount, getSelectedBreakthroughEffects, getSelectedEquipmentCost, getSkillRowData, hideVersionProgress, invalidateExportCache, loadScriptAsset, parseResourceCost, renderBuilder, renderPlayDashboard, renderPlayDashboardIfVisible, renderVersionManager, setStatus, setVersionProgress, showPlayFeedback } from "./ui.js";


let computedBonusesCacheKey = "";
let computedBonusesCacheValue = null;

























    export let lookup = buildLookup(window.LYRIAN_DATA);
export let detailLookup = buildLookup(window.LYRIAN_DETAIL_DATA);
export function refreshGameDataRuntime() {
      lookup = buildLookup(window.LYRIAN_DATA);
      detailLookup = buildLookup(window.LYRIAN_DETAIL_DATA);
    }
export const versionRuntime = {
      serverAvailable: false,
      latestCheck: null,
      isLoading: false
    };
    export const exportPrepCache = {
      key: "",
      payload: null,
      promise: null,
      timer: 0,
      preparedAt: 0
    };
const RACE_REQUIREMENT_ALIASES = {
      fae: ["faerie"]
    };
function compareVersionIds(a, b) {
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
export function getVersionManifest() {
      const fallbackVersion = window.LYRIAN_DATA?.version || "0.12.5";
      return window.LYRIAN_VERSION_MANIFEST || {
        schema: 1,
        defaultVersion: fallbackVersion,
        latestKnownVersion: fallbackVersion,
        officialManualUrl: "https://rpg.angelssword.com/game/online-manual",
        versions: [
          {
            id: fallbackVersion,
            label: `${fallbackVersion} - Lyrian Chronicles`,
            status: "bundled",
            local: true,
            updates: ["Bundled rules data loaded directly from the character sheet assets."]
          }
        ]
      };
    }
export function getVersionRecords() {
      return [...(getVersionManifest().versions || [])].sort((a, b) => compareVersionIds(a.id, b.id));
    }
export function getVersionRecord(versionId) {
      const normalized = String(versionId || "").trim();
      return getVersionRecords().find((entry) => entry.id === normalized) || getVersionRecords()[0] || null;
    }
export function getDefaultGameVersionId() {
      const manifest = getVersionManifest();
      return manifest.latestKnownVersion || manifest.defaultVersion || window.LYRIAN_DATA?.version || "";
    }
export function persistSelectedGameVersion(versionId) {
      trySetLocalStorage(SELECTED_GAME_VERSION_KEY, versionId, "selected Lyrian rules version");
      trySetLocalStorage(SELECTED_GAME_VERSION_LATEST_KEY, getDefaultGameVersionId(), "selected Lyrian rules version baseline");
    }
export function shouldPromoteSavedVersionToLatest(savedVersion) {
      const defaultVersion = getDefaultGameVersionId();
const storedLatest = localStorage.getItem(SELECTED_GAME_VERSION_LATEST_KEY) || "";
      return Boolean(
        savedVersion &&
        getVersionRecord(savedVersion) &&
        compareVersionIds(defaultVersion, savedVersion) > 0 &&
        (!storedLatest || compareVersionIds(defaultVersion, storedLatest) > 0)
      );
    }
export function getSelectedGameVersionId() {
      if (state.ui.gameVersion) {
        return state.ui.gameVersion;
      }
const defaultVersion = getDefaultGameVersionId();
const storedVersion = localStorage.getItem(SELECTED_GAME_VERSION_KEY) || "";
const storedLatest = localStorage.getItem(SELECTED_GAME_VERSION_LATEST_KEY) || "";
      if (!storedVersion || !getVersionRecord(storedVersion)) {
        return defaultVersion;
      }
const manifestAdvanced = !storedLatest || compareVersionIds(defaultVersion, storedLatest) > 0;
const storedIsOlder = compareVersionIds(defaultVersion, storedVersion) > 0;
      return manifestAdvanced && storedIsOlder ? defaultVersion : storedVersion;
    }
export async function applyGameVersion(versionId, options = {}) {
      const version = getVersionRecord(versionId);
      if (!version) {
        setStatus("No local Lyrian rules versions are available.");
        return false;
      }

      versionRuntime.isLoading = true;
      try {
        if (version.dataPath && version.id !== window.LYRIAN_DATA?.version) {
          setVersionProgress(25, `Loading ${version.id} rules data`);
          await loadScriptAsset(version.dataPath);
        }
        if (version.detailPath && version.id !== window.LYRIAN_DETAIL_DATA?.version) {
          setVersionProgress(55, `Loading ${version.id} detail data`);
          await loadScriptAsset(version.detailPath);
        }
        refreshGameDataRuntime();
        state.ui.gameVersion = version.id;
        if (options.persistSelection !== false) {
          persistSelectedGameVersion(version.id);
        }
        createDatalists();
        renderVersionManager();
        if (options.render !== false) {
          syncBuilderSelectionsIntoSheet();
          applyStateToDom();
          renderBuilder();
          renderPlayDashboard();
          invalidateExportCache();
        }
        if (options.status !== false) {
          setStatus(`Loaded Lyrian rules version ${version.id}.`);
        }
        setVersionProgress(100, `Loaded ${version.id}`);
        setTimeout(hideVersionProgress, 450);
        return true;
      } catch (error) {
        hideVersionProgress();
        setStatus(error.message || "Unable to load the selected Lyrian version.");
        renderVersionManager();
        return false;
      } finally {
        versionRuntime.isLoading = false;
      }
    }
export async function loadInitialGameVersion() {
      const selectedVersion = getSelectedGameVersionId();
      state.ui.gameVersion = selectedVersion;
const currentVersion = window.LYRIAN_DATA?.version || "";
      if (selectedVersion && selectedVersion !== currentVersion) {
        await applyGameVersion(selectedVersion, { render: false, status: false, persistSelection: false });
      }
    }
export function getRaceRequirementPhrases(entry) {
      const normalizedName = normalizePhrase(entry?.name);
      return [entry?.name, ...(RACE_REQUIREMENT_ALIASES[normalizedName] || [])].filter(Boolean);
    }
export function getAncestryRequirementPhrases(entry) {
      const name = cleanText(entry?.name);
const normalizedName = normalizePhrase(name);
const phrases = [name];
      if (/\bfolk$/i.test(name)) {
        phrases.push(name.replace(/\s*folk$/i, ""));
      }
      if (normalizedName === "lamiafolk") {
        phrases.push("Lamia");
      }
      if (normalizedName === "will-o-wisp" || normalizedName === "willowisp") {
        phrases.push("Willowisp", "Will-o-Wisp");
      }
      return Array.from(new Set(phrases.filter(Boolean)));
    }
export function getBreakthroughBudgetState(excludeId = "") {
      const selected = getSelectedBreakthroughRecords().filter((entry) => entry.id !== excludeId);
const spent = selected.reduce((total, entry) => total + Math.max(0, parseNumericCost(entry.cost)), 0);
const remaining = BREAKTHROUGH_CREATION_BUDGET - spent;
      return {
        budget: BREAKTHROUGH_CREATION_BUDGET,
        spent,
        remaining,
        selected
      };
    }
export function getDemonClanOptions(race = getSelectedRaceDetail()) {
      if (!race || normalizeKey(race.name) !== "demon") {
        return [];
      }
      return Object.entries(race.lineageChoices || {})
        .map(([choiceKey, choice]) => buildDemonClanEntry(race, choiceKey, choice))
        .filter(Boolean);
    }
export function getCurrentSecondaryLineageMode(race = getSelectedRaceDetail()) {
      if (!race) {
        return "ancestry";
      }
      if (normalizeKey(race.name) === "demon") {
        return getDemonClanOptions(race).length ? "clan" : "none";
      }
const hasAncestries = detailLookup.ancestries.entries.some((entry) => normalizeKey(entry.primaryRace) === normalizeKey(race.name));
      return hasAncestries ? "ancestry" : "none";
    }
export function getSecondaryLineageLabels(race = getSelectedRaceDetail()) {
      const mode = getCurrentSecondaryLineageMode(race);
      if (mode === "clan") {
        return {
          title: "Choose a Demon Clan",
          short: "Clan",
          searchPlaceholder: "Search demon clans",
          selectedLabel: "Selected Clan",
          browseLabel: "Demon Clan",
          summaryLabel: "Demon Clan",
          empty: race ? `${race.name} uses Demon clan choices here.` : "Choose a Demon first to browse clan options."
        };
      }
      return {
        title: "Choose an Ancestry or Sub Race",
        short: "Ancestry",
        searchPlaceholder: "Search ancestries",
        selectedLabel: "Selected",
        browseLabel: "Ancestry",
        summaryLabel: "Subspecies",
        empty: race ? `${race.name} does not require a separate ancestry choice during character creation.` : "Choose a primary race first for cleaner filtering."
      };
    }
export function getRaceDetail(value) {
      return detailLookup.races.resolve(value) || lookup.races.resolve(value);
    }
export function getAncestryDetail(value) {
      const direct = detailLookup.ancestries.resolve(value) || lookup.ancestries.resolve(value);
      if (direct) {
        return direct;
      }
const key = normalizeKey(value);
      if (!key) {
        return null;
      }
      return getAllSecondaryLineageOptions().find((entry) =>
        normalizeKey(entry.id) === key
        || normalizeKey(entry.name) === key
        || normalizeKey(entry.shortName) === key
        || normalizeKey(entry.lineageCode) === key
      ) || null;
    }
export function getClassDetail(value) {
      const detail = detailLookup.classes.resolve(value);
const base = lookup.classes.resolve(value);
      if (!detail) {
        return base;
      }
      if (!base) {
        return detail;
      }

      return {
        ...base,
        ...detail,
        descriptionText: firstReadableText(detail.descriptionText, base.descriptionText, detail.description, base.description),
        description: firstReadableText(detail.description, base.description, detail.descriptionText, base.descriptionText),
        guideText: firstReadableText(detail.guideText, detail.guide, base.guideText, base.guide),
        guide: firstReadableText(detail.guide, base.guide, detail.guideText, base.guideText),
        requirements: firstReadableText(detail.requirements, base.requirements),
        heart: firstReadableText(detail.heart, base.heart),
        soul: firstReadableText(detail.soul, base.soul),
        skills: firstReadableText(detail.skills, base.skills),
        imageSmUrl: detail.imageSmUrl || base.imageSmUrl || "",
        imageLgUrl: detail.imageLgUrl || base.imageLgUrl || detail.imageSmUrl || base.imageSmUrl || ""
      };
    }
export function getSelectedClassProgress() {
      return getSelectedClassDetails().slice(0, CLASS_ROWS.length).map((record, index) => {
        const purchasedCount = getClassPurchasedAbilityCount(record);
const abilityCount = getClassProgressSlotCount(record);
        return {
          row: CLASS_ROWS[index],
          record,
          purchasedCount,
          abilityCount,
          level: 1 + purchasedCount,
          cost: getClassProgressCost(record, purchasedCount)
        };
      });
    }
export function getSelectedRaceDetail() {
      return detailLookup.races.resolve(state.builder.selectedRaceId) || detailLookup.races.resolve(state.fields["Primary Race"]);
    }
export function getSelectedAncestryDetail() {
      return getAncestryDetail(state.builder.selectedAncestryId) || getAncestryDetail(state.fields["Sub Race"]);
    }
export function getSelectedClassDetails() {
      return state.builder.selectedClassIds
        .map((id) => getClassDetail(id))
        .filter(Boolean);
    }
export function getClassUnlockBudgetState() {
      const classProgress = getSelectedClassProgress();
const selectedClasses = classProgress.map((entry) => entry.record);
const spentExp = classProgress.reduce((total, entry) => total + entry.cost, 0);
const spentInterlude = selectedClasses.length;
const expBankText = cleanText(state.fields.Exp);
const remainingExp = expBankText
        ? Math.max(0, toNumber(expBankText, 0))
        : Math.max(0, STARTING_CLASS_EXP - spentExp);
      return {
        selectedClasses,
        classProgress,
        expBudget: spentExp + remainingExp,
        interludeBudget: STARTING_INTERLUDE_POINTS,
        spentExp,
        spentInterlude,
        remainingExp,
        remainingInterlude: Math.max(0, STARTING_INTERLUDE_POINTS - spentInterlude)
      };
    }
export function getSelectedBreakthroughRecords() {
      return state.builder.selectedBreakthroughIds
        .map((id) => lookup.breakthroughs.resolve(id))
        .filter(Boolean);
    }
export function getSelectedItemRecords() {
      return state.builder.selectedItemIds
        .map((id) => lookup.items.resolve(id))
        .filter(Boolean);
    }
export function getHumanRaceSkillChoiceOptions() {
      const excludedSkills = new Set([
        "Artifice",
        "Appraise",
        "Animal Husbandry",
        "Survival"
      ]);
      return SKILL_DEFINITIONS
        .filter((entry) => !excludedSkills.has(entry.name) && entry.group !== "crafting" && entry.group !== "gathering")
        .map((entry) => entry.name);
    }
export function getAncestryOptionsByPrimaryRace(primaryRace) {
      return detailLookup.ancestries.entries
        .filter((entry) => normalizePhrase(entry.primaryRace) === normalizePhrase(primaryRace))
        .map((entry) => entry.name);
    }
export function getBuilderChoiceDefinitionsCacheKey() {
      return `${window.LYRIAN_DATA?.version || ""}-${state.revision || 0}-${state.ui.activeSlotId || ""}`;
    }
function getComputedBonusesCacheKey() {
      return `${window.LYRIAN_DATA?.version || ""}-${state.revision || 0}-${state.ui.activeSlotId || ""}`;
    }
export function getComputedBonuses() {
      const cacheKey = getComputedBonusesCacheKey();
      if (computedBonusesCacheValue && computedBonusesCacheKey === cacheKey) {
        return computedBonusesCacheValue;
      }
const bonuses = buildComputedBonuses();
      computedBonusesCacheKey = cacheKey;
      computedBonusesCacheValue = bonuses;
      return bonuses;
    }
export function getStartingFundsState() {
      const effects = getSelectedBreakthroughEffects();
const overrideRaw = cleanText(state.fields["Clim Override"]);
const earnedClim = toNumber(cleanText(state.fields["Earned Clim"]), 0);
const suggestedTotal = BASE_STARTING_CLIM + effects.bonusClim;
const hasOverride = overrideRaw !== "";
const overrideValue = hasOverride ? Math.max(0, toNumber(overrideRaw, suggestedTotal)) : null;
const startingClim = hasOverride ? overrideValue : suggestedTotal;
const totalClim = startingClim + earnedClim;
const selectedEquipmentCost = getSelectedEquipmentCost();
const availableClim = totalClim - selectedEquipmentCost;

      return {
        baseClim: BASE_STARTING_CLIM,
        bonusClim: effects.bonusClim,
        suggestedTotal,
        hasOverride,
        overrideValue,
        earnedClim,
        startingClim,
        totalClim,
        selectedEquipmentCost,
        availableClim,
        overBudgetClim: Math.max(0, -availableClim),
        effects
      };
    }
export function getCampaignProgressState() {
      return {
        expBank: Math.max(0, toNumber(cleanText(state.fields.Exp), 0)),
        earnedClim: toNumber(cleanText(state.fields["Earned Clim"]), 0),
        spiritCore: Math.max(0, toNumber(cleanText(state.fields["Spirit Core"]), 0))
      };
    }
function getActivePlayEffectModifierSummary() {
      const summary = {
        stat: { Power: 0, Focus: 0, Agility: 0, Toughness: 0 },
        derived: {},
        speedMultiplier: 1,
        speedSet: null,
        dodgeSet: null
      };
      const effects = Array.isArray(state.play?.activeEffects) ? state.play.activeEffects : [];
      effects.forEach((effect) => {
        const modifiers = effect?.rules?.modifiers && typeof effect.rules.modifiers === "object" ? effect.rules.modifiers : {};
        Object.entries(modifiers).forEach(([key, rawValue]) => {
          if (key === "speedMultiplier") {
            summary.speedMultiplier *= Number.isFinite(Number(rawValue)) ? Number(rawValue) : 1;
            return;
          }
          if (key === "speedSet") {
            const value = Number(rawValue);
            if (Number.isFinite(value)) {
              summary.speedSet = summary.speedSet == null ? value : Math.min(summary.speedSet, value);
            }
            return;
          }
          if (key === "dodgeSet") {
            const value = Number(rawValue);
            if (Number.isFinite(value)) {
              summary.dodgeSet = summary.dodgeSet == null ? value : Math.min(summary.dodgeSet, value);
            }
            return;
          }
          if (Object.prototype.hasOwnProperty.call(summary.stat, key)) {
            summary.stat[key] += toNumber(rawValue, 0);
            return;
          }
          summary.derived[key] = (summary.derived[key] || 0) + toNumber(rawValue, 0);
        });
      });
      return summary;
    }
function getActivePlayEffectCurrentAllowance(resourceKey) {
      const effects = Array.isArray(state.play?.activeEffects) ? state.play.activeEffects : [];
      return effects.reduce((total, effect) => {
        const grant = effect?.rules?.resourceGrant && typeof effect.rules.resourceGrant === "object"
          ? toNumber(effect.rules.resourceGrant[resourceKey], 0)
          : 0;
        return total + Math.max(0, grant);
      }, 0);
    }
export function getDerivedCombatStats() {
      const bonuses = getComputedBonuses();
const activeEffectModifiers = getActivePlayEffectModifierSummary();
const power = toNumber(state.fields.Power, 0) + (bonuses.mainStats.Power || 0) + activeEffectModifiers.stat.Power;
const focus = toNumber(state.fields.Focus, 0) + (bonuses.mainStats.Focus || 0) + activeEffectModifiers.stat.Focus;
const agility = toNumber(state.fields.Agility, 0) + (bonuses.mainStats.Agility || 0) + activeEffectModifiers.stat.Agility;
const toughness = toNumber(state.fields.Toughness, 0) + (bonuses.mainStats.Toughness || 0) + activeEffectModifiers.stat.Toughness;
const breakthroughEffects = getSelectedBreakthroughEffects();
const hpMax = 20 + toughness * 10 + (bonuses.derived.hpMax || 0);
const manaMax = 6 + power + (bonuses.derived.manaMax || 0);
const rpMax = 2 + agility + (bonuses.derived.rpMax || 0);
const apMaxText = cleanText(state.play?.resources?.apMax);
const apMax = apMaxText ? Math.max(0, toNumber(apMaxText, 4)) : 4;
const derivedBonuses = {
        ...bonuses.derived,
        ...Object.fromEntries(Object.entries(activeEffectModifiers.derived).map(([key, value]) => [key, (bonuses.derived[key] || 0) + value]))
      };
const speedBeforeSet = Math.max(0, Math.floor((20 + (derivedBonuses.speed || 0)) * activeEffectModifiers.speedMultiplier));
const speed = activeEffectModifiers.speedSet == null ? speedBeforeSet : Math.max(0, activeEffectModifiers.speedSet);
const dodgeBeforeSet = 20 + agility + (derivedBonuses.dodge || 0);
const dodge = activeEffectModifiers.dodgeSet == null ? dodgeBeforeSet : activeEffectModifiers.dodgeSet;

      return {
        hpMax,
        manaMax,
        rpMax,
        apMax,
        guard: toughness + (derivedBonuses.guard || 0),
        evasion: 7 + agility + (derivedBonuses.evasion || 0),
        speed,
        potency: 11 + focus + (derivedBonuses.potency || 0),
        initiative: agility + breakthroughEffects.initiativeBonus + (derivedBonuses.initiative || 0),
        saveBonus: toughness + (derivedBonuses.saveBonus || 0),
        lightAttack: focus + (derivedBonuses.lightAttack || 0),
        heavyAttack: focus + (derivedBonuses.heavyAttack || 0),
        preciseAttack: (focus * 2) + (derivedBonuses.preciseAttack || 0),
        dodge,
        block: (toughness * 2) + (derivedBonuses.block || 0)
      };
    }
export function hasManualHpHistory(play = {}) {
      const entries = Array.isArray(play.log) ? play.log : [];
      for (const entry of entries) {
        const title = cleanText(entry?.title).toLowerCase();
        if (title === "full restore") {
          return false;
        }
        if (title === "damage") {
          return true;
        }
        if (title === "heal") {
          const text = asArray(entry?.lines).join(" ");
const match = /Current HP:\s*(-?\d+)\s*\/\s*(-?\d+)/i.exec(text);
          if (!match) {
            return true;
          }
          return Number(match[1]) < Number(match[2]);
        }
      }
      return false;
    }
export function syncPlayResourcesFromFields(preserveCurrent = true) {
      state.play = mergePlayState(state.play);
const derived = getDerivedCombatStats();
const resources = state.play.resources;
const previousHpCurrent = toNumber(resources.hpCurrent, NaN);
const previousHpMax = toNumber(resources.hpMax, NaN);
const hasHpCurrent = cleanText(resources.hpCurrent) !== "";
const wasAtPreviousHpMax = Number.isFinite(previousHpCurrent)
        && Number.isFinite(previousHpMax)
        && previousHpCurrent >= previousHpMax;
const isBuilderMode = state.ui?.mode === "builder";
const shouldSyncHpToMax = !preserveCurrent
        || !hasHpCurrent
        || !state.play.hpHasManualChange
        || wasAtPreviousHpMax
        || isBuilderMode;
const oldHpMax = previousHpMax;
      resources.hpMax = derived.hpMax;
      resources.manaMax = derived.manaMax;
      resources.rpMax = derived.rpMax;
      resources.apMax = derived.apMax;

      if (shouldSyncHpToMax) {
        resources.hpCurrent = derived.hpMax;
      } else if (Number.isFinite(previousHpCurrent) && Number.isFinite(oldHpMax) && oldHpMax !== derived.hpMax) {
        const diff = derived.hpMax - oldHpMax;
        resources.hpCurrent = clamp(previousHpCurrent + diff, 0, derived.hpMax);
      } else {
        resources.hpCurrent = clamp(toNumber(resources.hpCurrent, derived.hpMax), 0, Math.max(0, derived.hpMax));
      }

      if (!preserveCurrent || resources.manaCurrent === "") {
        resources.manaCurrent = derived.manaMax;
      }
      if (!preserveCurrent || resources.rpCurrent === "") {
        resources.rpCurrent = derived.rpMax;
      }
      if (!preserveCurrent || resources.apCurrent === "") {
        resources.apCurrent = derived.apMax;
      }

      resources.tempHp = clamp(toNumber(resources.tempHp, 0), 0, 9999);
      if (resources.hpCurrent >= derived.hpMax) {
        state.play.hpHasManualChange = false;
      }
      resources.manaCurrent = clamp(toNumber(resources.manaCurrent, derived.manaMax), 0, Math.max(0, derived.manaMax));
      resources.rpCurrent = clamp(toNumber(resources.rpCurrent, derived.rpMax), 0, Math.max(0, derived.rpMax + getActivePlayEffectCurrentAllowance("rpCurrent")));
      resources.apCurrent = clamp(toNumber(resources.apCurrent, derived.apMax), 0, Math.max(0, derived.apMax + getActivePlayEffectCurrentAllowance("apCurrent")));
    }
function applyTrackedPlayUseEffects(label, effectText, cost, options = {}) {
      const resources = state.play.resources;
const derived = getDerivedCombatStats();
const text = cleanText(effectText);
const lines = [];
const normalizedLabel = normalizePhrase(label);

      if (!text) {
        return lines;
      }
const addTemporaryHp = (amount, reason = "Tracked effect") => {
        const gain = Math.max(0, Math.floor(amount));
        if (!gain) {
          return;
        }
const currentTempHp = Math.max(0, toNumber(resources.tempHp, 0));
const nextTempHp = clamp(Math.max(currentTempHp, gain), 0, 9999);
        resources.tempHp = nextTempHp;
        state.play.resources.tempHp = nextTempHp;
        lines.push(currentTempHp >= gain
          ? `${reason}: granted ${gain} Temporary HP, but kept existing equal or higher value because Temporary HP does not stack.`
          : `${reason}: Temporary HP set to ${gain}.`);
        lines.push(`Temporary HP: ${nextTempHp}`);
      };
const healHp = (amount, reason = "Tracked effect") => {
        const healing = Math.max(0, Math.floor(amount));
        if (!healing) {
          return;
        }
const currentHp = toNumber(resources.hpCurrent, derived.hpMax);
const nextHp = clamp(currentHp + healing, 0, Math.max(0, derived.hpMax));
        resources.hpCurrent = nextHp;
        state.play.resources.hpCurrent = nextHp;
        state.play.hpHasManualChange = nextHp < derived.hpMax;
        lines.push(`${reason}: healed ${healing} HP.`);
        lines.push(`Current HP: ${nextHp} / ${derived.hpMax}`);
      };
const damageHp = (amount, reason = "Tracked effect") => {
        const damage = Math.max(0, Math.floor(amount));
        if (!damage) {
          return;
        }
const currentHp = toNumber(resources.hpCurrent, derived.hpMax);
const nextHp = clamp(currentHp - damage, 0, Math.max(0, derived.hpMax));
        resources.hpCurrent = nextHp;
        state.play.resources.hpCurrent = nextHp;
        state.play.hpHasManualChange = nextHp < derived.hpMax;
        lines.push(`${reason}: took ${damage} HP damage.`);
        lines.push(`Current HP: ${nextHp} / ${derived.hpMax}`);
      };
const restoreResource = (resource, amount, reason = "Tracked effect") => {
        const gain = Math.max(0, Math.floor(amount));
        if (!gain) {
          return;
        }
const resourceConfig = {
          Mana: { currentKey: "manaCurrent", max: derived.manaMax },
          RP: { currentKey: "rpCurrent", max: derived.rpMax },
          AP: { currentKey: "apCurrent", max: derived.apMax }
        }[resource];
        if (!resourceConfig) {
          return;
        }
const current = toNumber(resources[resourceConfig.currentKey], resourceConfig.max);
const next = clamp(current + gain, 0, Math.max(0, resourceConfig.max));
        resources[resourceConfig.currentKey] = next;
        state.play.resources[resourceConfig.currentKey] = next;
        lines.push(`${reason}: restored ${gain} ${resource}.`);
        lines.push(`${resource}: ${next} / ${resourceConfig.max}`);
      };
const restoreDirectResourceSentence = (sentence) => {
        if (/\b(?:target|ally|enemy|creature)\b/i.test(sentence) || /\bstart of your turn\b/i.test(sentence)) {
          return;
        }
const directResourceMatch = sentence.match(/\byou(?:\s+immediately)?\s+(?:regain|gain|recover)\s+(\d+)\s*(mana|rp|ap)\b/i);
        if (!directResourceMatch) {
          return;
        }
        const resource = directResourceMatch[2].toLowerCase() === "mana"
          ? "Mana"
          : directResourceMatch[2].toUpperCase();
        restoreResource(resource, Number(directResourceMatch[1]));
      };
const selfTempHpExpression = text.match(/\byou gain temporary (?:hit points|hp) equal to (?:your\s+)?(toughness|focus|power)\s*\+\s*(\d+)/i);
      if (selfTempHpExpression && !/\bon damage\b/i.test(text)) {
        const stat = selfTempHpExpression[1].toLowerCase();
const base = stat === "toughness"
          ? toNumber(state.fields.Toughness, 0) + (getComputedBonuses().mainStats.Toughness || 0)
          : stat === "focus"
            ? toNumber(state.fields.Focus, 0) + (getComputedBonuses().mainStats.Focus || 0)
            : toNumber(state.fields.Power, 0) + (getComputedBonuses().mainStats.Power || 0);
        addTemporaryHp(base + Number(selfTempHpExpression[2]));
      }

      if (/temporary hp equal to your toughness \+ 3 or focus \+ 3/i.test(text)) {
        const bonuses = getComputedBonuses();
const toughness = toNumber(state.fields.Toughness, 0) + (bonuses.mainStats.Toughness || 0);
const focus = toNumber(state.fields.Focus, 0) + (bonuses.mainStats.Focus || 0);
        addTemporaryHp(Math.max(toughness + 3, focus + 3));
      }

      if (normalizedLabel === "spiritual sync" || /temporary hp equal to 8x/i.test(text)) {
        addTemporaryHp(cost.Mana * 8, "Tracked mana conversion");
      }
const directTemporaryHp = text.match(/\byou gain (\d+) temporary (?:hit points|hp)\b/i);
      if (directTemporaryHp && !/\b(?:target|ally|enemy|creature)\b/i.test(text)) {
        addTemporaryHp(Number(directTemporaryHp[1]));
      }
const manaHealing = text.match(/\byou regain hp equal to (\d+) times the mana spent/i);
      if (manaHealing) {
        healHp(Number(manaHealing[1]) * cost.Mana);
      }
const directDamage = text.match(/\byou take (\d+) true damage\b/i);
      if (directDamage && !/\btarget\b/i.test(text)) {
        damageHp(Number(directDamage[1]));
      }
const statDamage = text.match(/\byou take true damage equal to (?:your\s+)?(toughness|focus|power)\s*x\s*(\d+)/i);
      if (statDamage && !/\btarget\b/i.test(text)) {
        const stat = statDamage[1].toLowerCase();
const bonuses = getComputedBonuses();
const base = stat === "toughness"
          ? toNumber(state.fields.Toughness, 0) + (bonuses.mainStats.Toughness || 0)
          : stat === "focus"
            ? toNumber(state.fields.Focus, 0) + (bonuses.mainStats.Focus || 0)
            : toNumber(state.fields.Power, 0) + (bonuses.mainStats.Power || 0);
        damageHp(base * Number(statDamage[2]));
      }
      cleanText(text)
        .split(/(?<=[.!?])\s+/)
        .forEach((sentence) => restoreDirectResourceSentence(sentence));

      if (!lines.length && options.logManualEffects !== false && /\btemporary (?:hit points|hp)\b/i.test(text)) {
        lines.push("Manual effect: this ability mentions Temporary HP, but the target, trigger, or formula needs player/GM handling.");
      }

      if (/\bmaximum (?:hp|mana|ap|rp)\b/i.test(text) && !lines.some((line) => /maximum/i.test(line))) {
        lines.push("Manual effect: this use mentions a temporary maximum-resource change; adjust the max field manually if it applies.");
      }

      return lines;
    }
export function usePlayCost(label, costLabel, extraLines = [], options = {}) {
      state.play = mergePlayState(state.play);
const derived = getDerivedCombatStats();
const resources = state.play.resources;
const cost = parseResourceCost(costLabel);
const feedbackId = options.feedbackId || "";
const checks = [
        { key: "AP", currentKey: "apCurrent", amount: cost.AP, max: derived.apMax },
        { key: "RP", currentKey: "rpCurrent", amount: cost.RP, max: derived.rpMax },
        { key: "Mana", currentKey: "manaCurrent", amount: cost.Mana, max: derived.manaMax },
        { key: "HP", currentKey: "hpCurrent", amount: cost.HP, max: derived.hpMax }
      ];
const blocked = checks.find((entry) => entry.amount > 0 && toNumber(resources[entry.currentKey], entry.max) < entry.amount);
      if (blocked) {
        const message = `Insufficient ${blocked.key}. ${label} needs ${blocked.amount} ${blocked.key}.`;
        setStatus(message);
        showPlayFeedback(feedbackId, message);
        return false;
      }

      clearPlayFeedback(feedbackId);

      checks.forEach((entry) => {
        const current = toNumber(resources[entry.currentKey], entry.max);
const next = clamp(current - entry.amount, 0, Math.max(0, entry.max));
        resources[entry.currentKey] = next;
      });
const costLine = formatCostLabelForDisplay(costLabel) || "No tracked resource cost";
const spentLine = formatTrackedCostSpend(cost);
const variableLine = Object.values(cost.variable || {}).some(Boolean) && spentLine
        ? `Variable cost: spent ${spentLine} for this use.`
        : "";
const effectLines = applyTrackedPlayUseEffects(label, options.effectText || "", cost, options);
      appendPlayLog(label, [`Cost: ${costLine}`, variableLine, ...effectLines, ...extraLines].filter(Boolean));
      renderPlayDashboardIfVisible();
      setStatus(`Used ${label}.`);
      return true;
    }
export function getSkillRowsData() {
      const bonuses = getComputedBonuses();
      return SKILL_DEFINITIONS.map((_, index) => getSkillRowData(index + 1, bonuses)).filter(Boolean);
    }
export function getSkillBreakdownParts(skill, expertiseGroup = null) {
      if (!skill) {
        return [];
      }
const parts = [
        `${skill.stat} ${formatModifier(skill.substatValue)}`,
        `Skill ${formatModifier(skill.creationSkillPoints)}`
      ];
      if (skill.racialSkillPoints) {
        parts.push(`Racial ${formatModifier(skill.racialSkillPoints)}`);
      }
      if (skill.featureSkillPoints) {
        parts.push(`Feature Skill ${formatModifier(skill.featureSkillPoints)}`);
      }
      if (expertiseGroup) {
        parts.push(`${expertiseGroup.name} Expertise ${formatModifier(expertiseGroup.bonus)}`);
      }
      if (skill.bonusValue) {
        parts.push(`Feature ${formatModifier(skill.bonusValue)}`);
      }
      return parts;
    }
export async function alignLoadedStateGameVersion(options = {}) {
      const targetVersion = cleanText(state.ui.gameVersion);
const activeVersion = cleanText(window.LYRIAN_DATA?.version);
      if (!targetVersion || targetVersion === activeVersion) {
        return true;
      }

      if (!getVersionRecord(targetVersion)) {
        setStatus(`Loaded character references Lyrian rules version ${targetVersion}, but that version is not installed locally.`);
        renderVersionManager();
        return false;
      }
const didApply = await applyGameVersion(targetVersion, { render: false, status: false, persistSelection: false });
      if (!didApply) {
        return false;
      }

      applyStateToDom();
      persistWorkingState(false);
      if (options.statusLabel) {
        setStatus(`${options.statusLabel} using Lyrian rules version ${targetVersion}.`);
      }
      return true;
    }

