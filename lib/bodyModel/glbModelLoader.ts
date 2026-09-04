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
 * Computes realistic, anatomically calibrated bidirectional morph target influences for GLB models.
 * Avoids baseline distortion and ensures smooth, natural transitions in both directions (expand/reduce).
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

  // Helper for bidirectional slider mapping (e.g. increase vs decrease relative to neutral)
  const mapBidirectional = (
    val: number | undefined,
    base: number,
    min: number,
    max: number,
    expandKey: string,
    reduceKey: string
  ) => {
    if (val === undefined) return;
    if (val >= base) {
      const denom = Math.max(0.001, max - base);
      setInfluence(expandKey, (val - base) / denom);
      setInfluence(reduceKey, 0);
    } else {
      const denom = Math.max(0.001, base - min);
      setInfluence(reduceKey, (base - val) / denom);
      setInfluence(expandKey, 0);
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
    setInfluence('Muscle', muscleScore * 0.45);
  }

  // 2. Body Fat (Weight_More & Weight_Less)
  const neutralFat = isMale ? 15 : 22;
  if (bodyFat >= neutralFat) {
    setInfluence('Weight_More', (bodyFat - neutralFat) / 18);
    setInfluence('Weight_Less', 0);
  } else {
    setInfluence('Weight_Less', (neutralFat - bodyFat) / 10);
    setInfluence('Weight_More', 0);
  }

  // 3. Waist (Waist_Cinch vs Waist_Expand)
  const neutralWaist = isMale ? 78 : 69;
  mapBidirectional(
    morphValues['Waist'],
    neutralWaist,
    55,
    105,
    'Waist_Expand',
    'Waist_Cinch'
  );

  // 4. Chest / Breast (Chest_Expand vs Chest_Reduce)
  const chestVal = isMale
    ? (morphValues['Chest'] ?? morphValues['Breast'])
    : (morphValues['Breast'] ?? morphValues['Chest']);
  const neutralChest = isMale ? 96 : 88;
  mapBidirectional(
    chestVal,
    neutralChest,
    75,
    115,
    'Chest_Expand',
    'Chest_Reduce'
  );
  // Also set legacy 'Chest' alias to expand
  if (chestVal !== undefined && chestVal > neutralChest) {
    setInfluence('Chest', (chestVal - neutralChest) / (115 - neutralChest));
  }

  // 5. Bust Girth (Ribcage circumference)
  const bustGirthVal = morphValues['Bust Girth'];
  if (bustGirthVal !== undefined) {
    const neutralBust = 70;
    setInfluence('Bust_Girth', THREE.MathUtils.clamp((bustGirthVal - neutralBust) / 25, 0, 1));
  }

  // 6. Shoulders (Shoulders_Wide vs Shoulders_Narrow)
  const neutralShoulder = 13.5;
  mapBidirectional(
    morphValues['Shoulders'],
    neutralShoulder,
    10,
    18,
    'Shoulders_Wide',
    'Shoulders_Narrow'
  );
  if (morphValues['Shoulders'] !== undefined && morphValues['Shoulders'] > neutralShoulder) {
    setInfluence('Shoulders', (morphValues['Shoulders'] - neutralShoulder) / (18 - neutralShoulder));
  }

  // 7. Glutes & Hips (Glutes_Full vs Glutes_Slim)
  const hipVal = morphValues['Hip Girth'] ?? morphValues['Glutes'];
  const neutralHips = isMale ? 94 : 98;
  mapBidirectional(
    hipVal,
    neutralHips,
    80,
    125,
    'Glutes_Full',
    'Glutes_Slim'
  );
  if (hipVal !== undefined && hipVal > neutralHips) {
    setInfluence('Glutes', (hipVal - neutralHips) / (125 - neutralHips));
  }

  // 8. Quads & Thighs (Thighs_Muscular vs Thighs_Slim)
  const thighVal = morphValues['Thigh Girth'] ?? morphValues['Quads'];
  const neutralThigh = isMale ? 54 : 56;
  mapBidirectional(
    thighVal,
    neutralThigh,
    45,
    70,
    'Thighs_Muscular',
    'Thighs_Slim'
  );
  if (thighVal !== undefined && thighVal > neutralThigh) {
    setInfluence('Quads', (thighVal - neutralThigh) / (70 - neutralThigh));
  }

  // 9. Arms (Arms_Muscular vs Arms_Slim)
  const armVal = morphValues['Upper Arm Girth'] ?? morphValues['Arms'];
  const neutralArm = isMale ? 30 : 26;
  mapBidirectional(
    armVal,
    neutralArm,
    20,
    38,
    'Arms_Muscular',
    'Arms_Slim'
  );
  if (armVal !== undefined && armVal > neutralArm) {
    setInfluence('Arms', (armVal - neutralArm) / (38 - neutralArm));
  }

  // 10. Calves (Calves_Muscular vs Calves_Slim)
  const calfVal = morphValues['Calf Girth'] ?? morphValues['Calf'];
  const neutralCalf = 36;
  mapBidirectional(
    calfVal,
    neutralCalf,
    28,
    48,
    'Calves_Muscular',
    'Calves_Slim'
  );

  // 11. Neck (Neck_Muscular vs Neck_Slim)
  const neckVal = morphValues['Neck'];
  const neutralNeck = isMale ? 37 : 32;
  mapBidirectional(
    neckVal,
    neutralNeck,
    25,
    45,
    'Neck_Muscular',
    'Neck_Slim'
  );

  // 12. Stomach Form (Stomach_Full vs Stomach_Tone)
  const stomachVal = morphValues['Stomach Form'];
  const neutralStomach = 0.8;
  mapBidirectional(
    stomachVal,
    neutralStomach,
    0,
    2.0,
    'Stomach_Full',
    'Stomach_Tone'
  );

  return influences;
}
