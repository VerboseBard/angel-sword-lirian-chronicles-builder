/* ═══════════════════════════════════════════════════════════════════════════
   Angel Sword — Lyrian Chronicles Companion for Foundry VTT (v0.1.0,
   EXPERIMENTAL SCAFFOLD — untested against a live Foundry install).

   Design boundary (BETA_2.20_VTT_INTEGRATION_PLAN.md): Actor data belongs to
   the active game system, so this module NEVER creates or edits Actors. The
   imported character lives in a per-user flag, and everything surfaces as
   ordinary chat rolls, which work identically in every game system.

   Chat commands (typed into Foundry chat):
     /asimport            — opens a dialog; paste the builder's exported JSON
     /ascharacter         — posts a short summary card of the imported character
     /asroll light        — 1d20 + light-attack bonus
     /asroll heavy        — 1d20 + heavy-attack bonus
     /asroll precise      — 1d20 + precise-attack bonus
     /asroll save         — 2d10 + save bonus
     /asroll init         — 1d20 + initiative
     /asroll 4d6+6 Label  — any raw formula with an optional label
   ═══════════════════════════════════════════════════════════════════════════ */

const MODULE_ID = "angel-sword-lyrian";
const FLAG_KEY = "character";

function getStoredCharacter() {
  return game.user?.getFlag(MODULE_ID, FLAG_KEY) || null;
}

function bonusFor(type, character) {
  const derived = character?.derived || character?.derivedStats || {};
  const map = {
    light: derived.lightAttack,
    heavy: derived.heavyAttack,
    precise: derived.preciseAttack,
    save: derived.saveBonus,
    init: derived.initiative
  };
  const value = Number(map[type]);
  return Number.isFinite(value) ? value : 0;
}

async function postRoll(formula, flavor) {
  const roll = new Roll(formula);
  await roll.evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker(),
    flavor
  });
}

function importDialog() {
  new Dialog({
    title: "Import Angel Sword Character",
    content: `
      <p>Paste the JSON exported from the Angel Sword Lyrian Chronicles builder
      (VTT &amp; Sharing → Export Character).</p>
      <textarea id="asl-import-json" rows="10" style="width: 100%;"></textarea>`,
    buttons: {
      import: {
        label: "Import",
        callback: async (html) => {
          const raw = html.find("#asl-import-json").val() || "";
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (error) {
            ui.notifications.error("Angel Sword: that was not valid JSON.");
            return;
          }
          if (parsed?.format === "angelssword-character" && parsed.character) {
            parsed = parsed.character; // accept the .aschar.json envelope directly
          }
          await game.user.setFlag(MODULE_ID, FLAG_KEY, parsed);
          const name = parsed?.name || parsed?.fields?.Name || "Unnamed character";
          ui.notifications.info(`Angel Sword: imported ${name} for ${game.user.name}.`);
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "import"
  }).render(true);
}

function characterSummary() {
  const character = getStoredCharacter();
  if (!character) {
    ui.notifications.warn("Angel Sword: no character imported yet. Use /asimport first.");
    return;
  }
  const name = character.name || character.fields?.Name || "Unnamed character";
  const derived = character.derived || character.derivedStats || {};
  const lines = [
    `<strong>${foundry.utils.escapeHTML ? foundry.utils.escapeHTML(name) : name}</strong>`,
    `Light ${derived.lightAttack ?? "?"} · Heavy ${derived.heavyAttack ?? "?"} · Precise ${derived.preciseAttack ?? "?"}`,
    `Save ${derived.saveBonus ?? "?"} · Initiative ${derived.initiative ?? "?"} · Potency ${derived.potency ?? "?"}`
  ];
  ChatMessage.create({ content: lines.join("<br>"), speaker: ChatMessage.getSpeaker() });
}

function handleCommand(command, args) {
  if (command === "/asimport") {
    importDialog();
    return true;
  }
  if (command === "/ascharacter") {
    characterSummary();
    return true;
  }
  if (command === "/asroll") {
    const character = getStoredCharacter();
    const first = (args[0] || "").toLowerCase();
    const named = { light: "1d20", heavy: "1d20", precise: "1d20", init: "1d20", save: "2d10" };
    if (named[first]) {
      if (!character) {
        ui.notifications.warn("Angel Sword: no character imported yet. Use /asimport first.");
        return true;
      }
      const bonus = bonusFor(first, character);
      const label = { light: "Light Attack", heavy: "Heavy Attack", precise: "Precise Attack", init: "Initiative", save: "Saving Throw" }[first];
      postRoll(`${named[first]}${bonus >= 0 ? "+" : ""}${bonus}`, `Angel Sword — ${label}`);
      return true;
    }
    if (first && /^[0-9d+\-\s]+$/i.test(first)) {
      postRoll(first, `Angel Sword — ${args.slice(1).join(" ") || "Roll"}`);
      return true;
    }
    ui.notifications.warn("Angel Sword: try /asroll light|heavy|precise|save|init or /asroll 4d6+6 Label.");
    return true;
  }
  return false;
}

Hooks.on("chatMessage", (log, message) => {
  const trimmed = String(message || "").trim();
  if (!trimmed.startsWith("/as")) {
    return true;
  }
  const [command, ...args] = trimmed.split(/\s+/);
  const handled = handleCommand(command.toLowerCase(), args);
  return handled ? false : true; // false stops Foundry from posting the raw text
});

Hooks.once("ready", () => {
  game.angelSword = {
    import: importDialog,
    summary: characterSummary,
    getCharacter: getStoredCharacter
  };
  console.info(`${MODULE_ID} | ready — /asimport, /ascharacter, /asroll`);
});
