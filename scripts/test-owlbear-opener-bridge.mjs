/* Opener-bridge unit tests (no browser needed), mirroring the manual-clock
   harness convention of test-roll20-bridge.mjs:
   1. Spec drift — the sheet side (src/js/vtt-relay.js) cannot import
      owlbear/core.js, so its repeated timing/kind literals are pinned here
      against the canonical exports.
   2. Bridge state machine with a manual clock: connect, hello/pong ->
      CONNECTED, staleness -> CONNECTING, popup closed -> CLOSED, source and
      origin rejection (each independently), handoff ack ok/failure, sheet
      roll routing, room-roll forwarding with re-tag, ghost-window reconnect.
   Run: npm run test:owlbear-bridge */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OPENER_BRIDGE_KIND, OPENER_BRIDGE_TIMING, OPENER_STATES
} from "../owlbear/core.js";
import { createOwlbearOpenerBridge, OPENER_POPUP_NAME } from "../owlbear/opener-bridge.js";

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

function createClock() {
  let now = 1000000;
  let seq = 1;
  const timers = new Map();
  return {
    now: () => now,
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
        timer.at = now + timer.every;
        timer.fn();
      }
      now = target;
    }
  };
}

const SHEET_ORIGIN = "http://localhost:4176";
const SHEET_URL = `${SHEET_ORIGIN}/`;

function createHarness(overrides = {}) {
  const clock = createClock();
  const posts = [];
  let handler = null;
  const fakePopup = {
    closed: false,
    focused: 0,
    postMessage(payload, origin) { posts.push({ payload, origin }); },
    focus() { this.focused += 1; }
  };
  const handoffs = [];
  const sheetRolls = [];
  const opened = [];
  const bridge = createOwlbearOpenerBridge({
    openWindow: (url, name) => { opened.push({ url, name }); return overrides.openResult !== undefined ? overrides.openResult : fakePopup; },
    subscribe: (fn) => { handler = fn; return () => { handler = null; }; },
    onVisible: () => () => {},
    now: clock.now,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    onHandoff: overrides.onHandoff || ((event) => { handoffs.push(event); return true; }),
    onSheetRoll: (event) => sheetRolls.push(event)
  });
  const deliver = (data, source = fakePopup, origin = SHEET_ORIGIN) =>
    handler && handler({ data, source, origin });
  return { bridge, clock, posts, fakePopup, handoffs, sheetRolls, opened, deliver };
}

async function testSpecDrift() {
  console.log("— spec drift (sheet-side literals vs core.js) —");
  const relaySource = await readFile(path.join(__dirname, "..", "src", "js", "vtt-relay.js"), "utf8");
  for (const [name, value] of Object.entries(OPENER_BRIDGE_KIND)) {
    check(`vtt-relay.js knows ${name} "${value}"`, relaySource.includes(`"${value}"`));
  }
  check("vtt-relay.js repeats ACK_TIMEOUT_MS",
    relaySource.includes(String(OPENER_BRIDGE_TIMING.ACK_TIMEOUT_MS)));
  check("vtt-relay.js repeats PONG_TIMEOUT_MS",
    relaySource.includes(String(OPENER_BRIDGE_TIMING.PONG_TIMEOUT_MS)));
  check("popup name is stable", OPENER_POPUP_NAME === "angel-sword-sheet-bridge");
}

async function testStateMachine() {
  console.log("— state machine —");
  {
    const { bridge } = createHarness();
    check("initial state is closed", bridge.getState() === OPENER_STATES.CLOSED);
  }
  {
    const { bridge, opened, posts, fakePopup } = createHarness();
    const ok = bridge.connect(SHEET_URL);
    check("connect returns true", ok === true);
    check("connect opens the fixed-name popup", opened.length === 1 && opened[0].name === OPENER_POPUP_NAME);
    check("connect state is connecting", bridge.getState() === OPENER_STATES.CONNECTING);
    check("connect sends an immediate ping", posts.some((entry) => entry.payload.kind === OPENER_BRIDGE_KIND.PING));
    check("sends target the derived origin", posts.every((entry) => entry.origin === SHEET_ORIGIN));
    check("connect focuses the sheet", fakePopup.focused === 1);
  }
  {
    const { bridge } = createHarness({ openResult: null });
    check("blocked popup returns false", bridge.connect(SHEET_URL) === false);
    check("blocked popup stays closed", bridge.getState() === OPENER_STATES.CLOSED);
  }
  {
    const { bridge, deliver, posts } = createHarness();
    bridge.connect(SHEET_URL);
    deliver({ kind: OPENER_BRIDGE_KIND.HELLO });
    check("hello promotes to connected", bridge.getState() === OPENER_STATES.CONNECTED);
    check("hello is answered with a ping",
      posts.filter((entry) => entry.payload.kind === OPENER_BRIDGE_KIND.PING).length >= 2);
  }
  {
    const { bridge, clock, deliver, posts } = createHarness();
    bridge.connect(SHEET_URL);
    deliver({ kind: OPENER_BRIDGE_KIND.PONG });
    check("pong promotes to connected", bridge.getState() === OPENER_STATES.CONNECTED);
    const pingsBefore = posts.filter((entry) => entry.payload.kind === OPENER_BRIDGE_KIND.PING).length;
    clock.advance(OPENER_BRIDGE_TIMING.PING_INTERVAL_MS * 3 + 10);
    const pingsAfter = posts.filter((entry) => entry.payload.kind === OPENER_BRIDGE_KIND.PING).length;
    check("ping interval keeps firing", pingsAfter >= pingsBefore + 3);
    check("still connected inside the pong window", bridge.getState() === OPENER_STATES.CONNECTED);
    clock.advance(OPENER_BRIDGE_TIMING.PONG_TIMEOUT_MS + 10);
    check("silence demotes to connecting", bridge.getState() === OPENER_STATES.CONNECTING);
    deliver({ kind: OPENER_BRIDGE_KIND.PONG });
    check("a late pong recovers to connected", bridge.getState() === OPENER_STATES.CONNECTED);
  }
  {
    const { bridge, deliver, fakePopup } = createHarness();
    bridge.connect(SHEET_URL);
    deliver({ kind: OPENER_BRIDGE_KIND.PONG });
    fakePopup.closed = true;
    check("closed popup reads as closed", bridge.getState() === OPENER_STATES.CLOSED);
  }
  {
    const { bridge, clock } = createHarness();
    bridge.connect(SHEET_URL);
    bridge.disconnect();
    check("disconnect clears timers", clock.timerCount() === 0);
    check("disconnect reads as closed", bridge.getState() === OPENER_STATES.CLOSED);
  }
}

async function testValidation() {
  console.log("— source/origin validation —");
  {
    const { bridge, deliver } = createHarness();
    bridge.connect(SHEET_URL);
    deliver({ kind: OPENER_BRIDGE_KIND.PONG }, { some: "other window" }, SHEET_ORIGIN);
    check("wrong source is ignored", bridge.getState() === OPENER_STATES.CONNECTING);
  }
  {
    const { bridge, deliver, fakePopup } = createHarness();
    bridge.connect(SHEET_URL);
    deliver({ kind: OPENER_BRIDGE_KIND.PONG }, fakePopup, "https://evil.example");
    check("wrong origin is ignored", bridge.getState() === OPENER_STATES.CONNECTING);
  }
  {
    const { bridge, deliver, handoffs } = createHarness();
    bridge.connect(SHEET_URL);
    deliver({ kind: "character-handoff", id: "h1", character: {} }, { some: "other" }, SHEET_ORIGIN);
    check("handoff from wrong source never reaches the callback", handoffs.length === 0);
  }
}

async function testHandoffAcks() {
  console.log("— handoff acks —");
  {
    const { bridge, deliver, posts, handoffs } = createHarness();
    bridge.connect(SHEET_URL);
    deliver({ kind: "character-handoff", id: "handoff-1", character: { name: "Jess" } });
    check("handoff reaches the callback", handoffs.length === 1 && handoffs[0].id === "handoff-1");
    const ack = posts.find((entry) => entry.payload.kind === OPENER_BRIDGE_KIND.ACK);
    check("handoff is acked", Boolean(ack));
    check("ack correlates by inReplyTo", ack?.payload.inReplyTo === "handoff-1");
    check("ack reports ok", ack?.payload.ok === true);
  }
  {
    const { bridge, deliver, posts } = createHarness({
      onHandoff: () => { throw new Error("bad character"); }
    });
    bridge.connect(SHEET_URL);
    deliver({ kind: "character-handoff", id: "handoff-2", character: {} });
    const ack = posts.find((entry) => entry.payload.kind === OPENER_BRIDGE_KIND.ACK);
    check("failed handoff still acks", Boolean(ack));
    check("failed handoff acks ok=false", ack?.payload.ok === false);
    check("failed handoff carries the error", ack?.payload.error === "bad character");
  }
  {
    const { bridge, deliver, posts } = createHarness({ onHandoff: (event) => event.id !== "handoff-3" });
    bridge.connect(SHEET_URL);
    deliver({ kind: "character-handoff", id: "handoff-3", character: {} });
    const ack = posts.find((entry) => entry.payload.kind === OPENER_BRIDGE_KIND.ACK);
    check("explicit false return acks ok=false", ack?.payload.ok === false);
  }
}

async function testRollRouting() {
  console.log("— roll routing —");
  {
    const { bridge, deliver, sheetRolls } = createHarness();
    bridge.connect(SHEET_URL);
    deliver({ kind: "dice", id: "r1", relaySource: "angel-sword-sheet", total: 17 });
    check("sheet roll reaches the callback", sheetRolls.length === 1 && sheetRolls[0].id === "r1");
    deliver({ kind: "dice", id: "r2", relaySource: "owlbear-room", total: 4 });
    check("non-sheet events are not routed as sheet rolls", sheetRolls.length === 1);
  }
  {
    const { bridge, deliver, posts } = createHarness();
    bridge.connect(SHEET_URL);
    check("forward before connect is refused",
      bridge.sendRoomRollToSheet({ kind: "dice", id: "r3", total: 9 }) === false);
    deliver({ kind: OPENER_BRIDGE_KIND.PONG });
    check("forward after connect succeeds",
      bridge.sendRoomRollToSheet({ kind: "dice", id: "r4", total: 9, relaySource: "angel-sword-sheet" }) === true);
    const forwarded = posts.find((entry) => entry.payload.id === "r4");
    check("forwarded rolls are re-tagged owlbear-room", forwarded?.payload.relaySource === "owlbear-room");
  }
}

async function testReconnect() {
  console.log("— reconnect —");
  {
    const posts = [];
    const clock = createClock();
    let handler = null;
    const realSheet = {
      closed: false,
      location: { href: `${SHEET_ORIGIN}/` },
      postMessage(payload, origin) { posts.push({ payload, origin }); },
      focus() {}
    };
    const bridge = createOwlbearOpenerBridge({
      openWindow: (url) => (url === "" ? realSheet : null),
      subscribe: (fn) => { handler = fn; return () => { handler = null; }; },
      onVisible: () => () => {},
      now: clock.now,
      setInterval: clock.setInterval,
      clearInterval: clock.clearInterval
    });
    check("reconnect re-acquires a live sheet", bridge.reconnect(SHEET_URL) === true);
    check("reconnect state is connecting", bridge.getState() === OPENER_STATES.CONNECTING);
    handler({ data: { kind: OPENER_BRIDGE_KIND.HELLO }, source: realSheet, origin: SHEET_ORIGIN });
    check("re-acquired sheet can connect", bridge.getState() === OPENER_STATES.CONNECTED);
  }
  {
    let ghostClosed = 0;
    const ghost = {
      closed: false,
      location: { href: "about:blank" },
      close() { ghostClosed += 1; },
      postMessage() {},
      focus() {}
    };
    const clock = createClock();
    const bridge = createOwlbearOpenerBridge({
      openWindow: () => ghost,
      subscribe: () => () => {},
      onVisible: () => () => {},
      now: clock.now,
      setInterval: clock.setInterval,
      clearInterval: clock.clearInterval
    });
    check("ghost blank window is refused", bridge.reconnect(SHEET_URL) === false);
    check("ghost blank window is closed", ghostClosed === 1);
    check("ghost reconnect stays closed", bridge.getState() === OPENER_STATES.CLOSED);
  }
}

async function main() {
  await testSpecDrift();
  await testStateMachine();
  await testValidation();
  await testHandoffAcks();
  await testRollRouting();
  await testReconnect();
  console.log(failures ? `\n${failures} of ${checks} checks FAILED` : `\nAll ${checks} opener-bridge checks passed.`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
