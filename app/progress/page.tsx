'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDialogFocus } from '@/lib/hooks/useDialogFocus';
import { Input } from '@/components/ui/input';
import {
  TrendingDown,
  TrendingUp,
  Camera,
  Trash2,
  Loader2,
  ShieldCheck,
  RotateCcw,
  Check,
  X,
} from 'lucide-react';
import { useFitnessStore, fitnessActions } from '@/lib/store/fitnessStore';
import { analyzeProgress, computeTargets, computeStreak, toDateKey } from '@/lib/fitness/engine';
import type { CoachResponse, ProgressEntry, ProgressInsight } from '@/lib/fitness/types';

type MetricKey = 'weightKg' | 'bodyFatPct' | 'muscleMassPct' | 'waistCm';

interface MetricConfig {
  label: string;
  unit: string;
  minRange: number;
  maxRange: number;
}

const METRICS: Record<MetricKey, MetricConfig> = {
  weightKg: { label: 'Weight', unit: 'KG', minRange: 40, maxRange: 140 },
  bodyFatPct: { label: 'Body Fat', unit: '%', minRange: 5, maxRange: 50 },
  muscleMassPct: { label: 'Muscle Mass', unit: '%', minRange: 20, maxRange: 60 },
  waistCm: { label: 'Waist Circumference', unit: 'CM', minRange: 50, maxRange: 130 },
};

export default function ProgressPage() {
  const router = useRouter();
  const store = useFitnessStore();
  const { progressEntries, workoutLogs, goal, profile } = store;

  // Active chart metric tab
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('weightKg');
  const [showForm, setShowForm] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [newEntry, setNewEntry] = useState({
    date: toDateKey(new Date()),
    weightKg: String(profile.weightKg),
    bodyFatPct: '',
    muscleMassPct: '',
    waistCm: '',
    notes: '',
  });

  // AI Progress Analysis Drawer / Panel
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ProgressInsight | null>(null);
  const [analysisProvenance, setAnalysisProvenance] = useState<{ source: string; confidence: string } | null>(null);

  const analysisDialogRef = useDialogFocus(isAnalysisOpen, () => setIsAnalysisOpen(false));

  // Sync confirmation notification
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Sorted entries chronologically
  const entries = useMemo(() => {
    return [...progressEntries].sort((a, b) => a.date.localeCompare(b.date));
  }, [progressEntries]);

  const streak = useMemo(() => computeStreak(workoutLogs, toDateKey(new Date())), [workoutLogs]);

  // Delta calculations
  const first = entries[0];
  const latest = entries[entries.length - 1];

  const weightDelta = first && latest ? +(latest.weightKg - first.weightKg).toFixed(1) : 0;
  const fatEntries = entries.filter(e => e.bodyFatPct > 0);
  const waistEntries = entries.filter(e => e.waistCm > 0);
  const fatDelta = fatEntries.length >= 2 ? +(fatEntries.at(-1)!.bodyFatPct - fatEntries[0]!.bodyFatPct).toFixed(1) : 0;
  const waistDelta = waistEntries.length >= 2 ? +(waistEntries.at(-1)!.waistCm - waistEntries[0]!.waistCm).toFixed(1) : 0;

  const handleAddEntry = () => {
    const w = Number(newEntry.weightKg);
    const optional = [Number(newEntry.bodyFatPct), Number(newEntry.muscleMassPct), Number(newEntry.waistCm)];
    if (!Number.isFinite(w) || w < 30 || w > 250 || optional.some(v => !Number.isFinite(v) || v < 0) || optional[0]! > 60 || optional[1]! > 100 || optional[2]! > 200 || !newEntry.date || newEntry.date > toDateKey(new Date())) { setEntryError('Enter a valid date and weight between 30 and 250 kg. Optional measurements must be within their ranges.'); return; }
    setEntryError('');
    if (w > 0) {
      const saved = fitnessActions.addProgressEntry({
        date: newEntry.date || toDateKey(new Date()),
        weightKg: w,
        bodyFatPct: Number(newEntry.bodyFatPct) || 0,
        muscleMassPct: Number(newEntry.muscleMassPct) || 0,
        waistCm: Number(newEntry.waistCm) || 0,
        notes: newEntry.notes.trim(),
      });
      if (saved.date === toDateKey(new Date())) fitnessActions.syncProfileFromEntry(saved);
      setShowForm(false);
    }
  };

  const handleSyncToModel = (entry: ProgressEntry) => {
    fitnessActions.syncProfileFromEntry(entry);
    setSyncFeedback(`3D avatar synchronized to ${entry.date} (${entry.weightKg} kg, ${entry.bodyFatPct > 0 ? `${entry.bodyFatPct}%` : '—'} BF).`);
    setTimeout(() => setSyncFeedback(null), 4000);
  };

  const handleRunAnalysis = async () => {
    setIsAnalysisOpen(true);
    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'progress-analysis',
          profile,
          goal,
          targets: computeTargets(profile, goal),
          message: '',
          entries,
          streak,
        }),
      });

      if (!res.ok) throw new Error('Analysis service unavailable');
      if (res.ok) {
        const data = (await res.json()) as CoachResponse;
        if (!data.insight) throw new Error('No analysis returned');
        if (data.insight) {
          setAnalysisResult(data.insight);
          setAnalysisProvenance({
            source: data.provenance.source === 'gemini' ? 'AI coach' : 'Built-in progress analysis',
            confidence: data.provenance.confidence,
          });
        }
      }
    } catch {
      // Local fallback
      const base = analyzeProgress(entries, goal, toDateKey(new Date()));
      setAnalysisResult(base);
      setAnalysisProvenance({ source: 'Built-in progress analysis', confidence: 'medium' });
    } finally {
      setAnalyzing(false);
    }
  };

  // SVG Chart points calculation for active metric
  const chartW = 900;
  const chartH = 160;
  const chartEntries = entries.filter(e => selectedMetric === 'weightKg' || e[selectedMetric] > 0);
  const activeVals = chartEntries.map((e) => e[selectedMetric]);
  const minVal = activeVals.length > 0 ? Math.min(...activeVals) - 1 : 0;
  const maxVal = activeVals.length > 0 ? Math.max(...activeVals) + 1 : 10;
  const valRange = Math.max(maxVal - minVal, 1);

  const pts = chartEntries.map((e, i) => ({
    x: chartEntries.length === 1 ? chartW / 2 : (i / Math.max(chartEntries.length - 1, 1)) * (chartW - 64) + 32,
    y: chartH - ((e[selectedMetric] - minVal) / valRange) * (chartH - 40) - 20,
    val: e[selectedMetric],
    date: e.date,
  }));
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div>
      {/* ── Sync Notification ── */}
      {syncFeedback && (
        <div
          className="anim-in"
          style={{
            padding: '12px 40px',
            background: 'rgba(203, 255, 0, 0.12)',
            borderBottom: '1px solid var(--ft-lime)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Check style={{ width: '14px', height: '14px', color: 'var(--ft-lime)' }} />
            <span style={{ fontSize: '12px', color: 'var(--ft-t1)' }}>{syncFeedback}</span>
          </div>
          <button
            onClick={() => router.push('/')}
            className="btn-lime"
            style={{ padding: '4px 12px', fontSize: '10px' }}
          >
            View Avatar
          </button>
        </div>
      )}

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
          <p className="eyebrow" style={{ marginBottom: '12px' }}>Body Analytics</p>
          <h1 className="d-lg" style={{ color: 'var(--ft-t1)' }}>Progress</h1>
          <p style={{ fontSize: '14px', color: 'var(--ft-t2)', marginTop: '8px' }}>
            {entries.length} log entries recorded · Goal: {goal.targetWeightKg} kg ({goal.type})
          </p>
        </div>
        <button
          onClick={() => { if (!showForm) { setNewEntry({ date: toDateKey(new Date()), weightKg: String(profile.weightKg), bodyFatPct: '', muscleMassPct: '', waistCm: '', notes: '' }); setEntryError(''); } setShowForm(!showForm); }}
          className={showForm ? 'btn-ghost' : 'btn-lime'}
          style={{ padding: '12px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Camera style={{ width: '14px', height: '14px' }} />
          {showForm ? 'Cancel' : 'Log New Entry'}
        </button>
      </section>

      {/* ── Hero Stats ── */}
      <section
        className="anim-up d-50 ft-responsive-stats"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          borderBottom: '1px solid var(--ft-rule)',
        }}
        aria-label="Progress summary"
      >
        {[
          {
            label: 'Weight Delta',
            value: first && latest ? `${weightDelta > 0 ? '+' : ''}${weightDelta}` : '0',
            unit: 'KG',
            sub: first && latest ? `${first.weightKg} to ${latest.weightKg} KG` : 'No history yet',
            down: weightDelta < 0,
            lime: weightDelta < 0,
          },
          {
            label: 'Body Fat Delta',
            value: fatEntries.length >= 2 ? `${fatDelta > 0 ? '+' : ''}${fatDelta}` : '—',
            unit: '%',
            sub: fatEntries.length >= 2 ? `${fatEntries[0]!.bodyFatPct}% to ${fatEntries.at(-1)!.bodyFatPct}%` : 'Add two measurements',
            down: fatDelta < 0,
            lime: fatDelta < 0,
          },
          {
            label: 'Waist Delta',
            value: waistEntries.length >= 2 ? `${waistDelta > 0 ? '+' : ''}${waistDelta}` : '—',
            unit: 'CM',
            sub: waistEntries.length >= 2 ? `${waistEntries[0]!.waistCm} to ${waistEntries.at(-1)!.waistCm} CM` : 'Add two measurements',
            down: waistDelta < 0,
            lime: waistDelta < 0,
          },
          {
            label: 'Training Streak',
            value: String(streak),
            unit: 'D',
            sub: 'Consecutive training days',
            down: false,
            lime: streak > 0,
          },
        ].map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: '32px 40px',
              borderRight: i < 3 ? '1px solid var(--ft-rule)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <p className="eyebrow">{s.label}</p>
              {i < 3 && (
                s.down ? (
                  <TrendingDown style={{ width: '12px', height: '12px', color: 'var(--ft-lime)' }} />
                ) : (
                  <TrendingUp style={{ width: '12px', height: '12px', color: '#FFB020' }} />
                )
              )}
            </div>
            <p className="d-xl" style={{ color: s.lime ? 'var(--ft-lime)' : 'var(--ft-t1)' }}>
              {s.value}
              <span style={{ fontSize: '0.35em', color: 'var(--ft-t3)', marginLeft: '4px', fontWeight: 700 }}>
                {s.unit}
              </span>
            </p>
            <p style={{ fontSize: '12px', color: 'var(--ft-t3)', marginTop: '8px' }}>{s.sub}</p>
          </div>
        ))}
      </section>

      {/* ── Metric Switcher Tabs & Trend Chart ── */}
      <section className="anim-up d-100" style={{ padding: '32px 40px', borderBottom: '1px solid var(--ft-rule)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          {/* Metric Selector Tabs */}
          <div style={{ display: 'flex', gap: '2px', background: 'var(--ft-surface)', padding: '2px', border: '1px solid var(--ft-rule)' }}>
            {(Object.keys(METRICS) as MetricKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSelectedMetric(key)}
                className={selectedMetric === key ? 'btn-lime' : 'btn-ghost'}
                style={{ padding: '6px 14px', fontSize: '10px', textTransform: 'uppercase' }}
              >
                {METRICS[key].label}
              </button>
            ))}
          </div>

          {entries.length >= 2 && first && latest && (
            <div style={{ display: 'flex', gap: '24px' }}>
              <span className="data-val" style={{ fontSize: '12px', color: 'var(--ft-t3)' }}>
                Baseline: <span style={{ color: 'var(--ft-t1)' }}>{first[selectedMetric]} {METRICS[selectedMetric].unit}</span>
              </span>
              <span className="data-val" style={{ fontSize: '12px', color: 'var(--ft-t3)' }}>
                Latest: <span style={{ color: 'var(--ft-lime)' }}>{latest[selectedMetric]} {METRICS[selectedMetric].unit}</span>
              </span>
            </div>
          )}
        </div>

        {chartEntries.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--ft-t3)', fontSize: '13px' }}>
              No measurements recorded for this metric yet. Click &quot;Log New Entry&quot; above to begin your trajectory.
            </p>
          </div>
        ) : (
          <div>
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              style={{ width: '100%', height: `${chartH}px` }}
              aria-label={`${METRICS[selectedMetric].label} trend chart`}
            >
              {/* Horizontal grid lines */}
              {[0, 0.5, 1].map((t) => (
                <line
                  key={t}
                  x1="0"
                  y1={chartH - t * (chartH - 40) - 20}
                  x2={chartW}
                  y2={chartH - t * (chartH - 40) - 20}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="1"
                />
              ))}

              {/* Trend Polyline */}
              {entries.length > 1 && (
                <polyline
                  points={line}
                  fill="none"
                  stroke="var(--ft-lime)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* Data Points */}
              {pts.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="4.5"
                    fill="var(--ft-void)"
                    stroke="var(--ft-lime)"
                    strokeWidth="2"
                  />
                  <text
                    x={p.x}
                    y={p.y - 12}
                    textAnchor="middle"
                    fontSize="11"
                    fontFamily="IBM Plex Mono, monospace"
                    fill="rgba(255,255,255,0.7)"
                  >
                    {p.val}
                  </text>
                </g>
              ))}
            </svg>

            {/* X-axis dates */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingInline: '32px' }}>
              {chartEntries.map((e) => (
                <span key={e.id} className="data-val" style={{ fontSize: '10px', color: 'var(--ft-t3)' }}>
                  {new Date(e.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Add Entry Form ── */}
      {showForm && (
        <section
          className="anim-in"
          style={{
            padding: '32px 40px',
            borderBottom: '1px solid var(--ft-rule)',
            background: 'var(--ft-surface)',
          }}
        >
          <p className="eyebrow" style={{ marginBottom: '12px' }}>Check in with your weight</p><p className="ft-feedback">Today’s check-in also updates your profile and 3D preview.</p>
          <div className="ft-checkin-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', alignItems: 'end' }}>
            <div>
              <label htmlFor="checkin-date" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>
                Date
              </label>
              <Input
                id="checkin-date"
                max={toDateKey(new Date())}
                type="date"
                value={newEntry.date}
                onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="checkin-weight" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>
                Weight (kg)
              </label>
              <Input
                id="checkin-weight"
                type="number"
                value={newEntry.weightKg}
                onChange={(e) => setNewEntry({ ...newEntry, weightKg: e.target.value })}
              />
            </div>
            <details className="ft-disclosure ft-inline-details"><summary>Add measurements or a note (optional)</summary><div className="ft-checkin-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <label htmlFor="checkin-bodyfat" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>
                Body Fat (%)
              </label>
              <Input
                id="checkin-bodyfat"
                type="number"
                value={newEntry.bodyFatPct}
                onChange={(e) => setNewEntry({ ...newEntry, bodyFatPct: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="checkin-muscle" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>
                Muscle (%)
              </label>
              <Input
                id="checkin-muscle"
                type="number"
                value={newEntry.muscleMassPct}
                onChange={(e) => setNewEntry({ ...newEntry, muscleMassPct: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="checkin-waist" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>
                Waist (cm)
              </label>
              <Input
                id="checkin-waist"
                type="number"
                value={newEntry.waistCm}
                onChange={(e) => setNewEntry({ ...newEntry, waistCm: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="checkin-notes" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>
                Notes
              </label>
              <Input
                id="checkin-notes"
                type="text"
                value={newEntry.notes}
                onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })}
                placeholder="Condition, energy, pump..."
              />
            </div>
            </div></details>
            {entryError && <p role="alert" className="ft-feedback ft-error">{entryError}</p>}
            <button
              onClick={handleAddEntry}
              className="btn-lime"
              style={{ padding: '10px 22px', fontSize: '11px', whiteSpace: 'nowrap' }}
            >
              Save Check-in
            </button>
          </div>
        </section>
      )}

      {/* ── Progress Timeline ── */}
      <section className="anim-up d-200">
        <div
          style={{
            padding: '0 40px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--ft-rule)',
          }}
        >
          <p className="eyebrow">Check-in History ({entries.length} entries)</p>
          <span style={{ fontSize: '10px', color: 'var(--ft-t3)' }}>
            Today’s check-ins update your profile automatically
          </span>
        </div>

        {entries.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ color: 'var(--ft-t3)', fontSize: '12px' }}>No entries logged yet.</p>
          </div>
        ) : (
          [...entries].reverse().map((entry, i) => {
            const isLatest = i === 0;
            return (
              <div
                key={entry.id}
                className="anim-up ft-progress-history-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '24px',
                  padding: '0 40px',
                  height: '76px',
                  borderBottom: '1px solid var(--ft-rule)',
                  borderLeft: isLatest ? '3px solid var(--ft-lime)' : '3px solid transparent',
                  background: isLatest ? 'var(--ft-lime-bg)' : 'transparent',
                }}
              >
                {/* Index */}
                <span className="data-val" style={{ fontSize: '11px', color: 'var(--ft-t3)', width: '24px', flexShrink: 0 }}>
                  {String(entries.length - i).padStart(2, '0')}
                </span>

                {/* Date */}
                <div style={{ minWidth: '130px' }}>
                  <p className="data-val" style={{ fontSize: '13px', color: isLatest ? 'var(--ft-lime)' : 'var(--ft-t1)', fontWeight: 500 }}>
                    {new Date(entry.date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  {isLatest && (
                    <span style={{ fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-lime)', opacity: 0.8 }}>
                      Latest Point
                    </span>
                  )}
                </div>

                {/* Metrics */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div>
                    <span className="eyebrow" style={{ fontSize: '8px' }}>Weight</span>
                    <p className="data-val" style={{ fontSize: '13px', color: 'var(--ft-t1)', margin: 0 }}>{entry.weightKg} KG</p>
                  </div>
                  <div>
                    <span className="eyebrow" style={{ fontSize: '8px' }}>Body Fat</span>
                    <p className="data-val" style={{ fontSize: '13px', color: 'var(--ft-t1)', margin: 0 }}>{entry.bodyFatPct > 0 ? `${entry.bodyFatPct}%` : '—'}</p>
                  </div>
                  <div>
                    <span className="eyebrow" style={{ fontSize: '8px' }}>Waist</span>
                    <p className="data-val" style={{ fontSize: '13px', color: 'var(--ft-t1)', margin: 0 }}>{entry.waistCm > 0 ? `${entry.waistCm} CM` : '—'}</p>
                  </div>
                </div>

                {/* Notes */}
                <p style={{ flex: 1, fontSize: '12px', color: 'var(--ft-t3)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.notes ? `"${entry.notes}"` : ''}
                </p>

                {/* Actions: Sync to Avatar & Delete */}
                <details className="ft-disclosure ft-entry-options"><summary>Options</summary><div className="ft-entry-actions">
                  <button
                    onClick={() => handleSyncToModel(entry)}
                    className="btn-ghost"
                    style={{ padding: '6px 12px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Calibrate 3D avatar measurements to this check-in"
                  >
                    <RotateCcw style={{ width: '10px', height: '10px' }} />
                    Sync 3D Model
                  </button>
                  <button
                    onClick={() => fitnessActions.removeProgressEntry(entry.id)}
                    className="btn-ghost"
                    style={{ padding: '6px', color: 'var(--ft-t3)' }}
                    title="Delete entry"
                    aria-label="Delete entry"
                  >
                    <Trash2 style={{ width: '13px', height: '13px' }} />
                  </button>
                </div></details>
              </div>
            );
          })
        )}
      </section>

      {/* ── AI Analysis Section ── */}
      <section
        className="anim-up d-300"
        style={{
          padding: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '32px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: '12px' }}>Progress review</p>
          <h2 className="d-md" style={{ marginBottom: '8px' }}>See how you’re progressing</h2>
          <p style={{ fontSize: '13px', color: 'var(--ft-t2)', maxWidth: '480px' }}>
            Review your weight trend and find practical next steps based on your check-ins.
          </p>
        </div>
        <button
          onClick={handleRunAnalysis}
          className="btn-lime"
          style={{ padding: '16px 32px', fontSize: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <TrendingUp style={{ width: '14px', height: '14px' }} />
          View Analysis
        </button>
      </section>

      {/* ── AI Analysis Drawer / Modal ── */}
      {isAnalysisOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          ref={analysisDialogRef as React.RefObject<HTMLDivElement>}
          role="dialog"
          aria-modal="true"
          aria-labelledby="analysis-modal-title"
        >
          <div
            style={{
              width: '100%',
              maxWidth: '680px',
              background: 'var(--ft-void)',
              border: '1px solid var(--ft-rule)',
              boxShadow: '0 32px 64px rgba(0,0,0,0.9)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--ft-rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p className="eyebrow" style={{ color: 'var(--ft-lime)' }}>Progress insight</p>
                <h3 id="analysis-modal-title" style={{ fontSize: '18px', color: 'var(--ft-t1)', margin: '4px 0 0' }}>
                  Your progress and next steps
                </h3>
              </div>
              <button onClick={() => setIsAnalysisOpen(false)} className="btn-ghost" style={{ padding: '6px' }} aria-label="Close analysis">
                <X style={{ width: '18px', height: '18px' }} />
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {analyzing ? (
                <div style={{ padding: '48px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <Loader2 style={{ width: '20px', height: '20px', color: 'var(--ft-lime)', animation: 'spin 1s linear infinite' }} />
                  <p style={{ fontSize: '13px', color: 'var(--ft-t2)' }}>Reviewing your check-ins...</p>
                </div>
              ) : analysisResult ? (
                <>
                  {/* Summary Card */}
                  <div style={{ padding: '16px', background: 'var(--ft-surface)', border: '1px solid var(--ft-rule)', borderLeft: '3px solid var(--ft-lime)' }}>
                    <p className="eyebrow" style={{ marginBottom: '6px' }}>What your check-ins show</p>
                    <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--ft-t1)', margin: 0 }}>
                      {analysisResult.summary}
                    </p>
                  </div>

                  {/* Velocity & ETA */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="card-ft" style={{ padding: '14px' }}>
                      <span className="eyebrow">Calculated Velocity</span>
                      <p className="data-val" style={{ fontSize: '18px', color: 'var(--ft-lime)', margin: '4px 0 0' }}>
                        {analysisResult.velocityKgPerWeek > 0 ? `+${analysisResult.velocityKgPerWeek}` : analysisResult.velocityKgPerWeek} <span style={{ fontSize: '10px', color: 'var(--ft-t3)' }}>KG / WEEK</span>
                      </p>
                    </div>
                    <div className="card-ft" style={{ padding: '14px' }}>
                      <span className="eyebrow">Projected Goal Date</span>
                      <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)', margin: '4px 0 0' }}>
                        {analysisResult.projectedGoalDate ? (
                          new Date(analysisResult.projectedGoalDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--ft-t3)' }}>More check-ins needed</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div>
                    <p className="eyebrow" style={{ marginBottom: '10px' }}>Actionable Adjustments</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {analysisResult.recommendations.map((rec, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '10px 14px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid var(--ft-rule)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                          }}
                        >
                          <span style={{ color: 'var(--ft-lime)', fontSize: '11px', marginTop: '2px' }}>•</span>
                          <span style={{ fontSize: '12px', color: 'var(--ft-t2)', lineHeight: 1.5 }}>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Provenance */}
                  {analysisProvenance && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--ft-rule)' }}>
                      <ShieldCheck style={{ width: '13px', height: '13px', color: 'var(--ft-lime)' }} />
                      <span style={{ fontSize: '10px', color: 'var(--ft-t3)' }}>
                        Source: {analysisProvenance.source} · Confidence: {analysisProvenance.confidence}
                      </span>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
