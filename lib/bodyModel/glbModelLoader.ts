import * as THREE from 'three';
import { GLTFLoader, DRACOLoader } from 'three-stdlib';
import { BodyModelConfig, ProcessedModelResult } from './morphEngine';

let cachedDracoLoader: DRACOLoader | null = null;

function getDracoLoader(): DRACOLoader {
  if (!cachedDracoLoader) {
    cachedDracoLoader = new DRACOLoader();
    cachedDracoLoader.setDecoderPath('/draco/');
    cachedDracoLoader.preload();
  }
  return cachedDracoLoader;
}

/**
 * Loads a Draco-compressed anatomical GLB model (male_v2.glb or female_v2.glb)
 * generated via Blender 5.0 + MPFB2, with baked morph target shape keys.
 */
export async function loadGlbHumanModel(
  gender: 'male' | 'female'
): Promise<{ processed: ProcessedModelResult; config: BodyModelConfig }> {
  const dracoLoader = getDracoLoader();
  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  const modelPath = `/models/${gender}_v2.glb`;
  const gltf = await gltfLoader.loadAsync(modelPath);

  let targetMesh: THREE.Mesh | null = null;
  gltf.scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !targetMesh) {
      targetMesh = child as THREE.Mesh;
    }
  });

  if (!targetMesh) {
    throw new Error(`Failed to find humanoid mesh in ${modelPath}`);
  }

  const geometry = (targetMesh as THREE.Mesh).geometry.clone();
  geometry.computeVertexNormals();

  const morphMap = new Map<string, number>();
  const dict = (targetMesh as THREE.Mesh).morphTargetDictionary || {};
  Object.entries(dict).forEach(([name, idx]) => {
    morphMap.set(name, idx);
  });

  // Map anthropometric UI slider names to GLB shape keys
  if (morphMap.has('Chest')) {
    morphMap.set('Breast', morphMap.get('Chest')!);
    morphMap.set('Bust Girth', morphMap.get('Chest')!);
  }
  if (morphMap.has('Waist_Cinch')) {
    morphMap.set('Waist', morphMap.get('Waist_Cinch')!);
  }
  if (morphMap.has('Quads')) {
    morphMap.set('Thigh Girth', morphMap.get('Quads')!);
  }
  if (morphMap.has('Glutes')) {
    morphMap.set('Glute Girth', morphMap.get('Glutes')!);
    morphMap.set('Hips', morphMap.get('Glutes')!);
  }
  if (morphMap.has('Arms')) {
    morphMap.set('Upper Arm Girth', morphMap.get('Arms')!);
  }
  if (morphMap.has('Shoulders')) {
    morphMap.set('Shoulder Angle', morphMap.get('Shoulders')!);
  }

  const morphNames = Array.from(morphMap.keys());
  const config: BodyModelConfig = {
    baseUrl: '/models/',
    character: `${gender}_v2.glb`,
    skins: [],
    morphs: morphNames,
    morphslimit: morphNames.map(() => 0), // Baseline is 0 for baked relative shape keys
    morphslowlimit: morphNames.map(() => 0),
    morphshighlimit: morphNames.map(() => 100),
    x: 0,
    y: 0,
    z: 0,
    s: 1.0,
  };

  const processed: ProcessedModelResult = {
    geometry,
    morphMap,
    baseScale: 1.0,
    heightOffset: 0.0,
  };

  return { processed, config };
}

/**
 * Computes realistic, anatomically calibrated morph target influences for GLB models.
 * Avoids baseline distortion and ensures smooth, natural transitions.
 */
export function computeGLBMorphInfluences(
  gender: 'female' | 'male' | 'child',
  morphMap: Map<string, number>,
  morphValues: Record<string, number>,
  bodyFat: number = 20
): number[] {
  const influences: number[] = new Array(morphMap.size).fill(0);
  const isMale = gender === 'male';

  const setInfluence = (name: string, val: number) => {
    const idx = morphMap.get(name);
    if (idx !== undefined) {
      influences[idx] = THREE.MathUtils.clamp(val, 0, 1);
    }
  };

  // 1. Muscle definition / hypertrophy
  if (morphValues['Muscle'] !== undefined) {
    setInfluence('Muscle', morphValues['Muscle'] / 100);
  } else {
    // Athletic baseline: lower body fat implies higher visible muscle definition
    const muscleScore = isMale
      ? THREE.MathUtils.clamp((22 - bodyFat) / 14, 0, 1)
      : THREE.MathUtils.clamp((28 - bodyFat) / 16, 0, 1);
    setInfluence('Muscle', muscleScore * 0.35);
  }

  // 2. Weight_More (Adipose storage)
  const fatThresh = isMale ? 18 : 24;
  if (bodyFat > fatThresh) {
    setInfluence('Weight_More', (bodyFat - fatThresh) / 18);
  }

  // 3. Weight_Less (Shredded lean definition)
  const leanThresh = isMale ? 14 : 20;
  if (bodyFat < leanThresh) {
    setInfluence('Weight_Less', (leanThresh - bodyFat) / 8);
  }

  // 4. Waist_Cinch (V-Taper / Hourglass)
  const waistVal = morphValues['Waist'];
  if (waistVal !== undefined) {
    const neutralWaist = isMale ? 78 : 70;
    if (waistVal < neutralWaist) {
      setInfluence('Waist_Cinch', (neutralWaist - waistVal) / 20);
    }
  }

  // 5. Chest (Pectorals / Breast projection)
  const chestVal = isMale ? morphValues['Chest'] : (morphValues['Breast'] ?? morphValues['Bust Girth']);
  if (chestVal !== undefined) {
    const neutralChest = isMale ? 96 : 80;
    if (chestVal > neutralChest) {
      setInfluence('Chest', (chestVal - neutralChest) / 24);
    }
  }

  // 6. Shoulders (Deltoid span)
  const shoulderVal = morphValues['Shoulders'];
  if (shoulderVal !== undefined) {
    const neutralShoulder = 13.5;
    if (shoulderVal > neutralShoulder) {
      setInfluence('Shoulders', (shoulderVal - neutralShoulder) / 3.0);
    }
  }

  // 7. Glutes (Gluteal fullness)
  const hipVal = morphValues['Hip Girth'] ?? morphValues['Glutes'];
  if (hipVal !== undefined) {
    const neutralHips = isMale ? 104 : 96;
    if (hipVal > neutralHips) {
      setInfluence('Glutes', (hipVal - neutralHips) / 20);
    }
  }

  // 8. Quads (Thigh development)
  const thighVal = morphValues['Thigh Girth'] ?? morphValues['Quads'];
  if (thighVal !== undefined) {
    const neutralThigh = isMale ? 48 : 54;
    if (thighVal > neutralThigh) {
      setInfluence('Quads', (thighVal - neutralThigh) / 18);
    }
  }

  // 9. Arms (Biceps & Triceps girth)
  const armVal = morphValues['Upper Arm Girth'] ?? morphValues['Arms'];
  if (armVal !== undefined) {
    const neutralArm = isMale ? 16 : 26;
    if (armVal > neutralArm) {
      setInfluence('Arms', (armVal - neutralArm) / 8);
    }
  }

  return influences;
}
