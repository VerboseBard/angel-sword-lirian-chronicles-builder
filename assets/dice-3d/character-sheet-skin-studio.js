(function (root) {
  "use strict";

  function normalizeId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getPack(id) {
    const key = normalizeId(id);
    return (root.LYRIAN_PROMOTED_DICE_SKINS || []).find((pack) => normalizeId(pack?.id) === key) || null;
  }

  root.DiceSkinStudio = {
    getActiveSkinId() {
      return normalizeId(root.LYRIAN_ACTIVE_DICE_SKIN_ID || "new-angelsword");
    },
    getFaceImage(setId, dieKey, faceKey) {
      const id = normalizeId(setId);
      const die = normalizeId(dieKey);
      const face = String(faceKey || "").trim();
      return root.LYRIAN_DICE_FACE_ART?.[`${id}:${die}:${face}`] || "";
    },
    getPalette(setId) {
      return root.LYRIAN_DICE_SKIN_PALETTES?.[normalizeId(setId)] || getPack(setId)?.palette || {};
    },
    getVersion() {
      const packs = root.LYRIAN_PROMOTED_DICE_SKINS || [];
      return `character-sheet-promoted-${packs.map((pack) => `${pack.id}:${pack.generatedAt || "unknown"}`).join("|")}`;
    }
  };
}(typeof window !== "undefined" ? window : globalThis));
