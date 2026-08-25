/*
 * Lyrian Accurate Dice Roller - clean engine.
 *
 * How a roll works: the result is chosen up front (random or forced), then
 * the die is animated tumbling in and settling into an orientation that
 * genuinely shows that result. Settle poses are physical: the result face is
 * horizontal on top and the die rests flat on the floor (the d4 rests on the
 * panel opposite the result vertex, point up).
 *
 * Face art contract: textures are drawn against the exact same face polygons
 * the Skin Pack Builder uses (shared via dice-geometry.js). Exported packs
 * are baked against those polygons, so imported art maps 1:1 here with no
 * per-die correction factors.
 *
 * Texture sources, in order: imported skin pack art (via DiceSkinStudio),
 * otherwise a procedural fallback face with the number drawn on.
 */
(function () {
  "use strict";

  const DIE_TYPES = {
    4: "d4",
    6: "d6",
    8: "d8",
    10: "d10",
    12: "d12",
    20: "d20",
    100: "d00"
  };

  const ROLLER_VERSION = "dice-lab-scripted-side-entry-27-rana-d4-reverted";

  /* Dice whose result face is aimed at the camera at rest (owner contract:
     "what is on the dice is what's shown"). d4 reads at a corner and d6's
     top face is already fully legible from the table camera, so both keep
     the classic pose. */
  const FACE_TOWARD_VIEWER_SIDES = new Set([8, 10, 12, 20, 100]);

  const DEFAULT_PALETTE = {
    id: "angels-sword",
    shell: 0xf4e8d2,
    shell2: 0x173a66,
    face: "#f4e8d2",
    center: "#fff6e8",
    pearl: "#fffaf0",
    trim: "#d8a441",
    edge: 0xd8a441,
    accent: "#77c6dc",
    accent2: "#173a66",
    number: "#9b6a24",
    glow: 0x71d1ff
  };

  let activeRoll = null;
  let lastStatus = "idle";
  let lastMotionMode = "idle";
  let lastSettledResults = [];
  const skinTextureCache = new Map();
  const faceImageCache = new Map();

  function geo() {
    return window.LyrianDiceGeometry;
  }

  function hasRuntime() {
    return Boolean(window.THREE && window.LyrianDiceGeometry);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function crispPixelRatio() {
    // Supersample even on a 1x desktop display. The character-sheet dice are
    // intentionally compact, so native 1x WebGL softened numbers and trim.
    return Math.min(2.5, Math.max(1.5, Number(window.devicePixelRatio) || 1));
  }

  function configureRendererColor(renderer) {
    const THREE = window.THREE;
    // Face canvases are authored in sRGB. Three r124 decodes those textures
    // to linear light, so the renderer must encode the finished frame back to
    // sRGB. Without this, browser-displayed previews and live rolls look much
    // darker and less vivid than the exact same face canvas shown directly.
    if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ("outputEncoding" in renderer && THREE.sRGBEncoding) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
  }

  function easeOutCubic(value) {
    const t = clamp(value, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function easeOutQuint(value) {
    const t = clamp(value, 0, 1);
    return 1 - Math.pow(1 - t, 5);
  }

  function hexToRgba(hexColor, alpha = 1) {
    const hex = String(hexColor || "#ffffff").replace("#", "");
    const full = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex.padEnd(6, "0").slice(0, 6);
    const value = Number.parseInt(full, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getTheme(setId) {
    const key = String(setId || "").toLowerCase();
    const studioPalette = window.DiceSkinStudio?.getPalette?.(key) || {};
    const palette = { ...DEFAULT_PALETTE, ...studioPalette, id: key || DEFAULT_PALETTE.id };
    if (key === "new-angelsword") {
      // The face paintings already contain ivory panels. Keep the exposed
      // solid, seams, and silhouette metallic gold so a small live die never
      // develops a pale/white rim between its painted panels.
      return {
        ...palette,
        shell: 0xd89a2f,
        shell2: 0x71420d,
        trim: "#f0c65d",
        edge: 0xffe28b,
        glow: 0x91e5ff
      };
    }
    if (key === "rana-full-set") {
      // Rana's painted faces intentionally use deep bottle green, but the
      // original solid and glow values disappeared against the dark play
      // sheet. Preserve the artwork and gold/ivory numbering while lifting
      // the exposed resin, teal inlays, and rim light into a vivid emerald.
      return {
        ...palette,
        shell: 0x126b5b,
        shell2: 0x21b7a4,
        face: "#105c50",
        center: "#137064",
        pearl: "#1a8878",
        trim: "#d6aa62",
        edge: 0xe2b967,
        accent: "#21c8b5",
        accent2: "#35e0c9",
        gem: "#35e0c9",
        glow: 0x49f1d5
      };
    }
    return palette;
  }

  // --- on-screen sizing (carried over from the approved sprite matching) ---

  function getPrettyDicePixelTarget(count, width, height) {
    const density = count > 14 ? 0.48 : count > 8 ? 0.58 : count > 4 ? 0.68 : count > 2 ? 0.82 : 1;
    const min = count > 4 ? 82 : 104;
    const max = count > 8 ? 126 : count > 4 ? 136 : 180;
    return clamp(Math.min(width, height) * 0.16 * density, min, max);
  }

  function getWorldScaleForPixelTarget(targetPixels, camera, height, floorY, viewDepth) {
    const THREE = window.THREE;
    const targetCenter = new THREE.Vector3(0, floorY + 0.65, -viewDepth * 0.18);
    const distance = camera.position.distanceTo(targetCenter);
    const fovRadians = (camera.fov * Math.PI) / 180;
    const worldHeightAtTarget = 2 * Math.tan(fovRadians / 2) * distance;
    const worldUnitsPerPixel = worldHeightAtTarget / Math.max(1, height);
    // Dice geometry is normalized to a 2-unit diameter.
    return (targetPixels * worldUnitsPerPixel) / 2;
  }

  // --- solid geometry ---

  function vectorFromArray(point) {
    return new window.THREE.Vector3(point[0], point[1], point[2]);
  }

  function averagePoints(points) {
    const THREE = window.THREE;
    const center = new THREE.Vector3();
    points.forEach((point) => center.add(point));
    return center.multiplyScalar(1 / Math.max(1, points.length));
  }

  function orderFaceIndexes(indexes, vertices, normal) {
    const THREE = window.THREE;
    const points = indexes.map((index) => vertices[index]);
    const center = averagePoints(points);
    const u = points[0].clone().sub(center).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    return [...indexes].sort((a, b) => {
      const pa = vertices[a].clone().sub(center);
      const pb = vertices[b].clone().sub(center);
      const angleA = Math.atan2(pa.dot(v), pa.dot(u));
      const angleB = Math.atan2(pb.dot(v), pb.dot(u));
      return angleA - angleB;
    });
  }

  function buildConvexFaces(vertices) {
    const THREE = window.THREE;
    const faces = new Map();
    const epsilon = 0.00008;

    for (let a = 0; a < vertices.length - 2; a += 1) {
      for (let b = a + 1; b < vertices.length - 1; b += 1) {
        for (let c = b + 1; c < vertices.length; c += 1) {
          const ab = vertices[b].clone().sub(vertices[a]);
          const ac = vertices[c].clone().sub(vertices[a]);
          const normal = new THREE.Vector3().crossVectors(ab, ac);
          if (normal.lengthSq() < epsilon) {
            continue;
          }
          normal.normalize();

          let positive = 0;
          let negative = 0;
          vertices.forEach((point) => {
            const distance = normal.dot(point.clone().sub(vertices[a]));
            if (distance > epsilon) {
              positive += 1;
            } else if (distance < -epsilon) {
              negative += 1;
            }
          });
          if (positive && negative) {
            continue;
          }

          const coplanar = vertices
            .map((point, index) => ({
              index,
              distance: Math.abs(normal.dot(point.clone().sub(vertices[a])))
            }))
            .filter((entry) => entry.distance < epsilon)
            .map((entry) => entry.index);
          const key = [...coplanar].sort((x, y) => x - y).join("-");
          if (faces.has(key)) {
            continue;
          }

          const faceCenter = averagePoints(coplanar.map((index) => vertices[index]));
          if (normal.dot(faceCenter) < 0) {
            normal.multiplyScalar(-1);
          }
          faces.set(key, {
            indexes: orderFaceIndexes(coplanar, vertices, normal),
            normal
          });
        }
      }
    }

    return [...faces.values()].sort((left, right) => {
      const la = averagePoints(left.indexes.map((index) => vertices[index]));
      const ra = averagePoints(right.indexes.map((index) => vertices[index]));
      return (ra.z - la.z) || (ra.y - la.y) || (ra.x - la.x);
    });
  }

  function normalizeVertices(points, radius = 1) {
    const vertices = points.map(vectorFromArray);
    const center = averagePoints(vertices);
    vertices.forEach((vertex) => vertex.sub(center));
    const maxLength = Math.max(...vertices.map((vertex) => vertex.length()), 1);
    return vertices.map((vertex) => vertex.multiplyScalar(radius / maxLength));
  }

  function makeD10Vertices(radius = 1) {
    const THREE = window.THREE;
    const points = [];
    const ringRadius = 1;
    const poleHeight = 1;
    const cos36 = Math.cos(Math.PI / 5);
    const ringHeight = poleHeight * (1 - cos36) / (1 + cos36);
    points.push(new THREE.Vector3(0, poleHeight, 0));
    points.push(new THREE.Vector3(0, -poleHeight, 0));
    for (let index = 0; index < 5; index += 1) {
      const upperAngle = (Math.PI * 2 * index) / 5;
      const lowerAngle = upperAngle + Math.PI / 5;
      points.push(new THREE.Vector3(Math.cos(upperAngle) * ringRadius, ringHeight, Math.sin(upperAngle) * ringRadius));
      points.push(new THREE.Vector3(Math.cos(lowerAngle) * ringRadius, -ringHeight, Math.sin(lowerAngle) * ringRadius));
    }
    const maxLength = Math.max(...points.map((point) => point.length()), 1);
    return points.map((point) => point.multiplyScalar(radius / maxLength));
  }

  function getDieVertices(sides) {
    const phi = (1 + Math.sqrt(5)) / 2;
    if (sides === 4) {
      return normalizeVertices([
        [1, 1, 1],
        [-1, -1, 1],
        [-1, 1, -1],
        [1, -1, -1]
      ]);
    }
    if (sides === 6) {
      return normalizeVertices([-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [x, y, z]))));
    }
    if (sides === 8) {
      return normalizeVertices([
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1]
      ]);
    }
    if (sides === 10 || sides === 100) {
      return makeD10Vertices();
    }
    if (sides === 12) {
      return normalizeVertices([
        [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
        [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
        [0, -1 / phi, -phi], [0, -1 / phi, phi], [0, 1 / phi, -phi], [0, 1 / phi, phi],
        [-1 / phi, -phi, 0], [-1 / phi, phi, 0], [1 / phi, -phi, 0], [1 / phi, phi, 0],
        [-phi, 0, -1 / phi], [-phi, 0, 1 / phi], [phi, 0, -1 / phi], [phi, 0, 1 / phi]
      ]);
    }
    return normalizeVertices([
      [0, -1, -phi], [0, -1, phi], [0, 1, -phi], [0, 1, phi],
      [-1, -phi, 0], [-1, phi, 0], [1, -phi, 0], [1, phi, 0],
      [-phi, 0, -1], [phi, 0, -1], [-phi, 0, 1], [phi, 0, 1]
    ]);
  }

  function createDiceGeometry(sides) {
    const THREE = window.THREE;
    const vertices = getDieVertices(sides);
    const faces = buildConvexFaces(vertices);
    const positions = [];
    const normals = [];

    faces.forEach((face) => {
      const facePoints = face.indexes.map((index) => vertices[index]);
      const normal = face.normal.clone().normalize();
      for (let index = 1; index < facePoints.length - 1; index += 1) {
        [facePoints[0], facePoints[index], facePoints[index + 1]].forEach((point) => {
          positions.push(point.x, point.y, point.z);
          normals.push(normal.x, normal.y, normal.z);
        });
      }
      face.normal = normal;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.computeBoundingSphere();
    return { geometry, vertices, faces };
  }

  function createBoundaryEdges(vertices, faces) {
    const THREE = window.THREE;
    const seen = new Set();
    const positions = [];
    faces.forEach((face) => {
      face.indexes.forEach((from, index) => {
        const to = face.indexes[(index + 1) % face.indexes.length];
        const key = [from, to].sort((a, b) => a - b).join("-");
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        [vertices[from], vertices[to]].forEach((point) => positions.push(point.x, point.y, point.z));
      });
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }

  // --- shared 2D face layout ---
  // Everything about a face's canvas polygon that both the texture painter
  // and the UV mapper need. Index 0 of the polygon is the "art up" reference
  // point (see dice-geometry.js), so canvas-up can be expressed in the face
  // plane and settle rotations can put the art upright for the camera.

  const polygonLayoutCache = new Map();

  function getPolygonLayout(dieKey) {
    if (polygonLayoutCache.has(dieKey)) {
      return polygonLayoutCache.get(dieKey);
    }
    const polygon = geo().facePolygon(dieKey, 1);
    const centroid = geo().polygonCentroid(polygon);
    const apexOffset = { x: polygon[0].x - centroid.x, y: polygon[0].y - centroid.y };
    const apexDistance = Math.hypot(apexOffset.x, apexOffset.y) || 1;
    const up2 = { x: apexOffset.x / apexDistance, y: apexOffset.y / apexDistance };
    // Canvas y points down, so screen-right is up2 rotated 90 degrees: (-y, x).
    const right2 = { x: -up2.y, y: up2.x };
    const layout = {
      polygon,
      centroid,
      apexDistance,
      up2,
      right2,
      // Decompose canvas-up (0,-1) in the polygon frame. The matching world
      // direction (alpha * faceUp + beta * faceRight) is where the top of the
      // artwork points on the 3D face.
      artUpAlpha: -up2.y,
      artUpBeta: -right2.y
    };
    polygonLayoutCache.set(dieKey, layout);
    return layout;
  }

  function getFaceApexVertexIndex(face, sides) {
    if (sides === 10 || sides === 100) {
      const pole = face.indexes.find((index) => index === 0 || index === 1);
      return typeof pole === "number" ? pole : face.indexes[0];
    }
    if (sides === 4) {
      return Math.min(...face.indexes);
    }
    return face.indexes[0];
  }

  function getFaceFrame(face, vertices, sides, dieKey) {
    const THREE = window.THREE;
    const points = face.indexes.map((index) => vertices[index]);
    const center = averagePoints(points);
    const normal = face.normal.clone().normalize();
    const apexIndex = getFaceApexVertexIndex(face, sides);
    const up = vertices[apexIndex].clone().sub(center).projectOnPlane(normal).normalize();
    const right = new THREE.Vector3().crossVectors(up, normal).normalize();
    const layout = getPolygonLayout(dieKey);
    const artUp = up.clone().multiplyScalar(layout.artUpAlpha)
      .add(right.clone().multiplyScalar(layout.artUpBeta))
      .normalize();
    return { center, normal, up, right, artUp, apexIndex };
  }

  // --- face textures ---

  function getImageState(src) {
    if (faceImageCache.has(src)) {
      return faceImageCache.get(src);
    }
    const image = new Image();
    let resolveReady = () => {};
    const readyPromise = new Promise((resolve) => {
      resolveReady = resolve;
    });
    const state = {
      image,
      ready: false,
      failed: false,
      callbacks: [],
      readyPromise
    };
    image.onload = () => {
      state.ready = true;
      const callbacks = [...state.callbacks];
      state.callbacks.length = 0;
      callbacks.forEach((callback) => callback(state));
      resolveReady(true);
    };
    image.onerror = () => {
      state.failed = true;
      state.callbacks.length = 0;
      resolveReady(false);
    };
    image.src = src;
    faceImageCache.set(src, state);
    return state;
  }

  function drawPolygonPath(context, points) {
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.closePath();
  }

  function scalePolygon(points, scale) {
    const center = geo().polygonCentroid(points);
    return points.map((point) => ({
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale
    }));
  }

  function drawFaceBase(context, palette, size) {
    const gradient = context.createRadialGradient(size * 0.42, size * 0.34, size * 0.06, size * 0.5, size * 0.52, size * 0.72);
    gradient.addColorStop(0, palette.center);
    gradient.addColorStop(0.5, palette.pearl);
    gradient.addColorStop(1, palette.face);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }

  function drawFallbackFrame(context, polygon, palette, size) {
    context.save();
    context.lineJoin = "round";
    drawPolygonPath(context, scalePolygon(polygon, 0.86));
    context.lineWidth = size * 0.02;
    context.strokeStyle = hexToRgba(palette.trim, 0.85);
    context.stroke();
    drawPolygonPath(context, scalePolygon(polygon, 0.76));
    context.lineWidth = size * 0.006;
    context.strokeStyle = hexToRgba(palette.accent, 0.6);
    context.stroke();
    context.restore();
  }

  function drawFallbackLabel(context, label, palette, size, position, options = {}) {
    const safeLabel = String(label || "");
    if (!safeLabel) {
      return;
    }
    const base = safeLabel.length > 2 ? 0.17 : safeLabel.length === 2 ? 0.21 : 0.27;
    const fontSize = Math.round(size * base * (options.small ? 0.52 : 1));
    context.save();
    context.translate(position.x, position.y);
    context.rotate(options.rotation || 0);
    context.font = `900 ${fontSize}px Georgia, "Times New Roman", serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = Math.max(3, fontSize * 0.11);
    context.strokeStyle = "rgba(255, 248, 226, 0.95)";
    context.strokeText(safeLabel, 0, 0);
    context.fillStyle = palette.number;
    context.fillText(safeLabel, 0, 0);
    context.lineWidth = Math.max(1, fontSize * 0.02);
    context.strokeStyle = hexToRgba(palette.trim, 0.8);
    context.strokeText(safeLabel, 0, 0);
    context.restore();
  }

  function drawD4FallbackCorners(context, artKey, palette, polygon, size) {
    const corners = geo().D4_FACE_CORNERS[artKey];
    if (!corners) {
      return;
    }
    const centroid = geo().polygonCentroid(polygon);
    [
      [corners.apex, polygon[0]],
      [corners.right, polygon[1]],
      [corners.left, polygon[2]]
    ].forEach(([label, point]) => {
      const position = {
        x: point.x + (centroid.x - point.x) * 0.3,
        y: point.y + (centroid.y - point.y) * 0.3
      };
      // Rotate each number so it reads outward toward its corner, the way a
      // physical corner-numbered d4 is printed.
      const rotation = Math.atan2(point.x - centroid.x, -(point.y - centroid.y));
      drawFallbackLabel(context, label, palette, size, position, { rotation, small: true });
    });
  }

  function getFaceArtSpec(dieKey, artKey, palette) {
    const safeArtKey = String(artKey || "");
    if (palette.id === "new-angelsword" && dieKey === "d4") {
      // Every physical panel starts from one canonical number-free painting.
      // This prevents old baked numerals and slightly different generated
      // frames from stacking beneath the authoritative corner-number layer.
      return {
        sourceKey: "blank",
        rotation: 0,
        rebuildCornerNumbers: true,
        src: window.DiceSkinStudio?.getFaceImage?.(palette.id, dieKey, "blank") || ""
      };
    }
    return {
      sourceKey: safeArtKey,
      rotation: 0,
      src: window.DiceSkinStudio?.getFaceImage?.(palette.id, dieKey, safeArtKey) || ""
    };
  }

  function drawAngelSwordD4CornerNumbers(context, artKey, size) {
    const corners = geo().D4_FACE_CORNERS[artKey];
    if (!corners) {
      return;
    }
    // The canonical source is already clean. Draw one—and only one—number at
    // each physical vertex, tucked immediately inside the blue corner inlay.
    const placements = [
      { label: corners.apex, x: 0.5, y: 0.318, rotation: 0 },
      { label: corners.right, x: 0.725, y: 0.795, rotation: (Math.PI * 2) / 3 },
      { label: corners.left, x: 0.275, y: 0.795, rotation: -(Math.PI * 2) / 3 }
    ];
    placements.forEach((placement) => {
      const x = placement.x * size;
      const y = placement.y * size;
      context.save();
      context.translate(x, y);
      context.rotate(placement.rotation);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `700 ${Math.round(size * 0.132)}px Georgia, "Times New Roman", serif`;
      context.shadowColor = "rgba(62, 34, 7, 0.42)";
      context.shadowBlur = size * 0.008;
      context.shadowOffsetY = size * 0.006;
      context.lineJoin = "round";
      context.lineWidth = size * 0.012;
      context.strokeStyle = "#6f3d08";
      context.strokeText(placement.label, 0, 0);
      const gold = context.createLinearGradient(0, -size * 0.07, 0, size * 0.07);
      gold.addColorStop(0, "#fff0a3");
      gold.addColorStop(0.28, "#f5bd3c");
      gold.addColorStop(0.62, "#cf8114");
      gold.addColorStop(1, "#8d4e08");
      context.fillStyle = gold;
      context.fillText(placement.label, 0, 0);
      context.lineWidth = size * 0.003;
      context.strokeStyle = "rgba(255, 239, 164, 0.9)";
      context.strokeText(placement.label, 0, 0);
      context.restore();
    });
  }

  function drawAngelSwordUnifiedFaceFinish(context, dieKey, size) {
    const polygon = geo().facePolygon(dieKey, size);
    const centroid = geo().polygonCentroid(polygon);
    if (dieKey === "d10" || dieKey === "d100") {
      // The supplied percentile/kite paintings contain a broad pale gutter
      // between their inner number plate and outer frame. On the assembled
      // geometry that gutter reads as a white structural rail, unlike every
      // other die in the set. Replace only that annular gutter with polished
      // gold; the ivory number plate in the center remains untouched.
      const outerGutter = scalePolygon(polygon, 0.84);
      const innerGutter = scalePolygon(polygon, 0.70);
      const trace = (points) => {
        points.forEach((point, index) => {
          if (index === 0) {
            context.moveTo(point.x, point.y);
          } else {
            context.lineTo(point.x, point.y);
          }
        });
        context.closePath();
      };
      context.save();
      context.beginPath();
      trace(outerGutter);
      trace([...innerGutter].reverse());
      const gutterGold = context.createRadialGradient(
        centroid.x - size * 0.1,
        centroid.y - size * 0.18,
        size * 0.04,
        centroid.x,
        centroid.y,
        size * 0.62
      );
      gutterGold.addColorStop(0, "#ffe29a");
      gutterGold.addColorStop(0.32, "#d8992c");
      gutterGold.addColorStop(0.67, "#8d520d");
      gutterGold.addColorStop(1, "#e6ae43");
      context.fillStyle = gutterGold;
      context.fill("evenodd");
      context.lineJoin = "round";
      [
        [outerGutter, 0.018, "rgba(83, 43, 5, 0.98)"],
        [outerGutter, 0.006, "rgba(255, 225, 126, 0.98)"],
        [innerGutter, 0.018, "rgba(83, 43, 5, 0.98)"],
        [innerGutter, 0.006, "rgba(255, 225, 126, 0.98)"]
      ].forEach(([points, width, color]) => {
        drawPolygonPath(context, points);
        context.lineWidth = size * width;
        context.strokeStyle = color;
        context.stroke();
      });
      context.restore();
    }
    const inset = polygon.map((point) => ({
      x: centroid.x + (point.x - centroid.x) * 0.965,
      y: centroid.y + (point.y - centroid.y) * 0.965
    }));
    context.save();
    context.lineJoin = "round";
    context.lineCap = "round";
    const stroke = (width, color) => {
      drawPolygonPath(context, inset);
      context.lineWidth = size * width;
      context.strokeStyle = color;
      context.stroke();
    };
    // The same three-layer polished-gold rail is applied to every geometry.
    // This deliberately covers source-to-source edge variations while leaving
    // the accepted center artwork and geometry-specific ornament untouched.
    stroke(0.036, "rgba(82, 43, 5, 0.98)");
    stroke(0.025, "rgba(211, 143, 35, 1)");
    stroke(0.011, "rgba(255, 223, 122, 0.98)");
    stroke(0.0035, "rgba(255, 250, 218, 0.95)");
    context.restore();
  }

  /* Rotation-ambiguity dot (owner directive 2026-08-25, broadened same day):
     the hand-painted Angel Sword d10 batch marks its 6 and 9 with a dot
     below the numeral; no other die or set got one. Neighbor faces on a
     settled die show at arbitrary rotations, so every numeral that reads as
     a different number upside down gets the dot, on every die of every set
     — current and future. */
  /* Owner rulings: only lone 6s and 9s are ambiguous, and only on dice
     that carry BOTH (no 9 on a d6/d8 means a rotated 6 has nothing to be
     confused with). Multi-digit faces (16, 19, percentile tens)
     self-identify — the extra digit tells you the orientation. */
  const AMBIGUOUS_FACE_KEYS = {
    d10: ["6", "9"],
    d12: ["6", "9"],
    d20: ["6", "9"]
  };

  function shouldStampSixNineDot(dieKey, artKey, palette) {
    if (!(AMBIGUOUS_FACE_KEYS[dieKey] || []).includes(String(artKey))) {
      return false;
    }
    // The Angel Sword d10 paintings already include their own dot.
    if (palette.id === "new-angelsword" && dieKey === "d10") {
      return false;
    }
    return true;
  }

  const SIX_NINE_DOT_OFFSET = { d10: 0.14, d12: 0.15, d20: 0.17 };

  function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const a = polygon[i];
      const b = polygon[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  /* The numeral position is baked into each face painting and drifts a few
     percent face to face (Workshop generation variance). Measure where the
     numeral actually is — high-contrast pixels in a narrow central column —
     so the dot hugs ITS numeral instead of assuming a fixed spot. */
  function measureNumeralBottom(context, dieKey, size) {
    const polygon = geo().facePolygon(dieKey, size);
    const centroid = geo().polygonCentroid(polygon);
    const zone = scalePolygon(polygon, 0.58);
    const halfColumn = size * 0.17;
    const data = context.getImageData(0, 0, size, size).data;
    const samples = [];
    const step = 3;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        if (Math.abs(x - centroid.x) > halfColumn || !pointInPolygon(x, y, zone)) {
          continue;
        }
        const offset = (y * size + x) * 4;
        samples.push({ x, y, r: data[offset], g: data[offset + 1], b: data[offset + 2] });
      }
    }
    if (samples.length < 60) {
      return null;
    }
    const channelMedian = (key) => {
      const sorted = samples.map((sample) => sample[key]).sort((left, right) => left - right);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const median = { r: channelMedian("r"), g: channelMedian("g"), b: channelMedian("b") };
    const outliers = samples.filter((sample) => {
      const dr = sample.r - median.r;
      const dg = sample.g - median.g;
      const db = sample.b - median.b;
      return Math.sqrt(dr * dr + dg * dg + db * db) > 88;
    });
    if (outliers.length < 30 || outliers.length > samples.length * 0.6) {
      return null;
    }
    const ys = outliers.map((sample) => sample.y).sort((left, right) => left - right);
    return ys[Math.floor(ys.length * 0.95)];
  }

  function drawSixNineDot(context, dieKey, size) {
    const polygon = geo().facePolygon(dieKey, size);
    const centroid = geo().polygonCentroid(polygon);
    const x = centroid.x;
    const measuredBottom = measureNumeralBottom(context, dieKey, size);
    const fallbackY = centroid.y + size * (SIX_NINE_DOT_OFFSET[dieKey] || 0.16);
    let y = measuredBottom === null ? fallbackY : measuredBottom + size * 0.042;
    const floor = scalePolygon(polygon, 0.66);
    const lowest = Math.max(...floor.map((point) => point.y));
    y = Math.min(y, lowest - size * 0.02);
    const radius = size * 0.021;
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = "#c9a04a";
    context.strokeStyle = "rgba(32, 22, 7, 0.85)";
    context.lineWidth = size * 0.006;
    context.fill();
    context.stroke();
    context.restore();
  }

  function makeFaceTexture(dieKey, artKey, palette) {
    const THREE = window.THREE;
    const studioVersion = window.DiceSkinStudio?.getVersion?.() || "builtin";
    const cacheKey = `${ROLLER_VERSION}:${studioVersion}:${palette.id}:${dieKey}:${artKey}`;
    if (skinTextureCache.has(cacheKey)) {
      return skinTextureCache.get(cacheKey);
    }

    const size = 768;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const polygon = geo().facePolygon(dieKey, size);
    const artSpec = getFaceArtSpec(dieKey, artKey, palette);
    const state = artSpec.src ? getImageState(artSpec.src) : null;
    let texture = null;

    const render = () => {
      context.clearRect(0, 0, size, size);
      drawFaceBase(context, palette, size);
      if (state && state.ready && !state.failed) {
        // The builder bakes each exported face against this exact polygon,
        // so imported art maps 1:1 - draw it straight over the base.
        context.save();
        // Preserve the installed pixels. Renderer output conversion below is
        // the correct color-management fix; per-set brightness filters made
        // the raw source and the settled 3D result impossible to match.
        context.filter = "none";
        if (Math.abs(artSpec.rotation) > 0.0001) {
          const pivot = geo().polygonCentroid(polygon);
          context.save();
          drawPolygonPath(context, polygon);
          context.clip();
          context.translate(pivot.x, pivot.y);
          context.rotate(artSpec.rotation);
          context.drawImage(state.image, -pivot.x, -pivot.y, size, size);
          context.restore();
        } else {
          context.drawImage(state.image, 0, 0, size, size);
        }
        context.restore();
        if (artSpec.rebuildCornerNumbers) {
          drawAngelSwordD4CornerNumbers(context, artKey, size);
        }
        if (palette.id === "new-angelsword") {
          drawAngelSwordUnifiedFaceFinish(context, dieKey, size);
        }
      } else {
        drawFallbackFrame(context, polygon, palette, size);
        if (dieKey === "d4") {
          drawD4FallbackCorners(context, artKey, palette, polygon, size);
        } else {
          drawFallbackLabel(context, artKey, palette, size, geo().polygonCentroid(polygon));
        }
      }
      if (shouldStampSixNineDot(dieKey, artKey, palette)) {
        drawSixNineDot(context, dieKey, size);
      }
      if (texture) {
        texture.needsUpdate = true;
      }
    };

    render();
    texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 16;
    texture.generateMipmaps = true;
    if (THREE.LinearMipmapLinearFilter) {
      texture.minFilter = THREE.LinearMipmapLinearFilter;
    }
    if (THREE.LinearFilter) {
      texture.magFilter = THREE.LinearFilter;
    }
    if ("colorSpace" in texture && THREE.SRGBColorSpace) {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else if ("encoding" in texture && THREE.sRGBEncoding) {
      texture.encoding = THREE.sRGBEncoding;
    }
    texture.needsUpdate = true;
    if (state && !state.ready && !state.failed) {
      state.callbacks.push(render);
    }
    skinTextureCache.set(cacheKey, texture);
    return texture;
  }

  // --- face panels (mesh + analytic UVs) ---
  // Each mesh vertex is projected into the face plane (right/up frame) and
  // mapped through the shared polygon layout, so the canvas polygon lands on
  // the physical face with no mirroring or per-die fudge factors.

  function createFacePanelGeometry(face, frame, vertices, dieKey) {
    const THREE = window.THREE;
    const layout = getPolygonLayout(dieKey);
    const apexWorldDistance = vertices[frame.apexIndex].clone().sub(frame.center).length() || 1;
    const scale = layout.apexDistance / apexWorldDistance;
    const normal = frame.normal;

    const uvFor = (point) => {
      const local = point.clone().sub(frame.center);
      const a = local.dot(frame.right);
      const b = local.dot(frame.up);
      const x = layout.centroid.x + (a * layout.right2.x + b * layout.up2.x) * scale;
      const y = layout.centroid.y + (a * layout.right2.y + b * layout.up2.y) * scale;
      return { u: x, v: 1 - y };
    };

    const positions = [];
    const normals = [];
    const uvs = [];
    const pushPoint = (point) => {
      const raised = point.clone().add(normal.clone().multiplyScalar(0.023));
      positions.push(raised.x, raised.y, raised.z);
      normals.push(normal.x, normal.y, normal.z);
      const uv = uvFor(point);
      uvs.push(uv.u, uv.v);
    };
    const pushTriangle = (pointA, pointB, pointC) => {
      const triangleNormal = new THREE.Vector3()
        .subVectors(pointB, pointA)
        .cross(new THREE.Vector3().subVectors(pointC, pointA))
        .normalize();
      if (triangleNormal.dot(normal) < 0) {
        pushPoint(pointA);
        pushPoint(pointC);
        pushPoint(pointB);
        return;
      }
      pushPoint(pointA);
      pushPoint(pointB);
      pushPoint(pointC);
    };

    const points = face.indexes.map((index) => vertices[index]);
    for (let index = 1; index < points.length - 1; index += 1) {
      pushTriangle(points[0], points[index], points[index + 1]);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    return geometry;
  }

  // --- die construction ---

  function getFaceArtKeys(faces, sides, dieKey) {
    if (sides === 4) {
      // Art key "face-k" is the panel opposite vertex k.
      return faces.map((face, index) => {
        const excluded = [0, 1, 2, 3].find((vertexIndex) => !face.indexes.includes(vertexIndex));
        return `face-${(typeof excluded === "number" ? excluded : index) + 1}`;
      });
    }
    // buildConvexFaces produces opposite index pairs (0,last), (1,last-1),
    // and so on. Sequential labels already give the conventional opposite
    // totals for d6/d8/d12/d20, but a d10 is conventionally numbered with
    // 0 opposite 5, 1 opposite 6, etc. Keep the public art keys unchanged
    // while assigning those keys to the correct physical kite faces.
    const physicalKeyOrder = {
      d10: ["0", "1", "2", "3", "4", "9", "8", "7", "6", "5"],
      d100: ["00", "10", "20", "30", "40", "90", "80", "70", "60", "50"]
    };
    const keys = physicalKeyOrder[dieKey] || geo().DIE_FACE_KEYS[dieKey] || [];
    return faces.map((face, index) => keys[index] || String(index + 1));
  }

  function validateNumberingTopology() {
    if (!hasRuntime()) {
      return {
        total: 0,
        passed: 0,
        failed: 0,
        results: [],
        error: "Three.js and the shared geometry contract must be loaded."
      };
    }

    const sidesByDie = { d6: 6, d8: 8, d10: 10, d100: 100, d12: 12, d20: 20 };
    const expectedOpposite = {
      d6: (left, right) => Number(left) + Number(right) === 7,
      d8: (left, right) => Number(left) + Number(right) === 9,
      d10: (left, right) => Math.abs(Number(left) - Number(right)) === 5,
      d100: (left, right) => Math.abs(Number(left) - Number(right)) === 50,
      d12: (left, right) => Number(left) + Number(right) === 13,
      d20: (left, right) => Number(left) + Number(right) === 21
    };
    const results = [];

    Object.entries(sidesByDie).forEach(([dieKey, sides]) => {
      const created = createDiceGeometry(sides);
      const labels = getFaceArtKeys(created.faces, sides, dieKey);
      const visited = new Set();
      created.faces.forEach((face, index) => {
        if (visited.has(index)) {
          return;
        }
        let oppositeIndex = -1;
        let oppositeDot = Infinity;
        created.faces.forEach((candidate, candidateIndex) => {
          if (candidateIndex === index) {
            return;
          }
          const dot = face.normal.dot(candidate.normal);
          if (dot < oppositeDot) {
            oppositeDot = dot;
            oppositeIndex = candidateIndex;
          }
        });
        visited.add(index);
        visited.add(oppositeIndex);
        const left = labels[index];
        const right = labels[oppositeIndex];
        const matched = oppositeIndex >= 0
          && oppositeDot < -0.999
          && expectedOpposite[dieKey](left, right);
        results.push({
          die: dieKey,
          left,
          right,
          oppositeDot,
          matched
        });
      });
      created.geometry.dispose?.();
    });

    const passed = results.filter((entry) => entry.matched).length;
    return {
      geometryContract: geo().CONTRACT_VERSION || "unversioned",
      total: results.length,
      passed,
      failed: results.length - passed,
      results
    };
  }

  function makeResultLabel(sides, value) {
    if (sides === 4) {
      return String(clamp(Math.round(Number(value) || 1), 1, 4));
    }
    if (sides === 10) {
      const v = clamp(Math.round(Number(value) || 1), 1, 10);
      return v === 10 ? "0" : String(v);
    }
    if (sides === 100) {
      const v = clamp(Math.round(Number(value) || 10), 10, 100);
      return v >= 100 ? "00" : String(Math.floor(v / 10) * 10).padStart(2, "0");
    }
    return String(clamp(Math.round(Number(value) || 1), 1, sides));
  }

  function createDie(sides, value, palette) {
    const THREE = window.THREE;
    const safeSides = Number(sides) === 100 ? 100 : DIE_TYPES[Number(sides)] ? Number(sides) : 20;
    const dieKey = geo().dieKeyForSides(safeSides) || "d20";
    const { geometry, vertices, faces } = createDiceGeometry(safeSides);
    const frames = faces.map((face) => getFaceFrame(face, vertices, safeSides, dieKey));

    const isPolishedAngelSword = palette.id === "new-angelsword";
    const material = new THREE.MeshStandardMaterial({
      color: palette.shell,
      roughness: isPolishedAngelSword ? 0.24 : 0.28,
      metalness: isPolishedAngelSword ? 0.46 : 0.08,
      emissive: palette.shell2,
      emissiveIntensity: isPolishedAngelSword ? 0.055 : 0.035,
      flatShading: true
    });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, material));

    group.add(new THREE.LineSegments(
      createBoundaryEdges(vertices, faces),
      new THREE.LineBasicMaterial({
        color: palette.edge,
        transparent: true,
        opacity: 0.95
      })
    ));

    const artKeys = getFaceArtKeys(faces, safeSides, dieKey);
    faces.forEach((face, index) => {
      const texture = makeFaceTexture(dieKey, artKeys[index], palette);
      const panel = new THREE.Mesh(
        createFacePanelGeometry(face, frames[index], vertices, dieKey),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide })
      );
      panel.renderOrder = 2;
      panel.userData.faceLabel = artKeys[index];
      group.add(panel);
    });

    const readMode = safeSides === 4 ? "vertex" : "face";
    const resultLabel = makeResultLabel(safeSides, value);
    let resultIndex;
    let resultNormal;
    if (readMode === "vertex") {
      resultIndex = clamp(Number(resultLabel) - 1, 0, vertices.length - 1);
      resultNormal = vertices[resultIndex].clone().normalize();
    } else {
      resultIndex = artKeys.indexOf(resultLabel);
      if (resultIndex < 0) {
        resultIndex = clamp((Number(value) || 1) - 1, 0, faces.length - 1);
      }
      resultNormal = faces[resultIndex].normal.clone();
    }

    group.userData = {
      sides: safeSides,
      dieKey,
      dieType: DIE_TYPES[safeSides] || "d20",
      value,
      readMode,
      resultLabel,
      resultIndex,
      resultNormal,
      faceLabels: artKeys,
      faceIndexes: faces.map((face) => [...face.indexes]),
      faceNormals: frames.map((frame) => frame.normal.clone()),
      faceArtUps: frames.map((frame) => frame.artUp.clone()),
      vertexNormals: vertices.map((vertex) => vertex.clone().normalize()),
      unitVertices: vertices.map((vertex) => vertex.clone()),
      glow: palette.glow
    };
    return group;
  }

  // --- settle orientation ---

  function signedAngleAround(axis, from, to) {
    const THREE = window.THREE;
    const cross = new THREE.Vector3().crossVectors(from, to);
    return Math.atan2(cross.dot(axis), clamp(from.dot(to), -1, 1));
  }

  function finalQuaternionForDie(die, presentDirection) {
    const THREE = window.THREE;
    const up = new THREE.Vector3(0, 1, 0);
    const userData = die.userData;

    if (userData.readMode === "vertex") {
      // Rest on the panel opposite the result vertex, result vertex straight
      // up, then spin so one visible panel squarely faces the camera.
      const lift = new THREE.Quaternion().setFromUnitVectors(userData.resultNormal.clone().normalize(), up);
      const visibleFaceIndex = Math.max(0, userData.faceIndexes.findIndex((indexes) => indexes.includes(userData.resultIndex)));
      const faceDirection = userData.faceNormals[visibleFaceIndex].clone()
        .applyQuaternion(lift)
        .projectOnPlane(up)
        .normalize();
      const toCamera = new THREE.Vector3(0, 0, 1);
      const angle = signedAngleAround(up, faceDirection, toCamera);
      return new THREE.Quaternion().setFromAxisAngle(up, angle).multiply(lift);
    }

    /* Owner contract (2026-08-25): the face the VIEWER is looking at is the
       result. By default the result face lies flat on top (the measuring
       pose used by the validators and the top-down audit). When the caller
       passes a presentation direction — the direction from the die toward
       the camera — the result face is aimed straight at the viewer instead,
       with the numeral upright on screen, so there is never a second face
       that reads more prominently than the rolled one. */
    const target = presentDirection && presentDirection.lengthSq?.() > 0
      ? presentDirection.clone().normalize()
      : up.clone();
    const lift = new THREE.Quaternion().setFromUnitVectors(userData.resultNormal.clone().normalize(), target);
    const artUp = userData.faceArtUps[userData.resultIndex].clone()
      .applyQuaternion(lift)
      .projectOnPlane(target)
      .normalize();
    let desiredUp = up.clone().projectOnPlane(target);
    if (desiredUp.lengthSq() < 0.0025) {
      // Face lies flat (target is world-up): "upright" means numeral top
      // pointing away from the viewer, as on a physical table.
      desiredUp = new THREE.Vector3(0, 0, -1).projectOnPlane(target);
    }
    desiredUp.normalize();
    const angle = signedAngleAround(target, artUp, desiredUp);
    return new THREE.Quaternion().setFromAxisAngle(target, angle).multiply(lift);
  }

  function topFaceLabelForDie(die, quaternion = die.quaternion) {
    const THREE = window.THREE;
    const up = new THREE.Vector3(0, 1, 0);
    const isVertexRead = die.userData.readMode === "vertex";
    const labels = isVertexRead
      ? die.userData.vertexNormals.map((_, index) => String(index + 1))
      : (die.userData.faceLabels || []);
    const normals = isVertexRead ? (die.userData.vertexNormals || []) : (die.userData.faceNormals || []);
    let best = { label: "", dot: -Infinity, index: -1, readMode: isVertexRead ? "vertex" : "face" };
    normals.forEach((normal, index) => {
      const dot = normal.clone().applyQuaternion(quaternion).normalize().dot(up);
      if (dot > best.dot) {
        best = {
          label: labels[index] || String(index + 1),
          dot,
          index,
          readMode: best.readMode
        };
      }
    });
    return best;
  }

  function restHeightForDie(die, quaternion) {
    let minY = Infinity;
    die.userData.unitVertices.forEach((vertex) => {
      minY = Math.min(minY, vertex.clone().applyQuaternion(quaternion).y);
    });
    return Number.isFinite(minY) ? -minY : 1;
  }

  // --- settled-die preview snapshots ---

  function clonePreviewMaterials(object) {
    object.traverse((child) => {
      if (!child.material) {
        return;
      }
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => material?.clone ? material.clone() : material);
        return;
      }
      if (child.material.clone) {
        child.material = child.material.clone();
      }
    });
  }

  function disposePreviewMaterials(object) {
    object.traverse((child) => {
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      materials.forEach((material) => material?.dispose?.());
    });
  }

  function buildDiePreviewDataUrl(die, quaternion, options = {}) {
    if (!hasRuntime() || !die) {
      return "";
    }
    const THREE = window.THREE;
    const size = Math.max(96, Math.round(Number(options.size) || 184));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true
    });
    configureRendererColor(renderer);
    renderer.setPixelRatio(crispPixelRatio());
    renderer.setSize(size, size, false);
    renderer.shadowMap.enabled = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 4.8, 8.5);
    camera.lookAt(0, -0.35, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1b1f28, 1.68));
    const key = new THREE.DirectionalLight(0xffffff, 2.45);
    key.position.set(-4, 5, 6);
    scene.add(key);
    const rim = new THREE.PointLight(die.userData?.glow || 0x71d1ff, 2.05, 9);
    rim.position.set(3, -2.4, 3);
    scene.add(rim);

    const previewDie = die.clone(true);
    clonePreviewMaterials(previewDie);
    previewDie.position.set(0, -0.2, 0);
    previewDie.scale.setScalar(Number(options.scale) || 1.6);
    previewDie.quaternion.copy(quaternion || die.quaternion);
    scene.add(previewDie);

    renderer.render(scene, camera);
    const dataUrl = canvas.toDataURL("image/png");

    disposePreviewMaterials(previewDie);
    renderer.dispose();
    renderer.forceContextLoss?.();
    canvas.width = 1;
    canvas.height = 1;
    return dataUrl;
  }

  // --- the roll ---

  function expandPercentileResults(results) {
    return results.flatMap((entry) => {
      const sides = Math.max(1, Number(entry.sides) || 20);
      const label = String(entry.label || "").trim().toLowerCase();
      if (sides !== 100 || label === "d00") {
        return [entry];
      }
      const value = clamp(Math.round(Number(entry.value) || 100), 1, 100);
      const percentileValue = value === 100 ? 100 : Math.floor(value / 10) * 10;
      const onesValue = value % 10 === 0 ? 10 : value % 10;
      return [
        { ...entry, sides: 100, value: percentileValue, label: "d00" },
        { ...entry, sides: 10, value: onesValue, label: "d10" }
      ];
    });
  }

  function randomUnitVector() {
    const THREE = window.THREE;
    return new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ).normalize();
  }

  function randomQuaternion() {
    const THREE = window.THREE;
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    ));
  }

  function prefersReducedMotion() {
    try {
      return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    } catch {
      return false;
    }
  }

  function collisionRadiusForDie(sides, scale) {
    const shapeFactor = Number(sides) === 4
      ? 0.7
      : Number(sides) === 6
        ? 0.76
        : Number(sides) >= 12
          ? 0.82
          : 0.78;
    return scale * shapeFactor;
  }

  function rotateByAngularVelocity(entry, seconds) {
    const speed = entry.angularVelocity.length();
    if (speed < 0.0001) {
      return;
    }
    const delta = new window.THREE.Quaternion().setFromAxisAngle(
      entry.angularVelocity.clone().multiplyScalar(1 / speed),
      speed * seconds
    );
    entry.die.quaternion.premultiply(delta).normalize();
  }

  function stepHybridPhysics(entries, seconds, elapsedMs, environment) {
    const THREE = window.THREE;
    const active = entries.filter((entry) => elapsedMs >= entry.startAt);
    const airDrag = Math.pow(0.992, seconds * 60);
    const angularDrag = Math.pow(0.994, seconds * 60);

    active.forEach((entry) => {
      entry.velocity.y += environment.gravity * seconds;
      entry.velocity.multiplyScalar(airDrag);
      entry.angularVelocity.multiplyScalar(angularDrag);
      entry.die.position.addScaledVector(entry.velocity, seconds);
      rotateByAngularVelocity(entry, seconds);

      const floorContactY = environment.floorY
        + restHeightForDie(entry.die, entry.die.quaternion) * entry.scale
        + 0.008;
      if (entry.die.position.y < floorContactY) {
        const impactSpeed = Math.max(0, -entry.velocity.y);
        entry.die.position.y = floorContactY;
        entry.velocity.y = impactSpeed > 0.32 ? impactSpeed * environment.floorRestitution : 0;
        const floorFriction = impactSpeed > 0.32 ? 0.9 : 0.78;
        entry.velocity.x *= floorFriction;
        entry.velocity.z *= floorFriction;
        entry.angularVelocity.multiplyScalar(impactSpeed > 0.32 ? 0.9 : 0.78);
        if (impactSpeed > 0.55) {
          entry.angularVelocity.x += entry.velocity.z * 0.32;
          entry.angularVelocity.z -= entry.velocity.x * 0.32;
        }
      }

      const radius = entry.collisionRadius;
      if (entry.die.position.x - radius < environment.minX) {
        entry.die.position.x = environment.minX + radius;
        entry.velocity.x = Math.abs(entry.velocity.x) * environment.wallRestitution;
        entry.angularVelocity.z -= entry.velocity.x * 0.55;
      } else if (entry.die.position.x + radius > environment.maxX) {
        entry.die.position.x = environment.maxX - radius;
        entry.velocity.x = -Math.abs(entry.velocity.x) * environment.wallRestitution;
        entry.angularVelocity.z -= entry.velocity.x * 0.55;
      }

      if (entry.die.position.z - radius < environment.minZ) {
        entry.die.position.z = environment.minZ + radius;
        entry.velocity.z = Math.abs(entry.velocity.z) * environment.wallRestitution;
        entry.angularVelocity.x += entry.velocity.z * 0.55;
      } else if (entry.die.position.z + radius > environment.maxZ) {
        entry.die.position.z = environment.maxZ - radius;
        entry.velocity.z = -Math.abs(entry.velocity.z) * environment.wallRestitution;
        entry.angularVelocity.x += entry.velocity.z * 0.55;
      }
    });

    for (let pass = 0; pass < environment.collisionPasses; pass += 1) {
      for (let aIndex = 0; aIndex < active.length - 1; aIndex += 1) {
        const a = active[aIndex];
        for (let bIndex = aIndex + 1; bIndex < active.length; bIndex += 1) {
          const b = active[bIndex];
          const separation = b.die.position.clone().sub(a.die.position);
          let distance = separation.length();
          const minimumDistance = a.collisionRadius + b.collisionRadius;
          if (distance >= minimumDistance) {
            continue;
          }
          if (distance < 0.0001) {
            const angle = (aIndex * 2.399 + bIndex * 1.618) % (Math.PI * 2);
            separation.set(Math.cos(angle), 0.18, Math.sin(angle));
            distance = separation.length();
          }
          const normal = separation.multiplyScalar(1 / distance);
          const penetration = minimumDistance - distance;
          a.die.position.addScaledVector(normal, -penetration * 0.5);
          b.die.position.addScaledVector(normal, penetration * 0.5);

          const relativeVelocity = b.velocity.clone().sub(a.velocity);
          const closingSpeed = relativeVelocity.dot(normal);
          if (closingSpeed < 0) {
            const impulseMagnitude = -(1 + environment.dieRestitution) * closingSpeed * 0.5;
            const impulse = normal.clone().multiplyScalar(impulseMagnitude);
            a.velocity.addScaledVector(impulse, -1);
            b.velocity.add(impulse);

            const tangent = relativeVelocity.sub(normal.clone().multiplyScalar(closingSpeed));
            if (tangent.lengthSq() > 0.0001) {
              const spinKick = new THREE.Vector3().crossVectors(normal, tangent).multiplyScalar(0.18);
              a.angularVelocity.addScaledVector(spinKick, -1);
              b.angularVelocity.add(spinKick);
            }
          }
        }
      }
    }
  }

  function clear() {
    if (!activeRoll) {
      return;
    }
    if (activeRoll.animationFrame) {
      cancelAnimationFrame(activeRoll.animationFrame);
    }
    if (activeRoll.timeout) {
      clearTimeout(activeRoll.timeout);
    }
    activeRoll.renderer?.dispose?.();
    activeRoll.canvas?.remove?.();
    activeRoll = null;
    lastStatus = "cleared";
  }

  function rollDice(options = {}) {
    if (!hasRuntime()) {
      lastStatus = "missing THREE or dice-geometry runtime";
      return false;
    }

    const layer = options.layer || document.getElementById("dice-flight-layer") || document.body;
    const results = expandPercentileResults(Array.isArray(options.results) ? options.results : []);
    if (!layer || !results.length) {
      lastStatus = "missing layer or results";
      return false;
    }

    clear();
    const THREE = window.THREE;
    const width = Math.max(360, Number(options.width) || window.innerWidth || document.documentElement.clientWidth || 1200);
    const height = Math.max(420, Number(options.height) || window.innerHeight || document.documentElement.clientHeight || 800);
    const palette = getTheme(options.setId);
    const requestedMotionMode = String(options.motionMode || "scripted").toLowerCase();
    const reducedMotion = options.reducedMotion === true
      || (options.reducedMotion !== false && prefersReducedMotion());
    const useHybridPhysics = requestedMotionMode === "hybrid" && !reducedMotion;
    lastMotionMode = useHybridPhysics ? "hybrid-physics" : "scripted-fallback";
    lastSettledResults = [];

    const canvas = document.createElement("canvas");
    canvas.className = "accurate-dice-canvas";
    const constrainToLayer = options.constrainToLayer === true;
    if (constrainToLayer && window.getComputedStyle(layer).position === "static") {
      layer.style.position = "relative";
    }
    canvas.style.cssText = `position:${constrainToLayer ? "absolute" : "fixed"};inset:0;width:100%;height:100%;pointer-events:none;z-index:4;`;
    layer.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    configureRendererColor(renderer);
    renderer.setPixelRatio(crispPixelRatio());
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    // A slightly higher table camera exposes more of the winning top face,
    // closer to a physical tabletop view, without flattening the dice into
    // icons or hiding their neighboring faces.
    /* The camera never moves (owner decision 2026-08-25 v2: a settle-time
       camera lift read as a bait-and-switch — the number you watched became
       a different face). Instead each settled die is ORIENTED so its result
       face points at the viewer; see FACE_TOWARD_VIEWER_SIDES below. */
    camera.position.set(0, 6.9, 8.5);
    camera.lookAt(0, -0.55, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1b1f28, 1.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(-4, 5, 6);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(palette.glow, 2.2, 9);
    rimLight.position.set(3, -2.4, 3);
    scene.add(rimLight);

    // Keep the mathematical floor for collisions only. Rendering a plane here
    // puts a large translucent trapezoid over the character sheet because the
    // WebGL canvas intentionally has a transparent background.
    const floorY = -1.55;

    const aspect = width / height;
    const viewWidth = aspect >= 1 ? 9.8 : 5.8;
    const viewDepth = aspect >= 1 ? 5.2 : 6.4;
    const columns = width < 760
      ? Math.min(2, results.length)
      : results.length <= 4
        ? results.length
        : results.length <= 8
          ? 4
        : results.length > 14
          ? 6
          : 5;
    const sizeMultiplier = { small: 0.72, medium: 1, large: 1.32 }[String(options.sizePreset || "medium").toLowerCase()] || 1;
    const targetPixels = getPrettyDicePixelTarget(results.length, width, height) * sizeMultiplier;
    const multiDieScale = results.length > 8 ? 0.8 : results.length > 4 ? 0.92 : 1;
    const diceSize = clamp(
      getWorldScaleForPixelTarget(targetPixels, camera, height, floorY, viewDepth) * (width < 760 ? 0.82 : multiDieScale),
      results.length > 4 ? 0.24 : 0.32,
      results.length > 8 ? 0.54 : results.length > 4 ? 0.6 : 0.72
    );
    const layoutWidth = viewWidth * (results.length <= 8 ? 0.86 : 0.8);
    const laneGap = columns > 1 ? Math.min(diceSize * 2.7, layoutWidth / Math.max(1, columns - 1)) : 0;
    const rowGap = diceSize * 2.28;
    const centerOffsetX = Number(options.centerOffsetX) || 0;

    const burstCenterZ = -viewDepth * 0.18;
    const physicsMs = results.length > 14 ? 2050 : results.length > 8 ? 2250 : 2500;
    const guideMs = results.length > 14 ? 1050 : 1250;
    const physicsEnvironment = {
      floorY,
      gravity: -9.4,
      floorRestitution: results.length > 14 ? 0.38 : 0.46,
      wallRestitution: 0.62,
      dieRestitution: results.length > 14 ? 0.46 : 0.58,
      collisionPasses: results.length > 14 ? 1 : 2,
      minX: centerOffsetX - viewWidth * 0.45,
      maxX: centerOffsetX + viewWidth * 0.45,
      minZ: -viewDepth * 0.68,
      maxZ: viewDepth * 0.45
    };

    const dice = results.map((entry, index) => {
      const sides = Number(entry.sides) || 20;
      const die = createDie(sides, entry.value, palette);
      die.scale.setScalar(diceSize);
      const row = Math.floor(index / columns);
      const column = index % columns;
      const countInRow = Math.min(columns, results.length - row * columns);
      const direction = index % 2 === 0 ? 1 : -1;
      const rowStagger = row % 2 ? diceSize * 0.24 : -diceSize * 0.08;
      const endX = centerOffsetX
        + (column - (countInRow - 1) / 2) * laneGap
        + rowStagger
        + (Math.random() - 0.5) * diceSize * 0.48;
      const naturalDepthScatter = results.length <= 8
        ? ((index % 3) - 1) * diceSize * 0.48 + (Math.random() - 0.5) * diceSize * 0.28
        : (Math.random() - 0.5) * diceSize * 0.32;
      const endZ = -viewDepth * 0.18
        + row * rowGap
        + naturalDepthScatter;
      /* Owner contract: the face you are looking at is the result. Dice
         whose numbers live on faces are aimed at the camera at rest; the
         d4 (corner-read) and d6 (top face already fully legible) keep the
         classic flat-on-top pose. */
      const presentDirection = FACE_TOWARD_VIEWER_SIDES.has(sides)
        ? new THREE.Vector3(0, 6.9, 8.5).sub(new THREE.Vector3(endX, floorY + diceSize, endZ)).normalize()
        : null;
      const uprightQuat = finalQuaternionForDie(die, presentDirection);
      const naturalYaw = sides === 4 ? 0 : (Math.random() - 0.5) * (Math.PI / 14);
      // A restrained in-plane wiggle keeps dice from landing in one
      // artificial catalogue pose without moving the result off the viewer.
      const yawAxis = presentDirection || new THREE.Vector3(0, 1, 0);
      const finalQuat = naturalYaw
        ? new THREE.Quaternion().setFromAxisAngle(yawAxis, naturalYaw).multiply(uprightQuat)
        : uprightQuat;
      const restY = floorY + restHeightForDie(die, finalQuat) * diceSize + 0.01;
      const start = new THREE.Vector3(
        direction > 0 ? -viewWidth * 0.72 : viewWidth * 0.72,
        restY + 1.35 + Math.random() * 0.45,
        endZ + 2.3 + (Math.random() - 0.5) * 0.72
      );
      const end = new THREE.Vector3(
        endX + (Math.random() - 0.5) * 0.1,
        restY,
        endZ + (Math.random() - 0.5) * 0.08
      );
      const burstAngle = (index / Math.max(1, results.length)) * Math.PI * 2
        + (Math.random() - 0.5) * (results.length > 10 ? 0.5 : 0.82);
      const burstSpread = diceSize * (0.14 + Math.random() * 0.3);
      const spawn = new THREE.Vector3(
        centerOffsetX + Math.cos(burstAngle) * burstSpread,
        floorY + 2.35 + Math.random() * 0.72,
        burstCenterZ + Math.sin(burstAngle) * burstSpread * 0.7
      );
      const horizontalSpeed = (results.length > 14 ? 2.05 : 2.45) + Math.random() * 1.35;
      const velocity = new THREE.Vector3(
        Math.cos(burstAngle) * horizontalSpeed,
        2.45 + Math.random() * 1.55,
        Math.sin(burstAngle) * horizontalSpeed * (0.62 + Math.random() * 0.22)
      );
      const angularVelocity = randomUnitVector().multiplyScalar(
        8.5 + Math.random() * 5.5 + Math.min(2.5, Math.log2(Math.max(4, sides)))
      );
      const startQuat = randomQuaternion();
      die.position.copy(useHybridPhysics ? spawn : start);
      die.quaternion.copy(startQuat);
      scene.add(die);
      const spinRounds = 5.5 + Math.random() * 3.4 + Math.min(2.5, Math.log2(Math.max(4, sides)));
      return {
        die,
        start,
        spawn,
        end,
        startQuat,
        finalQuat,
        spinAxisA: randomUnitVector(),
        spinAxisB: randomUnitVector(),
        startAt: index * (useHybridPhysics ? (results.length > 14 ? 12 : 28) : 110),
        travelMs: 1750 + index * 55,
        settleMs: 1150 + index * 16,
        spinRounds,
        tumbleRounds: 3.5 + Math.random() * 2.4,
        laneDrift: (Math.random() - 0.5) * 0.42,
        bounce: 1.05 + Math.random() * 0.48,
        phase: Math.random() * Math.PI * 2,
        scale: diceSize,
        collisionRadius: collisionRadiusForDie(sides, diceSize),
        velocity,
        angularVelocity,
        guideStartPosition: null,
        guideStartQuaternion: null
      };
    });

    const startTime = performance.now();
    const holdMs = 3000;
    const fadeMs = 3000;
    const settleCompleteMs = useHybridPhysics
      ? physicsMs + guideMs
      : Math.max(...dice.map((die) => die.startAt + die.travelMs + die.settleMs), 0);
    const totalMs = settleCompleteMs + holdMs + fadeMs;
    activeRoll = { renderer, canvas, animationFrame: 0, timeout: 0, motionMode: lastMotionMode };
    lastStatus = `${lastMotionMode} rolling ${dice.length} dice at ${Math.round(targetPixels)}px target size`;

    // The outcome is fully determined before the animation starts - the roll
    // is presentation. Verify and record it up front so results survive even
    // if the tab is hidden and animation frames never run.
    lastSettledResults = dice.map((entry) => {
      const top = topFaceLabelForDie(entry.die, entry.finalQuat);
      return {
        die: entry.die.userData.dieType,
        sides: entry.die.userData.sides,
        value: entry.die.userData.value,
        readMode: entry.die.userData.readMode,
        requested: String(entry.die.userData.resultLabel),
        topFace: top.label,
        topVertex: top.readMode === "vertex" ? top.label : null,
        topDot: Number(top.dot.toFixed(4)),
        matched: String(top.label) === String(entry.die.userData.resultLabel),
        previewDataUrl: ""
      };
    });

    let publishedSettle = false;
    function publishSettle() {
      if (publishedSettle) {
        return;
      }
      publishedSettle = true;
      dice.forEach((entry) => {
        entry.die.quaternion.copy(entry.finalQuat);
        entry.die.position.copy(entry.end);
      });
      if (options.capturePreviews) {
        lastSettledResults = lastSettledResults.map((result, index) => ({
          ...result,
          previewDataUrl: buildDiePreviewDataUrl(dice[index].die, dice[index].finalQuat, {
            size: options.previewSize || 184,
            scale: Number(dice[index].die.userData.sides) === 4 ? 1.72 : 1.6
          })
        }));
      }
      lastStatus = `settled ${lastSettledResults.length} dice`;
      if (typeof options.onSettle === "function") {
        options.onSettle(lastSettledResults);
      }
    }

    let lastFrameTime = startTime;
    let guideInitialized = false;
    function renderFrame(timestamp) {
      const elapsed = timestamp - startTime;
      const completeAt = totalMs - fadeMs;
      const fade = clamp((elapsed - completeAt) / fadeMs, 0, 1);
      canvas.style.opacity = String(1 - fade);

      if (useHybridPhysics) {
        dice.forEach((entry) => {
          entry.die.visible = elapsed >= entry.startAt;
        });

        if (elapsed < physicsMs) {
          const frameSeconds = clamp((timestamp - lastFrameTime) / 1000, 0, 0.05);
          const maximumSteps = results.length > 14 ? 2 : 4;
          const substeps = Math.max(1, Math.min(maximumSteps, Math.ceil(frameSeconds / (1 / 90))));
          const stepSeconds = frameSeconds / substeps;
          for (let step = 0; step < substeps; step += 1) {
            const stepElapsed = elapsed - frameSeconds * 1000 + (step + 1) * stepSeconds * 1000;
            stepHybridPhysics(dice, stepSeconds, stepElapsed, physicsEnvironment);
          }
        } else {
          if (!guideInitialized) {
            guideInitialized = true;
            dice.forEach((entry) => {
              entry.die.visible = true;
              entry.guideStartPosition = entry.die.position.clone();
              entry.guideStartQuaternion = entry.die.quaternion.clone();
            });
          }
          const guide = clamp((elapsed - physicsMs) / guideMs, 0, 1);
          const guideEase = easeOutQuint(guide);
          dice.forEach((entry) => {
            const position = entry.guideStartPosition.clone().lerp(entry.end, guideEase);
            const guideArc = Math.sin(guide * Math.PI)
              * Math.pow(1 - guide, 1.25)
              * entry.scale
              * 0.46;
            const settleHop = Math.abs(Math.sin(guide * Math.PI * 3.4 + entry.phase))
              * Math.pow(1 - guide, 2.25)
              * entry.scale
              * 0.18;
            position.y += guideArc + settleHop;
            entry.die.position.copy(position);

            const wobble = new THREE.Quaternion().setFromAxisAngle(
              entry.spinAxisB,
              Math.sin(guide * Math.PI * 4.3 + entry.phase) * Math.pow(1 - guide, 2.3) * 0.24
            );
            entry.die.quaternion
              .copy(entry.guideStartQuaternion)
              .slerp(entry.finalQuat, guideEase)
              .multiply(wobble)
              .normalize();
          });
        }
        lastFrameTime = timestamp;
      } else {
        dice.forEach((entry) => {
          const local = elapsed - entry.startAt;
          if (local < 0) {
            entry.die.visible = false;
            return;
          }
          entry.die.visible = true;
          const travel = clamp(local / entry.travelMs, 0, 1);
          const settle = clamp((local - entry.travelMs) / entry.settleMs, 0, 1);
          const travelEase = easeOutCubic(travel);
          const settleEase = easeOutQuint(settle);
          const position = entry.start.clone().lerp(entry.end, travelEase);
          position.x += Math.sin(travel * Math.PI * 2 + entry.phase) * Math.pow(1 - travel, 1.25) * entry.laneDrift;
          position.z += Math.cos(travel * Math.PI * 1.6 + entry.phase) * Math.pow(1 - travel, 1.4) * 0.34;
          const arc = Math.sin(travel * Math.PI) * entry.bounce * 1.12;
          const hop = Math.abs(Math.sin(travel * Math.PI * 6.4)) * Math.pow(1 - travel, 1.45) * entry.bounce * 0.62;
          const settleHop = Math.abs(Math.sin(settle * Math.PI * 4.2)) * Math.pow(1 - settle, 2.1) * 0.32;
          position.y += arc + hop + settleHop;
          entry.die.position.copy(position);

          const spinA = new THREE.Quaternion().setFromAxisAngle(entry.spinAxisA, entry.spinRounds * Math.PI * 2 * travelEase);
          const spinB = new THREE.Quaternion().setFromAxisAngle(entry.spinAxisB, entry.tumbleRounds * Math.PI * 2 * Math.sin(travel * Math.PI * 0.96));
          const rollingQuat = entry.startQuat.clone().multiply(spinA).multiply(spinB);

          if (settle <= 0) {
            entry.die.quaternion.copy(rollingQuat);
          } else {
            const wobble = new THREE.Quaternion().setFromAxisAngle(
              entry.spinAxisB,
              Math.sin(settle * Math.PI * 5.1 + entry.phase) * Math.pow(1 - settle, 2.2) * 0.42
            );
            entry.die.quaternion
              .copy(rollingQuat)
              .slerp(entry.finalQuat, settleEase)
              .multiply(wobble);
          }
        });
      }

      if (elapsed >= settleCompleteMs) {
        publishSettle();
      }

      renderer.render(scene, camera);
      if (elapsed < totalMs) {
        activeRoll.animationFrame = requestAnimationFrame(renderFrame);
      } else {
        clear();
      }
    }

    activeRoll.animationFrame = requestAnimationFrame(renderFrame);
    activeRoll.timeout = setTimeout(() => {
      publishSettle();
      clear();
    }, totalMs + 500);
    return totalMs;
  }

  function preloadFaceArt(setId = "") {
    if (!window.DiceSkinStudio || !geo()) {
      return 0;
    }
    const id = String(setId || window.DiceSkinStudio.getActiveSkinId?.() || "").toLowerCase();
    let queued = 0;
    Object.entries(geo().DIE_FACE_KEYS).forEach(([dieKey, artKeys]) => {
      artKeys.forEach((artKey) => {
        const artSpec = getFaceArtSpec(dieKey, artKey, getTheme(id));
        if (artSpec.src) {
          getImageState(artSpec.src);
          queued += 1;
        }
      });
    });
    return queued;
  }

  async function preloadFaceArtReady(setId = "") {
    if (!window.DiceSkinStudio || !geo()) {
      return 0;
    }
    const id = String(setId || window.DiceSkinStudio.getActiveSkinId?.() || "").toLowerCase();
    const pending = [];
    Object.entries(geo().DIE_FACE_KEYS).forEach(([dieKey, artKeys]) => {
      artKeys.forEach((artKey) => {
        const artSpec = getFaceArtSpec(dieKey, artKey, getTheme(id));
        if (artSpec.src) {
          pending.push(getImageState(artSpec.src).readyPromise);
        }
      });
    });
    await Promise.all(pending);
    return pending.length;
  }

  function validateAllFaceSettles(options = {}) {
    if (!hasRuntime()) {
      return {
        geometryContract: geo()?.CONTRACT_VERSION || "unavailable",
        total: 0,
        passed: 0,
        failed: 0,
        results: [],
        error: "Three.js and the shared geometry contract must be loaded."
      };
    }
    const setId = String(options.setId || window.DiceSkinStudio?.getActiveSkinId?.() || "angels-sword");
    const palette = getTheme(setId);
    const sidesByDie = { d4: 4, d6: 6, d8: 8, d10: 10, d100: 100, d12: 12, d20: 20 };
    const results = [];
    Object.entries(geo().DIE_FACE_KEYS).forEach(([dieKey, faceKeys]) => {
      const sides = sidesByDie[dieKey];
      faceKeys.forEach((faceKey) => {
        const resultLabel = dieKey === "d4" ? String(faceKey).replace("face-", "") : String(faceKey);
        const value = sides === 10 && resultLabel === "0"
          ? 10
          : sides === 100 && resultLabel === "00"
            ? 100
            : Number(resultLabel);
        const die = createDie(sides, value, palette);
        const finalQuat = finalQuaternionForDie(die);
        const top = topFaceLabelForDie(die, finalQuat);
        const matched = String(top.label) === String(die.userData.resultLabel);
        results.push({
          die: dieKey,
          faceKey,
          requested: String(die.userData.resultLabel),
          settled: String(top.label),
          readMode: die.userData.readMode,
          matched
        });
        die.traverse?.((object) => {
          object.geometry?.dispose?.();
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material?.dispose?.());
          } else {
            object.material?.dispose?.();
          }
        });
      });
    });
    const passed = results.filter((entry) => entry.matched).length;
    lastStatus = `validated ${passed}/${results.length} requested settles`;
    return {
      geometryContract: geo().CONTRACT_VERSION || "unversioned",
      skinId: palette.id,
      total: results.length,
      passed,
      failed: results.length - passed,
      results
    };
  }

  window.LyrianAccurateDiceRoller = {
    rollDice,
    clear,
    buildPreviewDataUrl(options = {}) {
      if (!hasRuntime()) {
        return "";
      }
      const palette = getTheme(options.setId);
      const die = createDie(options.sides, options.value, palette);
      /* orientation: "viewer" (default) matches the live table — result face
         aimed at the preview camera; "top" is the measuring pose used by the
         face audit instrumentation. */
      const presentDirection = options.orientation !== "top" && FACE_TOWARD_VIEWER_SIDES.has(Number(options.sides))
        ? new window.THREE.Vector3(0, 5.15, 8.5).normalize()
        : null;
      const finalQuat = finalQuaternionForDie(die, presentDirection);
      return buildDiePreviewDataUrl(die, finalQuat, {
        size: options.size,
        scale: Number(options.sides) === 4 ? 1.72 : 1.6
      });
    },
    preloadFaceArt,
    preloadFaceArtReady,
    debugFaceTexture(dieKey, artKey, setId = "new-angelsword") {
      if (!hasRuntime()) {
        return "";
      }
      const palette = getTheme(setId);
      const texture = makeFaceTexture(dieKey, artKey, palette);
      return texture?.image?.toDataURL?.("image/png") || "";
    },
    validateAllFaceSettles,
    validateNumberingTopology,
    /* QA-only internals for the face-orientation diagnostic
       (scripts/dice-orientation-diagnostic.mjs). Not a public API. */
    __testInternals: { createDie, finalQuaternionForDie, topFaceLabelForDie, getTheme },
    clearTextureCache() {
      skinTextureCache.forEach((texture) => texture?.dispose?.());
      skinTextureCache.clear();
      faceImageCache.clear();
    },
    getStatus() {
      return {
        version: ROLLER_VERSION,
        status: lastStatus,
        active: Boolean(activeRoll),
        motionMode: activeRoll?.motionMode || lastMotionMode,
        settledResults: lastSettledResults,
        supportedDice: Object.keys(DIE_TYPES).map(Number)
      };
    }
  };
}());
