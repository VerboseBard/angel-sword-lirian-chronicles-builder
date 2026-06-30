import { DEFAULT_DICE_SET_ID, DICE_TRAY_TYPES, MAX_DICE_TRAY_DICE } from "./constants.js";
import { escapeHtml } from "./utils.js";
import { state } from "./state.js";
import { getDiceChoicePreviewUrl, getDiceIconSvg, getDiceImageFallbackHandler, getDiceSet, getDiceSetPreviewUrl, getDiceTrayState, getDiceTrayTotalCount, renderDiceSetPicker } from "./ui.js";









    export const dicePackRuntime = {
      isChecking: false,
      lastManifest: null
    };
export function preloadDiceSetFaceArt(setId = state.play?.diceTray?.selectedSetId || DEFAULT_DICE_SET_ID) {
      try {
        window.LyrianAccurateDiceRoller?.preloadFaceArt?.(setId);
      } catch (error) {
        console.warn("Could not preload dice face art.", error);
      }
    }
export function renderDiceTray() {
      const tray = document.getElementById("sheet-dice-tray");
      if (!tray) {
        return;
      }
const isSheetMode = state.ui.mode === "sheet";
      tray.classList.toggle("is-hidden", !isSheetMode);
      if (!isSheetMode) {
        return;
      }
const diceTray = getDiceTrayState();
const activeSet = getDiceSet(diceTray.selectedSetId);
const totalSelected = getDiceTrayTotalCount(diceTray);
      tray.innerHTML = `
        <button class="dice-tray-fab" type="button" data-dice-toggle aria-label="Open dice roller" aria-expanded="${diceTray.isOpen ? "true" : "false"}">
          ${getDiceIconSvg()}
        </button>
        ${diceTray.isOpen ? `
          <div class="dice-tray-panel" role="dialog" aria-label="Dice roller">
            <div class="dice-tray-head">
              <span>Roll Dice</span>
              <button class="dice-tray-close" type="button" data-dice-close aria-label="Close dice roller">&times;</button>
            </div>
            <div class="dice-tray-style" data-dice-change>
              <div class="dice-tray-preview"><img src="${escapeHtml(getDiceSetPreviewUrl(activeSet.id))}" alt="" onerror="${getDiceImageFallbackHandler()}"></div>
              <div class="dice-tray-copy">
                <span>${escapeHtml(activeSet.name)}</span>
                <strong>Change Dice</strong>
              </div>
              <button class="dice-tray-gear" type="button" data-dice-change aria-label="Change dice set" title="Change dice set">&#9881;</button>
            </div>
            ${diceTray.showSetPicker ? renderDiceSetPicker(activeSet) : ""}
            <div class="dice-choice-grid">
              ${DICE_TRAY_TYPES.map((entry) => {
                const count = diceTray.counts[entry.sides] || 0;
                return `
                  <button class="dice-choice${count ? " is-selected" : ""}" type="button" data-dice-add="${entry.sides}" aria-label="Add ${entry.label}">
                    ${count ? `<span class="dice-count-badge">${escapeHtml(String(count))}</span>` : ""}
                    <span class="dice-choice-icon"><img src="${escapeHtml(getDiceChoicePreviewUrl(entry.sides, activeSet.id))}" alt="" onerror="${getDiceImageFallbackHandler()}"></span>
                    <span class="dice-choice-label">${escapeHtml(entry.label)}</span>
                  </button>
                `;
              }).join("")}
            </div>
            <div class="dice-tray-actions">
              <button class="dice-reset-button" type="button" data-dice-reset${totalSelected ? "" : " disabled"}>RESET</button>
              <button class="dice-roll-button" type="button" data-dice-roll${totalSelected ? "" : " disabled"}>ROLL</button>
            </div>
            <div class="dice-tray-foot">
              <span>${escapeHtml(totalSelected ? `${totalSelected} / ${MAX_DICE_TRAY_DICE} dice queued` : "Choose dice to roll")}</span>
              <span>Rolling to table</span>
            </div>
          </div>
        ` : ""}
      `;
    }
