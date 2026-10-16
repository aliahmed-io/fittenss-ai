import {
  calculateMetrics,
  generateSmartMeasurements,
  type BodyArchetype,
} from '@/lib/bodyModel/anthropometry';
import type { MuscleFatigueState, MuscleGroup } from '@/lib/bodyModel/muscleHeatmap';
import type {
  GoalSettings,
  GoalType,
  MacroTargets,
  Meal,
  NutritionTargets,
  PlannedMeal,
  Profile,
  ProgressEntry,
  ProgressInsight,
  WorkoutLog,
  WorkoutPlan,
} from '@/lib/fitness/types';

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'chest',
  'shoulders',
  'lats',
  'abs',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
];

export const GOAL_LABELS: Record<GoalType, string> = {
  'weight-loss': 'Lose Weight & Sculpt',
  'muscle-gain': 'Build Lean Muscle',
  recomp: 'Body Recomposition',
  strength: 'Increase Strength',
};

const ESSENTIAL_FAT_PCT = { female: 16, male: 8 } as const;
const KCAL_PER_KG_TISSUE = 7700;
const ACTIVITY_FACTOR = 1.55;

const PROTEIN_PER_LEAN_KG: Record<GoalType, number> = {
  'weight-loss': 2.6,
  'muscle-gain': 2.2,
  recomp: 2.4,
  strength: 2.0,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function leanMassKg(weightKg: number, bodyFatPct: number): number {
  return weightKg * (1 - clamp(bodyFatPct, 3, 60) / 100);
}

/** Local-time YYYY-MM-DD key. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toTimeKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Sensible default goal for a profile and goal type. */
export function defaultGoal(profile: Profile, type: GoalType): GoalSettings {
  const floor = ESSENTIAL_FAT_PCT[profile.gender];
  const w = profile.weightKg;
  const bf = profile.bodyFatPct;
  switch (type) {
    case 'weight-loss':
      return {
        type,
        targetWeightKg: round1(w * 0.93),
        targetBodyFatPct: round1(Math.max(floor, bf - 5)),
        timelineWeeks: 12,
      };
    case 'muscle-gain':
      return {
        type,
        targetWeightKg: round1(w * 1.04),
        targetBodyFatPct: round1(Math.max(floor, bf)),
        timelineWeeks: 16,
      };
    case 'recomp':
      return {
        type,
        targetWeightKg: round1(w),
        targetBodyFatPct: round1(Math.max(floor, bf - 4)),
        timelineWeeks: 16,
      };
    case 'strength':
      return {
        type,
        targetWeightKg: round1(w),
        targetBodyFatPct: round1(Math.max(floor, bf - 1)),
        timelineWeeks: 12,
      };
  }
}

/** Katch-McArdle BMR from lean body mass. */
export function computeBmr(weightKg: number, bodyFatPct: number): number {
  return 370 + 21.6 * leanMassKg(weightKg, bodyFatPct);
}

/** Dynamic daily targets derived from profile + goal. */
export function computeTargets(profile: Profile, goal: GoalSettings): NutritionTargets {
  const bmr = computeBmr(profile.weightKg, profile.bodyFatPct);
  const tdee = bmr * ACTIVITY_FACTOR;
  const weeks = Math.max(1, goal.timelineWeeks);
  const rawVelocity = (goal.targetWeightKg - profile.weightKg) / weeks;
  const velocity = clamp(rawVelocity, -0.01 * profile.weightKg, 0.0035 * profile.weightKg);

  const floor = Math.max(bmr, profile.gender === 'male' ? 1500 : 1200);
  const calories = Math.max(floor, tdee + (velocity * KCAL_PER_KG_TISSUE) / 7);

  const lean = leanMassKg(profile.weightKg, profile.bodyFatPct);
  const protein = Math.round(lean * PROTEIN_PER_LEAN_KG[goal.type]);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    weeklyVelocityKg: round1(velocity),
    calories: Math.round(calories),
    protein,
    carbs,
    fat,
  };
}

export interface GoalProjection {
  morphValues: Record<string, number>;
  bodyFatPct: number;
  weightKg: number;
  fatMassDeltaKg: number;
  leanMassDeltaKg: number;
  whrDelta: number;
  goalWhr: number;
  archetype: BodyArchetype;
}

/** Projects the goal physique as morph deltas applied on top of the current morphs. */
export function projectGoalPhysique(profile: Profile, goal: GoalSettings): GoalProjection {
  const nowSmart = generateSmartMeasurements(
    profile.gender,
    profile.heightCm,
    profile.weightKg,
    profile.bodyFatPct
  );
  const goalSmart = generateSmartMeasurements(
    profile.gender,
    profile.heightCm,
    goal.targetWeightKg,
    goal.targetBodyFatPct
  );

  const morphValues: Record<string, number> = { ...profile.morphValues };
  for (const key of Object.keys(goalSmart)) {
    if (key === 'Height') continue;
    const base = profile.morphValues[key];
    const from = nowSmart[key];
    const to = goalSmart[key];
    if (base === undefined || from === undefined || to === undefined) continue;
    morphValues[key] = round1(base + (to - from));
  }

  const leanNow = leanMassKg(profile.weightKg, profile.bodyFatPct);
  const leanGoal = leanMassKg(goal.targetWeightKg, goal.targetBodyFatPct);
  const leanDelta = leanGoal - leanNow;
  const baseMuscle = profile.morphValues['Muscle'] ?? 50;
  morphValues['Muscle'] = round1(clamp(baseMuscle + leanDelta * 5, 20, 90));

  const fatDelta =
    goal.targetWeightKg * (goal.targetBodyFatPct / 100) -
    profile.weightKg * (profile.bodyFatPct / 100);

  const metricsNow = calculateMetrics(
    profile.gender,
    profile.heightCm,
    profile.weightKg,
    profile.bodyFatPct,
    profile.morphValues
  );
  const metricsGoal = calculateMetrics(
    profile.gender,
    profile.heightCm,
    goal.targetWeightKg,
    goal.targetBodyFatPct,
    morphValues
  );

  return {
    morphValues,
    bodyFatPct: goal.targetBodyFatPct,
    weightKg: goal.targetWeightKg,
    fatMassDeltaKg: round1(fatDelta),
    leanMassDeltaKg: round1(leanDelta),
    whrDelta: +(metricsGoal.whr - metricsNow.whr).toFixed(2),
    goalWhr: metricsGoal.whr,
    archetype: metricsGoal.archetype,
  };
}

/** Fraction of goal completed from the latest progress entry (0..1). */
export function goalProgressFraction(
  goal: GoalSettings,
  entries: readonly ProgressEntry[]
): number {
  const first = entries[0];
  const latest = entries[entries.length - 1];
  if (!first || !latest) return 0;
  const span = goal.targetWeightKg - first.weightKg;
  if (Math.abs(span) < 0.1) {
    const fatSpan = goal.targetBodyFatPct - first.bodyFatPct;
    if (Math.abs(fatSpan) < 0.1) return 1;
    return clamp((latest.bodyFatPct - first.bodyFatPct) / fatSpan, 0, 1);
  }
  return clamp((latest.weightKg - first.weightKg) / span, 0, 1);
}

const ARCHETYPE_EMPHASIS: Record<BodyArchetype, { name: string; sets: number; reps: string; rest: number; muscles: MuscleGroup[] }> = {
  Pear: { name: 'Barbell Hip Thrust', sets: 4, reps: '8-10', rest: 90, muscles: ['glutes', 'hamstrings'] },
  Hourglass: { name: 'Romanian Deadlift', sets: 3, reps: '8-10', rest: 90, muscles: ['hamstrings', 'glutes'] },
  'Inverted Triangle': { name: 'Bulgarian Split Squat', sets: 3, reps: '10-12', rest: 75, muscles: ['quads', 'glutes'] },
  Athletic: { name: 'Weighted Pull-up', sets: 4, reps: '6-8', rest: 120, muscles: ['lats', 'biceps'] },
  Rectangle: { name: 'Lateral Raise', sets: 4, reps: '12-15', rest: 60, muscles: ['shoulders'] },
};

interface GoalTemplate {
  name: string;
  description: string;
  durationMin: number;
  difficulty: WorkoutPlan['difficulty'];
  calories: number;
  exercises: { name: string; sets: number; reps: string; restSec: number }[];
  muscles: MuscleGroup[];
}

const GOAL_TEMPLATES: Record<GoalType, GoalTemplate> = {
  'weight-loss': {
    name: 'Metabolic Sculpt Circuit',
    description: 'Full-body resistance circuit with short rests to maximise energy expenditure while preserving lean mass.',
    durationMin: 45,
    difficulty: 'Intermediate',
    calories: 420,
    muscles: ['quads', 'glutes', 'chest', 'lats', 'abs'],
    exercises: [
      { name: 'Goblet Squat', sets: 4, reps: '12-15', restSec: 45 },
      { name: 'Push-up', sets: 4, reps: '10-15', restSec: 45 },
      { name: 'Dumbbell Row', sets: 4, reps: '12', restSec: 45 },
      { name: 'Kettlebell Swing', sets: 4, reps: '15', restSec: 45 },
      { name: 'Mountain Climber', sets: 3, reps: '40 sec', restSec: 30 },
    ],
  },
  'muscle-gain': {
    name: 'Hypertrophy Upper-Lower Block',
    description: 'Progressive overload in the 6-12 rep range with generous rest for maximal mechanical tension.',
    durationMin: 60,
    difficulty: 'Intermediate',
    calories: 360,
    muscles: ['chest', 'lats', 'shoulders', 'biceps', 'triceps'],
    exercises: [
      { name: 'Incline Dumbbell Press', sets: 4, reps: '8-10', restSec: 90 },
      { name: 'Lat Pulldown', sets: 4, reps: '8-12', restSec: 90 },
      { name: 'Overhead Press', sets: 3, reps: '8-10', restSec: 90 },
      { name: 'Barbell Curl', sets: 3, reps: '10-12', restSec: 60 },
      { name: 'Cable Triceps Pushdown', sets: 3, reps: '10-12', restSec: 60 },
    ],
  },
  recomp: {
    name: 'Recomp Strength Split',
    description: 'Heavy compound lifts followed by moderate-volume accessories to build muscle while leaning out.',
    durationMin: 55,
    difficulty: 'Intermediate',
    calories: 390,
    muscles: ['quads', 'hamstrings', 'chest', 'lats', 'abs'],
    exercises: [
      { name: 'Back Squat', sets: 4, reps: '6-8', restSec: 120 },
      { name: 'Bench Press', sets: 4, reps: '6-8', restSec: 120 },
      { name: 'Barbell Row', sets: 3, reps: '8-10', restSec: 90 },
      { name: 'Walking Lunge', sets: 3, reps: '12', restSec: 60 },
      { name: 'Hanging Knee Raise', sets: 3, reps: '12-15', restSec: 45 },
    ],
  },
  strength: {
    name: 'Max Strength Foundation',
    description: 'Low-rep heavy barbell work with long rests to drive neural adaptation and absolute strength.',
    durationMin: 65,
    difficulty: 'Advanced',
    calories: 330,
    muscles: ['quads', 'hamstrings', 'glutes', 'chest', 'lats'],
    exercises: [
      { name: 'Back Squat', sets: 5, reps: '3-5', restSec: 180 },
      { name: 'Conventional Deadlift', sets: 4, reps: '3-5', restSec: 180 },
      { name: 'Bench Press', sets: 5, reps: '3-5', restSec: 150 },
      { name: 'Weighted Pull-up', sets: 4, reps: '4-6', restSec: 120 },
    ],
  },
};

/** Deterministic, profile-aware workout plan (non-AI fallback and AI-failure path). */
export function buildWorkoutPlan(profile: Profile, goal: GoalSettings, id: string): WorkoutPlan {
  const tpl = GOAL_TEMPLATES[goal.type];
  const metrics = calculateMetrics(
    profile.gender,
    profile.heightCm,
    profile.weightKg,
    profile.bodyFatPct,
    profile.morphValues
  );
  const emphasis = ARCHETYPE_EMPHASIS[metrics.archetype];
  const exercises = [
    ...tpl.exercises,
    { name: emphasis.name, sets: emphasis.sets, reps: emphasis.reps, restSec: emphasis.rest },
  ];
  const muscles = Array.from(new Set<MuscleGroup>([...tpl.muscles, ...emphasis.muscles]));
  const scale = clamp(profile.weightKg / 75, 0.7, 1.4);
  return {
    id,
    name: `${tpl.name} - ${metrics.archetype}`,
    description: `${tpl.description} Emphasis added for a ${metrics.archetype.toLowerCase()} silhouette.`,
    durationMin: tpl.durationMin + 5,
    difficulty: tpl.difficulty,
    exercises,
    muscles,
    calories: Math.round(tpl.calories * scale),
    source: 'engine',
  };
}

/** Splits daily targets into four meal slots (25/30/15/30). */
export function buildMealPlan(targets: MacroTargets): PlannedMeal[] {
  const slots: { slot: string; share: number; name: string; description: string }[] = [
    { slot: 'Breakfast', share: 0.25, name: 'Protein Oats Bowl', description: 'Rolled oats, whey or Greek yogurt, berries and chia seeds.' },
    { slot: 'Lunch', share: 0.3, name: 'Chicken Rice Plate', description: 'Grilled chicken breast, basmati rice, mixed vegetables and olive oil.' },
    { slot: 'Snack', share: 0.15, name: 'Cottage Cheese and Fruit', description: 'Low-fat cottage cheese with apple slices and almonds.' },
    { slot: 'Dinner', share: 0.3, name: 'Salmon and Sweet Potato', description: 'Baked salmon, roasted sweet potato and steamed greens.' },
  ];
  return slots.map((s) => ({
    slot: s.slot,
    name: s.name,
    description: s.description,
    calories: Math.round(targets.calories * s.share),
    protein: Math.round(targets.protein * s.share),
    carbs: Math.round(targets.carbs * s.share),
    fat: Math.round(targets.fat * s.share),
  }));
}

export function sumMeals(meals: readonly Pick<Meal, 'calories' | 'protein' | 'carbs' | 'fat'>[]): MacroTargets {
  return meals.reduce<MacroTargets>(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

/** Daily hydration target in millilitres (35 ml per kg body weight, rounded to 50). */
export function hydrationTargetMl(weightKg: number): number {
  return Math.round((weightKg * 35) / 50) * 50;
}

function dayDiff(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T00:00:00`).getTime();
  const b = new Date(`${toKey}T00:00:00`).getTime();
  return (b - a) / 86_400_000;
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Linear regression slope (kg/day) of weight over time. */
function weightSlopePerDay(entries: readonly ProgressEntry[]): number | null {
  if (entries.length < 2) return null;
  const origin = entries[0]!.date;
  const xs = entries.map((e) => dayDiff(origin, e.date));
  const ys = entries.map((e) => e.weightKg);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

export function sortEntries(entries: readonly ProgressEntry[]): ProgressEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

/** Deterministic progress analysis with projected goal date. */
export function analyzeProgress(
  entriesInput: readonly ProgressEntry[],
  goal: GoalSettings,
  todayKey: string
): ProgressInsight {
  const entries = sortEntries(entriesInput);
  const latest = entries[entries.length - 1];
  if (!latest || entries.length < 2) {
    return {
      summary: 'Log at least two entries to unlock trend analysis and goal projections.',
      velocityKgPerWeek: 0,
      projectedGoalDate: null,
      recommendations: ['Record weight, body fat and waist weekly under consistent conditions.'],
    };
  }

  const slope = weightSlopePerDay(entries) ?? 0;
  const velocity = round1(slope * 7);
  const remaining = goal.targetWeightKg - latest.weightKg;
  const losing = goal.targetWeightKg < entries[0]!.weightKg;
  const movingToward = remaining !== 0 && Math.sign(slope) === Math.sign(remaining);
  let projected: string | null = null;
  if (Math.abs(remaining) < 0.2) {
    projected = todayKey;
  } else if (movingToward && Math.abs(slope) > 0.0005) {
    projected = addDays(latest.date, Math.ceil(remaining / slope));
  }

  const recommendations: string[] = [];
  const bodyWeight = latest.weightKg;
  if (losing && velocity < -0.01 * bodyWeight) {
    recommendations.push('Weekly loss exceeds 1% of body weight. Add 150-200 kcal per day to protect lean mass.');
  } else if (losing && velocity > -0.001 * bodyWeight) {
    recommendations.push('Weight is not trending down. Audit logged intake and add two low-intensity cardio sessions.');
  }
  if (!losing && goal.type === 'muscle-gain' && velocity < 0.001 * bodyWeight) {
    recommendations.push('Gain rate is flat. Raise calories by 200 kcal per day and keep progressive overload.');
  }
  const first = entries[0]!;
  if (latest.bodyFatPct > 0 && first.bodyFatPct > 0 && latest.bodyFatPct > first.bodyFatPct + 0.5) {
    recommendations.push('Body fat is rising. Prioritise protein at target and add a weekly step goal.');
  }
  if (latest.waistCm > 0 && first.waistCm > 0 && latest.waistCm < first.waistCm - 1) {
    recommendations.push('Waist is shrinking. Body composition is improving even if scale weight stalls.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Trend is on track. Hold current calories and training volume for the next two weeks.');
  }

  const direction = velocity < 0 ? 'down' : velocity > 0 ? 'up' : 'flat';
  return {
    summary: `Weight is trending ${direction} at ${Math.abs(velocity).toFixed(1)} kg per week across ${entries.length} entries.`,
    velocityKgPerWeek: velocity,
    projectedGoalDate: projected,
    recommendations,
  };
}

/** Consecutive-day training streak ending today (or yesterday, to avoid punishing mid-day). */
export function computeStreak(logs: readonly WorkoutLog[], todayKey: string): number {
  const days = new Set(logs.map((l) => toDateKey(new Date(l.completedAt))));
  let cursor = days.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface WeekDay {
  label: string;
  dateKey: string;
  done: boolean;
  isToday: boolean;
}

/** Monday-first week containing `today`, flagged by logged workouts. */
export function weeklyActivity(logs: readonly WorkoutLog[], today: Date): WeekDay[] {
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const dow = (today.getDay() + 6) % 7;
  const todayKey = toDateKey(today);
  const monday = addDays(todayKey, -dow);
  const doneDays = new Set(logs.map((l) => toDateKey(new Date(l.completedAt))));
  return labels.map((label, i) => {
    const dateKey = addDays(monday, i);
    return { label, dateKey, done: doneDays.has(dateKey), isToday: dateKey === todayKey };
  });
}

export function weeklyTotals(logs: readonly WorkoutLog[], today: Date): { calories: number; workouts: number } {
  const week = new Set(weeklyActivity(logs, today).map((d) => d.dateKey));
  return logs
    .filter((l) => week.has(toDateKey(new Date(l.completedAt))))
    .reduce((acc, l) => ({ calories: acc.calories + l.calories, workouts: acc.workouts + 1 }), {
      calories: 0,
      workouts: 0,
    });
}

/** Heatmap fatigue state from targeted muscles. */
export function fatigueFromMuscles(muscles: readonly MuscleGroup[]): MuscleFatigueState {
  const set = new Set(muscles);
  const state = {} as MuscleFatigueState;
  for (const group of MUSCLE_GROUPS) {
    state[group] = set.has(group) ? 0.92 : 0.06;
  }
  return state;
}

export interface CoachContext {
  profile: Profile;
  goal: GoalSettings;
  targets: NutritionTargets;
  archetype: BodyArchetype;
  whr: number;
  streak: number;
}

/** Keyword-driven coach reply used as the non-AI fallback. */
export function buildCoachReply(question: string, ctx: CoachContext): string {
  const q = question.toLowerCase();
  const { targets, goal, archetype, whr } = ctx;
  if (/protein|macro|carb|fat|calorie|eat|diet|nutrition/.test(q)) {
    return `For your ${GOAL_LABELS[goal.type].toLowerCase()} goal, aim for about ${targets.calories} kcal per day with ${targets.protein} g protein, ${targets.carbs} g carbs and ${targets.fat} g fat. Your estimated maintenance is ${targets.tdee} kcal.`;
  }
  if (/hip|glute|leg|squat|lower/.test(q)) {
    return `With a ${archetype.toLowerCase()} silhouette (WHR ${whr.toFixed(2)}), prioritise hip thrusts, Romanian deadlifts and split squats at 8-12 reps, two to three sessions per week.`;
  }
  if (/chest|arm|shoulder|upper|back|lat/.test(q)) {
    return `Build the upper body with incline pressing, rows and lateral raises. Train each muscle twice per week at 10-15 hard sets in total, keeping one to two reps in reserve.`;
  }
  if (/sleep|recover|rest|sore/.test(q)) {
    return 'Aim for 7-9 hours of sleep and at least 48 hours between sessions that train the same muscle. Use the strain heatmap to see which groups are fresh.';
  }
  if (/weight|lose|fat|cut|slim/.test(q)) {
    return `A sustainable pace for you is ${Math.abs(targets.weeklyVelocityKg).toFixed(1)} kg per week. Keep protein at ${targets.protein} g and lift three times per week to preserve muscle.`;
  }
  return `Your current silhouette is ${archetype} with a WHR of ${whr.toFixed(2)}. Your goal is ${GOAL_LABELS[goal.type].toLowerCase()} over ${goal.timelineWeeks} weeks and your training streak is ${ctx.streak} day${ctx.streak === 1 ? '' : 's'}. Ask about nutrition, legs, upper body or recovery for specific guidance.`;
}
