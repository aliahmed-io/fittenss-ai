'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Camera, Upload, X, Loader2, Plus, CheckSquare, Square, ArrowUpRight, Sparkles } from 'lucide-react';
import type { MealScanResult } from '@/app/api/analyze-meal/route';

interface Meal {
  id: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time?: string;
}

const GOALS = { calories: 2200, protein: 150, carbs: 220, fat: 70 };

const initial: Meal[] = [
  { id: 1, name: 'Oatmeal with Mixed Berries',    calories: 350, protein: 12, carbs: 55, fat: 8,  time: '08:00' },
  { id: 2, name: 'Grilled Chicken Salad',          calories: 420, protein: 35, carbs: 20, fat: 18, time: '13:00' },
  { id: 3, name: 'Salmon with Roasted Vegetables', calories: 500, protein: 30, carbs: 25, fat: 28, time: '19:00' },
];

function NutritionRow({ label, value, unit, lime }: { label: string; value: number; unit: string; lime: boolean }) {
  const goal = GOALS[label.toLowerCase() as keyof typeof GOALS] ?? 100;
  const pct = Math.min(value / goal, 1);
  return (
    <div style={{ padding: '28px 40px', borderRight: '1px solid var(--ft-rule)' }}>
      <p className="d-xl" style={{ color: lime ? 'var(--ft-lime)' : 'var(--ft-t1)' }}>
        {value}
        <span style={{ fontSize: '0.35em', color: 'var(--ft-t3)', marginLeft: '4px', fontWeight: 700 }}>{unit}</span>
      </p>
      <p className="eyebrow" style={{ marginTop: '8px', marginBottom: '10px' }}>
        {label} · Goal {goal}{unit.toLowerCase()}
      </p>
      <div style={{ height: '1px', background: 'var(--ft-rule-strong)' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: lime ? 'var(--ft-lime)' : 'rgba(255,255,255,0.4)', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

export default function NutritionPage() {
  const [meals, setMeals] = useState<Meal[]>(initial);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMeal, setNewMeal] = useState<Partial<Meal>>({ name: '', calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Scan panel state
  const [scanOpen, setScanOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string>('image/jpeg');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<MealScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const totals = meals.reduce(
    (acc, m) => ({ calories: acc.calories + m.calories, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const remaining = { calories: Math.max(GOALS.calories - totals.calories, 0), protein: Math.max(GOALS.protein - totals.protein, 0), carbs: Math.max(GOALS.carbs - totals.carbs, 0), fat: Math.max(GOALS.fat - totals.fat, 0) };

  const addMeal = () => {
    if (newMeal.name && newMeal.calories) {
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      setMeals([...meals, { ...newMeal, id: Date.now(), time } as Meal]);
      setNewMeal({ name: '', calories: 0, protein: 0, carbs: 0, fat: 0 });
      setShowAddForm(false);
    }
  };
  const removeMeal = (id: number) => setMeals(meals.filter((m) => m.id !== id));

  // ── Scan handlers ──
  const handleFileSelect = useCallback((file: File) => {
    setScanResult(null);
    setScanError(null);
    setSelected(new Set());
    setPreviewMime(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
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
      // Strip the data: URL prefix to get raw base64
      const base64 = preview.split(',')[1] ?? '';
      const res = await fetch('/api/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: previewMime }),
      });
      const data = await res.json() as MealScanResult & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Analysis failed');
      setScanResult(data);
      // Pre-select all items
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
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const toAdd = scanResult.foods
      .filter((_, i) => selected.has(i))
      .map((food) => ({
        id: Date.now() + Math.random(),
        name: `${food.name} (${food.amount}${food.unit})`,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        time,
      }));
    setMeals((prev) => [...prev, ...toAdd]);
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
        style={{ padding: '48px 40px 32px', borderBottom: '1px solid var(--ft-rule)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '32px' }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: '12px' }}>Daily Tracking</p>
          <h1 className="d-lg" style={{ color: 'var(--ft-t1)' }}>Nutrition</h1>
          <p style={{ fontSize: '14px', color: 'var(--ft-t2)', marginTop: '8px' }}>{meals.length} meals logged today</p>
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
      <section className="anim-up d-50" style={{ borderBottom: '1px solid var(--ft-rule)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }} aria-label="Daily macro totals">
        <NutritionRow label="Calories" value={totals.calories} unit="KCAL" lime />
        <NutritionRow label="Protein"  value={totals.protein}  unit="G"    lime={false} />
        <NutritionRow label="Carbs"    value={totals.carbs}    unit="G"    lime={false} />
        <div style={{ padding: '28px 40px' }}>
          <p className="d-xl" style={{ color: 'var(--ft-t1)' }}>
            {totals.fat}
            <span style={{ fontSize: '0.35em', color: 'var(--ft-t3)', marginLeft: '4px', fontWeight: 700 }}>G</span>
          </p>
          <p className="eyebrow" style={{ marginTop: '8px', marginBottom: '10px' }}>Fat · Goal {GOALS.fat}g</p>
          <div style={{ height: '1px', background: 'var(--ft-rule-strong)' }}>
            <div style={{ width: `${Math.min(totals.fat / GOALS.fat, 1) * 100}%`, height: '100%', background: 'rgba(255,255,255,0.4)', transition: 'width 0.6s ease' }} />
          </div>
        </div>
      </section>

      {/* ── Main Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', borderBottom: '1px solid var(--ft-rule)' }}>
        {/* Meal Log */}
        <div style={{ borderRight: '1px solid var(--ft-rule)' }}>
          <div style={{ padding: '0 40px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--ft-rule)' }}>
            <p className="eyebrow">Today&apos;s Meals</p>
            <p className="eyebrow">{meals.length} entries</p>
          </div>

          {meals.length === 0 && (
            <div style={{ padding: '48px 40px', textAlign: 'center' }}>
              <p style={{ color: 'var(--ft-t3)', fontSize: '13px' }}>No meals logged yet.</p>
            </div>
          )}

          {meals.map((meal) => (
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
              <button onClick={() => removeMeal(meal.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ft-t3)', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.12s ease' }} aria-label={`Remove ${meal.name}`} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#FF4444')} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--ft-t3)')}>
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
              const goal = GOALS[key];
              const pct = Math.min(totals[key] / goal, 1);
              const isLime = key === 'calories';
              const labels: Record<string, string> = { calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
              const units: Record<string, string> = { calories: 'kcal left', protein: 'g left', carbs: 'g left', fat: 'g left' };
              return (
                <div key={key} style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t2)' }}>{labels[key]}</span>
                    <span className="data-val" style={{ fontSize: '12px', color: isLime ? 'var(--ft-lime)' : 'var(--ft-t1)' }}>{remaining[key]} {units[key]}</span>
                  </div>
                  <div style={{ height: '1px', background: 'var(--ft-rule-strong)' }}>
                    <div style={{ width: `${pct * 100}%`, height: '100%', background: isLime ? 'var(--ft-lime)' : 'rgba(255,255,255,0.35)', transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── AI Meal Plan ── */}
      <section className="anim-up d-200" style={{ padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '32px' }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: '12px' }}>AI-Powered</p>
          <h2 className="d-md" style={{ marginBottom: '8px' }}>Generate Meal Plan</h2>
          <p style={{ fontSize: '13px', color: 'var(--ft-t2)', maxWidth: '480px' }}>Personalized nutrition based on your body scan, goals, and dietary preferences.</p>
        </div>
        <button
          className="btn-lime"
          style={{ padding: '16px 32px', fontSize: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Sparkles style={{ width: '14px', height: '14px' }} />
          <span>Generate Plan</span>
          <ArrowUpRight style={{ width: '13px', height: '13px' }} />
        </button>
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
                <p className="eyebrow">AI-Powered</p>
                <p style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: '22px', textTransform: 'uppercase', letterSpacing: '-0.01em', marginTop: '2px' }}>Meal Scanner</p>
              </div>
              <button onClick={closeScan} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ft-t3)', padding: '4px', transition: 'color 0.12s' }} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--ft-t1)')} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--ft-t3)')} aria-label="Close scanner">
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
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--ft-lime)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--ft-rule-strong)')}
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
                    <p style={{ fontSize: '11px', color: 'var(--ft-t3)' }}>JPEG · PNG · WEBP · also works from camera</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <span className="btn-lime" style={{ padding: '8px 16px', fontSize: '11px', pointerEvents: 'none' }}>
                      <Upload style={{ width: '12px', height: '12px' }} />
                      Choose File
                    </span>
                    <span className="btn-ghost" style={{ padding: '8px 16px', fontSize: '11px', pointerEvents: 'none' }}>
                      <Camera style={{ width: '12px', height: '12px' }} />
                      Take Photo
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
                      Analyzing...
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
                  {scanError.includes('GEMINI_API_KEY') && (
                    <p style={{ fontSize: '11px', color: 'var(--ft-t3)', marginTop: '6px' }}>
                      Add <code style={{ color: 'var(--ft-lime)', fontFamily: 'IBM Plex Mono, monospace' }}>GEMINI_API_KEY=your_key</code> to <code style={{ color: 'var(--ft-lime)', fontFamily: 'IBM Plex Mono, monospace' }}>.env.local</code> and restart the server.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Results */}
            {scanResult && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Result header */}
                <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--ft-rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <p className="eyebrow">Detected Foods</p>
                    <span style={{ padding: '2px 8px', border: '1px solid var(--ft-rule)', borderRadius: '2px', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: scanResult.confidence === 'high' ? 'var(--ft-lime)' : scanResult.confidence === 'medium' ? '#FFCC00' : 'var(--ft-t3)' }}>
                      {scanResult.confidence} confidence
                    </span>
                  </div>
                  <p className="eyebrow">{scanResult.foods.length} items</p>
                </div>

                {/* Food rows */}
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
                            {/* Checkbox */}
                            <span style={{ marginTop: '2px', flexShrink: 0, color: isSelected ? 'var(--ft-lime)' : 'var(--ft-t3)' }}>
                              {isSelected
                                ? <CheckSquare style={{ width: '14px', height: '14px' }} />
                                : <Square style={{ width: '14px', height: '14px' }} />
                              }
                            </span>

                            {/* Number */}
                            <span className="data-val" style={{ fontSize: '10px', color: 'var(--ft-t3)', width: '20px', flexShrink: 0, marginTop: '3px' }}>
                              {String(i + 1).padStart(2, '0')}
                            </span>

                            {/* Main info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                                <p style={{ fontSize: '14px', color: isSelected ? 'var(--ft-t1)' : 'var(--ft-t2)', fontWeight: 500 }}>{food.name}</p>
                                <span className="data-val" style={{ fontSize: '13px', color: isSelected ? 'var(--ft-lime)' : 'var(--ft-t3)', fontWeight: 600, flexShrink: 0 }}>
                                  {food.calories} kcal
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <span className="data-val" style={{ fontSize: '11px', color: 'var(--ft-t3)' }}>
                                  <span style={{ color: 'var(--ft-t3)' }}>Portion </span>
                                  <span style={{ color: 'var(--ft-t2)' }}>{food.amount}{food.unit}</span>
                                </span>
                                {[{ l: 'P', v: food.protein }, { l: 'C', v: food.carbs }, { l: 'F', v: food.fat }, { l: 'Fiber', v: food.fiber }].map((m) => (
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

                      {/* AI note */}
                      {scanResult.note && (
                        <div style={{ padding: '12px 28px 0', borderTop: '1px solid var(--ft-rule)' }}>
                          <p style={{ fontSize: '11px', color: 'var(--ft-t3)', fontStyle: 'italic' }}>Note: {scanResult.note}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Add to log footer */}
                {scanResult.foods.length > 0 && (
                  <div style={{ padding: '16px 28px', borderTop: '1px solid var(--ft-rule)', flexShrink: 0, background: 'var(--ft-surface)' }}>
                    {scanTotals && selected.size > 0 && (
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                        <span className="eyebrow">Selected total</span>
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
                        <span>Add {selected.size} item{selected.size !== 1 ? 's' : ''} to Log</span>
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
