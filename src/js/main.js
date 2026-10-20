import { ACTIVE_SAVE_SLOT_KEY, STORAGE_KEY } from "./constants.js";
import { flushScheduledWorkingStatePersist, getSavedSlots, hasWorkingStateStorage, persistWorkingState, setWorkingStatePersistenceReady, setWorkingStateStorageWasPresent } from "./state.js";
import { alignLoadedStateGameVersion, loadInitialGameVersion, refreshGameDataRuntime } from "./rules.js";
import { loadBuildLabHandoffFromLocation, loadSavedState } from "./io.js";
import { applyStateToDom, bindEvents, buildSheet, createDatalists, flushPlayerNotesAutosave, flushPlayDashboardSync, landBuiltCharacterOnReview, openPlaySheetIfOpenedFromCompanion, populateSheetFields, renderVersionManager, setStatus } from "./ui.js";








async function initialize() {
      refreshGameDataRuntime();
      await loadInitialGameVersion();
      createDatalists();
      bindEvents();
      renderVersionManager();
      // The hidden print-style sheet stack (738 generated elements) is not part of
      // first paint; build it after the page is interactive so startup stays
      // fast on phones. populateSheetFields backfills whatever state loaded.
const scheduleIdleSheetBuild = typeof window.requestIdleCallback === "function"
        ? (callback) => window.requestIdleCallback(callback, { timeout: 1500 })
        : (callback) => window.setTimeout(callback, 200);
      scheduleIdleSheetBuild(() => {
        buildSheet();
        populateSheetFields();
      });
const modalClose = document.getElementById("sheet-modal-close");
      if (modalClose) {
        modalClose.innerHTML = "&times;";
      }
let didLoad = false;
let loadedFromSlot = false;
const buildLabHandoff = loadBuildLabHandoffFromLocation();
      didLoad = buildLabHandoff.loaded;
      setWorkingStateStorageWasPresent(hasWorkingStateStorage());
const activeSlotId = localStorage.getItem(ACTIVE_SAVE_SLOT_KEY) || "";
      if (!didLoad && activeSlotId) {
        const activeSlot = getSavedSlots().find((entry) => entry.id === activeSlotId);
        if (activeSlot) {
          // Task 038: a slot stores no screen; keep its HP, Mana, RP and AP for
          // the trip to the sheet (see hydrateStateFromObject).
          didLoad = loadSavedState(activeSlot.snapshot, { activeSlotId, statusOnFailure: false, promoteStaleVersion: true, startInAdvancedBuild: true, keepSavedPlayResources: true });
          loadedFromSlot = didLoad;
        }
      }
      if (!didLoad) {
        didLoad = loadSavedState(localStorage.getItem(STORAGE_KEY), { activeSlotId, statusOnFailure: false, promoteStaleVersion: true, startInAdvancedBuild: true });
      }
      if (!didLoad) {
        applyStateToDom();
        setStatus(`Ready with Lyrian data v${window.LYRIAN_DATA.version} from bundled local data.`);
        // Task 037: a Companion window opened with no character yet records
        // that it is in the builder, so its one landing is spent (no-op in a
        // plain tab).
        openPlaySheetIfOpenedFromCompanion();
      } else if (buildLabHandoff.loaded) {
        setStatus(`Loaded ${buildLabHandoff.packageName} from Lyrian Build Lab. Finish identity, stats, skills, and choices, then save or export the character.`);
      } else {
        await alignLoadedStateGameVersion();
        if (loadedFromSlot) {
          // Task 038 (037 audit finding 1): a built character from the active
          // slot opens on Review & Finish, not "Choose a Primary Race".
          landBuiltCharacterOnReview();
        }
        setStatus(activeSlotId ? "Loaded the active saved character slot." : "Loaded saved character.");
        // Task 031 T3: opened from the Owlbear Companion with a complete
        // character, start on the play sheet (no-op otherwise). Task 037:
        // only on the window's first load; a reload keeps the player's mode.
        openPlaySheetIfOpenedFromCompanion();
      }
      setWorkingStatePersistenceReady(true);
      if (buildLabHandoff.loaded) {
        persistWorkingState(false);
      }
const flushPendingWorkingState = () => {
        // Sheet input and player notes use longer UI debounces than the shared
        // storage timer. Drain both first so recent edits reach the final save.
        flushPlayerNotesAutosave();
        flushPlayDashboardSync({ render: false });
        flushScheduledWorkingStatePersist();
      };
      window.addEventListener("beforeunload", flushPendingWorkingState);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          flushPendingWorkingState();
        }
      });
    }

    initialize().catch((error) => {
      console.error(error);
      setStatus(error.message || "The Lyrian character suite could not initialize.");
    });
