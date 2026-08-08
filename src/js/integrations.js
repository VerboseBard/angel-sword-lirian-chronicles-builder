import { cleanText, toNumber } from "./utils.js";

export const VTT_PLATFORM_URLS = Object.freeze({
  roll20: "https://app.roll20.net/",
  owlbear: "https://www.owlbear.rodeo/",
  foundry: "https://foundryvtt.com/",
  worldAnvil: "https://www.worldanvil.com/player"
});

function sanitizeRoll20Value(value, fallback = "") {
  return cleanText(value || fallback)
    .replace(/[{}]/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roll20Field(label, value) {
  const safeLabel = sanitizeRoll20Value(label);
  const safeValue = sanitizeRoll20Value(value);
  return safeLabel && safeValue ? `{{${safeLabel}=${safeValue}}}` : "";
}

function formatInlineModifier(value) {
  const amount = toNumber(value, 0);
  return amount >= 0 ? `+${amount}` : String(amount);
}

function normalizeInlineFormula(formula) {
  return sanitizeRoll20Value(formula).replace(/\s+/g, "");
}

export function buildRoll20CharacterMacro(character = {}) {
  const name = sanitizeRoll20Value(character.name, "Lyrian Character");
  const resources = character.resources || {};
  const fields = [
    roll20Field("Species", [character.race, character.ancestry].filter(Boolean).join(" / ")),
    roll20Field("Classes", (character.classes || []).join(", ")),
    roll20Field("HP", `${resources.hpCurrent ?? "-"} / ${resources.hpMax ?? "-"}`),
    roll20Field("Mana", `${resources.manaCurrent ?? "-"} / ${resources.manaMax ?? "-"}`),
    roll20Field("AP", `${resources.apCurrent ?? "-"} / ${resources.apMax ?? "-"}`),
    roll20Field("RP", `${resources.rpCurrent ?? "-"} / ${resources.rpMax ?? "-"}`),
    roll20Field("Guard / Evasion", `${character.guard ?? "-"} / ${character.evasion ?? "-"}`),
    roll20Field("Speed / Initiative", `${character.speed ?? "-"} ft. / ${formatInlineModifier(character.initiative)}`),
    roll20Field("Potency / Save", `${character.potency ?? "-"} / ${formatInlineModifier(character.saveBonus)}`)
  ].filter(Boolean);
  return `&{template:default} {{name=${name} — Angel Sword}} ${fields.join(" ")}`;
}

export function buildRoll20ActionMacro(characterName, action = {}, derived = {}) {
  const name = sanitizeRoll20Value(characterName, "Lyrian Character");
  const label = sanitizeRoll20Value(action.label, "Action");
  const fields = [
    roll20Field("Cost", action.costLabel),
    roll20Field("Details", action.summary)
  ];
  if (action.rollType) {
    const attackBonus = toNumber(derived[action.rollType], 0);
    fields.push(roll20Field("Attack", `[[1d20${formatInlineModifier(attackBonus)}]]`));
  }
  if (action.damage) {
    const damageFormula = normalizeInlineFormula(action.damage.rollFormula || action.damage.value);
    fields.push(roll20Field(action.damage.label || "Damage", damageFormula ? `[[${damageFormula}]] ${action.damage.detail || ""}` : action.damage.value));
  }
  if (action.weaponName) {
    fields.push(roll20Field("Weapon", action.weaponName));
  }
  return `&{template:default} {{name=${name} — ${label}}} ${fields.filter(Boolean).join(" ")}`;
}

export function buildRoll20AbilityMacro(characterName, ability = {}) {
  const name = sanitizeRoll20Value(characterName, "Lyrian Character");
  const abilityName = sanitizeRoll20Value(ability.name, "Ability");
  const description = ability.descriptionText || ability.description || "See the Angel Sword character sheet for details.";
  const fields = [
    roll20Field("Source", ability.source),
    roll20Field("Cost", ability.costLabel),
    roll20Field("Range", ability.range),
    roll20Field("Effect", description)
  ].filter(Boolean);
  return `&{template:default} {{name=${name} — ${abilityName}}} ${fields.join(" ")}`;
}

export function buildCharacterProfileSummary(character = {}) {
  const resources = character.resources || {};
  const lines = [
    `# ${cleanText(character.name) || "Lyrian Character"}`,
    [character.race, character.ancestry].filter(Boolean).join(" / "),
    (character.classes || []).length ? `Classes: ${character.classes.join(", ")}` : "",
    `HP ${resources.hpCurrent ?? "-"}/${resources.hpMax ?? "-"} | Mana ${resources.manaCurrent ?? "-"}/${resources.manaMax ?? "-"} | AP ${resources.apCurrent ?? "-"}/${resources.apMax ?? "-"} | RP ${resources.rpCurrent ?? "-"}/${resources.rpMax ?? "-"}`,
    `Guard ${character.guard ?? "-"} | Evasion ${character.evasion ?? "-"} | Speed ${character.speed ?? "-"} ft. | Initiative ${formatInlineModifier(character.initiative)}`,
    `Potency ${character.potency ?? "-"} | Save ${formatInlineModifier(character.saveBonus)}`,
    cleanText(character.personality) ? `Personality: ${cleanText(character.personality)}` : "",
    cleanText(character.appearance) ? `Appearance: ${cleanText(character.appearance)}` : ""
  ];
  return lines.filter(Boolean).join("\n\n");
}

/** World Anvil article body using its BBCode dialect ([h1], [b], [ul]…). */
export function buildWorldAnvilBBCodeProfile(character = {}) {
  const resources = character.resources || {};
  const name = cleanText(character.name) || "Lyrian Character";
  const species = [character.race, character.ancestry].filter(Boolean).join(" / ");
  const lines = [
    `[h1]${name}[/h1]`,
    species ? `[b]Species:[/b] ${species}` : "",
    (character.classes || []).length ? `[b]Classes:[/b] ${character.classes.join(", ")}` : "",
    "[h2]Combat Profile[/h2]",
    "[ul]",
    `[li]HP ${resources.hpCurrent ?? "-"}/${resources.hpMax ?? "-"} — Mana ${resources.manaCurrent ?? "-"}/${resources.manaMax ?? "-"} — AP ${resources.apCurrent ?? "-"}/${resources.apMax ?? "-"} — RP ${resources.rpCurrent ?? "-"}/${resources.rpMax ?? "-"}[/li]`,
    `[li]Guard ${character.guard ?? "-"} — Evasion ${character.evasion ?? "-"} — Speed ${character.speed ?? "-"} ft. — Initiative ${formatInlineModifier(character.initiative)}[/li]`,
    `[li]Potency ${character.potency ?? "-"} — Save ${formatInlineModifier(character.saveBonus)}[/li]`,
    "[/ul]",
    cleanText(character.personality) ? `[h2]Personality[/h2]\n${cleanText(character.personality)}` : "",
    cleanText(character.appearance) ? `[h2]Appearance[/h2]\n${cleanText(character.appearance)}` : "",
    "[i]Exported from the Angel Sword Lyrian Chronicles builder.[/i]"
  ];
  return lines.filter(Boolean).join("\n");
}

export async function copyIntegrationText(value) {
  const text = String(value || "");
  if (!text) {
    throw new Error("There is nothing to copy yet.");
  }
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("The browser blocked clipboard access.");
  }
}
