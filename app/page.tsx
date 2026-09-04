'use client';

import React, { useState, useMemo } from 'react';
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
import { Sparkles, Eye, Layers, RotateCcw, Camera, Flame, Check, ArrowUpRight, Plus, Minus } from 'lucide-react';

interface MorphConfig {
  [key: string]: number;
}

export default function Home() {
  const [gender, setGender] = useState<Gender>('female');
  const [cameraView, setCameraView] = useState<CameraViewPreset>('full');
  const [materialMode, setMaterialMode] = useState<MaterialMode>('hologram');
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [isPhotoScanOpen, setIsPhotoScanOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('scan') === '1' || window.location.hash === '#scan';
    }
    return false;
  });
  const [selectedWorkoutStrain, setSelectedWorkoutStrain] = useState<string>('push');

  // Female baseline default morphs
  const [morphValues, setMorphValues] = useState<MorphConfig>({
    Height: 158,
    'Neck Height': 7,
    Neck: 31,
    Shoulders: 14,
    'Shoulder Angle': 1,
    Breast: 88,
    'Bust Girth': 68,
    'Arm Length': 23,
    'Upper Arm Girth': 26,
    Wrist: 13.5,
    'Stomach Form': 0.8,
    Waist: 69,
    'Hip Girth': 100,
    'Hip Height': 82,
    'Thigh Girth': 57,
    'Calf Girth': 36,
    'lower Leg': 45,
  });

  const [userInputs, setUserInputs] = useState({
    height: '165',
    weight: '62',
    age: '28',
    bodyFat: '22',
  });

  const handleSliderChange = (name: string, value: number) => {
    setMorphValues((prev) => ({ ...prev, [name]: value }));
    if (name === 'Height') {
      setUserInputs((prev) => ({ ...prev, height: Math.round(value).toString() }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setUserInputs((prev) => ({ ...prev, [name]: value }));
    if (name === 'height') {
      const num = parseFloat(value);
      if (!isNaN(num) && num >= 100 && num <= 250) {
        setMorphValues((prev) => ({ ...prev, Height: num }));
      }
    }
  };

  const handleGenderChange = (newGender: Gender) => {
    setGender(newGender);
    if (newGender === 'male') {
      const inputs = { height: '178', weight: '78', age: '28', bodyFat: '15' };
      setUserInputs(inputs);
      const smart = generateSmartMeasurements('male', 178, 78, 15);
      setMorphValues(smart);
    } else if (newGender === 'female') {
      const inputs = { height: '165', weight: '62', age: '28', bodyFat: '22' };
      setUserInputs(inputs);
      const smart = generateSmartMeasurements('female', 165, 62, 22);
      setMorphValues(smart);
    }
  };

  const activePresets = gender === 'female' ? FEMALE_PRESETS : MALE_PRESETS;

  // Smart Sync: synchronizes 3D body shape measurements with biometrics
  const applySmartSync = () => {
    const h = Number(userInputs.height) || (gender === 'female' ? 165 : 178);
    const w = Number(userInputs.weight) || (gender === 'female' ? 62 : 78);
    const bf = Number(userInputs.bodyFat) || (gender === 'female' ? 22 : 15);
    const smart = generateSmartMeasurements(gender, h, w, bf);
    setMorphValues(smart);
  };

  // Apply a curated preset archetype
  const applyPreset = (presetId: string) => {
    const preset = activePresets.find((p) => p.id === presetId);
    if (preset) {
      setMorphValues({ ...preset.measurements });
    }
  };

  const activeFatigue = useMemo(() => {
    return (
      WORKOUT_STRAIN_PRESETS.find((w) => w.id === selectedWorkoutStrain)?.fatigue ??
      WORKOUT_STRAIN_PRESETS[0]!.fatigue
    );
  }, [selectedWorkoutStrain]);

  // Calculate live anthropometric health & shape indicators
  const metrics = useMemo(() => {
    return calculateMetrics(
      gender,
      Number(userInputs.height) || (gender === 'female' ? 165 : 178),
      Number(userInputs.weight) || (gender === 'female' ? 62 : 78),
      Number(userInputs.bodyFat) || (gender === 'female' ? 22 : 15),
      morphValues
    );
  }, [gender, userInputs, morphValues]);

  const morphLabels: Record<string, string> = {
    Height: 'Height Scale',
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
      morphslowlimit: [120,83.76,32,9.36,11.3,0,81,0,64,21,12,12,96,29,30,29,49],
      morphshighlimit: [220,130.56,40,16,16,2,97,2,100,32,20,20,124,46,63,46,61],
      morphslimit: [178,96.67,37,12.36,13.07,1,86,1,76.66,26,15,16,112,36,42,38,55],
    };
    const i = mc.morphs.indexOf(name);
    if (i !== -1) return { min: mc.morphslowlimit[i]!, max: mc.morphshighlimit[i]!, default: mc.morphslimit[i]! };
    return { min: 0, max: 100, default: 50 };
  };

  const activeMorphs =
    gender === 'female'
      ? ['Height','Breast','Bust Girth','Waist','Hip Girth','Thigh Girth','Calf Girth','Stomach Form','Shoulders','Upper Arm Girth','Neck','lower Leg','Arm Length']
      : ['Height','Chest','Bust Girth','Waist','Hip Girth','Thigh Girth','Calf','Stomach Form','Shoulders','Upper Arm Girth','Neck','Lower Leg Length','Arm Length'];

  const stats = [
    { label: 'Body Weight', sublabel: 'KG', value: userInputs.weight, lime: false },
    { label: 'Body Fat',    sublabel: '%',  value: userInputs.bodyFat, lime: false },
    { label: 'WHR Ratio',   sublabel: '',   value: metrics.whr.toFixed(2), lime: metrics.healthRisk === 'low' },
    { label: 'Silhouette',  sublabel: '',   value: metrics.archetype, lime: true },
  ];

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
              GPU Morph Acceleration
              <span style={{ color: 'var(--ft-lime)', margin: '0 20px', opacity: 0.6 }}>•</span>
              Biometric Feedback Ready
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
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
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--ft-rule)',
          height: 'calc(100vh - 260px)',
          minHeight: '680px',
        }}
      >
        {/* Left: Scanner Viewport */}
        <div
          className="anim-up d-100"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--ft-rule)',
            minWidth: 0,
          }}
        >
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
                    background: 'var(--ft-lime-bg)',
                    color: 'var(--ft-lime)',
                    border: '1px solid rgba(203,255,0,0.3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {metrics.archetype} · WHR {metrics.whr.toFixed(2)}
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
                {(['hologram', 'sculpt', 'athletic', 'heatmap'] as const).map((m) => (
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

              {/* Gender toggle */}
              <div style={{ display: 'flex', gap: '2px', background: 'var(--ft-surface)', padding: '2px', border: '1px solid var(--ft-rule)' }} role="group" aria-label="Select gender">
                {(['female', 'male', 'child'] as const).map((g) => (
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

          {/* 3D WebGL Canvas Viewport */}
          <div
            style={{
              flex: 1,
              background: '#090909',
              position: 'relative',
              minHeight: '580px',
            }}
          >
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
                color: 'rgba(255,255,255,0.2)',
                zIndex: 10,
              }}
              aria-hidden="true"
            >
              PARAMETRIC / {gender.toUpperCase()}
            </p>

            {/* Quick Camera Angle & Zoom Toolbar (Floating at bottom of viewport) */}
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
                title="Zoom in (or scroll mouse wheel)"
                style={{ padding: '4px 8px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}
              >
                <Plus style={{ width: '10px', height: '10px' }} />
                <span>Zoom</span>
              </button>

              <button
                onClick={() => window.dispatchEvent(new CustomEvent('visualizer:zoom', { detail: { delta: -1 } }))}
                className="btn-ghost"
                title="Zoom out (or scroll mouse wheel)"
                style={{ padding: '4px 8px', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '3px' }}
              >
                <Minus style={{ width: '10px', height: '10px' }} />
              </button>
            </div>

            {/* 3D Visualizer Component */}
            <BodyVisualizer
              gender={gender}
              morphValues={morphValues}
              materialMode={materialMode}
              cameraView={cameraView}
              showWireframe={showWireframe}
              bodyFat={Number(userInputs.bodyFat) || (gender === 'female' ? 22 : 15)}
              muscleFatigue={activeFatigue}
            />
          </div>
        </div>

        {/* Right: Controls Panel */}
        <div
          className="anim-up d-150"
          style={{
            width: '440px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
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
                      onValueChange={(val) => { if (val) setGender(val as Gender); }}
                    >
                      <SelectTrigger id="gender-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="child">Child</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="age-input" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>Age</label>
                    <Input id="age-input" name="age" type="number" value={userInputs.age} onChange={handleInputChange} placeholder="28" />
                  </div>
                  <div>
                    <label htmlFor="height-input" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>Height (cm)</label>
                    <Input id="height-input" name="height" type="number" value={userInputs.height} onChange={handleInputChange} placeholder="165" />
                  </div>
                  <div>
                    <label htmlFor="weight-input" style={{ display: 'block', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '4px' }}>Weight (kg)</label>
                    <Input id="weight-input" name="weight" type="number" value={userInputs.weight} onChange={handleInputChange} placeholder="62" />
                  </div>
                </div>

                {/* Body Fat slider in personal info */}
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--ft-rule)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ft-t2)' }}>
                      Estimated Body Fat
                    </span>
                    <span className="data-val" style={{ fontSize: '11px', color: 'var(--ft-lime)' }}>
                      {userInputs.bodyFat}%
                    </span>
                  </div>
                  <Slider
                    value={[Number(userInputs.bodyFat) || 22]}
                    min={10}
                    max={45}
                    step={0.5}
                    onValueChange={(val) => {
                      const v = Array.isArray(val) ? val[0] ?? 22 : val;
                      setUserInputs((prev) => ({ ...prev, bodyFat: String(v) }));
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

              {/* Workout Strain Selector (When in heatmap mode) */}
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
              {(gender === 'female' || gender === 'male') && (
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
              )}

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
                  const currentVal = morphValues[morph] ?? range.default;
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
                  <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ft-t3)', marginBottom: '8px' }}>Primary Goal</label>
                  <Select defaultValue="weight-loss">
                    <SelectTrigger id="goal-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weight-loss">Lose Weight & Sculpt</SelectItem>
                      <SelectItem value="muscle-gain">Build Lean Muscle</SelectItem>
                      <SelectItem value="maintain">Maintain Shape & Tone</SelectItem>
                      <SelectItem value="strength">Increase Strength</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Goal metrics as editorial stat blocks */}
                {[
                  { label: 'Target Weight', value: '58', unit: 'KG' },
                  { label: 'Timeline',       value: '10', unit: 'WKS' },
                  { label: 'Weekly Velocity', value: '-0.4', unit: 'KG' },
                  { label: 'Target WHR',     value: '0.68', unit: 'INDEX' },
                ].map((item, i) => (
                  <div
                    key={item.label}
                    style={{
                      padding: '16px 0',
                      borderTop: '1px solid var(--ft-rule)',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'space-between',
                    }}
                  >
                    <p className="eyebrow">{item.label}</p>
                    <p className="d-md data-val" style={{ color: i === 0 ? 'var(--ft-lime)' : 'var(--ft-t1)' }}>
                      {item.value}
                      <span style={{ fontSize: '0.5em', color: 'var(--ft-t3)', marginLeft: '4px' }}>{item.unit}</span>
                    </p>
                  </div>
                ))}

                {/* Progress bar */}
                <div style={{ paddingTop: '16px', borderTop: '1px solid var(--ft-rule)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <p className="eyebrow">Goal Progress</p>
                    <span className="data-val" style={{ fontSize: '11px', color: 'var(--ft-lime)' }}>72%</span>
                  </div>
                  <div style={{ height: '2px', background: 'var(--ft-rule-strong)' }}>
                    <div style={{ width: '72%', height: '100%', background: 'var(--ft-lime)' }} />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* AI Coach Tab */}
            <TabsContent value="ai" style={{ flex: 1, margin: 0 }}>
              <div style={{ padding: '28px 24px' }}>
                <p className="eyebrow" style={{ marginBottom: '16px' }}>AI Anatomical Coach</p>

                <blockquote
                  style={{
                    borderLeft: '2px solid var(--ft-lime)',
                    paddingLeft: '16px',
                    marginBottom: '24px',
                  }}
                >
                  <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--ft-t1)' }}>
                    &quot;Your current waist-to-hip ratio is{' '}
                    <span style={{ color: 'var(--ft-lime)', fontWeight: 600 }}>{metrics.whr.toFixed(2)}</span>, categorized as a{' '}
                    <span style={{ fontWeight: 600 }}>{metrics.archetype}</span> silhouette. Prioritize resistance hip thrusts and romanian deadlifts to maintain gluteal tone while sustaining a modest calorie deficit.&quot;
                  </p>
                </blockquote>

                <div style={{ borderTop: '1px solid var(--ft-rule)', paddingTop: '16px' }}>
                  <p className="eyebrow" style={{ marginBottom: '10px' }}>Biometric Sources</p>
                  {['3D GPU Anatomical Mesh', 'Gynoid Adipose Ratio', 'Calculated Lean Mass', 'WHR Index'].map((src) => (
                    <div
                      key={src}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 0',
                        borderBottom: '1px solid var(--ft-rule)',
                      }}
                    >
                      <span
                        style={{
                          width: '4px',
                          height: '4px',
                          background: 'var(--ft-lime)',
                          flexShrink: 0,
                          display: 'inline-block',
                        }}
                        aria-hidden="true"
                      />
                      <span style={{ fontSize: '11px', color: 'var(--ft-t2)' }}>{src}</span>
                    </div>
                  ))}
                </div>
              </div>
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
            <button className="btn-lime" style={{ padding: '12px 18px', justifyContent: 'center', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Generate Workout Plan</span>
              <ArrowUpRight style={{ width: '13px', height: '13px' }} />
            </button>
            <button className="btn-ghost" style={{ padding: '10px 18px', justifyContent: 'center', fontSize: '11px' }}>
              Export Biometric Report
            </button>
          </div>
        </div>
      </div>

      {/* ── AI Strip ── */}
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
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
            const isToday = i === 1;
            const isDone = i === 0;
            const isRest = i >= 5;
            return (
              <div key={`${day}-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'var(--ft-t3)' }}>{day}</span>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: isToday ? '1px solid var(--ft-lime)' : isDone ? '1px solid rgba(203,255,0,0.3)' : '1px solid var(--ft-rule)',
                    background: isToday ? 'var(--ft-lime-bg)' : 'transparent',
                  }}
                >
                  {isDone && <Check style={{ width: '12px', height: '12px', color: 'var(--ft-lime)' }} />}
                  {isToday && <span style={{ width: '5px', height: '5px', background: 'var(--ft-lime)', display: 'block' }} />}
                  {!isDone && !isToday && <span style={{ width: '4px', height: '4px', background: isRest ? 'var(--ft-t3)' : 'var(--ft-rule-strong)', display: 'block' }} />}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexShrink: 0 }}>
          {[
            { label: 'Calories Burned', value: '1,840 KCAL' },
            { label: 'Workouts Done', value: '2/5' },
          ].map((item) => (
            <div key={item.label}>
              <p className="eyebrow">{item.label}</p>
              <p className="data-val" style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px' }}>{item.value}</p>
            </div>
          ))}
          <button className="btn-lime" style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
        currentHeightCm={Number(userInputs.height) || (gender === 'female' ? 165 : 178)}
        onApplyMorphs={(overrides) => setMorphValues((prev) => ({ ...prev, ...overrides }))}
      />
    </div>
  );
}
