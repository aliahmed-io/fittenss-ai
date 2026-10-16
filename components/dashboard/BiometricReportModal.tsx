'use client';

import React from 'react';
import { X, Download, Printer, ShieldCheck } from 'lucide-react';
import type { AnthropometricMetrics } from '@/lib/bodyModel/anthropometry';
import type { NutritionTargets, Profile, GoalSettings } from '@/lib/fitness/types';

interface BiometricReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  metrics: AnthropometricMetrics;
  goal: GoalSettings;
  targets: NutritionTargets;
}

export default function BiometricReportModal({
  isOpen,
  onClose,
  profile,
  metrics,
  goal,
  targets,
}: BiometricReportModalProps) {
  if (!isOpen) return null;

  const timestamp = new Date().toISOString();
  const dateFormatted = new Date().toLocaleDateString('en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleDownloadJson = () => {
    const reportData = {
      generatedAt: timestamp,
      profile: {
        gender: profile.gender,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        bodyFatPct: profile.bodyFatPct,
        age: profile.age,
      },
      anthropometrics: {
        archetype: metrics.archetype,
        bmi: metrics.bmi,
        whr: metrics.whr,
        bwr: metrics.bwr,
        leanMassKg: metrics.leanMassKg,
        fatMassKg: metrics.fatMassKg,
        healthRisk: metrics.healthRisk,
        shapeDescription: metrics.shapeDescription,
      },
      goal: {
        type: goal.type,
        targetWeightKg: goal.targetWeightKg,
        targetBodyFatPct: goal.targetBodyFatPct,
        timelineWeeks: goal.timelineWeeks,
      },
      nutritionTargets: targets,
      morphParameters: profile.morphValues,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fit-transform-report-${profile.gender}-${timestamp.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div
        style={{
          width: '100%',
          maxWidth: '760px',
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
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid var(--ft-rule)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="eyebrow" style={{ color: 'var(--ft-lime)' }}>
                Official Dossier
              </span>
              <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>· {dateFormatted}</span>
            </div>
            <h2 id="report-modal-title" className="d-sm" style={{ margin: '4px 0 0', color: 'var(--ft-t1)' }}>
              Biometric & Anthropometric Assessment
            </h2>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '6px' }} aria-label="Close report">
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Executive Summary */}
          <div style={{ padding: '16px', background: 'var(--ft-surface)', border: '1px solid var(--ft-rule)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="eyebrow">Subject Silhouette Archetype</span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  background: 'var(--ft-lime-bg)',
                  color: 'var(--ft-lime)',
                  border: '1px solid rgba(203,255,0,0.3)',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                {metrics.archetype}
              </span>
            </div>
            <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--ft-t1)', margin: 0 }}>
              {metrics.shapeDescription}
            </p>
          </div>

          {/* Key Indicators Grid */}
          <div>
            <p className="eyebrow" style={{ marginBottom: '12px' }}>Anthropometric Metrics</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">Stature</span>
                <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)', marginTop: '4px' }}>
                  {profile.heightCm} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>CM</span>
                </p>
              </div>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">Weight</span>
                <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)', marginTop: '4px' }}>
                  {profile.weightKg} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>KG</span>
                </p>
              </div>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">Body Fat</span>
                <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-lime)', marginTop: '4px' }}>
                  {profile.bodyFatPct}%
                </p>
              </div>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">BMI Index</span>
                <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)', marginTop: '4px' }}>
                  {metrics.bmi}
                </p>
              </div>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">WHR (Waist/Hip)</span>
                <p
                  className="data-val"
                  style={{
                    fontSize: '16px',
                    color: metrics.healthRisk === 'low' ? 'var(--ft-lime)' : '#FFB020',
                    marginTop: '4px',
                  }}
                >
                  {metrics.whr.toFixed(2)}
                </p>
              </div>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">BWR (Bust/Waist)</span>
                <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)', marginTop: '4px' }}>
                  {metrics.bwr.toFixed(2)}
                </p>
              </div>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">Lean Mass</span>
                <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)', marginTop: '4px' }}>
                  {metrics.leanMassKg} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>KG</span>
                </p>
              </div>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">Fat Mass</span>
                <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)', marginTop: '4px' }}>
                  {metrics.fatMassKg} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>KG</span>
                </p>
              </div>
            </div>
          </div>

          {/* Caloric & Macronutrient Prescription */}
          <div>
            <p className="eyebrow" style={{ marginBottom: '12px' }}>Prescribed Targets (Katch-McArdle)</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">Daily Calories</span>
                <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-lime)', marginTop: '4px' }}>
                  {targets.calories} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>KCAL</span>
                </p>
              </div>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">Protein</span>
                <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)', marginTop: '4px' }}>
                  {targets.protein} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>G</span>
                </p>
              </div>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">Carbohydrates</span>
                <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)', marginTop: '4px' }}>
                  {targets.carbs} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>G</span>
                </p>
              </div>
              <div className="card-ft" style={{ padding: '12px' }}>
                <span className="eyebrow">Fats</span>
                <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)', marginTop: '4px' }}>
                  {targets.fat} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>G</span>
                </p>
              </div>
            </div>
          </div>

          {/* Provenance Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              paddingTop: '12px',
              borderTop: '1px solid var(--ft-rule)',
            }}
          >
            <ShieldCheck style={{ width: '13px', height: '13px', color: 'var(--ft-lime)' }} />
            <span style={{ fontSize: '10px', color: 'var(--ft-t3)' }}>
              Deterministic Anthropometric Engine · WHO Health Risk Baseline: {metrics.healthRisk.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Modal Actions */}
        <div
          style={{
            padding: '16px 28px',
            borderTop: '1px solid var(--ft-rule)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--ft-surface)',
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--ft-t3)' }}>
            FitTransform AI Engine · Non-Destructive 3D Pipeline
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handlePrint}
              className="btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '11px' }}
            >
              <Printer style={{ width: '13px', height: '13px' }} />
              Print
            </button>
            <button
              onClick={handleDownloadJson}
              className="btn-lime"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontSize: '11px' }}
            >
              <Download style={{ width: '13px', height: '13px' }} />
              Download JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
