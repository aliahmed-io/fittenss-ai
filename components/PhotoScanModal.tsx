'use client';

import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, Check, Camera, Sparkles, RefreshCw, Loader2, ShieldCheck } from 'lucide-react';
import { Gender } from '@/lib/bodyModel/anthropometry';
import type { BodyScanResult } from '@/app/api/analyze-body-scan/route';
import { downscaleImage } from '@/lib/image/downscale';

interface PhotoScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  gender: Gender;
  currentHeightCm: number;
  onApplyMorphs: (overrides: Record<string, number>) => void;
}

interface CaliperLine {
  id: 'shoulders' | 'chest' | 'waist' | 'hips';
  label: string;
  yPct: number; // 0 to 100
  leftPct: number; // 0 to 100
  rightPct: number; // 0 to 100
  depthRatio: number; // AP to transverse ratio (depth / width)
}

function getDefaultCalipers(isMale: boolean): CaliperLine[] {
  return [
    {
      id: 'shoulders',
      label: 'Shoulders',
      yPct: 24,
      leftPct: isMale ? 34 : 37,
      rightPct: isMale ? 66 : 63,
      depthRatio: 0.65,
    },
    {
      id: 'chest',
      label: isMale ? 'Chest' : 'Bust',
      yPct: 32,
      leftPct: isMale ? 39 : 40,
      rightPct: isMale ? 61 : 60,
      depthRatio: 0.72,
    },
    {
      id: 'waist',
      label: 'Waist (Cinch)',
      yPct: 43,
      leftPct: isMale ? 42 : 44,
      rightPct: isMale ? 58 : 56,
      depthRatio: 0.70,
    },
    {
      id: 'hips',
      label: 'Hips (Widest)',
      yPct: 56,
      leftPct: isMale ? 43 : 41,
      rightPct: isMale ? 57 : 59,
      depthRatio: 0.75,
    },
  ];
}

// Generate realistic photographic athletic pose references for instant testing
function getReferencePoseSvg(isMale: boolean): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 640" width="400" height="640">
    <defs>
      <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#141c28"/>
        <stop offset="100%" stop-color="#06090e"/>
      </radialGradient>
      <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#2a384c"/>
        <stop offset="50%" stop-color="#3d4f68"/>
        <stop offset="100%" stop-color="#222e3f"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bgGlow)"/>
    <!-- Grid overlay lines -->
    <path d="M 50 0 V 640 M 100 0 V 640 M 150 0 V 640 M 200 0 V 640 M 250 0 V 640 M 300 0 V 640 M 350 0 V 640" stroke="#121b26" stroke-width="1"/>
    <path d="M 0 80 H 400 M 0 160 H 400 M 0 240 H 400 M 0 320 H 400 M 0 400 H 400 M 0 480 H 400 M 0 560 H 400" stroke="#121b26" stroke-width="1"/>
    
    <!-- Human Athletic Silhouette -->
    <g fill="url(#bodyGrad)" stroke="#4a5f7e" stroke-width="1.5">
      <!-- Head & Neck -->
      <circle cx="200" cy="88" r="28"/>
      <path d="M 186 114 L 186 138 Q 186 142 176 148 L 152 156 L 152 188 L 168 184 L 180 180 L 186 172 L 186 195 L 214 195 L 214 172 L 220 180 L 232 184 L 248 188 L 248 156 L 224 148 Q 214 142 214 114 Z"/>
      
      <!-- Torso & Arms -->
      ${isMale ? `
        <!-- Male Athletic V-Taper Frame -->
        <path d="M 148 156 Q 130 165 116 215 L 112 300 L 126 304 L 134 235 L 154 225 L 158 265 L 166 335 L 176 355 L 200 365 L 224 355 L 234 335 L 242 265 L 246 225 L 266 235 L 274 304 L 288 300 L 284 215 Q 270 165 252 156 Z"/>
        <!-- Pectoral plate lines -->
        <path d="M 166 205 Q 200 216 234 205" fill="none" stroke="#222e3f" stroke-width="2"/>
        <path d="M 200 178 L 200 270" fill="none" stroke="#222e3f" stroke-width="1.5"/>
        <!-- Pelvis & Legs -->
        <path d="M 176 355 L 162 470 L 166 575 L 188 580 L 194 485 L 200 395 L 206 485 L 212 575 L 234 580 L 238 470 L 224 355 Z"/>
      ` : `
        <!-- Female Athletic Hourglass Frame -->
        <path d="M 154 156 Q 138 165 124 215 L 120 295 L 132 298 L 140 230 L 156 220 L 162 255 L 164 275 L 154 330 L 164 360 L 200 368 L 236 360 L 246 330 L 236 275 L 238 255 L 244 220 L 260 230 L 268 298 L 280 295 L 276 215 Q 262 165 246 156 Z"/>
        <!-- Bust & waist curvature -->
        <path d="M 166 205 Q 182 220 200 212 Q 218 220 234 205" fill="none" stroke="#222e3f" stroke-width="2"/>
        <!-- Pelvis & Legs -->
        <path d="M 164 360 L 158 465 L 162 575 L 182 580 L 194 480 L 200 395 L 206 480 L 218 575 L 238 580 L 242 465 L 236 360 Z"/>
      `}
    </g>
    <!-- Technical watermark -->
    <text x="20" y="620" fill="#2d3f58" font-family="monospace" font-size="10" letter-spacing="2">BIOMETRIC REFERENCE SCAN // ${isMale ? 'MALE 178CM' : 'FEMALE 165CM'}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function PhotoScanModal({
  isOpen,
  onClose,
  gender,
  currentHeightCm,
  onApplyMorphs,
}: PhotoScanModalProps) {
  const isMale = gender === 'male';

  const [prevGender, setPrevGender] = useState(gender);
  const [imageSrc, setImageSrc] = useState<string>(() => getReferencePoseSvg(isMale));
  const [analyzingAI, setAnalyzingAI] = useState<boolean>(false);
  const [aiResult, setAiResult] = useState<BodyScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Caliper coordinates in percentage of container width and height
  const [calipers, setCalipers] = useState<CaliperLine[]>(() => getDefaultCalipers(isMale));

  // Reset to default reference photo and calipers when gender changes
  if (gender !== prevGender) {
    setPrevGender(gender);
    setImageSrc(getReferencePoseSvg(gender === 'male'));
    setAiResult(null);
    setError(null);
    setCalipers(getDefaultCalipers(gender === 'male'));
  }

  const [activeDrag, setActiveDrag] = useState<{
    id: CaliperLine['id'];
    target: 'left' | 'right' | 'line';
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload with client-side downscaling
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const raw = event.target?.result;
      if (typeof raw === 'string') {
        try {
          const downscaled = await downscaleImage(raw, 1280, 0.85);
          setImageSrc(`data:image/jpeg;base64,${downscaled.base64}`);
        } catch {
          setImageSrc(raw);
        }
        setAiResult(null);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Convert caliper pixel proportions to metric centimeters based on user height
  const getMeasurementCm = useCallback(
    (c: CaliperLine): number => {
      // Container aspect ratio is approximately 400x640 (standing human is ~88% of vertical frame)
      const personHeightPx = 640 * 0.88;
      const pxToCm = currentHeightCm / personHeightPx;
      const spanPx = ((c.rightPct - c.leftPct) / 100) * 400;
      const transverseWidthCm = spanPx * pxToCm;

      if (c.id === 'shoulders') {
        return +(transverseWidthCm * 1.05).toFixed(1);
      }

      // Ellipse circumference estimation for body cross-sections
      const a = transverseWidthCm * 0.5;
      const b = a * c.depthRatio;
      const circ = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
      return +circ.toFixed(1);
    },
    [currentHeightCm]
  );

  // Live measurements
  const shoulderCm = getMeasurementCm(calipers[0]!);
  const chestCm = getMeasurementCm(calipers[1]!);
  const waistCm = getMeasurementCm(calipers[2]!);
  const hipCm = getMeasurementCm(calipers[3]!);
  const whrRatio = +(waistCm / Math.max(hipCm, 1)).toFixed(2);

  // Mouse / Touch drag handling for caliper pins
  const handlePointerDown = (
    e: React.PointerEvent,
    id: CaliperLine['id'],
    target: 'left' | 'right' | 'line'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveDrag({ id, target });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDrag || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.min(90, Math.max(10, ((e.clientY - rect.top) / rect.height) * 100));

    setCalipers((prev) =>
      prev.map((c) => {
        if (c.id !== activeDrag.id) return c;

        if (activeDrag.target === 'left') {
          return { ...c, leftPct: Math.min(xPct, c.rightPct - 6) };
        } else if (activeDrag.target === 'right') {
          return { ...c, rightPct: Math.max(xPct, c.leftPct + 6) };
        } else if (activeDrag.target === 'line') {
          return { ...c, yPct };
        }
        return c;
      })
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDrag) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }
      setActiveDrag(null);
    }
  };

  // Run AI Vision analysis with Gemini
  const runAiVision = async () => {
    setAnalyzingAI(true);
    setError(null);
    try {
      const isBase64 = imageSrc.startsWith('data:');
      let base64Data = imageSrc;
      let mime = 'image/png';

      if (isBase64) {
        const parts = imageSrc.split(',');
        mime = parts[0]?.match(/:(.*?);/)?.[1] || 'image/png';
        base64Data = parts[1] || '';
      }

      const res = await fetch('/api/analyze-body-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Data,
          mimeType: mime,
          gender,
          heightCm: currentHeightCm,
        }),
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errJson.error || `Server error: ${res.status}`);
      }

      const data = (await res.json()) as BodyScanResult;
      setAiResult(data);

      // Auto-fit calipers to AI detected measurements
      if (data.waistCircumferenceCm && data.hipCircumferenceCm) {
        setCalipers((prev) =>
          prev.map((c) => {
            if (c.id === 'waist') {
              const diff = (data.waistCircumferenceCm - 75) * 0.15;
              return { ...c, leftPct: Math.max(30, 43 - diff), rightPct: Math.min(70, 57 + diff) };
            }
            if (c.id === 'hips') {
              const diff = (data.hipCircumferenceCm - 98) * 0.15;
              return { ...c, leftPct: Math.max(25, 41 - diff), rightPct: Math.min(75, 59 + diff) };
            }
            return c;
          })
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI Vision analysis failed.';
      setError(msg);
    } finally {
      setAnalyzingAI(false);
    }
  };

  // Apply measurements directly to 3D model
  const handleApply = () => {
    const overrides: Record<string, number> = {
      Shoulders: +(shoulderCm * 0.32).toFixed(1),
      Chest: chestCm,
      Breast: chestCm,
      Waist: waistCm,
      'Hip Girth': hipCm,
      'Thigh Girth': +(hipCm * 0.58).toFixed(1),
      'Calf Girth': +(hipCm * 0.38).toFixed(1),
      'Upper Arm Girth': +(shoulderCm * 0.72).toFixed(1),
      'Stomach Form': +Math.min(1.6, Math.max(0.2, (waistCm - (isMale ? 78 : 68)) / 25)).toFixed(2),
    };

    if (aiResult?.morphOverrides) {
      Object.assign(overrides, aiResult.morphOverrides);
    }

    onApplyMorphs(overrides);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.86)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-scan-title"
    >
      <div
        style={{
          width: '100%',
          maxWidth: '960px',
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
            padding: '16px 24px',
            borderBottom: '1px solid var(--ft-rule)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Camera style={{ width: '16px', height: '16px', color: 'var(--ft-lime)' }} />
            <div>
              <h2 id="photo-scan-title" className="d-sm" style={{ fontSize: '14px', margin: 0, color: 'var(--ft-t1)' }}>
                3D Photogrammetric Contour Scanner
              </h2>
              <p style={{ fontSize: '10px', color: 'var(--ft-t3)', margin: 0 }}>
                Upload a body photo or adjust calipers to fit your exact contours
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: '6px', border: 'none' }}
            aria-label="Close"
          >
            <X style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        {/* Body Content: Dual Pane */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          {/* Left Pane: Interactive Photo & Draggable Caliper Overlay */}
          <div
            style={{
              padding: '20px',
              borderRight: '1px solid var(--ft-rule)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#070a0f',
              overflow: 'hidden',
              userSelect: 'none',
            }}
          >
            <div
              ref={containerRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '380px',
                aspectRatio: '400 / 640',
                background: '#040609',
                border: '1px solid var(--ft-rule)',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)',
                overflow: 'hidden',
                cursor: activeDrag ? 'grabbing' : 'default',
              }}
            >
              {/* Background Image / Reference */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt="Body scan reference"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  pointerEvents: 'none',
                }}
              />

              {/* Technical Scanline Grid */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage:
                    'linear-gradient(rgba(203, 255, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(203, 255, 0, 0.03) 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                  pointerEvents: 'none',
                }}
              />

              {/* Draggable Caliper Overlay */}
              {calipers.map((c) => {
                const isLineActive = activeDrag?.id === c.id;
                const measurement = getMeasurementCm(c);

                return (
                  <div
                    key={c.id}
                    style={{
                      position: 'absolute',
                      top: `${c.yPct}%`,
                      left: 0,
                      right: 0,
                      transform: 'translateY(-50%)',
                      zIndex: 20,
                    }}
                  >
                    {/* Horizontal Guide Track */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, c.id, 'line')}
                      style={{
                        position: 'absolute',
                        left: `${c.leftPct}%`,
                        right: `${100 - c.rightPct}%`,
                        height: '2px',
                        background: 'var(--ft-lime)',
                        boxShadow: '0 0 8px rgba(203, 255, 0, 0.6)',
                        cursor: 'ns-resize',
                      }}
                    >
                      {/* Measurement Tag */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '-18px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: '#090d14',
                          border: '1px solid var(--ft-lime)',
                          padding: '1px 6px',
                          fontSize: '8px',
                          fontFamily: 'monospace',
                          color: 'var(--ft-lime)',
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                        }}
                      >
                        {c.label.toUpperCase()}: {measurement} CM
                      </div>
                    </div>

                    {/* Left Draggable Pin */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, c.id, 'left')}
                      style={{
                        position: 'absolute',
                        left: `${c.leftPct}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '14px',
                        height: '24px',
                        background: '#0c131d',
                        border: `2px solid ${isLineActive ? '#FFFFFF' : 'var(--ft-lime)'}`,
                        borderRadius: '2px',
                        cursor: 'ew-resize',
                        boxShadow: '0 0 10px rgba(0,0,0,0.8)',
                        zIndex: 30,
                      }}
                    />

                    {/* Right Draggable Pin */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, c.id, 'right')}
                      style={{
                        position: 'absolute',
                        left: `${c.rightPct}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '14px',
                        height: '24px',
                        background: '#0c131d',
                        border: `2px solid ${isLineActive ? '#FFFFFF' : 'var(--ft-lime)'}`,
                        borderRadius: '2px',
                        cursor: 'ew-resize',
                        boxShadow: '0 0 10px rgba(0,0,0,0.8)',
                        zIndex: 30,
                      }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Instruction Affordance */}
            <p style={{ fontSize: '10px', color: 'var(--ft-t3)', marginTop: '8px', textAlign: 'center' }}>
              Drag pins horizontally to fit body width · Drag lines vertically to align height
            </p>
          </div>

          {/* Right Pane: Controls, AI Analysis, Live Biometric Readout */}
          <div
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              overflowY: 'auto',
            }}
          >
            {/* Upload & Sample Controls */}
            <div>
              <p className="eyebrow" style={{ marginBottom: '8px' }}>
                Photo Source
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-ghost"
                  style={{ flex: 1, padding: '10px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Upload style={{ width: '13px', height: '13px' }} />
                  Upload Photo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => setImageSrc(getReferencePoseSvg(isMale))}
                  className="btn-ghost"
                  style={{ padding: '10px 14px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  title="Reset to athletic silhouette"
                >
                  <RefreshCw style={{ width: '13px', height: '13px' }} />
                  Reference
                </button>
              </div>
            </div>

            {/* AI Vision Action Button */}
            <div>
              <button
                onClick={runAiVision}
                disabled={analyzingAI}
                className="btn-lime"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '12px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: analyzingAI ? 0.7 : 1,
                  cursor: analyzingAI ? 'wait' : 'pointer',
                }}
              >
                {analyzingAI ? (
                  <>
                    <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
                    Analyzing Photo Biometrics with Gemini...
                  </>
                ) : (
                  <>
                    <Sparkles style={{ width: '14px', height: '14px' }} />
                    Run AI Vision Landmark Detection
                  </>
                )}
              </button>
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255, 68, 68, 0.08)', border: '1px solid rgba(255, 68, 68, 0.3)', color: '#FF4444', fontSize: '11px' }}>
                <p style={{ margin: 0, fontWeight: 500 }}>{error}</p>
                <p style={{ margin: '4px 0 0', fontSize: '10px', color: 'var(--ft-t3)' }}>
                  Interactive calipers remain fully functional for manual contour fitting.
                </p>
              </div>
            )}

            {/* AI Assessment Card (When available) */}
            {aiResult && (
              <div
                style={{
                  padding: '12px 14px',
                  background: 'rgba(203, 255, 0, 0.04)',
                  border: '1px solid rgba(203, 255, 0, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--ft-lime)', fontWeight: 600, textTransform: 'uppercase' }}>
                    AI Analysis // {aiResult.somatotype}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck style={{ width: '11px', height: '11px', color: 'var(--ft-lime)' }} />
                    <span style={{ fontSize: '9px', color: 'var(--ft-t3)', textTransform: 'uppercase' }}>
                      {aiResult.provenance?.source === 'gemini' ? 'Gemini 2.0 Flash' : 'Engine Fallback'} · {aiResult.confidence}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--ft-t2)', margin: 0, lineHeight: 1.4 }}>
                  {aiResult.feedback}
                </p>
                <div style={{ fontSize: '10px', color: 'var(--ft-t3)', marginTop: '4px' }}>
                  Est. Body Fat: <strong style={{ color: 'var(--ft-t1)' }}>{aiResult.estimatedBodyFatPct}%</strong>
                </div>
              </div>
            )}

            {/* Live Calibrated Biometrics */}
            <div>
              <p className="eyebrow" style={{ marginBottom: '10px' }}>
                Live Calibrated Dimensions
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <div className="card-ft" style={{ padding: '10px 12px' }}>
                  <p className="eyebrow">Shoulder Span</p>
                  <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)' }}>
                    {shoulderCm} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>CM</span>
                  </p>
                </div>
                <div className="card-ft" style={{ padding: '10px 12px' }}>
                  <p className="eyebrow">Chest / Bust</p>
                  <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)' }}>
                    {chestCm} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>CM</span>
                  </p>
                </div>
                <div className="card-ft" style={{ padding: '10px 12px' }}>
                  <p className="eyebrow">Waist Cinch</p>
                  <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)' }}>
                    {waistCm} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>CM</span>
                  </p>
                </div>
                <div className="card-ft" style={{ padding: '10px 12px' }}>
                  <p className="eyebrow">Hips / Glutes</p>
                  <p className="data-val" style={{ fontSize: '16px', color: 'var(--ft-t1)' }}>
                    {hipCm} <span style={{ fontSize: '9px', color: 'var(--ft-t3)' }}>CM</span>
                  </p>
                </div>
              </div>

              {/* Calculated WHR Index */}
              <div
                style={{
                  marginTop: '8px',
                  padding: '10px 14px',
                  background: 'var(--ft-surface)',
                  border: '1px solid var(--ft-rule)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span className="eyebrow">Waist-to-Hip Ratio</span>
                  <p className="data-val" style={{ fontSize: '18px', color: 'var(--ft-lime)', margin: '2px 0 0' }}>
                    {whrRatio}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '3px 8px',
                    border: '1px solid rgba(203, 255, 0, 0.3)',
                    color: 'var(--ft-lime)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {whrRatio <= 0.75 ? 'Optimal Hourglass / V-Taper' : 'Athletic Frame'}
                </span>
              </div>
            </div>

            {/* Footer Action */}
            <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--ft-rule)' }}>
              <button onClick={onClose} className="btn-ghost" style={{ padding: '10px 20px', fontSize: '11px' }}>
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="btn-lime"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', fontSize: '11px' }}
              >
                <Check style={{ width: '14px', height: '14px' }} />
                Apply Biometrics to 3D Model
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
