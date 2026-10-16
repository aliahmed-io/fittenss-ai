import { NextRequest, NextResponse } from 'next/server';
import { GEMINI_MODEL, generateJson } from '@/lib/ai/gemini';
import {
  normalizeAnalysis,
  normalizeChat,
  normalizeMealPlan,
  normalizeWorkout,
  parseCoachRequest,
  isRecord,
  type CoachRequest,
} from '@/lib/ai/coachSchemas';
import { checkRateLimit, clientKey, exceedsContentLength } from '@/lib/ai/rateLimiter';
import { calculateMetrics } from '@/lib/bodyModel/anthropometry';
import {
  analyzeProgress,
  buildCoachReply,
  buildMealPlan,
  buildWorkoutPlan,
  computeTargets,
  toDateKey,
} from '@/lib/fitness/engine';
import { newPlanId } from '@/lib/fitness/ids';
import type { CoachResponse, Provenance } from '@/lib/fitness/types';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 32 * 1024;
const RATE = { limit: 20, windowMs: 60_000 } as const;

const FALLBACK_PROVENANCE: Provenance = { source: 'engine-fallback', confidence: 'medium' };
const GEMINI_PROVENANCE: Provenance = { source: 'gemini', confidence: 'medium', model: GEMINI_MODEL };

/** Minimised, non-identifying context sent to the model. */
function contextBlock(req: CoachRequest): string {
  const { profile, goal, targets } = req;
  const metrics = calculateMetrics(
    profile.gender,
    profile.heightCm,
    profile.weightKg,
    profile.bodyFatPct,
    profile.morphValues
  );
  return [
    `Sex: ${profile.gender}; age ${profile.age}; height ${profile.heightCm} cm; weight ${profile.weightKg} kg; body fat ${profile.bodyFatPct}%.`,
    `Silhouette: ${metrics.archetype}; waist-to-hip ratio ${metrics.whr}.`,
    `Goal: ${goal.type}; target ${goal.targetWeightKg} kg at ${goal.targetBodyFatPct}% body fat in ${goal.timelineWeeks} weeks.`,
    `Daily targets: ${targets.calories} kcal, ${targets.protein} g protein, ${targets.carbs} g carbs, ${targets.fat} g fat.`,
  ].join('\n');
}

async function handleWorkout(req: CoachRequest): Promise<CoachResponse> {
  const prompt = `You are a certified strength and conditioning coach. Design ONE workout session for this person.
${contextBlock(req)}

Return ONLY JSON: {"name": string, "description": string (max 200 chars), "durationMin": number, "difficulty": "Beginner"|"Intermediate"|"Advanced", "calories": number, "muscles": array of any of ["chest","shoulders","lats","abs","biceps","triceps","quads","hamstrings","glutes","calves"], "exercises": array of 4-7 objects {"name": string, "sets": number, "reps": string, "restSec": number}}.`;
  const raw = await generateJson(parts(prompt), isRecord, 0.4);
  const ai = raw ? normalizeWorkout(raw) : null;
  if (ai) {
    return {
      provenance: GEMINI_PROVENANCE,
      plan: { id: newPlanId(), ...ai, source: 'ai' },
    };
  }
  return {
    provenance: FALLBACK_PROVENANCE,
    plan: buildWorkoutPlan(req.profile, req.goal, newPlanId()),
  };
}

async function handleMealPlan(req: CoachRequest): Promise<CoachResponse> {
  const prompt = `You are a registered dietitian. Create a one-day meal plan with 4 meals (Breakfast, Lunch, Snack, Dinner) that sums close to the targets.
${contextBlock(req)}

Return ONLY JSON: {"meals": array of 4 objects {"slot": string, "name": string, "description": string (max 160 chars), "calories": number, "protein": number, "carbs": number, "fat": number}}.`;
  const raw = await generateJson(parts(prompt), isRecord, 0.5);
  const meals = raw ? normalizeMealPlan(raw) : null;
  if (meals) return { provenance: GEMINI_PROVENANCE, meals };
  return { provenance: FALLBACK_PROVENANCE, meals: buildMealPlan(req.targets) };
}

async function handleAnalysis(req: CoachRequest): Promise<CoachResponse> {
  const base = analyzeProgress(req.entries, req.goal, toDateKey(new Date()));
  if (req.entries.length < 2) return { provenance: FALLBACK_PROVENANCE, insight: base };

  const series = req.entries
    .map((e) => `${e.date}: ${e.weightKg} kg, ${e.bodyFatPct || 'n/a'}% fat, waist ${e.waistCm || 'n/a'} cm`)
    .join('\n');
  const prompt = `You are a sports-science analyst. Interpret this progress history against the goal.
${contextBlock(req)}
Measured weekly weight velocity: ${base.velocityKgPerWeek} kg/week.
History:
${series}

Return ONLY JSON: {"summary": string (max 300 chars), "recommendations": array of 2-4 short actionable strings}.`;
  const raw = await generateJson(parts(prompt), isRecord, 0.3);
  const ai = raw ? normalizeAnalysis(raw) : null;
  if (ai) {
    return {
      provenance: GEMINI_PROVENANCE,
      insight: { ...base, summary: ai.summary, recommendations: ai.recommendations },
    };
  }
  return { provenance: FALLBACK_PROVENANCE, insight: base };
}

async function handleChat(req: CoachRequest): Promise<CoachResponse> {
  const prompt = `You are an evidence-based fitness coach. Answer in at most 3 sentences, practical and specific. Do not give medical diagnoses.
${contextBlock(req)}
Training streak: ${req.streak} days.
User question: ${JSON.stringify(req.message)}

Return ONLY JSON: {"reply": string}.`;
  const raw = await generateJson(parts(prompt), isRecord, 0.5);
  const reply = raw ? normalizeChat(raw) : null;
  if (reply) return { provenance: GEMINI_PROVENANCE, reply };

  const targets = computeTargets(req.profile, req.goal);
  const metrics = calculateMetrics(
    req.profile.gender,
    req.profile.heightCm,
    req.profile.weightKg,
    req.profile.bodyFatPct,
    req.profile.morphValues
  );
  return {
    provenance: { source: 'engine-fallback', confidence: 'low' },
    reply: buildCoachReply(req.message, {
      profile: req.profile,
      goal: req.goal,
      targets,
      archetype: metrics.archetype,
      whr: metrics.whr,
      streak: req.streak,
    }),
  };
}

function parts(prompt: string): string[] {
  return [prompt];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limit = checkRateLimit(clientKey(request.headers, 'ai-coach'), RATE);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    );
  }
  if (exceedsContentLength(request.headers, MAX_BODY_BYTES)) {
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = parseCoachRequest(body);
  if (typeof parsed === 'string') {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  switch (parsed.mode) {
    case 'workout-plan':
      return NextResponse.json(await handleWorkout(parsed));
    case 'meal-plan':
      return NextResponse.json(await handleMealPlan(parsed));
    case 'progress-analysis':
      return NextResponse.json(await handleAnalysis(parsed));
    case 'coach-chat':
      return NextResponse.json(await handleChat(parsed));
  }
}
