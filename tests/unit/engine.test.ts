import { describe, it, expect } from 'vitest';
import {
  computeBmr,
  computeTargets,
  defaultGoal,
  projectGoalPhysique,
  goalProgressFraction,
  computeStreak,
  analyzeProgress,
  fatigueFromMuscles,
  hydrationTargetMl,
  weeklyActivity,
} from '@/lib/fitness/engine';
import type { Profile, GoalSettings, ProgressEntry, WorkoutLog } from '@/lib/fitness/types';

describe('Fitness Engine Module', () => {
  const profile: Profile = {
    gender: 'female',
    heightCm: 165,
    weightKg: 62,
    age: 28,
    bodyFatPct: 22,
    morphValues: {
      Height: 165,
      Waist: 70,
      'Hip Girth': 96,
      'Bust Girth': 66,
      Muscle: 50,
    },
  };

  it('accurately computes Katch-McArdle BMR from lean body mass', () => {
    // Lean mass = 62 * (1 - 0.22) = 48.36 kg
    // BMR = 370 + 21.6 * 48.36 = 1414.576
    const bmr = computeBmr(profile.weightKg, profile.bodyFatPct);
    expect(bmr).toBeCloseTo(1414.6, 1);
  });

  it('derives balanced macronutrient distribution from goal and TDEE', () => {
    const goal: GoalSettings = {
      type: 'weight-loss',
      targetWeightKg: 58,
      targetBodyFatPct: 18,
      timelineWeeks: 12,
    };
    const targets = computeTargets(profile, goal);
    expect(targets.calories).toBeGreaterThan(1300);
    expect(targets.protein).toBeGreaterThan(100);
    expect(targets.fat).toBeGreaterThan(30);
    expect(targets.carbs).toBeGreaterThan(50);
    expect(targets.weeklyVelocityKg).toBeLessThan(0);
  });

  it('projects goal physique morphs without mutating original profile', () => {
    const goal: GoalSettings = {
      type: 'weight-loss',
      targetWeightKg: 58,
      targetBodyFatPct: 18,
      timelineWeeks: 12,
    };
    const projection = projectGoalPhysique(profile, goal);

    expect(projection.weightKg).toBe(58);
    expect(projection.bodyFatPct).toBe(18);
    expect(projection.fatMassDeltaKg).toBeLessThan(0);
    expect(projection.morphValues['Height']).toBe(profile.morphValues['Height']);
    expect(profile.weightKg).toBe(62); // Unmutated
  });

  it('computes goal completion fraction properly', () => {
    const goal: GoalSettings = {
      type: 'weight-loss',
      targetWeightKg: 60,
      targetBodyFatPct: 18,
      timelineWeeks: 8,
    };
    const entries: ProgressEntry[] = [
      { id: '1', date: '2026-07-01', weightKg: 64, bodyFatPct: 24, muscleMassPct: 50, waistCm: 72, notes: '' },
      { id: '2', date: '2026-07-15', weightKg: 62, bodyFatPct: 22, muscleMassPct: 50, waistCm: 70, notes: '' },
    ];
    // Start 64, Target 60 (span -4), Current 62 (delta -2) -> 50%
    const frac = goalProgressFraction(goal, entries);
    expect(frac).toBe(0.5);
  });

  it('calculates active training streak across calendar days', () => {
    const today = '2026-10-16';
    const logs: WorkoutLog[] = [
      { id: '1', planId: 'p1', planName: 'Push', completedAt: '2026-10-16T10:00:00Z', durationSec: 2400, calories: 350, muscles: ['chest'], setsCompleted: 15, setsTotal: 15 },
      { id: '2', planId: 'p2', planName: 'Pull', completedAt: '2026-10-15T10:00:00Z', durationSec: 2400, calories: 350, muscles: ['lats'], setsCompleted: 15, setsTotal: 15 },
      { id: '3', planId: 'p3', planName: 'Legs', completedAt: '2026-10-14T10:00:00Z', durationSec: 2400, calories: 350, muscles: ['quads'], setsCompleted: 15, setsTotal: 15 },
    ];
    const streak = computeStreak(logs, today);
    expect(streak).toBe(3);
  });

  it('calculates 3D heatmap fatigue state targeting specific muscles', () => {
    const fatigue = fatigueFromMuscles(['chest', 'triceps']);
    expect(fatigue.chest).toBe(0.92);
    expect(fatigue.triceps).toBe(0.92);
    expect(fatigue.quads).toBe(0.06);
    expect(fatigue.glutes).toBe(0.06);
  });

  it('calculates hydration target at 35ml per kg bodyweight', () => {
    // 60kg * 35 = 2100 ml
    expect(hydrationTargetMl(60)).toBe(2100);
    // 80kg * 35 = 2800 ml
    expect(hydrationTargetMl(80)).toBe(2800);
  });

  it('generates deterministic progress analysis recommendations', () => {
    const goal: GoalSettings = {
      type: 'weight-loss',
      targetWeightKg: 58,
      targetBodyFatPct: 18,
      timelineWeeks: 12,
    };
    const entries: ProgressEntry[] = [
      { id: '1', date: '2026-07-01', weightKg: 64, bodyFatPct: 24, muscleMassPct: 50, waistCm: 72, notes: '' },
      { id: '2', date: '2026-07-15', weightKg: 62.5, bodyFatPct: 22, muscleMassPct: 50, waistCm: 70, notes: '' },
    ];
    const insight = analyzeProgress(entries, goal, '2026-07-15');
    expect(insight.velocityKgPerWeek).toBeLessThan(0);
    expect(insight.recommendations.length).toBeGreaterThan(0);
  });

  it('generates appropriate default goals per goal type', () => {
    const loss = defaultGoal(profile, 'weight-loss');
    expect(loss.targetWeightKg).toBeLessThan(profile.weightKg);
    expect(loss.targetBodyFatPct).toBeLessThan(profile.bodyFatPct);

    const gain = defaultGoal(profile, 'muscle-gain');
    expect(gain.targetWeightKg).toBeGreaterThan(profile.weightKg);

    const recomp = defaultGoal(profile, 'recomp');
    expect(recomp.targetWeightKg).toBe(profile.weightKg);
  });

  it('builds monday-first weekly activity strip with correct completion flags', () => {
    const today = new Date('2026-10-16T12:00:00Z');
    const logs: WorkoutLog[] = [
      { id: '1', planId: 'p1', planName: 'Push', completedAt: '2026-10-16T10:00:00Z', durationSec: 2400, calories: 350, muscles: ['chest'], setsCompleted: 15, setsTotal: 15 },
    ];
    const activity = weeklyActivity(logs, today);
    expect(activity.length).toBe(7);
    expect(activity[0]?.label).toBe('M');
    expect(activity[6]?.label).toBe('S');
    const todaySlot = activity.find((d) => d.isToday);
    expect(todaySlot?.done).toBe(true);
  });
});
