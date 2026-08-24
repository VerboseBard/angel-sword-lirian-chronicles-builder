import {
  PLAYER_BINDING_KEY,
  RELAY_CHANNEL,
  ROLL_CHANNEL,
  ROOM_LOG_KEY,
  mergeRollLog,
  normalizeRollEvent
} from "./core.js";
import { loadOwlbearSdk } from "./sdk.js";

const handledIds = new Set();

function remember(id) {
  if (!id) {
    return false;
  }
  if (handledIds.has(id)) {
    return false;
  }
  handledIds.add(id);
  if (handledIds.size > 200) {
    handledIds.delete(handledIds.values().next().value);
  }
  return true;
}

async function persistRoomRoll(OBR, event) {
  const metadata = await OBR.room.getMetadata();
  const next = mergeRollLog(metadata?.[ROOM_LOG_KEY], event);
  await OBR.room.setMetadata({ [ROOM_LOG_KEY]: next });
}

async function start() {
  const OBR = await loadOwlbearSdk();
  if (!OBR) {
    return;
  }
  OBR.onReady(async () => {
    const localChannel = typeof BroadcastChannel === "function"
      ? new BroadcastChannel(RELAY_CHANNEL)
      : null;
    const [playerName, playerMetadata] = await Promise.all([
      OBR.player.getName(),
      OBR.player.getMetadata()
    ]);
    const playerId = OBR.player.id || await OBR.player.getId();
    let playerBinding = playerMetadata?.[PLAYER_BINDING_KEY] || null;
    OBR.player.onChange((player) => {
      playerBinding = player.metadata?.[PLAYER_BINDING_KEY] || null;
    });

    const DEV_RELAY = /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
    let relayCursor = null;

    async function processSheetEvent(data) {
      if (data?.relaySource === "owlbear-room") {
        return;
      }
      const event = normalizeRollEvent(data, {
        characterId: playerBinding?.characterId,
        character: playerBinding?.characterName,
        playerId,
        playerName
      });
      if (!event || !remember(event.id)) {
        return;
      }
      try {
        await OBR.broadcast.sendMessage(ROLL_CHANNEL, event, { destination: "ALL" });
        await persistRoomRoll(OBR, event);
      } catch (error) {
        // A room closing must never interrupt the character sheet's own roll.
      }
    }

    async function pollDevRelayOnce() {
      try {
        const query = relayCursor
          ? `?boot=${encodeURIComponent(relayCursor.boot)}&since=${relayCursor.seq}`
          : "";
        const response = await fetch(`/api/vtt-relay/events${query}`);
        const data = await response.json();
        if (!data?.ok) {
          return;
        }
        const baseline = !relayCursor;
        relayCursor = { boot: data.boot, seq: data.seq };
        if (baseline) {
          return;
        }
        for (const eventData of data.events || []) {
          await processSheetEvent(eventData);
        }
      } catch (error) {
        // The dev server may be restarting; retry on the next tick.
      }
    }

    function postRoomEventToDevRelay(event) {
      if (!DEV_RELAY) {
        return;
      }
      try {
        fetch("/api/vtt-relay/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...event, relaySource: "owlbear-room" }),
          keepalive: true
        }).catch(() => {});
      } catch (error) {
        // Best-effort mirror back to the sheet tab.
      }
    }

    localChannel?.addEventListener("message", (messageEvent) => {
      processSheetEvent(messageEvent.data);
    });
    if (DEV_RELAY) {
      setInterval(pollDevRelayOnce, 1500);
    }

    OBR.broadcast.onMessage(ROLL_CHANNEL, (broadcastEvent) => {
      const event = normalizeRollEvent(broadcastEvent.data);
      if (!event || !remember(event.id)) {
        return;
      }
      localChannel?.postMessage({ ...event, relaySource: "owlbear-room" });
      postRoomEventToDevRelay(event);
    });
  });
}

start();
