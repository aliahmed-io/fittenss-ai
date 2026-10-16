export type Gender = 'female' | 'male';

export const DEFAULT_HEIGHT_CM: Record<Gender, number> = { female: 165, male: 178 };

export type BodyArchetype = 'Hourglass' | 'Pear' | 'Inverted Triangle' | 'Athletic' | 'Rectangle';

export interface AnthropometricMetrics {
  bmi: number;
  whr: number; // Waist-to-Hip ratio
  bwr: number; // Bust-to-Waist ratio
  archetype: BodyArchetype;
  leanMassKg: number;
  fatMassKg: number;
  healthRisk: 'low' | 'moderate' | 'high';
  shapeDescription: string;
}

export interface BodyPreset {
  id: string;
  name: string;
  description: string;
  gender: Gender;
  measurements: Record<string, number>;
}

/**
 * Calculates anthropometric health indicators from body parameters.
 */
export function calculateMetrics(
  gender: Gender,
  heightCm: number,
  weightKg: number,
  bodyFatPct: number,
  morphValues: Record<string, number>
): AnthropometricMetrics {
  const safeHeightM = Math.max(heightCm, 50) / 100;
  const safeWeight = Math.max(weightKg, 20);
  const bmi = +(safeWeight / (safeHeightM * safeHeightM)).toFixed(1);

  const fatPct = Math.min(Math.max(bodyFatPct, 3), 60);
  const fatMassKg = +(safeWeight * (fatPct / 100)).toFixed(1);
  const leanMassKg = +(safeWeight - fatMassKg).toFixed(1);

  // Derive waist, hip, bust from active morph values or standard defaults
  const waist = morphValues['Waist'] ?? (gender === 'female' ? 75 : 80);
  const hips = morphValues['Hip Girth'] ?? (gender === 'female' ? 100 : 98);
  const bust = gender === 'female'
    ? (morphValues['Bust Girth'] ?? 66)
    : (morphValues['Chest'] ?? 100);

  const whr = +(waist / Math.max(hips, 1)).toFixed(2);
  const bwr = +(bust / Math.max(waist, 1)).toFixed(2);

  // Classify Body Silhouette Archetype
  let archetype: BodyArchetype = 'Hourglass';
  let shapeDescription = 'Classic balanced curves with a defined waistline.';

  if (gender === 'female') {
    if (whr <= 0.75 && hips > bust * 1.05) {
      archetype = 'Pear';
      shapeDescription = 'Naturally wider pelvic base with graceful waist curvature.';
    } else if (whr <= 0.75 && bust >= hips * 0.95) {
      archetype = 'Hourglass';
      shapeDescription = 'Harmonious bust and hip curves with a well-defined waist.';
    } else if (bust > hips * 1.08 && whr > 0.75) {
      archetype = 'Inverted Triangle';
      shapeDescription = 'Broad athletic shoulder frame tapering down to slim hips.';
    } else if (whr < 0.78 && fatPct < 22) {
      archetype = 'Athletic';
      shapeDescription = 'Toned, muscular physique with high lean mass and core definition.';
    } else {
      archetype = 'Rectangle';
      shapeDescription = 'Streamlined, athletic silhouette with evenly distributed proportions.';
    }
  } else {
    // Male anthropometry: V-Taper (chest/shoulders broad, narrow waist)
    const chestToWaist = bust / Math.max(waist, 1);
    if (chestToWaist >= 1.28 || (whr <= 0.85 && fatPct <= 16)) {
      archetype = 'Athletic';
      shapeDescription = 'V-Taper aesthetic with broad shoulders, developed chest, and narrow athletic waist.';
    } else if (whr <= 0.90) {
      archetype = 'Rectangle';
      shapeDescription = 'Balanced athletic frame with even proportions.';
    } else {
      archetype = 'Inverted Triangle';
      shapeDescription = 'Strong upper torso development.';
    }
  }

  // Health risk based on WHO Waist-to-Hip Ratio guidelines
  // Women: < 0.80 low, 0.81-0.85 moderate, > 0.85 high
  // Men: < 0.90 low, 0.90-0.95 moderate, > 0.95 high
  let healthRisk: 'low' | 'moderate' | 'high' = 'low';
  if (gender === 'female') {
    if (whr > 0.85) healthRisk = 'high';
    else if (whr > 0.80) healthRisk = 'moderate';
    else healthRisk = 'low';
  } else {
    if (whr > 0.95) healthRisk = 'high';
    else if (whr > 0.90) healthRisk = 'moderate';
    else healthRisk = 'low';
  }

  return {
    bmi,
    whr,
    bwr,
    archetype,
    leanMassKg,
    fatMassKg,
    healthRisk,
    shapeDescription,
  };
}

/**
 * Generates biologically realistic, smart body measurements based on anthropometric
 * adipose and skeletal distribution models.
 */
export function generateSmartMeasurements(
  gender: Gender,
  heightCm: number,
  weightKg: number,
  bodyFatPct: number
): Record<string, number> {
  const h = Math.max(120, Math.min(210, heightCm));
  const w = Math.max(35, Math.min(150, weightKg));
  const bf = Math.max(8, Math.min(50, bodyFatPct));

  // Height scaling ratio relative to the gender-specific baseline stature
  const heightFactor = h / DEFAULT_HEIGHT_CM[gender];
  // BMI relative to normal median of 21.5
  const currentBmi = w / Math.pow(h / 100, 2);
  const bmiDelta = currentBmi - 21.5;

  if (gender === 'female') {
    // Gynoid adipose distribution: hips, thighs, breasts receive higher fat allocation
    const fatBonus = (bf - 22) * 0.4;

    const waistBase = 70 + bmiDelta * 1.1 + fatBonus * 0.5;
    const hipBase = 96 + bmiDelta * 1.35 + fatBonus * 0.9;
    const bustBase = 86 + bmiDelta * 0.9 + fatBonus * 0.7;
    const breastBase = 80 + bmiDelta * 0.65 + fatBonus * 0.6;
    const thighBase = 54 + bmiDelta * 0.85 + fatBonus * 0.65;
    const calfBase = 35 + bmiDelta * 0.45 + fatBonus * 0.3;
    const armBase = 26 + bmiDelta * 0.35 + fatBonus * 0.25;
    const shoulderBase = 14 * heightFactor + bmiDelta * 0.08;

    return {
      Height: Math.round(h), // Exact stature in centimeters
      'Neck Height': Math.min(9, Math.max(5, +(7 * heightFactor).toFixed(1))),
      Neck: Math.min(35, Math.max(27, +(31 + bmiDelta * 0.25).toFixed(1))),
      Shoulders: Math.min(16, Math.max(12, +shoulderBase.toFixed(1))),
      'Shoulder Angle': 1.0,
      Breast: Math.min(100, Math.max(70, +breastBase.toFixed(1))),
      'Bust Girth': Math.min(76, Math.max(56, +(bustBase * 0.78).toFixed(1))),
      'Arm Length': Math.min(27, Math.max(16, +(23 * heightFactor).toFixed(1))),
      'Upper Arm Girth': Math.min(32, Math.max(22, +armBase.toFixed(1))),
      Wrist: Math.min(18, Math.max(9, +(13.5 + bmiDelta * 0.1).toFixed(1))),
      'Stomach Form': Math.min(2, Math.max(0, +(1 + bmiDelta * 0.08 + (bf - 22) * 0.04).toFixed(1))),
      Waist: Math.min(85, Math.max(65, +waistBase.toFixed(1))),
      'Hip Girth': Math.min(114, Math.max(86, +hipBase.toFixed(1))),
      'Hip Height': Math.min(92, Math.max(72, +(82 * heightFactor).toFixed(1))),
      'Thigh Girth': Math.min(66, Math.max(49, +thighBase.toFixed(1))),
      'Calf Girth': Math.min(44, Math.max(26, +calfBase.toFixed(1))),
      'lower Leg': Math.min(53, Math.max(39, +(45 * heightFactor).toFixed(1))),
    };
  }

  // Male defaults
  const fatBonus = (bf - 15) * 0.4;
  return {
    Height: Math.round(h),
    Chest: Math.min(130, Math.max(84, +(98 + bmiDelta * 1.2 + fatBonus * 0.5).toFixed(1))),
    Neck: Math.min(42, Math.max(32, +(37 + bmiDelta * 0.3).toFixed(1))),
    'Neck Height': Math.min(16, Math.max(9.5, +(12.3 * heightFactor).toFixed(1))),
    Shoulders: Math.min(17, Math.max(11.5, +(14.2 + bmiDelta * 0.15).toFixed(1))),
    "Shoulder's Slope": 1.0,
    'Bust Girth': Math.min(98, Math.max(78, +(86 + bmiDelta * 0.7).toFixed(1))),
    'Stomach Form': Math.min(2, Math.max(0, +(0.8 + bmiDelta * 0.1).toFixed(1))),
    Waist: Math.min(105, Math.max(65, +(78 + bmiDelta * 1.1 + fatBonus * 0.7).toFixed(1))),
    'Arm Length': Math.min(32, Math.max(21, +(26 * heightFactor).toFixed(1))),
    'Upper Arm Girth': Math.min(42, Math.max(22, +(31 + bmiDelta * 0.4 + fatBonus * 0.2).toFixed(1))),
    Wrist: Math.min(20, Math.max(12, +(16 + bmiDelta * 0.15).toFixed(1))),
    'Hip Girth': Math.min(118, Math.max(82, +(96 + bmiDelta * 0.8 + fatBonus * 0.4).toFixed(1))),
    'Hip Height': Math.min(46, Math.max(29, +(36 * heightFactor).toFixed(1))),
    'Thigh Girth': Math.min(72, Math.max(44, +(56 + bmiDelta * 0.7 + fatBonus * 0.4).toFixed(1))),
    'Lower Leg Length': Math.min(46, Math.max(29, +(38 * heightFactor).toFixed(1))),
    Calf: Math.min(48, Math.max(30, +(37.5 + bmiDelta * 0.3 + fatBonus * 0.15).toFixed(1))),
  };
}

/**
 * Curated body shape presets for fast, realistic anatomical transformations.
 */
export const FEMALE_PRESETS: BodyPreset[] = [
  {
    id: 'hourglass',
    name: 'Classic Hourglass',
    description: 'Balanced bust and hip curves with a defined 0.70 WHR waistline.',
    gender: 'female',
    measurements: {
      Height: 162,
      'Neck Height': 7.0,
      Neck: 30.5,
      Shoulders: 13.8,
      'Shoulder Angle': 1.0,
      Breast: 90.0,
      'Bust Girth': 68.0,
      'Arm Length': 22.8,
      'Upper Arm Girth': 26.0,
      Wrist: 13.5,
      'Stomach Form': 0.8,
      Waist: 68.0,
      'Hip Girth': 102.0,
      'Hip Height': 82.0,
      'Thigh Girth': 57.0,
      'Calf Girth': 36.0,
      'lower Leg': 45.0,
    },
  },
  {
    id: 'athletic',
    name: 'Athletic / Toned',
    description: 'Low body fat, broad clavicle shoulders, firm core, and sculpted quads.',
    gender: 'female',
    measurements: {
      Height: 168,
      'Neck Height': 7.2,
      Neck: 31.0,
      Shoulders: 14.8,
      'Shoulder Angle': 1.1,
      Breast: 82.0,
      'Bust Girth': 67.0,
      'Arm Length': 23.5,
      'Upper Arm Girth': 27.5,
      Wrist: 14.0,
      'Stomach Form': 0.2,
      Waist: 66.0,
      'Hip Girth': 94.0,
      'Hip Height': 84.0,
      'Thigh Girth': 55.0,
      'Calf Girth': 35.5,
      'lower Leg': 47.0,
    },
  },
  {
    id: 'pear',
    name: 'Pear / Gynoid',
    description: 'Narrower upper torso flowing into prominent hips, glutes, and thighs.',
    gender: 'female',
    measurements: {
      Height: 160,
      'Neck Height': 6.8,
      Neck: 30.0,
      Shoulders: 13.2,
      'Shoulder Angle': 0.9,
      Breast: 78.0,
      'Bust Girth': 64.0,
      'Arm Length': 22.0,
      'Upper Arm Girth': 25.0,
      Wrist: 13.2,
      'Stomach Form': 1.0,
      Waist: 70.0,
      'Hip Girth': 106.0,
      'Hip Height': 80.0,
      'Thigh Girth': 61.0,
      'Calf Girth': 38.0,
      'lower Leg': 44.0,
    },
  },
  {
    id: 'ruler',
    name: 'Slender / Athletic',
    description: 'Straight silhouette with uniform chest, waist, and hip alignment.',
    gender: 'female',
    measurements: {
      Height: 165,
      'Neck Height': 7.0,
      Neck: 30.5,
      Shoulders: 14.0,
      'Shoulder Angle': 1.0,
      Breast: 80.0,
      'Bust Girth': 65.0,
      'Arm Length': 23.0,
      'Upper Arm Girth': 25.5,
      Wrist: 13.5,
      'Stomach Form': 0.5,
      Waist: 72.0,
      'Hip Girth': 92.0,
      'Hip Height': 83.0,
      'Thigh Girth': 53.0,
      'Calf Girth': 35.0,
      'lower Leg': 46.0,
    },
  },
  {
    id: 'curvy',
    name: 'Full Curve',
    description: 'Substantial bust and hip dimensions with a proportional feminine waist.',
    gender: 'female',
    measurements: {
      Height: 164,
      'Neck Height': 7.0,
      Neck: 32.0,
      Shoulders: 14.2,
      'Shoulder Angle': 1.0,
      Breast: 98.0,
      'Bust Girth': 72.0,
      'Arm Length': 22.5,
      'Upper Arm Girth': 28.5,
      Wrist: 14.2,
      'Stomach Form': 1.3,
      Waist: 76.0,
      'Hip Girth': 110.0,
      'Hip Height': 81.0,
      'Thigh Girth': 63.0,
      'Calf Girth': 39.0,
      'lower Leg': 44.0,
    },
  },
  {
    id: 'baseline',
    name: 'Standard Baseline',
    description: 'Neutral anatomical reference proportion.',
    gender: 'female',
    measurements: {
      Height: 165,
      'Neck Height': 7,
      Neck: 31,
      Shoulders: 14,
      'Shoulder Angle': 1,
      Breast: 85,
      'Bust Girth': 66,
      'Arm Length': 23,
      'Upper Arm Girth': 27,
      Wrist: 14,
      'Stomach Form': 1,
      Waist: 72,
      'Hip Girth': 98,
      'Hip Height': 82,
      'Thigh Girth': 56,
      'Calf Girth': 36,
      'lower Leg': 45,
    },
  },
];

export const MALE_PRESETS: BodyPreset[] = [
  {
    id: 'v-taper',
    name: 'V-Taper Aesthetic',
    description: 'Broad deltoids, expansive chest plate, tight 0.80 WHR athletic waist, and lean muscular quads.',
    gender: 'male',
    measurements: {
      Height: 178,
      Chest: 108.0,
      Neck: 38.0,
      'Neck Height': 12.5,
      Shoulders: 15.4,
      "Shoulder's Slope": 1.0,
      'Bust Girth': 90.0,
      'Stomach Form': 0.2,
      Waist: 75.0,
      'Arm Length': 26.5,
      'Upper Arm Girth': 33.0,
      Wrist: 16.5,
      'Hip Girth': 94.0,
      'Hip Height': 36.0,
      'Thigh Girth': 57.0,
      'Lower Leg Length': 38.0,
      Calf: 38.0,
    },
  },
  {
    id: 'muscular',
    name: 'Muscular / Bodybuilder',
    description: 'High muscle mass index, dense upper body development, wide back, and powerful legs.',
    gender: 'male',
    measurements: {
      Height: 180,
      Chest: 116.0,
      Neck: 40.0,
      'Neck Height': 12.8,
      Shoulders: 15.8,
      "Shoulder's Slope": 1.1,
      'Bust Girth': 94.0,
      'Stomach Form': 0.5,
      Waist: 80.0,
      'Arm Length': 27.0,
      'Upper Arm Girth': 36.0,
      Wrist: 17.5,
      'Hip Girth': 98.0,
      'Hip Height': 36.5,
      'Thigh Girth': 62.0,
      'Lower Leg Length': 38.5,
      Calf: 40.5,
    },
  },
  {
    id: 'lean',
    name: 'Lean Athletic / Runner',
    description: 'Sub-12% body fat frame, low abdominal mass, trim waist, and agile leg structure.',
    gender: 'male',
    measurements: {
      Height: 176,
      Chest: 96.0,
      Neck: 36.0,
      'Neck Height': 12.0,
      Shoulders: 14.0,
      "Shoulder's Slope": 0.9,
      'Bust Girth': 85.0,
      'Stomach Form': 0.2,
      Waist: 72.0,
      'Arm Length': 26.0,
      'Upper Arm Girth': 29.0,
      Wrist: 15.5,
      'Hip Girth': 92.0,
      'Hip Height': 36.0,
      'Thigh Girth': 52.0,
      'Lower Leg Length': 38.0,
      Calf: 36.0,
    },
  },
  {
    id: 'baseline',
    name: 'Standard Baseline',
    description: 'Average healthy male anatomical proportion reference.',
    gender: 'male',
    measurements: {
      Height: 178,
      Chest: 98.0,
      Neck: 37.0,
      'Neck Height': 12.36,
      Shoulders: 14.2,
      "Shoulder's Slope": 1.0,
      'Bust Girth': 86.0,
      'Stomach Form': 0.8,
      Waist: 78.0,
      'Arm Length': 26.0,
      'Upper Arm Girth': 31.0,
      Wrist: 16.0,
      'Hip Girth': 96.0,
      'Hip Height': 36.0,
      'Thigh Girth': 56.0,
      'Lower Leg Length': 38.0,
      Calf: 37.5,
    },
  },
];
