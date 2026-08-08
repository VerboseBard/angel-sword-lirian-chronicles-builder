/* ═══════════════════════════════════════════════════════════════════════════
   Roll20 bridge connection manager (sheet side).
   Clean-room implementation of the behavior documented in
   BETA_2.20_ROLL20_PROTOCOL_SPEC.md — no upstream code was copied.

   The manager speaks two wire dialects with identical shapes:
     • "asb"      — our separately installed userscript
                    (roll20/angel-sword-roll20-bridge.user.js), the only bridge
                    that matches the public GitHub Pages origin.
     • "official" — the Angel's Sword Clio Companion, which also activates on
                    localhost/127.0.0.1 dev origins. Supporting its dialect
                    means developers with it installed need nothing extra.
   A macro send is routed to exactly ONE dialect (asb preferred) so having both
   userscripts installed can never double-post a macro into Roll20 chat.

   No resource spending happens here. Callers receive an acknowledgement
   promise; ack-gated spending is a separate, later milestone.
   ═══════════════════════════════════════════════════════════════════════════ */

export const BRIDGE_DIALECTS = Object.freeze({
  official: Object.freeze({ pageTag: "clio-battle", bridgeTag: "clio-companion", pokeEvent: "clio-battle-poke", mailboxKey: "clioBattleMsg" }),
  asb: Object.freeze({ pageTag: "asb-battle", bridgeTag: "asb-companion", pokeEvent: "asb-battle-poke", mailboxKey: "asbBridgeMsg" })
});

export const BRIDGE_TIMING = Object.freeze({
  PING_INTERVAL_MS: 5000,
  SEND_TIMEOUT_MS: 3000,
  COMPANION_SILENT_MS: 15000
});

export const BRIDGE_LIMITS = Object.freeze({
  MAX_MACRO_LENGTH: 4000,
  MAX_ID_LENGTH: 64
});

export const BRIDGE_STATES = Object.freeze({
  NOT_INSTALLED: "not-installed",
  NO_ROLL20: "no-roll20",
  CONNECTED: "connected"
});

function defaultPost(payload, dialect) {
  window.postMessage(payload, "*");
  try {
    document.documentElement.dataset[dialect.mailboxKey] = JSON.stringify(payload);
    document.dispatchEvent(new Event(dialect.pokeEvent));
  } catch (error) {
    /* postMessage path remains */
  }
}

function defaultSubscribe(handler) {
  const listener = (event) => {
    if (event.origin !== window.location.origin) {
      return;
    }
    handler(event.data);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

/**
 * @param {Object} [env] — injectable environment for tests.
 * @param {Function} [env.post] — (payload, dialect) => void
 * @param {Function} [env.subscribe] — (handler) => unsubscribe
 * @param {Function} [env.now] — () => epoch ms
 * @param {Function} [env.setTimeout] / [env.clearTimeout]
 * @param {Function} [env.setInterval] / [env.clearInterval]
 */
export function createRoll20Bridge(env = {}) {
  const post = env.post || defaultPost;
  const subscribe = env.subscribe || defaultSubscribe;
  const now = env.now || (() => Date.now());
  const setT = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const clearT = env.clearTimeout || ((handle) => clearTimeout(handle));
  const setI = env.setInterval || ((fn, ms) => setInterval(fn, ms));
  const clearI = env.clearInterval || ((handle) => clearInterval(handle));

  const dialects = {
    asb: { config: BRIDGE_DIALECTS.asb, lastStatusAt: 0, roll20: false },
    official: { config: BRIDGE_DIALECTS.official, lastStatusAt: 0, roll20: false }
  };
  const pending = new Map(); // send id → { resolve, reject, timer }
  const pendingQueries = new Map(); // query id → { resolve, reject, timer }
  const stateListeners = new Set();
  let unsubscribe = null;
  let pingHandle = null;
  let lastEmittedState = null;
  let idCounter = 0;
  let started = false;

  function dialectAlive(entry) {
    return entry.lastStatusAt > 0 && (now() - entry.lastStatusAt) < BRIDGE_TIMING.COMPANION_SILENT_MS;
  }

  function getState() {
    const anyInstalled = dialectAlive(dialects.asb) || dialectAlive(dialects.official);
    if (!anyInstalled) {
      return BRIDGE_STATES.NOT_INSTALLED;
    }
    const anyConnected = (dialectAlive(dialects.asb) && dialects.asb.roll20)
      || (dialectAlive(dialects.official) && dialects.official.roll20);
    return anyConnected ? BRIDGE_STATES.CONNECTED : BRIDGE_STATES.NO_ROLL20;
  }

  function emitStateIfChanged() {
    const state = getState();
    if (state === lastEmittedState) {
      return;
    }
    lastEmittedState = state;
    stateListeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        /* one bad listener must not break the rest */
      }
    });
  }

  function preferredDialect() {
    if (dialectAlive(dialects.asb) && dialects.asb.roll20) {
      return dialects.asb.config;
    }
    if (dialectAlive(dialects.official) && dialects.official.roll20) {
      return dialects.official.config;
    }
    return null;
  }

  function handleMessage(data) {
    if (!data || typeof data !== "object" || typeof data.type !== "string") {
      return;
    }
    const entry = data.source === BRIDGE_DIALECTS.asb.bridgeTag
      ? dialects.asb
      : data.source === BRIDGE_DIALECTS.official.bridgeTag
        ? dialects.official
        : null;
    if (!entry) {
      return;
    }
    if (data.type === "status" && typeof data.roll20 === "boolean") {
      entry.lastStatusAt = now();
      entry.roll20 = data.roll20;
      emitStateIfChanged();
      return;
    }
    if (data.type === "ack" && typeof data.id === "string" && typeof data.ok === "boolean") {
      const record = pending.get(data.id);
      if (!record) {
        return; // duplicate or unknown ack — settled ids are removed on first ack
      }
      pending.delete(data.id);
      clearT(record.timer);
      if (data.ok) {
        record.resolve({ ok: true, id: data.id });
      } else {
        record.reject(new Error(typeof data.error === "string" && data.error ? data.error : "The Roll20 bridge reported a send failure."));
      }
      return;
    }
    if (data.type === "selected" && typeof data.id === "string" && typeof data.ok === "boolean") {
      const record = pendingQueries.get(data.id);
      if (!record) {
        return; // duplicate or unknown reply
      }
      pendingQueries.delete(data.id);
      clearT(record.timer);
      if (data.ok && typeof data.tokenId === "string" && data.tokenId) {
        record.resolve({ ok: true, tokenId: data.tokenId, name: typeof data.name === "string" ? data.name : "" });
      } else {
        record.reject(new Error(typeof data.error === "string" && data.error ? data.error : "Nothing is selected on the Roll20 tabletop."));
      }
    }
  }

  function pingAll() {
    post({ source: BRIDGE_DIALECTS.asb.pageTag, type: "ping" }, BRIDGE_DIALECTS.asb);
    post({ source: BRIDGE_DIALECTS.official.pageTag, type: "ping" }, BRIDGE_DIALECTS.official);
    emitStateIfChanged(); // the ping tick also ages silent companions out
  }

  function start() {
    if (started) {
      return;
    }
    started = true;
    unsubscribe = subscribe(handleMessage);
    pingAll();
    pingHandle = setI(pingAll, BRIDGE_TIMING.PING_INTERVAL_MS);
  }

  function destroy() {
    if (pingHandle !== null) {
      clearI(pingHandle);
      pingHandle = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    pending.forEach((record) => {
      clearT(record.timer);
      record.reject(new Error("The Roll20 bridge was shut down before this send finished."));
    });
    pending.clear();
    pendingQueries.forEach((record) => {
      clearT(record.timer);
      record.reject(new Error("The Roll20 bridge was shut down before this query finished."));
    });
    pendingQueries.clear();
    stateListeners.clear();
    started = false;
  }

  function nextId() {
    idCounter += 1;
    return `asb-${now().toString(36)}-${idCounter.toString(36)}`;
  }

  function sendMacro(macro, meta = {}) {
    if (typeof macro !== "string" || !macro.trim()) {
      return Promise.reject(new Error("There is no macro to send."));
    }
    if (macro.length > BRIDGE_LIMITS.MAX_MACRO_LENGTH) {
      return Promise.reject(new Error("This macro is too large to send safely. Use Copy VTT instead."));
    }
    const dialect = preferredDialect();
    if (!dialect) {
      const state = getState();
      return Promise.reject(new Error(state === BRIDGE_STATES.NOT_INSTALLED
        ? "The Roll20 bridge userscript is not installed or not responding."
        : "No open Roll20 game tab was found."));
    }
    const id = nextId();
    const payload = { source: dialect.pageTag, type: "send", id, macro };
    ["kind", "bonus", "formula", "tokenId", "pr"].forEach((key) => {
      if (meta[key] !== undefined) {
        payload[key] = meta[key];
      }
    });
    return new Promise((resolve, reject) => {
      const timer = setT(() => {
        if (pending.delete(id)) {
          reject(new Error("The Roll20 bridge did not answer in time. Is the Roll20 tab still open?"));
        }
      }, BRIDGE_TIMING.SEND_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      post(payload, dialect);
    });
  }

  /** Ask the connected bridge which token is selected on the Roll20 tabletop.
      Resolves { ok:true, tokenId, name } or rejects with a readable reason. */
  function getSelectedToken() {
    const dialect = preferredDialect();
    if (!dialect) {
      const state = getState();
      return Promise.reject(new Error(state === BRIDGE_STATES.NOT_INSTALLED
        ? "The Roll20 bridge userscript is not installed or not responding."
        : "No open Roll20 game tab was found."));
    }
    const id = nextId();
    return new Promise((resolve, reject) => {
      const timer = setT(() => {
        if (pendingQueries.delete(id)) {
          reject(new Error("The Roll20 bridge did not answer the token query in time."));
        }
      }, BRIDGE_TIMING.SEND_TIMEOUT_MS);
      pendingQueries.set(id, { resolve, reject, timer });
      post({ source: dialect.pageTag, type: "getSelected", id }, dialect);
    });
  }

  function onStateChange(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  }

  return {
    start,
    destroy,
    getState,
    onStateChange,
    sendMacro,
    getSelectedToken,
    isConnected: () => getState() === BRIDGE_STATES.CONNECTED,
    pendingCount: () => pending.size + pendingQueries.size,
    _handleMessage: handleMessage // exposed for focused tests
  };
}

/* ─── TokenMod bar-sync command (pure helper, unit-tested) ──────────────
   Table convention (documented in the protocol spec): bar1 HP, bar2 Mana,
   bar3 RP, bar4 Shield/Temp HP. Requires the GM-installed TokenMod mod in
   the Roll20 game — which is why bar sync is strictly opt-in. The command
   targets the PINNED token id, never the current selection. */
export function buildTokenModCommand(tokenId, resources = {}) {
  if (typeof tokenId !== "string" || !tokenId.trim()) {
    return "";
  }
  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const pairs = [
    `bar1_value|${num(resources.hpCurrent)}`, `bar1_max|${num(resources.hpMax)}`,
    `bar2_value|${num(resources.manaCurrent)}`, `bar2_max|${num(resources.manaMax)}`,
    `bar3_value|${num(resources.rpCurrent)}`, `bar3_max|${num(resources.rpMax)}`,
    `bar4_value|${num(resources.tempHp)}`
  ];
  return `!token-mod --ignore-selected --ids ${tokenId.trim()} --set ${pairs.join(" ")}`;
}
