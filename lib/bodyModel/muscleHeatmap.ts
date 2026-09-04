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
  isDarkBase: boolean = true
): Float32Array {
  const colors = new Float32Array(numVerts * 3);
  const h = totalHeight;

  // Base neutral tone (charcoal obsidian in dark mode, sculpted alabaster in light mode)
  const baseR = isDarkBase ? 0.11 : 0.82;
  const baseG = isDarkBase ? 0.12 : 0.83;
  const baseB = isDarkBase ? 0.15 : 0.85;

  // Coronal mid-plane dividing anterior (front) from posterior (back) in our GLB coordinate space
  const coronalMidZ = 0.035;

  for (let i = 0; i < numVerts; i++) {
    const idx = i * 3;
    const x = positions[idx]!;
    const y = positions[idx + 1]!;
    const z = positions[idx + 2]!;

    let vertexFatigue = 0.0;

    // 1. Chest (Pectoralis Major) — Anterior upper torso
    if (y > 0.64 * h && y < 0.78 * h && z > coronalMidZ && Math.abs(x) < 0.14 * h) {
      const weight = Math.sin(((y - 0.64 * h) / (0.14 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.chest * weight);
    }

    // 2. Shoulders (Deltoids) — Lateral caps
    if (y > 0.72 * h && y < 0.86 * h && Math.abs(x) > 0.08 * h && Math.abs(x) < 0.18 * h) {
      const weight = Math.sin(((y - 0.72 * h) / (0.14 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.shoulders * weight);
    }

    // 3. Lats (Latissimus Dorsi) — Posterior mid-back wings
    if (y > 0.55 * h && y < 0.74 * h && z <= coronalMidZ + 0.01 && Math.abs(x) > 0.06 * h && Math.abs(x) < 0.18 * h) {
      const weight = Math.sin(((y - 0.55 * h) / (0.19 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.lats * weight);
    }

    // 4. Abs (Rectus Abdominis / Core) — Anterior midsection
    if (y > 0.49 * h && y < 0.65 * h && z > coronalMidZ && Math.abs(x) < 0.10 * h) {
      const weight = Math.sin(((y - 0.49 * h) / (0.16 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.abs * weight);
    }

    // 5. Arms — Biceps (Anterior) vs Triceps (Posterior)
    if (y > 0.52 * h && y < 0.75 * h && Math.abs(x) > 0.14 * h) {
      const armWeight = Math.sin(((y - 0.52 * h) / (0.23 * h)) * Math.PI);
      if (z > coronalMidZ) {
        vertexFatigue = Math.max(vertexFatigue, fatigue.biceps * armWeight);
      } else {
        vertexFatigue = Math.max(vertexFatigue, fatigue.triceps * armWeight);
      }
    }

    // 6. Glutes (Gluteus Maximus) — Posterior pelvic shelf
    if (y > 0.41 * h && y < 0.55 * h && z <= coronalMidZ + 0.01 && Math.abs(x) < 0.15 * h) {
      const weight = Math.sin(((y - 0.41 * h) / (0.14 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.glutes * weight);
    }

    // 7. Quads (Quadriceps Femoris) — Anterior thighs
    if (y > 0.25 * h && y < 0.48 * h && z > coronalMidZ && Math.abs(x) > 0.04 * h && Math.abs(x) < 0.15 * h) {
      const weight = Math.sin(((y - 0.25 * h) / (0.23 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.quads * weight);
    }

    // 8. Hamstrings (Posterior Leg) — Posterior thighs
    if (y > 0.25 * h && y < 0.46 * h && z <= coronalMidZ && Math.abs(x) > 0.04 * h && Math.abs(x) < 0.14 * h) {
      const weight = Math.sin(((y - 0.25 * h) / (0.21 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.hamstrings * weight);
    }

    // 9. Calves (Gastrocnemius / Soleus) — Lower legs posterior
    if (y > 0.08 * h && y < 0.26 * h && Math.abs(x) > 0.03 * h && Math.abs(x) < 0.11 * h) {
      const weight = Math.sin(((y - 0.08 * h) / (0.18 * h)) * Math.PI);
      vertexFatigue = Math.max(vertexFatigue, fatigue.calves * weight);
    }

    // High-visibility glowing thermal gradient:
    // Base Slate -> Electric Cyan -> Vivid Lime -> Radiant Amber -> Scorching Crimson
    if (vertexFatigue < 0.15) {
      colors[idx] = baseR;
      colors[idx + 1] = baseG;
      colors[idx + 2] = baseB;
    } else if (vertexFatigue < 0.45) {
      // Blend Slate to Electric Cyan (#00E5FF)
      const t = (vertexFatigue - 0.15) / (0.45 - 0.15);
      colors[idx] = THREE.MathUtils.lerp(baseR, 0.0, t);
      colors[idx + 1] = THREE.MathUtils.lerp(baseG, 0.90, t);
      colors[idx + 2] = THREE.MathUtils.lerp(baseB, 1.0, t);
    } else if (vertexFatigue < 0.70) {
      // Blend Electric Cyan to Vivid Lime (#CBFF00)
      const t = (vertexFatigue - 0.45) / (0.70 - 0.45);
      colors[idx] = THREE.MathUtils.lerp(0.0, 0.796, t);
      colors[idx + 1] = 1.0;
      colors[idx + 2] = THREE.MathUtils.lerp(1.0, 0.0, t);
    } else if (vertexFatigue < 0.85) {
      // Blend Vivid Lime to Radiant Amber (#FFAA00)
      const t = (vertexFatigue - 0.70) / (0.85 - 0.70);
      colors[idx] = THREE.MathUtils.lerp(0.796, 1.0, t);
      colors[idx + 1] = THREE.MathUtils.lerp(1.0, 0.667, t);
      colors[idx + 2] = 0.0;
    } else {
      // Blend Radiant Amber to Scorching Crimson (#FF1744)
      const t = Math.min(1.0, (vertexFatigue - 0.85) / 0.15);
      colors[idx] = 1.0;
      colors[idx + 1] = THREE.MathUtils.lerp(0.667, 0.09, t);
      colors[idx + 2] = THREE.MathUtils.lerp(0.0, 0.27, t);
    }
  }

  return colors;
}
