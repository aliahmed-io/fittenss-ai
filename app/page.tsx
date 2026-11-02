'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CurrentWeightDialog from '@/components/dashboard/CurrentWeightDialog';
import BodyVisualizer, { CameraViewPreset } from '@/components/BodyVisualizer';
import {
  calculateMetrics,
  generateSmartMeasurements,
  FEMALE_PRESETS,
  MALE_PRESETS,
  Gender,
} from '@/lib/bodyModel/anthropometry';
import PhotoScanModal from '@/components/PhotoScanModal';
import BiometricReportModal from '@/components/dashboard/BiometricReportModal';
import GoalPhysiqueToggle from '@/components/dashboard/GoalPhysiqueToggle';
import AiCoachPanel from '@/components/dashboard/AiCoachPanel';
import { useFitnessStore, fitnessActions } from '@/lib/store/fitnessStore';
import {
  buildWorkoutPlan,
  computeTargets,
  projectGoalPhysique,
  goalProgressFraction,
  weeklyActivity,
  weeklyTotals,
  computeStreak,
  toDateKey,
  type GoalProjection,
} from '@/lib/fitness/engine';
import type { CoachResponse, GoalType } from '@/lib/fitness/types';
import {
  Sparkles,
  RotateCcw,
  Flame,
  Check,
  ArrowUpRight,
  Loader2,
  FileText,
} from 'lucide-react';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('scan') === '1') setIsPhotoScanOpen(true);
    const openScan = () => setIsPhotoScanOpen(true);
    window.addEventListener('fitness:open-scan', openScan);
    return () => window.removeEventListener('fitness:open-scan', openScan);
  }, []);
  const store = useFitnessStore();
  const { profile, goal, workoutLogs, progressEntries } = store;
  const gender = profile.gender;

  const [cameraView, setCameraView] = useState<CameraViewPreset>('full');
  const [isWeightEditorOpen, setIsWeightEditorOpen] = useState(false);
  const [isPhotoScanOpen, setIsPhotoScanOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isGoalPreview, setIsGoalPreview] = useState<boolean>(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState<boolean>(false);
  const [goalError, setGoalError] = useState('');

  // Targets and goal projection
  const targets = useMemo(() => computeTargets(profile, goal), [profile, goal]);
  const projection: GoalProjection = useMemo(() => projectGoalPhysique(profile, goal), [profile, goal]);

  // Visualizer morphs & fat based on preview toggle
  const visualizerMorphs = isGoalPreview ? projection.morphValues : profile.morphValues;
  const visualizerBodyFat = isGoalPreview ? projection.bodyFatPct : profile.bodyFatPct;

  // Streak & week activity
  const streak = useMemo(() => computeStreak(workoutLogs, toDateKey(new Date())), [workoutLogs]);
  const weekDays = useMemo(() => weeklyActivity(workoutLogs, new Date()), [workoutLogs]);
  const weekStats = useMemo(() => weeklyTotals(workoutLogs, new Date()), [workoutLogs]);

  // Live anthropometric metrics
  const metrics = useMemo(() => {
    return calculateMetrics(
      gender,
      profile.heightCm,
      profile.weightKg,
      profile.bodyFatPct,
      profile.morphValues
    );
  }, [gender, profile]);

  const activePresets = gender === 'female' ? FEMALE_PRESETS : MALE_PRESETS;

  // Smart Sync
  const applySmartSync = () => {
    const smart = generateSmartMeasurements(gender, profile.heightCm, profile.weightKg, profile.bodyFatPct);
    fitnessActions.setMorphValues(smart);
  };

  const applyPreset = (presetId: string) => {
    const preset = activePresets.find((p) => p.id === presetId);
    if (preset) {
      fitnessActions.setProfile({ heightCm: preset.measurements.Height ?? profile.heightCm, morphValues: { ...preset.measurements, Muscle: profile.morphValues.Muscle ?? 50 } });
    }
  };

  const handleSliderChange = (name: string, value: number) => {
    fitnessActions.setMorphValues({ [name]: value });
    if (name === 'Height') {
      fitnessActions.setProfile({ heightCm: Math.round(value) });
    }
  };

  const handleGenderChange = (newGender: Gender) => {
    fitnessActions.setGender(newGender);
  };

  const handleGeneratePlan = async () => {
    setIsGeneratingPlan(true);
    try {
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
          streak,
        }),
      });
      if (!res.ok) throw new Error('Plan service unavailable');
      if (res.ok) {
        const data = (await res.json()) as CoachResponse;
        if (!data.plan) throw new Error('No plan returned');
        if (data.plan) {
          fitnessActions.addCustomPlan(data.plan);
        }
      }
    } catch {
      fitnessActions.addCustomPlan(buildWorkoutPlan(profile, goal, `local-${Date.now()}`));
    } finally {
      setIsGeneratingPlan(false);
      router.push('/workouts');
    }
  };

  const morphLabels: Record<string, string> = {
    Height: 'Height Scale',
    Muscle: 'Muscle definition',
    Chest: gender === 'male' ? 'Chest / Pectorals' : 'Chest Girth',
    Neck: 'Neck Girth',
    'Neck Height': 'Neck Length',
    Shoulders: gender === 'male' ? 'Shoulder Breadth (Deltoids)' : 'Shoulder Breadth',
    "Shoulder's Slope": 'Shoulder Slope',
    'Shoulder Angle': 'Shoulder Angle',
    Breast: 'Breast Volume & Projection',
    'Bust Girth': gender === 'male' ? 'Ribcage / Lat Width' : 'Bust Circumference',
    'Stomach Form': gender === 'male' ? 'Abdominal Definition / Fat' : 'Abdomen / Lower Fat',
    Waist: gender === 'male' ? 'Waist (V-Taper)' : 'Waist (Hourglass)',
    'Arm Length': 'Arm Length',
    'Upper Arm Girth': gender === 'male' ? 'Bicep / Tricep Girth' : 'Upper Arm (Bicep/Tricep)',
    Wrist: 'Wrist Girth',
    'Hip Girth': gender === 'male' ? 'Pelvic / Glute Girth' : 'Hip & Glute Girth',
    'Hip Height': 'Hip Height',
    'Thigh Girth': gender === 'male' ? 'Thigh Girth (Quads)' : 'Thigh Girth',
    'Calf Girth': 'Calf Girth',
    'lower Leg': 'Lower Leg Length',
    'Lower Leg Length': 'Lower Leg Length',
    Calf: 'Calf Girth',
  };

  const getMorphRange = (name: string) => {
    if (name === 'Muscle') return { min: 0, max: 100, default: 50 };
    if (gender === 'female') {
      const fc = {
        morphs: ['Height','Neck Height','Neck','Shoulders','Shoulder Angle','Breast','Bust Girth','Arm Length','Upper Arm Girth','Wrist','Stomach Form','Waist','Hip Girth','Hip Height','Thigh Girth','Calf Girth','lower Leg'],
        morphslowlimit: [110,5,27,12,0,70,56,16,22,9,0,65,86,72,49,26,39],
        morphshighlimit: [210,9,35,16,2,100,76,27,32,18,2,85,114,92,66,44,53],
        morphslimit: [165,7,31,14,1,85,66,23,27,14,1,75,100,82,58,36,45],
      };
      const i = fc.morphs.indexOf(name);
      if (i !== -1) return { min: fc.morphslowlimit[i]!, max: fc.morphshighlimit[i]!, default: fc.morphslimit[i]! };
    }
    const mc = {
      morphs: ['Height','Chest','Neck','Neck Height','Shoulders',"Shoulder's Slope",'Bust Girth','Stomach Form','Waist','Arm Length','Upper Arm Girth','Wrist','Hip Girth','Hip Height','Thigh Girth','Lower Leg Length','Calf'],
      morphslowlimit: [120,80,32,9.36,11.5,0,78,0,65,21,22,12,82,29,44,29,30],
      morphshighlimit: [220,130,42,16,17,2,98,2,105,32,42,20,118,46,72,46,48],
      morphslimit: [178,98,37,12.36,14.2,1,86,0.8,78,26,31,16,96,36,56,38,37.5],
    };
    const i = mc.morphs.indexOf(name);
    if (i !== -1) return { min: mc.morphslowlimit[i]!, max: mc.morphshighlimit[i]!, default: mc.morphslimit[i]! };
    return { min: 0, max: 100, default: 50 };
  };

  const activeMorphs =
    gender === 'female'
      ? ['Height','Muscle','Breast','Bust Girth','Waist','Hip Girth','Thigh Girth','Calf Girth','Stomach Form','Shoulders','Upper Arm Girth','Neck','lower Leg','Arm Length']
      : ['Height','Muscle','Chest','Bust Girth','Waist','Hip Girth','Thigh Girth','Calf','Stomach Form','Shoulders','Upper Arm Girth','Neck','Lower Leg Length','Arm Length'];

  const stats = [
    { label: 'Body Weight', sublabel: 'KG', value: profile.weightKg, lime: false },
    { label: 'Body fat estimate', sublabel: '%', value: profile.bodyFatPct, lime: false },
    { label: 'WHR Ratio', sublabel: '', value: metrics.whr.toFixed(2), lime: metrics.healthRisk === 'low' },
    { label: 'Silhouette', sublabel: '', value: metrics.archetype, lime: true },
  ];

  const goalProgressPct = Math.round(goalProgressFraction(goal, progressEntries) * 100);

  return (
    <div>
      {/* ── Stats Bar ── */}
      <section
        className="anim-up"
        style={{ borderBottom: '1px solid var(--ft-rule)' }}
        aria-label="Key metrics"
      >
        <div className="ft-stats-grid">
          {stats.map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: '24px 40px',
                borderRight: i < 3 ? '1px solid var(--ft-rule)' : 'none',
              }}
            >
              <p
                className="d-xl"
                style={{ color: s.lime ? 'var(--ft-lime)' : 'var(--ft-t1)', ...(s.label === 'Silhouette' ? { fontSize: 'clamp(20px, 3.6vw, 56px)', overflowWrap: 'anywhere' as const } : {}) }}
              >
                {s.value}
                {s.sublabel && (
                  <span
                    style={{
                      fontSize: '0.35em',
                      marginLeft: '4px',
                      color: 'var(--ft-t3)',
                      fontWeight: 700,
                    }}
                  >
                    {s.sublabel}
                  </span>
                )}
              </p>
              <p className="eyebrow" style={{ marginTop: '6px' }}>{s.label}</p>
              {s.label === 'Body Weight' && <button className="ft-weight-link" onClick={() => setIsWeightEditorOpen(true)}>Change weight</button>}
            </div>
          ))}
        </div>
      </section>

      {/* ── Main: Scanner + Controls ── */}
      <div className="ft-main-split" style={{ borderBottom: '1px solid var(--ft-rule)' }}>
        {/* Left: Scanner Viewport */}
        <div className="anim-up d-100 ft-viewport-pane">
          {/* Scanner header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 32px',
              borderBottom: '1px solid var(--ft-rule)',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <p className="eyebrow">Your body in 3D</p>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    background: isGoalPreview ? 'rgba(203,255,0,0.15)' : 'var(--ft-lime-bg)',
                    color: 'var(--ft-lime)',
                    border: '1px solid rgba(203,255,0,0.4)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {isGoalPreview ? `Goal: ${projection.archetype}` : metrics.archetype} · WHR {isGoalPreview ? projection.goalWhr.toFixed(2) : metrics.whr.toFixed(2)}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--ft-t3)', marginTop: '2px' }}>
                Weight, height, and body fat shape this illustrative preview.
              </p>
            </div>


          </div>

          {/* Goal vs Baseline Toggle Ribbon */}
          <GoalPhysiqueToggle
            isGoalPreview={isGoalPreview}
            onToggle={setIsGoalPreview}
            projection={projection}
            currentWeightKg={profile.weightKg}
          />

          {/* 3D WebGL Canvas Viewport */}
          <div className="ft-viewport-canvas">
            {/* Precision crosshairs */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '24px',
                width: '16px',
                height: '1px',
                background: 'rgba(255,255,255,0.08)',
                transform: 'translateY(-50%)',
                zIndex: 10,
              }}
              aria-hidden="true"
            />
            <div
              style={{
                position: 'absolute',
                top: '50%',
                right: '24px',
                width: '16px',
                height: '1px',
                background: 'rgba(255,255,255,0.08)',
                transform: 'translateY(-50%)',
                zIndex: 10,
              }}
              aria-hidden="true"
            />

            {/* Model Badge */}
            <p
              style={{
                position: 'absolute',
                top: '16px',
                right: '20px',
                fontSize: '9px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: isGoalPreview ? 'var(--ft-lime)' : 'rgba(255,255,255,0.25)',
                zIndex: 10,
              }}
              aria-hidden="true"
            >
              {isGoalPreview ? projection.weightKg : profile.weightKg} kg · {profile.heightCm} cm · {visualizerBodyFat}% fat
            </p>

            <div className="ft-camera-simple" role="group" aria-label="Camera views">
              {([{ id: 'full', label: 'Full body' }, { id: 'profile', label: 'Profile' }] as const).map(preset => <button key={preset.id} aria-pressed={cameraView === preset.id} className={cameraView === preset.id ? 'btn-lime' : 'btn-ghost'} onClick={() => { setCameraView(preset.id); window.dispatchEvent(new CustomEvent('visualizer:view')); }}>{preset.label}</button>)}
              <span>Drag to rotate · Pinch or scroll to zoom</span>
            </div>
            {/* 3D Visualizer Component */}
            <BodyVisualizer
              gender={gender}
              morphValues={visualizerMorphs}
              weightKg={isGoalPreview ? projection.weightKg : profile.weightKg}
              cameraView={cameraView}
              bodyFat={visualizerBodyFat}
            />
          </div>
        </div>

        {/* Right: Controls Panel */}
        <div className="anim-up d-150 ft-controls-pane">
          <Tabs defaultValue="body" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '0 0', flexShrink: 0 }}>
              <TabsList style={{ width: '100%', justifyContent: 'flex-start', paddingInline: '0' }}>
                <TabsTrigger value="body">Body Morph</TabsTrigger>
                <TabsTrigger value="goals">Goals</TabsTrigger>
                <TabsTrigger value="ai">AI Coach</TabsTrigger>
              </TabsList>
            </div>

            {/* Body Tab */}
            <TabsContent
              value="body"
              style={{ flex: 1, overflowY: 'auto', margin: 0 }}
            >
              <details className="ft-disclosure ft-profile-editor"><summary><span>Your profile</span><span className="ft-summary-value">{profile.heightCm} cm · {profile.weightKg} kg</span></summary>
              {/* Personal Info & Smart Sync */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--ft-rule)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <p className="eyebrow">Edit your profile</p>
                  <button
                    onClick={applySmartSync}
                    className="btn-lime"
                    style={{ padding: '5px 12px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    title="Calculate anatomically proportional measurements based on height, weight, and body fat"
                  >
                    <Sparkles style={{ width: '11px', height: '11px' }} />
                    Smart Sync
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label
                      htmlFor="gender-select"
                      style={{ display: 'block', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}
                    >
                      Gender
                    </label>
                    <select id="gender-select" className="ft-native-select" value={gender} onChange={e => handleGenderChange(e.target.value as Gender)}><option value="male">Male</option><option value="female">Female</option></select>
                  </div>
                  <div>
                    <label htmlFor="age-input" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>Age</label>
                    <Input
                      id="age-input"
                      type="number"
                      value={profile.age}
                      onChange={(e) => fitnessActions.setProfile({ age: Number(e.target.value) || 28 })}
                    />
                  </div>
                  <div>
                    <label htmlFor="height-input" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>Height (cm)</label>
                    <Input
                      id="height-input"
                      type="number"
                      value={profile.heightCm}
                      onChange={(e) => {
                        const h = Number(e.target.value);
                        if (h >= 100 && h <= 250) {
                          fitnessActions.setProfile({ heightCm: h });
                          fitnessActions.setMorphValues({ Height: h });
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="weight-input" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>Weight (kg)</label>
                    <button id="weight-input" className="btn-ghost" style={{ padding: '10px 12px' }} onClick={() => setIsWeightEditorOpen(true)}>{profile.weightKg} kg · Change weight</button>
                  </div>
                </div>

                {/* Body Fat slider */}
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--ft-rule)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t2)' }}>
                      Estimated Body Fat
                    </span>
                    <span className="data-val" style={{ fontSize: '11px', color: 'var(--ft-lime)' }}>
                      {profile.bodyFatPct}%
                    </span>
                  </div>
                  <Slider
                    value={[profile.bodyFatPct]}
                    min={6}
                    max={45}
                    step={0.5}
                    onValueChange={(val) => {
                      const v = Array.isArray(val) ? val[0] ?? 20 : val;
                      fitnessActions.setProfile({ bodyFatPct: v });
                    }}
                  />
                </div>
              </div>

              </details>
              {/* Anthropometric Insights Card */}
              <div
                style={{
                  padding: '16px 24px',
                  background: 'rgba(203,255,0,0.03)',
                  borderBottom: '1px solid var(--ft-rule)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                  <p className="eyebrow" style={{ color: 'var(--ft-lime)' }}>Silhouette Analysis</p>
                  <span className="data-val" style={{ fontSize: '11px', color: 'var(--ft-t1)', fontWeight: 600 }}>
                    {metrics.archetype}
                  </span>
                </div>
                <p style={{ fontSize: '11px', lineHeight: 1.5, color: 'var(--ft-t2)', marginBottom: '10px' }}>
                  {metrics.shapeDescription}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <span style={{ fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)' }}>WHR Ratio</span>
                    <p className="data-val" style={{ fontSize: '12px', fontWeight: 600, color: metrics.healthRisk === 'low' ? 'var(--ft-lime)' : '#FFB020' }}>
                      {metrics.whr.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)' }}>Lean Mass</span>
                    <p className="data-val" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ft-t1)' }}>
                      {metrics.leanMassKg} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>KG</span>
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)' }}>Fat Mass</span>
                    <p className="data-val" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ft-t1)' }}>
                      {metrics.fatMassKg} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>KG</span>
                    </p>
                  </div>
                </div>
              </div>

              <details className="ft-disclosure ft-detailed-body"><summary>Detailed body customization</summary><p className="ft-helper">Optional proportions and body types. Your profile already creates a starting shape.</p>
              {/* Shape Archetype Presets */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--ft-rule)' }}>
                <p className="eyebrow" style={{ marginBottom: '10px' }}>
                  Shape Archetypes ({gender})
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: gender === 'male' ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '6px' }}>
                  {activePresets.map((p) => (
                    <button
                      key={p.id}
                      title={p.description}
                      aria-pressed={Object.entries(p.measurements).every(([key, value]) => profile.morphValues[key] === value)}
                      onClick={() => applyPreset(p.id)}
                      className={Object.entries(p.measurements).every(([key, value]) => profile.morphValues[key] === value) ? "btn-lime" : "btn-ghost"}
                      style={{
                        padding: '8px 6px',
                        fontSize: '9px',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'var(--ft-t1)' }}>{p.name.split(' ')[0]}</span>
                      <span style={{ fontSize: '8px', color: 'var(--ft-t3)' }}>{p.id}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detailed Morph Sliders */}
              <div style={{ padding: '0 24px' }}>
                <div style={{ padding: '14px 0 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ft-rule)' }}>
                  <p className="eyebrow">Anatomical Parameters</p>
                  <button
                    onClick={applySmartSync}
                    style={{ fontSize: '9px', color: 'var(--ft-t3)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <RotateCcw style={{ width: '9px', height: '9px' }} />
                    Reset
                  </button>
                </div>

                {activeMorphs.map((morph) => {
                  const range = getMorphRange(morph);
                  const currentVal = profile.morphValues[morph] ?? range.default;
                  const isHighlight =
                    morph === 'Breast' ||
                    morph === 'Chest' ||
                    morph === 'Waist' ||
                    morph === 'Shoulders' ||
                    morph === 'Hip Girth';

                  return (
                    <div
                      key={morph}
                      style={{
                        padding: '12px 0',
                        borderBottom: '1px solid var(--ft-rule)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: isHighlight ? 600 : 500,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: isHighlight ? 'var(--ft-t1)' : 'var(--ft-t2)',
                          }}
                        >
                          {morphLabels[morph] || morph}
                        </span>
                        <span
                          className="data-val"
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: isHighlight ? 'var(--ft-lime)' : 'var(--ft-t2)',
                          }}
                        >
                          {currentVal.toFixed(1)}
                        </span>
                      </div>
                      <Slider
                        aria-label={morphLabels[morph] || morph}
                        value={[currentVal]}
                        min={range.min}
                        max={range.max}
                        step={0.1}
                        onValueChange={(value) =>
                          handleSliderChange(morph, Array.isArray(value) ? (value[0] ?? range.default) : value)
                        }
                      />
                    </div>
                  );
                })}
              </div>
              </details>
            </TabsContent>

            {/* Goals Tab */}
            <TabsContent value="goals" style={{ flex: 1, overflowY: 'auto', margin: 0 }}>
              <div style={{ padding: '24px 28px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="goal-select" style={{ display: 'block', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '8px' }}>
                    Primary Goal
                  </label>
                  <select id="goal-select" className="ft-native-select" value={goal.type} onChange={e => { setGoalError(''); fitnessActions.setGoalType(e.target.value as GoalType); }}>
                    <option value="weight-loss">Lose weight</option><option value="muscle-gain">Build muscle</option><option value="recomp">Body recomposition</option><option value="strength">Build strength</option>
                  </select>
                  <p className="ft-feedback">{goal.type === 'weight-loss' ? 'A gradual weight-loss plan with strength training.' : goal.type === 'muscle-gain' ? 'A small calorie surplus with progressive strength training.' : goal.type === 'recomp' ? 'Aim to maintain weight while building muscle and reducing body fat.' : 'Focus on getting stronger; body weight can stay stable.'} Your daily targets and newly generated plans follow this choice.</p>
                </div>

                {/* Target Weight & Timeline Inputs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                  <div>
                    <label htmlFor="target-weight-input" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>
                      Target Weight (kg)
                    </label>
                    <Input
                      id="target-weight-input"
                      type="number"
                      key={`weight-${goal.type}-${goal.targetWeightKg}`} defaultValue={goal.targetWeightKg} min={30} max={250} step={0.1}
                      onBlur={e => { const value = Number(e.target.value); if (!Number.isFinite(value) || value < 30 || value > 250) { setGoalError('Target weight must be between 30 and 250 kg.'); e.target.value = String(goal.targetWeightKg); return; } setGoalError(''); fitnessActions.setGoal({ targetWeightKg: value }); }}
                    />
                  </div>
                  <div>
                    <label htmlFor="timeline-input" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>
                      Timeline (Weeks)
                    </label>
                    <Input
                      id="timeline-input"
                      type="number"
                      key={`weeks-${goal.type}-${goal.timelineWeeks}`} defaultValue={goal.timelineWeeks} min={1} max={104} step={1}
                      onBlur={e => { const value = Number(e.target.value); if (!Number.isInteger(value) || value < 1 || value > 104) { setGoalError('Choose a timeline from 1 to 104 weeks.'); e.target.value = String(goal.timelineWeeks); return; } setGoalError(''); fitnessActions.setGoal({ timelineWeeks: value }); }}
                    />
                  </div>
                </div>

                {goalError && <p role="alert" className="ft-feedback ft-error">{goalError}</p>}
                {/* Goal metrics as editorial stat blocks */}
                {[
                  { label: 'Target Weight', value: String(goal.targetWeightKg), unit: 'KG' },
                  { label: 'Timeline', value: String(goal.timelineWeeks), unit: 'WKS' },
                  { label: 'Weekly Velocity', value: String(targets.weeklyVelocityKg), unit: 'KG/WK' },
                  { label: 'Target WHR', value: projection.goalWhr.toFixed(2), unit: 'INDEX' },
                  { label: 'Prescribed Intake', value: String(targets.calories), unit: 'KCAL' },
                ].map((item, i) => (
                  <div
                    key={item.label}
                    style={{
                      padding: '14px 0',
                      borderTop: '1px solid var(--ft-rule)',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'space-between',
                    }}
                  >
                    <p className="eyebrow">{item.label}</p>
                    <p className="d-md data-val" style={{ color: i === 0 || i === 4 ? 'var(--ft-lime)' : 'var(--ft-t1)' }}>
                      {item.value}
                      <span style={{ fontSize: '0.5em', color: 'var(--ft-t3)', marginLeft: '4px' }}>{item.unit}</span>
                    </p>
                  </div>
                ))}

                {/* Progress bar */}
                <div style={{ paddingTop: '16px', borderTop: '1px solid var(--ft-rule)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <p className="eyebrow">Goal Progress</p>
                    <span className="data-val" style={{ fontSize: '11px', color: 'var(--ft-lime)' }}>
                      {goalProgressPct}%
                    </span>
                  </div>
                  <div style={{ height: '3px', background: 'var(--ft-rule-strong)' }}>
                    <div style={{ width: `${goalProgressPct}%`, height: '100%', background: 'var(--ft-lime)', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* AI Coach Tab */}
            <TabsContent value="ai" style={{ flex: 1, margin: 0, overflow: 'hidden' }}>
              <AiCoachPanel
                profile={profile}
                goal={goal}
                targets={targets}
                metrics={metrics}
                streak={streak}
              />
            </TabsContent>
          </Tabs>

          {/* Pinned actions */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--ft-rule)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            <button
              onClick={handleGeneratePlan}
              disabled={isGeneratingPlan}
              className="btn-lime"
              style={{
                padding: '12px 18px',
                justifyContent: 'center',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: isGeneratingPlan ? 'wait' : 'pointer',
              }}
            >
              {isGeneratingPlan ? (
                <>
                  <Loader2 style={{ width: '13px', height: '13px', animation: 'spin 1s linear infinite' }} />
                  <span>Creating your workout...</span>
                </>
              ) : (
                <>
                  <span>Generate Workout Plan</span>
                  <ArrowUpRight style={{ width: '13px', height: '13px' }} />
                </>
              )}
            </button>
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="btn-ghost"
              style={{
                padding: '10px 18px',
                justifyContent: 'center',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FileText style={{ width: '12px', height: '12px' }} />
              Export Biometric Report
            </button>
          </div>
        </div>
      </div>

      {/* ── AI / Activity Strip ── */}
      <section
        className="anim-up d-200 ft-activity-strip"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 40px',
          borderBottom: '1px solid var(--ft-rule)',
          gap: '32px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', minWidth: 0 }}>
          <p className="eyebrow" style={{ flexShrink: 0 }}>This Week</p>
          {weekDays.map((day) => {
            return (
              <div key={day.dateKey} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'var(--ft-t3)' }}>{day.label}</span>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: day.isToday
                      ? '1px solid var(--ft-lime)'
                      : day.done
                      ? '1px solid rgba(203,255,0,0.4)'
                      : '1px solid var(--ft-rule)',
                    background: day.isToday ? 'var(--ft-lime-bg)' : day.done ? 'rgba(203,255,0,0.06)' : 'transparent',
                  }}
                >
                  {day.done ? (
                    <Check style={{ width: '12px', height: '12px', color: 'var(--ft-lime)' }} />
                  ) : day.isToday ? (
                    <span style={{ width: '5px', height: '5px', background: 'var(--ft-lime)', display: 'block' }} />
                  ) : (
                    <span style={{ width: '4px', height: '4px', background: 'var(--ft-rule-strong)', display: 'block' }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexShrink: 0 }}>
          <div>
            <p className="eyebrow">Calories Burned</p>
            <p className="data-val" style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px', color: 'var(--ft-t1)' }}>
              {weekStats.calories.toLocaleString()} KCAL
            </p>
          </div>
          <div>
            <p className="eyebrow">Workouts Done</p>
            <p className="data-val" style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px', color: 'var(--ft-lime)' }}>
              {weekStats.workouts}/5
            </p>
          </div>
          <button
            onClick={() => router.push('/progress')}
            className="btn-lime"
            style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>View Progress</span>
            <ArrowUpRight style={{ width: '13px', height: '13px' }} />
          </button>
        </div>
      </section>

      {isWeightEditorOpen && <CurrentWeightDialog onClose={() => setIsWeightEditorOpen(false)} />}
      {/* Photo Biometric Contour Scanner Modal */}
      <PhotoScanModal
        key={gender}
        isOpen={isPhotoScanOpen}
        onClose={() => setIsPhotoScanOpen(false)}
        gender={gender}
        currentHeightCm={profile.heightCm}
        onApplyMorphs={(overrides) => fitnessActions.setMorphValues(overrides)}
      />

      {/* Biometric Report Modal */}
      <BiometricReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        profile={profile}
        metrics={metrics}
        goal={goal}
        targets={targets}
      />
    </div>
  );
}
