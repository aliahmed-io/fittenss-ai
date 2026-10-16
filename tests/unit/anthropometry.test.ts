import { describe, it, expect } from 'vitest';
import {
  calculateMetrics,
  generateSmartMeasurements,
  DEFAULT_HEIGHT_CM,
  FEMALE_PRESETS,
  MALE_PRESETS,
} from '@/lib/bodyModel/anthropometry';

describe('Anthropometry Module', () => {
  it('correctly calculates BMI, WHR, and BWR for typical female profile', () => {
    const morphs = {
      Waist: 68,
      'Hip Girth': 98,
      'Bust Girth': 66,
    };
    const metrics = calculateMetrics('female', 165, 60, 21, morphs);
    expect(metrics.bmi).toBe(22.0);
    expect(metrics.whr).toBe(0.69);
    expect(metrics.archetype).toBe('Pear');
    expect(metrics.healthRisk).toBe('low');
    expect(metrics.leanMassKg).toBe(47.4);
    expect(metrics.fatMassKg).toBe(12.6);
  });

  it('correctly classifies male V-Taper athletic silhouette', () => {
    const morphs = {
      Chest: 110,
      Waist: 76,
      'Hip Girth': 94,
    };
    const metrics = calculateMetrics('male', 180, 80, 12, morphs);
    expect(metrics.bmi).toBe(24.7);
    expect(metrics.whr).toBe(0.81);
    expect(metrics.archetype).toBe('Athletic');
    expect(metrics.healthRisk).toBe('low');
  });

  it('scales smart measurements proportionally with user height', () => {
    const normalFemale = generateSmartMeasurements('female', DEFAULT_HEIGHT_CM.female, 62, 22);
    const tallFemale = generateSmartMeasurements('female', 180, 62, 22);

    expect(tallFemale['Height']).toBe(180);
    expect(tallFemale['Arm Length']).toBeGreaterThan(normalFemale['Arm Length']!);
    expect(tallFemale['lower Leg']).toBeGreaterThan(normalFemale['lower Leg']!);
    expect(tallFemale['Hip Height']).toBeGreaterThan(normalFemale['Hip Height']!);
  });

  it('guarantees female and male presets contain valid finite values', () => {
    for (const preset of FEMALE_PRESETS) {
      expect(preset.gender).toBe('female');
      expect(Object.keys(preset.measurements).length).toBeGreaterThan(5);
      for (const val of Object.values(preset.measurements)) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }

    for (const preset of MALE_PRESETS) {
      expect(preset.gender).toBe('male');
      expect(Object.keys(preset.measurements).length).toBeGreaterThan(5);
      for (const val of Object.values(preset.measurements)) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });
});
