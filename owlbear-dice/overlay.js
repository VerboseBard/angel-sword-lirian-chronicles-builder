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
  setTimeout(finish, 6000);
}

window.addEventListener("asd-dice-runtime-ready", startAnimation);
window.addEventListener("asd-dice-runtime-error", finish);

if (OBR?.onReady) {
  OBR.onReady(() => {
    obrReady = true;
    setTimeout(finish, 10000);
  });
}
