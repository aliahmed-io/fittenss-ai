import * as THREE from 'three';

export interface RawModelJson {
  metadata?: {
    vertices?: number;
    faces?: number;
    uvs?: number[];
  };
  scale?: number;
  vertices: number[];
  faces: number[];
  uvs?: number[][];
}

export interface BodyModelConfig {
  baseUrl: string;
  character: string;
  skins: string[];
  morphs: string[];
  morphslimit: number[];
  morphslowlimit: number[];
  morphshighlimit: number[];
  x: number;
  y: number;
  z: number;
  s: number;
}

export interface ProcessedModelResult {
  geometry: THREE.BufferGeometry;
  morphMap: Map<string, number>;
  baseScale: number;
  heightOffset: number;
}

// Global cache for processed models to prevent repeated parsing and memory churn
const modelCache = new Map<string, ProcessedModelResult>();

/**
 * Parses legacy Blender 2.7 / UCS JSON model format into modern Three.js BufferGeometry,
 * normalizes to clean metric coordinates (standard ~1.75m standing height at origin),
 * and generates relative orthogonal GPU morph targets with anatomical realism.
 */
export function buildParametricBodyGeometry(
  rawJson: RawModelJson,
  config: BodyModelConfig,
  gender: 'female' | 'male' | 'child'
): ProcessedModelResult {
  const cacheKey = `${config.character}-${gender}`;
  const cached = modelCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const geometry = new THREE.BufferGeometry();
  const rawVertices = rawJson.vertices;
  const numVerts = rawVertices.length / 3;

  // 1. Measure raw bounding box to compute precise metric normalization
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < rawVertices.length; i += 3) {
    const x = rawVertices[i]!;
    const y = rawVertices[i + 1]!;
    const z = rawVertices[i + 2]!;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const rawHeight = maxY - minY;
  const targetHeight = gender === 'child' ? 1.25 : gender === 'female' ? 1.68 : 1.78; // Target height in meters
  const metricScale = targetHeight / Math.max(rawHeight, 0.001);

  // 2. Build normalized base position buffer (feet at Y = 0, centered on X = 0)
  const normPositions = new Float32Array(numVerts * 3);
  for (let i = 0; i < numVerts; i++) {
    const idx = i * 3;
    normPositions[idx] = (rawVertices[idx]! - (minX + maxX) * 0.5) * metricScale; // Center X
    normPositions[idx + 1] = (rawVertices[idx + 1]! - minY) * metricScale;        // Ground Y = 0
    normPositions[idx + 2] = (rawVertices[idx + 2]! - (minZ + maxZ) * 0.35) * metricScale; // Center Z slightly forward
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(normPositions, 3));

  // 3. Parse quad & triangle faces
  const faces = rawJson.faces;
  const indices: number[] = [];
  let i = 0;

  while (i < faces.length) {
    const type = faces[i++];
    if (type === undefined) break;

    const isQuad = !!(type & 1);
    const hasMaterial = !!(type & 2);
    const hasFaceUv = !!(type & 4);
    const hasFaceVertexUv = !!(type & 8);
    const hasFaceNormal = !!(type & 16);
    const hasFaceVertexNormal = !!(type & 32);
    const hasFaceColor = !!(type & 64);
    const hasFaceVertexColor = !!(type & 128);

    const vertexCount = isQuad ? 4 : 3;
    const faceVerts: number[] = [];
    for (let v = 0; v < vertexCount; v++) {
      faceVerts.push(faces[i++] ?? 0);
    }

    if (hasMaterial) i++;
    if (hasFaceUv) i++;
    if (hasFaceVertexUv) i += vertexCount;
    if (hasFaceNormal) i++;
    if (hasFaceVertexNormal) i += vertexCount;
    if (hasFaceColor) i++;
    if (hasFaceVertexColor) i += vertexCount;

    if (isQuad && faceVerts.length === 4) {
      const v0 = faceVerts[0]!;
      const v1 = faceVerts[1]!;
      const v2 = faceVerts[2]!;
      const v3 = faceVerts[3]!;
      indices.push(v0, v1, v2);
      indices.push(v0, v2, v3);
    } else if (faceVerts.length >= 3) {
      indices.push(faceVerts[0]!, faceVerts[1]!, faceVerts[2]!);
    }
  }

  geometry.setIndex(indices);

  // 4. Generate Anatomically Realistic Relative GPU Morph Targets
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [];
  const morphMap = new Map<string, number>();

  config.morphs.forEach((morphName) => {
    const deltaArray = generateMorphDeltas(normPositions, numVerts, morphName, gender, targetHeight);
    if (deltaArray) {
      const morphIndex = geometry.morphAttributes.position!.length;
      geometry.morphAttributes.position!.push(new THREE.BufferAttribute(deltaArray, 3));
      morphMap.set(morphName, morphIndex);
    }
  });

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const result: ProcessedModelResult = {
    geometry,
    morphMap,
    baseScale: 1.0,
    heightOffset: 0,
  };

  modelCache.set(cacheKey, result);
  return result;
}

/**
 * Generates relative 3D vertex displacement deltas (dx, dy, dz) for a given morph target.
 * Uses Gaussian/Hermite spatial influence kernels tailored to human anatomy.
 */
function generateMorphDeltas(
  positions: Float32Array,
  numVerts: number,
  morphName: string,
  gender: 'female' | 'male' | 'child',
  totalHeight: number
): Float32Array | null {
  const deltas = new Float32Array(numVerts * 3);
  const isFemale = gender === 'female';

  // Proportional anatomical landmark heights (as fraction of total height)
  const h = totalHeight;

  switch (morphName) {
    case 'Breast': {
      // Natural female mammary projection: rounded teardrop volume with gravity sag
      const cy = 0.69 * h;
      const leftCx = 0.048 * h;
      const rightCx = -0.048 * h;

      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const x = positions[idx]!;
        const y = positions[idx + 1]!;
        const z = positions[idx + 2]!;

        // Strictly anterior (front side)
        if (z > 0.015 * h && y > cy - 0.10 * h && y < cy + 0.09 * h) {
          const cx = x >= 0 ? leftCx : rightCx;
          const dx = (x - cx) / (0.065 * h);
          const dy = (y - cy) / (0.075 * h);
          const distSq = dx * dx + dy * dy;

          if (distSq < 1.0) {
            // Smooth cubic Hermite curve for natural hemispherical dome
            const t = Math.sqrt(distSq);
            const weight = (1 - t) * (1 - t) * (1 + 2 * t);
            // Forward projection (+Z), gentle gravity downward (-Y), and subtle outward cant
            deltas[idx] = (x >= 0 ? 0.005 : -0.005) * h * weight;
            deltas[idx + 1] = -0.004 * h * weight;
            deltas[idx + 2] = (isFemale ? 0.032 : 0.015) * h * weight;
          }
        }
      }
      return deltas;
    }

    case 'Bust Girth':
    case 'Chest': {
      // Circumferential expansion of upper ribcage and chest
      const cy = 0.70 * h;
      const radiusY = 0.11 * h;

      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const x = positions[idx]!;
        const y = positions[idx + 1]!;
        const z = positions[idx + 2]!;

        const dy = (y - cy) / radiusY;
        if (Math.abs(dy) < 1.0) {
          const weight = 0.5 * (1 + Math.cos(dy * Math.PI));
          const lateralSign = x >= 0 ? 1 : -1;
          deltas[idx] = lateralSign * 0.024 * h * weight;
          // Masculine squared pectoralis major forward projection vs female ribcage
          if (z > 0.01) {
            deltas[idx + 2] = (isFemale ? 0.018 : 0.026) * h * weight;
          } else {
            // Latissimus dorsi back expansion for athletic V-taper
            deltas[idx + 2] = (isFemale ? -0.010 : -0.016) * h * weight;
          }
        }
      }
      return deltas;
    }

    case 'Waist': {
      // Waist curve: Hourglass for female, athletic V-taper cinch for male
      const cy = 0.61 * h; // ~1.02m (midpoint between ribs and iliac crest)
      const radiusY = 0.09 * h;

      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const x = positions[idx]!;
        const y = positions[idx + 1]!;
        const z = positions[idx + 2]!;

        const dy = (y - cy) / radiusY;
        if (Math.abs(dy) < 1.0) {
          const weight = 0.5 * (1 + Math.cos(dy * Math.PI));
          const lateralSign = x >= 0 ? 1 : -1;
          // Inward/outward waist cinch
          deltas[idx] = lateralSign * (isFemale ? 0.026 : 0.022) * h * weight;
          // Abdominal wall anterior modulation
          if (z > 0.01) {
            deltas[idx + 2] = 0.014 * h * weight;
          } else {
            // Spine stabilization: back moves very little to preserve lumbar lordosis
            deltas[idx + 2] = -0.004 * h * weight;
          }
        }
      }
      return deltas;
    }

    case 'Hip Girth': {
      // Pelvic widening (bi-trochanteric width) & posterior gluteal projection
      const cy = 0.51 * h; // ~0.86m
      const radiusY = 0.10 * h;

      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const x = positions[idx]!;
        const y = positions[idx + 1]!;
        const z = positions[idx + 2]!;

        const dy = (y - cy) / radiusY;
        if (Math.abs(dy) < 1.0) {
          const weight = 0.5 * (1 + Math.cos(dy * Math.PI));
          const lateralSign = x >= 0 ? 1 : -1;
          // Lateral hip flare
          deltas[idx] = lateralSign * (isFemale ? 0.034 : 0.024) * h * weight;
          // Gluteal curve (posterior in coordinate space)
          if (z < 0.015) {
            deltas[idx + 2] = -0.030 * h * weight;
          } else {
            deltas[idx + 2] = 0.008 * h * weight;
          }
        }
      }
      return deltas;
    }

    case 'Thigh Girth': {
      // Conical upper leg cylinder with protected knee zone
      const topY = 0.49 * h;
      const kneeY = 0.28 * h;

      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const x = positions[idx]!;
        const y = positions[idx + 1]!;
        const z = positions[idx + 2]!;

        if (y >= kneeY && y <= topY) {
          // Weight peaks at upper 60% of thigh and smoothly zeroes at knee joint
          const t = (y - kneeY) / (topY - kneeY);
          const weight = Math.sin(t * Math.PI) * (0.3 + 0.7 * t);
          const leftThigh = x > 0;
          const thighCenterX = (leftThigh ? 0.06 : -0.06) * h;
          const rx = x - thighCenterX;

          deltas[idx] = rx * 0.35 * weight;
          deltas[idx + 2] = z * 0.30 * weight;
        }
      }
      return deltas;
    }

    case 'Calf Girth':
    case 'Calf': {
      // Gastrocnemius muscle belly expansion with Achilles tendon taper
      const topY = 0.28 * h;
      const ankleY = 0.08 * h;
      const peakY = 0.20 * h;

      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const x = positions[idx]!;
        const y = positions[idx + 1]!;
        const z = positions[idx + 2]!;

        if (y >= ankleY && y <= topY) {
          const dy = y < peakY ? (y - ankleY) / (peakY - ankleY) : (topY - y) / (topY - peakY);
          const weight = Math.max(0, Math.min(1, dy));
          const leftCalf = x > 0;
          const calfCenterX = (leftCalf ? 0.05 : -0.05) * h;
          const rx = x - calfCenterX;

          deltas[idx] = rx * 0.30 * weight;
          deltas[idx + 2] = z * 0.28 * weight;
        }
      }
      return deltas;
    }

    case 'Shoulders': {
      // Clavicle width and deltoid contour
      const shoulderY = 0.81 * h;
      const radiusY = 0.09 * h;

      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const x = positions[idx]!;
        const y = positions[idx + 1]!;

        if (Math.abs(x) > 0.065 * h && y > 0.65 * h && y < 0.90 * h) {
          const dy = Math.abs(y - shoulderY) / radiusY;
          const weight = Math.max(0, 1 - dy);
          const lateralSign = x >= 0 ? 1 : -1;
          deltas[idx] = lateralSign * (isFemale ? 0.035 : 0.044) * h * weight;
        }
      }
      return deltas;
    }

    case 'Stomach Form': {
      // Sub-umbilical adipose projection for realistic body fat
      const cy = 0.58 * h;
      const radiusY = 0.065 * h;

      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const x = positions[idx]!;
        const y = positions[idx + 1]!;
        const z = positions[idx + 2]!;

        if (z > 0.015 && Math.abs(x) < 0.09 * h) {
          const dy = (y - cy) / radiusY;
          const dx = x / (0.09 * h);
          const distSq = dx * dx + dy * dy;
          if (distSq < 1.0) {
            const weight = 0.5 * (1 + Math.cos(distSq * Math.PI));
            deltas[idx + 2] = 0.032 * h * weight;
          }
        }
      }
      return deltas;
    }

    case 'Upper Arm Girth': {
      // Bicep/tricep muscle bellies
      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const x = positions[idx]!;
        const y = positions[idx + 1]!;
        const z = positions[idx + 2]!;

        if (Math.abs(x) > 0.11 * h && y >= 0.55 * h && y <= 0.82 * h) {
          const t = Math.sin(((y - 0.55 * h) / (0.27 * h)) * Math.PI);
          const lateralSign = x >= 0 ? 1 : -1;
          deltas[idx] = lateralSign * (isFemale ? 0.018 : 0.026) * h * t;
          deltas[idx + 2] = z * (isFemale ? 0.25 : 0.35) * t;
        }
      }
      return deltas;
    }

    case 'Arm Length': {
      // Arm elongation along arm vector
      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const x = positions[idx]!;
        const y = positions[idx + 1]!;

        if (Math.abs(x) > 0.14 * h && y < 0.80 * h) {
          const lateralSign = x >= 0 ? 1 : -1;
          const armDist = Math.abs(x) - 0.14 * h;
          deltas[idx] = lateralSign * armDist * 0.25;
          deltas[idx + 1] = -armDist * 0.15;
        }
      }
      return deltas;
    }

    case 'Height': {
      // Biomechanical vertical skeleton scaling
      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const y = positions[idx + 1]!;
        // Progressive elongation from floor to head
        deltas[idx + 1] = y * 0.12;
      }
      return deltas;
    }

    case 'Neck Height':
    case 'Neck': {
      // Cervical spine length and width
      const neckY = 0.86 * h;
      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const x = positions[idx]!;
        const y = positions[idx + 1]!;

        if (y >= neckY && y <= 0.94 * h && Math.abs(x) < 0.06 * h) {
          if (morphName === 'Neck') {
            deltas[idx] = (x >= 0 ? 1 : -1) * 0.008 * h;
          } else {
            deltas[idx + 1] = 0.018 * h;
          }
        }
      }
      return deltas;
    }

    case 'lower Leg':
    case 'Lower Leg Length': {
      // Tibia elongation below knee
      for (let i = 0; i < numVerts; i++) {
        const idx = i * 3;
        const y = positions[idx + 1]!;

        if (y <= 0.32 * h) {
          deltas[idx + 1] = y * 0.15;
        }
      }
      return deltas;
    }

    default:
      return null;
  }
}
