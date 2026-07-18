import { ACTIVE_SAVE_SLOT_KEY, STORAGE_KEY } from "./constants.js";
import { flushScheduledWorkingStatePersist, getSavedSlots, hasWorkingStateStorage, setWorkingStatePersistenceReady, setWorkingStateStorageWasPresent } from "./state.js";
import { alignLoadedStateGameVersion, loadInitialGameVersion } from "./rules.js";
import { loadSavedState } from "./io.js";
import { applyStateToDom, bindEvents, buildSheet, createDatalists, detectVersionServer, renderVersionManager, setStatus } from "./ui.js";








async function initialize() {
      await loadInitialGameVersion();
      createDatalists();
      buildSheet();
      bindEvents();
      renderVersionManager();
      detectVersionServer();
const modalClose = document.getElementById("sheet-modal-close");
      if (modalClose) {
        modalClose.innerHTML = "&times;";
      }
let didLoad = false;
      setWorkingStateStorageWasPresent(hasWorkingStateStorage());
const activeSlotId = localStorage.getItem(ACTIVE_SAVE_SLOT_KEY) || "";
      if (activeSlotId) {
        const activeSlot = getSavedSlots().find((entry) => entry.id === activeSlotId);
        if (activeSlot) {
          didLoad = loadSavedState(activeSlot.snapshot, { activeSlotId, statusOnFailure: false, promoteStaleVersion: true });
        }
      }
      if (!didLoad) {
        didLoad = loadSavedState(localStorage.getItem(STORAGE_KEY), { activeSlotId, statusOnFailure: false, promoteStaleVersion: true });
      }
      if (!didLoad) {
        applyStateToDom();
        setStatus(`Ready with Lyrian data v${window.LYRIAN_DATA.version}.`);
      } else {
        await alignLoadedStateGameVersion();
        setStatus(activeSlotId ? "Loaded the active saved character slot." : "Loaded saved character.");
      }
      setWorkingStatePersistenceReady(true);
      window.addEventListener("beforeunload", flushScheduledWorkingStatePersist);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          flushScheduledWorkingStatePersist();
        }
      });
    }

    initialize().catch((error) => {
      console.error(error);
      setStatus(error.message || "The Lyrian character suite could not initialize.");
    });
