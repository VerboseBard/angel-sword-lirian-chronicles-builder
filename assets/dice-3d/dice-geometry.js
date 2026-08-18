/*
 * Lyrian Dice Geometry - the single source of truth shared by the Dice Roller
 * Lab and the Skin Pack Builder.
 *
 * The contract: the builder fits art against these polygons, the exporter
 * bakes art against these polygons, and the roller maps the baked textures
 * back onto these same polygons. If a shape changes here, every tool stays
 * in agreement automatically.
 *
 * This file must stay dependency-free (no Three.js) so the builder page and
 * Node test scripts can load it too.
 */
(function (root) {
  "use strict";

  const CONTRACT_VERSION = "2.0.0";

  const DIE_FACE_KEYS = {
    d4: ["face-1", "face-2", "face-3", "face-4"],
    d6: ["1", "2", "3", "4", "5", "6"],
    d8: ["1", "2", "3", "4", "5", "6", "7", "8"],
    d10: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    d100: ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"],
    d12: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    d20: [
      "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
      "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"
    ]
  };

  const FACE_SHAPES = {
    d4: "triangle",
    d6: "square",
    d8: "triangle",
    d10: "kite",
    d100: "kite",
    d12: "pentagon",
    d20: "triangle"
  };

  function dieKeyForSides(sides) {
    const value = Number(sides);
    if (value === 100) {
      return "d100";
    }
    const key = `d${value}`;
    return FACE_SHAPES[key] ? key : "";
  }

  // --- tiny plain-array vector helpers -------------------------------------

  function vSub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function vAdd(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function vScale(a, s) {
    return [a[0] * s, a[1] * s, a[2] * s];
  }

  function vDot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function vCross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function vLength(a) {
    return Math.sqrt(vDot(a, a));
  }

  function vNormalize(a) {
    const len = vLength(a) || 1;
    return vScale(a, 1 / len);
  }

  // --- kite proportions measured from the real d10 solid -------------------
  // The roller builds a pentagonal trapezohedron with poles at +/-1 and two
  // rings of five vertices at radius 1. One kite face is: the pole, two
  // adjacent upper-ring vertices (the wings), and the lower-ring vertex
  // between them (the tail). The face polygon below uses the true aspect of
  // that kite so art is never stretched between builder and die.
  const KITE = (function () {
    const cos36 = Math.cos(Math.PI / 5);
    const ringY = (1 - cos36) / (1 + cos36);
    const apex = [0, 1, 0];
    const wingA = [1, ringY, 0];
    const wingB = [Math.cos((Math.PI * 2) / 5), ringY, Math.sin((Math.PI * 2) / 5)];
    const tail = [Math.cos(Math.PI / 5), -ringY, Math.sin(Math.PI / 5)];
    const axis = vSub(tail, apex);
    const axisLength = vLength(axis);
    const axisUnit = vScale(axis, 1 / axisLength);
    return {
      // width / length of the kite silhouette
      aspect: vLength(vSub(wingB, wingA)) / axisLength,
      // how far down the apex->tail axis the wings sit (0..1)
      wingT: vDot(vSub(wingA, apex), axisUnit) / axisLength
    };
  })();

  /*
   * facePolygon(dieKey, size)
   *
   * Returns the face outline as [{x, y}, ...] inside a size x size canvas,
   * y-down, with the polygon's "art up" reference point at index 0:
   * - triangle: apex top-center, then bottom-right, bottom-left
   * - square:   top-left corner, clockwise
   * - kite:     pole point top-center, right wing, tail, left wing
   * - pentagon: top point, clockwise
   */
  function facePolygon(dieKey, size = 1) {
    const shape = FACE_SHAPES[dieKey] || "triangle";
    let points;
    if (shape === "square") {
      const m = 0.06;
      points = [[m, m], [1 - m, m], [1 - m, 1 - m], [m, 1 - m]];
    } else if (shape === "kite") {
      const top = 0.03;
      const length = 1 - top * 2;
      const half = (KITE.aspect * length) / 2;
      const wingY = top + KITE.wingT * length;
      points = [
        [0.5, top],
        [0.5 + half, wingY],
        [0.5, 1 - top],
        [0.5 - half, wingY]
      ];
    } else if (shape === "pentagon") {
      const radius = 0.44;
      // Shift down slightly so the pentagon's bounding box is centered.
      const cy = 0.5 + (radius * (1 - Math.cos(Math.PI / 5))) / 2;
      points = [0, 1, 2, 3, 4].map((k) => {
        const angle = (Math.PI * 2 * k) / 5;
        return [0.5 + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
      });
    } else {
      // Equilateral triangle, bounding box centered.
      const width = 0.94;
      const height = (width * Math.sqrt(3)) / 2;
      const top = (1 - height) / 2;
      points = [
        [0.5, top],
        [0.5 + width / 2, top + height],
        [0.5 - width / 2, top + height]
      ];
    }
    return points.map(([x, y]) => ({ x: x * size, y: y * size }));
  }

  function polygonCentroid(points) {
    return points.reduce(
      (center, point) => ({
        x: center.x + point.x / points.length,
        y: center.y + point.y / points.length
      }),
      { x: 0, y: 0 }
    );
  }

  /*
   * D4 corner contract.
   *
   * The d4 is vertex-read: the result is the vertex pointing up. Art key
   * "face-k" is the physical panel OPPOSITE vertex k (the panel the die
   * rests on when k is rolled). Each corner of a panel touches one vertex,
   * and the artwork must show that vertex's number at that corner.
   *
   * This table says, for each panel, which number belongs at the apex,
   * bottom-right, and bottom-left corner of the triangle guide. The builder
   * overlays these numbers on the d4 guides, and the roller's procedural
   * fallback uses the same table, so geometry and art always agree.
   */
  const D4_FACE_CORNERS = (function () {
    const verts = [
      [1, 1, 1],
      [-1, -1, 1],
      [-1, 1, -1],
      [1, -1, -1]
    ];
    const table = {};
    for (let k = 0; k < 4; k += 1) {
      const contained = [0, 1, 2, 3].filter((index) => index !== k);
      const center = vScale(
        contained.reduce((sum, index) => vAdd(sum, verts[index]), [0, 0, 0]),
        1 / 3
      );
      const normal = vNormalize(vScale(verts[k], -1));
      const apexIndex = contained[0];
      const up = vNormalize(vSub(verts[apexIndex], center));
      const right = vCross(up, normal);
      const others = contained.slice(1);
      const sideA = vDot(vSub(verts[others[0]], center), right);
      const sideB = vDot(vSub(verts[others[1]], center), right);
      const rightIndex = sideA >= sideB ? others[0] : others[1];
      const leftIndex = sideA >= sideB ? others[1] : others[0];
      table[`face-${k + 1}`] = {
        apex: String(apexIndex + 1),
        right: String(rightIndex + 1),
        left: String(leftIndex + 1)
      };
    }
    return table;
  })();

  const api = {
    CONTRACT_VERSION,
    DIE_FACE_KEYS,
    FACE_SHAPES,
    KITE,
    D4_FACE_CORNERS,
    dieKeyForSides,
    facePolygon,
    polygonCentroid
  };

  root.LyrianDiceGeometry = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);

