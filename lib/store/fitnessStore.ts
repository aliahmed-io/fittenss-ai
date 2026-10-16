'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_HEIGHT_CM, generateSmartMeasurements, type Gender } from '@/lib/bodyModel/anthropometry';
import { defaultGoal, round1, toDateKey, toTimeKey } from '@/lib/fitness/engine';
import type {
  GoalSettings,
  GoalType,
  MacroTargets,
  Meal,
  Profile,
  ProgressEntry,
  WorkoutLog,
  WorkoutPlan,
} from '@/lib/fitness/types';

export const STORAGE_KEY = 'fittransform_state_v2';

export interface FitnessState {
  profile: Profile;
  goal: GoalSettings;
  customPlans: WorkoutPlan[];
  workoutLogs: WorkoutLog[];
  meals: Meal[];
  waterMlByDate: Record<string, number>;
  progressEntries: ProgressEntry[];
  macroOverride: MacroTargets | null;
}

const DEFAULT_BODY: Record<Gender, { weightKg: number; bodyFatPct: number; age: number }> = {
  female: { weightKg: 62, bodyFatPct: 22, age: 28 },
  male: { weightKg: 78, bodyFatPct: 15, age: 28 },
};

export function createDefaultProfile(gender: Gender): Profile {
  const base = DEFAULT_BODY[gender];
  const heightCm = DEFAULT_HEIGHT_CM[gender];
  return {
    gender,
    heightCm,
    weightKg: base.weightKg,
    bodyFatPct: base.bodyFatPct,
    age: base.age,
    morphValues: generateSmartMeasurements(gender, heightCm, base.weightKg, base.bodyFatPct),
  };
}

function createDefaultState(): FitnessState {
  const profile = createDefaultProfile('female');
  return {
    profile,
    goal: defaultGoal(profile, 'weight-loss'),
    customPlans: [],
    workoutLogs: [],
    meals: [],
    waterMlByDate: {},
    progressEntries: [],
    macroOverride: null,
  };
}

/** Immutable server snapshot: identical on every render so hydration is stable. */
const DEFAULT_STATE: FitnessState = createDefaultState();

const GOAL_TYPES: readonly GoalType[] = ['weight-loss', 'muscle-gain', 'recomp', 'strength'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function morphRecord(value: unknown, fallback: Record<string, number>): Record<string, number> {
  if (!isRecord(value)) return fallback;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : fallback;
}

function arrayOf<T>(value: unknown, guard: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(guard) : [];
}

function isMeal(v: unknown): v is Meal {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.calories === 'number' &&
    typeof v.protein === 'number' &&
    typeof v.carbs === 'number' &&
    typeof v.fat === 'number' &&
    typeof v.date === 'string' &&
    typeof v.time === 'string'
  );
}

function isLog(v: unknown): v is WorkoutLog {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.planName === 'string' &&
    typeof v.completedAt === 'string' &&
    typeof v.durationSec === 'number' &&
    typeof v.calories === 'number' &&
    Array.isArray(v.muscles)
  );
}

function isEntry(v: unknown): v is ProgressEntry {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.date === 'string' &&
    typeof v.weightKg === 'number' &&
    typeof v.bodyFatPct === 'number' &&
    typeof v.muscleMassPct === 'number' &&
    typeof v.waistCm === 'number' &&
    typeof v.notes === 'string'
  );
}

function isPlan(v: unknown): v is WorkoutPlan {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.exercises) &&
    Array.isArray(v.muscles)
  );
}

/** Merges untrusted persisted data over defaults, discarding anything malformed. */
export function sanitizeState(raw: unknown): FitnessState {
  const base = createDefaultState();
  if (!isRecord(raw)) return base;

  const rawProfile = isRecord(raw.profile) ? raw.profile : {};
  const gender: Gender = rawProfile.gender === 'male' ? 'male' : 'female';
  const defaults = createDefaultProfile(gender);
  const profile: Profile = {
    gender,
    heightCm: num(rawProfile.heightCm, defaults.heightCm, 100, 250),
    weightKg: num(rawProfile.weightKg, defaults.weightKg, 30, 250),
    age: num(rawProfile.age, defaults.age, 13, 100),
    bodyFatPct: num(rawProfile.bodyFatPct, defaults.bodyFatPct, 3, 60),
    morphValues: morphRecord(rawProfile.morphValues, defaults.morphValues),
  };

  const rawGoal = isRecord(raw.goal) ? raw.goal : {};
  const fallbackGoal = defaultGoal(profile, 'weight-loss');
  const goalType = GOAL_TYPES.find((t) => t === rawGoal.type) ?? fallbackGoal.type;
  const goal: GoalSettings = {
    type: goalType,
    targetWeightKg: num(rawGoal.targetWeightKg, fallbackGoal.targetWeightKg, 30, 250),
    targetBodyFatPct: num(rawGoal.targetBodyFatPct, fallbackGoal.targetBodyFatPct, 3, 60),
    timelineWeeks: Math.round(num(rawGoal.timelineWeeks, fallbackGoal.timelineWeeks, 1, 104)),
  };

  const override = isRecord(raw.macroOverride) ? raw.macroOverride : null;
  const macroOverride: MacroTargets | null = override
    ? {
        calories: num(override.calories, 2000, 800, 8000),
        protein: num(override.protein, 120, 20, 500),
        carbs: num(override.carbs, 200, 0, 1000),
        fat: num(override.fat, 60, 10, 400),
      }
    : null;

  const water: Record<string, number> = {};
  if (isRecord(raw.waterMlByDate)) {
    for (const [k, v] of Object.entries(raw.waterMlByDate)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) water[k] = v;
    }
  }

  return {
    profile,
    goal,
    customPlans: arrayOf(raw.customPlans, isPlan),
    workoutLogs: arrayOf(raw.workoutLogs, isLog),
    meals: arrayOf(raw.meals, isMeal),
    waterMlByDate: water,
    progressEntries: arrayOf(raw.progressEntries, isEntry),
    macroOverride,
  };
}

let state: FitnessState = DEFAULT_STATE;
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be full or unavailable (private mode); the in-memory state still works.
  }
}

function loadOnce(): void {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (text) state = sanitizeState(JSON.parse(text) as unknown);
  } catch {
    state = createDefaultState();
  }
}

function update(next: FitnessState): void {
  state = next;
  persist();
  emit();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY) return;
  try {
    state = event.newValue ? sanitizeState(JSON.parse(event.newValue) as unknown) : createDefaultState();
  } catch {
    state = createDefaultState();
  }
  emit();
}

function subscribe(listener: () => void): () => void {
  loadOnce();
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): FitnessState {
  loadOnce();
  return state;
}

function getServerSnapshot(): FitnessState {
  return DEFAULT_STATE;
}

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${rand}`;
}

/** Reactive access to the persisted global fitness state. */
export function useFitnessStore(): FitnessState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const fitnessActions = {
  setProfile(patch: Partial<Omit<Profile, 'gender'>>): void {
    update({ ...state, profile: { ...state.profile, ...patch } });
  },

  setMorphValues(patch: Record<string, number>): void {
    update({
      ...state,
      profile: { ...state.profile, morphValues: { ...state.profile.morphValues, ...patch } },
    });
  },

  replaceMorphValues(values: Record<string, number>): void {
    update({ ...state, profile: { ...state.profile, morphValues: { ...values } } });
  },

  /** Switches body model: resets biometrics and goal to the defaults of that gender. */
  setGender(gender: Gender): void {
    if (state.profile.gender === gender) return;
    const profile = createDefaultProfile(gender);
    update({ ...state, profile, goal: defaultGoal(profile, state.goal.type), macroOverride: null });
  },

  setGoal(patch: Partial<GoalSettings>): void {
    update({ ...state, goal: { ...state.goal, ...patch } });
  },

  /** Changing goal type recomputes targets from the current profile. */
  setGoalType(type: GoalType): void {
    update({ ...state, goal: defaultGoal(state.profile, type), macroOverride: null });
  },

  addMeals(items: Omit<Meal, 'id' | 'date' | 'time'>[]): void {
    const now = new Date();
    const date = toDateKey(now);
    const time = toTimeKey(now);
    const added: Meal[] = items.map((m) => ({ ...m, id: newId('meal'), date, time }));
    update({ ...state, meals: [...state.meals, ...added] });
  },

  removeMeal(id: string): void {
    update({ ...state, meals: state.meals.filter((m) => m.id !== id) });
  },

  addWater(ml: number): void {
    const key = toDateKey(new Date());
    const current = state.waterMlByDate[key] ?? 0;
    update({
      ...state,
      waterMlByDate: { ...state.waterMlByDate, [key]: Math.max(0, current + ml) },
    });
  },

  completeWorkout(log: Omit<WorkoutLog, 'id' | 'completedAt'>): WorkoutLog {
    const entry: WorkoutLog = { ...log, id: newId('log'), completedAt: new Date().toISOString() };
    update({ ...state, workoutLogs: [...state.workoutLogs, entry] });
    return entry;
  },

  addCustomPlan(plan: WorkoutPlan): void {
    update({ ...state, customPlans: [plan, ...state.customPlans.filter((p) => p.id !== plan.id)] });
  },

  removeCustomPlan(id: string): void {
    update({ ...state, customPlans: state.customPlans.filter((p) => p.id !== id) });
  },

  addProgressEntry(entry: Omit<ProgressEntry, 'id'>): void {
    update({ ...state, progressEntries: [...state.progressEntries, { ...entry, id: newId('entry') }] });
  },

  removeProgressEntry(id: string): void {
    update({ ...state, progressEntries: state.progressEntries.filter((e) => e.id !== id) });
  },

  /** Pushes a progress entry onto the biometric profile and regenerates the 3D measurements. */
  syncProfileFromEntry(entry: ProgressEntry): void {
    const { gender, heightCm } = state.profile;
    const weightKg = round1(entry.weightKg);
    const bodyFatPct = entry.bodyFatPct > 0 ? entry.bodyFatPct : state.profile.bodyFatPct;
    const smart = generateSmartMeasurements(gender, heightCm, weightKg, bodyFatPct);
    const morphValues = { ...state.profile.morphValues, ...smart };
    if (entry.waistCm > 0) morphValues['Waist'] = entry.waistCm;
    update({
      ...state,
      profile: { ...state.profile, weightKg, bodyFatPct, morphValues },
    });
  },

  setMacroOverride(value: MacroTargets | null): void {
    update({ ...state, macroOverride: value });
  },

  resetAll(): void {
    update(createDefaultState());
  },
};
