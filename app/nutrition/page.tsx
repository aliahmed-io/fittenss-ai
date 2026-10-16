'use client';

import React, { useCallback, useRef, useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import {
  Camera,
  Upload,
  X,
  Loader2,
  Plus,
  Minus,
  CheckSquare,
  Square,
  ArrowUpRight,
  Sparkles,
  Droplets,
  ShieldCheck,
  Check,
} from 'lucide-react';
import type { MealScanResult } from '@/app/api/analyze-meal/route';
import { downscaleImage } from '@/lib/image/downscale';
import { useFitnessStore, fitnessActions } from '@/lib/store/fitnessStore';
import { computeTargets, hydrationTargetMl, toDateKey } from '@/lib/fitness/engine';
import type { CoachResponse, PlannedMeal } from '@/lib/fitness/types';

function NutritionRow({
  label,
  value,
  goal,
  unit,
  lime,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  lime: boolean;
}) {
  const pct = Math.min(value / Math.max(goal, 1), 1);
  return (
    <div style={{ padding: '28px 40px', borderRight: '1px solid var(--ft-rule)' }}>
      <p className="d-xl" style={{ color: lime ? 'var(--ft-lime)' : 'var(--ft-t1)' }}>
        {value}
        <span style={{ fontSize: '0.35em', color: 'var(--ft-t3)', marginLeft: '4px', fontWeight: 700 }}>{unit}</span>
      </p>
      <p className="eyebrow" style={{ marginTop: '8px', marginBottom: '10px' }}>
        {label} · Goal {goal}{unit.toLowerCase()}
      </p>
      <div style={{ height: '2px', background: 'var(--ft-rule-strong)' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: lime ? 'var(--ft-lime)' : 'rgba(255,255,255,0.4)', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

export default function NutritionPage() {
  const store = useFitnessStore();
  const { profile, goal, meals: allMeals, waterMlByDate, macroOverride } = store;

  const todayKey = toDateKey(new Date());
  const todayMeals = useMemo(() => allMeals.filter((m) => m.date === todayKey), [allMeals, todayKey]);

  // Derived nutrition targets
  const calculatedTargets = useMemo(() => computeTargets(profile, goal), [profile, goal]);
  const targets = macroOverride ?? calculatedTargets;

  // Hydration
  const waterTarget = useMemo(() => hydrationTargetMl(profile.weightKg), [profile.weightKg]);
  const currentWater = waterMlByDate[todayKey] ?? 0;
  const waterPct = Math.min(1, currentWater / Math.max(waterTarget, 1));

  const [showAddForm, setShowAddForm] = useState(false);
  const [newMeal, setNewMeal] = useState<{ name: string; calories: number; protein: number; carbs: number; fat: number }>({
    name: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

  // Scan panel state
  const [scanOpen, setScanOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string>('image/jpeg');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<MealScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  // AI Meal Plan generator state
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [plannedMeals, setPlannedMeals] = useState<PlannedMeal[] | null>(null);
  const [planLogged, setPlanLogged] = useState(false);

  const totals = todayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const remaining = {
    calories: Math.max(targets.calories - totals.calories, 0),
    protein: Math.max(targets.protein - totals.protein, 0),
    carbs: Math.max(targets.carbs - totals.carbs, 0),
    fat: Math.max(targets.fat - totals.fat, 0),
  };

  const addMeal = () => {
    if (newMeal.name && newMeal.calories) {
      fitnessActions.addMeals([newMeal]);
      setNewMeal({ name: '', calories: 0, protein: 0, carbs: 0, fat: 0 });
      setShowAddForm(false);
    }
  };

  const removeMeal = (id: string) => fitnessActions.removeMeal(id);

  // Scan handlers with downscaling
  const handleFileSelect = useCallback(async (file: File) => {
    setScanResult(null);
    setScanError(null);
    setSelected(new Set());
    const reader = new FileReader();
    reader.onload = async (e) => {
      const raw = e.target?.result;
      if (typeof raw === 'string') {
        try {
          const downscaled = await downscaleImage(raw, 1280, 0.85);
          setPreview(`data:image/jpeg;base64,${downscaled.base64}`);
          setPreviewMime('image/jpeg');
        } catch {
          setPreview(raw);
          setPreviewMime(file.type || 'image/jpeg');
        }
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const analyze = async () => {
    if (!preview) return;
    setScanning(true);
    setScanError(null);
    try {
      const base64 = preview.split(',')[1] ?? '';
      const res = await fetch('/api/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: previewMime }),
      });
      const data = (await res.json()) as MealScanResult & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Analysis failed');
      setScanResult(data);
      setSelected(new Set(data.foods.map((_, i) => i)));
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setScanning(false);
    }
  };

  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const addSelectedToLog = () => {
    if (!scanResult) return;
    const toAdd = scanResult.foods
      .filter((_, i) => selected.has(i))
      .map((food) => ({
        name: `${food.name} (${food.amount}${food.unit})`,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
      }));
    fitnessActions.addMeals(toAdd);
    closeScan();
  };

  const closeScan = () => {
    setScanOpen(false);
    setPreview(null);
    setScanResult(null);
    setScanError(null);
    setScanning(false);
    setSelected(new Set());
  };

  // AI Meal Plan Synthesis
  const handleGenerateMealPlan = async () => {
    setGeneratingPlan(true);
    setPlanLogged(false);
    try {
      const res = await fetch('/api/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'meal-plan',
          profile,
          goal,
          targets,
          message: '',
          entries: [],
          streak: 0,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as CoachResponse;
        if (data.meals) {
          setPlannedMeals(data.meals);
        }
      }
    } catch {
      // Fallback
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleLogEntirePlan = () => {
    if (!plannedMeals) return;
    const items = plannedMeals.map((m) => ({
      name: `${m.slot}: ${m.name}`,
      calories: m.calories,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
    }));
    fitnessActions.addMeals(items);
    setPlanLogged(true);
  };

  const scanTotals = scanResult
    ? scanResult.foods
        .filter((_, i) => selected.has(i))
        .reduce((acc, f) => ({ cal: acc.cal + f.calories, p: acc.p + f.protein, c: acc.c + f.carbs, f: acc.f + f.fat }), { cal: 0, p: 0, c: 0, f: 0 })
    : null;

  return (
    <div>
      {/* ── Header ── */}
      <section
        className="anim-up"
        style={{
          padding: '48px 40px 32px',
          borderBottom: '1px solid var(--ft-rule)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '32px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: '12px' }}>Daily Nutrition Tracking</p>
          <h1 className="d-lg" style={{ color: 'var(--ft-t1)' }}>Nutrition & Macros</h1>
          <p style={{ fontSize: '14px', color: 'var(--ft-t2)', marginTop: '8px' }}>
            {todayMeals.length} meals logged today · Targets calibrated to {profile.weightKg} kg {profile.gender}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={() => { setScanOpen(true); setShowAddForm(false); }}
            className="btn-lime"
            style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Camera style={{ width: '14px', height: '14px' }} />
            Scan Meal
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-ghost"
            style={{ padding: '12px 20px' }}
          >
            {showAddForm ? 'Cancel' : '+ Manual'}
          </button>
        </div>
      </section>

      {/* ── Macro Stats ── */}
      <section
        className="anim-up d-50"
        style={{ borderBottom: '1px solid var(--ft-rule)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}
        aria-label="Daily macro totals"
      >
        <NutritionRow label="Calories" value={totals.calories} goal={targets.calories} unit="KCAL" lime />
        <NutritionRow label="Protein" value={totals.protein} goal={targets.protein} unit="G" lime={false} />
        <NutritionRow label="Carbs" value={totals.carbs} goal={targets.carbs} unit="G" lime={false} />
        <div style={{ padding: '28px 40px' }}>
          <p className="d-xl" style={{ color: 'var(--ft-t1)' }}>
            {totals.fat}
            <span style={{ fontSize: '0.35em', color: 'var(--ft-t3)', marginLeft: '4px', fontWeight: 700 }}>G</span>
          </p>
          <p className="eyebrow" style={{ marginTop: '8px', marginBottom: '10px' }}>Fat · Goal {targets.fat}g</p>
          <div style={{ height: '2px', background: 'var(--ft-rule-strong)' }}>
            <div style={{ width: `${Math.min(totals.fat / Math.max(targets.fat, 1), 1) * 100}%`, height: '100%', background: 'rgba(255,255,255,0.4)', transition: 'width 0.4s ease' }} />
          </div>
        </div>
      </section>

      {/* ── Hydration Strip ── */}
      <section
        className="anim-up d-75"
        style={{
          padding: '16px 40px',
          borderBottom: '1px solid var(--ft-rule)',
          background: 'rgba(0, 240, 255, 0.02)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Droplets style={{ width: '18px', height: '18px', color: '#00F0FF' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="eyebrow" style={{ color: '#00F0FF' }}>Hydration Protocol</span>
              <span style={{ fontSize: '10px', color: 'var(--ft-t3)' }}>
                Target: {waterTarget} ml (35 ml / kg)
              </span>
            </div>
            <p className="data-val" style={{ fontSize: '15px', color: 'var(--ft-t1)', margin: '2px 0 0' }}>
              {currentWater} <span style={{ fontSize: '10px', color: 'var(--ft-t3)' }}>/ {waterTarget} ML</span>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, maxWidth: '340px' }}>
          <div style={{ flex: 1, height: '4px', background: 'var(--ft-rule-strong)' }}>
            <div style={{ width: `${waterPct * 100}%`, height: '100%', background: '#00F0FF', transition: 'width 0.3s ease' }} />
          </div>
          <span className="data-val" style={{ fontSize: '11px', color: '#00F0FF' }}>
            {Math.round(waterPct * 100)}%
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => fitnessActions.addWater(250)}
            className="btn-ghost"
            style={{ padding: '6px 12px', fontSize: '10px' }}
          >
            +250 ml
          </button>
          <button
            onClick={() => fitnessActions.addWater(500)}
            className="btn-lime"
            style={{ padding: '6px 14px', fontSize: '10px' }}
          >
            +500 ml
          </button>
          {currentWater > 0 && (
            <button
              onClick={() => fitnessActions.addWater(-250)}
              className="btn-ghost"
              style={{ padding: '6px 8px', fontSize: '10px' }}
              title="Undo 250ml"
            >
              <Minus style={{ width: '10px', height: '10px' }} />
            </button>
          )}
        </div>
      </section>

      {/* ── Main Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', borderBottom: '1px solid var(--ft-rule)' }}>
        {/* Meal Log */}
        <div style={{ borderRight: '1px solid var(--ft-rule)' }}>
          <div style={{ padding: '0 40px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ft-rule)' }}>
            <p className="eyebrow">Today&apos;s Meals</p>
            <p className="eyebrow">{todayMeals.length} entries</p>
          </div>

          {todayMeals.length === 0 && (
            <div style={{ padding: '48px 40px', textAlign: 'center' }}>
              <p style={{ color: 'var(--ft-t3)', fontSize: '13px' }}>No meals logged today yet. Use Scan Meal or + Manual.</p>
            </div>
          )}

          {todayMeals.map((meal) => (
            <div
              key={meal.id}
              className="anim-up"
              style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '0 40px', height: '72px', borderBottom: '1px solid var(--ft-rule)', transition: 'background 0.12s ease' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
            >
              {meal.time && (
                <span className="data-val" style={{ fontSize: '11px', color: 'var(--ft-t3)', width: '40px', flexShrink: 0 }}>{meal.time}</span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '14px', color: 'var(--ft-t1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meal.name}</p>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexShrink: 0 }}>
                {[{ l: 'kcal', v: meal.calories, lime: true }, { l: 'P', v: `${meal.protein}g`, lime: false }, { l: 'C', v: `${meal.carbs}g`, lime: false }, { l: 'F', v: `${meal.fat}g`, lime: false }].map((item) => (
                  <span key={item.l} className="data-val" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--ft-t3)', fontSize: '10px' }}>{item.l}</span>
                    <span style={{ color: item.lime ? 'var(--ft-lime)' : 'var(--ft-t2)' }}>{item.v}</span>
                  </span>
                ))}
              </div>
              <button
                onClick={() => removeMeal(meal.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ft-t3)', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.12s ease' }}
                aria-label={`Remove ${meal.name}`}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#FF4444')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--ft-t3)')}
              >
                <X style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
          ))}

          {/* Total row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '16px 40px', background: 'var(--ft-surface)' }}>
            <span className="eyebrow" style={{ flex: 1 }}>Total</span>
            {[{ l: 'kcal', v: totals.calories, lime: true }, { l: 'P', v: `${totals.protein}g`, lime: false }, { l: 'C', v: `${totals.carbs}g`, lime: false }, { l: 'F', v: `${totals.fat}g`, lime: false }].map((item) => (
              <span key={item.l} className="data-val" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '12px' }}>
                <span style={{ color: 'var(--ft-t3)', fontSize: '10px' }}>{item.l}</span>
                <span style={{ color: item.lime ? 'var(--ft-lime)' : 'var(--ft-t1)', fontWeight: 600 }}>{item.v}</span>
              </span>
            ))}
            <span style={{ width: '22px' }} />
          </div>
        </div>

        {/* Right: Form or Remaining */}
        <div>
          {showAddForm && (
            <div className="anim-in" style={{ padding: '24px 28px', borderBottom: '1px solid var(--ft-rule)', background: 'var(--ft-surface)' }}>
              <p className="eyebrow" style={{ marginBottom: '16px' }}>Manual Entry</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label htmlFor="meal-name" style={{ display: 'block', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '6px' }}>Meal Name</label>
                  <Input id="meal-name" value={newMeal.name} onChange={(e) => setNewMeal({ ...newMeal, name: e.target.value })} placeholder="Grilled Chicken Salad" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {[{ label: 'Calories', key: 'calories' as const }, { label: 'Protein (g)', key: 'protein' as const }, { label: 'Carbs (g)', key: 'carbs' as const }, { label: 'Fat (g)', key: 'fat' as const }].map((field) => (
                    <div key={field.key}>
                      <label htmlFor={`f-${field.key}`} style={{ display: 'block', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '6px' }}>{field.label}</label>
                      <Input id={`f-${field.key}`} type="number" value={(newMeal[field.key] as number) || ''} onChange={(e) => setNewMeal({ ...newMeal, [field.key]: Number(e.target.value) })} />
                    </div>
                  ))}
                </div>
                <button onClick={addMeal} className="btn-lime" style={{ padding: '12px 20px', justifyContent: 'center', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus style={{ width: '14px', height: '14px' }} /> Add Meal
                </button>
              </div>
            </div>
          )}

          <div style={{ padding: '24px 28px' }}>
            <p className="eyebrow" style={{ marginBottom: '20px' }}>Remaining Today</p>
            {(['calories', 'protein', 'carbs', 'fat'] as const).map((key) => {
              const goalVal = targets[key];
              const pct = Math.min(totals[key] / Math.max(goalVal, 1), 1);
              const isLime = key === 'calories';
              const labels: Record<string, string> = { calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
              const units: Record<string, string> = { calories: 'kcal left', protein: 'g left', carbs: 'g left', fat: 'g left' };
              return (
                <div key={key} style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t2)' }}>{labels[key]}</span>
                    <span className="data-val" style={{ fontSize: '12px', color: isLime ? 'var(--ft-lime)' : 'var(--ft-t1)' }}>{remaining[key]} {units[key]}</span>
                  </div>
                  <div style={{ height: '2px', background: 'var(--ft-rule-strong)' }}>
                    <div style={{ width: `${pct * 100}%`, height: '100%', background: isLime ? 'var(--ft-lime)' : 'rgba(255,255,255,0.35)', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── AI Meal Plan Generator Section ── */}
      <section className="anim-up d-200" style={{ padding: '40px', borderBottom: '1px solid var(--ft-rule)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '32px', flexWrap: 'wrap' }}>
          <div>
            <p className="eyebrow" style={{ marginBottom: '12px' }}>AI-Powered Synthesis</p>
            <h2 className="d-md" style={{ marginBottom: '8px' }}>Generate Precision Meal Plan</h2>
            <p style={{ fontSize: '13px', color: 'var(--ft-t2)', maxWidth: '520px' }}>
              Formulates an exact 4-slot macronutrient meal plan (Breakfast, Lunch, Snack, Dinner) calibrated to your {profile.weightKg} kg profile and {goal.type} objective.
            </p>
          </div>
          <button
            onClick={handleGenerateMealPlan}
            disabled={generatingPlan}
            className="btn-lime"
            style={{
              padding: '16px 32px',
              fontSize: '12px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: generatingPlan ? 'wait' : 'pointer',
            }}
          >
            {generatingPlan ? (
              <>
                <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
                <span>Formulating Plan...</span>
              </>
            ) : (
              <>
                <Sparkles style={{ width: '14px', height: '14px' }} />
                <span>Generate Plan</span>
                <ArrowUpRight style={{ width: '13px', height: '13px' }} />
              </>
            )}
          </button>
        </div>

        {/* Display Generated Plan */}
        {plannedMeals && (
          <div className="anim-in" style={{ marginTop: '32px', background: 'var(--ft-surface)', border: '1px solid var(--ft-rule)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <p className="eyebrow" style={{ color: 'var(--ft-lime)' }}>Synthesized Plan · 4 Meal Slots</p>
                <h3 style={{ fontSize: '16px', color: 'var(--ft-t1)', margin: '4px 0 0' }}>Daily Caloric Distribution</h3>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleLogEntirePlan}
                  disabled={planLogged}
                  className="btn-lime"
                  style={{ padding: '8px 18px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Check style={{ width: '13px', height: '13px' }} />
                  {planLogged ? 'Plan Logged to Today!' : 'Log Entire Plan'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {plannedMeals.map((meal) => (
                <div key={meal.slot} className="card-ft" style={{ padding: '16px' }}>
                  <span className="eyebrow" style={{ color: 'var(--ft-lime)' }}>{meal.slot}</span>
                  <h4 style={{ fontSize: '14px', color: 'var(--ft-t1)', margin: '6px 0 4px', fontWeight: 600 }}>{meal.name}</h4>
                  <p style={{ fontSize: '11px', color: 'var(--ft-t3)', margin: '0 0 12px', minHeight: '32px' }}>{meal.description}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--ft-rule)', paddingTop: '8px' }}>
                    <span className="data-val" style={{ fontSize: '12px', color: 'var(--ft-lime)' }}>{meal.calories} kcal</span>
                    <span style={{ fontSize: '10px', color: 'var(--ft-t2)' }}>{meal.protein}g P · {meal.carbs}g C · {meal.fat}g F</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════
          MEAL SCAN PANEL
      ════════════════════════════════════════════ */}
      {scanOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeScan}
            className="anim-in"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 40 }}
            aria-hidden="true"
          />

          {/* Drawer */}
          <aside
            className="anim-in"
            role="dialog"
            aria-modal="true"
            aria-label="Meal scanner"
            style={{
              position: 'fixed',
              top: '52px',
              right: 0,
              bottom: 0,
              width: '520px',
              background: 'var(--ft-void)',
              borderLeft: '1px solid var(--ft-rule)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
          >
            {/* Drawer header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', borderBottom: '1px solid var(--ft-rule)', flexShrink: 0 }}>
              <div>
                <p className="eyebrow">AI Vision Landmark</p>
                <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: '22px', textTransform: 'uppercase', letterSpacing: '-0.01em', marginTop: '2px' }}>Meal Scanner</p>
              </div>
              <button onClick={closeScan} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ft-t3)', padding: '4px' }} aria-label="Close scanner">
                <X style={{ width: '20px', height: '20px' }} />
              </button>
            </div>

            {/* Upload area */}
            <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--ft-rule)', flexShrink: 0 }}>
              {!preview ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: '1px dashed var(--ft-rule-strong)',
                    borderRadius: '2px',
                    padding: '48px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'border-color 0.12s',
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload meal photo"
                  onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
                >
                  <div style={{ width: '48px', height: '48px', border: '1px solid var(--ft-rule-strong)', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera style={{ width: '20px', height: '20px', color: 'var(--ft-t3)' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '13px', color: 'var(--ft-t1)', marginBottom: '4px' }}>Drop a photo or click to upload</p>
                    <p style={{ fontSize: '11px', color: 'var(--ft-t3)' }}>JPEG · PNG · WEBP (Auto-optimized to 1280px)</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <span className="btn-lime" style={{ padding: '8px 16px', fontSize: '11px', pointerEvents: 'none' }}>
                      <Upload style={{ width: '12px', height: '12px' }} />
                      Choose File
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Meal to analyze"
                    style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', borderRadius: '2px', display: 'block' }}
                  />
                  <button
                    onClick={() => { setPreview(null); setScanResult(null); setScanError(null); setSelected(new Set()); }}
                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(12,12,12,0.85)', border: '1px solid var(--ft-rule-strong)', borderRadius: '2px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ft-t1)' }}
                    aria-label="Remove photo"
                  >
                    <X style={{ width: '14px', height: '14px' }} />
                  </button>
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
                aria-label="File input for meal photo"
              />

              {preview && !scanResult && (
                <button
                  onClick={analyze}
                  disabled={scanning}
                  className="btn-lime"
                  style={{ width: '100%', justifyContent: 'center', marginTop: '16px', padding: '14px', fontSize: '12px', opacity: scanning ? 0.7 : 1, cursor: scanning ? 'wait' : 'pointer' }}
                >
                  {scanning ? (
                    <>
                      <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
                      Analyzing Meal Composition...
                    </>
                  ) : (
                    <>
                      <Sparkles style={{ width: '13px', height: '13px' }} />
                      <span>Analyze Meal</span>
                    </>
                  )}
                </button>
              )}

              {scanError && (
                <div style={{ marginTop: '12px', padding: '12px 16px', border: '1px solid rgba(255,68,68,0.3)', borderRadius: '2px', background: 'rgba(255,68,68,0.06)' }}>
                  <p style={{ fontSize: '12px', color: '#FF4444' }}>{scanError}</p>
                </div>
              )}
            </div>

            {/* Results */}
            {scanResult && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--ft-rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck style={{ width: '13px', height: '13px', color: 'var(--ft-lime)' }} />
                    <span style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t2)' }}>
                      {scanResult.provenance?.source === 'gemini' ? 'Gemini 2.0 Flash' : 'Deterministic Engine'} · {scanResult.confidence}
                    </span>
                  </div>
                  <p className="eyebrow">{scanResult.foods.length} items detected</p>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {scanResult.foods.length === 0 ? (
                    <div style={{ padding: '48px 28px', textAlign: 'center' }}>
                      <p style={{ color: 'var(--ft-t3)', fontSize: '13px' }}>{scanResult.note ?? 'No food items detected.'}</p>
                    </div>
                  ) : (
                    <>
                      {scanResult.foods.map((food, i) => {
                        const isSelected = selected.has(i);
                        return (
                          <button
                            key={i}
                            onClick={() => toggleSelect(i)}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '16px',
                              padding: '16px 28px',
                              background: isSelected ? 'var(--ft-lime-bg)' : 'transparent',
                              border: 'none',
                              borderBottom: '1px solid var(--ft-rule)',
                              borderLeft: isSelected ? '3px solid var(--ft-lime)' : '3px solid transparent',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: 'background 0.12s, border-color 0.12s',
                            }}
                            aria-pressed={isSelected}
                          >
                            <span style={{ marginTop: '2px', flexShrink: 0, color: isSelected ? 'var(--ft-lime)' : 'var(--ft-t3)' }}>
                              {isSelected ? <CheckSquare style={{ width: '14px', height: '14px' }} /> : <Square style={{ width: '14px', height: '14px' }} />}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                                <p style={{ fontSize: '14px', color: isSelected ? 'var(--ft-t1)' : 'var(--ft-t2)', fontWeight: 500 }}>{food.name}</p>
                                <span className="data-val" style={{ fontSize: '13px', color: isSelected ? 'var(--ft-lime)' : 'var(--ft-t3)', fontWeight: 600, flexShrink: 0 }}>
                                  {food.calories} kcal
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <span className="data-val" style={{ fontSize: '11px', color: 'var(--ft-t3)' }}>
                                  Portion {food.amount}{food.unit}
                                </span>
                                {[{ l: 'P', v: food.protein }, { l: 'C', v: food.carbs }, { l: 'F', v: food.fat }].map((m) => (
                                  <span key={m.l} className="data-val" style={{ fontSize: '11px', color: 'var(--ft-t3)', display: 'flex', gap: '3px' }}>
                                    <span>{m.l}</span>
                                    <span style={{ color: 'var(--ft-t2)' }}>{m.v}g</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>

                {scanResult.foods.length > 0 && (
                  <div style={{ padding: '16px 28px', borderTop: '1px solid var(--ft-rule)', flexShrink: 0, background: 'var(--ft-surface)' }}>
                    {scanTotals && selected.size > 0 && (
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                        <span className="eyebrow">Selected</span>
                        {[{ l: 'kcal', v: scanTotals.cal }, { l: 'P', v: `${Math.round(scanTotals.p)}g` }, { l: 'C', v: `${Math.round(scanTotals.c)}g` }, { l: 'F', v: `${Math.round(scanTotals.f)}g` }].map((item) => (
                          <span key={item.l} className="data-val" style={{ fontSize: '12px', display: 'flex', gap: '4px' }}>
                            <span style={{ color: 'var(--ft-t3)', fontSize: '10px' }}>{item.l}</span>
                            <span style={{ color: 'var(--ft-lime)', fontWeight: 600 }}>{item.v}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={addSelectedToLog}
                        disabled={selected.size === 0}
                        className="btn-lime"
                        style={{ flex: 1, justifyContent: 'center', padding: '12px', fontSize: '11px', opacity: selected.size === 0 ? 0.4 : 1, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Plus style={{ width: '13px', height: '13px' }} />
                        <span>Add {selected.size} to Meal Log</span>
                      </button>
                      <button onClick={closeScan} className="btn-ghost" style={{ padding: '12px 16px', fontSize: '11px' }}>Discard</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
