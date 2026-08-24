import OBR from "@owlbear-rodeo/sdk";

const OVERLAY_ID = "com.angelssword.lyrian-chronicles/dice-overlay";
let finished = false;
let obrReady = false;

function readPayload() {
  try {
    return JSON.parse(decodeURIComponent(window.location.hash.slice(1)));
  } catch (error) {
    return null;
  }
}

function finish() {
  if (finished) {
    return;
  }
  finished = true;
  if (obrReady) {
    try {
      OBR.popover.close(OVERLAY_ID);
    } catch (error) {
      /* the popover may already be closing */
    }
  }
}

const DICE_VISIBLE_MS = 5500;
const BANNER_LINGER_MS = 3500;

function showBanner(payload) {
  const banner = document.getElementById("roll-banner");
  if (!banner) {
    return;
  }
  document.getElementById("banner-who").textContent = payload.who || "";
  document.getElementById("banner-label").textContent = payload.label || "Roll";
  document.getElementById("banner-total").textContent = Number.isFinite(Number(payload.total)) ? `Total ${payload.total}` : "";
  document.getElementById("banner-breakdown").textContent = payload.breakdown || "";
  banner.classList.add("is-visible");
}

async function shrinkToBannerStrip() {
  document.querySelectorAll(".accurate-dice-canvas").forEach((canvas) => canvas.remove());
  if (obrReady) {
    try {
      await OBR.popover.setHeight(OVERLAY_ID, 150);
    } catch (error) {
      /* the popover may already be closing */
    }
  }
}

function startAnimation() {
  const payload = readPayload();
  if (!payload?.results?.length || !window.LyrianAccurateDiceRoller) {
    finish();
    return;
  }
  try {
    window.LyrianAccurateDiceRoller.rollDice({
      layer: document.getElementById("dice-flight-layer"),
      results: payload.results,
      setId: payload.setId,
      width: window.innerWidth,
      height: window.innerHeight
    });
  } catch (error) {
    finish();
    return;
  }
  showBanner(payload);
  setTimeout(shrinkToBannerStrip, DICE_VISIBLE_MS);
  setTimeout(() => {
    document.getElementById("roll-banner")?.classList.remove("is-visible");
  }, DICE_VISIBLE_MS + BANNER_LINGER_MS);
  setTimeout(finish, DICE_VISIBLE_MS + BANNER_LINGER_MS + 600);
}

window.addEventListener("asd-dice-runtime-ready", startAnimation);
window.addEventListener("asd-dice-runtime-error", finish);

if (OBR?.onReady) {
  OBR.onReady(() => {
    obrReady = true;
    setTimeout(finish, 12000);
  });
}
