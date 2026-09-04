import * as THREE from 'three';

/**
 * Procedural PBR Normal & Vascularity Map Generator
 * Generates anatomical micro-surface normals for:
 * 1. Rectus Abdominis (six-pack packs, linea alba, transverse intersections)
 * 2. Serratus Anterior & Obliques (intercostal muscle cuts)
 * 3. Vascular & Muscle Striations (high-frequency Perlin-style directional cuts)
 */

let cachedNormalTexture: THREE.CanvasTexture | null = null;

export function getProceduralMuscleNormalMap(): THREE.CanvasTexture | null {
  if (typeof window === 'undefined') return null;
  if (cachedNormalTexture) return cachedNormalTexture;

  const width = 512;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Fill base flat normal: RGB (128, 128, 255) represents neutral normal vector (0, 0, 1)
  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Simple pseudo-random hash for deterministic procedural striations
  const pseudoNoise = (x: number, y: number): number => {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
    return n - Math.floor(n);
  };

  // Generate height map first
  const heightMap = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    const ny = y / height; // 0 to 1
    for (let x = 0; x < width; x++) {
      const nx = x / width; // 0 to 1
      const idx = y * width + x;

      let hVal = 0.5;

      // 1. Rectus Abdominis (Abdominal 6-Pack) in central torso: nx in [0.35, 0.65], ny in [0.45, 0.78]
      if (nx > 0.36 && nx < 0.64 && ny > 0.44 && ny < 0.78) {
        const dxFromCenter = Math.abs(nx - 0.5);
        // Linea alba (center vertical deep groove)
        const lineaAlba = Math.exp(-Math.pow(dxFromCenter / 0.015, 2));

        // 3 horizontal tendinous intersections (creases between ab packs)
        const packY1 = Math.exp(-Math.pow((ny - 0.52) / 0.018, 2));
        const packY2 = Math.exp(-Math.pow((ny - 0.60) / 0.018, 2));
        const packY3 = Math.exp(-Math.pow((ny - 0.68) / 0.018, 2));
        const horizontalCreases = Math.max(packY1, packY2, packY3);

        // Ab pack dome bulges
        const packBulge = Math.sin((ny - 0.44) * Math.PI * 6.5) * Math.sin(dxFromCenter * Math.PI * 7.0);

        hVal += (packBulge > 0 ? packBulge * 0.28 : 0) - (lineaAlba * 0.35) - (horizontalCreases * 0.30);
      }

      // 2. Serratus Anterior & Obliques (flanks): nx in [0.22, 0.34] & [0.66, 0.78], ny in [0.48, 0.70]
      if ((nx > 0.22 && nx < 0.34) || (nx > 0.66 && nx < 0.78)) {
        const angle = nx < 0.5 ? 0.35 : -0.35;
        const ribWave = Math.sin((ny + (nx - 0.5) * angle) * Math.PI * 22);
        hVal += ribWave * 0.16;
      }

      // 3. High-frequency muscle striation grain & vascularity
      const fineNoise = (pseudoNoise(x * 0.15, y * 0.08) - 0.5) * 0.08;
      const vascularBranch = Math.sin(x * 0.05 + Math.sin(y * 0.03) * 3.0) * Math.cos(y * 0.04);
      if (vascularBranch > 0.88) {
        hVal += (vascularBranch - 0.88) * 0.6; // elevated vein ridge
      }

      heightMap[idx] = Math.max(0, Math.min(1, hVal + fineNoise));
    }
  }

  // Convert height map to normal map via Sobel gradient filter
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      // Sobel kernel for dX and dY
      const tl = heightMap[(y - 1) * width + (x - 1)]!;
      const t  = heightMap[(y - 1) * width + x]!;
      const tr = heightMap[(y - 1) * width + (x + 1)]!;
      const l  = heightMap[y * width + (x - 1)]!;
      const r  = heightMap[y * width + (x + 1)]!;
      const bl = heightMap[(y + 1) * width + (x - 1)]!;
      const b  = heightMap[(y + 1) * width + x]!;
      const br = heightMap[(y + 1) * width + (x + 1)]!;

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      // Normal vector = normalize(-dx, -dy, 1.0)
      const nx = -dx * 2.5;
      const ny = -dy * 2.5;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      // Encode from [-1, 1] to [0, 255]
      data[idx] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 2.5);
  texture.generateMipmaps = true;

  cachedNormalTexture = texture;
  return texture;
}

/**
 * Calculates dynamic normal scale intensity based on body fat percentage.
 * As body fat drops, muscle striations and vascularity emerge.
 */
export function calculateDynamicNormalScale(bodyFatPct: number): THREE.Vector2 {
  // Above 22% body fat: Smooth subcutaneous adipose (normal scale ~ 0.05)
  // 15% - 20%: Subtle athletic tone (normal scale ~ 0.35)
  // 10% - 14%: Deep shredded cuts and ab definition (normal scale ~ 0.85)
  // Sub 9%: Extreme vascularity and striations (normal scale ~ 1.35)
  const bf = Math.max(5, Math.min(35, bodyFatPct));
  let intensity = 0.05;

  if (bf <= 9) {
    intensity = 1.35;
  } else if (bf <= 14) {
    intensity = 0.85 + ((14 - bf) / 5) * 0.5;
  } else if (bf <= 20) {
    intensity = 0.30 + ((20 - bf) / 6) * 0.55;
  } else {
    intensity = Math.max(0.02, 0.30 - ((bf - 20) / 15) * 0.28);
  }

  return new THREE.Vector2(intensity, intensity);
}
