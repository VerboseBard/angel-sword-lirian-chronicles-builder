(function (root) {
  "use strict";

  const legacy = root.LyrianLegacyDiceRoller;
  const shared = root.LyrianAccurateDiceRoller;

  function normalizeId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function usesSharedCore(setId) {
    const id = normalizeId(setId);
    return id === "new-angelsword"
      || (root.LYRIAN_PROMOTED_DICE_SKINS || []).some((pack) => normalizeId(pack?.id) === id);
  }

  function select(setId) {
    return usesSharedCore(setId) ? shared : legacy;
  }

  root.LyrianWorkshopDiceRoller = shared;
  root.LyrianAccurateDiceRoller = {
    rollDice(options = {}) {
      root.LYRIAN_ACTIVE_DICE_SKIN_ID = normalizeId(options.setId);
      return select(options.setId)?.rollDice?.(options) || 0;
    },
    buildPreviewDataUrl(options = {}) {
      return select(options.setId)?.buildPreviewDataUrl?.(options) || "";
    },
    preloadFaceArt(setId = "") {
      return select(setId)?.preloadFaceArt?.(setId) || 0;
    },
    validateAllFaceSettles(options = {}) {
      return select(options.setId)?.validateAllFaceSettles?.(options) || null;
    },
    clear() {
      shared?.clear?.();
      legacy?.clear?.();
    },
    clearTextureCache() {
      shared?.clearTextureCache?.();
      legacy?.clearTextureCache?.();
    },
    getStatus() {
      return {
        router: "lyrian-dice-core-router/v1",
        promotedSkinIds: (root.LYRIAN_PROMOTED_DICE_SKINS || []).map((pack) => pack.id),
        shared: shared?.getStatus?.() || null,
        legacy: legacy?.getStatus?.() || null
      };
    }
  };
}(typeof window !== "undefined" ? window : globalThis));
