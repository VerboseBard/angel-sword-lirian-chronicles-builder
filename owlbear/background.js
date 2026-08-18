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

    localChannel?.addEventListener("message", async (messageEvent) => {
      if (messageEvent.data?.relaySource === "owlbear-room") {
        return;
      }
      const event = normalizeRollEvent(messageEvent.data, {
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
    });

    OBR.broadcast.onMessage(ROLL_CHANNEL, (broadcastEvent) => {
      const event = normalizeRollEvent(broadcastEvent.data);
      if (!event || !remember(event.id)) {
        return;
      }
      localChannel?.postMessage({ ...event, relaySource: "owlbear-room" });
    });
  });
}

start();
