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

  const THEME_PALETTES = {
    "angels-sword": {
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
      gem: "#258dd6",
      number: "#9b6a24",
      glow: 0x71d1ff
    },
    "new-angelsword": {
      id: "new-angelsword",
      shell: 0xf4e8d2,
      shell2: 0x173a66,
      face: "#f4e8d2",
      center: "#fff6e8",
      pearl: "#fffaf0",
      trim: "#d8a441",
      edge: 0xd8a441,
      accent: "#77c6dc",
      accent2: "#173a66",
      gem: "#258dd6",
      number: "#9b6a24",
      glow: 0x71d1ff
    },
    "leaflit": {
      id: "leaflit",
      shell: 0xf7f0e8,
      shell2: 0x082e93,
      face: "#f7f0e8",
      center: "#fff8f0",
      pearl: "#fff4e8",
      trim: "#e0a73a",
      edge: 0xe0a73a,
      accent: "#a80c1d",
      accent2: "#082e93",
      gem: "#d82bc9",
      number: "#a21123",
      glow: 0xff4bcc
    },
    asari: {
      id: "asari",
      shell: 0xf3f4f8,
      shell2: 0x173fa7,
      face: "#f3f4f8",
      center: "#fffffb",
      pearl: "#fbfcff",
      trim: "#e8b84d",
      edge: 0xe8b84d,
      accent: "#00c8ff",
      accent2: "#173fa7",
      gem: "#6c4bff",
      number: "#0b78bd",
      glow: 0x45d9ff
    }
  };
  const ROLLER_VERSION = "alpha4-new-angelsword-sidecar-27-d4-triangle-pivot";
  const SKIN_MODE_NAME = "Sprite-Skin Physics Dice";
  const SPRITE_SKIN_PHYSICS_SIDES = new Set([6, 8, 10, 12, 100]);

  let activeRoll = null;
  let lastStatus = "idle";
  let lastSettledResults = [];
  const skinTextureCache = new Map();
  const referenceImageCache = new Map();
  const preparedFaceCropCache = new Map();
  const DIE_TEXTURE_KEYS = {
    4: "d4",
    6: "d6",
    8: "d8",
    10: "d10",
    12: "d12",
    20: "d20",
    100: "d100"
  };
  const PRELOAD_FACE_LABELS = {
    4: ["1", "2", "3", "4"],
    6: ["1", "2", "3", "4", "5", "6"],
    8: ["1", "2", "3", "4", "5", "6", "7", "8"],
    10: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    12: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    20: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"],
    100: ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"]
  };

  function hasRuntime() {
    return Boolean(window.THREE);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function easeOutCubic(value) {
    const t = clamp(value, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function easeOutQuint(value) {
    const t = clamp(value, 0, 1);
    return 1 - Math.pow(1 - t, 5);
  }

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
    // The procedural dice are normalized to roughly a 2-unit diameter. This
    // keeps the 3D footprint aligned with the already-approved sprite dice.
    return (targetPixels * worldUnitsPerPixel) / 2;
  }

  function getTheme(setId) {
    const key = String(setId || "").toLowerCase();
    return THEME_PALETTES[key] || THEME_PALETTES["angels-sword"];
  }

  function usesSpriteSkinPhysics(dieSides, options = {}) {
    if (options.forceReferenceSkin) {
      return false;
    }
    if (String(options.setId || "").toLowerCase() === "new-angelsword") {
      return false;
    }
    return SPRITE_SKIN_PHYSICS_SIDES.has(Number(dieSides));
  }

  function getReferenceImagePath(setId, dieSides) {
    const dieKey = DIE_TEXTURE_KEYS[Number(dieSides) === 100 ? 100 : Number(dieSides)] || "d20";
    const setKey = THEME_PALETTES[String(setId || "").toLowerCase()]?.id || "angels-sword";
    return `assets/dice-reference/${setKey}/${dieKey}.png`;
  }

  function getPreparedFaceArtSource(setId, dieSides, label = "") {
    const dieKey = DIE_TEXTURE_KEYS[Number(dieSides) === 100 ? 100 : Number(dieSides)] || "d20";
    const setKey = THEME_PALETTES[String(setId || "").toLowerCase()]?.id || "angels-sword";
    const safeLabel = String(label || "").trim();
    const faceKey = safeLabel ? `${setKey}:${dieKey}:${safeLabel}` : "";
    const facePrepared = faceKey ? window.LYRIAN_DICE_FACE_ART?.[faceKey] : null;
    if (facePrepared) {
      return {
        src: facePrepared,
        prepared: true,
        specific: true
      };
    }
    const key = `${setKey}:${dieKey}`;
    const prepared = window.LYRIAN_DICE_FACE_ART?.[key];
    if (prepared) {
      return {
        src: prepared,
        prepared: true,
        specific: false
      };
    }
    return {
      src: getReferenceImagePath(setKey, dieSides),
      prepared: false,
      specific: false
    };
  }

  function getD4FaceArtTransform(label, dieSides) {
    if (Number(dieSides) !== 4) {
      return {
        sourceLabel: String(label || ""),
        rotation: 0
      };
    }

    // The provided D4 art is classic corner-number art. Remap each requested
    // result to a source face that contains that number, then rotate it so the
    // result sits on the top point instead of generating a second label.
    const turn = (Math.PI * 2) / 3;
    const map = {
      "1": { sourceLabel: "1", rotation: turn },
      "2": { sourceLabel: "1", rotation: -turn },
      "3": { sourceLabel: "2", rotation: 0 },
      "4": { sourceLabel: "1", rotation: 0 }
    };
    return map[String(label || "")] || {
      sourceLabel: String(label || ""),
      rotation: 0
    };
  }

  function getReferenceImageState(src, prepared = false) {
    if (referenceImageCache.has(src)) {
      const cached = referenceImageCache.get(src);
      cached.prepared = cached.prepared || prepared;
      return cached;
    }

    const image = new Image();
    const state = {
      image,
      ready: false,
      failed: false,
      prepared,
      callbacks: []
    };
    image.onload = () => {
      state.ready = true;
      const callbacks = [...state.callbacks];
      state.callbacks.length = 0;
      callbacks.forEach((callback) => callback(state));
    };
    image.onerror = () => {
      state.failed = true;
      state.callbacks.length = 0;
    };
    image.src = src;
    referenceImageCache.set(src, state);
    return state;
  }

  function getPreparedFaceCrop(state, options = {}) {
    if (!state?.prepared || !state.ready || !state.image) {
      return null;
    }
    const image = state.image;
    const cacheKey = image.currentSrc || image.src || "";
    if (cacheKey && preparedFaceCropCache.has(cacheKey)) {
      return preparedFaceCropCache.get(cacheKey);
    }

    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    if (!width || !height) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = pixels[(y * width + x) * 4 + 3];
        if (alpha <= 8) {
          continue;
        }
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    const fullCrop = {
      sx: 0,
      sy: 0,
      sw: width,
      sh: height
    };
    if (maxX < minX || maxY < minY) {
      if (cacheKey) {
        preparedFaceCropCache.set(cacheKey, fullCrop);
      }
      return fullCrop;
    }

    const padScale = Number.isFinite(options.padScale) ? options.padScale : 0.018;
    const pad = Math.max(2, Math.round(Math.max(width, height) * padScale));
    const sx = clamp(minX - pad, 0, Math.max(0, width - 1));
    const sy = clamp(minY - pad, 0, Math.max(0, height - 1));
    const ex = clamp(maxX + pad + 1, 1, width);
    const ey = clamp(maxY + pad + 1, 1, height);
    const crop = {
      sx,
      sy,
      sw: Math.max(1, ex - sx),
      sh: Math.max(1, ey - sy)
    };
    if (cacheKey) {
      preparedFaceCropCache.set(cacheKey, crop);
    }
    return crop;
  }

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

  function preloadFaceArt(setId = "new-angelsword") {
    const palette = getTheme(setId);
    let queued = 0;
    Object.entries(PRELOAD_FACE_LABELS).forEach(([sides, labels]) => {
      labels.forEach((label) => {
        const source = getPreparedFaceArtSource(palette.id, Number(sides), label);
        getReferenceImageState(source.src, source.prepared);
        queued += 1;
      });
    });
    return queued;
  }

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
          let normal = new THREE.Vector3().crossVectors(ab, ac);
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
    const THREE = window.THREE;
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

  function getFaceLabels(sides, faceCount) {
    if (sides === 10) {
      return ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].slice(0, faceCount);
    }
    if (sides === 100) {
      return ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"].slice(0, faceCount);
    }
    return Array.from({ length: faceCount }, (_, index) => String(index + 1));
  }

  function getVertexLabels(sides, vertexCount) {
    if (sides === 4) {
      return ["1", "2", "3", "4"].slice(0, vertexCount);
    }
    return Array.from({ length: vertexCount }, (_, index) => String(index + 1));
  }

  function createDiceGeometry(sides) {
    const THREE = window.THREE;
    const vertices = getDieVertices(sides);
    const faces = buildConvexFaces(vertices);
    const positions = [];
    const normals = [];

    faces.forEach((face) => {
      const facePoints = face.indexes.map((index) => vertices[index]);
      const center = averagePoints(facePoints);
      const normal = face.normal.clone().normalize();
      for (let index = 1; index < facePoints.length - 1; index += 1) {
        [facePoints[0], facePoints[index], facePoints[index + 1]].forEach((point) => {
          positions.push(point.x, point.y, point.z);
          normals.push(normal.x, normal.y, normal.z);
        });
      }
      face.center = center;
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

  function hexToRgba(hexColor, alpha = 1) {
    const hex = String(hexColor || "#ffffff").replace("#", "");
    const full = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex.padEnd(6, "0").slice(0, 6);
    const value = Number.parseInt(full, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function makePanelPolygon(faceSides, dieSides, size = 512) {
    const cx = size / 2;
    const cy = size / 2;
    const pad = size * 0.026;
    if (faceSides === 3) {
      return [
        { x: cx, y: pad },
        { x: size - pad, y: size - pad },
        { x: pad, y: size - pad }
      ];
    }
    if (faceSides === 4 && (dieSides === 10 || dieSides === 100)) {
      // Imported Angel's Sword d10/d100 face art is authored as a tall kite.
      // Keep the UV guide close to that silhouette so trimmed face images do
      // not over-sample the ornamental crown and under-sample the numeral.
      return [
        { x: size * 0.5, y: size * 0.04 },
        { x: size * 0.94, y: size * 0.76 },
        { x: size * 0.5, y: size * 0.98 },
        { x: size * 0.06, y: size * 0.76 }
      ];
    }
    if (faceSides === 4) {
      return [
        { x: pad, y: pad },
        { x: size - pad, y: pad },
        { x: size - pad, y: size - pad },
        { x: pad, y: size - pad }
      ];
    }

    const radius = size * (faceSides === 5 ? 0.486 : 0.49);
    const start = -Math.PI / 2;
    return Array.from({ length: faceSides }, (_, index) => {
      const angle = start + (Math.PI * 2 * index) / faceSides;
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      };
    });
  }

  function getFacePanelLayout(face, vertices, dieSides) {
    const THREE = window.THREE;
    const entries = face.indexes.map((index) => ({
      index,
      point: vertices[index]
    }));
    const points = entries.map((entry) => entry.point);
    const center = averagePoints(points);
    if (Number(dieSides) !== 10 && Number(dieSides) !== 100) {
      return {
        points,
        center,
        upVector: points[0].clone().sub(center).normalize()
      };
    }

    const poleEntry = entries.find((entry) => entry.index === 0 || entry.index === 1) || null;
    const topEntry = poleEntry || entries.reduce((best, entry) => (
      entry.point.y > best.point.y ? entry : best
    ), entries[0]);
    const top = topEntry.point || points[0];
    const topDirection = top.clone().sub(center).normalize();
    const remainingEntries = entries.filter((entry) => entry !== topEntry);
    const bottomEntry = remainingEntries.reduce((best, entry) => {
      if (!best) {
        return entry;
      }
      const bestDot = best.point.clone().sub(center).dot(topDirection);
      const entryDot = entry.point.clone().sub(center).dot(topDirection);
      return entryDot < bestDot ? entry : best;
    }, null);
    const bottom = bottomEntry?.point || points[2] || points[0];
    const vertical = top.clone().sub(bottom).normalize();
    let horizontal = new THREE.Vector3().crossVectors(vertical, face.normal).normalize();
    if (!Number.isFinite(horizontal.lengthSq()) || horizontal.lengthSq() < 0.0001) {
      horizontal = new THREE.Vector3(1, 0, 0).projectOnPlane(face.normal).normalize();
    }
    const shoulderEntries = remainingEntries.filter((entry) => entry !== bottomEntry);
    const shoulderOne = shoulderEntries[0]?.point || points[1] || top;
    const shoulderTwo = shoulderEntries[1]?.point || points[3] || bottom;
    const shoulderOneDot = shoulderOne.clone().sub(center).dot(horizontal);
    const shoulderTwoDot = shoulderTwo.clone().sub(center).dot(horizontal);
    const right = shoulderOneDot >= shoulderTwoDot ? shoulderOne : shoulderTwo;
    const left = shoulderOneDot >= shoulderTwoDot ? shoulderTwo : shoulderOne;

    return {
      points: [top, right, bottom, left],
      center,
      upVector: top.clone().sub(center).normalize()
    };
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

  function interpolatePoint(a, b, amount) {
    return {
      x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount
    };
  }

  function drawScaleTexture(context, points, palette, size) {
    context.save();
    drawPolygonPath(context, points);
    context.clip();
    context.globalAlpha = 0.18;
    context.strokeStyle = hexToRgba(palette.trim, 0.72);
    context.lineWidth = 1.2;
    const step = size / 18;
    for (let y = size * 0.12; y < size * 0.92; y += step * 0.72) {
      for (let x = size * 0.04; x < size; x += step) {
        context.beginPath();
        context.arc(x + ((Math.floor(y / step) % 2) * step) / 2, y, step * 0.42, Math.PI, Math.PI * 2);
        context.stroke();
      }
    }
    context.restore();
  }

  function getPolygonCenter(points) {
    return points.reduce((center, point) => ({
      x: center.x + point.x / points.length,
      y: center.y + point.y / points.length
    }), { x: 0, y: 0 });
  }

  function getPolygonBounds(points) {
    return points.reduce((bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y)
    }), {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    });
  }

  function scalePolygon(points, scale) {
    const center = getPolygonCenter(points);
    return points.map((point) => ({
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale
    }));
  }

  function drawInsetPanelFrame(context, points, palette, size) {
    const inner = scalePolygon(points, 0.82);
    context.save();
    context.lineJoin = "round";
    context.lineCap = "round";
    drawPolygonPath(context, inner);
    context.lineWidth = size * 0.028;
    context.strokeStyle = hexToRgba(palette.trim, 0.82);
    context.stroke();
    drawPolygonPath(context, scalePolygon(points, 0.74));
    context.lineWidth = size * 0.008;
    context.strokeStyle = hexToRgba(palette.accent, 0.58);
    context.stroke();
    drawPolygonPath(context, scalePolygon(points, 0.64));
    context.lineWidth = size * 0.004;
    context.strokeStyle = "rgba(255, 255, 255, 0.42)";
    context.stroke();
    context.restore();
  }

  function drawArcanePanelLines(context, points, palette, size, faceSides) {
    const center = getPolygonCenter(points);
    context.save();
    drawPolygonPath(context, points);
    context.clip();
    context.lineCap = "round";
    context.lineJoin = "round";

    points.forEach((point, index) => {
      const start = interpolatePoint(center, point, 0.28);
      const end = interpolatePoint(center, point, faceSides === 3 ? 0.7 : 0.62);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.lineWidth = size * 0.005;
      context.strokeStyle = hexToRgba(index % 2 ? palette.accent2 : palette.accent, 0.36);
      context.stroke();
    });

    const medallionY = faceSides === 3 ? size * 0.42 : size * 0.43;
    const medallion = context.createRadialGradient(size * 0.5, medallionY, size * 0.04, size * 0.5, medallionY, size * 0.23);
    medallion.addColorStop(0, "rgba(255,255,255,0.74)");
    medallion.addColorStop(0.55, hexToRgba(palette.center, 0.42));
    medallion.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = medallion;
    context.beginPath();
    context.ellipse(size * 0.5, medallionY, size * 0.22, size * 0.16, 0, 0, Math.PI * 2);
    context.fill();

    context.restore();
  }

  function drawCornerInlays(context, points, palette) {
    points.forEach((point, index) => {
      const prev = points[(index - 1 + points.length) % points.length];
      const next = points[(index + 1) % points.length];
      const innerA = interpolatePoint(point, prev, 0.22);
      const innerB = interpolatePoint(point, next, 0.22);
      const innerC = {
        x: point.x + (innerA.x + innerB.x - point.x * 2) * 0.42,
        y: point.y + (innerA.y + innerB.y - point.y * 2) * 0.42
      };
      context.save();
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(innerA.x, innerA.y);
      context.quadraticCurveTo(innerC.x, innerC.y, innerB.x, innerB.y);
      context.closePath();
      context.fillStyle = index % 2 ? hexToRgba(palette.accent2, 0.9) : hexToRgba(palette.accent, 0.9);
      context.fill();
      context.lineWidth = 4;
      context.strokeStyle = hexToRgba(palette.trim, 0.92);
      context.stroke();
      context.restore();

      context.save();
      context.beginPath();
      context.arc(
        point.x + (innerC.x - point.x) * 0.58,
        point.y + (innerC.y - point.y) * 0.58,
        9,
        0,
        Math.PI * 2
      );
      context.fillStyle = palette.gem;
      context.shadowColor = palette.gem;
      context.shadowBlur = 12;
      context.fill();
      context.lineWidth = 3;
      context.strokeStyle = "#fff7d2";
      context.stroke();
      context.restore();
    });
  }

  function drawDiceCrest(context, palette, size, isSmallFace) {
    const cx = size / 2;
    const cy = size * (isSmallFace ? 0.66 : 0.68);
    const scale = size * (isSmallFace ? 0.105 : 0.13);
    context.save();
    context.translate(cx, cy);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalAlpha = 0.72;
    context.strokeStyle = hexToRgba(palette.trim, 0.96);
    context.fillStyle = hexToRgba(palette.accent, 0.64);
    context.lineWidth = Math.max(4, scale * 0.09);

    context.beginPath();
    context.moveTo(0, -scale * 1.15);
    context.lineTo(0, scale * 0.86);
    context.moveTo(-scale * 0.26, -scale * 0.74);
    context.lineTo(scale * 0.26, -scale * 0.74);
    context.moveTo(-scale * 0.18, scale * 0.78);
    context.lineTo(scale * 0.18, scale * 0.78);
    context.stroke();

    context.beginPath();
    context.ellipse(0, scale * 0.06, scale * 0.44, scale * 0.32, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    [-1, 1].forEach((side) => {
      context.beginPath();
      context.moveTo(side * scale * 0.24, -scale * 0.08);
      context.bezierCurveTo(side * scale * 0.9, -scale * 0.62, side * scale * 1.18, -scale * 0.1, side * scale * 1.46, -scale * 0.52);
      context.bezierCurveTo(side * scale * 1.04, scale * 0.2, side * scale * 0.62, scale * 0.38, side * scale * 0.24, scale * 0.18);
      context.stroke();
    });

    context.restore();
  }

  function drawFaceGem(context, x, y, radius, palette, options = {}) {
    const glow = options.glow ?? true;
    context.save();
    const gem = context.createRadialGradient(x - radius * 0.28, y - radius * 0.36, radius * 0.12, x, y, radius);
    gem.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    gem.addColorStop(0.35, hexToRgba(palette.gem, 0.96));
    gem.addColorStop(1, hexToRgba(palette.accent2, 0.95));
    context.fillStyle = gem;
    context.shadowColor = glow ? palette.gem : "transparent";
    context.shadowBlur = glow ? radius * 1.1 : 0;
    context.beginPath();
    context.moveTo(x, y - radius);
    context.lineTo(x + radius * 0.72, y);
    context.lineTo(x, y + radius);
    context.lineTo(x - radius * 0.72, y);
    context.closePath();
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = Math.max(2, radius * 0.18);
    context.strokeStyle = "rgba(255, 249, 222, 0.96)";
    context.stroke();
    context.lineWidth = Math.max(1, radius * 0.08);
    context.strokeStyle = hexToRgba(palette.trim, 0.98);
    context.stroke();
    context.restore();
  }

  function drawLabelQuietZone(context, points, palette, faceSides, dieSides, size, label = "", options = {}) {
    const safeLabel = String(label || "");
    const isKite = Number(dieSides) === 10 || Number(dieSides) === 100;
    const isTriangle = faceSides === 3;
    const isSquare = faceSides === 4 && !isKite;
    const isLong = safeLabel.length > 2;
    const isDouble = safeLabel.length === 2;
    const y = options.y ?? (isKite ? size * 0.448 : isTriangle ? size * 0.365 : isSquare ? size * 0.43 : size * 0.41);
    const rx = size * (isLong ? 0.32 : isDouble ? 0.27 : isTriangle ? 0.22 : 0.25);
    const ry = size * (isTriangle ? 0.17 : isKite ? 0.19 : 0.21);

    context.save();
    drawPolygonPath(context, points);
    context.clip();
    context.globalCompositeOperation = "source-over";
    const mask = context.createRadialGradient(size * 0.5, y - ry * 0.2, size * 0.04, size * 0.5, y, rx * 1.08);
    mask.addColorStop(0, "rgba(255, 255, 252, 0.99)");
    mask.addColorStop(0.52, hexToRgba(palette.center, 0.98));
    mask.addColorStop(0.82, hexToRgba(palette.pearl, 0.9));
    mask.addColorStop(1, hexToRgba(palette.pearl, options.softEdge ? 0.14 : 0.34));
    context.fillStyle = mask;
    context.beginPath();
    context.ellipse(size * 0.5, y, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = Math.max(3, size * 0.008);
    context.strokeStyle = hexToRgba(palette.trim, 0.58);
    context.stroke();
    context.restore();
  }

  function drawRibbonSwash(context, start, control, end, palette, size, widthScale = 1) {
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.quadraticCurveTo(control.x, control.y, end.x, end.y);
    context.lineWidth = size * 0.042 * widthScale;
    context.strokeStyle = hexToRgba(palette.trim, 0.62);
    context.stroke();
    context.lineWidth = size * 0.026 * widthScale;
    context.strokeStyle = hexToRgba(palette.accent2, 0.92);
    context.stroke();
    context.lineWidth = size * 0.012 * widthScale;
    context.strokeStyle = hexToRgba(palette.accent, 0.9);
    context.stroke();
    context.restore();
  }

  function getReferenceCrop(image, label, faceSides, dieSides) {
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    const dieKey = DIE_TEXTURE_KEYS[Number(dieSides) === 100 ? 100 : Number(dieSides)] || "d20";
    const safeLabel = String(label || "");
    const fitBox = (cx, cy, boxWidth, boxHeight) => ({
      sx: clamp(cx - boxWidth / 2, 0, Math.max(0, width - boxWidth)),
      sy: clamp(cy - boxHeight / 2, 0, Math.max(0, height - boxHeight)),
      sw: Math.min(width, boxWidth),
      sh: Math.min(height, boxHeight)
    });

    if (dieKey === "d6" && width >= 1000 && height >= 1000) {
      const square = Math.min(width, height) * 0.255;
      const positions = {
        "1": [0.53, 0.40],
        "2": [0.77, 0.40],
        "3": [0.53, 0.16],
        "4": [0.30, 0.40],
        "5": [0.53, 0.64],
        "6": [0.53, 0.88]
      };
      const [x, y] = positions[safeLabel] || positions["1"];
      return fitBox(width * x, height * y, square, square);
    }

    if ((dieKey === "d10" || dieKey === "d100") && width >= 1000 && height >= 1000) {
      const ringLabels = dieKey === "d100"
        ? ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"]
        : ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
      const index = Math.max(0, ringLabels.indexOf(safeLabel));
      const angle = -Math.PI / 2 + (index / ringLabels.length) * Math.PI * 2;
      const radius = Math.min(width, height) * 0.28;
      const cx = width * 0.5 + Math.cos(angle) * radius;
      const cy = height * 0.5 + Math.sin(angle) * radius;
      return fitBox(cx, cy, width * 0.28, height * 0.35);
    }

    if (dieKey === "d12" && width >= 1000 && height >= 1000) {
      const positions = {
        "1": [0.50, 0.14],
        "2": [0.36, 0.36],
        "3": [0.64, 0.36],
        "4": [0.22, 0.55],
        "5": [0.43, 0.55],
        "6": [0.57, 0.55],
        "7": [0.78, 0.55],
        "8": [0.31, 0.74],
        "9": [0.45, 0.74],
        "10": [0.61, 0.74],
        "11": [0.75, 0.74],
        "12": [0.50, 0.91]
      };
      const [x, y] = positions[safeLabel] || positions["1"];
      return fitBox(width * x, height * y, width * 0.25, height * 0.24);
    }

    if ((dieKey === "d20" || dieKey === "d8") && width > height * 1.05) {
      const faceCount = dieKey === "d20" ? 20 : 8;
      const number = clamp(Number(safeLabel) || 1, 1, faceCount);
      const columns = dieKey === "d20" ? 5 : 4;
      const rows = Math.ceil(faceCount / columns);
      const row = Math.floor((number - 1) / columns);
      const column = (number - 1) % columns;
      const left = width * 0.07;
      const top = height * 0.12;
      const gridWidth = width * 0.84;
      const gridHeight = height * (dieKey === "d20" ? 0.48 : 0.38);
      const cellWidth = gridWidth / columns;
      const cellHeight = gridHeight / rows;
      return fitBox(left + cellWidth * (column + 0.5), top + cellHeight * (row + 0.56), cellWidth * 0.72, cellHeight * 0.86);
    }

    if (dieKey === "d20" && width >= 1000 && height >= 1000) {
      const number = clamp(Number(safeLabel) || 1, 1, 20);
      const columns = 5;
      const row = Math.floor((number - 1) / columns);
      const column = (number - 1) % columns;
      return fitBox(width * (0.33 + column * 0.095), height * (0.12 + row * 0.105), width * 0.105, height * 0.13);
    }

    if (dieKey === "d8" && width >= 1000 && height >= 1000) {
      const number = clamp(Number(safeLabel) || 1, 1, 8);
      const column = (number - 1) % 4;
      const row = Math.floor((number - 1) / 4);
      return fitBox(width * (0.18 + column * 0.21), height * (0.22 + row * 0.21), width * 0.18, height * 0.2);
    }

    const box = Math.min(width, height) * (faceSides === 3 ? 0.42 : faceSides === 4 ? 0.48 : 0.4);
    return fitBox(width * 0.5, height * 0.48, box, box);
  }

  function drawPrettyReferenceLayer(context, state, label, palette, points, faceSides, dieSides, size, options = {}) {
    if (!state?.ready) {
      return false;
    }

    const image = state.image;
    const hasSpecificFaceArt = Boolean(options.specific);
    const crop = state.prepared
      ? (hasSpecificFaceArt
        ? getPreparedFaceCrop(state, {
          padScale: Number(dieSides) === 10 || Number(dieSides) === 100 ? 0.004 : 0.01
        })
        : null) || {
        sx: 0,
        sy: 0,
        sw: image.naturalWidth || image.width || size,
        sh: image.naturalHeight || image.height || size
      }
      : getReferenceCrop(image, label, faceSides, dieSides);
    context.save();
    drawPolygonPath(context, points);
    context.clip();
    context.globalAlpha = state.prepared
      ? hasSpecificFaceArt
        ? 0.98
        : label
          ? 0.98
          : 0.94
      : 0.72;
    const isSpecificKiteArt = state.prepared && hasSpecificFaceArt && (Number(dieSides) === 10 || Number(dieSides) === 100);
    if (isSpecificKiteArt) {
      const bounds = getPolygonBounds(points);
      const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
      const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
      const targetWidth = boundsWidth * 1.3;
      const targetHeight = boundsHeight * 1.26;
      const scale = Math.max(targetWidth / Math.max(1, crop.sw), targetHeight / Math.max(1, crop.sh));
      const drawWidth = crop.sw * scale * 1.24;
      const drawHeight = crop.sh * scale * 1.16;
      const drawX = (bounds.minX + bounds.maxX) / 2 - drawWidth / 2;
      const drawY = (bounds.minY + bounds.maxY) / 2 - drawHeight / 2 - boundsHeight * 0.045;
      context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, drawX, drawY, drawWidth, drawHeight);
      context.globalCompositeOperation = "multiply";
      context.fillStyle = "rgba(222, 176, 82, 0.16)";
      context.fillRect(bounds.minX, bounds.minY, boundsWidth, boundsHeight);
      context.globalCompositeOperation = "source-over";
      const edgeTone = context.createRadialGradient(
        (bounds.minX + bounds.maxX) / 2,
        bounds.minY + boundsHeight * 0.42,
        boundsWidth * 0.08,
        (bounds.minX + bounds.maxX) / 2,
        bounds.minY + boundsHeight * 0.46,
        boundsWidth * 0.72
      );
      edgeTone.addColorStop(0, "rgba(255, 247, 224, 0)");
      edgeTone.addColorStop(0.72, "rgba(133, 87, 30, 0.05)");
      edgeTone.addColorStop(1, "rgba(70, 45, 20, 0.12)");
      context.fillStyle = edgeTone;
      context.fillRect(bounds.minX, bounds.minY, boundsWidth, boundsHeight);
    } else {
      const edgeBleed = state.prepared && hasSpecificFaceArt
        ? 1.005
        : 1;
      const drawSize = size * edgeBleed;
      const drawOffset = (size - drawSize) / 2;
      const rotation = Number(options.rotation) || 0;
      if (Math.abs(rotation) > 0.0001) {
        const pivot = getPolygonCenter(points);
        context.save();
        context.translate(pivot.x, pivot.y);
        context.rotate(rotation);
        context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, drawOffset - pivot.x, drawOffset - pivot.y, drawSize, drawSize);
        context.restore();
      } else {
        context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, drawOffset, drawOffset, drawSize, drawSize);
      }
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = "screen";
    const glow = context.createRadialGradient(size * 0.5, size * 0.32, size * 0.08, size * 0.5, size * 0.45, size * 0.56);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.2)");
    glow.addColorStop(0.7, "rgba(255, 245, 220, 0.06)");
    glow.addColorStop(1, "rgba(255, 245, 220, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);
    context.globalCompositeOperation = "source-over";
    context.restore();

    // Reference sheets are sometimes style-only, so repaint the center label
    // cleanly while preserving the high-quality border, gems, and inlays.
    if (label && !hasSpecificFaceArt) {
      context.save();
      drawPolygonPath(context, points);
      context.clip();
      const centerY = faceSides === 3 ? size * 0.43 : size * 0.42;
      const maskGradient = context.createRadialGradient(size * 0.5, centerY, size * 0.08, size * 0.5, centerY, size * 0.24);
      maskGradient.addColorStop(0, hexToRgba(palette.center, 0.98));
      maskGradient.addColorStop(0.64, hexToRgba(palette.pearl, 0.88));
      maskGradient.addColorStop(1, hexToRgba(palette.pearl, 0));
      context.fillStyle = maskGradient;
      context.beginPath();
      context.ellipse(size * 0.5, centerY, size * (label.length > 2 ? 0.25 : 0.21), size * 0.17, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    return true;
  }

  function drawPolishedFallbackLayer(context, points, palette, faceSides, size) {
    const gradient = context.createRadialGradient(size * 0.45, size * 0.32, size * 0.08, size * 0.5, size * 0.52, size * 0.74);
    gradient.addColorStop(0, palette.center);
    gradient.addColorStop(0.46, palette.pearl);
    gradient.addColorStop(0.82, palette.face);
    gradient.addColorStop(1, hexToRgba(palette.accent2, 0.18));

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    context.save();
    drawPolygonPath(context, points);
    context.clip();
    drawScaleTexture(context, points, palette, size);
    drawArcanePanelLines(context, points, palette, size, faceSides);
    context.restore();
    drawInsetPanelFrame(context, points, palette, size);
    drawCornerInlays(context, points, palette);
    drawDiceCrest(context, palette, size, faceSides === 3);
  }

  function drawImportedKiteBackdrop(context, points, palette, size) {
    const center = getPolygonCenter(points);
    context.save();
    drawPolygonPath(context, points);
    context.clip();

    const faceFill = context.createRadialGradient(size * 0.5, size * 0.36, size * 0.05, size * 0.5, size * 0.54, size * 0.74);
    faceFill.addColorStop(0, hexToRgba(palette.center, 0.98));
    faceFill.addColorStop(0.54, hexToRgba(palette.pearl, 0.92));
    faceFill.addColorStop(1, hexToRgba(palette.face, 0.98));
    context.fillStyle = faceFill;
    context.fillRect(0, 0, size, size);

    const [top, right, bottom, left] = points;
    const accentFill = context.createLinearGradient(0, 0, size, size);
    accentFill.addColorStop(0, hexToRgba(palette.accent2, 0.94));
    accentFill.addColorStop(0.5, hexToRgba(palette.accent, 0.74));
    accentFill.addColorStop(1, hexToRgba(palette.accent2, 0.94));
    context.fillStyle = accentFill;
    [
      [top, interpolatePoint(top, right, 0.38), interpolatePoint(left, top, 0.38)],
      [right, interpolatePoint(right, bottom, 0.34), interpolatePoint(top, right, 0.34)],
      [bottom, interpolatePoint(left, bottom, 0.34), interpolatePoint(bottom, right, 0.34)],
      [left, interpolatePoint(top, left, 0.34), interpolatePoint(left, bottom, 0.34)]
    ].forEach((triangle) => {
      context.beginPath();
      context.moveTo(triangle[0].x, triangle[0].y);
      context.lineTo(triangle[1].x, triangle[1].y);
      context.lineTo(triangle[2].x, triangle[2].y);
      context.closePath();
      context.fill();
    });

    context.strokeStyle = hexToRgba(palette.trim, 0.78);
    context.lineWidth = size * 0.012;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const start = interpolatePoint(center, point, 0.26);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.beginPath();
    drawPolygonPath(context, points);
    context.lineWidth = size * 0.014;
    context.strokeStyle = hexToRgba(palette.trim, 0.86);
    context.stroke();
    context.restore();
  }

  function drawSpecialFaceMotif(context, label, palette, faceSides, dieSides, size) {
    const safeLabel = String(label || "");
    if (!safeLabel) {
      return;
    }

    const isD8 = Number(dieSides) === 8;
    const isKite = Number(dieSides) === 10 || Number(dieSides) === 100;
    if (!isD8 && !isKite) {
      return;
    }

    const points = makePanelPolygon(faceSides, dieSides, size);
    const center = getPolygonCenter(points);
    context.save();
    drawPolygonPath(context, points);
    context.clip();

    if (isD8) {
      const top = points[0];
      const right = points[1];
      const left = points[2];

      // Keep the D8 art procedural: the reference sheets describe the style,
      // but a clean triangular panel reads better once it is moving in 3D.
      const pearlWash = context.createRadialGradient(size * 0.5, size * 0.38, size * 0.06, size * 0.5, size * 0.52, size * 0.58);
      pearlWash.addColorStop(0, "rgba(255, 255, 250, 0.96)");
      pearlWash.addColorStop(0.48, hexToRgba(palette.pearl, 0.82));
      pearlWash.addColorStop(1, hexToRgba(palette.center, 0.18));
      context.fillStyle = pearlWash;
      context.beginPath();
      context.moveTo(size * 0.5, size * 0.12);
      context.lineTo(size * 0.82, size * 0.77);
      context.lineTo(size * 0.18, size * 0.77);
      context.closePath();
      context.fill();

      const lowerLeft = interpolatePoint(left, right, 0.12);
      const lowerRight = interpolatePoint(right, left, 0.12);
      const lowerPeak = { x: size * 0.5, y: size * 0.84 };
      const lowerFill = context.createLinearGradient(0, size * 0.45, size, size);
      lowerFill.addColorStop(0, hexToRgba(palette.accent2, 0.96));
      lowerFill.addColorStop(0.42, hexToRgba(palette.accent, 0.48));
      lowerFill.addColorStop(1, hexToRgba(palette.accent2, 0.96));
      context.fillStyle = lowerFill;
      context.beginPath();
      context.moveTo(left.x + size * 0.055, left.y - size * 0.055);
      context.quadraticCurveTo(size * 0.28, size * 0.7, lowerPeak.x, lowerPeak.y);
      context.quadraticCurveTo(size * 0.72, size * 0.7, right.x - size * 0.055, right.y - size * 0.055);
      context.lineTo(lowerRight.x, lowerRight.y + size * 0.012);
      context.quadraticCurveTo(size * 0.5, size * 0.96, lowerLeft.x, lowerLeft.y + size * 0.012);
      context.closePath();
      context.fill();
      context.lineWidth = size * 0.018;
      context.strokeStyle = hexToRgba(palette.trim, 0.9);
      context.stroke();

      const topInlay = context.createLinearGradient(size * 0.5, size * 0.08, size * 0.5, size * 0.28);
      topInlay.addColorStop(0, hexToRgba(palette.accent2, 0.96));
      topInlay.addColorStop(1, hexToRgba(palette.accent, 0.62));
      context.fillStyle = topInlay;
      context.beginPath();
      context.moveTo(size * 0.5, size * 0.095);
      context.lineTo(size * 0.58, size * 0.24);
      context.lineTo(size * 0.5, size * 0.205);
      context.lineTo(size * 0.42, size * 0.24);
      context.closePath();
      context.fill();
      context.lineWidth = size * 0.012;
      context.strokeStyle = hexToRgba(palette.trim, 0.92);
      context.stroke();

      context.fillStyle = hexToRgba(palette.pearl, 0.5);
      [
        [
          { x: size * 0.17, y: size * 0.77 },
          { x: size * 0.33, y: size * 0.64 },
          { x: size * 0.49, y: size * 0.82 },
          { x: size * 0.28, y: size * 0.89 }
        ],
        [
          { x: size * 0.83, y: size * 0.77 },
          { x: size * 0.67, y: size * 0.64 },
          { x: size * 0.51, y: size * 0.82 },
          { x: size * 0.72, y: size * 0.89 }
        ]
      ].forEach((panel) => {
        context.beginPath();
        context.moveTo(panel[0].x, panel[0].y);
        panel.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.closePath();
        context.fill();
      });

      drawRibbonSwash(
        context,
        { x: size * 0.19, y: size * 0.8 },
        { x: size * 0.5, y: size * 0.62 },
        { x: size * 0.81, y: size * 0.8 },
        palette,
        size,
        0.72
      );

      context.strokeStyle = hexToRgba(palette.trim, 0.72);
      context.lineWidth = size * 0.007;
      [
        [left, { x: size * 0.34, y: size * 0.6 }],
        [right, { x: size * 0.66, y: size * 0.6 }],
        [top, { x: size * 0.5, y: size * 0.25 }]
      ].forEach(([point, target]) => {
        const start = interpolatePoint(center, point, 0.2);
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(target.x, target.y);
        context.stroke();
      });

      drawFaceGem(context, size * 0.5, size * 0.105, size * 0.04, palette);
      drawFaceGem(context, size * 0.5, size * 0.67, size * 0.028, palette, { glow: false });
      drawFaceGem(context, size * 0.23, size * 0.83, size * 0.032, palette, { glow: false });
      drawFaceGem(context, size * 0.77, size * 0.83, size * 0.032, palette, { glow: false });
    }

    if (isKite) {
      const sideRibbon = context.createLinearGradient(0, 0, size, size);
      sideRibbon.addColorStop(0, hexToRgba(palette.accent2, 0.98));
      sideRibbon.addColorStop(0.34, hexToRgba(palette.accent, 0.72));
      sideRibbon.addColorStop(0.66, hexToRgba(palette.accent, 0.48));
      sideRibbon.addColorStop(1, hexToRgba(palette.accent2, 0.98));
      context.fillStyle = sideRibbon;
      [
        [
          { x: size * 0.08, y: size * 0.5 },
          { x: size * 0.39, y: size * 0.15 },
          { x: size * 0.47, y: size * 0.5 },
          { x: size * 0.39, y: size * 0.85 }
        ],
        [
          { x: size * 0.92, y: size * 0.5 },
          { x: size * 0.61, y: size * 0.15 },
          { x: size * 0.53, y: size * 0.5 },
          { x: size * 0.61, y: size * 0.85 }
        ]
      ].forEach((ribbon) => {
        context.beginPath();
        context.moveTo(ribbon[0].x, ribbon[0].y);
        ribbon.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.closePath();
        context.fill();
        context.lineWidth = size * 0.012;
        context.strokeStyle = hexToRgba(palette.trim, 0.82);
        context.stroke();
      });

      const centerPanel = context.createRadialGradient(size * 0.5, size * 0.45, size * 0.08, size * 0.5, size * 0.5, size * 0.35);
      centerPanel.addColorStop(0, hexToRgba(palette.center, 0.96));
      centerPanel.addColorStop(0.64, hexToRgba(palette.pearl, 0.74));
      centerPanel.addColorStop(1, hexToRgba(palette.pearl, 0));
      context.fillStyle = centerPanel;
      context.beginPath();
      context.ellipse(size * 0.5, size * 0.45, size * 0.23, size * 0.28, 0, 0, Math.PI * 2);
      context.fill();

      context.lineWidth = size * 0.009;
      context.strokeStyle = hexToRgba(palette.trim, 0.62);
      context.beginPath();
      context.moveTo(size * 0.5, size * 0.07);
      context.lineTo(size * 0.5, size * 0.25);
      context.moveTo(size * 0.5, size * 0.75);
      context.lineTo(size * 0.5, size * 0.93);
      context.moveTo(size * 0.17, size * 0.5);
      context.quadraticCurveTo(size * 0.36, size * 0.43, size * 0.5, size * 0.5);
      context.quadraticCurveTo(size * 0.64, size * 0.43, size * 0.83, size * 0.5);
      context.stroke();
      drawFaceGem(context, size * 0.5, size * 0.1, size * 0.035, palette);
      drawFaceGem(context, size * 0.5, size * 0.9, size * 0.035, palette, { glow: false });
    }

    context.restore();
  }

  function drawCorrectedFaceLabel(context, label, palette, faceSides, size, options = {}) {
    const safeLabel = String(label || "");
    if (!safeLabel) {
      return;
    }
    context.save();
    const compact = Boolean(options.compact);
    const prominent = Boolean(options.prominent);
    const isLong = safeLabel.length > 2;
    const isDouble = safeLabel.length === 2;
    const isTriangle = faceSides === 3;
    const isKite = faceSides === 4 && Boolean(options.kite);
    const trianglePanel = Boolean(options.trianglePanel);
    const fontSize = prominent
      ? isTriangle
        ? (isLong ? 136 : isDouble ? 172 : trianglePanel ? 218 : 184)
        : isKite
          ? (isLong ? 164 : isDouble ? 198 : 232)
          : (isLong ? 136 : isDouble ? 166 : 204)
      : compact
      ? (isLong ? 74 : isDouble ? 88 : 104)
      : (isLong ? 106 : isDouble ? 134 : 172);
    const y = Number.isFinite(options.y)
      ? options.y
      : compact
      ? size * 0.21
      : prominent
        ? (isKite ? size * 0.46 : isTriangle ? (trianglePanel ? size * 0.395 : size * 0.355) : size * 0.43)
        : (faceSides === 3 ? size * 0.412 : size * 0.422);
    if (prominent) {
      const badgeWidth = size * (isLong ? 0.55 : isDouble ? 0.5 : isTriangle ? (trianglePanel ? 0.37 : 0.31) : 0.4);
      const badgeHeight = size * (isTriangle ? (trianglePanel ? 0.18 : 0.15) : isKite ? 0.22 : 0.215);
      const badge = context.createRadialGradient(size * 0.5, y - badgeHeight * 0.12, size * 0.04, size * 0.5, y, badgeWidth * 0.65);
      badge.addColorStop(0, "rgba(255, 255, 250, 0.99)");
      badge.addColorStop(0.6, hexToRgba(palette.center, 0.94));
      badge.addColorStop(0.86, hexToRgba(palette.pearl, 0.54));
      badge.addColorStop(1, hexToRgba(palette.pearl, 0.08));
      context.fillStyle = badge;
      context.beginPath();
      context.ellipse(size * 0.5, y, badgeWidth, badgeHeight, 0, 0, Math.PI * 2);
      context.fill();
      context.lineWidth = size * 0.008;
      context.strokeStyle = hexToRgba(palette.trim, 0.32);
      context.stroke();
    }
    context.font = `900 ${fontSize}px Georgia, "Times New Roman", serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = palette.number;
    context.shadowColor = prominent ? "rgba(30, 18, 4, 0.62)" : "rgba(30, 18, 4, 0.34)";
    context.shadowBlur = prominent ? 8 : 7;
    context.shadowOffsetY = prominent ? 1 : 5;
    if (prominent) {
      context.lineWidth = isLong ? 28 : 32;
      context.strokeStyle = "rgba(255, 252, 238, 0.98)";
      context.strokeText(safeLabel, size * 0.5, y);
      context.lineWidth = isLong ? 10 : 13;
      context.strokeStyle = "rgba(52, 28, 6, 0.78)";
      context.strokeText(safeLabel, size * 0.5, y);
    } else {
      context.lineWidth = compact ? 7 : (isLong ? 10 : 13);
      context.strokeStyle = "rgba(255, 248, 226, 0.95)";
      context.strokeText(safeLabel, size * 0.5, y);
    }
    context.fillText(safeLabel, size * 0.5, y);
    context.shadowBlur = 0;
    context.lineWidth = prominent ? 5 : 2;
    context.strokeStyle = hexToRgba(palette.trim, prominent ? 0.95 : 0.78);
    context.strokeText(safeLabel, size * 0.5, y);
    context.restore();
  }

  function drawD4CornerLabels(context, cornerLabels, palette, points, size) {
    if (!Array.isArray(cornerLabels) || !cornerLabels.length) {
      return;
    }

    const center = getPolygonCenter(points);
    context.save();
    drawPolygonPath(context, points);
    context.clip();
    cornerLabels.forEach((label, index) => {
      const safeLabel = String(label || "");
      if (!safeLabel) {
        return;
      }

      const point = points[index] || points[0];
      const anchor = interpolatePoint(point, center, 0.2);
      context.save();
      context.translate(anchor.x, anchor.y);

      const backing = context.createRadialGradient(0, -4, 4, 0, 0, size * 0.07);
      backing.addColorStop(0, "rgba(255, 250, 232, 0.94)");
      backing.addColorStop(0.72, hexToRgba(palette.center, 0.62));
      backing.addColorStop(1, "rgba(255, 250, 232, 0)");
      context.fillStyle = backing;
      context.beginPath();
      context.ellipse(0, 0, size * 0.052, size * 0.043, 0, 0, Math.PI * 2);
      context.fill();

      context.font = `900 ${Math.round(size * 0.092)}px Georgia, "Times New Roman", serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineJoin = "round";
      context.lineWidth = size * 0.012;
      context.strokeStyle = "rgba(255, 250, 225, 0.92)";
      context.fillStyle = palette.number;
      context.shadowColor = hexToRgba(palette.trim, 0.5);
      context.shadowBlur = size * 0.012;
      context.strokeText(safeLabel, 0, size * 0.006);
      context.fillText(safeLabel, 0, size * 0.006);
      context.shadowBlur = 0;
      context.lineWidth = size * 0.003;
      context.strokeStyle = hexToRgba(palette.trim, 0.95);
      context.strokeText(safeLabel, 0, size * 0.006);
      context.restore();
    });
    context.restore();
  }

  function drawSpriteSkinPhysicsOrnaments(context, label, palette, faceSides, dieSides, size) {
    const safeLabel = String(label || "");
    const sides = Number(dieSides);
    if (!safeLabel) {
      return;
    }

    if (sides === 8 || sides === 10 || sides === 100) {
      drawSpecialFaceMotif(context, safeLabel, palette, faceSides, dieSides, size);
      return;
    }

    const points = makePanelPolygon(faceSides, dieSides, size);
    const center = getPolygonCenter(points);
    context.save();
    drawPolygonPath(context, points);
    context.clip();

    if (sides === 6) {
      const inner = points.map((point) => interpolatePoint(point, center, 0.24));
      const accentWash = context.createLinearGradient(0, 0, size, size);
      accentWash.addColorStop(0, hexToRgba(palette.accent2, 0.94));
      accentWash.addColorStop(0.5, hexToRgba(palette.accent, 0.62));
      accentWash.addColorStop(1, hexToRgba(palette.accent2, 0.94));

      context.fillStyle = accentWash;
      points.forEach((point, index) => {
        const next = points[(index + 1) % points.length];
        const innerPoint = inner[index];
        const innerNext = inner[(index + 1) % inner.length];
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(next.x, next.y);
        context.lineTo(innerNext.x, innerNext.y);
        context.quadraticCurveTo(center.x, center.y, innerPoint.x, innerPoint.y);
        context.closePath();
        context.fill();
        context.lineWidth = size * 0.01;
        context.strokeStyle = hexToRgba(palette.trim, 0.72);
        context.stroke();
      });

      const centerPanel = context.createRadialGradient(size * 0.5, size * 0.45, size * 0.04, size * 0.5, size * 0.5, size * 0.34);
      centerPanel.addColorStop(0, "rgba(255, 255, 250, 0.98)");
      centerPanel.addColorStop(0.62, hexToRgba(palette.center, 0.92));
      centerPanel.addColorStop(1, hexToRgba(palette.pearl, 0.1));
      context.fillStyle = centerPanel;
      context.beginPath();
      context.ellipse(size * 0.5, size * 0.44, size * 0.29, size * 0.27, 0, 0, Math.PI * 2);
      context.fill();
      context.lineWidth = size * 0.01;
      context.strokeStyle = hexToRgba(palette.trim, 0.46);
      context.stroke();

      drawRibbonSwash(
        context,
        { x: size * 0.18, y: size * 0.75 },
        { x: size * 0.5, y: size * 0.62 },
        { x: size * 0.82, y: size * 0.75 },
        palette,
        size,
        0.76
      );
      drawFaceGem(context, size * 0.5, size * 0.09, size * 0.035, palette);
      drawFaceGem(context, size * 0.5, size * 0.91, size * 0.035, palette, { glow: false });
    }

    if (sides === 12) {
      const top = points[0];
      const lowerLeft = points[2] || points[0];
      const lowerRight = points[3] || points[points.length - 1];
      const upperWash = context.createLinearGradient(size * 0.5, 0, size * 0.5, size);
      upperWash.addColorStop(0, hexToRgba(palette.accent, 0.74));
      upperWash.addColorStop(0.28, hexToRgba(palette.accent2, 0.25));
      upperWash.addColorStop(1, "rgba(255,255,255,0)");

      context.fillStyle = upperWash;
      context.beginPath();
      context.moveTo(top.x, top.y);
      context.lineTo(size * 0.78, size * 0.33);
      context.quadraticCurveTo(size * 0.5, size * 0.27, size * 0.22, size * 0.33);
      context.closePath();
      context.fill();

      const lowerRibbon = context.createLinearGradient(0, size * 0.45, size, size);
      lowerRibbon.addColorStop(0, hexToRgba(palette.accent2, 0.94));
      lowerRibbon.addColorStop(0.5, hexToRgba(palette.accent, 0.58));
      lowerRibbon.addColorStop(1, hexToRgba(palette.accent2, 0.94));
      context.fillStyle = lowerRibbon;
      context.beginPath();
      context.moveTo(lowerLeft.x + size * 0.05, lowerLeft.y - size * 0.04);
      context.quadraticCurveTo(size * 0.5, size * 0.68, lowerRight.x - size * 0.05, lowerRight.y - size * 0.04);
      context.lineTo(size * 0.68, size * 0.88);
      context.quadraticCurveTo(size * 0.5, size * 0.78, size * 0.32, size * 0.88);
      context.closePath();
      context.fill();
      context.lineWidth = size * 0.012;
      context.strokeStyle = hexToRgba(palette.trim, 0.78);
      context.stroke();

      context.lineWidth = size * 0.008;
      context.strokeStyle = hexToRgba(palette.trim, 0.54);
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        const start = interpolatePoint(center, point, 0.28);
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(point.x, point.y);
        context.stroke();
      }

      drawFaceGem(context, size * 0.5, size * 0.12, size * 0.035, palette);
      drawFaceGem(context, size * 0.5, size * 0.79, size * 0.03, palette, { glow: false });
      drawFaceGem(context, size * 0.22, size * 0.64, size * 0.026, palette, { glow: false });
      drawFaceGem(context, size * 0.78, size * 0.64, size * 0.026, palette, { glow: false });
    }

    context.restore();
  }

  function makeFaceSkinTexture(label, palette, faceSides, dieSides, options = {}) {
    const safeLabel = String(label || "");
    const cornerKey = Array.isArray(options.cornerLabels) ? options.cornerLabels.join("-") : "";
    const forcePrimaryLabel = Boolean(options.forcePrimaryLabel);
    const primaryLabelY = Number.isFinite(options.primaryLabelY) ? options.primaryLabelY : null;
    const spriteSkinPhysics = usesSpriteSkinPhysics(dieSides, { ...options, setId: palette.id });
    const skinModeKey = spriteSkinPhysics ? "sprite-skin-physics" : "reference-physics";
    const cacheKey = `${ROLLER_VERSION}:${skinModeKey}:${palette.id}:${dieSides}:${faceSides}:${safeLabel}:${cornerKey}`;
    if (skinTextureCache.has(cacheKey)) {
      return skinTextureCache.get(cacheKey);
    }

    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 768;
    const context = canvas.getContext("2d");
    const points = makePanelPolygon(faceSides, dieSides, canvas.width);

    const d4FaceArt = getD4FaceArtTransform(safeLabel, dieSides);
    const faceArtSource = spriteSkinPhysics
      ? { src: "", prepared: false, specific: false }
      : getPreparedFaceArtSource(palette.id, dieSides, d4FaceArt.sourceLabel);
    const referenceState = spriteSkinPhysics
      ? { ready: false, failed: true, callbacks: [] }
      : getReferenceImageState(faceArtSource.src, faceArtSource.prepared);
    // Sprite-Skin Physics Dice deliberately stop cropping reference sheets.
    // The physical die result owns the number, then procedural art fills the
    // face. This avoids duplicate numbers, backwards crops, and white seams.
    const hasSpecificFaceArt = Boolean(faceArtSource.specific);
    const useRawSpecificFaceArt = hasSpecificFaceArt && (Number(dieSides) === 10 || Number(dieSides) === 100);
    const skipReferenceLayer = spriteSkinPhysics || (!hasSpecificFaceArt && (Number(dieSides) === 8 || Number(dieSides) === 10 || Number(dieSides) === 100));
    let texture = null;
    const render = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (useRawSpecificFaceArt) {
        drawImportedKiteBackdrop(context, points, palette, canvas.width);
      }
      if (!useRawSpecificFaceArt) {
        drawPolishedFallbackLayer(context, points, palette, faceSides, canvas.width);
        if (spriteSkinPhysics) {
          drawSpriteSkinPhysicsOrnaments(context, safeLabel, palette, faceSides, dieSides, canvas.width);
        } else if (skipReferenceLayer) {
          drawSpecialFaceMotif(context, safeLabel, palette, faceSides, dieSides, canvas.width);
        }
      }
      if (!skipReferenceLayer) {
        drawPrettyReferenceLayer(context, referenceState, safeLabel, palette, points, faceSides, dieSides, canvas.width, {
          specific: faceArtSource.specific,
          rotation: d4FaceArt.rotation
        });
      }

      if (!useRawSpecificFaceArt) {
        context.save();
        drawPolygonPath(context, points);
        context.shadowColor = "rgba(0, 0, 0, 0.34)";
        context.shadowBlur = 18;
        context.lineJoin = "round";
        context.lineWidth = 30;
        context.strokeStyle = hexToRgba(palette.trim, 0.98);
        context.stroke();
        context.shadowBlur = 0;
        context.lineWidth = 12;
        context.strokeStyle = "#fff0b2";
        context.stroke();
        context.lineWidth = 4;
        context.strokeStyle = hexToRgba(palette.accent2, 0.78);
        context.stroke();
        context.restore();
      }

      if (!useRawSpecificFaceArt && dieSides === 4 && Array.isArray(options.cornerLabels) && !hasSpecificFaceArt) {
        drawD4CornerLabels(context, options.cornerLabels, palette, points, canvas.width);
      }

      const needsFallbackLabel = !useRawSpecificFaceArt && Boolean(safeLabel) && !spriteSkinPhysics && (!referenceState.ready || referenceState.failed);
      const needsClarityLabel = !useRawSpecificFaceArt && Boolean(safeLabel) && skipReferenceLayer;
      const needsPrimaryD4Label = !useRawSpecificFaceArt && Boolean(safeLabel) && Number(dieSides) === 4 && forcePrimaryLabel;
      const needsPrimaryD6Label = Boolean(safeLabel) && Number(dieSides) === 6 && !hasSpecificFaceArt;
      const needsSpriteSkinLabel = Boolean(safeLabel) && spriteSkinPhysics;
      if (needsFallbackLabel || needsClarityLabel || needsPrimaryD4Label || needsPrimaryD6Label || needsSpriteSkinLabel) {
        drawLabelQuietZone(context, points, palette, faceSides, dieSides, canvas.width, safeLabel, {
          softEdge: !(needsPrimaryD4Label || needsPrimaryD6Label || needsSpriteSkinLabel),
          y: needsPrimaryD4Label
            ? canvas.width * (primaryLabelY || 0.62)
            : Number(dieSides) === 8
              ? canvas.width * 0.355
              : undefined
        });
        drawCorrectedFaceLabel(context, safeLabel, palette, faceSides, canvas.width, {
          compact: false,
          kite: Number(dieSides) === 10 || Number(dieSides) === 100,
          trianglePanel: Number(dieSides) === 8,
          prominent: needsClarityLabel || needsPrimaryD4Label || needsPrimaryD6Label || needsSpriteSkinLabel,
          y: needsPrimaryD4Label ? canvas.width * (primaryLabelY || 0.62) : undefined
        });
      }
      if (texture) {
        texture.needsUpdate = true;
      }
    };

    render();
    texture = new window.THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    if ("colorSpace" in texture && window.THREE.SRGBColorSpace) {
      texture.colorSpace = window.THREE.SRGBColorSpace;
    } else if ("encoding" in texture && window.THREE.sRGBEncoding) {
      texture.encoding = window.THREE.sRGBEncoding;
    }
    texture.needsUpdate = true;
    if (!spriteSkinPhysics && !referenceState.ready && !referenceState.failed) {
      referenceState.callbacks.push(render);
    }
    skinTextureCache.set(cacheKey, texture);
    return texture;
  }

  function createFacePanelGeometry(face, vertices, dieSides) {
    const THREE = window.THREE;
    const layout = getFacePanelLayout(face, vertices, dieSides);
    const points = layout.points;
    const normal = face.normal.clone().normalize();
    const canonicalUvs = makePanelPolygon(face.indexes.length, dieSides, 1);
    const positions = [];
    const normals = [];
    const uvs = [];
    const isKiteFace = Number(dieSides) === 10 || Number(dieSides) === 100;
    const pushPoint = (point, uv) => {
      const raised = point.clone().add(normal.clone().multiplyScalar(0.023));
      positions.push(raised.x, raised.y, raised.z);
      normals.push(normal.x, normal.y, normal.z);
      if (isKiteFace) {
        uvs.push(uv.x, 1 - uv.y);
        return;
      }
      if (Number(dieSides) === 4) {
        // The Angel Sword D4 uses imported numbered face art, so mirror it the
        // same way as other face-read dice instead of adding vertex labels.
        uvs.push(1 - uv.x, 1 - uv.y);
        return;
      }
      // Mirror both UV axes so canvas-rendered face labels read left-to-right
      // after Three.js projects the raised face panel onto the die mesh.
      uvs.push(1 - uv.x, 1 - uv.y);
    };
    const pushTriangle = (pointA, uvA, pointB, uvB, pointC, uvC) => {
      const triangleNormal = new THREE.Vector3()
        .subVectors(pointB, pointA)
        .cross(new THREE.Vector3().subVectors(pointC, pointA))
        .normalize();
      if (triangleNormal.dot(normal) < 0) {
        pushPoint(pointA, uvA);
        pushPoint(pointC, uvC);
        pushPoint(pointB, uvB);
        return;
      }
      pushPoint(pointA, uvA);
      pushPoint(pointB, uvB);
      pushPoint(pointC, uvC);
    };

    for (let index = 1; index < points.length - 1; index += 1) {
      pushTriangle(
        points[0],
        canonicalUvs[0],
        points[index],
        canonicalUvs[index],
        points[index + 1],
        canonicalUvs[index + 1]
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    return geometry;
  }

  function addFaceSkins(group, vertices, faces, sides, palette) {
    const THREE = window.THREE;
    const labels = getFaceLabels(sides, faces.length);
    faces.forEach((face, index) => {
      const label = labels[index] || String(index + 1);
      const faceArtSource = getPreparedFaceArtSource(palette.id, sides, label);
      const usesTransparentImportedFace = Boolean(
        faceArtSource.specific && (Number(sides) === 10 || Number(sides) === 100)
      );
      const texture = makeFaceSkinTexture(label, palette, face.indexes.length, sides);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: usesTransparentImportedFace,
        alphaTest: usesTransparentImportedFace ? 0.04 : 0,
        depthWrite: usesTransparentImportedFace,
        side: THREE.FrontSide
      });
      const panel = new THREE.Mesh(createFacePanelGeometry(face, vertices, sides), material);
      panel.renderOrder = 2;
      panel.userData.faceLabel = labels[index];
      group.add(panel);
    });
    return labels;
  }

  function createDie(sides, value, palette) {
    const THREE = window.THREE;
    const safeSides = Number(sides) === 100 ? 100 : Math.max(4, Number(sides) || 20);
    const { geometry, vertices, faces } = createDiceGeometry(safeSides);
    const material = new THREE.MeshStandardMaterial({
      color: palette.shell,
      roughness: 0.28,
      metalness: 0.08,
      emissive: palette.shell2,
      emissiveIntensity: 0.035,
      flatShading: true
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const group = new THREE.Group();
    group.add(mesh);

    const edges = new THREE.LineSegments(
      createBoundaryEdges(vertices, faces),
      new THREE.LineBasicMaterial({
        color: palette.edge,
        transparent: true,
        opacity: 0.95
      })
    );
    group.add(edges);

    const vertexLabels = [];
    const readMode = "face";
    const baseFaceLabels = getFaceLabels(safeSides, faces.length);
    const resultLabel = safeSides === 10
      ? (Number(value) === 10 ? "0" : String(Number(value) || 1))
      : safeSides === 100
        ? (Number(value) >= 100 ? "00" : String(Math.floor((Number(value) || 0) / 10) * 10).padStart(2, "0"))
        : String(Number(value) || 1);
    const readableLabels = readMode === "vertex" ? vertexLabels : baseFaceLabels;
    let resultIndex = readableLabels.indexOf(resultLabel);
    if (resultIndex < 0) {
      resultIndex = clamp((Number(value) || 1) - 1, 0, readableLabels.length - 1);
    }
    const labels = addFaceSkins(group, vertices, faces, safeSides, palette);
    const resultNormal = readMode === "vertex"
      ? vertices[resultIndex]?.clone().normalize()
      : faces[resultIndex]?.normal?.clone();

    group.userData = {
      sides: safeSides,
      dieType: DIE_TYPES[safeSides] || "d20",
      value,
      resultLabel,
      resultIndex,
      readMode,
      faceCount: faces.length,
      expectedFaces: safeSides === 100 ? 10 : safeSides,
      faceLabels: labels,
      faceIndexes: faces.map((face) => [...face.indexes]),
      faceNormals: faces.map((face) => face.normal.clone()),
      faceUpVectors: faces.map((face) => getFacePanelLayout(face, vertices, safeSides).upVector.clone()),
      vertexLabels,
      vertexNormals: vertices.map((vertex) => vertex.clone().normalize()),
      resultNormal: resultNormal || new THREE.Vector3(0, 0, 1),
      glow: palette.glow
    };
    return group;
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

  function readVectorForDie(die) {
    const THREE = window.THREE;
    if (die.userData.readMode === "vertex") {
      // D4s are read from the visually highest pyramid point, not from pure
      // world-up. This matches what the player sees through the roller camera.
      return screenUpVector();
    }
    // Face-read dice settle toward the camera, not pure world-up, so the
    // reported result is the number the player can actually see.
    return new THREE.Vector3(0, 0.52, 0.85).normalize();
  }

  function screenUpVector() {
    const THREE = window.THREE;
    // Matches the PerspectiveCamera lookAt used by the roller. This keeps
    // multi-digit labels such as 14 and 17 from resting sideways or inverted.
    return new THREE.Vector3(0, 0.86, -0.51).normalize();
  }

  function cameraFacingVector() {
    const THREE = window.THREE;
    return new THREE.Vector3(0, 0.52, 0.85).normalize();
  }

  function createD4ReadCamera() {
    const THREE = window.THREE;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 4.8, 8.6);
    camera.lookAt(0, -0.45, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    return camera;
  }

  function projectD4Vertex(die, vertex, quaternion, camera = createD4ReadCamera()) {
    return vertex.clone()
      .multiply(die.scale || new window.THREE.Vector3(1, 1, 1))
      .applyQuaternion(quaternion)
      .add(die.position || new window.THREE.Vector3())
      .project(camera);
  }

  function screenTopVertexLabelForDie(die, quaternion = die.quaternion) {
    const labels = die.userData.vertexLabels || [];
    const vertices = die.userData.vertexNormals || [];
    const camera = createD4ReadCamera();
    let best = { label: "", dot: -Infinity, index: -1, readMode: "vertex" };
    vertices.forEach((vertex, index) => {
      const projected = projectD4Vertex(die, vertex, quaternion, camera);
      if (projected.y > best.dot) {
        best = {
          label: labels[index] || String(index + 1),
          dot: projected.y,
          index,
          readMode: "vertex"
        };
      }
    });
    return best;
  }

  function finalD4QuaternionForDie(die, baseQuaternion, readVector) {
    const THREE = window.THREE;
    const resultIndex = die.userData.resultIndex;
    const vertices = die.userData.vertexNormals || [];
    const faceNormals = die.userData.faceNormals || [];
    const faceIndexes = die.userData.faceIndexes || [];
    const displayFace = Number.isInteger(die.userData.displayFaceIndex) && die.userData.displayFaceIndex >= 0
      ? {
          indexes: faceIndexes[die.userData.displayFaceIndex],
          index: die.userData.displayFaceIndex,
          normal: faceNormals[die.userData.displayFaceIndex]
        }
      : null;
    const adjacentFaces = displayFace?.normal
      ? [displayFace]
      : faceIndexes
          .map((indexes, index) => ({ indexes, index, normal: faceNormals[index] }))
          .filter((face) => Array.isArray(face.indexes) && face.indexes.includes(resultIndex) && face.normal);
    const frontVector = cameraFacingVector();
    const camera = createD4ReadCamera();
    let best = {
      quaternion: baseQuaternion.clone(),
      score: -Infinity
    };

    for (let step = 0; step < 96; step += 1) {
      const angle = (Math.PI * 2 * step) / 96;
      const twist = new THREE.Quaternion().setFromAxisAngle(readVector, angle);
      const candidate = twist.multiply(baseQuaternion.clone());
      const projected = vertices.map((vertex) => projectD4Vertex(die, vertex, candidate, camera).y);
      const resultY = projected[resultIndex] ?? -Infinity;
      const highestOtherY = projected.reduce((highest, y, index) => (
        index === resultIndex ? highest : Math.max(highest, y)
      ), -Infinity);
      const topIndex = projected.reduce((highestIndex, y, index) => (
        y > projected[highestIndex] ? index : highestIndex
      ), 0);
      const bestFacing = adjacentFaces.reduce((highest, face) => {
        const facing = face.normal.clone().applyQuaternion(candidate).normalize().dot(frontVector);
        return Math.max(highest, facing);
      }, -Infinity);
      const topScore = topIndex === resultIndex ? 100 : -100;
      const score = topScore + (resultY - highestOtherY) * 14 + bestFacing * 28;
      if (score > best.score) {
        best = {
          quaternion: candidate,
          score
        };
      }
    }

    return best.quaternion;
  }

  function finalQuaternionForDie(die) {
    const THREE = window.THREE;
    const readVector = readVectorForDie(die);
    const faceToUp = new THREE.Quaternion().setFromUnitVectors(
      die.userData.resultNormal.clone().normalize(),
      readVector
    );
    if (die.userData.readMode !== "face") {
      return finalD4QuaternionForDie(die, faceToUp, readVector);
    }

    const desiredUp = screenUpVector()
      .projectOnPlane(readVector)
      .normalize();
    const resultUp = (die.userData.faceUpVectors?.[die.userData.resultIndex] || new THREE.Vector3(0, 1, 0))
      .clone()
      .applyQuaternion(faceToUp)
      .projectOnPlane(readVector)
      .normalize();
    const signedAngle = Math.atan2(
      new THREE.Vector3().crossVectors(resultUp, desiredUp).dot(readVector),
      clamp(resultUp.dot(desiredUp), -1, 1)
    );
    const twist = new THREE.Quaternion().setFromAxisAngle(readVector, signedAngle);
    return twist.multiply(faceToUp);
  }

  function topFaceLabelForDie(die, quaternion = die.quaternion) {
    if (die.userData.readMode === "vertex") {
      return screenTopVertexLabelForDie(die, quaternion);
    }
    const readVector = readVectorForDie(die);
    const isVertexRead = die.userData.readMode === "vertex";
    const labels = isVertexRead ? (die.userData.vertexLabels || []) : (die.userData.faceLabels || []);
    const normals = isVertexRead ? (die.userData.vertexNormals || []) : (die.userData.faceNormals || []);
    let best = { label: "", dot: -Infinity, index: -1 };
    normals.forEach((normal, index) => {
      const dot = normal.clone().applyQuaternion(quaternion).normalize().dot(readVector);
      if (dot > best.dot) {
        best = {
          label: labels[index] || String(index + 1),
          dot,
          index,
          readMode: isVertexRead ? "vertex" : "face"
        };
      }
    });
    return best;
  }

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
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.shadowMap.enabled = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 4.8, 8.5);
    camera.lookAt(0, -0.35, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1b1f28, 1.68);
    scene.add(hemi);
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
    if (activeRoll.scene) {
      activeRoll.scene.traverse((object) => {
        if (object.geometry?.dispose) {
          object.geometry.dispose();
        }
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
        materials.forEach((material) => {
          Object.keys(material).forEach((key) => {
            const value = material[key];
            if (value && typeof value === "object" && value.isTexture && typeof value.dispose === "function") {
              value.dispose();
            }
          });
          material.dispose?.();
        });
      });
    }
    activeRoll.renderer?.dispose?.();
    activeRoll.renderer?.forceContextLoss?.();
    activeRoll.canvas?.remove?.();
    activeRoll = null;
    lastStatus = "cleared";
  }

  function rollDice(options = {}) {
    if (!hasRuntime()) {
      lastStatus = "missing THREE runtime";
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
    lastSettledResults = [];

    const canvas = document.createElement("canvas");
    canvas.className = "accurate-dice-canvas";
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;";
    layer.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 4.8, 8.6);
    camera.lookAt(0, -0.45, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1b1f28, 1.7);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(-4, 5, 6);
    key.castShadow = false;
    scene.add(key);
    const rim = new THREE.PointLight(palette.glow, 2.2, 9);
    rim.position.set(3, -2.4, 3);
    scene.add(rim);

    const floorY = -1.55;

    const aspect = width / height;
    const viewWidth = aspect >= 1 ? 9.8 : 5.8;
    const viewDepth = aspect >= 1 ? 5.2 : 6.4;
    const columns = width < 760
      ? Math.min(2, results.length)
      : results.length <= 8
        ? results.length
        : results.length > 14
          ? 6
          : 5;
    const targetPixels = getPrettyDicePixelTarget(results.length, width, height);
    const multiDieScale = results.length > 8 ? 0.78 : results.length > 4 ? 0.86 : 1;
    const diceSize = clamp(
      getWorldScaleForPixelTarget(targetPixels, camera, height, floorY, viewDepth) * (width < 760 ? 0.82 : multiDieScale),
      results.length > 4 ? 0.24 : 0.32,
      results.length > 8 ? 0.52 : results.length > 4 ? 0.56 : 0.72
    );
    const layoutWidth = viewWidth * (results.length <= 8 ? 0.86 : 0.8);
    const laneGap = columns > 1 ? Math.min(diceSize * 2.7, layoutWidth / Math.max(1, columns - 1)) : 0;
    const rowGap = diceSize * 2.28;
    const centerOffsetX = Number(options.centerOffsetX) || 0;

    const dice = results.map((entry, index) => {
      const sides = Number(entry.sides) || 20;
      const die = createDie(sides, entry.value, palette);
      die.scale.setScalar(diceSize);
      const row = Math.floor(index / columns);
      const column = index % columns;
      const countInRow = Math.min(columns, results.length - row * columns);
      const direction = index % 2 === 0 ? 1 : -1;
      const restY = floorY + diceSize * 0.92;
      const endX = centerOffsetX + (column - (countInRow - 1) / 2) * laneGap;
      const endZ = -viewDepth * 0.18 + row * rowGap;
      const start = new THREE.Vector3(
        direction > 0 ? -viewWidth * 0.72 : viewWidth * 0.72,
        restY + 1.35 + Math.random() * 0.45,
        endZ + 2.3 + (Math.random() - 0.5) * 0.72
      );
      const end = new THREE.Vector3(
        endX + (Math.random() - 0.5) * 0.24,
        restY,
        endZ + (Math.random() - 0.5) * 0.18
      );
      die.position.copy(start);
      scene.add(die);
      const finalQuat = finalQuaternionForDie(die);
      const spinAxisA = randomUnitVector();
      const spinAxisB = randomUnitVector();
      const spinRounds = 5.5 + Math.random() * 3.4 + Math.min(2.5, Math.log2(Math.max(4, sides)));
      const tumbleRounds = 3.5 + Math.random() * 2.4;
      return {
        die,
        start,
        end,
        startQuat: randomQuaternion(),
        finalQuat,
        spinAxisA,
        spinAxisB,
        startAt: index * 110,
        travelMs: 1750 + index * 55,
        settleMs: 1150 + index * 16,
        spinRounds,
        tumbleRounds,
        laneDrift: (Math.random() - 0.5) * 0.42,
        bounce: 1.05 + Math.random() * 0.48,
        phase: Math.random() * Math.PI * 2
      };
    });

    const startTime = performance.now();
    const holdMs = 3000;
    const fadeMs = 3000;
    const settleCompleteMs = Math.max(...dice.map((die) => die.startAt + die.travelMs + die.settleMs), 0);
    const totalMs = settleCompleteMs + holdMs + fadeMs;
    activeRoll = { renderer, scene, canvas, animationFrame: 0, timeout: 0 };
    lastStatus = `rolling ${dice.length} ${SKIN_MODE_NAME} at ${Math.round(targetPixels)}px sprite-matched size`;
    let recordedSettle = false;

    function renderFrame(timestamp) {
      const elapsed = timestamp - startTime;
      const completeAt = totalMs - fadeMs;
      const fade = clamp((elapsed - completeAt) / fadeMs, 0, 1);
      canvas.style.opacity = String(1 - fade);

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
          const wobbleAxis = entry.spinAxisB;
          const wobble = new THREE.Quaternion().setFromAxisAngle(
            wobbleAxis,
            Math.sin(settle * Math.PI * 5.1 + entry.phase) * Math.pow(1 - settle, 2.2) * 0.42
          );
          entry.die.quaternion
            .copy(rollingQuat)
            .slerp(entry.finalQuat, settleEase)
            .multiply(wobble);
        }
      });

      if (!recordedSettle && elapsed >= settleCompleteMs) {
        recordedSettle = true;
        dice.forEach((entry) => {
          entry.die.quaternion.copy(entry.finalQuat);
          entry.die.position.copy(entry.end);
        });
        lastSettledResults = dice.map((entry, index) => {
          const top = topFaceLabelForDie(entry.die, entry.finalQuat);
          return {
            die: entry.die.userData.dieType,
            sides: entry.die.userData.sides,
            value: entry.die.userData.value,
            readMode: entry.die.userData.readMode || "face",
            requested: String(entry.die.userData.resultLabel),
            topFace: top.label,
            topVertex: top.readMode === "vertex" ? top.label : null,
            topDot: Number(top.dot.toFixed(4)),
            matched: String(top.label) === String(entry.die.userData.resultLabel),
            previewDataUrl: options.capturePreviews
              ? buildDiePreviewDataUrl(entry.die, entry.finalQuat, {
                  size: options.previewSize || 184,
                  scale: Number(entry.die.userData.sides) === 4 ? 1.72 : 1.6
                })
              : ""
          };
        });
        lastStatus = `settled ${lastSettledResults.length} ${SKIN_MODE_NAME} dice`;
        if (typeof options.onSettle === "function") {
          options.onSettle(lastSettledResults);
        }
      }

      renderer.render(scene, camera);
      if (elapsed < totalMs) {
        activeRoll.animationFrame = requestAnimationFrame(renderFrame);
      } else {
        clear();
      }
    }

    activeRoll.animationFrame = requestAnimationFrame(renderFrame);
    activeRoll.timeout = setTimeout(clear, totalMs + 500);
    return totalMs;
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
      const finalQuat = finalQuaternionForDie(die);
      return buildDiePreviewDataUrl(die, finalQuat, {
        size: options.size,
        scale: Number(options.sides) === 4 ? 1.72 : 1.6
      });
    },
    preloadFaceArt,
    debugFaceTexture(faceSides, dieSides, label, setId = "new-angelsword") {
      const palette = getTheme(setId);
      const texture = makeFaceSkinTexture(String(label || ""), palette, Number(faceSides) || 4, Number(dieSides) || 10);
      return texture?.image?.toDataURL?.("image/png") || null;
    },
    getStatus() {
      return {
        version: ROLLER_VERSION,
        skinMode: SKIN_MODE_NAME,
        status: lastStatus,
        active: Boolean(activeRoll),
        settledResults: lastSettledResults,
        supportedDice: Object.keys(DIE_TYPES).map(Number),
        spriteSkinPhysicsDice: Array.from(SPRITE_SKIN_PHYSICS_SIDES)
      };
    }
  };
}());
