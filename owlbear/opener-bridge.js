/* Opener bridge — the Companion panel's side of the sheet popup transport.
   The panel opens the character sheet with window.open() and owns the only
   realm that can hold that Window handle, so this module lives with panel.js
   (background.js structurally cannot participate; owlbear-dice never needs
   to). Mirrors roll20-bridge.js's injectable-environment factory shape so
   scripts/test-owlbear-opener-bridge.mjs can drive it with a manual clock.

   Wire protocol (all messages reuse the vtt-relay envelope
   {v, id, ts, kind, relaySource, ...}):
     sheet -> panel  bridge-hello   announce on load (popup has an opener)
     panel -> sheet  bridge-ping    heartbeat, panel is the sole timer owner
     sheet -> panel  bridge-pong    reply to ping
     panel -> sheet  bridge-ack     {inReplyTo, ok, error} for handoffs
     sheet -> panel  character-handoff / roll kinds (dice, check, ...)
     panel -> sheet  room rolls re-tagged relaySource:"owlbear-room"

   Validation is symmetric on both ends: event.source identity AND the
   origin derived from the URL the panel itself opened. Sends always target
   that derived origin, never "*". */

import { OPENER_BRIDGE_KIND, OPENER_BRIDGE_TIMING, OPENER_STATES } from "./core.js";

export const OPENER_POPUP_NAME = "angel-sword-sheet-bridge";
const STATE_WATCH_INTERVAL_MS = 2000;
const VTT_RELAY_VERSION = 1;

function defaultOpenWindow(url, name) {
  return window.open(url, name);
}

function defaultSubscribe(handler) {
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

function defaultOnVisible(handler) {
  const listener = () => {
    if (!document.hidden) {
      handler();
    }
  };
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

export function createOwlbearOpenerBridge(env = {}) {
  const openWindow = env.openWindow || defaultOpenWindow;
  const subscribe = env.subscribe || defaultSubscribe;
  const onVisible = env.onVisible || defaultOnVisible;
  const now = env.now || Date.now;
  const setIntervalFn = env.setInterval || ((fn, ms) => setInterval(fn, ms));
  const clearIntervalFn = env.clearInterval || ((id) => clearInterval(id));
  const onHandoff = env.onHandoff || null;
  const onSheetRoll = env.onSheetRoll || null;

  let popupRef = null;
  let popupOrigin = "";
  let lastHeardAt = 0;
  let lastState = OPENER_STATES.CLOSED;
  let unsubscribeMessages = null;
  let unsubscribeVisible = null;
  let pingTimer = null;
  let watchTimer = null;
  const stateListeners = new Set();

  function makeEnvelope(kind, extra = {}) {
    return {
      v: VTT_RELAY_VERSION,
      id: `bridge-${now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      ts: now(),
      kind,
      relaySource: "owlbear-companion",
      ...extra
    };
  }

  function popupClosed() {
    try {
      return !popupRef || popupRef.closed === true;
    } catch (error) {
      return true;
    }
  }

  function computeState() {
    if (popupClosed()) {
      return OPENER_STATES.CLOSED;
    }
    if (lastHeardAt > 0 && now() - lastHeardAt <= OPENER_BRIDGE_TIMING.PONG_TIMEOUT_MS) {
      return OPENER_STATES.CONNECTED;
    }
    return OPENER_STATES.CONNECTING;
  }

  function notifyState() {
    const state = computeState();
    if (state === lastState) {
      return;
    }
    lastState = state;
    stateListeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        /* a UI listener must never break the bridge */
      }
    });
  }

  function post(payload) {
    if (popupClosed() || !popupOrigin) {
      return false;
    }
    try {
      popupRef.postMessage(payload, popupOrigin);
      return true;
    } catch (error) {
      return false;
    }
  }

  function sendPing() {
    post(makeEnvelope(OPENER_BRIDGE_KIND.PING));
  }

  function ensureTimers() {
    if (!pingTimer) {
      pingTimer = setIntervalFn(sendPing, OPENER_BRIDGE_TIMING.PING_INTERVAL_MS);
    }
    if (!watchTimer) {
      watchTimer = setIntervalFn(notifyState, STATE_WATCH_INTERVAL_MS);
    }
    if (!unsubscribeMessages) {
      unsubscribeMessages = subscribe(handleMessage);
    }
    if (!unsubscribeVisible) {
      unsubscribeVisible = onVisible(() => {
        sendPing();
        notifyState();
      });
    }
  }

  function handleMessage(messageEvent) {
    const event = messageEvent?.data;
    if (!event || typeof event !== "object" || !event.kind) {
      return;
    }
    try {
      if (!popupRef || messageEvent.source !== popupRef) {
        return;
      }
    } catch (error) {
      return;
    }
    if (!popupOrigin || messageEvent.origin !== popupOrigin) {
      return;
    }
    if (event.kind === OPENER_BRIDGE_KIND.HELLO || event.kind === OPENER_BRIDGE_KIND.PONG) {
      lastHeardAt = now();
      if (event.kind === OPENER_BRIDGE_KIND.HELLO) {
        sendPing();
      }
      notifyState();
      return;
    }
    lastHeardAt = now();
    if (event.kind === "character-handoff") {
      let ok = false;
      let error = "";
      try {
        ok = onHandoff ? onHandoff(event) !== false : false;
      } catch (handoffError) {
        ok = false;
        error = String(handoffError?.message || "The character could not be imported.");
      }
      post(makeEnvelope(OPENER_BRIDGE_KIND.ACK, { inReplyTo: event.id, ok, error }));
      notifyState();
      return;
    }
    if (event.relaySource === "angel-sword-sheet") {
      try {
        onSheetRoll?.(event);
      } catch (rollError) {
        /* one bad event must not stop the bridge */
      }
    }
    notifyState();
  }

  function resolveOrigin(url) {
    try {
      return new URL(url, globalThis.location?.href).origin;
    } catch (error) {
      return "";
    }
  }

  function connect(url) {
    const target = openWindow(url, OPENER_POPUP_NAME);
    if (!target) {
      return false;
    }
    popupRef = target;
    popupOrigin = resolveOrigin(url);
    lastHeardAt = 0;
    ensureTimers();
    sendPing();
    notifyState();
    try {
      popupRef.focus();
    } catch (error) {
      /* focus is a courtesy */
    }
    return true;
  }

  /* Silent re-acquisition after the panel iframe reloads (room tab F5).
     window.open("", name) returns an existing window registered under the
     name WITHOUT navigating it. If no such window exists and the popup
     blocker is lenient, the browser opens a blank ghost window instead —
     the sheet and panel are same-origin, so detect about:blank and close
     it (script-opened windows are script-closable). */
  function reconnect(expectedUrl) {
    let target = null;
    try {
      target = openWindow("", OPENER_POPUP_NAME);
    } catch (error) {
      target = null;
    }
    if (!target) {
      return false;
    }
    try {
      if (target.location?.href === "about:blank") {
        target.close();
        return false;
      }
    } catch (error) {
      /* cross-origin read means it is a real page; keep it */
    }
    popupRef = target;
    popupOrigin = resolveOrigin(expectedUrl);
    lastHeardAt = 0;
    ensureTimers();
    sendPing();
    notifyState();
    return true;
  }

  function sendRoomRollToSheet(event) {
    if (computeState() !== OPENER_STATES.CONNECTED) {
      if (!popupClosed()) {
        sendPing();
      }
      return false;
    }
    return post({ ...event, relaySource: "owlbear-room" });
  }

  function focusSheet() {
    if (popupClosed()) {
      return false;
    }
    try {
      popupRef.focus();
      return true;
    } catch (error) {
      return false;
    }
  }

  function disconnect() {
    if (pingTimer) {
      clearIntervalFn(pingTimer);
      pingTimer = null;
    }
    if (watchTimer) {
      clearIntervalFn(watchTimer);
      watchTimer = null;
    }
    unsubscribeMessages?.();
    unsubscribeMessages = null;
    unsubscribeVisible?.();
    unsubscribeVisible = null;
    popupRef = null;
    popupOrigin = "";
    lastHeardAt = 0;
    notifyState();
  }

  return {
    connect,
    reconnect,
    sendRoomRollToSheet,
    focusSheet,
    disconnect,
    getState: computeState,
    onStateChange(listener) {
      if (typeof listener !== "function") {
        return () => {};
      }
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    }
  };
}
