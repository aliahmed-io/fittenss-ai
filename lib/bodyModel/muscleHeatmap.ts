import * as THREE from 'three';

export type MuscleGroup =
  | 'chest'
  | 'shoulders'
  | 'lats'
  | 'abs'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves';

export type MuscleFatigueState = Record<MuscleGroup, number>; // 0.0 (fresh) to 1.0 (peak fatigue)

export interface WorkoutStrainPreset {
  id: string;
  name: string;
  description: string;
  fatigue: MuscleFatigueState;
}

export const WORKOUT_STRAIN_PRESETS: WorkoutStrainPreset[] = [
  {
    id: 'push',
    name: 'Push Day (Chest, Shoulders, Triceps)',
    description: 'Anterior chain exhaustion from heavy pressing and lateral raises.',
    fatigue: {
      chest: 0.95,
      shoulders: 0.88,
      triceps: 0.85,
      abs: 0.40,
      lats: 0.10,
      biceps: 0.15,
      quads: 0.05,
      hamstrings: 0.05,
      glutes: 0.05,
      calves: 0.05,
    },
  },
  {
    id: 'pull',
    name: 'Pull Day (Lats, Traps, Biceps)',
    description: 'Posterior upper-body hypertrophy and heavy pulling strain.',
    fatigue: {
      lats: 0.95,
      biceps: 0.90,
      shoulders: 0.45,
      abs: 0.35,
      chest: 0.10,
      triceps: 0.10,
      glutes: 0.30,
      hamstrings: 0.40,
      quads: 0.05,
      calves: 0.05,
    },
  },
  {
    id: 'legs',
    name: 'Leg Day (Quads, Glutes, Hamstrings)',
    description: 'Severe lower body central nervous system fatigue and mechanical tension.',
    fatigue: {
      quads: 0.98,
      glutes: 0.92,
      hamstrings: 0.88,
      calves: 0.75,
      abs: 0.50,
      chest: 0.05,
      shoulders: 0.05,
      lats: 0.15,
      biceps: 0.05,
      triceps: 0.05,
    },
  },
  {
    id: 'full_body',
    name: 'Full Body Compound Protocol',
    description: 'Evenly distributed metabolic stress across all major compound levers.',
    fatigue: {
      chest: 0.75,
      shoulders: 0.70,
      lats: 0.75,
      abs: 0.80,
      biceps: 0.65,
      triceps: 0.65,
      quads: 0.80,
      hamstrings: 0.75,
      glutes: 0.70,
      calves: 0.60,
    },
  },
  {
    id: 'rest',
    name: 'Fully Recovered (Rest Baseline)',
    description: 'Systemic muscle recovery complete; baseline muscle tone.',
    fatigue: {
      chest: 0.05,
      shoulders: 0.05,
      lats: 0.05,
      abs: 0.05,
      biceps: 0.05,
      triceps: 0.05,
      quads: 0.05,
      hamstrings: 0.05,
      glutes: 0.05,
      calves: 0.05,
    },
  },
];

/**
 * Generates an RGB vertex color buffer representing anatomical muscle stress.
 * Smoothly blends from neutral sculpt tone into glowing thermal colors:
 * - < 0.25: Base sculpt tone (Alabaster / Obsidian)
 * - 0.25 - 0.55: #CBFF00 (Active stimulus / Electric Lime)
 * - 0.55 - 0.80: #FFAA00 (Deep pump / Amber)
 * - > 0.80: #FF3344 (Peak fatigue / Crimson)
 */
export function generateMuscleHeatmapColors(
  positions: Float32Array,
  numVerts: number,
  totalHeight: number,
  fatigue: MuscleFatigueState,
  isDarkBase: boolean
): Float32Array {
  const colors = new Float32Array(numVerts * 3);
  const h = totalHeight;

  // Base neutral color
  const baseR = isDarkBase ? 0.12 : 0.84;
  const baseG = isDarkBase ? 0.12 : 0.82;
  const baseB = isDarkBase ? 0.12 : 0.78;

  for (let i = 0; i < numVerts; i++) {
    const idx = i * 3;
    const x = positions[idx]!;
    const y = positions[idx + 1]!;
    const z = positions[idx + 2]!;

    let vertexFatigue = 0.0;

    // 1. Chest (Pectoralis Major)
    if (y > 0.64 * h && y < 0.76 * h && z > 0.015 && Math.abs(x) < 0.13 * h) {
      const weight = Math.sin(((y - 0.64 * h) / (0.12 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.chest * weight);
    }

    // 2. Shoulders (Deltoids)
    if (y > 0.74 * h && y < 0.87 * h && Math.abs(x) > 0.065 * h && Math.abs(x) < 0.16 * h) {
      const weight = Math.sin(((y - 0.74 * h) / (0.13 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.shoulders * weight);
    }

    // 3. Lats (Latissimus Dorsi / Upper Back)
    if (y > 0.58 * h && y < 0.74 * h && z < -0.01 && Math.abs(x) < 0.14 * h) {
      const weight = Math.sin(((y - 0.58 * h) / (0.16 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.lats * weight);
    }

    // 4. Abs (Rectus Abdominis / Core)
    if (y > 0.53 * h && y < 0.65 * h && z > 0.02 && Math.abs(x) < 0.09 * h) {
      const weight = Math.sin(((y - 0.53 * h) / (0.12 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.abs * weight);
    }

    // 5. Arms (Biceps Anterior / Triceps Posterior)
    if (y > 0.58 * h && y < 0.78 * h && Math.abs(x) > 0.12 * h) {
      const armWeight = Math.sin(((y - 0.58 * h) / (0.20 * h)) * Math.PI);
      if (z >= 0) {
        vertexFatigue = Math.max(vertexFatigue, fatigue.biceps * armWeight);
      } else {
        vertexFatigue = Math.max(vertexFatigue, fatigue.triceps * armWeight);
      }
    }

    // 6. Glutes (Gluteus Maximus Posterior)
    if (y > 0.46 * h && y < 0.56 * h && z < -0.015 && Math.abs(x) < 0.12 * h) {
      const weight = Math.sin(((y - 0.46 * h) / (0.10 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.glutes * weight);
    }

    // 7. Quads (Quadriceps Femoris Anterior)
    if (y > 0.28 * h && y < 0.49 * h && z > 0 && Math.abs(x) < 0.13 * h) {
      const weight = Math.sin(((y - 0.28 * h) / (0.21 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.quads * weight);
    }

    // 8. Hamstrings (Posterior Leg)
    if (y > 0.28 * h && y < 0.46 * h && z < 0 && Math.abs(x) < 0.12 * h) {
      const weight = Math.sin(((y - 0.28 * h) / (0.18 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.hamstrings * weight);
    }

    // 9. Calves (Gastrocnemius)
    if (y > 0.10 * h && y < 0.27 * h && Math.abs(x) < 0.10 * h) {
      const weight = Math.sin(((y - 0.10 * h) / (0.17 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.calves * weight);
    }

    // Thermal color interpolation
    if (vertexFatigue < 0.18) {
      // Neutral base
      colors[idx] = baseR;
      colors[idx + 1] = baseG;
      colors[idx + 2] = baseB;
    } else if (vertexFatigue < 0.55) {
      // Blend base to #CBFF00 (Electric Lime: R 0.80, G 1.0, B 0.0)
      const t = (vertexFatigue - 0.18) / (0.55 - 0.18);
      colors[idx] = THREE.MathUtils.lerp(baseR, 0.796, t);
      colors[idx + 1] = THREE.MathUtils.lerp(baseG, 1.0, t);
      colors[idx + 2] = THREE.MathUtils.lerp(baseB, 0.0, t);
    } else if (vertexFatigue < 0.80) {
      // Blend #CBFF00 to #FFAA00 (Amber: R 1.0, G 0.67, B 0.0)
      const t = (vertexFatigue - 0.55) / (0.80 - 0.55);
      colors[idx] = THREE.MathUtils.lerp(0.796, 1.0, t);
      colors[idx + 1] = THREE.MathUtils.lerp(1.0, 0.667, t);
      colors[idx + 2] = 0.0;
    } else {
      // Blend #FFAA00 to #FF2233 (Hot Crimson: R 1.0, G 0.13, B 0.20)
      const t = Math.min(1.0, (vertexFatigue - 0.80) / 0.20);
      colors[idx] = 1.0;
      colors[idx + 1] = THREE.MathUtils.lerp(0.667, 0.133, t);
      colors[idx + 2] = THREE.MathUtils.lerp(0.0, 0.20, t);
    }
  }

  return colors;
}
