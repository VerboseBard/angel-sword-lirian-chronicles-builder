/* Task 032 — dice display fixes (npm run test:032).

   Phase A, the shared dice engine (stage 1):
     a value-domain sweep in all four dice sets. Every d100 result 1-100, sent
     the way Owlbear sends it ({ sides: 100, value }), shows the right tens and
     ones faces (00 for 1-9, 00 + 0 for 100); a tens value of 0 shows "00";
     every die's settle report (topFace / matched) is the face the viewer sees.
   Phase B, the Owlbear extensions in a fake Owlbear room (stage 1):
     the real background, overlay and panel pages, bundled with only the
     Owlbear SDK swapped for an in-page stand-in that builds windows the way
     Owlbear does (a popover's paper takes clicks; a modal's root ignores the
     mouse only with disablePointerEvents).
     - L1: the overlay is a full-screen click-through modal. Clicks on
       Owlbear's toolbar, its top-right tools, a token, the board and next to
       the result chip reach the host page before, during and after a roll,
       while chips show and after the overlay closes. No popover is used.
     - the d100 payloads 1, 9, 10, 55, 99, 100 show the right faces.
     - L2: a rebuilt overlay replays only rolls from its own boot, never an
       older roll; a roll right after the overlay closes is not dropped.
     - L3: inside a room the Dice panel loads no 3D engine or dice art and
       Roll works as soon as the room connects; the standalone panel still
       loads the engine.
     - the panel and overlay carry the same engine version tokens.
     - task 032b safety net (B6): flip the fake host so it does NOT honour
       disablePointerEvents. The first real click then lands on the overlay,
       which closes itself, logs one line, and stays closed (no new overlay on
       later rolls) until the room reloads, while rolls still reach the Room
       Rolls log and the Dice panel. Each of pointerdown, mousedown,
       touchstart and wheel does the same; a click before the Owlbear SDK is
       ready closes the overlay as soon as it is ready; with the option
       honoured (every other check here) the net never fires.
   Phase A also holds task 032b's context-loss check: a lost WebGL context on
   the reused renderer makes the next roll build a new renderer and draw.
   Phase C, the builder's own dice tray (stage 2):
     d100 tray rolls 1, 9, 10, 55, 99, 100 show the right faces; no
     "top-face mismatch" console warning on d8/d10/d12/d20/d100 rolls; with
     no preview pictures (weak GPU) the overlay prints the rolled number.

   Env:
     T32_PORT          first port to try (default 4410; the server falls
                       forward if it is busy).
     T32_ROOT          serve another tree instead of this one, for example a
                       git-archive export of the live site (main 3346d32) with
                       the stage-1 extension files copied in.
     T32_LIVE_BUILDER=1  stage-1 proof: phase C checks that the LIVE builder's
                       tray still rolls with the new engine (no warning, right
                       number without previews) and records its old tens
                       label instead of requiring 00 (that fix is stage 2).
     T32_ONLY=A,B,B6,C run only some phases (B6 is the 032b safety net). */

import { fork } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { bundleTokenFor, readBundleToken } from "./bundle-token.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const servedRoot = process.env.T32_ROOT ? path.resolve(process.env.T32_ROOT) : repoRoot;
const startPort = Number(process.env.T32_PORT || 4410);
const liveBuilder = process.env.T32_LIVE_BUILDER === "1";
const only = new Set(String(process.env.T32_ONLY || "A,B,B6,C").split(",").map((entry) => entry.trim().toUpperCase()).filter(Boolean));

const SETS = ["new-angelsword", "asari-full-set-draft", "leaflit-full-set", "rana-full-set"];
const PERCENTILE_CASES = [1, 9, 10, 55, 99, 100];
const NEW_CORE_TOKEN = "?v=20261019-task032-dice";

let passed = 0;
let failed = 0;
const failures = [];
function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(label);
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
}
function note(label, detail) {
  console.log(`NOTE  ${label}${detail ? `  [${detail}]` : ""}`);
}
function section(name) {
  console.log(`\n— ${name} —`);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function expectedPercentile(result) {
  const tens = result === 100 || result < 10 ? "00" : String(Math.floor(result / 10) * 10);
  const ones = result % 10 === 0 ? "0" : String(result % 10);
  return `${tens}|${ones}`;
}
function expectedFace(sides, value) {
  if (sides === 10) {
    return value === 10 ? "0" : String(value);
  }
  return String(value);
}

async function startServer() {
  const server = fork(path.join(repoRoot, "scripts", "server.mjs"), [], {
    cwd: repoRoot,
    env: { ...process.env, LYRIAN_PORT: String(startPort), LYRIAN_NO_OPEN: "1", LYRIAN_PROJECT_ROOT: servedRoot },
    silent: true
  });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("The test server did not start.")), 15000);
    let started = false;
    let buffer = "";
    server.stdout.on("data", (chunk) => {
      if (started) {
        return; // keep draining the pipe; request lines are not needed
      }
      buffer += String(chunk);
      const match = /running at http:\/\/localhost:(\d+)\//.exec(buffer);
      if (match) {
        started = true;
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    server.stderr.on("data", () => {});
    server.once("exit", (code) => reject(new Error(`The test server exited with ${code}.`)));
  });
  return { server, port };
}

/* ── Phase A: the engine, all four sets ─────────────────────────────── */

function engineHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>t32 engine</title></head>
<body><div id="layer" style="position:fixed;inset:0;pointer-events:none"></div>
<script>
  window.LYRIAN_DISABLE_LEGACY_GLB_DICE = true;
  (function () {
    function load(src) {
      return new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = function () { reject(new Error("Failed to load " + src)); };
        document.head.appendChild(script);
      });
    }
    load("/assets/dice/promoted-dice-skins.registry.js").then(function () {
      var sidecars = (window.LYRIAN_PROMOTED_DICE_SKINS || []).map(function (pack) { return pack && pack.faceArtScript; })
        .filter(Boolean).map(function (src) { return "/" + src; });
      var list = ["/assets/vendor/three.min.js", "/assets/dice-3d/new-angelsword-dice-face-art.384-webp.js"]
        .concat(sidecars, ["/assets/dice-3d/dice-geometry.js", "/assets/dice-3d/character-sheet-skin-studio.js", "/assets/dice-3d/shared-dice-roller-core.js"]);
      return list.reduce(function (chain, src) { return chain.then(function () { return load(src); }); }, Promise.resolve());
    }).then(function () { window.__engineReady = true; }, function (error) { window.__engineError = String(error && error.message || error); });
  })();
</script></body></html>`;
}

async function phaseA(browser, base) {
  section("A. Shared dice engine: value-domain sweep, all four sets (stage 1)");
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await context.route((url) => url.pathname === "/__t32__/engine.html", (route) => route.fulfill({ status: 200, contentType: "text/html", body: engineHtml() }));
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${base}/__t32__/engine.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__engineReady || window.__engineError, undefined, { timeout: 60000 });
  const loadError = await page.evaluate(() => window.__engineError || "");
  check("the engine page loaded the shared core and all four sets", !loadError, loadError);

  const sweep = await page.evaluate(({ sets }) => {
    const core = window.LyrianAccurateDiceRoller;
    const layer = document.getElementById("layer");
    const rows = [];
    const roll = (setId, results) => {
      core.rollDice({ layer, results, setId, reducedMotion: true, width: 640, height: 480 });
      const settled = core.getStatus().settledResults || [];
      core.clear();
      return {
        dies: settled.map((entry) => entry.die).join("|"),
        labels: settled.map((entry) => entry.requested).join("|"),
        tops: settled.map((entry) => entry.topFace).join("|"),
        matched: settled.length > 0 && settled.every((entry) => entry.matched === true)
      };
    };
    for (const setId of sets) {
      for (let value = 1; value <= 100; value += 1) {
        rows.push({ setId, kind: "payload-d100", sides: 100, value, ...roll(setId, [{ sides: 100, value }]) });
      }
      for (const sides of [4, 6, 8, 10, 12, 20]) {
        for (let value = 1; value <= sides; value += 1) {
          rows.push({ setId, kind: "die", sides, value, ...roll(setId, [{ sides, value }]) });
        }
      }
      for (const value of [0, 100, 50, 90]) {
        rows.push({ setId, kind: "tens-d00", sides: 100, value, ...roll(setId, [{ sides: 100, value, label: "d00" }]) });
      }
    }
    // Negative control: the viewer-facing measurement must still notice a
    // die that is NOT showing its result to the viewer.
    const internals = core.__testInternals;
    const THREE = window.THREE;
    const toViewer = new THREE.Vector3(0, 6.9, 8.5).sub(new THREE.Vector3(0, -1.2, 0)).normalize();
    const die = internals.createDie(20, 17, internals.getTheme("new-angelsword"));
    const aimed = internals.finalQuaternionForDie(die, toViewer);
    const lying = internals.finalQuaternionForDie(die);
    return {
      rows,
      control: {
        aimedTowardViewer: internals.topFaceLabelForDie(die, aimed, toViewer).label,
        lyingFaceUpSeenFromViewer: internals.topFaceLabelForDie(die, lying, toViewer).label,
        lyingFaceUpMeasuredUp: internals.topFaceLabelForDie(die, lying).label
      },
      version: core.getStatus().version
    };
  }, { sets: SETS });

  const payload = sweep.rows.filter((row) => row.kind === "payload-d100");
  const payloadBad = payload.filter((row) => row.labels !== expectedPercentile(row.value) || row.dies !== "d00|d10");
  check(`Owlbear-style d100 payloads 1-100 show the right tens and ones faces (${payload.length - payloadBad.length}/${payload.length}, 4 sets)`,
    payload.length === 400 && payloadBad.length === 0,
    payloadBad.slice(0, 6).map((row) => `${row.setId} ${row.value}: ${row.labels}`).join("; "));
  for (const value of PERCENTILE_CASES) {
    const rows = payload.filter((row) => row.value === value);
    check(`d100 result ${value} shows ${expectedPercentile(value).replace("|", " + ")} in every set`,
      rows.length === 4 && rows.every((row) => row.labels === expectedPercentile(value)),
      rows.map((row) => `${row.setId}: ${row.labels.replace("|", " + ")}`).join("; "));
  }
  const dice = sweep.rows.filter((row) => row.kind === "die");
  const diceBad = dice.filter((row) => row.labels !== expectedFace(row.sides, row.value));
  check(`d4-d20 results map to their own faces (${dice.length - diceBad.length}/${dice.length})`, dice.length === 240 && diceBad.length === 0,
    diceBad.slice(0, 6).map((row) => `${row.setId} d${row.sides}=${row.value}: ${row.labels}`).join("; "));
  const tens = sweep.rows.filter((row) => row.kind === "tens-d00");
  const tensExpected = { 0: "00", 100: "00", 50: "50", 90: "90" };
  const tensBad = tens.filter((row) => row.labels !== tensExpected[row.value]);
  check("a d00 tens value of 0 shows 00 (no falsy-zero fallback to 10); 100 shows 00; 50 and 90 unchanged",
    tens.length === 16 && tensBad.length === 0, tensBad.slice(0, 6).map((row) => `${row.setId} ${row.value}: ${row.labels}`).join("; "));
  const all = sweep.rows;
  const unmatched = all.filter((row) => !row.matched || row.tops !== row.labels);
  const bySides = {};
  unmatched.forEach((row) => { bySides[`d${row.sides}`] = (bySides[`d${row.sides}`] || 0) + 1; });
  check(`every settle report says the viewer sees the rolled face (matched and topFace = result): ${all.length - unmatched.length}/${all.length}`,
    unmatched.length === 0, unmatched.length ? `${JSON.stringify(bySides)}; e.g. ${unmatched.slice(0, 3).map((row) => `${row.setId} d${row.sides}=${row.value} top ${row.tops} vs ${row.labels}`).join("; ")}` : "");
  check("negative control: the measurement still catches a die that does not face the viewer with its result",
    sweep.control.aimedTowardViewer === "17" && sweep.control.lyingFaceUpSeenFromViewer !== "17" && sweep.control.lyingFaceUpMeasuredUp === "17",
    JSON.stringify(sweep.control));
  check("ROLLER_VERSION was bumped for the core change", sweep.version && sweep.version !== "dice-lab-scripted-side-entry-27-rana-d4-reverted", sweep.version);
  check("engine page had no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await context.close();

  /* A2. L4: a reused (pooled) renderer draws exactly the same picture as a
     fresh one. Math.random is seeded so a roll lands the same way twice;
     the screenshot is taken in the 3 s hold after the dice settle. */
  const lookContext = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await lookContext.route((url) => url.pathname === "/__t32__/engine.html", (route) => route.fulfill({ status: 200, contentType: "text/html", body: engineHtml() }));
  const look = await lookContext.newPage();
  await look.goto(`${base}/__t32__/engine.html`, { waitUntil: "domcontentloaded" });
  await look.waitForFunction(() => window.__engineReady || window.__engineError, undefined, { timeout: 60000 });
  await look.evaluate(async () => {
    // three.js gives every new object an id from Math.random. A fresh
    // renderer (or a first-time texture) creates objects before the dice are
    // placed, which would shift the seeded sequence; keep ids off it.
    let ids = 0;
    window.THREE.MathUtils.generateUUID = () => `t32-${(ids += 1).toString(16).padStart(8, "0")}`;
    window.__t32Seed = (seed) => {
      let state = seed >>> 0;
      Math.random = () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    await window.LyrianAccurateDiceRoller.preloadFaceArtReady("rana-full-set");
  });
  const { createHash } = await import("node:crypto");
  const shot = async (reuseRenderer, seed) => {
    await look.evaluate(({ reuse, seedValue }) => {
      window.__t32Seed(seedValue);
      window.LyrianAccurateDiceRoller.rollDice({
        layer: document.getElementById("layer"),
        results: [{ sides: 20, value: 17 }, { sides: 100, value: 55 }, { sides: 6, value: 3 }, { sides: 4, value: 2 }],
        setId: "rana-full-set",
        width: 800,
        height: 600,
        reducedMotion: false,
        reuseRenderer: reuse
      });
    }, { reuse: reuseRenderer, seedValue: seed });
    await look.waitForTimeout(4600); // settle at ~3.6 s; the hold lasts until ~6.6 s
    const png = await look.screenshot({ clip: { x: 0, y: 0, width: 800, height: 600 } });
    const hash = createHash("sha256").update(png).digest("hex").slice(0, 16);
    if (process.env.T32_SHOTS) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path.join(process.env.T32_SHOTS, `l4-${reuseRenderer ? "pooled" : "fresh"}-seed${seed}-${hash}.png`), png);
    }
    const contexts = await look.evaluate(() => document.querySelectorAll(".accurate-dice-canvas").length);
    return { hash, contexts };
  };
  const fresh1 = await shot(false, 42);
  const fresh2 = await shot(false, 42);
  const pooledFirst = await shot(true, 42);
  const pooledReused = await shot(true, 42);
  const pooledStatus = await look.evaluate(() => window.LyrianAccurateDiceRoller.getStatus().pooledRenderer);
  const otherSeed = await shot(true, 7);
  await look.evaluate(() => window.LyrianAccurateDiceRoller.clear());
  await look.waitForTimeout(200);
  const blank = createHash("sha256").update(await look.screenshot({ clip: { x: 0, y: 0, width: 800, height: 600 } })).digest("hex").slice(0, 16);
  check("L4 harness is repeatable: two fresh-renderer rolls with the same seed give the same picture", fresh1.hash === fresh2.hash, `${fresh1.hash} vs ${fresh2.hash}`);
  check("L4: the first pooled-renderer roll looks exactly like a fresh-renderer roll", pooledFirst.hash === fresh1.hash, `${pooledFirst.hash} vs ${fresh1.hash}`);
  check("L4: a REUSED renderer draws exactly the same picture", pooledReused.hash === fresh1.hash && pooledStatus?.rolls === 2, `${pooledReused.hash} vs ${fresh1.hash}; pool ${JSON.stringify(pooledStatus)}`);
  check("L4: the picture test is sensitive (another seed and no dice both look different)", otherSeed.hash !== fresh1.hash && blank !== fresh1.hash, `${otherSeed.hash} / ${blank}`);
  check("L4: after a pooled roll is cleared, its geometry is freed and the canvas is hidden",
    await look.evaluate(() => {
      const status = window.LyrianAccurateDiceRoller.getStatus().pooledRenderer;
      const canvas = document.querySelector(".accurate-dice-canvas[data-pooled]");
      return status?.geometries === 0 && canvas?.style.visibility === "hidden";
    }));

  /* A3. Task 032b: a lost WebGL context on the reused renderer. A GPU reset
     or a sleeping laptop can take the context away. The pooled canvas then
     stays blank forever unless the next roll notices (isContextLost) and
     builds a new renderer. Same seed and dice as the pictures above, so a
     new renderer must draw exactly the fresh-renderer picture. */
  const lossSetup = await look.evaluate(async () => {
    const canvas = document.querySelector(".accurate-dice-canvas[data-pooled]");
    const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) {
      return { ok: false, reason: canvas ? "no WEBGL_lose_context extension" : "no pooled canvas" };
    }
    window.__t32OldPooledCanvas = canvas;
    const before = window.LyrianAccurateDiceRoller.getStatus().pooledRenderer?.rolls ?? 0;
    extension.loseContext();
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { ok: true, lost: gl.isContextLost(), rollsBefore: before };
  });
  check("context-loss setup: the pooled canvas had a context and it is now lost", lossSetup.ok && lossSetup.lost === true, JSON.stringify(lossSetup));
  const afterLoss = await shot(true, 42);
  const lossState = await look.evaluate(() => {
    const canvases = [...document.querySelectorAll(".accurate-dice-canvas")];
    const pooled = document.querySelector(".accurate-dice-canvas[data-pooled]");
    const gl = pooled?.getContext("webgl2") || pooled?.getContext("webgl");
    return {
      canvases: canvases.length,
      oldCanvasRemoved: window.__t32OldPooledCanvas ? !window.__t32OldPooledCanvas.isConnected : false,
      newCanvasContextLost: gl ? gl.isContextLost() : null,
      pool: window.LyrianAccurateDiceRoller.getStatus().pooledRenderer
    };
  });
  check("context loss: the next pooled roll builds a NEW renderer (new canvas, live context, pool restarted at roll 1)",
    lossState.canvases === 1 && lossState.oldCanvasRemoved && lossState.newCanvasContextLost === false && lossState.pool?.rolls === 1,
    JSON.stringify(lossState));
  check("context loss: and it draws exactly the fresh-renderer picture (not a blank canvas)",
    afterLoss.hash === fresh1.hash && afterLoss.hash !== blank, `${afterLoss.hash} vs fresh ${fresh1.hash}, blank ${blank}`);
  await lookContext.close();
}

/* ── Phase B: the Owlbear extensions in a fake room ─────────────────── */

const FAKE_SDK_MODULE = `
const host = (() => {
  try {
    return window.top !== window && window.top.__fakeOwlbearHost ? window.top.__fakeOwlbearHost : null;
  } catch (error) {
    return null;
  }
})();
const OBR = host ? host.sdkFor(window) : undefined;
export default OBR;
`;

async function bundleExtensionPage(entry) {
  const result = await build({
    absWorkingDir: servedRoot,
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    write: false,
    logLevel: "silent",
    plugins: [{
      name: "fake-owlbear-sdk",
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^@owlbear-rodeo\/sdk$/ }, () => ({ path: "fake-owlbear-sdk", namespace: "t32" }));
        pluginBuild.onLoad({ filter: /.*/, namespace: "t32" }, () => ({ contents: FAKE_SDK_MODULE, loader: "js" }));
      }
    }]
  });
  return result.outputFiles[0].text;
}

/* Runs in the fake Owlbear page. It answers the SDK calls of every
   extension frame and builds their windows the way Owlbear does. */
function installFakeOwlbearHost() {
  const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
  const roomRef = btoa(`${location.origin} fake-room`);
  const host = {
    calls: [],
    errors: [],
    clicks: [],
    frames: new Map(),
    listeners: [],
    roomMetadata: {},
    playerMetadata: {},
    // Task 032b: false makes the fake modal catch clicks even when the page
    // asked for disablePointerEvents (a real Owlbear that ignores the option).
    honourPointerEvents: true,
    // Task 032b: how long a modal's SDK takes to become ready.
    modalReadyDelayMs: 0,
    // Task 032b: a real modal stays on screen a moment after close() is
    // called, so a click can send more events before the window is gone.
    closeDelayMs: 0,
    player: { id: "player-gm", name: "Test GM", role: "GM" },
    withRef(url) {
      const target = new URL(url, location.href);
      target.searchParams.set("obrref", roomRef);
      return target.href;
    },
    record(name, ...args) {
      host.calls.push([name, ...clone(args)]);
    },
    deliver(channel, data, destination) {
      if (destination === "REMOTE") {
        return; // other players only; nobody else is in this fake room
      }
      host.listeners.slice().forEach((entry) => {
        if (entry.channel !== channel || (entry.frameEl && !entry.frameEl.isConnected)) {
          return;
        }
        setTimeout(() => {
          try {
            entry.cb({ data: clone(data), connectionId: "fake-connection" });
          } catch (error) {
            host.errors.push(`broadcast listener: ${error?.message || error}`);
          }
        }, 0);
      });
    },
    remoteRoll(channel, data) {
      host.record("remote-roll", channel, data?.id);
      host.deliver(channel, data, "ALL");
    },
    mount(kind, options) {
      host.unmount(options.id);
      const root = document.createElement("div");
      root.dataset.obrFrame = kind;
      root.dataset.id = options.id;
      const iframe = document.createElement("iframe");
      iframe.dataset.kind = kind;
      iframe.setAttribute("allowtransparency", "true");
      iframe.style.cssText = "border:0;width:100%;height:100%;display:block;background:transparent";
      if (kind === "modal") {
        // An Owlbear modal is a fixed root over the whole viewport. Only
        // disablePointerEvents lets clicks through it; without hideBackdrop a
        // dimming backdrop also catches clicks.
        root.style.cssText = "position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center";
        root.style.pointerEvents = options.disablePointerEvents && host.honourPointerEvents ? "none" : "auto";
        if (!options.hideBackdrop) {
          const backdrop = document.createElement("div");
          backdrop.dataset.obrBackdrop = "1";
          backdrop.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,0.5)";
          root.appendChild(backdrop);
        }
        const paper = document.createElement("div");
        paper.style.cssText = options.fullScreen
          ? "position:absolute;inset:0"
          : `position:relative;width:${options.width || 400}px;height:${options.height || 300}px`;
        paper.style.background = options.hidePaper ? "transparent" : "#222a38";
        paper.appendChild(iframe);
        root.appendChild(paper);
      } else {
        // A popover (or the action window) is a paper box at its anchor and
        // takes every click on it: the SDK has no pass-through option.
        const left = options.anchorPosition?.left ?? 0;
        const top = options.anchorPosition?.top ?? 0;
        root.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${options.width}px;height:${options.height}px;z-index:1300;pointer-events:auto`;
        root.style.background = options.hidePaper ? "transparent" : "#222a38";
        root.appendChild(iframe);
      }
      iframe.src = host.withRef(options.url);
      document.body.appendChild(root);
      host.frames.set(options.id, { root, iframe, kind });
    },
    unmount(id) {
      const frame = host.frames.get(id);
      if (frame) {
        frame.root.remove();
        host.frames.delete(id);
      }
    },
    startBackground() {
      const iframe = document.createElement("iframe");
      iframe.dataset.kind = "background";
      iframe.style.cssText = "position:absolute;width:0;height:0;border:0;left:-10px;top:-10px";
      iframe.src = host.withRef("/owlbear-dice/background.html");
      document.body.appendChild(iframe);
    },
    openAction(url) {
      host.mount("action", { id: "dice-action", url, width: 520, height: 640, anchorPosition: { left: 16, top: 70 } });
    },
    sdkFor(win) {
      let frameEl = null;
      try {
        frameEl = win.frameElement || null;
      } catch (error) {
        frameEl = null;
      }
      const subscribe = (entry) => {
        host.listeners.push(entry);
        return () => {
          const index = host.listeners.indexOf(entry);
          if (index >= 0) {
            host.listeners.splice(index, 1);
          }
        };
      };
      return {
        isAvailable: true,
        get isReady() { return true; },
        onReady(callback) {
          const delay = frameEl?.dataset?.kind === "modal" ? host.modalReadyDelayMs : 0;
          setTimeout(() => {
            try {
              callback();
            } catch (error) {
              host.errors.push(`onReady: ${error?.message || error}`);
            }
          }, delay);
        },
        player: {
          get id() { return host.player.id; },
          getId: async () => host.player.id,
          getName: async () => host.player.name,
          getRole: async () => host.player.role,
          getMetadata: async () => clone(host.playerMetadata),
          setMetadata: async (update) => { Object.assign(host.playerMetadata, clone(update)); },
          onChange: () => () => {}
        },
        room: {
          getMetadata: async () => clone(host.roomMetadata),
          setMetadata: async (update) => { host.record("room.setMetadata", Object.keys(update || {})); Object.assign(host.roomMetadata, clone(update)); },
          onMetadataChange: () => () => {}
        },
        viewport: {
          getWidth: async () => window.innerWidth,
          getHeight: async () => window.innerHeight
        },
        broadcast: {
          onMessage: (channel, cb) => {
            host.record("broadcast.onMessage", channel, frameEl?.dataset?.kind || "top");
            return subscribe({ channel, cb, frameEl });
          },
          sendMessage: async (channel, data, options) => {
            host.record("broadcast.sendMessage", channel, data, options || null);
            host.deliver(channel, data, options?.destination || "REMOTE");
          }
        },
        modal: {
          open: async (options) => { host.record("modal.open", options); host.mount("modal", options); },
          close: async (id) => {
            host.record("modal.close", id);
            if (host.closeDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, host.closeDelayMs));
            }
            host.unmount(id);
          }
        },
        popover: {
          open: async (options) => { host.record("popover.open", options); host.mount("popover", options); },
          close: async (id) => { host.record("popover.close", id); host.unmount(id); },
          setHeight: async (id, height) => { host.record("popover.setHeight", id, height); const frame = host.frames.get(id); if (frame) frame.root.style.height = `${height}px`; },
          setWidth: async (id, width) => { host.record("popover.setWidth", id, width); const frame = host.frames.get(id); if (frame) frame.root.style.width = `${width}px`; },
          getHeight: async (id) => host.frames.get(id)?.root.offsetHeight || 0,
          getWidth: async (id) => host.frames.get(id)?.root.offsetWidth || 0
        },
        notification: { show: async () => "fake-notification" }
      };
    }
  };
  document.addEventListener("click", (event) => {
    host.clicks.push({ id: event.target?.id || event.target?.tagName || "", x: event.clientX, y: event.clientY, at: Date.now() });
  }, true);
  window.__fakeOwlbearHost = host;
}

function hostHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fake Owlbear room</title>
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #1d2433; font: 14px system-ui, sans-serif; }
  #board { position: fixed; inset: 0; background: #2b3a2b; }
  #obr-toolbar { position: fixed; left: 16px; top: 16px; width: 260px; height: 44px; background: #11161f; border-radius: 8px; z-index: 10; }
  #companion-action { position: absolute; left: 84px; top: 6px; width: 36px; height: 32px; }
  #dice-action { position: absolute; left: 128px; top: 6px; width: 36px; height: 32px; }
  #obr-tools { position: fixed; right: 16px; top: 16px; width: 200px; height: 44px; background: #11161f; border-radius: 8px; z-index: 10; }
  #tool-select { position: absolute; right: 8px; top: 6px; width: 36px; height: 32px; }
  #token { position: fixed; left: 400px; top: 120px; width: 60px; height: 60px; border-radius: 50%; background: #c84; z-index: 5; }
</style></head>
<body>
  <div id="board"></div>
  <div id="obr-toolbar"><button id="companion-action" type="button">C</button><button id="dice-action" type="button">D</button></div>
  <div id="obr-tools"><button id="tool-select" type="button">S</button></div>
  <div id="token"></div>
  <script>(${installFakeOwlbearHost.toString()})();</script>
</body></html>`;
}

/* Points on Owlbear's page (1280 x 800). The result chip sits at the top
   centre, about x 525-755, y 14-110. */
const CLICK_POINTS = [
  { name: "Owlbear's extension toolbar button (top left)", x: 118, y: 38, id: "companion-action" },
  { name: "Owlbear's tools (top right)", x: 1238, y: 38, id: "tool-select" },
  { name: "a token in the old 190 px strip", x: 430, y: 150, id: "token" },
  { name: "the board where the dice fly", x: 640, y: 420, id: "board" },
  { name: "just below the result chip", x: 640, y: 180, id: "board" },
  { name: "beside the result chip", x: 900, y: 60, id: "board" }
];
const ON_CHIP_POINT = { name: "right on the result chip", x: 640, y: 60, id: "board" };

async function clickThrough(page, moment, points = CLICK_POINTS) {
  for (const point of points) {
    const before = await page.evaluate(() => window.__fakeOwlbearHost.clicks.length);
    const hit = await page.evaluate(([x, y]) => {
      const element = document.elementFromPoint(x, y);
      return { id: element?.id || element?.tagName || "", inExtensionWindow: Boolean(element?.closest?.("[data-obr-frame]")) };
    }, [point.x, point.y]);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(50);
    const landed = await page.evaluate((count) => window.__fakeOwlbearHost.clicks.slice(count).map((click) => click.id), before);
    check(`${moment}: a click on ${point.name} reaches Owlbear`,
      landed.includes(point.id) && !hit.inExtensionWindow && hit.id === point.id,
      `under the mouse: ${hit.id}${hit.inExtensionWindow ? " (an extension window)" : ""}; host got: ${landed.join(",") || "nothing"}`);
  }
}

function attachedFrame(page, fragment) {
  return page.frames().find((frame) => !frame.isDetached() && frame.url().includes(fragment)) || null;
}

async function waitForFrame(page, fragment, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const frame = attachedFrame(page, fragment);
    if (frame) {
      return frame;
    }
    await sleep(50);
  }
  throw new Error(`No ${fragment} window appeared.`);
}

async function hostCalls(page, name) {
  return page.evaluate((callName) => window.__fakeOwlbearHost.calls.filter((call) => call[0] === callName), name);
}

async function overlayState(frame) {
  return frame.evaluate(() => {
    const roller = window.LyrianWorkshopDiceRoller || window.LyrianAccurateDiceRoller;
    const status = roller?.getStatus?.() || {};
    const shared = status.shared || status;
    return {
      // Visible dice canvases (the engine's pooled canvas stays, hidden).
      canvases: [...document.querySelectorAll(".accurate-dice-canvas")].filter((canvas) => getComputedStyle(canvas).visibility !== "hidden").length,
      glContexts: window.__t32GlCanvases || 0,
      pool: shared.pooledRenderer || null,
      chips: [...document.querySelectorAll("#roll-chips .chip:not(.is-fading)")].map((chip) => ({
        label: chip.querySelector(".chip-label")?.textContent || "",
        total: chip.querySelector(".chip-total")?.textContent || ""
      })),
      settled: (shared.settledResults || []).map((entry) => ({ die: entry.die, requested: entry.requested, matched: entry.matched })),
      active: Boolean(shared.active),
      errors: window.__t32Errors || []
    };
  });
}

function rollEvent(id, label, dice, extra = {}) {
  const total = dice.reduce((sum, entry) => sum + entry.value, 0);
  return {
    v: 1,
    id,
    ts: Date.now(),
    kind: "dice",
    relaySource: "angel-sword-sheet",
    character: "Mira Vale",
    playerName: "Player A",
    playerRole: "PLAYER",
    label,
    formula: dice.map((entry) => `1d${entry.sides}`).join(" + "),
    breakdown: dice.map((entry) => `d${entry.sides}: ${entry.value}`).join(" | "),
    total,
    dice,
    ...extra
  };
}

/* The real background, overlay and panel bundles plus a way to open a fresh
   browser context that serves them next to the fake Owlbear host page. */
async function buildRoomHarness(browser) {
  const core = await import(pathToFileURL(path.join(servedRoot, "owlbear", "core.js")).href);
  const bundles = {
    background: await bundleExtensionPage("owlbear-dice/background.js"),
    overlay: await bundleExtensionPage("owlbear-dice/overlay.js"),
    panel: await bundleExtensionPage("owlbear-dice/panel.js")
  };
  const prepareContext = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      window.__t32Errors = [];
      window.addEventListener("error", (event) => window.__t32Errors.push(String(event.message || event.error)));
      window.addEventListener("unhandledrejection", (event) => window.__t32Errors.push(`unhandled: ${event.reason?.message || event.reason}`));
      // Count canvases that got a WebGL context in this window (task 032 L4).
      window.__t32GlCanvases = 0;
      const withContext = new WeakSet();
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const context = getContext.call(this, type, ...rest);
        if (context && /webgl/i.test(String(type)) && !withContext.has(this)) {
          withContext.add(this);
          window.__t32GlCanvases += 1;
        }
        return context;
      };
    });
    await context.route((url) => /\/owlbear-dice\/dist\/(background|overlay|panel)\.js$/.test(url.pathname), (route) => {
      const name = /\/owlbear-dice\/dist\/(background|overlay|panel)\.js$/.exec(new URL(route.request().url()).pathname)[1];
      return route.fulfill({ status: 200, contentType: "text/javascript", body: bundles[name] });
    });
    await context.route((url) => url.pathname === "/__t32__/owlbear-host.html", (route) => route.fulfill({ status: 200, contentType: "text/html", body: hostHtml() }));
    return context;
  };
  return { core, prepareContext };
}

async function phaseB(browser, base) {
  section("B. Owlbear extensions in a fake Owlbear room (stage 1)");
  const { core, prepareContext } = await buildRoomHarness(browser);
  const ROLL_CHANNEL = core.ROLL_CHANNEL;

  /* B1. L1: clicks reach Owlbear before, during and after a roll. */
  const context = await prepareContext();
  const page = await context.newPage();
  const consoleErrors = [];
  const consoleTexts = [];
  page.on("console", (message) => {
    consoleTexts.push(message.text());
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.goto(`${base}/__t32__/owlbear-host.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.__fakeOwlbearHost.startBackground());
  await page.waitForFunction((channel) => window.__fakeOwlbearHost.calls.some((call) => call[0] === "broadcast.onMessage" && call[1] === channel && call[2] === "background"), ROLL_CHANNEL, { timeout: 15000 });
  await clickThrough(page, "Before any roll", CLICK_POINTS.slice(0, 2));

  const rolledAt = Date.now();
  await page.evaluate(([channel, event]) => window.__fakeOwlbearHost.remoteRoll(channel, event), [ROLL_CHANNEL, rollEvent("t32-r1", "Light Attack", [{ sides: 20, value: 17 }, { sides: 100, value: 7 }])]);
  await page.waitForFunction(() => window.__fakeOwlbearHost.calls.some((call) => call[0] === "modal.open" || call[0] === "popover.open"), undefined, { timeout: 10000 });
  const opens = await hostCalls(page, "modal.open");
  const options = opens[0]?.[1] || {};
  check("the overlay opens as an Owlbear modal (not a popover)", opens.length === 1 && (await hostCalls(page, "popover.open")).length === 0,
    `modal.open ${opens.length}, popover.open ${(await hostCalls(page, "popover.open")).length}`);
  check("modal options: fullScreen, hideBackdrop, hidePaper and disablePointerEvents are all true",
    options.fullScreen === true && options.hideBackdrop === true && options.hidePaper === true && options.disablePointerEvents === true,
    JSON.stringify(options));
  check("the modal loads the dice overlay page", String(options.url || "").includes("/owlbear-dice/overlay.html"), options.url);

  const overlay = await waitForFrame(page, "/owlbear-dice/overlay.html");
  await overlay.waitForFunction(() => document.querySelectorAll(".accurate-dice-canvas").length > 0 && document.querySelectorAll("#roll-chips .chip").length > 0, undefined, { timeout: 30000 });
  const flying = await overlayState(overlay);
  const flyingAt = Date.now() - rolledAt;
  check("dice are in flight in the overlay (3D canvas up, chip shown)", flying.canvases === 1 && flying.chips.length === 1, `${flyingAt} ms after the roll; ${JSON.stringify(flying.chips)}`);
  check("L4: the overlay asks the engine for its pooled renderer", flying.pool?.rolls === 1 && flying.glContexts === 1, `${flying.glContexts} contexts; pool ${JSON.stringify(flying.pool)}`);
  check("the overlay fills the whole Owlbear page", await overlay.evaluate(() => window.innerWidth === 1280 && window.innerHeight === 800));
  await clickThrough(page, "During the roll (dice flying)");
  await clickThrough(page, "During the roll (dice flying)", [ON_CHIP_POINT]);
  const stillFlying = await overlayState(overlay);
  check("the clicks above happened while the dice were still flying", stillFlying.canvases === 1, `${Date.now() - rolledAt} ms after the roll`);
  check("Owlbear-style 1d20 + 1d100 (17, 7) shows d20 17, d100 tens 00, ones 7",
    stillFlying.settled.map((entry) => `${entry.die}:${entry.requested}`).join(" ") === "d20:17 d00:00 d10:7",
    stillFlying.settled.map((entry) => `${entry.die}:${entry.requested}`).join(" "));

  await overlay.waitForFunction(() => [...document.querySelectorAll(".accurate-dice-canvas")].every((canvas) => getComputedStyle(canvas).visibility === "hidden"), undefined, { timeout: 15000 });
  const landed = await overlayState(overlay);
  check("after the dice clear, the chip is still showing", landed.chips.length === 1 && landed.chips[0].total === "Total 24", JSON.stringify(landed.chips));
  check("the overlay window never changed size (no shrink, no strip)", await page.evaluate(() => {
    const frame = window.__fakeOwlbearHost.frames.get("com.angelssword.lyrian-chronicles/dice-overlay");
    const box = frame?.root.getBoundingClientRect();
    return Boolean(box) && box.width === 1280 && box.height === 800;
  }));
  await clickThrough(page, `After the dice land (${Math.round((Date.now() - rolledAt) / 1000)} s, chip showing)`);

  await sleep(Math.max(0, 20000 - (Date.now() - rolledAt)));
  check("20 s after the roll the chip is still up (the old strip time)", (await overlayState(overlay)).chips.length === 1);
  await clickThrough(page, "20 s after the roll (chip still up)");

  await page.waitForFunction(() => window.__fakeOwlbearHost.calls.some((call) => call[0] === "modal.close" || call[0] === "popover.close"), undefined, { timeout: 45000 });
  const closedAt = Date.now();
  check("the overlay closes itself as a modal when the last chip fades",
    (await hostCalls(page, "modal.close")).length === 1 && (await page.evaluate(() => window.__fakeOwlbearHost.frames.size)) === 0,
    `${Math.round((closedAt - rolledAt) / 1000)} s after the roll`);
  await clickThrough(page, "After the overlay closed");

  /* B2. L2 + the close-then-roll case + the six d100 payloads. */
  await page.evaluate(([channel, first, second]) => {
    window.__fakeOwlbearHost.remoteRoll(channel, first);
    setTimeout(() => window.__fakeOwlbearHost.remoteRoll(channel, second), 60);
  }, [ROLL_CHANNEL, rollEvent("t32-x1", "Boot Roll One", [{ sides: 20, value: 4 }]), rollEvent("t32-x2", "Boot Roll Two", [{ sides: 6, value: 2 }])]);
  let reopenedFrame = null;
  try {
    await page.waitForFunction(() => window.__fakeOwlbearHost.calls.filter((call) => call[0] === "modal.open" || call[0] === "popover.open").length >= 2, undefined, { timeout: 8000 });
    reopenedFrame = await waitForFrame(page, "/owlbear-dice/overlay.html");
    await reopenedFrame.waitForFunction(() => document.querySelectorAll("#roll-chips .chip").length >= 2, undefined, { timeout: 30000 });
    await sleep(800);
  } catch (error) {
    reopenedFrame = attachedFrame(page, "/owlbear-dice/overlay.html");
  }
  check(`a roll ${((Date.now() - closedAt) / 1000).toFixed(1)} s after the overlay closed opens a new overlay (not dropped)`, Boolean(reopenedFrame),
    `modal.open calls: ${(await hostCalls(page, "modal.open")).length}, popover.open calls: ${(await hostCalls(page, "popover.open")).length}`);
  const rebuilt = reopenedFrame ? await overlayState(reopenedFrame) : { chips: [] };
  check("L2: the rebuilt overlay shows both rolls from its own boot", rebuilt.chips.map((chip) => chip.label).join(",") === "Boot Roll One,Boot Roll Two", JSON.stringify(rebuilt.chips));
  check(`L2: the rebuilt overlay does not bring back the ${Math.round((Date.now() - rolledAt) / 1000)} s old roll`, !rebuilt.chips.some((chip) => chip.label === "Light Attack"), JSON.stringify(rebuilt.chips));

  const beforeAfter = [];
  for (const value of PERCENTILE_CASES) {
    await page.evaluate(([channel, event]) => window.__fakeOwlbearHost.remoteRoll(channel, event), [ROLL_CHANNEL, rollEvent(`t32-d100-${value}`, `Percentile ${value}`, [{ sides: 100, value }])]);
    const frame = attachedFrame(page, "/owlbear-dice/overlay.html") || await waitForFrame(page, "/owlbear-dice/overlay.html");
    let shown = "";
    try {
      await frame.waitForFunction((expected) => {
        const roller = window.LyrianWorkshopDiceRoller;
        const settled = roller?.getStatus?.().settledResults || [];
        return settled.map((entry) => entry.requested).join("|") === expected;
      }, expectedPercentile(value), { timeout: 8000 });
    } catch (error) {
      /* reported below with what was shown */
    }
    const state = await overlayState(frame);
    shown = state.settled.map((entry) => entry.requested).join("|");
    beforeAfter.push(`${value} -> ${shown.replace("|", " + ") || "(nothing)"}`);
    check(`Owlbear d100 ${value} shows ${expectedPercentile(value).replace("|", " + ")}`, shown === expectedPercentile(value) && state.settled.every((entry) => entry.matched),
      `${shown.replace("|", " + ")}; chip ${state.chips.at(-1)?.total || ""}`);
    await sleep(300);
  }
  note("Owlbear d100 faces (result -> tens + ones)", beforeAfter.join("; "));
  const lastOverlay = attachedFrame(page, "/owlbear-dice/overlay.html");
  if (lastOverlay) {
    await lastOverlay.waitForFunction(() => [...document.querySelectorAll(".accurate-dice-canvas")].every((canvas) => getComputedStyle(canvas).visibility === "hidden"), undefined, { timeout: 12000 }).catch(() => {});
  }
  const pooledState = lastOverlay ? await overlayState(lastOverlay) : { glContexts: -1, pool: null };
  check(`L4: one WebGL context served all ${pooledState.pool?.rolls ?? "?"} rolls of this overlay`, pooledState.glContexts === 1 && (pooledState.pool?.rolls || 0) >= 7,
    `${pooledState.glContexts} contexts; pool ${JSON.stringify(pooledState.pool)}`);
  check("L4: after the dice clear, the pooled renderer holds no leftover geometry", pooledState.pool?.geometries === 0, JSON.stringify(pooledState.pool));
  check("no popover call was ever made", (await page.evaluate(() => window.__fakeOwlbearHost.calls.filter((call) => call[0].startsWith("popover.")).length)) === 0);
  const frameErrors = [];
  for (const frame of page.frames()) {
    if (!frame.isDetached()) {
      frameErrors.push(...await frame.evaluate(() => window.__t32Errors || []).catch(() => []));
    }
  }
  const hostErrors = await page.evaluate(() => window.__fakeOwlbearHost.errors);
  check("no errors in the fake room's windows", frameErrors.length === 0 && hostErrors.length === 0, [...frameErrors, ...hostErrors].join(" | "));
  if (consoleErrors.length) {
    note("console errors seen in the fake room", consoleErrors.slice(0, 5).join(" | "));
  }
  check("safety net (normal case): with clicks passing through, the overlay never trips it (no console line over all the clicks above)",
    !consoleTexts.some((text) => SAFETY_NET_LINE.test(text)),
    `${consoleTexts.filter((text) => SAFETY_NET_LINE.test(text)).length} safety-net lines`);
  await context.close();

  /* B3. L3: the Dice panel inside a room skips the engine. */
  const roomContext = await prepareContext();
  const roomPage = await roomContext.newPage();
  const panelRequests = [];
  roomPage.on("request", (request) => {
    let frameUrl = "";
    try {
      frameUrl = request.frame()?.url() || "";
    } catch (error) {
      frameUrl = "";
    }
    if (frameUrl.includes("/owlbear-dice/panel.html")) {
      panelRequests.push(new URL(request.url()).pathname + new URL(request.url()).search);
    }
  });
  await roomPage.goto(`${base}/__t32__/owlbear-host.html`, { waitUntil: "domcontentloaded" });
  await roomPage.evaluate(() => window.__fakeOwlbearHost.startBackground());
  await roomPage.waitForFunction((channel) => window.__fakeOwlbearHost.calls.some((call) => call[0] === "broadcast.onMessage" && call[1] === channel && call[2] === "background"), ROLL_CHANNEL, { timeout: 15000 });
  const openedAt = Date.now();
  await roomPage.evaluate(() => window.__fakeOwlbearHost.openAction("/owlbear-dice/panel.html"));
  const panel = await waitForFrame(roomPage, "/owlbear-dice/panel.html");
  await panel.waitForFunction(() => /connected/i.test(document.getElementById("status")?.textContent || ""), undefined, { timeout: 15000 });
  await panel.click('[data-sides="100"]');
  let rollReadyMs = -1;
  try {
    await panel.waitForFunction(() => !document.getElementById("dice-roll").disabled, undefined, { timeout: 5000 });
    rollReadyMs = Date.now() - openedAt;
  } catch (error) {
    rollReadyMs = -1;
  }
  check("L3: in a room, Roll is pressable as soon as the room connects", rollReadyMs >= 0 && rollReadyMs < 5000, `${rollReadyMs} ms after the panel opened`);
  const engineFiles = panelRequests.filter((url) => /three\.min\.js|GLTFLoader|dice-3d-embedded|face-art|\/promoted\/|lyrian-accurate-dice|shared-dice-roller-core|dice-roller-router|dice-geometry/.test(url));
  check("L3: the panel in a room downloads no 3D engine and no dice art", engineFiles.length === 0, engineFiles.slice(0, 4).join(", "));
  check("L3: the panel in a room still loads the dice-set list", panelRequests.some((url) => url.includes("promoted-dice-skins.registry.js")),
    panelRequests.filter((url) => url.endsWith(".js") || url.includes(".js?")).join(", "));
  const setOptions = await panel.evaluate(() => [...document.querySelectorAll("#dice-set option")].map((option) => option.value));
  check("L3: the set picker lists all four sets", SETS.every((id) => setOptions.includes(id)), setOptions.join(", "));
  await panel.evaluate(() => { Math.random = () => 0.425; }); // 1d100 -> 43
  await panel.click("#dice-roll");
  await roomPage.waitForFunction((channel) => window.__fakeOwlbearHost.calls.some((call) => call[0] === "broadcast.sendMessage" && call[1] === channel), ROLL_CHANNEL, { timeout: 5000 });
  const sent = (await hostCalls(roomPage, "broadcast.sendMessage")).find((call) => call[1] === ROLL_CHANNEL);
  check("L3: the panel's roll is shared with the whole room", sent?.[3]?.destination === "ALL" && sent?.[2]?.total === 43 && sent?.[2]?.dice?.[0]?.sides === 100,
    JSON.stringify({ total: sent?.[2]?.total, dice: sent?.[2]?.dice, options: sent?.[3] }));
  check("L3: the roll is saved to the room log", (await hostCalls(roomPage, "room.setMetadata")).length >= 1);
  const ownOverlay = await waitForFrame(roomPage, "/owlbear-dice/overlay.html", 10000).catch(() => null);
  let ownShown = "";
  if (ownOverlay) {
    await ownOverlay.waitForFunction(() => (window.LyrianWorkshopDiceRoller?.getStatus?.().settledResults || []).length > 0, undefined, { timeout: 30000 }).catch(() => {});
    ownShown = (await overlayState(ownOverlay)).settled.map((entry) => entry.requested).join("|");
  }
  check("L3: the overlay animates the panel's own roll (43 = 40 + 3)", ownShown === "40|3", ownShown || "no overlay");
  check("L3: the panel's own window never animates in a room", (await panel.evaluate(() => document.querySelectorAll(".accurate-dice-canvas").length)) === 0);
  await roomContext.close();

  /* B4. The standalone panel (no room) still loads and runs the engine. */
  const standaloneContext = await prepareContext();
  const standalone = await standaloneContext.newPage();
  const standaloneRequests = [];
  standalone.on("request", (request) => standaloneRequests.push(new URL(request.url()).pathname + new URL(request.url()).search));
  await standalone.goto(`${base}/owlbear-dice/panel.html`, { waitUntil: "domcontentloaded" });
  await standalone.waitForFunction(() => /Standalone preview/.test(document.getElementById("status")?.textContent || ""), undefined, { timeout: 30000 });
  check("standalone panel loads the engine with the new core token", standaloneRequests.some((url) => url === `/assets/dice-3d/shared-dice-roller-core.js${NEW_CORE_TOKEN}`),
    standaloneRequests.filter((url) => url.includes("shared-dice-roller-core")).join(", "));
  await standalone.click('[data-sides="20"]');
  await standalone.click("#dice-roll");
  await standalone.waitForFunction(() => document.querySelectorAll(".accurate-dice-canvas").length > 0, undefined, { timeout: 10000 }).catch(() => {});
  check("standalone panel still animates its own roll", (await standalone.evaluate(() => document.querySelectorAll(".accurate-dice-canvas").length)) > 0);
  await standaloneContext.close();

  /* B5. Version tokens. */
  const overlayHtml = await readFile(path.join(servedRoot, "owlbear-dice", "overlay.html"), "utf8");
  const panelHtml = await readFile(path.join(servedRoot, "owlbear-dice", "panel.html"), "utf8");
  const tokens = (html) => ({
    V: /var V = "([^"]+)"/.exec(html)?.[1] || "",
    CORE_V: /var CORE_V = "([^"]+)"/.exec(html)?.[1] || "",
    coreUsesCoreToken: /"\.\.\/assets\/dice-3d\/shared-dice-roller-core\.js" \+ CORE_V/.test(html),
    dist: /src="dist\/\w+\.js(\?v=[^"]+)"/.exec(html)?.[1] || ""
  });
  const overlayTokens = tokens(overlayHtml);
  const panelTokens = tokens(panelHtml);
  check("panel.html and overlay.html load the same engine version tokens", overlayTokens.V && overlayTokens.V === panelTokens.V && overlayTokens.CORE_V === panelTokens.CORE_V,
    `overlay ${overlayTokens.V} / ${overlayTokens.CORE_V}; panel ${panelTokens.V} / ${panelTokens.CORE_V}`);
  check("both load the dice core with the new core token", overlayTokens.coreUsesCoreToken && panelTokens.coreUsesCoreToken && overlayTokens.CORE_V === NEW_CORE_TOKEN, overlayTokens.CORE_V);
  check("both load their bundle with the same ?v= token", overlayTokens.dist && overlayTokens.dist === panelTokens.dist, `${overlayTokens.dist} / ${panelTokens.dist}`);
  if (!liveBuilder) {
    const loader = await readFile(path.join(servedRoot, "src", "js", "runtime-loader.js"), "utf8");
    const builderCoreToken = /shared-dice-roller-core\.js(\?v=[^"]+)"/.exec(loader)?.[1] || "";
    check("the builder loads the same core token as the extensions (stage 2)", builderCoreToken === overlayTokens.CORE_V, builderCoreToken);
  }
}

/* B6, run as its own phase (T32_ONLY=B6 runs just this). */
async function phaseB6(browser, base) {
  const { core, prepareContext } = await buildRoomHarness(browser);
  await safetyNetChecks(prepareContext, base, core);
}

/* ── B6. Task 032b: the overlay closes itself if a click ever lands on it ── */

const SAFETY_NET_LINE = /not passing clicks through the roll overlay/;
const OVERLAY_ID = "com.angelssword.lyrian-chronicles/dice-overlay";

async function openFakeRoom(prepareContext, base, rollChannel, hostSettings = {}) {
  const context = await prepareContext();
  const page = await context.newPage();
  const lines = [];
  page.on("console", (message) => lines.push(message.text()));
  await page.goto(`${base}/__t32__/owlbear-host.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate((settings) => {
    Object.assign(window.__fakeOwlbearHost, settings);
    window.__fakeOwlbearHost.startBackground();
  }, hostSettings);
  await page.waitForFunction((channel) => window.__fakeOwlbearHost.calls.some((call) => call[0] === "broadcast.onMessage" && call[1] === channel && call[2] === "background"), rollChannel, { timeout: 15000 });
  return { context, page, lines };
}

function sendFakeRoll(page, rollChannel, id, label, dice = [{ sides: 20, value: 9 }]) {
  return page.evaluate(([channel, event]) => window.__fakeOwlbearHost.remoteRoll(channel, event), [rollChannel, rollEvent(id, label, dice)]);
}

async function waitForOverlayChip(page) {
  const overlay = await waitForFrame(page, "/owlbear-dice/overlay.html");
  await overlay.waitForFunction(() => document.querySelectorAll("#roll-chips .chip").length > 0, undefined, { timeout: 30000 });
  return overlay;
}

function waitForHostCall(page, name, timeout = 8000) {
  return page.waitForFunction((callName) => window.__fakeOwlbearHost.calls.some((call) => call[0] === callName), name, { timeout });
}

const countSafetyLines = (lines) => lines.filter((text) => SAFETY_NET_LINE.test(text));

async function safetyNetChecks(prepareContext, base, core) {
  const ROLL_CHANNEL = core.ROLL_CHANNEL;
  const ROOM_LOG_KEY = core.ROOM_LOG_KEY;
  section("B6. Safety net: a real Owlbear that ignores disablePointerEvents (task 032b)");

  /* The host now catches clicks even though the page asked for
     disablePointerEvents, like a real Owlbear that ignores the option. */
  const room = await openFakeRoom(prepareContext, base, ROLL_CHANNEL, { honourPointerEvents: false, closeDelayMs: 400 });
  const { page, lines } = room;
  await page.evaluate(() => window.__fakeOwlbearHost.openAction("/owlbear-dice/panel.html"));
  const panel = await waitForFrame(page, "/owlbear-dice/panel.html");
  await panel.waitForFunction(() => /connected/i.test(document.getElementById("status")?.textContent || ""), undefined, { timeout: 15000 });
  await sendFakeRoll(page, ROLL_CHANNEL, "t32b-r1", "First Roll");
  await waitForOverlayChip(page);
  const under = await page.evaluate(([x, y]) => {
    const element = document.elementFromPoint(x, y);
    return { tag: element?.tagName || "", frameId: element?.closest?.("[data-obr-frame]")?.dataset?.id || "" };
  }, [118, 38]);
  check("control: with the host ignoring the option, the overlay window sits under the mouse at Owlbear's toolbar",
    under.tag === "IFRAME" && under.frameId === OVERLAY_ID, JSON.stringify(under));
  const hostClicksBefore = await page.evaluate(() => window.__fakeOwlbearHost.clicks.length);
  const clickedAt = Date.now();
  await page.mouse.click(118, 38);
  // The modal stays up for a moment after close() (closeDelayMs), as a real
  // one does: the same click's mousedown and a wheel turn still reach it.
  await page.mouse.wheel(0, 120);
  let closedMs = -1;
  try {
    await page.waitForFunction(() => window.__fakeOwlbearHost.calls.some((call) => call[0] === "modal.close"), undefined, { timeout: 5000 });
    closedMs = Date.now() - clickedAt;
  } catch (error) {
    closedMs = -1;
  }
  await sleep(800);
  const closeCalls = await hostCalls(page, "modal.close");
  check("the first real click on the overlay closes it at once (as a modal)",
    closedMs >= 0 && closeCalls.length === 1 && closeCalls[0][1] === OVERLAY_ID
      && (await page.evaluate((id) => window.__fakeOwlbearHost.frames.has(id), OVERLAY_ID)) === false,
    `closed ${closedMs} ms after the click; modal.close calls ${closeCalls.length}`);
  // Whether the tail of that one click (mouseup/click) lands on Owlbear once
  // the overlay is gone is up to the browser; the worst case is this one click.
  note("the click that tripped the net", `${await page.evaluate((count) => window.__fakeOwlbearHost.clicks.length - count, hostClicksBefore)} click(s) reached Owlbear's page`);
  const firstLines = countSafetyLines(lines);
  check("one console line says why and names the first event, though pointerdown, mousedown and a wheel all reached the overlay",
    firstLines.length === 1 && /pointerdown/.test(firstLines[0]), `${firstLines.length} line(s): ${firstLines.join(" | ")}`);
  await page.mouse.click(118, 38);
  await page.waitForTimeout(100);
  check("the very next click reaches Owlbear again", (await page.evaluate(() => window.__fakeOwlbearHost.clicks.slice(-1)[0]?.id)) === "companion-action");

  // Later rolls: no new overlay, but the Dice panel still gets them.
  await sendFakeRoll(page, ROLL_CHANNEL, "t32b-r2", "Second Roll");
  await sleep(1500);
  await sendFakeRoll(page, ROLL_CHANNEL, "t32b-r3", "Third Roll");
  await sleep(2500);
  const opensAfter = await hostCalls(page, "modal.open");
  check("later rolls open no overlay while the room stays loaded", opensAfter.length === 1
    && (await page.evaluate((id) => window.__fakeOwlbearHost.frames.has(id), OVERLAY_ID)) === false,
    `modal.open calls ${opensAfter.length}`);
  const panelLine = await panel.evaluate(() => document.getElementById("feedback")?.textContent || "");
  check("the Dice panel still shows the newest roll", /Third Roll/.test(panelLine) && /rolled/.test(panelLine), panelLine);
  await panel.evaluate(() => { Math.random = () => 0.425; }); // d20 -> 9
  await panel.click('[data-sides="20"]');
  await panel.click("#dice-roll");
  await page.waitForFunction(([channel, key]) => {
    const log = window.__fakeOwlbearHost.roomMetadata[key];
    return Array.isArray(log) && log.some((entry) => entry.total === 9 && entry.label === "Angel Sword Dice");
  }, [ROLL_CHANNEL, ROOM_LOG_KEY], { timeout: 5000 }).catch(() => {});
  const log = await page.evaluate((key) => window.__fakeOwlbearHost.roomMetadata[key] || [], ROOM_LOG_KEY);
  const sentRolls = (await hostCalls(page, "broadcast.sendMessage")).filter((call) => call[1] === ROLL_CHANNEL);
  check("a roll made after the net tripped still goes to the room and into the Room Rolls log",
    sentRolls.length >= 1 && Array.isArray(log) && log.some((entry) => entry.total === 9 && entry.label === "Angel Sword Dice"),
    `sent ${sentRolls.length}; log ${JSON.stringify((Array.isArray(log) ? log : []).map((entry) => `${entry.label}:${entry.total}`))}`);
  await sleep(800);
  check("that roll opened no overlay either", (await hostCalls(page, "modal.open")).length === 1);
  check("the safety net spoke only once in the whole session", countSafetyLines(lines).length === 1, `${countSafetyLines(lines).length} lines`);

  // The flag lives in memory: a reloaded room (a fresh background page) opens the overlay again.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.__fakeOwlbearHost.startBackground());
  await page.waitForFunction((channel) => window.__fakeOwlbearHost.calls.some((call) => call[0] === "broadcast.onMessage" && call[1] === channel && call[2] === "background"), ROLL_CHANNEL, { timeout: 15000 });
  await sendFakeRoll(page, ROLL_CHANNEL, "t32b-r4", "After Reload");
  let reopened = true;
  try {
    await waitForHostCall(page, "modal.open", 10000);
  } catch (error) {
    reopened = false;
  }
  check("after the room reloads, the next roll opens the overlay again", reopened);
  await room.context.close();

  /* The four events, one fresh room each. The host honours the option here,
     so only the event the test sends can trip the net. */
  for (const type of ["pointerdown", "mousedown", "touchstart", "wheel"]) {
    const trial = await openFakeRoom(prepareContext, base, ROLL_CHANNEL, {});
    await sendFakeRoll(trial.page, ROLL_CHANNEL, `t32b-${type}-1`, "Before The Event");
    const overlay = await waitForOverlayChip(trial.page);
    await overlay.evaluate((eventType) => {
      const made = {
        pointerdown: () => new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }),
        mousedown: () => new MouseEvent("mousedown", { bubbles: true }),
        touchstart: () => (typeof TouchEvent === "function" ? new TouchEvent("touchstart", { bubbles: true }) : new Event("touchstart", { bubbles: true })),
        wheel: () => new WheelEvent("wheel", { bubbles: true, deltaY: 120 })
      };
      // Sent on the next tick: the overlay's window is removed by the very
      // event, so the evaluate call must already have returned.
      setTimeout(() => document.body.dispatchEvent(made[eventType]()), 0);
    }, type);
    let closed = true;
    try {
      await waitForHostCall(trial.page, "modal.close", 5000);
    } catch (error) {
      closed = false;
    }
    await sleep(300);
    await sendFakeRoll(trial.page, ROLL_CHANNEL, `t32b-${type}-2`, "After The Event");
    await sleep(1500);
    const lines1 = countSafetyLines(trial.lines);
    check(`a ${type} in the overlay closes it, logs one line naming it, and no later roll reopens it`,
      closed && (await hostCalls(trial.page, "modal.open")).length === 1 && lines1.length === 1 && lines1[0].includes(type),
      `closed ${closed}; modal.open ${(await hostCalls(trial.page, "modal.open")).length}; lines ${JSON.stringify(lines1)}`);
    await trial.context.close();
  }

  /* A click before the Owlbear SDK is ready (cold start): the overlay cannot
     close its modal yet, so it must do it the moment the SDK is ready. */
  const early = await openFakeRoom(prepareContext, base, ROLL_CHANNEL, { modalReadyDelayMs: 5000 });
  await sendFakeRoll(early.page, ROLL_CHANNEL, "t32b-early-1", "Early Roll");
  const earlyOverlay = await waitForFrame(early.page, "/owlbear-dice/overlay.html");
  await earlyOverlay.waitForFunction(() => document.readyState !== "loading", undefined, { timeout: 10000 });
  await earlyOverlay.evaluate(() => { setTimeout(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })), 0); });
  await sleep(300);
  const closedBeforeReady = (await hostCalls(early.page, "modal.close")).length;
  let closedWhenReady = true;
  try {
    await waitForHostCall(early.page, "modal.close", 12000);
  } catch (error) {
    closedWhenReady = false;
  }
  check("a click before the Owlbear SDK is ready closes the overlay as soon as it is ready",
    closedBeforeReady === 0 && closedWhenReady && countSafetyLines(early.lines).length === 1,
    `closed before ready: ${closedBeforeReady}; closed once ready: ${closedWhenReady}`);
  await early.context.close();
}

/* ── Phase C: the builder's own dice tray ───────────────────────────── */

const TRAY_ORDER = [20, 12, 100, 10, 8, 6, 4];

async function phaseC(browser, base) {
  section(`C. Builder dice tray (${liveBuilder ? "LIVE builder with the stage-1 engine" : "stage 2"})`);
  if (!liveBuilder) {
    /* Task 032b (032 audit finding 4): a returning browser would keep the old
       tray (old d100 label) for up to ten minutes if index.html kept the
       previous bundle token.
       Task 038 item 16 (03xb audit): the old exact pin failed on a correct bump
       and passed on a forgotten one. The build now derives the token from the
       bundle's content (scripts/bundle-token.mjs), so this checks that the
       token in index.html belongs to the bundle on disk: it fails when the
       bundle changed but index.html kept the old token. */
    const indexHtml = await readFile(path.join(servedRoot, "index.html"), "utf8");
    const bundleText = await readFile(path.join(servedRoot, "assets", "app.bundle.js"), "utf8");
    const bundleToken = readBundleToken(indexHtml);
    const expectedToken = bundleTokenFor(bundleText);
    check("index.html loads the app bundle with the token of the bundle on disk (stage 2)", bundleToken === expectedToken,
      `index.html has ?v=${bundleToken || "(none)"}, the bundle on disk needs ?v=${expectedToken} (run npm run build and commit index.html with the bundle)`);
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    const original = Math.random.bind(Math);
    window.__t32Queue = [];
    Math.random = function () {
      return window.__t32Queue.length ? window.__t32Queue.shift() : original();
    };
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      return window.__t32NoPreview ? "" : toDataURL.apply(this, args);
    };
    // A weak device: timers lag. Measured here under load, the 70 ms
    // rolling-text timer's 10 ticks stretched past the settle (3.5 s); the
    // no-preview rolls run it at 420 ms so that case is tested every time.
    const setIntervalOriginal = window.setInterval.bind(window);
    window.setInterval = function (handler, delay, ...rest) {
      return setIntervalOriginal(handler, window.__t32NoPreview && delay === 70 ? 420 : delay, ...rest);
    };
  });
  const page = await context.newPage();
  const warnings = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "warn") {
      warnings.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${base}/`, { waitUntil: "load", timeout: 30000 });
  const humanId = await page.evaluate(() => (window.LYRIAN_DETAIL_DATA?.races || []).find((race) => race.name?.trim() === "Human")?.id || "");
  await page.evaluate((selectedRaceId) => {
    localStorage.clear();
    localStorage.setItem("lyrian-chronicles-character-suite-v2", JSON.stringify({
      ui: { mode: "builder", builderStep: 6, gameVersion: "0.13.1" },
      fields: { Name: "Dice Display Test" },
      builder: { selectedRaceId }
    }));
  }, humanId);
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.click("#builder-sheet-shortcut-top");
  await page.waitForSelector("[data-dice-toggle]", { timeout: 15000 });
  await page.click("[data-dice-toggle]");
  if (await page.locator("[data-dice-use]").isVisible().catch(() => false)) {
    await page.click("[data-dice-use]");
  }
  await page.waitForSelector('[data-dice-add="100"]', { timeout: 10000 });

  // Warm-up roll: the first tray roll loads the 3D runtime. Then count every
  // settle, so each check reads its own roll and never the previous one.
  await page.click('[data-dice-add="6"]');
  await page.click("[data-dice-roll]");
  await page.waitForFunction(() => /^settled/.test(window.LyrianWorkshopDiceRoller?.getStatus?.().status || ""), undefined, { timeout: 30000 });
  await page.evaluate(() => {
    const roller = window.LyrianWorkshopDiceRoller;
    const original = roller.rollDice;
    window.__t32Settles = 0;
    window.__t32Log = [];
    const log = (entry) => window.__t32Log.push(`${Math.round(performance.now())} ${entry}`);
    roller.rollDice = function (options = {}) {
      const onSettle = options.onSettle;
      log(`rollDice ${(options.results || []).map((result) => `${result.label || result.sides}=${result.value}`).join(",")} previews=${Boolean(options.capturePreviews)}`);
      return original.call(this, {
        ...options,
        onSettle: (settled) => {
          log(`settle ${settled.map((entry) => `${entry.die}:${entry.requested}:${entry.previewDataUrl ? "pic" : "nopic"}`).join(",")}`);
          try {
            if (typeof onSettle === "function") {
              onSettle(settled);
            }
          } finally {
            window.__t32Settles += 1;
          }
        }
      });
    };
    const face = document.getElementById("roll-overlay-face");
    new MutationObserver(() => log(`face "${face.textContent}"`)).observe(face, { childList: true, characterData: true, subtree: true });
  });

  async function rollTray(dice, { noPreview = false } = {}) {
    if (await page.locator("[data-dice-reset]").isEnabled().catch(() => false)) {
      await page.click("[data-dice-reset]");
    }
    const ordered = [...dice].sort((a, b) => TRAY_ORDER.indexOf(a.sides) - TRAY_ORDER.indexOf(b.sides));
    for (const die of ordered) {
      await page.click(`[data-dice-add="${die.sides}"]`);
    }
    const total = ordered.reduce((sum, die) => sum + die.value, 0);
    const settlesBefore = await page.evaluate(({ randoms, noPreviewFlag }) => {
      const before = window.__t32Settles;
      window.__t32Log = [];
      window.__t32NoPreview = noPreviewFlag;
      window.__t32Queue.push(...randoms);
      document.querySelector("[data-dice-roll]").click();
      return before;
    }, { randoms: ordered.map((die) => (die.value - 0.5) / die.sides), noPreviewFlag: noPreview });
    await page.waitForFunction((expected) => (document.getElementById("roll-overlay-total")?.textContent || "").trim() === `Total ${expected}`, total, { timeout: 15000 });
    await page.waitForFunction((before) => window.__t32Settles > before, settlesBefore, { timeout: 20000 });
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => ({
      settled: (window.LyrianWorkshopDiceRoller.getStatus().settledResults || []).map((entry) => ({ die: entry.die, requested: entry.requested, topFace: entry.topFace, matched: entry.matched })),
      face: document.getElementById("roll-overlay-face")?.textContent?.trim() || "",
      total: document.getElementById("roll-overlay-total")?.textContent?.trim() || "",
      alts: [...document.querySelectorAll("#roll-dice-preview-grid img")].map((image) => image.alt),
      log: (window.__t32Log || []).slice(-14).join(" | ")
    }));
    await page.evaluate(() => { window.__t32NoPreview = false; });
    return { ...state, expectedTotal: total };
  }

  const table = [];
  for (const value of PERCENTILE_CASES) {
    const state = await rollTray([{ sides: 100, value }]);
    const shown = state.settled.map((entry) => entry.requested).join("|");
    const [tens, ones] = expectedPercentile(value).split("|");
    table.push(`${value} -> ${shown.replace("|", " + ")}`);
    if (liveBuilder) {
      const onesOk = shown.split("|")[1] === ones;
      const tensOk = value < 10 || shown.split("|")[0] === tens;
      check(`live builder tray d100 ${value} still rolls (total right, ones ${ones}${value < 10 ? "" : `, tens ${tens}`})`, state.total === `Total ${value}` && onesOk && tensOk,
        `${shown.replace("|", " + ")}`);
    } else {
      check(`builder tray d100 ${value} shows ${tens} + ${ones}`, shown === `${tens}|${ones}` && state.total === `Total ${value}`, `${shown.replace("|", " + ")}; ${state.total}`);
      const tensAlt = state.alts.find((alt) => alt.startsWith("d00 ")) || "";
      check(`builder tray d100 ${value}: the tens picture is labelled "d00 ${tens}"`, tensAlt === `d00 ${tens}`, state.alts.join(", "));
    }
  }
  note(`${liveBuilder ? "LIVE" : "Stage-2"} builder tray d100 faces (result -> tens + ones)`, table.join("; "));

  const mixed = [];
  for (const dice of [[{ sides: 10, value: 3 }], [{ sides: 12, value: 9 }], [{ sides: 20, value: 17 }], [{ sides: 8, value: 6 }], [{ sides: 100, value: 7 }], [{ sides: 20, value: 6 }, { sides: 12, value: 11 }, { sides: 100, value: 64 }, { sides: 10, value: 10 }]]) {
    const state = await rollTray(dice);
    mixed.push(state.settled.map((entry) => `${entry.die}:${entry.requested}${entry.matched ? "" : "(unmatched)"}`).join(" "));
  }
  const mismatchWarnings = warnings.filter((text) => text.includes("top-face mismatch"));
  check(`no "top-face mismatch" console warning on ${PERCENTILE_CASES.length + mixed.length} settled d8/d10/d12/d20/d100 tray rolls`, mismatchWarnings.length === 0,
    `${mismatchWarnings.length} warnings; rolls: ${mixed.join(" / ")}`);

  const noPreview20 = await rollTray([{ sides: 20, value: 17 }], { noPreview: true });
  const noPictures = (state) => /settle [^|]*nopic/.test(state.log) && !/settle [^|]*:pic/.test(state.log);
  check("the no-preview rolls really had no preview pictures", noPictures(noPreview20), noPreview20.log);
  check("with no preview pictures (weak GPU), a d20 of 17 prints 17", noPreview20.face === "17", `printed "${noPreview20.face}"; settled ${JSON.stringify(noPreview20.settled)}; ${noPreview20.log}`);
  const noPreview100 = await rollTray([{ sides: 100, value: 7 }], { noPreview: true });
  if (liveBuilder) {
    note("LIVE builder, no previews, d100 of 7 prints", `"${noPreview100.face}" (tens label fix is stage 2)`);
  } else {
    check("with no preview pictures, a d100 of 7 prints 00 + 7, and it stays (no late overwrite)", noPreview100.face === "00 + 7" && noPictures(noPreview100),
      `printed "${noPreview100.face}"; ${noPreview100.log}`);
  }
  const noPreview12 = await rollTray([{ sides: 12, value: 5 }], { noPreview: true });
  check("with no preview pictures, a d12 of 5 prints 5", noPreview12.face === "5", `printed "${noPreview12.face}"`);
  check("builder page had no page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  await context.close();
}

async function main() {
  console.log(`Task 032 dice display test. Serving ${servedRoot}${liveBuilder ? " (LIVE builder mode)" : ""}.`);
  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  console.log(`Test server on port ${port} (pid ${server.pid}).`);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const phases = [["A", phaseA], ["B", phaseB], ["B6", phaseB6], ["C", phaseC]];
    for (const [name, run] of phases) {
      if (!only.has(name)) {
        continue;
      }
      try {
        await run(browser, base);
      } catch (error) {
        check(`phase ${name} ran to the end`, false, error?.stack?.split("\n").slice(0, 3).join(" ") || String(error));
      }
    }
  } finally {
    await browser?.close();
    server.kill();
  }
  console.log(`\n[TASK 032 DICE DISPLAY] ${passed} passed, ${failed} failed.`);
  if (failed) {
    console.log(`Failed: ${failures.join(" | ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[TASK 032 DICE DISPLAY FAILURE]", error);
  process.exit(1);
});
