'use client';

import { useDialogFocus } from '@/lib/hooks/useDialogFocus';
import React, { useState, useEffect } from 'react';
import { X, Play, Pause, CheckCircle2, Flame, Trophy, ArrowRight } from 'lucide-react';
import type { WorkoutPlan, WorkoutLog } from '@/lib/fitness/types';
import { fitnessActions } from '@/lib/store/fitnessStore';

interface WorkoutSessionModalProps {
  plan: WorkoutPlan;
  isOpen: boolean;
  onClose: () => void;
  onFinished: (log: WorkoutLog) => void;
}

export default function WorkoutSessionModal({
  plan,
  isOpen,
  onClose,
  onFinished,
}: WorkoutSessionModalProps) {
  // Overall elapsed time in seconds
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isActive, setIsActive] = useState(true);

  // Set completion tracker: key = `${exerciseIdx}-${setIdx}`
  const [completedSets, setCompletedSets] = useState<Set<string>>(new Set());

  // Rest timer
  const [restRemaining, setRestRemaining] = useState<number | null>(null);

  // Elapsed workout timer tick
  useEffect(() => {
    if (!isOpen || !isActive) return;
    const interval = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isActive]);

  // Rest countdown tick
  useEffect(() => {
    if (restRemaining === null || restRemaining <= 0) return;
    const interval = setInterval(() => {
      setRestRemaining((prev) => (prev !== null && prev > 1 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [restRemaining]);

  const dialogRef = useDialogFocus(isOpen, onClose);

  if (!isOpen) return null;

  // Format mm:ss
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Total sets in the workout
  const totalSets = plan.exercises.reduce((acc, ex) => acc + ex.sets, 0);

  const toggleSet = (exIdx: number, setIdx: number, restSec: number) => {
    const key = `${exIdx}-${setIdx}`;
    const wasCompleted = completedSets.has(key);
    setCompletedSets(prev => {
      const next = new Set(prev);
      if (wasCompleted) next.delete(key); else next.add(key);
      return next;
    });
    if (!wasCompleted) setRestRemaining(restSec > 0 ? restSec : 60);
  };

  const handleComplete = () => {
    if (completedSets.size === 0) return;
    const log = fitnessActions.completeWorkout({
      planId: plan.id,
      planName: plan.name,
      durationSec: elapsedSec,
      calories: Math.round((plan.calories * elapsedSec) / Math.max(plan.durationMin * 60, 1)),
      muscles: plan.muscles,
      setsCompleted: completedSets.size,
      setsTotal: totalSets,
    });
    onFinished(log);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      ref={dialogRef as React.RefObject<HTMLDivElement>}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-title"
    >
      <div
        style={{
          width: '100%',
          maxWidth: '820px',
          background: 'var(--ft-void)',
          border: '1px solid var(--ft-rule)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.9)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
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
            background: 'var(--ft-surface)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="eyebrow" style={{ color: 'var(--ft-lime)' }}>Active Training Session</span>
              <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>· {plan.difficulty}</span>
            </div>
            <h2 id="session-title" className="d-sm" style={{ margin: '4px 0 0', color: 'var(--ft-t1)' }}>
              {plan.name}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Workout Stopwatch */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--ft-rule)',
              }}
            >
              <button
                onClick={() => setIsActive(!isActive)}
                style={{ background: 'none', border: 'none', color: 'var(--ft-lime)', cursor: 'pointer', padding: 0 }}
                aria-label={isActive ? 'Pause' : 'Play'}
              >
                {isActive ? <Pause style={{ width: '14px', height: '14px' }} /> : <Play style={{ width: '14px', height: '14px' }} />}
              </button>
              <span className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)', minWidth: '48px' }}>
                {formatTime(elapsedSec)}
              </span>
            </div>

            <button onClick={onClose} className="btn-ghost" style={{ padding: '6px' }} aria-label="Close session">
              <X style={{ width: '18px', height: '18px' }} />
            </button>
          </div>
        </div>

        {/* Rest Timer Banner (Floating when active) */}
        {restRemaining !== null && (
          <div
            style={{
              padding: '12px 28px',
              background: 'rgba(203, 255, 0, 0.1)',
              borderBottom: '1px solid rgba(203, 255, 0, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flame style={{ width: '14px', height: '14px', color: 'var(--ft-lime)' }} />
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ft-t1)' }}>
                Rest Interval: <strong style={{ color: 'var(--ft-lime)', fontSize: '14px', fontFamily: 'monospace' }}>{restRemaining}s</strong> remaining
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setRestRemaining((prev) => (prev ?? 0) + 30)}
                className="btn-ghost"
                style={{ padding: '3px 8px', fontSize: '9px' }}
              >
                +30s
              </button>
              <button
                onClick={() => setRestRemaining(null)}
                className="btn-lime"
                style={{ padding: '3px 10px', fontSize: '9px' }}
              >
                Skip Rest
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Exercise Checklist */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="eyebrow">Exercises ({plan.exercises.length} Movements)</p>
            <span className="data-val" style={{ fontSize: '11px', color: 'var(--ft-lime)' }}>
              {completedSets.size} / {totalSets} Sets Completed
            </span>
          </div>

          {plan.exercises.map((ex, exIdx) => {
            const exSetsDone = Array.from({ length: ex.sets }).filter((_, sIdx) =>
              completedSets.has(`${exIdx}-${sIdx}`)
            ).length;
            const isComplete = exSetsDone === ex.sets;

            return (
              <div
                key={exIdx}
                style={{
                  padding: '16px 20px',
                  background: isComplete ? 'rgba(203, 255, 0, 0.03)' : 'var(--ft-surface)',
                  border: `1px solid ${isComplete ? 'rgba(203, 255, 0, 0.3)' : 'var(--ft-rule)'}`,
                  borderLeft: `3px solid ${isComplete ? 'var(--ft-lime)' : 'var(--ft-rule)'}`,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '10px', color: 'var(--ft-t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Exercise {exIdx + 1}
                    </span>
                    <h3 style={{ fontSize: '16px', color: 'var(--ft-t1)', margin: '2px 0 0', fontWeight: 600 }}>
                      {ex.name}
                    </h3>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="data-val" style={{ fontSize: '12px', color: 'var(--ft-lime)' }}>
                      {ex.reps} reps
                    </span>
                    <p style={{ fontSize: '10px', color: 'var(--ft-t3)', margin: '2px 0 0' }}>
                      {ex.restSec}s rest
                    </p>
                  </div>
                </div>

                {/* Sets Checkable Chips */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Array.from({ length: ex.sets }).map((_, sIdx) => {
                    const key = `${exIdx}-${sIdx}`;
                    const done = completedSets.has(key);
                    return (
                      <button
                        key={sIdx}
                        onClick={() => toggleSet(exIdx, sIdx, ex.restSec)}
                        style={{
                          padding: '6px 12px',
                          background: done ? 'var(--ft-lime)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${done ? 'var(--ft-lime)' : 'var(--ft-rule)'}`,
                          color: done ? '#090909' : 'var(--ft-t2)',
                          fontWeight: done ? 700 : 500,
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.1s ease',
                        }}
                      >
                        <CheckCircle2 style={{ width: '12px', height: '12px', opacity: done ? 1 : 0.4 }} />
                        <span>Set {sIdx + 1}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trophy style={{ width: '14px', height: '14px', color: 'var(--ft-lime)' }} />
            <span style={{ fontSize: '11px', color: 'var(--ft-t3)' }}>
              {completedSets.size === 0 ? 'Mark a set complete to save this session.' : 'Your progress will be saved when you finish.'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={onClose} className="btn-ghost" style={{ padding: '10px 18px', fontSize: '11px' }}>
              Cancel
            </button>
            <button
              onClick={handleComplete}
              disabled={completedSets.size === 0}
              title={completedSets.size === 0 ? 'Complete at least one set to save your workout' : 'Save this workout'}
              className="btn-lime"
              style={{
                padding: '10px 22px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>Finish Workout</span>
              <ArrowRight style={{ width: '13px', height: '13px' }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
