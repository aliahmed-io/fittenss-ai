import type { Gender } from '@/lib/bodyModel/anthropometry';
import type { MuscleGroup } from '@/lib/bodyModel/muscleHeatmap';

export type GoalType = 'weight-loss' | 'muscle-gain' | 'recomp' | 'strength';

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export interface Profile {
  gender: Gender;
  heightCm: number;
  weightKg: number;
  age: number;
  bodyFatPct: number;
  morphValues: Record<string, number>;
}

export interface GoalSettings {
  type: GoalType;
  targetWeightKg: number;
  targetBodyFatPct: number;
  timelineWeeks: number;
}

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionTargets extends MacroTargets {
  bmr: number;
  tdee: number;
  weeklyVelocityKg: number;
}

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  restSec: number;
}

export type PlanSource = 'library' | 'ai' | 'engine';

export interface WorkoutPlan {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  difficulty: Difficulty;
  exercises: Exercise[];
  muscles: MuscleGroup[];
  calories: number;
  source: PlanSource;
}

export interface WorkoutLog {
  id: string;
  planId: string;
  planName: string;
  /** ISO timestamp. */
  completedAt: string;
  durationSec: number;
  calories: number;
  muscles: MuscleGroup[];
  setsCompleted: number;
  setsTotal: number;
}

export interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** HH:MM */
  time: string;
  /** YYYY-MM-DD in local time. */
  date: string;
}

export interface PlannedMeal {
  slot: string;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ProgressEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  weightKg: number;
  bodyFatPct: number;
  muscleMassPct: number;
  waistCm: number;
  notes: string;
}

export interface ProgressInsight {
  summary: string;
  velocityKgPerWeek: number;
  projectedGoalDate: string | null;
  recommendations: string[];
}

export type Confidence = 'high' | 'medium' | 'low';

/** Provenance attached to every AI-driven result (Rule 29). */
export interface Provenance {
  source: 'gemini' | 'engine-fallback';
  confidence: Confidence;
  model?: string;
}

/** Response envelope of /api/ai-coach. Exactly one payload field is set per mode. */
export interface CoachResponse {
  provenance: Provenance;
  plan?: WorkoutPlan;
  meals?: PlannedMeal[];
  insight?: ProgressInsight;
  reply?: string;
}
