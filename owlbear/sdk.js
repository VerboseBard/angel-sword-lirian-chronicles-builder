import OBR from "@owlbear-rodeo/sdk";

export async function loadOwlbearSdk() {
  return OBR?.onReady ? OBR : null;
}
