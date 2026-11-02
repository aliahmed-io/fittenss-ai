import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as coach } from '@/app/api/ai-coach/route';
import { POST as bodyScan } from '@/app/api/analyze-body-scan/route';
import { POST as scan } from '@/app/api/analyze-meal/route';
import { generateJson } from '@/lib/ai/gemini';
import { createDefaultProfile } from '@/lib/store/fitnessStore';
import { buildMealPlan, computeTargets, defaultGoal } from '@/lib/fitness/engine';
vi.mock('@/lib/ai/gemini', () => ({ GEMINI_MODEL: 'test-model', generateJson: vi.fn() }));
const profile = createDefaultProfile('female');
const goal = defaultGoal(profile, 'weight-loss');
const targets = computeTargets(profile, goal);
function request(path: string, body: unknown) { return new NextRequest(`http://localhost/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
function payload(mode: string) { return { mode, profile, goal, targets, message: 'How can I recover?', entries: [], streak: 0 }; }
beforeEach(() => vi.mocked(generateJson).mockReset().mockResolvedValue(null));
describe('fitness feature routes', () => {
  for (const [mode, field] of [['workout-plan','plan'],['meal-plan','meals'],['progress-analysis','insight'],['coach-chat','reply']]) {
    it(`provides a usable and labelled fallback for ${mode}`, async () => {
      const response = await coach(request('ai-coach', payload(mode!)));
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.provenance.source).toBe('engine-fallback');
      expect(result[field!]).toBeTruthy();
    });
  }
  it('uses valid AI meals and rejects plans with wildly incorrect totals', async () => {
    vi.mocked(generateJson).mockResolvedValue({ meals: buildMealPlan(targets) });
    const good = await (await coach(request('ai-coach', payload('meal-plan')))).json();
    expect(good.provenance.source).toBe('gemini');
    vi.mocked(generateJson).mockResolvedValue({ meals: buildMealPlan(targets).map(m => ({ ...m, calories: 5 })) });
    const invalid = await (await coach(request('ai-coach', payload('meal-plan')))).json();
    expect(invalid.provenance.source).toBe('engine-fallback');
  });
  it('normalizes scan estimates and never invents food when recognition is unavailable', async () => {
    const photo = { image: 'dGVzdA==', mimeType: 'image/jpeg' };
    const unavailable = await (await scan(request('analyze-meal', photo))).json();
    expect(unavailable.foods).toEqual([]);
    expect(unavailable.note).toContain('unavailable');
    vi.mocked(generateJson).mockResolvedValue({ foods: [{ name: 'Rice', amount: 100, unit: 'g', calories: 130, protein: 3, carbs: 28, fat: 1 }], confidence: 'medium' });
    const recognized = await (await scan(request('analyze-meal', photo))).json();
    expect(recognized.foods[0].name).toBe('Rice');
    expect(recognized.provenance.source).toBe('gemini');
  });
  it('labels body-photo fallbacks and accepts valid vision estimates', async () => {
    const photo = { image: 'dGVzdA==', mimeType: 'image/jpeg', gender: 'male', heightCm: 178 };
    const unavailable = await (await bodyScan(request('analyze-body-scan', photo))).json();
    expect(unavailable.provenance.source).toBe('engine-fallback');
    expect(unavailable.feedback).toContain('AI vision is unavailable');
    vi.mocked(generateJson).mockResolvedValue({ shoulderWidthCm: 45, chestCircumferenceCm: 100, waistCircumferenceCm: 85, hipCircumferenceCm: 100, thighCircumferenceCm: 58, estimatedBodyFatPct: 24, somatotype: 'Mesomorph', confidence: 'low', morphOverrides: { Waist: 85 }, feedback: 'Illustrative estimate; review measurements.' });
    const result = await (await bodyScan(request('analyze-body-scan', photo))).json();
    expect(result.provenance.source).toBe('gemini');
    expect(result.morphOverrides.Waist).toBe(85);
  });
  it('rejects malformed uploads and requests', async () => {
    expect((await scan(request('analyze-meal', { image: 'x', mimeType: 'text/plain' }))).status).toBe(400);
    expect((await coach(request('ai-coach', { mode: 'invalid' }))).status).toBe(400);
  });
});
