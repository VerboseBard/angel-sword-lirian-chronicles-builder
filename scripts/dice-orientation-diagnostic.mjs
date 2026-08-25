/* Numeric orientation diagnostic: for every die type and every face, apply
   the engine's own final settle quaternion and measure the angle between the
   face's settled art-up direction and screen-up. 0deg = numeral upright,
   180deg = numeral upside down, +/-90deg = sideways.
   Run: node scripts/dice-orientation-diagnostic.mjs */

import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const port = 4216;
const baseUrl = `http://127.0.0.1:${port}`;

async function main() {
  const server = fork(path.join(root, "scripts", "server.mjs"), {
    cwd: root,
    env: { ...process.env, LYRIAN_PORT: String(port), LYRIAN_NO_OPEN: "1" },
    silent: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("server start timeout")), 10000);
      server.stdout.on("data", (chunk) => {
        if (String(chunk).includes(`:${port}/`)) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.once("exit", (code) => reject(new Error(`server exited ${code}`)));
    });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/dice-face-audit.html?set=new-angelsword&die=d6`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 60000 });
    const report = await page.evaluate(() => {
      const roller = window.LyrianAccurateDiceRoller;
      const THREE = window.THREE;
      const palette = { id: "new-angelsword", shell: "#ffffff", shell2: "#222222", edge: "#888888", glow: "#ffffff" };
      const plans = [
        { sides: 4, values: [1, 2, 3, 4] },
        { sides: 6, values: [1, 2, 3, 4, 5, 6] },
        { sides: 8, values: [1, 2, 3, 4, 5, 6, 7, 8] },
        { sides: 10, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
        { sides: 12, values: Array.from({ length: 12 }, (_, i) => i + 1) },
        { sides: 20, values: Array.from({ length: 20 }, (_, i) => i + 1) },
        { sides: 100, values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] }
      ];
      const internals = roller.__testInternals || null;
      const out = { hasInternals: Boolean(internals), dice: [] };
      if (!internals) {
        return out;
      }
      const { createDie, finalQuaternionForDie } = internals;
      const up = new THREE.Vector3(0, 1, 0);
      const screenUp = new THREE.Vector3(0, 0, -1);
      const yawOf = (vector) => THREE.MathUtils.radToDeg(Math.atan2(
        new THREE.Vector3().crossVectors(screenUp, vector).dot(up),
        screenUp.dot(vector)
      ));
      for (const plan of plans) {
        const rows = [];
        for (const value of plan.values) {
          const die = createDie(plan.sides, value, palette);
          const quat = finalQuaternionForDie(die);
          const data = die.userData;
          const artUp = data.faceArtUps[data.resultIndex].clone().applyQuaternion(quat).projectOnPlane(up).normalize();
          const normalUp = data.readMode === "vertex"
            ? data.vertexNormals[data.resultIndex].clone().applyQuaternion(quat).dot(up)
            : data.faceNormals[data.resultIndex].clone().applyQuaternion(quat).dot(up);
          /* Paint truth: the direction the PAINTED art's top actually points —
             from the face centroid toward the apex vertex the panel's UV
             projection sends to canvas-top. If this diverges from faceArtUps,
             the engine aligns a vector the paint never used. */
          const faceIndexes = data.faceIndexes[data.resultIndex];
          const center = faceIndexes
            .reduce((sum, index) => sum.add(data.unitVertices[index].clone()), new THREE.Vector3())
            .multiplyScalar(1 / faceIndexes.length);
          let apexIndex = faceIndexes[0];
          if (plan.sides === 10 || plan.sides === 100) {
            const pole = faceIndexes.find((index) => index === 0 || index === 1);
            apexIndex = typeof pole === "number" ? pole : faceIndexes[0];
          } else if (plan.sides === 4) {
            apexIndex = Math.min(...faceIndexes);
          }
          const paintUp = data.unitVertices[apexIndex].clone().sub(center)
            .projectOnPlane(data.faceNormals[data.resultIndex]).normalize()
            .applyQuaternion(quat).projectOnPlane(up).normalize();
          rows.push({
            value,
            label: data.resultLabel,
            yawDeg: Math.round(yawOf(artUp)),
            paintYawDeg: Math.round(yawOf(paintUp)),
            apexIndex,
            facingUp: Number(normalUp.toFixed(4))
          });
        }
        out.dice.push({ sides: plan.sides, rows });
      }
      return out;
    });
    if (!report.hasInternals) {
      console.log("NO __testInternals hook exposed — need to add one to shared-dice-roller-core.js");
    } else {
      for (const die of report.dice) {
        const bad = die.rows.filter((row) => Math.abs(row.paintYawDeg) > 20 || row.facingUp < 0.99);
        console.log(`d${die.sides}: ${die.rows.map((row) => `${row.label}[apex${row.apexIndex}]:art${row.yawDeg}/paint${row.paintYawDeg}`).join(" ")}${bad.length ? `  <-- ${bad.length} PAINT-OFF` : "  paint upright"}`);
      }
    }
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
