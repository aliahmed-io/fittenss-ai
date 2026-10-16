'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BodyVisualizer, { CameraViewPreset, MaterialMode } from '@/components/BodyVisualizer';
import {
  calculateMetrics,
  generateSmartMeasurements,
  FEMALE_PRESETS,
  MALE_PRESETS,
  Gender,
} from '@/lib/bodyModel/anthropometry';
import { WORKOUT_STRAIN_PRESETS } from '@/lib/bodyModel/muscleHeatmap';
import PhotoScanModal from '@/components/PhotoScanModal';
import BiometricReportModal from '@/components/dashboard/BiometricReportModal';
import GoalPhysiqueToggle from '@/components/dashboard/GoalPhysiqueToggle';
import AiCoachPanel from '@/components/dashboard/AiCoachPanel';
import { useFitnessStore, fitnessActions } from '@/lib/store/fitnessStore';
import {
  computeTargets,
  projectGoalPhysique,
  goalProgressFraction,
  weeklyActivity,
  weeklyTotals,
  fatigueFromMuscles,
  computeStreak,
  toDateKey,
  type GoalProjection,
} from '@/lib/fitness/engine';
import type { CoachResponse, GoalType } from '@/lib/fitness/types';
import {
  Sparkles,
  Eye,
  Layers,
  RotateCcw,
  Camera,
  Flame,
  Check,
  ArrowUpRight,
  Plus,
  Minus,
  Activity,
  Loader2,
  FileText,
} from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const store = useFitnessStore();
  const { profile, goal, workoutLogs, progressEntries } = store;
  const gender = profile.gender;

  const [cameraView, setCameraView] = useState<CameraViewPreset>('full');
  const [materialMode, setMaterialMode] = useState<MaterialMode>('hologram');
  const [activePose, setActivePose] = useState<string>('neutral');
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [isPhotoScanOpen, setIsPhotoScanOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isGoalPreview, setIsGoalPreview] = useState<boolean>(false);
  const [selectedWorkoutStrain, setSelectedWorkoutStrain] = useState<string>('push');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState<boolean>(false);

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

  // Workout strain heatmap
  const latestLog = workoutLogs[workoutLogs.length - 1];
  const activeFatigue = useMemo(() => {
    if (selectedWorkoutStrain === 'last-session' && latestLog) {
      return fatigueFromMuscles(latestLog.muscles);
    }
    const preset = WORKOUT_STRAIN_PRESETS.find((w) => w.id === selectedWorkoutStrain);
    return preset?.fatigue ?? WORKOUT_STRAIN_PRESETS[0]!.fatigue;
  }, [selectedWorkoutStrain, latestLog]);

  // Smart Sync
  const applySmartSync = () => {
    const smart = generateSmartMeasurements(gender, profile.heightCm, profile.weightKg, profile.bodyFatPct);
    fitnessActions.setMorphValues(smart);
  };

  const applyPreset = (presetId: string) => {
    const preset = activePresets.find((p) => p.id === presetId);
    if (preset) {
      fitnessActions.setMorphValues({ ...preset.measurements });
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
      if (res.ok) {
        const data = (await res.json()) as CoachResponse;
        if (data.plan) {
          fitnessActions.addCustomPlan(data.plan);
        }
      }
    } catch {
      // Handled by route fallback or offline
    } finally {
      setIsGeneratingPlan(false);
      router.push('/workouts');
    }
  };

  const morphLabels: Record<string, string> = {
    Height: 'Height Scale',
    Muscle: 'Overall Muscle Hypertrophy',
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
    { label: 'Body Fat', sublabel: '%', value: profile.bodyFatPct, lime: false },
    { label: 'WHR Ratio', sublabel: '', value: metrics.whr.toFixed(2), lime: metrics.healthRisk === 'low' },
    { label: 'Silhouette', sublabel: '', value: metrics.archetype, lime: true },
  ];

  const goalProgressPct = Math.round(goalProgressFraction(goal, progressEntries) * 100);

  return (
    <div>
      {/* ── Ticker ── */}
      <div
        style={{
          borderBottom: '1px solid var(--ft-rule)',
          background: 'var(--ft-surface)',
          overflow: 'hidden',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
        }}
        aria-hidden="true"
      >
        <div
          className="anim-tick"
          style={{
            display: 'flex',
            whiteSpace: 'nowrap',
            gap: '0',
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              style={{
                fontSize: '10px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--ft-t3)',
                paddingInline: '40px',
              }}
            >
              Parametric 3D Scan Active
              <span style={{ color: 'var(--ft-lime)', margin: '0 20px', opacity: 0.6 }}>•</span>
              WHR Index: {metrics.whr.toFixed(2)} ({metrics.archetype})
              <span style={{ color: 'var(--ft-lime)', margin: '0 20px', opacity: 0.6 }}>•</span>
              Target: {targets.calories} KCAL ({targets.protein}g Protein)
              <span style={{ color: 'var(--ft-lime)', margin: '0 20px', opacity: 0.6 }}>•</span>
              Streak: {streak} Days
              <span style={{ color: 'var(--ft-lime)', margin: '0 20px', opacity: 0.6 }}>•</span>
            </span>
          ))}
        </div>
      </div>

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
                style={{ color: s.lime ? 'var(--ft-lime)' : 'var(--ft-t1)' }}
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
                <p className="eyebrow">3D Anatomical Visualizer</p>
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
                Rotate 360° · Right-click or drag to pan · Scroll to zoom
              </p>
            </div>

            {/* Viewport Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Material mode selector */}
              <div style={{ display: 'flex', gap: '2px', background: 'var(--ft-surface)', padding: '2px', border: '1px solid var(--ft-rule)' }}>
                {(['hologram', 'pbr', 'sculpt', 'athletic', 'heatmap'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMaterialMode(m)}
                    className={materialMode === m ? 'btn-lime' : 'btn-ghost'}
                    style={{
                      padding: '4px 10px',
                      fontSize: '9px',
                      textTransform: 'capitalize',
                      ...(m === 'hologram' && materialMode === 'hologram'
                        ? { background: 'rgba(0, 240, 255, 0.2)', color: '#00F0FF', borderColor: 'rgba(0, 240, 255, 0.5)' }
                        : {}),
                    }}
                  >
                    {m === 'hologram' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Sparkles style={{ width: '10px', height: '10px' }} />
                        Hologram
                      </span>
                    ) : m === 'pbr' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Layers style={{ width: '10px', height: '10px' }} />
                        PBR Studio
                      </span>
                    ) : m === 'heatmap' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Flame style={{ width: '10px', height: '10px' }} />
                        Strain Heatmap
                      </span>
                    ) : (
                      m
                    )}
                  </button>
                ))}
                <button
                  onClick={() => setShowWireframe(!showWireframe)}
                  className={showWireframe ? 'btn-lime' : 'btn-ghost'}
                  style={{ padding: '4px 8px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Toggle wireframe mesh"
                >
                  <Layers style={{ width: '10px', height: '10px' }} />
                  Grid
                </button>
              </div>

              {/* Photo Scan Button */}
              <button
                onClick={() => setIsPhotoScanOpen(true)}
                className="btn-lime"
                style={{ padding: '4px 10px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Photo Biometric Contour Scan"
              >
                <Camera style={{ width: '10px', height: '10px' }} />
                Photo Scan
              </button>

              {/* Gender toggle (Strictly Female / Male) */}
              <div style={{ display: 'flex', gap: '2px', background: 'var(--ft-surface)', padding: '2px', border: '1px solid var(--ft-rule)' }} role="group" aria-label="Select gender">
                {(['female', 'male'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => handleGenderChange(g)}
                    className={gender === g ? 'btn-lime' : 'btn-ghost'}
                    style={{ padding: '4px 12px', fontSize: '9px', textTransform: 'capitalize' }}
                    aria-pressed={gender === g}
                  >
                    {g}
                  </button>
                ))}
              </div>
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

            {/* Pose Action Selector */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                left: '20px',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(15,15,15,0.85)',
                backdropFilter: 'blur(8px)',
                padding: '4px',
                border: '1px solid var(--ft-rule)',
              }}
            >
              <span style={{ fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)', padding: '0 6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Activity style={{ width: '10px', height: '10px', color: 'var(--ft-lime)' }} />
                Pose
              </span>
              {(
                [
                  { id: 'neutral', label: 'Neutral' },
                  { id: 'double_biceps', label: 'Biceps Flex' },
                  { id: 'lat_spread', label: 'Lat Spread' },
                  { id: 'squat_deep', label: 'Squat' },
                  { id: 'deadlift_hinge', label: 'Deadlift' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePose(p.id)}
                  className={activePose === p.id ? 'btn-lime' : 'btn-ghost'}
                  style={{ padding: '4px 8px', fontSize: '9px' }}
                >
                  {p.label}
                </button>
              ))}
            </div>

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
              {isGoalPreview ? `PROJECTED GOAL / ${projection.archetype.toUpperCase()}` : `PARAMETRIC / ${gender.toUpperCase()}`}
            </p>

            {/* Quick Camera Angle Toolbar */}
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(15,15,15,0.85)',
                backdropFilter: 'blur(8px)',
                padding: '4px',
                border: '1px solid var(--ft-rule)',
              }}
            >
              {(
                [
                  { id: 'full', label: 'Full Body' },
                  { id: 'torso', label: 'Torso' },
                  { id: 'lower', label: 'Legs' },
                  { id: 'profile', label: 'Profile' },
                  { id: 'back', label: 'Back' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setCameraView(preset.id)}
                  className={cameraView === preset.id ? 'btn-lime' : 'btn-ghost'}
                  style={{ padding: '4px 10px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Eye style={{ width: '10px', height: '10px' }} />
                  {preset.label}
                </button>
              ))}

              <div style={{ width: '1px', height: '14px', background: 'var(--ft-rule)', margin: '0 2px' }} />

              <button
                onClick={() => window.dispatchEvent(new CustomEvent('visualizer:zoom', { detail: { delta: 1 } }))}
                className="btn-ghost"
                title="Zoom in"
                style={{ padding: '4px 8px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}
              >
                <Plus style={{ width: '10px', height: '10px' }} />
                <span>Zoom</span>
              </button>

              <button
                onClick={() => window.dispatchEvent(new CustomEvent('visualizer:zoom', { detail: { delta: -1 } }))}
                className="btn-ghost"
                title="Zoom out"
                style={{ padding: '4px 8px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}
              >
                <Minus style={{ width: '10px', height: '10px' }} />
              </button>
            </div>

            {/* 3D Visualizer Component */}
            <BodyVisualizer
              gender={gender}
              morphValues={visualizerMorphs}
              materialMode={materialMode}
              cameraView={cameraView}
              showWireframe={showWireframe}
              bodyFat={visualizerBodyFat}
              muscleFatigue={activeFatigue}
              activePose={activePose}
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
              {/* Personal Info & Smart Sync */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--ft-rule)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <p className="eyebrow">Biometric Baseline</p>
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
                    <Select
                      value={gender}
                      onValueChange={(val) => { if (val === 'female' || val === 'male') handleGenderChange(val); }}
                    >
                      <SelectTrigger id="gender-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Input
                      id="weight-input"
                      type="number"
                      value={profile.weightKg}
                      onChange={(e) => fitnessActions.setProfile({ weightKg: Number(e.target.value) || 70 })}
                    />
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

              {/* Workout Strain Selector */}
              {materialMode === 'heatmap' && (
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--ft-rule)', background: 'rgba(203,255,0,0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <p className="eyebrow" style={{ color: 'var(--ft-lime)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Flame style={{ width: '12px', height: '12px' }} />
                      Workout Strain Protocol
                    </p>
                    <span style={{ fontSize: '8px', color: 'var(--ft-t3)' }}>3D THERMAL MAP</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {latestLog && (
                      <button
                        onClick={() => setSelectedWorkoutStrain('last-session')}
                        className={selectedWorkoutStrain === 'last-session' ? 'btn-lime' : 'btn-ghost'}
                        style={{
                          padding: '8px 10px',
                          fontSize: '10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>Last Session ({latestLog.planName})</span>
                        <span style={{ fontSize: '8px', opacity: 0.8 }}>Logged Strain</span>
                      </button>
                    )}
                    {WORKOUT_STRAIN_PRESETS.map((w) => (
                      <button
                        key={w.id}
                        onClick={() => setSelectedWorkoutStrain(w.id)}
                        className={selectedWorkoutStrain === w.id ? 'btn-lime' : 'btn-ghost'}
                        style={{
                          padding: '8px 10px',
                          fontSize: '10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          textAlign: 'left',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{w.name.split(' (')[0]}</span>
                        <span style={{ fontSize: '8px', opacity: 0.8 }}>
                          {w.id === 'rest' ? 'Baseline' : 'Peak Pump'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Shape Archetype Presets */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--ft-rule)' }}>
                <p className="eyebrow" style={{ marginBottom: '10px' }}>
                  Shape Archetypes ({gender})
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: gender === 'male' ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '6px' }}>
                  {activePresets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.id)}
                      className="btn-ghost"
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
            </TabsContent>

            {/* Goals Tab */}
            <TabsContent value="goals" style={{ flex: 1, overflowY: 'auto', margin: 0 }}>
              <div style={{ padding: '24px 28px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="goal-select" style={{ display: 'block', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '8px' }}>
                    Primary Goal
                  </label>
                  <Select
                    value={goal.type}
                    onValueChange={(val) => {
                      if (val) fitnessActions.setGoalType(val as GoalType);
                    }}
                  >
                    <SelectTrigger id="goal-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weight-loss">Lose Weight & Sculpt</SelectItem>
                      <SelectItem value="muscle-gain">Build Lean Muscle</SelectItem>
                      <SelectItem value="recomp">Body Recomposition</SelectItem>
                      <SelectItem value="strength">Increase Strength</SelectItem>
                    </SelectContent>
                  </Select>
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
                      value={goal.targetWeightKg}
                      onChange={(e) => fitnessActions.setGoal({ targetWeightKg: Number(e.target.value) || profile.weightKg })}
                    />
                  </div>
                  <div>
                    <label htmlFor="timeline-input" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>
                      Timeline (Weeks)
                    </label>
                    <Input
                      id="timeline-input"
                      type="number"
                      value={goal.timelineWeeks}
                      onChange={(e) => fitnessActions.setGoal({ timelineWeeks: Math.max(1, Number(e.target.value) || 12) })}
                    />
                  </div>
                </div>

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
                  <span>Synthesizing Custom Plan...</span>
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
        className="anim-up d-200"
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
