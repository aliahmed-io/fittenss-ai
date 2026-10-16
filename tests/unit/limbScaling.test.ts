import { describe, it, expect } from 'vitest';
import { computeLimbRatios } from '@/lib/bodyModel/limbScaling';

describe('Limb Scaling Module', () => {
  it('returns baseline ratios (1.0) when values match reference defaults', () => {
    const femaleRatios = computeLimbRatios('female', {
      Height: 165,
      'Arm Length': 23,
      'lower Leg': 45,
    });
    expect(femaleRatios.arm).toBeCloseTo(1.0, 2);
    expect(femaleRatios.lowerLeg).toBeCloseTo(1.0, 2);

    const maleRatios = computeLimbRatios('male', {
      Height: 178,
      'Arm Length': 26,
      'Lower Leg Length': 38,
    });
    expect(maleRatios.arm).toBeCloseTo(1.0, 2);
    expect(maleRatios.lowerLeg).toBeCloseTo(1.0, 2);
  });

  it('clamps extreme values within safe anatomical limits (0.85 to 1.2)', () => {
    const extremeLow = computeLimbRatios('female', {
      Height: 165,
      'Arm Length': 5,
      'lower Leg': 10,
    });
    expect(extremeLow.arm).toBe(0.85);
    expect(extremeLow.lowerLeg).toBe(0.85);

    const extremeHigh = computeLimbRatios('male', {
      Height: 178,
      'Arm Length': 60,
      'Lower Leg Length': 90,
    });
    expect(extremeHigh.arm).toBe(1.2);
    expect(extremeHigh.lowerLeg).toBe(1.2);
  });

  it('handles missing morph keys by using baseline values', () => {
    const fallback = computeLimbRatios('female', {});
    expect(fallback.arm).toBe(1.0);
    expect(fallback.lowerLeg).toBe(1.0);
  });
});
