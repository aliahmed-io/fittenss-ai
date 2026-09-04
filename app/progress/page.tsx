'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { TrendingDown, TrendingUp, Camera } from 'lucide-react';

interface ProgressEntry {
  id: number;
  date: string;
  weight: number;
  bodyFat: number;
  muscleMass: number;
  notes: string;
}

const data: ProgressEntry[] = [
  { id: 1, date: '2026-07-01', weight: 75,   bodyFat: 22,   muscleMass: 58,   notes: 'Starting point — baseline measurement' },
  { id: 2, date: '2026-07-08', weight: 74.2, bodyFat: 21.2, muscleMass: 58.5, notes: 'Staying consistent, energy levels up' },
  { id: 3, date: '2026-07-15', weight: 72.5, bodyFat: 20,   muscleMass: 59.1, notes: 'Great week — hit all training sessions!' },
];

export default function ProgressPage() {
  const [entries, setEntries] = useState<ProgressEntry[]>(data);
  const [showForm, setShowForm] = useState(false);
  const [newEntry, setNewEntry] = useState({ weight: '', bodyFat: '', muscleMass: '', notes: '' });

  const addEntry = () => {
    if (newEntry.weight) {
      const today = new Date().toISOString().split('T')[0]!;
      setEntries([...entries, {
        id: Date.now(), date: today,
        weight: Number(newEntry.weight), bodyFat: Number(newEntry.bodyFat) || 0,
        muscleMass: Number(newEntry.muscleMass) || 0, notes: newEntry.notes,
      }]);
      setNewEntry({ weight: '', bodyFat: '', muscleMass: '', notes: '' });
      setShowForm(false);
    }
  };

  const first  = entries[0]!;
  const latest = entries[entries.length - 1]!;
  const weightDelta     = +(latest.weight - first.weight).toFixed(1);
  const fatDelta        = +(latest.bodyFat - first.bodyFat).toFixed(1);

  // Chart
  const weights  = entries.map((e) => e.weight);
  const minW     = Math.min(...weights) - 0.5;
  const maxW     = Math.max(...weights) + 0.5;
  const chartW   = 900;
  const chartH   = 160;
  const pts      = entries.map((e, i) => ({
    x: (i / Math.max(entries.length - 1, 1)) * (chartW - 64) + 32,
    y: chartH - ((e.weight - minW) / (maxW - minW)) * (chartH - 40) - 20,
    e,
  }));
  const line     = pts.map((p) => `${p.x},${p.y}`).join(' ');

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
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: '12px' }}>Body Analytics</p>
          <h1 className="d-lg" style={{ color: 'var(--ft-t1)' }}>Progress</h1>
          <p style={{ fontSize: '14px', color: 'var(--ft-t2)', marginTop: '8px' }}>
            {entries.length} entries · {first.date} to {latest.date}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={showForm ? 'btn-ghost' : 'btn-lime'}
          style={{ padding: '12px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Camera style={{ width: '14px', height: '14px' }} />
          {showForm ? 'Cancel' : 'Log Entry'}
        </button>
      </section>

      {/* ── Hero Stats ── */}
      <section
        className="anim-up d-50"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          borderBottom: '1px solid var(--ft-rule)',
        }}
        aria-label="Progress summary"
      >
        {[
          {
            label: 'Weight Change',
            value: `${weightDelta > 0 ? '+' : ''}${weightDelta}`,
            unit: 'KG',
            sub: `${first.weight} to ${latest.weight} KG`,
            down: weightDelta < 0,
            lime: weightDelta < 0,
          },
          {
            label: 'Body Fat',
            value: `${fatDelta > 0 ? '+' : ''}${fatDelta}`,
            unit: '%',
            sub: `${first.bodyFat}% to ${latest.bodyFat}%`,
            down: fatDelta < 0,
            lime: fatDelta < 0,
          },
          {
            label: 'Streak',
            value: '14',
            unit: 'D',
            sub: 'Active training days',
            down: false,
            lime: true,
          },
        ].map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: '32px 40px',
              borderRight: i < 2 ? '1px solid var(--ft-rule)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <p className="eyebrow">{s.label}</p>
              {i < 2 && (
                s.down
                  ? <TrendingDown style={{ width: '12px', height: '12px', color: 'var(--ft-lime)' }} />
                  : <TrendingUp style={{ width: '12px', height: '12px', color: '#FF4444' }} />
              )}
            </div>
            <p
              className="d-xl"
              style={{ color: s.lime ? 'var(--ft-lime)' : 'var(--ft-t1)' }}
            >
              {s.value}
              <span style={{ fontSize: '0.35em', color: 'var(--ft-t3)', marginLeft: '4px', fontWeight: 700 }}>
                {s.unit}
              </span>
            </p>
            <p style={{ fontSize: '12px', color: 'var(--ft-t3)', marginTop: '8px' }}>{s.sub}</p>
          </div>
        ))}
      </section>

      {/* ── Weight Chart ── */}
      <section
        className="anim-up d-100"
        style={{ padding: '40px', borderBottom: '1px solid var(--ft-rule)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <p className="eyebrow">Weight Trend</p>
          <div style={{ display: 'flex', gap: '24px' }}>
            <span className="data-val" style={{ fontSize: '12px', color: 'var(--ft-t3)' }}>
              Start: <span style={{ color: 'var(--ft-t1)' }}>{first.weight} KG</span>
            </span>
            <span className="data-val" style={{ fontSize: '12px', color: 'var(--ft-t3)' }}>
              Now: <span style={{ color: 'var(--ft-lime)' }}>{latest.weight} KG</span>
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          style={{ width: '100%', height: `${chartH}px` }}
          aria-label="Weight trend chart"
        >
          {/* Horizontal grid lines */}
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1="0" y1={chartH - t * (chartH - 40) - 20}
              x2={chartW} y2={chartH - t * (chartH - 40) - 20}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
          ))}

          {/* Line */}
          <polyline
            points={line}
            fill="none"
            stroke="var(--ft-lime)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Points */}
          {pts.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x} cy={p.y} r="4"
                fill="var(--ft-void)"
                stroke="var(--ft-lime)"
                strokeWidth="1.5"
              />
              <text
                x={p.x} y={p.y - 12}
                textAnchor="middle"
                fontSize="11"
                fontFamily="IBM Plex Mono, monospace"
                fill="rgba(255,255,255,0.6)"
              >
                {p.e.weight}
              </text>
            </g>
          ))}
        </svg>

        {/* X-axis dates */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingInline: '32px' }}>
          {entries.map((e) => (
            <span key={e.id} className="data-val" style={{ fontSize: '10px', color: 'var(--ft-t3)' }}>
              {new Date(e.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </span>
          ))}
        </div>
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
          <p className="eyebrow" style={{ marginBottom: '20px' }}>New Entry</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) 2fr', gap: '16px', alignItems: 'end' }}>
            {[
              { label: 'Weight (kg)', key: 'weight' },
              { label: 'Body Fat (%)', key: 'bodyFat' },
              { label: 'Muscle (%)', key: 'muscleMass' },
              { label: 'Notes', key: 'notes' },
            ].map((field) => (
              <div key={field.key}>
                <label htmlFor={`e-${field.key}`} style={{ display: 'block', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '6px' }}>
                  {field.label}
                </label>
                <Input
                  id={`e-${field.key}`}
                  type={field.key === 'notes' ? 'text' : 'number'}
                  value={newEntry[field.key as keyof typeof newEntry]}
                  onChange={(e) => setNewEntry({ ...newEntry, [field.key]: e.target.value })}
                  placeholder={field.key === 'notes' ? 'How was this week?' : ''}
                />
              </div>
            ))}
            <button
              onClick={addEntry}
              className="btn-lime"
              style={{ padding: '12px 20px', justifyContent: 'center' }}
            >
              Save Entry
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
            borderBottom: '1px solid var(--ft-rule)',
          }}
        >
          <p className="eyebrow">History</p>
        </div>

        {[...entries].reverse().map((entry, i) => {
          const isLatest = i === 0;
          return (
            <div
              key={entry.id}
              className="anim-up"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '32px',
                padding: '0 40px',
                height: '72px',
                borderBottom: '1px solid var(--ft-rule)',
                borderLeft: isLatest ? '3px solid var(--ft-lime)' : '3px solid transparent',
                background: isLatest ? 'var(--ft-lime-bg)' : 'transparent',
              }}
            >
              {/* Index */}
              <span className="data-val" style={{ fontSize: '11px', color: 'var(--ft-t3)', width: '24px', flexShrink: 0 }}>
                {String([...entries].length - i).padStart(2, '0')}
              </span>

              {/* Date */}
              <div style={{ minWidth: '120px' }}>
                <p className="data-val" style={{ fontSize: '13px', color: isLatest ? 'var(--ft-lime)' : 'var(--ft-t1)', fontWeight: 500 }}>
                  {new Date(entry.date).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
                {isLatest && (
                  <p style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-lime)', marginTop: '2px', opacity: 0.7 }}>
                    Latest
                  </p>
                )}
              </div>

              {/* Metrics */}
              {[
                { label: 'Weight',  value: `${entry.weight} KG` },
                { label: 'Body Fat', value: `${entry.bodyFat}%` },
                { label: 'Muscle',  value: `${entry.muscleMass}%` },
              ].map((stat) => (
                <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="eyebrow">{stat.label}</span>
                  <span className="data-val" style={{ fontSize: '14px', color: 'var(--ft-t1)', fontWeight: 600 }}>{stat.value}</span>
                </div>
              ))}

              {/* Notes */}
              {entry.notes && (
                <p style={{ flex: 1, fontSize: '12px', color: 'var(--ft-t3)', fontStyle: 'italic', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  &quot;{entry.notes}&quot;
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* ── AI Analysis ── */}
      <section
        className="anim-up d-300"
        style={{
          padding: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '32px',
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: '12px' }}>AI-Powered</p>
          <h2 className="d-md" style={{ marginBottom: '8px' }}>Progress Analysis</h2>
          <p style={{ fontSize: '13px', color: 'var(--ft-t2)', maxWidth: '480px' }}>
            AI insights into body composition trends, velocity projections, and personalized recommendations.
          </p>
        </div>
        <button
          className="btn-lime"
          style={{ padding: '16px 32px', fontSize: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <TrendingUp style={{ width: '14px', height: '14px' }} />
          View Analysis
        </button>
      </section>
    </div>
  );
}
