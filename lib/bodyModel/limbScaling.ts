import { DEFAULT_HEIGHT_CM, Gender } from './anthropometry';

/** Slider keys that map to skeletal limb-length scaling. */
const ARM_KEYS = ['Arm Length'] as const;
const LEG_KEYS = ['Lower Leg Length', 'lower Leg'] as const;

const DEFAULT_ARM_CM: Record<Gender, number> = { female: 23, male: 26 };
const DEFAULT_LOWER_LEG_CM: Record<Gender, number> = { female: 45, male: 38 };

const MIN_RATIO = 0.85;
const MAX_RATIO = 1.2;

export interface LimbRatios {
  /** Multiplier applied to forearm + hand offsets (arm length). */
  arm: number;
  /** Multiplier applied to the foot offset (lower leg length). */
  lowerLeg: number;
}

function firstDefined(values: Record<string, number>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const v = values[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

function clampRatio(r: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
}

/**
 * Converts the Arm Length / Lower Leg Length sliders into skeletal ratios.
 * Values are normalised by stature so the global Height scale is not applied twice.
 */
export function computeLimbRatios(
  gender: Gender,
  morphValues: Record<string, number>
): LimbRatios {
  const height = morphValues['Height'] ?? DEFAULT_HEIGHT_CM[gender];
  const heightFactor = height / DEFAULT_HEIGHT_CM[gender];

  const arm = firstDefined(morphValues, ARM_KEYS);
  const leg = firstDefined(morphValues, LEG_KEYS);

  return {
    arm: arm === undefined ? 1 : clampRatio(arm / (DEFAULT_ARM_CM[gender] * heightFactor)),
    lowerLeg:
      leg === undefined ? 1 : clampRatio(leg / (DEFAULT_LOWER_LEG_CM[gender] * heightFactor)),
  };
}
