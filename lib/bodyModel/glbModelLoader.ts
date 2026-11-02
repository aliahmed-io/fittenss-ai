import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';
import { softenPectoralSurface } from './pectoralSurface';

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
  skinnedMesh?: THREE.SkinnedMesh;
  skeleton?: THREE.Skeleton;
  scene?: THREE.Group;
}

function findMeshInGltf(scene: THREE.Group): THREE.SkinnedMesh | THREE.Mesh | null {
  let mesh: THREE.SkinnedMesh | THREE.Mesh | null = null;
  scene.traverse((child) => {
    if (!mesh && ((child as THREE.SkinnedMesh).isSkinnedMesh || (child as THREE.Mesh).isMesh)) {
      mesh = child as THREE.SkinnedMesh | THREE.Mesh;
    }
  });
  return mesh;
}

/**
 * Loads the rigged anatomical GLB model (male_v2.glb or female_v2.glb)
 * generated via Blender 5.0 + MPFB2, with 53 bones and 40+ baked morph targets.
 */
export async function loadGlbHumanModel(
  gender: 'male' | 'female'
): Promise<{ processed: ProcessedModelResult; config: BodyModelConfig }> {
  const gltfLoader = new GLTFLoader();
  const modelPath = `/models/${gender}_v2.glb`;
  const gltf = await gltfLoader.loadAsync(modelPath);

  const targetMesh = findMeshInGltf(gltf.scene);
  if (!targetMesh) {
    throw new Error(`Failed to find humanoid mesh in ${modelPath}`);
  }

  const geometry = targetMesh.geometry;
  if (gender === 'male') softenPectoralSurface(geometry);
  const morphMap = new Map<string, number>();
  const dict = targetMesh.morphTargetDictionary ?? {};
  Object.entries(dict).forEach(([name, idx]) => {
    if (typeof idx === 'number') {
      morphMap.set(name, idx);
    }
  });

  const morphNames = Array.from(morphMap.keys());
  const config: BodyModelConfig = {
    baseUrl: '/models/',
    character: `${gender}_v2.glb`,
    skins: [],
    morphs: morphNames,
    morphslimit: morphNames.map(() => 0),
    morphslowlimit: morphNames.map(() => 0),
    morphshighlimit: morphNames.map(() => 100),
    x: 0,
    y: 0,
    z: 0,
    s: 1.0,
  };

  const isSkinned = (targetMesh as THREE.SkinnedMesh).isSkinnedMesh === true;
  const skinnedMesh = isSkinned ? (targetMesh as THREE.SkinnedMesh) : undefined;
  const skeleton = skinnedMesh?.skeleton;

  const processed: ProcessedModelResult = {
    geometry,
    morphMap,
    baseScale: 1.0,
    heightOffset: 0.0,
    skinnedMesh,
    skeleton,
    scene: gltf.scene,
  };

  return { processed, config };
}

/**
 * Computes anatomically harmonious morph target influences across 40+ paired shape keys.
 * Applies anatomical cross-coupling (e.g. forearms scale with biceps, quads scale with thighs)
 * and clamps influences to prevent unnatural ballooning, pinching, or goofy proportions.
 */
export function computeGLBMorphInfluences(
  gender: 'female' | 'male' | 'child',
  morphMap: Map<string, number>,
  morphValues: Record<string, number>,
  bodyFat: number = 15,
  weightKg?: number
): number[] {
  const influences: number[] = new Array(Math.max(-1, ...morphMap.values()) + 1).fill(0);
  const isMale = gender === 'male';

  const setInfluence = (name: string, val: number, damping: number = 0.85) => {
    const idx = morphMap.get(name);
    if (idx !== undefined && Number.isFinite(val)) {
      influences[idx] = THREE.MathUtils.clamp(val * damping, 0, 1);
    }
  };

  // Helper for bidirectional slider mapping (increase vs decrease relative to anatomical baseline)
  const mapBidirectional = (
    val: number | undefined,
    base: number,
    min: number,
    max: number,
    expandKey: string,
    reduceKey: string,
    damping: number = 0.85
  ): number => {
    if (val === undefined || !Number.isFinite(val)) return 0;
    if (val >= base) {
      const denom = Math.max(0.001, max - base);
      const ratio = THREE.MathUtils.clamp((val - base) / denom, 0, 1);
      setInfluence(expandKey, ratio, damping);
      setInfluence(reduceKey, 0);
      return ratio;
    } else {
      const denom = Math.max(0.001, base - min);
      const ratio = THREE.MathUtils.clamp((base - val) / denom, 0, 1);
      setInfluence(reduceKey, ratio, damping);
      setInfluence(expandKey, 0);
      return -ratio;
    }
  };

  // Whole-body mass uses separate lean and fat shape targets, as character
  // creators do. Kilograms are normalized for stature before choosing shapes.
  if (weightKg !== undefined) {
    const heightRatio = (morphValues.Height ?? (isMale ? 178 : 165)) / (isMale ? 178 : 165);
    const normalizedMass = weightKg / Math.pow(heightRatio, 3);
    const referenceMass = isMale ? 78 : 62;
    const referenceFat = isMale ? .15 : .22;
    const fatFraction = THREE.MathUtils.clamp(bodyFat / 100, .03, .6);
    const fatRatio = normalizedMass * fatFraction / (referenceMass * referenceFat);
    const leanRatio = normalizedMass * (1-fatFraction) / (referenceMass * (1-referenceFat));
    setInfluence('Weight_More', Math.max(0, fatRatio-1) / 2, .85);
    setInfluence('Weight_Less', Math.max(0, 1-fatRatio), .65);
    const detail = ((morphValues.Muscle ?? 50)-50) / 100;
    setInfluence('Muscle', Math.max(0, leanRatio-1) + .18 + detail, .65);
  } else {
    setInfluence('Muscle', (morphValues.Muscle ?? 20) / 100, .9);
    const neutralFat = isMale ? 15 : 22;
    setInfluence('Weight_More', Math.max(0, bodyFat-neutralFat) / 18, .8);
    setInfluence('Weight_Less', Math.max(0, neutralFat-bodyFat) / 11, .8);
  }

  // 3. Waistline
  const neutralWaist = isMale ? 78 : 69;
  mapBidirectional(
    morphValues['Waist'],
    neutralWaist,
    55,
    105,
    'Waist_Expand',
    'Waist_Cinch',
    0.80
  );

  // Pectoral targets change muscle tissue, so breast volume must not drive them.
  const chestRatio = isMale
    ? mapBidirectional(morphValues['Chest'], 98, 80, 130, 'Chest_Expand', 'Chest_Reduce', 0.65)
    : 0;

  // The female mesh already has a baked bust. Apply one modest cup-volume
  // correction instead of stacking pectoral, ribcage, and breast reductions.
  if (!isMale) {
    mapBidirectional(morphValues['Breast'], 85, 70, 100, 'Bust_Expand', 'Bust_Reduce', 0.55);
  }

  // Girth controls the torso independently. Match both sides of each UI range;
  // the former female minimum equalled its baseline, saturating any reduction.
  const girthRatio = mapBidirectional(
    morphValues['Bust Girth'],
    isMale ? 86 : 66,
    isMale ? 78 : 56,
    isMale ? 98 : 76,
    'Bust_Girth_Expand',
    'Bust_Girth_Reduce',
    isMale ? 0.5 : 0.3
  );
  setInfluence(girthRatio >= 0 ? 'Ribcage_Expand' : 'Ribcage_Reduce', Math.abs(girthRatio), 0.2);

  // 6. Shoulders & Deltoid Caps
  const neutralShoulder = isMale ? 14.2 : 13.8;
  const shoulderRatio = mapBidirectional(
    morphValues['Shoulders'],
    neutralShoulder,
    11,
    18,
    'Shoulders_Wide',
    'Shoulders_Narrow',
    0.85
  );
  if (shoulderRatio > 0) {
    setInfluence('Deltoids_Muscular', shoulderRatio * 0.65, 0.85);
    setInfluence('Deltoids_Slim', 0);
  } else {
    setInfluence('Deltoids_Slim', Math.abs(shoulderRatio) * 0.50, 0.85);
    setInfluence('Deltoids_Muscular', 0);
  }

  // 7. Glutes & Hips
  const hipVal = morphValues['Hip Girth'] ?? morphValues['Glutes'];
  const neutralHips = isMale ? 96 : 98;
  const hipRatio = mapBidirectional(
    hipVal,
    neutralHips,
    82,
    118,
    'Hips_Expand',
    'Hips_Reduce',
    0.80
  );
  if (hipRatio > 0) {
    setInfluence('Glutes_Full', hipRatio * 0.70, 0.80);
    setInfluence('Glutes_Slim', 0);
  } else {
    setInfluence('Glutes_Slim', Math.abs(hipRatio) * 0.60, 0.80);
    setInfluence('Glutes_Full', 0);
  }

  // 8. Quads & Thighs
  const thighVal = morphValues['Thigh Girth'] ?? morphValues['Quads'];
  const neutralThigh = isMale ? 56 : 56;
  const thighRatio = mapBidirectional(
    thighVal,
    neutralThigh,
    44,
    72,
    'Thighs_Muscular',
    'Thighs_Slim',
    0.85
  );
  if (thighRatio > 0) {
    setInfluence('Quads_Muscular', thighRatio * 0.60, 0.85);
    setInfluence('Quads_Slim', 0);
  } else {
    setInfluence('Quads_Slim', Math.abs(thighRatio) * 0.50, 0.85);
    setInfluence('Quads_Muscular', 0);
  }

  // 9. Arms, Forearms & Deltoids
  const armVal = morphValues['Upper Arm Girth'] ?? morphValues['Arms'];
  const neutralArm = isMale ? 31 : 26;
  const armRatio = mapBidirectional(
    armVal,
    neutralArm,
    22,
    42,
    'Arms_Muscular',
    'Arms_Slim',
    0.85
  );
  // Harmonious forearm scaling
  if (armRatio > 0) {
    setInfluence('Forearms_Muscular', armRatio * 0.55, 0.85);
    setInfluence('Forearms_Wide', armRatio * 0.40, 0.85);
    setInfluence('Forearms_Slim', 0);
    setInfluence('Forearms_Narrow', 0);
  } else {
    setInfluence('Forearms_Slim', Math.abs(armRatio) * 0.45, 0.85);
    setInfluence('Forearms_Narrow', Math.abs(armRatio) * 0.35, 0.85);
    setInfluence('Forearms_Muscular', 0);
    setInfluence('Forearms_Wide', 0);
  }

  // 10. Calves & Gastrocnemius
  const calfVal = morphValues['Calf Girth'] ?? morphValues['Calf'];
  const neutralCalf = isMale ? 37.5 : 36;
  const calfRatio = mapBidirectional(
    calfVal,
    neutralCalf,
    30,
    48,
    'Calves_Muscular',
    'Calves_Slim',
    0.85
  );
  if (calfRatio > 0) {
    setInfluence('Gastrocnemius_Muscular', calfRatio * 0.60, 0.85);
    setInfluence('Gastrocnemius_Slim', 0);
  } else {
    setInfluence('Gastrocnemius_Slim', Math.abs(calfRatio) * 0.50, 0.85);
    setInfluence('Gastrocnemius_Muscular', 0);
  }

  // 11. Neck
  const neckVal = morphValues['Neck'];
  const neutralNeck = isMale ? 37 : 31;
  mapBidirectional(
    neckVal,
    neutralNeck,
    28,
    46,
    'Neck_Muscular',
    'Neck_Slim',
    0.80
  );

  // 12. Stomach Form
  const stomachVal = morphValues['Stomach Form'];
  const neutralStomach = 0.8;
  mapBidirectional(
    stomachVal,
    neutralStomach,
    0,
    2.0,
    'Stomach_Full',
    'Stomach_Tone',
    0.80
  );

  // 13. Back / Lats & V-Taper
  if (chestRatio > 0.15 || shoulderRatio > 0.15) {
    const taperStrength = Math.max(chestRatio, shoulderRatio) * 0.45;
    setInfluence('Lats_Expand', taperStrength, 0.80);
    setInfluence('Vshape_Expand', taperStrength * 0.50, 0.80);
  }

  return influences;
}
