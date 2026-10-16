'use client';

import React from 'react';
import { Target, TrendingDown, TrendingUp, Sparkles } from 'lucide-react';
import type { GoalProjection } from '@/lib/fitness/engine';

interface GoalPhysiqueToggleProps {
  isGoalPreview: boolean;
  onToggle: (previewGoal: boolean) => void;
  projection: GoalProjection;
  currentWeightKg: number;
}

export default function GoalPhysiqueToggle({
  isGoalPreview,
  onToggle,
  projection,
  currentWeightKg,
}: GoalPhysiqueToggleProps) {
  const weightDelta = +(projection.weightKg - currentWeightKg).toFixed(1);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: isGoalPreview ? 'rgba(203, 255, 0, 0.08)' : 'var(--ft-surface)',
        border: `1px solid ${isGoalPreview ? 'var(--ft-lime)' : 'var(--ft-rule)'}`,
        transition: 'all 0.2s ease',
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => onToggle(false)}
          className={!isGoalPreview ? 'btn-lime' : 'btn-ghost'}
          style={{ padding: '4px 10px', fontSize: '9px', textTransform: 'uppercase' }}
          aria-pressed={!isGoalPreview}
        >
          Current
        </button>
        <button
          onClick={() => onToggle(true)}
          className={isGoalPreview ? 'btn-lime' : 'btn-ghost'}
          style={{
            padding: '4px 10px',
            fontSize: '9px',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          aria-pressed={isGoalPreview}
        >
          <Sparkles style={{ width: '10px', height: '10px' }} />
          Goal Morph
        </button>
      </div>

      {/* Delta Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Target style={{ width: '11px', height: '11px', color: 'var(--ft-lime)' }} />
          <span style={{ fontSize: '10px', color: 'var(--ft-t2)' }}>
            Target: <strong style={{ color: 'var(--ft-t1)' }}>{projection.weightKg} kg</strong>
          </span>
          <span
            style={{
              fontSize: '9px',
              fontFamily: 'monospace',
              color: weightDelta <= 0 ? 'var(--ft-lime)' : '#FFB020',
            }}
          >
            ({weightDelta > 0 ? `+${weightDelta}` : weightDelta} kg)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--ft-t3)' }}>Fat</span>
          <span
            style={{
              fontSize: '10px',
              color: projection.fatMassDeltaKg <= 0 ? 'var(--ft-lime)' : '#FF4444',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {projection.fatMassDeltaKg <= 0 ? (
              <TrendingDown style={{ width: '10px', height: '10px', marginRight: '2px' }} />
            ) : (
              <TrendingUp style={{ width: '10px', height: '10px', marginRight: '2px' }} />
            )}
            {projection.fatMassDeltaKg > 0 ? `+${projection.fatMassDeltaKg}` : projection.fatMassDeltaKg} kg
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--ft-t3)' }}>Muscle</span>
          <span
            style={{
              fontSize: '10px',
              color: projection.leanMassDeltaKg >= 0 ? 'var(--ft-lime)' : 'var(--ft-t2)',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {projection.leanMassDeltaKg >= 0 && (
              <TrendingUp style={{ width: '10px', height: '10px', marginRight: '2px' }} />
            )}
            {projection.leanMassDeltaKg > 0 ? `+${projection.leanMassDeltaKg}` : projection.leanMassDeltaKg} kg
          </span>
        </div>
      </div>
    </div>
  );
}
