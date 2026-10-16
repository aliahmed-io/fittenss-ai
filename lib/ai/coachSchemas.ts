import type { Gender } from '@/lib/bodyModel/anthropometry';
import type { MuscleGroup } from '@/lib/bodyModel/muscleHeatmap';
import { MUSCLE_GROUPS, clamp } from '@/lib/fitness/engine';
import type {
  Difficulty,
  GoalSettings,
  GoalType,
  MacroTargets,
  PlannedMeal,
  Profile,
  ProgressEntry,
} from '@/lib/fitness/types';

export type CoachMode = 'workout-plan' | 'meal-plan' | 'progress-analysis' | 'coach-chat';

export interface CoachRequest {
  mode: CoachMode;
  profile: Profile;
  goal: GoalSettings;
  targets: MacroTargets;
  message: string;
  entries: ProgressEntry[];
  streak: number;
}

const MODES: readonly CoachMode[] = ['workout-plan', 'meal-plan', 'progress-analysis', 'coach-chat'];
const GOALS: readonly GoalType[] = ['weight-loss', 'muscle-gain', 'recomp', 'strength'];
const DIFFICULTIES: readonly Difficulty[] = ['Beginner', 'Intermediate', 'Advanced'];
const MAX_MESSAGE = 500;
const MAX_ENTRIES = 60;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/** Strict request validation. Returns an error string or the typed request. */
export function parseCoachRequest(body: unknown): CoachRequest | string {
  if (!isRecord(body)) return 'Request body must be a JSON object.';
  const mode = MODES.find((m) => m === body.mode);
  if (!mode) return 'Unknown mode.';

  const p = body.profile;
  const g = body.goal;
  const t = body.targets;
  if (!isRecord(p) || !isRecord(g) || !isRecord(t)) return 'profile, goal and targets are required.';

  const gender: Gender | null = p.gender === 'male' ? 'male' : p.gender === 'female' ? 'female' : null;
  const heightCm = finite(p.heightCm, 100, 250);
  const weightKg = finite(p.weightKg, 30, 250);
  const age = finite(p.age, 13, 100);
  const bodyFatPct = finite(p.bodyFatPct, 3, 60);
  if (!gender || heightCm === null || weightKg === null || age === null || bodyFatPct === null) {
    return 'profile contains invalid values.';
  }

  const morphValues: Record<string, number> = {};
  if (isRecord(p.morphValues)) {
    for (const [k, v] of Object.entries(p.morphValues).slice(0, 48)) {
      if (typeof v === 'number' && Number.isFinite(v) && k.length <= 40) morphValues[k] = v;
    }
  }

  const goalType = GOALS.find((x) => x === g.type);
  const targetWeightKg = finite(g.targetWeightKg, 30, 250);
  const targetBodyFatPct = finite(g.targetBodyFatPct, 3, 60);
  const timelineWeeks = finite(g.timelineWeeks, 1, 104);
  if (!goalType || targetWeightKg === null || targetBodyFatPct === null || timelineWeeks === null) {
    return 'goal contains invalid values.';
  }

  const calories = finite(t.calories, 500, 10000);
  const protein = finite(t.protein, 0, 600);
  const carbs = finite(t.carbs, 0, 1200);
  const fat = finite(t.fat, 0, 500);
  if (calories === null || protein === null || carbs === null || fat === null) {
    return 'targets contain invalid values.';
  }

  const entries: ProgressEntry[] = [];
  if (Array.isArray(body.entries)) {
    for (const e of body.entries.slice(-MAX_ENTRIES)) {
      if (!isRecord(e)) continue;
      const w = finite(e.weightKg, 30, 250);
      if (typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || w === null) continue;
      entries.push({
        id: typeof e.id === 'string' ? e.id.slice(0, 64) : e.date,
        date: e.date,
        weightKg: w,
        bodyFatPct: finite(e.bodyFatPct, 0, 60) ?? 0,
        muscleMassPct: finite(e.muscleMassPct, 0, 100) ?? 0,
        waistCm: finite(e.waistCm, 0, 250) ?? 0,
        notes: '',
      });
    }
  }

  const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) : '';
  if (mode === 'coach-chat' && message.length === 0) return 'message is required for coach-chat.';

  return {
    mode,
    profile: { gender, heightCm, weightKg, age, bodyFatPct, morphValues },
    goal: { type: goalType, targetWeightKg, targetBodyFatPct, timelineWeeks },
    targets: { calories, protein, carbs, fat },
    message,
    entries,
    streak: finite(body.streak, 0, 3650) ?? 0,
  };
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;
}

export interface AiWorkoutShape {
  name: string;
  description: string;
  durationMin: number;
  difficulty: Difficulty;
  calories: number;
  muscles: MuscleGroup[];
  exercises: { name: string; sets: number; reps: string; restSec: number }[];
}

/** Validates and normalises a Gemini workout payload; returns null if unusable. */
export function normalizeWorkout(value: unknown): AiWorkoutShape | null {
  if (!isRecord(value)) return null;
  const name = text(value.name, 80);
  const description = text(value.description, 240);
  const difficulty = DIFFICULTIES.find((d) => d === value.difficulty);
  if (!name || !description || !difficulty || !Array.isArray(value.exercises)) return null;

  const exercises: AiWorkoutShape['exercises'] = [];
  for (const raw of value.exercises.slice(0, 12)) {
    if (!isRecord(raw)) continue;
    const exName = text(raw.name, 60);
    const sets = finite(raw.sets, 1, 10);
    const reps = typeof raw.reps === 'string' ? text(raw.reps, 24) : typeof raw.reps === 'number' ? String(raw.reps) : null;
    const restSec = finite(raw.restSec, 0, 600);
    if (exName && sets !== null && reps && restSec !== null) {
      exercises.push({ name: exName, sets: Math.round(sets), reps, restSec: Math.round(restSec) });
    }
  }
  if (exercises.length < 3) return null;

  const muscles = Array.isArray(value.muscles)
    ? MUSCLE_GROUPS.filter((m) => (value.muscles as unknown[]).includes(m))
    : [];
  if (muscles.length === 0) return null;

  return {
    name,
    description,
    difficulty,
    durationMin: Math.round(clamp(finite(value.durationMin, 5, 180) ?? 45, 5, 180)),
    calories: Math.round(clamp(finite(value.calories, 20, 2000) ?? 300, 20, 2000)),
    muscles,
    exercises,
  };
}

export function normalizeMealPlan(value: unknown): PlannedMeal[] | null {
  if (!isRecord(value) || !Array.isArray(value.meals)) return null;
  const meals: PlannedMeal[] = [];
  for (const raw of value.meals.slice(0, 6)) {
    if (!isRecord(raw)) continue;
    const slot = text(raw.slot, 24);
    const name = text(raw.name, 80);
    const description = text(raw.description, 200);
    const calories = finite(raw.calories, 0, 3000);
    const protein = finite(raw.protein, 0, 300);
    const carbs = finite(raw.carbs, 0, 500);
    const fat = finite(raw.fat, 0, 200);
    if (slot && name && description && calories !== null && protein !== null && carbs !== null && fat !== null) {
      meals.push({
        slot,
        name,
        description,
        calories: Math.round(calories),
        protein: Math.round(protein),
        carbs: Math.round(carbs),
        fat: Math.round(fat),
      });
    }
  }
  return meals.length >= 3 ? meals : null;
}

export interface AiAnalysisShape {
  summary: string;
  recommendations: string[];
}

export function normalizeAnalysis(value: unknown): AiAnalysisShape | null {
  if (!isRecord(value)) return null;
  const summary = text(value.summary, 400);
  if (!summary || !Array.isArray(value.recommendations)) return null;
  const recommendations = value.recommendations
    .map((r) => text(r, 220))
    .filter((r): r is string => r !== null)
    .slice(0, 5);
  return recommendations.length > 0 ? { summary, recommendations } : null;
}

export function normalizeChat(value: unknown): string | null {
  return isRecord(value) ? text(value.reply, 800) : null;
}
