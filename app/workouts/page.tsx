'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ArrowUpRight, Sparkles, Loader2, Trophy, Flame } from 'lucide-react';
import { WORKOUT_LIBRARY } from '@/lib/fitness/workoutLibrary';
import { useFitnessStore, fitnessActions } from '@/lib/store/fitnessStore';
import WorkoutSessionModal from '@/components/workout/WorkoutSessionModal';
import type { WorkoutPlan, WorkoutLog, CoachResponse } from '@/lib/fitness/types';
import { computeTargets, buildWorkoutPlan } from '@/lib/fitness/engine';

const diffLabel: Record<WorkoutPlan['difficulty'], { dot: string; text: string }> = {
  Beginner: { dot: 'var(--ft-lime)', text: 'Beginner' },
  Intermediate: { dot: '#FFCC00', text: 'Intermediate' },
  Advanced: { dot: '#FF4444', text: 'Advanced' },
};

export default function WorkoutsPage() {
  const router = useRouter();
  const store = useFitnessStore();
  const { profile, goal, customPlans, workoutLogs, progressEntries } = store;

  const [selected, setSelected] = useState<WorkoutPlan | null>(null);
  const [filter, setFilter] = useState<string>('All');
  const [sessionPlan, setSessionPlan] = useState<WorkoutPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [planMessage, setPlanMessage] = useState('');
  const [lastFinishedLog, setLastFinishedLog] = useState<WorkoutLog | null>(null);

  // Combine curated library + custom AI plans
  const allPlans: readonly WorkoutPlan[] = [...customPlans, ...WORKOUT_LIBRARY];

  const filters = ['All', 'Beginner', 'Intermediate', 'Advanced', 'Custom'];
  const filtered = filter === 'All'
    ? allPlans
    : filter === 'Custom'
    ? allPlans.filter((w) => w.source === 'ai' || w.source === 'engine')
    : allPlans.filter((w) => w.difficulty === filter);

  const handleGenerateCustomPlan = async () => {
    setIsGenerating(true);
    try {
      const targets = computeTargets(profile, goal);
      const res = await fetch('/api/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'workout-plan',
          profile,
          goal,
          targets,
          message: '',
          entries: progressEntries,
          streak: 0,
        }),
      });

      if (!res.ok) throw new Error('Plan service unavailable');
      if (res.ok) {
        const data = (await res.json()) as CoachResponse;
        if (!data.plan) throw new Error('No plan returned');
        setPlanMessage(data.provenance.source === 'gemini' ? 'Your AI workout is ready. Review the exercises below.' : 'Your workout is ready from the built-in planner. AI is currently unavailable.');
        if (data.plan) {
          fitnessActions.addCustomPlan(data.plan);
          setSelected(data.plan);
          setFilter('Custom');
        }
      }
    } catch {
      const plan = buildWorkoutPlan(profile, goal, `local-${Date.now()}`);
      fitnessActions.addCustomPlan(plan);
      setSelected(plan);
      setFilter('Custom');
      setPlanMessage('Your workout is ready from the built-in planner. AI is currently unavailable.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSessionFinished = (log: WorkoutLog) => {
    setLastFinishedLog(log);
    setSessionPlan(null);
  };

  return (
    <div>
      {/* ── Completion Toast Banner ── */}
      {lastFinishedLog && (
        <div
          className="anim-in"
          style={{
            padding: '14px 40px',
            background: 'rgba(203, 255, 0, 0.12)',
            borderBottom: '1px solid var(--ft-lime)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Trophy style={{ width: '16px', height: '16px', color: 'var(--ft-lime)' }} />
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ft-t1)', margin: 0 }}>
                Workout Completed: {lastFinishedLog.planName}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--ft-t3)', margin: '2px 0 0' }}>
                {Math.round(lastFinishedLog.durationSec / 60)} minutes · {lastFinishedLog.calories} kcal burned · 3D Strain Heatmap updated
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => router.push('/')}
              className="btn-lime"
              style={{ padding: '6px 14px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Flame style={{ width: '11px', height: '11px' }} />
              View 3D Strain Map
            </button>
            <button
              onClick={() => setLastFinishedLog(null)}
              className="btn-ghost"
              style={{ padding: '6px 10px', fontSize: '10px' }}
            >
              Dismiss
            </button>
          </div>
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
          <p className="eyebrow" style={{ marginBottom: '12px' }}>Training Library</p>
          <h1 className="d-lg" style={{ color: 'var(--ft-t1)' }}>
            Workout Plans
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--ft-t2)', marginTop: '8px' }}>
            {allPlans.length} plans available · {customPlans.length} personal plans based on your goals
          </p>
        </div>

        {/* Stats */}
        <div className="ft-workout-summary" style={{ display: 'flex', gap: '32px', paddingBottom: '4px' }}>
          {[
            { label: 'Available Plans', value: String(allPlans.length) },
            { label: 'Logged Sessions', value: String(workoutLogs.length) },
            { label: 'Avg Duration', value: workoutLogs.length ? `${Math.round(workoutLogs.reduce((sum, log) => sum + log.durationSec, 0) / workoutLogs.length / 60)} MIN` : '—' },
          ].map((s, i) => (
            <div key={s.label} style={{ textAlign: 'right' }}>
              <p
                className="d-sm data-val"
                style={{ color: i === 0 ? 'var(--ft-lime)' : 'var(--ft-t1)' }}
              >
                {s.value}
              </p>
              <p className="eyebrow" style={{ marginTop: '4px' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {planMessage && <p role="status" className="ft-feedback" style={{ padding: '12px 40px' }}>{planMessage}</p>}
      {/* ── Filter ── */}
      <section
        className="anim-up d-50"
        style={{
          padding: '0 40px',
          borderBottom: '1px solid var(--ft-rule)',
          display: 'flex',
          alignItems: 'stretch',
          overflowX: 'auto',
        }}
      >
        <label className="ft-workout-filter">Show workouts<select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter workouts">{filters.map(f => <option value={f} key={f}>{f === 'All' ? 'All levels' : f === 'Custom' ? 'My plans' : f}</option>)}</select></label>
      </section>

      {/* ── Workout List ── */}
      <section className="anim-up d-100">
        {filtered.map((workout, i) => {
          const isSelected = selected?.id === workout.id;
          const diff = diffLabel[workout.difficulty];
          const isCustom = workout.source === 'ai' || workout.source === 'engine';

          return (
            <div key={workout.id}>
              {/* Row */}
              <button
                className="ft-workout-row"
                onClick={() => setSelected(isSelected ? null : workout)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 40px',
                  height: '80px',
                  gap: '24px',
                  background: isSelected ? 'var(--ft-lime-bg)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--ft-rule)',
                  borderLeft: isSelected ? '3px solid var(--ft-lime)' : '3px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}
                aria-expanded={isSelected}
              >
                {/* Number */}
                <span
                  className="data-val"
                  style={{ fontSize: '11px', color: 'var(--ft-t3)', width: '24px', flexShrink: 0 }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>

                {/* Name + desc */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <p
                      style={{
                        fontFamily: '"Barlow Condensed", sans-serif',
                        fontWeight: 700,
                        fontSize: '20px',
                        textTransform: 'uppercase',
                        letterSpacing: '-0.01em',
                        color: isSelected ? 'var(--ft-lime)' : 'var(--ft-t1)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        margin: 0,
                      }}
                    >
                      {workout.name}
                    </p>
                    {isCustom && (
                      <span
                        style={{
                          fontSize: '8px',
                          padding: '2px 6px',
                          background: 'rgba(203,255,0,0.12)',
                          color: 'var(--ft-lime)',
                          border: '1px solid rgba(203,255,0,0.3)',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}
                      >
                        AI Tailored
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--ft-t3)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {workout.description}
                  </p>
                </div>

                {/* Meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexShrink: 0 }}>
                  <span className="data-val" style={{ fontSize: '12px', color: 'var(--ft-t2)' }}>
                    {workout.durationMin} MIN
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '10px',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'var(--ft-t2)',
                    }}
                  >
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        background: diff.dot,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    />
                    {diff.text}
                  </span>
                  <span className="data-val" style={{ fontSize: '12px', color: 'var(--ft-t3)' }}>
                    {workout.calories} KCAL
                  </span>
                  <ChevronRight
                    style={{
                      width: '16px',
                      height: '16px',
                      color: isSelected ? 'var(--ft-lime)' : 'var(--ft-t3)',
                      transform: isSelected ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </div>
              </button>

              {/* Expanded detail */}
              {isSelected && (
                <div
                  className="anim-in"
                  style={{
                    borderBottom: '1px solid var(--ft-rule)',
                    borderLeft: '3px solid var(--ft-lime)',
                    background: 'var(--ft-surface)',
                    padding: '32px 40px 32px 67px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '48px',
                  }}
                >
                  {/* Exercise list */}
                  <div>
                    <p className="eyebrow" style={{ marginBottom: '16px' }}>Exercises & Sets</p>
                    {workout.exercises.map((ex, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 0',
                          borderBottom: '1px solid var(--ft-rule)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <span
                            className="data-val"
                            style={{ fontSize: '10px', color: 'var(--ft-t3)', width: '20px' }}
                          >
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span style={{ fontSize: '14px', color: 'var(--ft-t1)', fontWeight: 500 }}>
                            {ex.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <span className="data-val" style={{ fontSize: '12px', color: 'var(--ft-lime)' }}>
                            {ex.sets} × {ex.reps}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--ft-t3)' }}>
                            {ex.restSec}s rest
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Details + CTA */}
                  <div>
                    <p className="eyebrow" style={{ marginBottom: '16px' }}>Session details</p>
                    {[
                      { label: 'Duration', value: `${workout.durationMin} MIN` },
                      { label: 'Difficulty', value: workout.difficulty },
                      { label: 'Estimated Caloric Burn', value: `${workout.calories} KCAL` },
                      { label: 'Targeted Muscle Groups', value: workout.muscles.join(', ') },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 0',
                          borderBottom: '1px solid var(--ft-rule)',
                        }}
                      >
                        <p className="eyebrow">{item.label}</p>
                        <p className="data-val" style={{ fontSize: '13px', color: 'var(--ft-t1)', textTransform: 'capitalize' }}>
                          {item.value}
                        </p>
                      </div>
                    ))}

                    <button
                      onClick={() => setSessionPlan(workout)}
                      className="btn-lime"
                      style={{
                        padding: '14px 24px',
                        marginTop: '24px',
                        width: '100%',
                        justifyContent: 'center',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>Start workout</span>
                      <ArrowUpRight style={{ width: '13px', height: '13px' }} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ── AI Generate Section ── */}
      <section
        className="anim-up d-200"
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
          <p className="eyebrow" style={{ marginBottom: '12px' }}>Personal workout</p>
          <h2 className="d-md" style={{ color: 'var(--ft-t1)', marginBottom: '8px' }}>
            Generate Custom Plan
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--ft-t2)', maxWidth: '480px' }}>
            Our sports-science engine analyzes your 3D silhouette, WHR ratio, and fitness targets to formulate a tailored training split.
          </p>
        </div>
        <button
          onClick={handleGenerateCustomPlan}
          disabled={isGenerating}
          className="btn-lime"
          style={{
            padding: '16px 32px',
            fontSize: '12px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: isGenerating ? 'wait' : 'pointer',
          }}
        >
          {isGenerating ? (
            <>
              <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
              <span>Creating your workout...</span>
            </>
          ) : (
            <>
              <Sparkles style={{ width: '14px', height: '14px' }} />
              <span>Generate Plan</span>
              <ArrowUpRight style={{ width: '13px', height: '13px' }} />
            </>
          )}
        </button>
      </section>

      {/* Interactive Workout Session Player Modal */}
      {sessionPlan && (
        <WorkoutSessionModal
          plan={sessionPlan}
          isOpen={Boolean(sessionPlan)}
          onClose={() => setSessionPlan(null)}
          onFinished={handleSessionFinished}
        />
      )}
    </div>
  );
}
