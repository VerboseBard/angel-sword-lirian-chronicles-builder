const scriptPromises = new Map();

function loadScript(src) {
  if (scriptPromises.has(src)) {
    return scriptPromises.get(src);
  }

  const existing = Array.from(document.scripts).find((script) => script.getAttribute("src") === src);
  if (existing?.dataset.runtimeReady === "true") {
    return Promise.resolve();
  }

  const promise = new Promise((resolve, reject) => {
    const script = existing || document.createElement("script");
    script.addEventListener("load", () => {
      script.dataset.runtimeReady = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => {
      scriptPromises.delete(src);
      reject(new Error(`Could not load ${src}.`));
    }, { once: true });
    if (!existing) {
      script.src = src;
      script.async = false;
      document.head.appendChild(script);
    }
  });

  scriptPromises.set(src, promise);
  return promise;
}

async function loadScriptsInOrder(sources) {
  for (const src of sources) {
    await loadScript(src);
  }
}

let exportAssetsPromise = null;

export function ensureExportAssetsLoaded() {
  if (window.location.protocol !== "file:" || window.LYRIAN_EXPORT_ASSETS) {
    return Promise.resolve();
  }
  exportAssetsPromise ||= loadScript("assets/export-assets.js");
  return exportAssetsPromise;
}

let pdfRuntimePromise = null;

export function ensurePdfRuntimeLoaded({ includeExportAssets = false } = {}) {
  pdfRuntimePromise ||= window.PDFLib ? Promise.resolve() : loadScript("assets/pdf-lib.min.js");
  return Promise.all([
    pdfRuntimePromise,
    includeExportAssets ? ensureExportAssetsLoaded() : Promise.resolve()
  ]);
}

let spreadsheetRuntimePromise = null;

export function ensureSpreadsheetRuntimeLoaded({ includeExportAssets = false } = {}) {
  spreadsheetRuntimePromise ||= Promise.resolve().then(async () => {
    if (!window.XLSX) {
      await loadScript("assets/xlsx.full.min.js");
    }
    if (!window.JSZip) {
      await loadScript("assets/jszip.min.js");
    }
  });
  return Promise.all([
    spreadsheetRuntimePromise,
    includeExportAssets ? ensureExportAssetsLoaded() : Promise.resolve()
  ]);
}

let diceRuntimePromise = null;

export function isDiceRuntimeLoaded() {
  return Boolean(window.LyrianAccurateDiceRoller);
}

export function ensureDiceRuntimeLoaded() {
  if (isDiceRuntimeLoaded()) {
    return Promise.resolve();
  }
  if (!diceRuntimePromise) {
    window.LYRIAN_DISABLE_LEGACY_GLB_DICE = true;
    diceRuntimePromise = loadScriptsInOrder([
      "assets/vendor/three.min.js",
      "assets/vendor/GLTFLoader.js",
      "assets/dice-3d/dice-3d-embedded.js",
      "assets/dice-3d/new-angelsword-dice-face-art.384-webp.js?v=new-angelsword-384-webp-test-1",
      "assets/dice-3d/lyrian-accurate-dice.js?v=alpha4-new-angelsword-sidecar-27-d4-triangle-pivot"
    ]).catch((error) => {
      diceRuntimePromise = null;
      throw error;
    });
  }
  return diceRuntimePromise;
}
