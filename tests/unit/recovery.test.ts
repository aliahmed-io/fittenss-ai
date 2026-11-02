import { describe, expect, it } from 'vitest';
import { sanitizeState } from '@/lib/store/fitnessStore';

describe('recovery persistence', () => {
  it('keeps existing fitness data and restores valid recovery values', () => {
    const state = sanitizeState({ dailyCheckins: { '2026-11-01': { sleepHours: 7.5, energy: 4, soreness: 2, steps: 8200, notes: 'Easy run' } } });
    expect(state.dailyCheckins?.['2026-11-01']).toEqual({ sleepHours: 7.5, energy: 4, soreness: 2, steps: 8200, notes: 'Easy run' });
    expect(state.profile.weightKg).toBeGreaterThan(0);
  });
  it('discards malformed entries and bounds recovery fields', () => {
    const state = sanitizeState({ dailyCheckins: { bad: null, day: { sleepHours: 99, steps: -100, energy: 'bad', soreness: 99, notes: 123 } } });
    expect(state.dailyCheckins?.bad).toBeUndefined();
    expect(state.dailyCheckins?.day).toEqual({ sleepHours: 24, steps: 0, energy: 3, soreness: 5, notes: '' });
  });
});
