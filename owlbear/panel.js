/* ═══════════════════════════════════════════════════════════════════════════
   Angel Sword — Owlbear Rodeo extension panel (v0.1.0, EXPERIMENTAL SCAFFOLD).

   How the link works, with zero servers:
   1. The Angel Sword sheet publishes every roll on a same-origin
      BroadcastChannel ("asb-vtt-events" — see src/js/vtt-relay.js).
   2. This panel is served from the SAME origin, so when Owlbear Rodeo loads
      it inside a room, the channel connects the sheet tab to the room iframe
      in this browser automatically.
   3. When the Owlbear SDK is available, each local roll is re-broadcast to
      the other players in the room (OBR.broadcast), and their panels append
      the incoming rolls — that is the "back and forth".

   The SDK import is attempted from a CDN because this repository ships as a
   static site with no bundling of third-party packages. If the import fails
   (offline, CSP, or standalone open), the panel still works as a local roll
   feed and says "Standalone".

   UNTESTED IN A REAL ROOM — see BETA_2.20_VTT_INTEGRATION_PLAN.md for the
   verification checklist before this is announced anywhere.
   ═══════════════════════════════════════════════════════════════════════════ */

const RELAY_CHANNEL = "asb-vtt-events";
const OBR_CHANNEL = "com.angelssword.builder/rolls";
const SDK_URLS = [
  "https://esm.sh/@owlbear-rodeo/sdk@3",
  "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3/+esm"
];
const MAX_FEED_ITEMS = 60;

const feed = document.getElementById("feed");
const empty = document.getElementById("empty");
const statusChip = document.getElementById("status");

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function describe(event) {
  const parts = [];
  if (event.character) {
    parts.push(`<span class="who">${esc(event.character)}</span>`);
  }
  parts.push(`<div><strong>${esc(event.label || event.kind || "Roll")}</strong>`
    + (event.weapon ? ` — ${esc(event.weapon)}` : "") + "</div>");
  if (event.breakdown) {
    parts.push(`<div>${esc(event.breakdown)}</div>`);
  }
  if (event.total !== undefined) {
    parts.push(`<div class="total">Total ${esc(event.total)}</div>`);
  }
  return parts.join("");
}

function append(event, isRemote) {
  if (!event || typeof event !== "object") {
    return;
  }
  empty.hidden = true;
  feed.hidden = false;
  const item = document.createElement("li");
  if (isRemote) {
    item.classList.add("remote");
  }
  item.innerHTML = describe(event);
  feed.prepend(item);
  while (feed.children.length > MAX_FEED_ITEMS) {
    feed.lastElementChild.remove();
  }
}

/* ── Local link to the sheet (same origin, same browser) ─────────────── */
let obrApi = null;
if (typeof BroadcastChannel === "function") {
  const channel = new BroadcastChannel(RELAY_CHANNEL);
  channel.addEventListener("message", (messageEvent) => {
    const rollEvent = messageEvent.data;
    append(rollEvent, false);
    if (obrApi) {
      try {
        obrApi.broadcast.sendMessage(OBR_CHANNEL, rollEvent);
      } catch (error) {
        /* room may have closed; the local feed keeps working */
      }
    }
  });
} else {
  empty.textContent = "This browser does not support BroadcastChannel; the live sheet link is unavailable here.";
}

/* ── Room link through the Owlbear SDK (only inside an OBR room) ─────── */
async function connectOwlbear() {
  for (const url of SDK_URLS) {
    try {
      const module = await import(/* @vite-ignore */ url);
      const OBR = module.default || module.OBR || module;
      if (!OBR || !OBR.onReady) {
        continue;
      }
      OBR.onReady(() => {
        obrApi = OBR;
        statusChip.textContent = "Room connected";
        statusChip.classList.add("is-live");
        OBR.broadcast.onMessage(OBR_CHANNEL, (broadcastEvent) => {
          append(broadcastEvent.data, true);
        });
      });
      return;
    } catch (error) {
      /* try the next CDN, else stay standalone */
    }
  }
}

connectOwlbear();
