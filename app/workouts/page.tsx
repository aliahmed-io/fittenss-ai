'use client';

import React, { useState } from 'react';
import { ChevronRight, ArrowUpRight, Sparkles } from 'lucide-react';

interface Workout {
  id: number;
  name: string;
  description: string;
  duration: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  exercises: string[];
  muscles: string[];
  calories: number;
}

const workouts: Workout[] = [
  {
    id: 1,
    name: 'Full Body Strength',
    description: 'Compound movements targeting all major muscle groups for maximum hormonal response.',
    duration: '45 MIN',
    difficulty: 'Intermediate',
    exercises: ['Barbell Squats', 'Push-ups', 'Bent-over Rows', 'Plank Hold', 'Walking Lunges'],
    muscles: ['Quads', 'Chest', 'Back', 'Core'],
    calories: 380,
  },
  {
    id: 2,
    name: 'Upper Body Focus',
    description: 'Progressive overload protocol for chest, back, and arms hypertrophy.',
    duration: '35 MIN',
    difficulty: 'Beginner',
    exercises: ['Bench Press', 'Pull-ups', 'Shoulder Press', 'Bicep Curls', 'Tricep Extensions'],
    muscles: ['Chest', 'Lats', 'Shoulders', 'Arms'],
    calories: 290,
  },
  {
    id: 3,
    name: 'Lower Body & Core',
    description: 'Posterior chain and core stability through deadlift and hinge patterns.',
    duration: '40 MIN',
    difficulty: 'Advanced',
    exercises: ['Romanian Deadlifts', 'Leg Press', 'Calf Raises', 'Russian Twists', 'Leg Curls'],
    muscles: ['Hamstrings', 'Glutes', 'Calves', 'Core'],
    calories: 340,
  },
  {
    id: 4,
    name: 'HIIT Cardio Blast',
    description: 'High-intensity intervals to maximize caloric burn and cardiovascular output.',
    duration: '25 MIN',
    difficulty: 'Advanced',
    exercises: ['Burpees', 'Mountain Climbers', 'Jump Squats', 'High Knees', 'Box Jumps'],
    muscles: ['Full Body', 'Cardiovascular'],
    calories: 420,
  },
  {
    id: 5,
    name: 'Mobility & Recovery',
    description: 'Active recovery through joint mobilization, flexibility, and nervous system restoration.',
    duration: '30 MIN',
    difficulty: 'Beginner',
    exercises: ['Hip Circles', 'Cat-Cow Stretch', 'Pigeon Pose', 'Shoulder Rolls', 'Foam Rolling'],
    muscles: ['Hips', 'Spine', 'Shoulders'],
    calories: 120,
  },
  {
    id: 6,
    name: 'Push Day',
    description: 'Anterior chain development with dedicated push pattern training.',
    duration: '50 MIN',
    difficulty: 'Intermediate',
    exercises: ['Incline Bench Press', 'Dumbbell Flyes', 'Lateral Raises', 'Overhead Press', 'Tricep Dips'],
    muscles: ['Chest', 'Shoulders', 'Triceps'],
    calories: 310,
  },
];

const diffLabel: Record<Workout['difficulty'], { dot: string; text: string }> = {
  Beginner:     { dot: 'var(--ft-lime)',    text: 'Beginner' },
  Intermediate: { dot: '#FFCC00',           text: 'Intermediate' },
  Advanced:     { dot: '#FF4444',           text: 'Advanced' },
};

export default function WorkoutsPage() {
  const [selected, setSelected] = useState<Workout | null>(null);
  const [filter, setFilter] = useState<string>('All');

  const filters = ['All', 'Beginner', 'Intermediate', 'Advanced'];
  const filtered = filter === 'All' ? workouts : workouts.filter((w) => w.difficulty === filter);

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
          <p className="eyebrow" style={{ marginBottom: '12px' }}>Training Library</p>
          <h1 className="d-lg" style={{ color: 'var(--ft-t1)' }}>
            Workout Plans
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--ft-t2)', marginTop: '8px' }}>
            {workouts.length} plans · AI-tailored to your body scan
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '32px', paddingBottom: '4px' }}>
          {[
            { label: 'Plans', value: String(workouts.length) },
            { label: 'Avg Duration', value: '37 MIN' },
            { label: 'Calorie Range', value: '120–420' },
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

      {/* ── Filter ── */}
      <section
        className="anim-up d-50"
        style={{
          padding: '0 40px',
          borderBottom: '1px solid var(--ft-rule)',
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        {filters.map((f) => {
          const isActive = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '14px 24px',
                fontSize: '10px',
                fontWeight: 500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--ft-lime)' : '2px solid transparent',
                color: isActive ? 'var(--ft-t1)' : 'var(--ft-t3)',
                cursor: 'pointer',
                transition: 'color 0.15s ease, border-color 0.15s ease',
                marginBottom: '-1px',
              }}
            >
              {f}
            </button>
          );
        })}
      </section>

      {/* ── Workout List ── */}
      <section className="anim-up d-100">
        {filtered.map((workout, i) => {
          const isSelected = selected?.id === workout.id;
          const diff = diffLabel[workout.difficulty];
          return (
            <div key={workout.id}>
              {/* Row */}
              <button
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
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                    (e.currentTarget as HTMLElement).style.borderLeftColor = 'rgba(255,255,255,0.15)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.borderLeftColor = 'transparent';
                  }
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
                    }}
                  >
                    {workout.name}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--ft-t3)', marginTop: '2px' }}>
                    {workout.description}
                  </p>
                </div>

                {/* Meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexShrink: 0 }}>
                  <span className="data-val" style={{ fontSize: '12px', color: 'var(--ft-t2)' }}>
                    {workout.duration}
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
                    <p className="eyebrow" style={{ marginBottom: '16px' }}>Exercises</p>
                    {workout.exercises.map((ex, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          padding: '12px 0',
                          borderBottom: '1px solid var(--ft-rule)',
                        }}
                      >
                        <span
                          className="data-val"
                          style={{ fontSize: '10px', color: 'var(--ft-t3)', width: '20px' }}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span style={{ fontSize: '14px', color: 'var(--ft-t1)' }}>{ex}</span>
                      </div>
                    ))}
                  </div>

                  {/* Details + CTA */}
                  <div>
                    <p className="eyebrow" style={{ marginBottom: '16px' }}>Details</p>
                    {[
                      { label: 'Duration',   value: workout.duration },
                      { label: 'Difficulty', value: workout.difficulty },
                      { label: 'Calories',   value: `${workout.calories} KCAL` },
                      { label: 'Muscles',    value: workout.muscles.join(', ') },
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
                        <p className="data-val" style={{ fontSize: '13px', color: 'var(--ft-t1)' }}>{item.value}</p>
                      </div>
                    ))}

                    <button
                      className="btn-lime"
                      style={{ padding: '14px 24px', marginTop: '24px', width: '100%', justifyContent: 'center', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <span>Start Workout</span>
                      <ArrowUpRight style={{ width: '13px', height: '13px' }} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ── AI Generate ── */}
      <section
        className="anim-up d-200"
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
          <h2 className="d-md" style={{ color: 'var(--ft-t1)', marginBottom: '8px' }}>
            Generate Custom Plan
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--ft-t2)', maxWidth: '480px' }}>
            Our AI analyzes your 3D body scan, fitness level, and goals to generate a precision
            workout plan unique to your physique.
          </p>
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
    </div>
  );
}
