/* Behavior-level Roll20 bridge protocol fixture.
   Mirrors BETA_2.20_ROLL20_PROTOCOL_SPEC.md; imported by the bridge unit tests so the
   spec, the manager, and the userscript cannot drift apart silently. */

export const DIALECTS = Object.freeze({
  official: Object.freeze({ pageTag: "clio-battle", bridgeTag: "clio-companion", pokeEvent: "clio-battle-poke", mailboxKey: "clioBattleMsg" }),
  asb: Object.freeze({ pageTag: "asb-battle", bridgeTag: "asb-companion", pokeEvent: "asb-battle-poke", mailboxKey: "asbBridgeMsg" })
});

export const TIMING = Object.freeze({
  PING_INTERVAL_MS: 5000,
  SEND_TIMEOUT_MS: 3000,
  COMPANION_SILENT_MS: 15000,
  STORAGE_POLL_MS: 600,
  HEARTBEAT_MS: 4000,
  HEARTBEAT_STALE_MS: 90000
});

export const LIMITS = Object.freeze({
  MAX_MACRO_LENGTH: 4000,
  MAX_ID_LENGTH: 64
});

export const STORAGE_KEYS = Object.freeze({
  alive: "asb20_alive",
  send: "asb20_send",
  ack: "asb20_ack"
});

/* ── Sample messages (shape reference for tests) ─────────────────────── */

export function samplePing(dialect = DIALECTS.asb) {
  return { source: dialect.pageTag, type: "ping" };
}

export function sampleSend(dialect = DIALECTS.asb, overrides = {}) {
  return {
    source: dialect.pageTag,
    type: "send",
    id: "t-0001",
    macro: "&{template:default} {{name=Test — Light Attack}} {{Attack=[[1d20+4]]}}",
    ...overrides
  };
}

export function sampleStatus(dialect = DIALECTS.asb, roll20 = true) {
  return { source: dialect.bridgeTag, type: "status", roll20 };
}

export function sampleAck(dialect = DIALECTS.asb, overrides = {}) {
  return { source: dialect.bridgeTag, type: "ack", id: "t-0001", ok: true, ...overrides };
}

/* ── Shape validators used by tests ──────────────────────────────────── */

function isNonEmptyString(value, max = 10000) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export function isValidPageMessage(msg, dialect) {
  if (!msg || typeof msg !== "object" || msg.source !== dialect.pageTag) {
    return false;
  }
  if (msg.type === "ping") {
    return true;
  }
  if (msg.type === "send") {
    return isNonEmptyString(msg.id, LIMITS.MAX_ID_LENGTH) && isNonEmptyString(msg.macro, LIMITS.MAX_MACRO_LENGTH);
  }
  if (msg.type === "getSelected") {
    return isNonEmptyString(msg.id, LIMITS.MAX_ID_LENGTH);
  }
  return false;
}

export function isValidBridgeMessage(msg, dialect) {
  if (!msg || typeof msg !== "object" || msg.source !== dialect.bridgeTag) {
    return false;
  }
  if (msg.type === "status") {
    return typeof msg.roll20 === "boolean";
  }
  if (msg.type === "ack") {
    return isNonEmptyString(msg.id, LIMITS.MAX_ID_LENGTH) && typeof msg.ok === "boolean";
  }
  if (msg.type === "selected") {
    return isNonEmptyString(msg.id, LIMITS.MAX_ID_LENGTH) && typeof msg.ok === "boolean";
  }
  return false;
}
