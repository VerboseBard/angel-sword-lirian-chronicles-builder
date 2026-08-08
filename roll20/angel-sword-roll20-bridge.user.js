// ==UserScript==
// @name         Angel Sword Roll20 Bridge
// @namespace    https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/
// @version      0.2.0
// @description  Optional bridge between the Angel Sword Lyrian Chronicles builder and Roll20: sends the sheet's chat macros into your open Roll20 game tab, reads your selected token for pinning, and can drop your rolled initiative into the turn tracker. Install once in Tampermonkey; keep a Roll20 game open and the sheet's VTT hub shows Connected. Stores nothing, contacts no servers, and can be removed at any time.
// @author       Angel Sword Lyrian Chronicles builder project (fan work)
// @match        https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/*
// @match        http://localhost/*
// @match        http://127.0.0.1/*
// @match        https://app.roll20.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @noframes
// @downloadURL  https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/roll20/angel-sword-roll20-bridge.user.js
// @updateURL    https://verbosebard.github.io/angel-sword-lirian-chronicles-builder/roll20/angel-sword-roll20-bridge.user.js
// ==/UserScript==

/* ═══════════════════════════════════════════════════════════════════════════
   Angel Sword Roll20 Bridge — clean-room implementation of the behavior in
   BETA_2.20_ROLL20_PROTOCOL_SPEC.md. One script, two personalities decided by
   location.host:

   • BUILDER side (github.io / localhost / 127.0.0.1): answers the sheet's
     `asb-battle` pings and forwards macro sends into userscript storage.
   • ROLL20 side (app.roll20.net): heartbeats while a game chat box exists and
     types forwarded macros into the chat input.

   The two sides communicate ONLY through the userscript manager's script-
   scoped storage (asb20_* keys). Nothing leaves the browser; no character
   data is stored; no credentials exist anywhere in this file.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var VERSION = "0.2.0";
  var PAGE_TAG = "asb-battle";
  var BRIDGE_TAG = "asb-companion";
  var POKE_EVENT = "asb-battle-poke";
  var MAILBOX_KEY = "asbBridgeMsg";

  var KEY_ALIVE = "asb20_alive";
  var KEY_SEND = "asb20_send";
  var KEY_ACK = "asb20_ack";
  var KEY_QUERY = "asb20_query";
  var KEY_QUERY_ACK = "asb20_query_ack";

  var HEARTBEAT_MS = 4000;
  var HEARTBEAT_STALE_MS = 90000;
  var STORAGE_POLL_MS = 600;
  var MAX_MACRO_LENGTH = 4000;
  var MAX_ID_LENGTH = 64;

  var log = function () {
    try {
      var args = ["[AS Roll20 Bridge " + VERSION + "]"];
      for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
      }
      console.info.apply(console, args);
    } catch (error) { /* consoles can be sealed; never break the bridge */ }
  };

  function validId(id) {
    return typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH;
  }

  function validMacro(macro) {
    return typeof macro === "string" && macro.trim().length > 0 && macro.length <= MAX_MACRO_LENGTH;
  }

  /* Timers from a Web Worker are exempt from hidden-tab throttling; fall back
     to page timers when workers are unavailable (or in tests). */
  function startTicker(ms, fn) {
    try {
      if (typeof Worker === "function" && typeof URL !== "undefined" && typeof Blob !== "undefined") {
        var worker = new Worker(URL.createObjectURL(
          new Blob(["setInterval(function () { postMessage(0); }, " + ms + ");"], { type: "text/javascript" })
        ));
        worker.onmessage = fn;
        return;
      }
    } catch (error) {
      log("worker ticker unavailable — using page timers");
    }
    setInterval(fn, ms);
  }

  /* Cross-tab mailbox: storage change events are unreliable under some
     userscript-manager modes, so every watched key is BOTH event-driven and
     polled, deduped by message id. */
  function watchValue(key, onNew) {
    var initial = GM_getValue(key, null);
    var seenId = initial && initial.id ? initial.id : null; // never replay history
    var check = function (message) {
      if (message && validId(message.id) && message.id !== seenId) {
        seenId = message.id;
        onNew(message);
      }
    };
    try {
      GM_addValueChangeListener(key, function (name, oldValue, newValue) {
        check(newValue);
      });
    } catch (error) { /* polling covers it */ }
    startTicker(STORAGE_POLL_MS, function () {
      check(GM_getValue(key, null));
    });
  }

  var isRoll20 = (typeof location !== "undefined" && location.host === "app.roll20.net")
    || (typeof window !== "undefined" && !!window.__asbBridgeForceRoll20);

  /* ═════════════════════════ ROLL20 SIDE ═════════════════════════ */
  if (isRoll20) {
    var TAB_ID = Math.random().toString(36).slice(2, 10);

    var chatParts = function () {
      var wrap = document.getElementById("textchat-input");
      if (!wrap) {
        return null;
      }
      var textarea = wrap.querySelector("textarea");
      var button = wrap.querySelector(".btn") || wrap.querySelector("button");
      return textarea && button ? { textarea: textarea, button: button } : null;
    };

    var inject = function (macro) {
      if (!validMacro(macro)) {
        return { ok: false, error: "The bridge received an invalid macro." };
      }
      var chat = chatParts();
      if (!chat) {
        return { ok: false, error: "Roll20 chat box not found — open a game first." };
      }
      var draft = chat.textarea.value;
      chat.textarea.value = macro;
      chat.button.click();
      setTimeout(function () {
        // sending clears the box; give any half-typed draft back
        if (draft && chat.textarea.value === "") {
          chat.textarea.value = draft;
        }
      }, 100);
      return { ok: true };
    };

    /* Run a snippet in the page's MAIN world (userscript worlds cannot see
       page globals like d20). The result comes back through a shared DOM
       dataset attribute; body must `return` something JSON-serializable. */
    var pageExec = function (body) {
      var rootElement = document.documentElement;
      delete rootElement.dataset.asbPageResult;
      try {
        var script = document.createElement("script");
        script.textContent = "document.documentElement.dataset.asbPageResult = JSON.stringify((function () {" + body + "})());";
        rootElement.appendChild(script);
        script.remove();
      } catch (error) {
        return null;
      }
      var raw = rootElement.dataset.asbPageResult;
      delete rootElement.dataset.asbPageResult;
      try {
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        return null;
      }
    };

    /* Which token is selected on the tabletop? Route 1: direct page access
       when the userscript manager grants it. Route 2: main-world execution.
       Resolves {ok:true,tokenId,name} | {ok:false,none:true} | null. */
    var SELECTED_BODY =
      "try {" +
      " if (!(window.d20 && d20.engine && typeof d20.engine.selected === 'function')) { return null; }" +
      " var selection = d20.engine.selected() || [];" +
      " for (var i = 0; i < selection.length; i++) {" +
      "   if (selection[i] && selection[i].model) {" +
      "     return { ok: true, tokenId: selection[i].model.id, name: (selection[i].model.get && selection[i].model.get('name')) || '' };" +
      "   }" +
      " }" +
      " return { ok: false, none: true };" +
      "} catch (error) { return null; }";

    var resolveSelected = function () {
      try {
        var pageWindow = (typeof unsafeWindow !== "undefined") ? unsafeWindow : null;
        if (pageWindow && pageWindow.d20 && pageWindow.d20.engine && typeof pageWindow.d20.engine.selected === "function") {
          var selection = pageWindow.d20.engine.selected() || [];
          for (var i = 0; i < selection.length; i++) {
            if (selection[i] && selection[i].model) {
              return { ok: true, tokenId: selection[i].model.id, name: (selection[i].model.get && selection[i].model.get("name")) || "" };
            }
          }
          return { ok: false, none: true };
        }
      } catch (error) { /* fall through to main-world execution */ }
      return pageExec(SELECTED_BODY);
    };

    /* Write the sheet-rolled initiative total into Roll20's turn order for a
       token (main-world only — chat commands cannot reach the tracker).
       Deduped by token id so re-rolling replaces the entry. */
    var addToTurnOrder = function (tokenId, turnValue) {
      var body =
        "try {" +
        " if (!(window.d20 && typeof d20.Campaign === 'function')) { return { skip: true }; }" +
        " var campaign = d20.Campaign();" +
        " if (!campaign || !campaign.attributes) { return { skip: true }; }" +
        " var raw = campaign.attributes.turnorder;" +
        " var order = (raw && raw !== '') ? JSON.parse(raw) : [];" +
        " var id = " + JSON.stringify(String(tokenId)) + ";" +
        " var value = " + JSON.stringify(turnValue) + ";" +
        " var updated = false;" +
        " for (var i = 0; i < order.length; i++) {" +
        "   if (order[i] && order[i].id === id) { order[i].pr = value; updated = true; break; }" +
        " }" +
        " if (!updated) { order.push({ id: id, pr: value, custom: '' }); }" +
        " campaign.save({ turnorder: JSON.stringify(order) });" +
        " return { ok: true, updated: updated };" +
        "} catch (error) { return { error: String((error && error.message) || error) }; }";
      return pageExec(body) || { skip: true };
    };

    var handleInitiativeSend = function (message) {
      var turnValue = Number(message.pr);
      if (!Number.isFinite(turnValue)) {
        return; // no rolled total supplied — macro already posted, nothing else to do
      }
      var withToken = function (tokenId) {
        if (!tokenId) {
          log("initiative: no pinned or selected token — posted the roll only");
          return;
        }
        var outcome = addToTurnOrder(String(tokenId), turnValue);
        if (outcome.ok) {
          log("initiative: turn order " + (outcome.updated ? "updated" : "added") + " @ " + turnValue);
        } else if (outcome.skip) {
          log("initiative: turn tracker unreachable — posted the roll only");
        } else {
          log("initiative: turn order write failed: " + (outcome.error || "unknown"));
        }
      };
      if (message.tokenId) {
        withToken(String(message.tokenId));
        return;
      }
      var selected = resolveSelected();
      withToken(selected && selected.ok ? selected.tokenId : "");
    };

    var chatSeen = false;
    var beat = function () {
      var found = !!chatParts();
      if (found !== chatSeen) {
        chatSeen = found;
        log(found ? "chat box found — heartbeating" : "chat box lost");
      }
      if (!found) {
        return;
      }
      try {
        GM_setValue(KEY_ALIVE, { ts: Date.now(), tab: TAB_ID });
      } catch (error) {
        log("heartbeat write failed — reload this tab");
      }
    };

    /* With several game tabs open, the freshest heartbeat owns injection. */
    var designated = function () {
      var heartbeat = GM_getValue(KEY_ALIVE, null);
      return !(heartbeat && heartbeat.tab && heartbeat.tab !== TAB_ID
        && (Date.now() - heartbeat.ts) < HEARTBEAT_STALE_MS);
    };

    startTicker(HEARTBEAT_MS, beat);
    try {
      document.addEventListener("visibilitychange", beat);
    } catch (error) { /* not fatal */ }
    beat();
    log("Roll20 side up (tab " + TAB_ID + ")");

    watchValue(KEY_SEND, function (message) {
      if (!validMacro(message.macro)) {
        return;
      }
      if (!designated()) {
        log("send " + message.id + " left to the designated tab");
        return;
      }
      var result = inject(String(message.macro));
      log("inject " + message.id + ":", result.ok ? "ok" : result.error);
      GM_setValue(KEY_ACK, { id: message.id, ok: result.ok, error: result.error, ts: Date.now() });
      if (result.ok && message.kind === "initiative") {
        handleInitiativeSend(message);
      }
    });

    watchValue(KEY_QUERY, function (query) {
      if (query.type !== "selected") {
        return;
      }
      if (!designated()) {
        return;
      }
      var selected = resolveSelected();
      var reply = selected && selected.ok
        ? { id: query.id, ok: true, tokenId: selected.tokenId, name: selected.name || "", ts: Date.now() }
        : {
            id: query.id,
            ok: false,
            error: selected && selected.none
              ? "Nothing selected — click your token on the Roll20 tabletop first."
              : "Could not read the Roll20 selection (page access unavailable).",
            ts: Date.now()
          };
      log("getSelected:", reply.ok ? reply.tokenId : reply.error);
      GM_setValue(KEY_QUERY_ACK, reply);
    });
    return;
  }

  /* ═════════════════════════ BUILDER SIDE ═════════════════════════ */
  var lastAliveLogged = null;
  var roll20Alive = function () {
    var heartbeat = GM_getValue(KEY_ALIVE, null);
    var ts = heartbeat && typeof heartbeat === "object" ? heartbeat.ts : 0;
    var alive = (Date.now() - ts) < HEARTBEAT_STALE_MS;
    if (alive !== lastAliveLogged) {
      lastAliveLogged = alive;
      log(alive ? "Roll20 link up" : "Roll20 link down");
    }
    return alive;
  };

  var postToPage = function (data) {
    var payload = { source: BRIDGE_TAG };
    for (var key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        payload[key] = data[key];
      }
    }
    window.postMessage(payload, "*");
  };

  var postStatus = function () {
    postToPage({ type: "status", roll20: roll20Alive() });
  };

  var lastForwardedId = null;
  var lastQueryId = null;
  var handlePageMessage = function (data) {
    if (!data || data.source !== PAGE_TAG || typeof data.type !== "string") {
      return;
    }
    if (data.type === "ping") {
      postStatus();
      return;
    }
    if (data.type === "send") {
      if (!validId(data.id) || !validMacro(data.macro)) {
        return;
      }
      if (data.id === lastForwardedId) {
        return; // both transports can deliver the same message
      }
      lastForwardedId = data.id;
      if (!roll20Alive()) {
        postToPage({ type: "ack", id: data.id, ok: false, error: "No Roll20 game tab open" });
        return;
      }
      var forward = { id: data.id, macro: String(data.macro), ts: Date.now() };
      ["kind", "bonus", "formula", "tokenId", "pr"].forEach(function (key) {
        if (data[key] !== undefined) {
          forward[key] = data[key];
        }
      });
      log("forwarding send " + data.id);
      GM_setValue(KEY_SEND, forward);
      return;
    }
    if (data.type === "getSelected") {
      if (!validId(data.id)) {
        return;
      }
      if (data.id === lastQueryId) {
        return; // both transports can deliver the same query
      }
      lastQueryId = data.id;
      if (!roll20Alive()) {
        postToPage({ type: "selected", id: data.id, ok: false, error: "No Roll20 game tab open" });
        return;
      }
      GM_setValue(KEY_QUERY, { id: data.id, type: "selected", ts: Date.now() });
    }
  };

  /* Transport 1: same-origin postMessage. No sender-identity check — page and
     userscript worlds may not share a WindowProxy identity. */
  window.addEventListener("message", function (event) {
    if (event.origin !== location.origin) {
      return;
    }
    handlePageMessage(event.data);
  });

  /* Transport 2: DOM-attribute mailbox + plain event (world-independent). */
  document.addEventListener(POKE_EVENT, function () {
    var data = null;
    try {
      data = JSON.parse(document.documentElement.dataset[MAILBOX_KEY] || "null");
    } catch (error) { /* ignore malformed mailbox content */ }
    handlePageMessage(data);
  });

  /* Relay Roll20-side acks and token-query replies back to the sheet. */
  watchValue(KEY_ACK, function (ack) {
    postToPage({ type: "ack", id: ack.id, ok: !!ack.ok, error: ack.error });
  });
  watchValue(KEY_QUERY_ACK, function (reply) {
    postToPage({ type: "selected", id: reply.id, ok: !!reply.ok, tokenId: reply.tokenId, name: reply.name, error: reply.error });
  });

  try {
    GM_addValueChangeListener(KEY_ALIVE, function () {
      postStatus();
    });
  } catch (error) { /* the sheet pings every 5s regardless */ }

  log("builder side up on " + location.host);
  postStatus();
})();
