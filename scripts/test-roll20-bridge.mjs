/* Focused Roll20 bridge tests (no browser needed):
   1. Spec drift check — manager constants must equal the protocol fixture.
   2. Connection-manager unit tests with a manual clock: ping, status aging,
      request-id correlation, positive/negative ack, timeout, duplicate ack,
      reconnect, dialect preference, and teardown.
   3. Userscript transport tests — the real userscript file runs in node:vm
      against mocked userscript storage for both personalities, including
      multi-tab arbitration and duplicate-delivery dedupe.
   Run: npm run test:roll20 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
  BRIDGE_DIALECTS, BRIDGE_LIMITS, BRIDGE_STATES, BRIDGE_TIMING, buildTokenModCommand, createRoll20Bridge
} from "../src/js/roll20-bridge.js";
import {
  DIALECTS, LIMITS, STORAGE_KEYS, TIMING, isValidBridgeMessage, isValidPageMessage,
  sampleAck, samplePing, sampleSend, sampleStatus
} from "./roll20-protocol-fixture.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) {
    return;
  }
  failures += 1;
  console.error(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
}

/* ── Manual clock for the manager ────────────────────────────────────── */
function createClock() {
  let now = 1000000; // nonzero epoch: lastStatusAt === 0 must keep meaning "never"
  let seq = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const id = seq++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    setInterval: (fn, ms) => { const id = seq++; timers.set(id, { fn, at: now + ms, every: ms }); return id; },
    clearInterval: (id) => { timers.delete(id); },
    timerCount: () => timers.size,
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let nextId = null;
        let nextAt = Infinity;
        timers.forEach((timer, id) => {
          if (timer.at <= target && timer.at < nextAt) {
            nextAt = timer.at;
            nextId = id;
          }
        });
        if (nextId === null) {
          break;
        }
        const timer = timers.get(nextId);
        now = timer.at;
        if (timer.every) {
          timer.at = now + timer.every;
        } else {
          timers.delete(nextId);
        }
        timer.fn();
      }
      now = target;
    }
  };
}

function createManagerHarness() {
  const clock = createClock();
  const posts = [];
  let handler = null;
  const bridge = createRoll20Bridge({
    post: (payload, dialect) => posts.push({ payload, dialect }),
    subscribe: (fn) => { handler = fn; return () => { handler = null; }; },
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval
  });
  return { bridge, clock, posts, deliver: (data) => handler && handler(data) };
}

async function testSpecDrift() {
  console.log("— spec drift —");
  check("dialect tags match fixture", JSON.stringify(BRIDGE_DIALECTS) === JSON.stringify(DIALECTS));
  check("PING_INTERVAL matches", BRIDGE_TIMING.PING_INTERVAL_MS === TIMING.PING_INTERVAL_MS);
  check("SEND_TIMEOUT matches", BRIDGE_TIMING.SEND_TIMEOUT_MS === TIMING.SEND_TIMEOUT_MS);
  check("COMPANION_SILENT matches", BRIDGE_TIMING.COMPANION_SILENT_MS === TIMING.COMPANION_SILENT_MS);
  check("macro limit matches", BRIDGE_LIMITS.MAX_MACRO_LENGTH === LIMITS.MAX_MACRO_LENGTH);
  check("id limit matches", BRIDGE_LIMITS.MAX_ID_LENGTH === LIMITS.MAX_ID_LENGTH);
}

async function testManager() {
  console.log("— connection manager —");
  {
    const { bridge, posts } = createManagerHarness();
    check("initial state is not-installed", bridge.getState() === BRIDGE_STATES.NOT_INSTALLED);
    bridge.start();
    check("start pings both dialects", posts.length === 2);
    check("pings are valid page messages", posts.every((entry) => {
      const dialect = entry.payload.source === DIALECTS.asb.pageTag ? DIALECTS.asb : DIALECTS.official;
      return isValidPageMessage(entry.payload, dialect);
    }));
    bridge.destroy();
  }
  {
    const { bridge, clock, deliver } = createManagerHarness();
    const seen = [];
    bridge.onStateChange((state) => seen.push(state));
    bridge.start();
    deliver(sampleStatus(DIALECTS.asb, false));
    check("status roll20:false → no-roll20", bridge.getState() === BRIDGE_STATES.NO_ROLL20);
    deliver(sampleStatus(DIALECTS.asb, true));
    check("status roll20:true → connected", bridge.getState() === BRIDGE_STATES.CONNECTED);
    check("state changes were emitted in order (initial state included for first render)",
      JSON.stringify(seen) === JSON.stringify([BRIDGE_STATES.NOT_INSTALLED, BRIDGE_STATES.NO_ROLL20, BRIDGE_STATES.CONNECTED]));
    clock.advance(BRIDGE_TIMING.COMPANION_SILENT_MS + BRIDGE_TIMING.PING_INTERVAL_MS);
    check("silent companion ages out to not-installed", bridge.getState() === BRIDGE_STATES.NOT_INSTALLED);
    deliver(sampleStatus(DIALECTS.asb, true));
    check("reconnect returns to connected", bridge.getState() === BRIDGE_STATES.CONNECTED);
    check("reconnect emitted a state change", seen[seen.length - 1] === BRIDGE_STATES.CONNECTED && seen.length === 5);
    bridge.destroy();
  }
  {
    const { bridge, posts, deliver } = createManagerHarness();
    bridge.start();
    deliver(sampleStatus(DIALECTS.asb, true));
    deliver(sampleStatus(DIALECTS.official, true));
    posts.length = 0;
    let resolved = null;
    bridge.sendMacro("&{template:default} {{name=T}}").then((result) => { resolved = result; }, () => { resolved = "rejected"; });
    check("send posts exactly one message", posts.length === 1);
    check("send prefers the asb dialect", posts[0].payload.source === DIALECTS.asb.pageTag);
    check("send payload is fixture-valid", isValidPageMessage(posts[0].payload, DIALECTS.asb));
    const id = posts[0].payload.id;
    deliver(sampleAck(DIALECTS.asb, { id }));
    await null;
    check("positive ack resolves the send", resolved && resolved.ok === true && resolved.id === id);
    check("settled send leaves no pending record", bridge.pendingCount() === 0);
    deliver(sampleAck(DIALECTS.asb, { id }));
    await null;
    check("duplicate ack is ignored", resolved && resolved.ok === true);
    bridge.destroy();
  }
  {
    const { bridge, posts, deliver } = createManagerHarness();
    bridge.start();
    deliver(sampleStatus(DIALECTS.official, true));
    posts.length = 0;
    bridge.sendMacro("&{template:default} {{name=T}}").catch(() => {});
    check("official-only connection routes to the official dialect", posts[0].payload.source === DIALECTS.official.pageTag);
    bridge.destroy();
  }
  {
    const { bridge, deliver } = createManagerHarness();
    bridge.start();
    deliver(sampleStatus(DIALECTS.asb, true));
    let error = null;
    bridge.sendMacro("&{template:default} {{name=T}}").catch((rejection) => { error = rejection; });
    const pendingId = null;
    deliver(sampleAck(DIALECTS.asb, { id: "unknown-id", ok: false }));
    await null;
    check("ack for an unknown id is ignored", error === null && bridge.pendingCount() === 1, String(pendingId));
    bridge.destroy();
  }
  {
    const { bridge, posts, deliver } = createManagerHarness();
    bridge.start();
    deliver(sampleStatus(DIALECTS.asb, true));
    posts.length = 0;
    let error = null;
    bridge.sendMacro("&{template:default} {{name=T}}").catch((rejection) => { error = rejection; });
    deliver(sampleAck(DIALECTS.asb, { id: posts[0].payload.id, ok: false, error: "Roll20 chat box not found" }));
    await null;
    check("negative ack rejects with the bridge error", error && /chat box/.test(error.message));
    bridge.destroy();
  }
  {
    const { bridge, clock, posts, deliver } = createManagerHarness();
    bridge.start();
    deliver(sampleStatus(DIALECTS.asb, true));
    posts.length = 0;
    let error = null;
    bridge.sendMacro("&{template:default} {{name=T}}").catch((rejection) => { error = rejection; });
    clock.advance(BRIDGE_TIMING.SEND_TIMEOUT_MS + 1);
    await null;
    check("timeout rejects the send", error && /did not answer/.test(error.message));
    check("timed-out send leaves no pending record", bridge.pendingCount() === 0);
    const lateId = posts[0].payload.id;
    deliver(sampleAck(DIALECTS.asb, { id: lateId }));
    await null;
    check("late ack after timeout is ignored", error && /did not answer/.test(error.message));
    bridge.destroy();
  }
  {
    const { bridge } = createManagerHarness();
    bridge.start();
    let error = null;
    bridge.sendMacro("&{template:default} {{name=T}}").catch((rejection) => { error = rejection; });
    await null;
    check("send without a bridge rejects immediately", error && /not installed/.test(error.message));
    bridge.destroy();
  }
  {
    const { bridge, deliver } = createManagerHarness();
    bridge.start();
    deliver(sampleStatus(DIALECTS.asb, false));
    let error = null;
    bridge.sendMacro("&{template:default} {{name=T}}").catch((rejection) => { error = rejection; });
    await null;
    check("send without an open Roll20 tab rejects immediately", error && /No open Roll20/.test(error.message));
    bridge.destroy();
  }
  {
    const { bridge, deliver } = createManagerHarness();
    bridge.start();
    deliver(sampleStatus(DIALECTS.asb, true));
    let error = null;
    bridge.sendMacro("x".repeat(BRIDGE_LIMITS.MAX_MACRO_LENGTH + 1)).catch((rejection) => { error = rejection; });
    await null;
    check("oversized macro is refused locally", error && /too large/.test(error.message));
    bridge.destroy();
  }
  {
    const { bridge, clock, deliver } = createManagerHarness();
    bridge.start();
    deliver(sampleStatus(DIALECTS.asb, true));
    let error = null;
    bridge.sendMacro("&{template:default} {{name=T}}").catch((rejection) => { error = rejection; });
    bridge.destroy();
    await null;
    check("destroy rejects in-flight sends", error && /shut down/.test(error.message));
    check("destroy clears all timers", clock.timerCount() === 0);
  }
  {
    const { bridge, posts, deliver } = createManagerHarness();
    bridge.start();
    deliver(sampleStatus(DIALECTS.asb, true));
    posts.length = 0;
    bridge.sendMacro("&{template:default} {{name=Init}}", { kind: "initiative", pr: 17, tokenId: "-tok1" }).catch(() => {});
    const payload = posts[0].payload;
    check("initiative metadata rides the send payload", payload.kind === "initiative" && payload.pr === 17 && payload.tokenId === "-tok1");
    bridge.destroy();
  }
  {
    const { bridge, posts, deliver } = createManagerHarness();
    bridge.start();
    deliver(sampleStatus(DIALECTS.asb, true));
    posts.length = 0;
    let result = null;
    let error = null;
    bridge.getSelectedToken().then((value) => { result = value; }, (rejection) => { error = rejection; });
    check("getSelected posts a fixture-valid query", posts.length === 1 && isValidPageMessage(posts[0].payload, DIALECTS.asb) && posts[0].payload.type === "getSelected");
    const queryId = posts[0].payload.id;
    deliver({ source: DIALECTS.asb.bridgeTag, type: "selected", id: queryId, ok: true, tokenId: "-abc", name: "Hero" });
    await null;
    check("selected reply resolves the query", result && result.tokenId === "-abc" && result.name === "Hero" && !error);
    deliver({ source: DIALECTS.asb.bridgeTag, type: "selected", id: queryId, ok: true, tokenId: "-other" });
    await null;
    check("duplicate selected reply is ignored", result && result.tokenId === "-abc");
    bridge.destroy();
  }
  {
    const { bridge, clock, deliver } = createManagerHarness();
    bridge.start();
    deliver(sampleStatus(DIALECTS.asb, true));
    let error = null;
    bridge.getSelectedToken().catch((rejection) => { error = rejection; });
    clock.advance(BRIDGE_TIMING.SEND_TIMEOUT_MS + 1);
    await null;
    check("token query times out cleanly", error && /token query/.test(error.message));
    check("timed-out query leaves no pending record", bridge.pendingCount() === 0);
    bridge.destroy();
  }
  {
    const { bridge } = createManagerHarness();
    bridge.start();
    let error = null;
    bridge.getSelectedToken().catch((rejection) => { error = rejection; });
    await null;
    check("token query without a bridge rejects immediately", error && /not installed/.test(error.message));
    bridge.destroy();
  }
  {
    const command = buildTokenModCommand("-tok9", { hpCurrent: 30, hpMax: 32, manaCurrent: 7, manaMax: 11, rpCurrent: 4, rpMax: 6, tempHp: 5 });
    check("TokenMod command targets the pinned token, not the selection",
      command.startsWith("!token-mod --ignore-selected --ids -tok9 --set "));
    check("TokenMod bar convention is bar1 HP / bar2 Mana / bar3 RP / bar4 Shield",
      command.includes("bar1_value|30 bar1_max|32") && command.includes("bar2_value|7 bar2_max|11")
      && command.includes("bar3_value|4 bar3_max|6") && command.includes("bar4_value|5"));
    check("TokenMod command with no token is empty", buildTokenModCommand("", {}) === "");
    check("TokenMod command survives missing resources", buildTokenModCommand("-t", {}).includes("bar1_value|0"));
  }
}

/* ── Userscript harness (node:vm) ────────────────────────────────────── */
function createUserscriptSandbox({ host, chatBox, unsafeWindow }) {
  const gmStore = new Map();
  const gmListeners = new Map();
  const intervals = [];
  const timeouts = [];
  const pagePosts = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  const dataset = {};

  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    unsafeWindow,
    location: { host, origin: host === "app.roll20.net" ? "https://app.roll20.net" : `http://${host}` },
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
    clearInterval: () => {},
    clearTimeout: () => {},
    GM_getValue: (key, fallback) => (gmStore.has(key) ? gmStore.get(key) : fallback),
    GM_setValue: (key, value) => {
      const old = gmStore.get(key);
      gmStore.set(key, value);
      (gmListeners.get(key) || []).forEach((listener) => listener(key, old, value));
    },
    GM_addValueChangeListener: (key, listener) => {
      if (!gmListeners.has(key)) {
        gmListeners.set(key, []);
      }
      gmListeners.get(key).push(listener);
    }
  };
  sandbox.window = {
    postMessage: (payload) => pagePosts.push(payload),
    addEventListener: (name, listener) => { windowListeners.set(name, listener); },
    location: sandbox.location
  };
  sandbox.document = {
    addEventListener: (name, listener) => { documentListeners.set(name, listener); },
    documentElement: { dataset },
    getElementById: (id) => (id === "textchat-input" && chatBox ? chatBox.wrap : null)
  };
  return {
    sandbox,
    gmStore,
    pagePosts,
    dataset,
    tick: () => intervals.forEach((interval) => interval.fn()),
    runTimeouts: () => { timeouts.splice(0).forEach((timeout) => timeout.fn()); },
    postToWindow: (data, origin) => {
      const listener = windowListeners.get("message");
      if (listener) {
        listener({ origin: origin ?? sandbox.location.origin, data });
      }
    },
    poke: (eventName) => {
      const listener = documentListeners.get(eventName);
      if (listener) {
        listener();
      }
    }
  };
}

function makeChatBox() {
  const textarea = { value: "" };
  const clicks = [];
  const button = { click: () => clicks.push(textarea.value) };
  const wrap = {
    querySelector: (selector) => (selector === "textarea" ? textarea : button)
  };
  return { wrap, textarea, clicks };
}

async function testUserscript() {
  console.log("— userscript transports —");
  const source = await readFile(path.join(__dirname, "..", "roll20", "angel-sword-roll20-bridge.user.js"), "utf8");

  /* Builder personality */
  {
    const harness = createUserscriptSandbox({ host: "localhost:4173", chatBox: null });
    vm.runInNewContext(source, harness.sandbox);
    check("builder side announces status at load",
      harness.pagePosts.some((post) => isValidBridgeMessage(post, DIALECTS.asb) && post.type === "status" && post.roll20 === false));

    harness.pagePosts.length = 0;
    harness.postToWindow(samplePing(DIALECTS.asb));
    check("ping is answered with a status", harness.pagePosts.length === 1 && harness.pagePosts[0].type === "status");

    harness.pagePosts.length = 0;
    harness.postToWindow(sampleSend(DIALECTS.asb, { id: "no-tab-1" }));
    check("send without a Roll20 tab acks ok:false",
      harness.pagePosts.length === 1 && harness.pagePosts[0].type === "ack"
      && harness.pagePosts[0].ok === false && /No Roll20 game tab/.test(harness.pagePosts[0].error));

    harness.sandbox.GM_setValue(STORAGE_KEYS.alive, { ts: Date.now(), tab: "r20tab" });
    harness.pagePosts.length = 0;
    harness.postToWindow(sampleSend(DIALECTS.asb, { id: "fwd-1" }));
    const forwarded = harness.gmStore.get(STORAGE_KEYS.send);
    check("send with a live tab forwards to storage", forwarded && forwarded.id === "fwd-1" && typeof forwarded.macro === "string");

    // duplicate delivery of the same id via the DOM mailbox must not re-forward
    harness.gmStore.delete(STORAGE_KEYS.send);
    harness.dataset[DIALECTS.asb.mailboxKey] = JSON.stringify(sampleSend(DIALECTS.asb, { id: "fwd-1" }));
    harness.poke(DIALECTS.asb.pokeEvent);
    check("duplicate send id is not forwarded twice", !harness.gmStore.has(STORAGE_KEYS.send));

    // a NEW id via the DOM mailbox works (transport 2 fully functional)
    harness.dataset[DIALECTS.asb.mailboxKey] = JSON.stringify(sampleSend(DIALECTS.asb, { id: "fwd-2" }));
    harness.poke(DIALECTS.asb.pokeEvent);
    const forwarded2 = harness.gmStore.get(STORAGE_KEYS.send);
    check("DOM-mailbox transport forwards new sends", forwarded2 && forwarded2.id === "fwd-2");

    // wrong-origin postMessage is ignored
    harness.gmStore.delete(STORAGE_KEYS.send);
    harness.postToWindow(sampleSend(DIALECTS.asb, { id: "fwd-3" }), "https://evil.example");
    check("cross-origin messages are ignored", !harness.gmStore.has(STORAGE_KEYS.send));

    // ack relay back to the page
    harness.pagePosts.length = 0;
    harness.sandbox.GM_setValue(STORAGE_KEYS.ack, { id: "fwd-2", ok: true, ts: Date.now() });
    check("storage ack is relayed to the page",
      harness.pagePosts.some((post) => post.type === "ack" && post.id === "fwd-2" && post.ok === true));

    // oversized macro is dropped
    harness.gmStore.delete(STORAGE_KEYS.send);
    harness.postToWindow(sampleSend(DIALECTS.asb, { id: "fwd-4", macro: "x".repeat(LIMITS.MAX_MACRO_LENGTH + 1) }));
    check("oversized macro is dropped by the builder side", !harness.gmStore.has(STORAGE_KEYS.send));
  }

  /* Roll20 personality */
  {
    const chatBox = makeChatBox();
    const harness = createUserscriptSandbox({ host: "app.roll20.net", chatBox });
    vm.runInNewContext(source, harness.sandbox);
    const heartbeat = harness.gmStore.get(STORAGE_KEYS.alive);
    check("Roll20 side heartbeats while chat exists", heartbeat && typeof heartbeat.ts === "number" && typeof heartbeat.tab === "string");

    harness.sandbox.GM_setValue(STORAGE_KEYS.send, { id: "inj-1", macro: "&{template:default} {{name=Injected}}", ts: Date.now() });
    check("forwarded macro is injected into chat", chatBox.clicks.length === 1 && chatBox.clicks[0].includes("Injected"));
    const ack = harness.gmStore.get(STORAGE_KEYS.ack);
    check("successful injection acks ok:true", ack && ack.id === "inj-1" && ack.ok === true);

    harness.tick(); // polling must not re-run the same message id
    check("polling does not double-inject the same send", chatBox.clicks.length === 1);
  }
  {
    // Another Roll20 tab owns the fresher heartbeat → this tab must not inject
    const chatBox = makeChatBox();
    const harness = createUserscriptSandbox({ host: "app.roll20.net", chatBox });
    vm.runInNewContext(source, harness.sandbox);
    harness.sandbox.GM_setValue(STORAGE_KEYS.alive, { ts: Date.now() + 60000, tab: "other-tab" });
    harness.gmStore.delete(STORAGE_KEYS.ack);
    harness.sandbox.GM_setValue(STORAGE_KEYS.send, { id: "inj-2", macro: "&{template:default} {{name=Elsewhere}}", ts: Date.now() });
    check("non-designated tab leaves sends alone", chatBox.clicks.length === 0 && !harness.gmStore.has(STORAGE_KEYS.ack));
  }
  {
    // Chat box missing → ack ok:false, no crash
    const harness = createUserscriptSandbox({ host: "app.roll20.net", chatBox: null });
    vm.runInNewContext(source, harness.sandbox);
    harness.sandbox.GM_setValue(STORAGE_KEYS.send, { id: "inj-3", macro: "&{template:default} {{name=Nowhere}}", ts: Date.now() });
    const ack = harness.gmStore.get(STORAGE_KEYS.ack);
    check("missing chat box acks ok:false", ack && ack.id === "inj-3" && ack.ok === false && /chat box/.test(ack.error));
  }

  /* v0.2 — selected-token query path */
  {
    // Builder side relays queries and query replies
    const harness = createUserscriptSandbox({ host: "localhost:4173", chatBox: null });
    vm.runInNewContext(source, harness.sandbox);
    harness.pagePosts.length = 0;
    harness.postToWindow({ source: DIALECTS.asb.pageTag, type: "getSelected", id: "q-no-tab" });
    check("query without a Roll20 tab answers ok:false",
      harness.pagePosts.some((post) => post.type === "selected" && post.id === "q-no-tab" && post.ok === false));

    harness.sandbox.GM_setValue("asb20_alive", { ts: Date.now(), tab: "r20tab" });
    harness.pagePosts.length = 0;
    harness.postToWindow({ source: DIALECTS.asb.pageTag, type: "getSelected", id: "q-1" });
    const storedQuery = harness.gmStore.get("asb20_query");
    check("query with a live tab is forwarded to storage", storedQuery && storedQuery.id === "q-1" && storedQuery.type === "selected");
    harness.postToWindow({ source: DIALECTS.asb.pageTag, type: "getSelected", id: "q-1" });
    check("duplicate query id is not re-forwarded", harness.gmStore.get("asb20_query").id === "q-1");

    harness.pagePosts.length = 0;
    harness.sandbox.GM_setValue("asb20_query_ack", { id: "q-1", ok: true, tokenId: "-tokA", name: "Hero", ts: Date.now() });
    check("query reply is relayed to the page",
      harness.pagePosts.some((post) => post.type === "selected" && post.id === "q-1" && post.ok === true && post.tokenId === "-tokA"));
  }
  {
    // Roll20 side resolves the selection through unsafeWindow's page objects
    const chatBox = makeChatBox();
    const fakeD20 = {
      engine: { selected: () => [{ model: { id: "-selTok", get: (key) => (key === "name" ? "Pinned Hero" : "") } }] }
    };
    const harness = createUserscriptSandbox({ host: "app.roll20.net", chatBox, unsafeWindow: { d20: fakeD20 } });
    vm.runInNewContext(source, harness.sandbox);
    harness.sandbox.GM_setValue(STORAGE_KEYS.send, { id: "warm", macro: "&{template:default} {{name=W}}", ts: Date.now() });
    harness.sandbox.GM_setValue("asb20_query", { id: "q-2", type: "selected", ts: Date.now() });
    const reply = harness.gmStore.get("asb20_query_ack");
    check("Roll20 side answers the token query from the page selection",
      reply && reply.id === "q-2" && reply.ok === true && reply.tokenId === "-selTok" && reply.name === "Pinned Hero");
  }
  {
    // Initiative send with a pinned token: macro still injects + acks, and the
    // unreachable turn tracker (no page exec in the vm) degrades to a log-only
    // skip rather than an error.
    const chatBox = makeChatBox();
    const harness = createUserscriptSandbox({ host: "app.roll20.net", chatBox });
    vm.runInNewContext(source, harness.sandbox);
    harness.sandbox.GM_setValue(STORAGE_KEYS.send, {
      id: "init-1", macro: "&{template:default} {{name=Init}}", kind: "initiative", pr: 17, tokenId: "-tok1", ts: Date.now()
    });
    const ack = harness.gmStore.get(STORAGE_KEYS.ack);
    check("initiative send still injects and acks", chatBox.clicks.length === 1 && ack && ack.id === "init-1" && ack.ok === true);
  }
}

async function main() {
  await testSpecDrift();
  await testManager();
  await testUserscript();
  if (failures > 0) {
    console.error(`\n[ROLL20 BRIDGE TEST FAILURE] ${failures} of ${checks} checks failed.`);
    process.exit(1);
  }
  console.log(`\n[ROLL20 BRIDGE TEST SUCCESS] All ${checks} checks passed.`);
}

main().catch((error) => {
  console.error("[ROLL20 BRIDGE TEST ERROR]", error);
  process.exit(1);
});
