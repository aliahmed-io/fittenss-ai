import { describe, it, expect } from 'vitest';
import { computeGLBMorphInfluences } from '@/lib/bodyModel/glbModelLoader';
import { FEMALE_PRESETS, MALE_PRESETS } from '@/lib/bodyModel/anthropometry';
const names = ['Chest_Expand','Chest_Reduce','Bust_Expand','Bust_Reduce','Bust_Girth_Expand','Bust_Girth_Reduce','Ribcage_Expand','Ribcage_Reduce','Lats_Expand','Vshape_Expand','Muscle'];
const map = new Map(names.map((n,i) => [n,i]));
function values(gender: 'male'|'female', morphs: Record<string,number>) { return Object.fromEntries(names.map((n,i) => [n, computeGLBMorphInfluences(gender,map,morphs)[i]])); }
describe('chest morph controls', () => {
  it('separates female cup volume from pectorals and torso width', () => {
    const v = values('female', { Breast: 70, 'Bust Girth': 66 });
    expect(v.Bust_Reduce).toBeCloseTo(.55);
    for (const n of ['Chest_Reduce','Chest_Expand','Ribcage_Reduce','Bust_Girth_Reduce']) expect(v[n]).toBe(0);
  });
  it('reduces girth progressively without saturating below the neutral value', () => {
    const small = values('female', { 'Bust Girth': 65 });
    const smaller = values('female', { 'Bust Girth': 56 });
    expect(small.Bust_Girth_Reduce).toBeCloseTo(.03);
    expect(smaller.Bust_Girth_Reduce).toBeCloseTo(.3);
  });
  it('keeps male chest independent of breast and girth controls', () => {
    expect(values('male', { Chest: 98, Breast: 100, 'Bust Girth': 98 }).Chest_Expand).toBe(0);
    expect(values('male', { Chest: 130 }).Chest_Expand).toBeCloseTo(.65);
  });
  it('bounds all presets and clears opposing targets on every update', () => {
    for (const preset of [...FEMALE_PRESETS, ...MALE_PRESETS]) {
      const v = computeGLBMorphInfluences(preset.gender, map, preset.measurements);
      expect(v.every(x => Number.isFinite(x) && x >= 0 && x <= 1)).toBe(true);
      for (let i=0;i<8;i+=2) expect(v[i]! * v[i+1]!).toBe(0);
    }
    expect(values('female', { Breast: NaN, 'Bust Girth': Infinity }).Bust_Reduce).toBe(0);
  });
});
