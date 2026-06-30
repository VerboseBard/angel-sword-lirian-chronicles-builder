import { ACTIVE_SAVE_SLOT_KEY, DEFAULT_DICE_SET_ID, SAVE_SLOTS_KEY, STORAGE_KEY } from "./constants.js";
import { cleanText, cssEscape, toNumber } from "./utils.js";
import { hasManualHpHistory } from "./rules.js";
import { deriveSaveSlotName, getSavedSlotStore, persistSavedSlotStoreQuietly } from "./io.js";
import { applyStateToDom, createStorableStateSnapshot, invalidateExportCache, serializeCurrentState, setStatus } from "./ui.js";









export function createDefaultState() {
      return {
        ui: {
          mode: "builder",
          builderStep: 0,
          sheetTab: "actions",
          showPdf: false,
          activeSaveSlotId: "",
          gameVersion: ""
        },
        fields: {},
        abilitySelections: {},
        lastFocusedField: "",
        librarySelections: {
          race: "",
          ancestry: "",
          class: "",
          item: "",
          breakthrough: "",
          ability: ""
        },
        builder: {
          portraitDataUrl: "",
          selectedRaceId: "",
          selectedAncestryId: "",
          selectedClassIds: [],
          classAbilityProgress: {},
          autoSpiritCore: "",
          autoExpBank: "",
          selectedItemIds: [],
          itemQuantities: {},
          selectedBreakthroughIds: [],
          skillExpertiseEntries: [],
          choiceSelections: {},
          inspected: {
            race: "",
            ancestry: "",
            class: "",
            item: "",
            breakthrough: ""
          },
          searches: {
            ancestry: "",
            class: "",
            classRole: "",
            classTier: "",
            classSort: "role",
            item: "",
            breakthrough: "",
            mainStatMode: "array",
            secondaryStatMode: "array"
          }
        },
        play: {
          resources: {
            hpCurrent: "",
            hpMax: "",
            tempHp: 0,
            manaCurrent: "",
            manaMax: "",
            rpCurrent: "",
            rpMax: "",
            apCurrent: 4,
            apMax: 4
          },
          hpAdjustAmount: "",
          hpHasManualChange: false,
          playerNotes: "",
          inventoryItems: [],
          inventorySearch: "",
          showInventoryCatalog: false,
          showCustomItemForm: false,
          customItemDraft: {
            name: "",
            type: "",
            description: ""
          },
          crafting: {
            diceMax: 0,
            diceRemaining: 0,
            pointsGenerated: 0,
            pointsSpent: 0,
            rollBonus: 0,
            pendingPointSpend: 0,
            recipeName: "",
            materialCost: "",
            selectedMods: "",
            notes: ""
          },
          diceTray: {
            isOpen: false,
            selectedSetId: DEFAULT_DICE_SET_ID,
            showSetPicker: false,
            counts: {}
          },
          log: []
        }
      };
    }
    export const state = createDefaultState();
let workingStatePersistenceReady = false;
let workingStatePersistTimer = 0;
let workingStatePersistUpdatesActiveSlot = false;
let workingStateStorageWasPresent = false;
export function mergeBuilderState(source = {}) {
      const defaults = createDefaultState().builder;
      const selectedItemIds = Array.isArray(source.selectedItemIds)
        ? Array.from(new Set(source.selectedItemIds.map((id) => cleanText(id)).filter(Boolean)))
        : [...defaults.selectedItemIds];
      const selectedItemIdSet = new Set(selectedItemIds);
      const itemQuantities = source.itemQuantities && typeof source.itemQuantities === "object"
        ? Object.fromEntries(
          Object.entries(source.itemQuantities)
            .map(([id, quantity]) => [cleanText(id), Math.max(0, Math.floor(toNumber(quantity, 0)))])
            .filter(([id, quantity]) => id && selectedItemIdSet.has(id) && quantity > 0)
        )
        : { ...defaults.itemQuantities };
      return {
        ...defaults,
        ...source,
        portraitDataUrl: cleanText(source.portraitDataUrl || defaults.portraitDataUrl),
        selectedRaceId: cleanText(source.selectedRaceId || defaults.selectedRaceId),
        selectedAncestryId: cleanText(source.selectedAncestryId || defaults.selectedAncestryId),
        selectedClassIds: Array.isArray(source.selectedClassIds) ? source.selectedClassIds.filter(Boolean) : [...defaults.selectedClassIds],
        classAbilityProgress: source.classAbilityProgress && typeof source.classAbilityProgress === "object"
          ? { ...source.classAbilityProgress }
          : { ...defaults.classAbilityProgress },
        autoSpiritCore: cleanText(source.autoSpiritCore || defaults.autoSpiritCore),
        autoExpBank: cleanText(source.autoExpBank || defaults.autoExpBank),
        selectedItemIds,
        itemQuantities,
        selectedBreakthroughIds: Array.isArray(source.selectedBreakthroughIds) ? source.selectedBreakthroughIds.filter(Boolean) : [...defaults.selectedBreakthroughIds],
        skillExpertiseEntries: Array.isArray(source.skillExpertiseEntries)
          ? source.skillExpertiseEntries
            .map((entry) => ({
              skillIndex: Math.max(1, Math.floor(toNumber(entry.skillIndex, 0))),
              name: cleanText(entry.name).slice(0, 80),
              source: cleanText(entry.source) === "class" ? "class" : "creation",
              choiceId: cleanText(entry.choiceId),
              points: Math.max(0, Math.floor(toNumber(entry.points, 0)))
            }))
            .filter((entry) => entry.skillIndex && entry.name && entry.points > 0)
          : [...defaults.skillExpertiseEntries],
        choiceSelections: source.choiceSelections && typeof source.choiceSelections === "object"
          ? { ...source.choiceSelections }
          : { ...defaults.choiceSelections },
        inspected: {
          ...defaults.inspected,
          ...(source.inspected || {})
        },
        searches: {
          ...defaults.searches,
          ...(source.searches || {})
        }
      };
    }
export function updateFieldValue(fieldName, value) {
      const nextValue = String(value ?? "");
const previousValue = String(state.fields[fieldName] ?? "");
      state.fields[fieldName] = nextValue;
const node = document.querySelector(`[data-field="${cssEscape(fieldName)}"]`);
      if (node && node.value !== nextValue) {
        node.value = nextValue;
      }
      if (previousValue !== nextValue) {
        state.revision = (state.revision || 0) + 1;
        scheduleWorkingStatePersist();
      }
    }
export function mergePlayState(source = {}) {
      const defaults = createDefaultState().play;
const sourceHasHpFlag = Object.prototype.hasOwnProperty.call(source, "hpHasManualChange");
      return {
        ...defaults,
        ...source,
        hpHasManualChange: sourceHasHpFlag ? Boolean(source.hpHasManualChange) : hasManualHpHistory(source),
        resources: {
          ...defaults.resources,
          ...(source.resources || {})
        },
        customItemDraft: {
          ...defaults.customItemDraft,
          ...(source.customItemDraft || {})
        },
        crafting: {
          ...defaults.crafting,
          ...(source.crafting || {})
        },
        diceTray: {
          ...defaults.diceTray,
          ...(source.diceTray || {}),
          counts: {
            ...(defaults.diceTray.counts || {}),
            ...(source.diceTray?.counts || {})
          }
        },
        inventoryItems: Array.isArray(source.inventoryItems) ? source.inventoryItems : defaults.inventoryItems,
        log: Array.isArray(source.log) ? source.log : defaults.log
      };
    }
export function hasWorkingStateStorage() {
      return Boolean(
        localStorage.getItem(STORAGE_KEY)
        || localStorage.getItem(SAVE_SLOTS_KEY)
        || localStorage.getItem(ACTIVE_SAVE_SLOT_KEY)
      );
    }
export function scheduleWorkingStatePersist(updateActiveSlot = true) {
      if (!workingStatePersistenceReady) {
        return;
      }
      workingStatePersistUpdatesActiveSlot = workingStatePersistUpdatesActiveSlot || Boolean(updateActiveSlot);
      invalidateExportCache();
      window.clearTimeout(workingStatePersistTimer);
      workingStatePersistTimer = window.setTimeout(() => {
        const shouldUpdateActiveSlot = workingStatePersistUpdatesActiveSlot;
        workingStatePersistTimer = 0;
        workingStatePersistUpdatesActiveSlot = false;
        if (shouldDiscardScheduledWorkingStatePersist()) {
          workingStateStorageWasPresent = false;
          return;
        }
        persistWorkingState(shouldUpdateActiveSlot);
      }, 50);
    }
export function flushScheduledWorkingStatePersist() {
      if (!workingStatePersistenceReady || !workingStatePersistTimer) {
        return;
      }
const shouldUpdateActiveSlot = workingStatePersistUpdatesActiveSlot;
      clearScheduledWorkingStatePersist();
      workingStatePersistUpdatesActiveSlot = false;
      if (shouldDiscardScheduledWorkingStatePersist()) {
        workingStateStorageWasPresent = false;
        return;
      }
      persistWorkingState(shouldUpdateActiveSlot);
    }
export function getSavedSlots() {
      return getSavedSlotStore().slots
        .slice()
        .sort((left, right) => new Date(right.savedAt || 0).getTime() - new Date(left.savedAt || 0).getTime());
    }
export function setActiveSaveSlotId(slotId = "") {
      state.ui.activeSaveSlotId = slotId || "";
      if (slotId) {
        trySetLocalStorage(ACTIVE_SAVE_SLOT_KEY, slotId, "active save slot");
      } else {
        localStorage.removeItem(ACTIVE_SAVE_SLOT_KEY);
      }
    }
export function persistWorkingState(updateActiveSlot = true) {
      if (!workingStatePersistenceReady) {
        return;
      }
      updateActiveSlot = Boolean(updateActiveSlot || workingStatePersistUpdatesActiveSlot);
      clearScheduledWorkingStatePersist();
      workingStatePersistUpdatesActiveSlot = false;
const fullStateSaved = trySetLocalStorage(STORAGE_KEY, serializeCurrentState(), "current working character");
      if (!fullStateSaved) {
        trySetLocalStorage(STORAGE_KEY, JSON.stringify(createStorableStateSnapshot()), "compact working character");
      }
      if (!updateActiveSlot || !state.ui.activeSaveSlotId) {
        invalidateExportCache();
        return;
      }
const store = getSavedSlotStore();
const slot = store.slots.find((entry) => entry.id === state.ui.activeSaveSlotId);
      if (!slot) {
        invalidateExportCache();
        return;
      }
      slot.snapshot = createStorableStateSnapshot();
      slot.savedAt = new Date().toISOString();
      slot.name = cleanText(slot.name) || deriveSaveSlotName();
      persistSavedSlotStoreQuietly(store);
      invalidateExportCache();
    }
export function clearSheet() {
      const defaults = createDefaultState();
      state.ui = defaults.ui;
      state.fields = defaults.fields;
      state.abilitySelections = defaults.abilitySelections;
      state.lastFocusedField = defaults.lastFocusedField;
      state.librarySelections = defaults.librarySelections;
      state.builder = defaults.builder;
      state.play = defaults.play;
      setActiveSaveSlotId("");
      applyStateToDom();
      persistWorkingState(false);
      setMode("builder");
      setStatus("Cleared the current character.");
    }





















































































export function trySetLocalStorage(key, value, label = "browser data") {
  try {
    localStorage.setItem(key, value);
    if (key === STORAGE_KEY || key === SAVE_SLOTS_KEY || key === ACTIVE_SAVE_SLOT_KEY) {
      workingStateStorageWasPresent = true;
    }
    return true;
  } catch (error) {
    console.warn(`Could not save ${label}.`, error);
    return false;
  }
}

function shouldDiscardScheduledWorkingStatePersist() {
  return workingStateStorageWasPresent && !hasWorkingStateStorage();
}

function clearScheduledWorkingStatePersist() {
  if (!workingStatePersistTimer) {
    return false;
  }
  window.clearTimeout(workingStatePersistTimer);
  workingStatePersistTimer = 0;
  return true;
}

export function setWorkingStateStorageWasPresent(val) {
  workingStateStorageWasPresent = val;
}

export function setWorkingStatePersistenceReady(val) {
  workingStatePersistenceReady = val;
}
