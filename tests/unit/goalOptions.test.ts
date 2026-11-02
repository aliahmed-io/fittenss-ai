import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '@/lib/store/fitnessStore';
import { defaultGoal, computeTargets, buildWorkoutPlan } from '@/lib/fitness/engine';
import type { GoalType } from '@/lib/fitness/types';
describe('goal choices', () => {
  const profile = createDefaultProfile('male');
  const types: GoalType[] = ['weight-loss','muscle-gain','recomp','strength'];
  it('changes the target direction and calories appropriately', () => {
    const goals = types.map(type => defaultGoal(profile,type));
    expect(goals[0]!.targetWeightKg).toBeLessThan(profile.weightKg);
    expect(goals[1]!.targetWeightKg).toBeGreaterThan(profile.weightKg);
    expect(goals[2]!.targetWeightKg).toBe(profile.weightKg);
    expect(goals[3]!.targetWeightKg).toBe(profile.weightKg);
    expect(computeTargets(profile,goals[0]!).calories).toBeLessThan(computeTargets(profile,goals[1]!).calories);
  });
  it('provides a distinct usable workout for every goal', () => {
    const plans = types.map(type => buildWorkoutPlan(profile,defaultGoal(profile,type),type));
    expect(new Set(plans.map(p=>p.name)).size).toBe(4);
    expect(plans.every(p=>p.exercises.length>=4 && p.exercises.every(e=>e.sets>0))).toBe(true);
  });
});
