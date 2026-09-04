'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Check, Camera, Sparkles, RefreshCw } from 'lucide-react';
import { Gender } from '@/lib/bodyModel/anthropometry';
import { analyzeBodyPhoto, ScanVisionResult } from '@/lib/bodyModel/contourVision';

interface PhotoScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  gender: Gender;
  currentHeightCm: number;
  onApplyMorphs: (overrides: Record<string, number>) => void;
}

// Generate synthetic sample silhouette on initial open or sample select
function generateSampleSilhouette(sampleGender: Gender): string {
  if (typeof window === 'undefined') return '';
  const w = 400;
  const h = 600;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Dark studio background
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, w, h);

  // Render smooth anatomical silhouette
  ctx.fillStyle = '#e5e5e5';
  ctx.beginPath();

  const cx = w * 0.5;
  const headY = 80;
  const headR = 24;

  // Head
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Neck & Torso
  ctx.beginPath();
  ctx.moveTo(cx - 12, headY + headR);
  ctx.lineTo(cx - 12, headY + 38);

  const isF = sampleGender === 'female';
  const shoulderHalfW = isF ? 50 : 64;
  const waistHalfW = isF ? 32 : 40;
  const hipHalfW = isF ? 56 : 46;
  const thighHalfW = isF ? 32 : 28;

  // Left shoulder to hip to foot
  ctx.lineTo(cx - shoulderHalfW, 145);
  ctx.lineTo(cx - (shoulderHalfW - 8), 185); // Chest
  ctx.lineTo(cx - waistHalfW, 235);          // Waist
  ctx.lineTo(cx - hipHalfW, 305);            // Hip
  ctx.lineTo(cx - thighHalfW, 390);          // Thigh
  ctx.lineTo(cx - 18, 480);                  // Knee
  ctx.lineTo(cx - 16, 550);                  // Calf & Foot
  ctx.lineTo(cx - 6, 560);
  ctx.lineTo(cx, 370);                       // Inseam center

  // Right leg & side
  ctx.lineTo(cx + 6, 560);
  ctx.lineTo(cx + 16, 550);
  ctx.lineTo(cx + 18, 480);
  ctx.lineTo(cx + thighHalfW, 390);
  ctx.lineTo(cx + hipHalfW, 305);
  ctx.lineTo(cx + waistHalfW, 235);
  ctx.lineTo(cx + (shoulderHalfW - 8), 185);
  ctx.lineTo(cx + shoulderHalfW, 145);
  ctx.lineTo(cx + 12, headY + 38);
  ctx.lineTo(cx + 12, headY + headR);
  ctx.closePath();
  ctx.fill();

  return canvas.toDataURL('image/png');
}

// Draw HUD landmark calipers on canvas overlay
function drawScanOverlay(canvas: HTMLCanvasElement | null, img: HTMLImageElement, result: ScanVisionResult) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  // Subtle dark scanline overlay
  ctx.fillStyle = 'rgba(10, 10, 10, 0.25)';
  ctx.fillRect(0, 0, w, h);

  // Draw neon measurement lines
  result.landmarks.forEach((lm) => {
    const y = lm.yNorm * h;
    const x1 = lm.x1Norm * w;
    const x2 = lm.x2Norm * w;

    // Caliper horizontal guide
    ctx.strokeStyle = '#CBFF00';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Tick markers at edges
    ctx.fillStyle = '#CBFF00';
    ctx.fillRect(x1 - 2, y - 6, 4, 12);
    ctx.fillRect(x2 - 2, y - 6, 4, 12);

    // Label & measurement tag
    ctx.font = '600 10px monospace';
    ctx.fillStyle = '#0a0a0a';
    const text = `${lm.label.toUpperCase()}: ${lm.estimatedCm}CM`;
    const textMetrics = ctx.measureText(text);
    const bgW = textMetrics.width + 10;
    const bgX = Math.min(w - bgW - 8, Math.max(8, (x1 + x2) * 0.5 - bgW * 0.5));

    ctx.fillStyle = '#CBFF00';
    ctx.fillRect(bgX, y - 18, bgW, 14);
    ctx.fillStyle = '#000000';
    ctx.fillText(text, bgX + 5, y - 7);
  });
}

export default function PhotoScanModal({
  isOpen,
  onClose,
  gender,
  currentHeightCm,
  onApplyMorphs,
}: PhotoScanModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return generateSampleSilhouette(gender);
    }
    return null;
  });
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ScanVisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Run computer vision analysis when imageSrc changes or modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const src = imageSrc || generateSampleSilhouette(gender);

    const timer = setTimeout(() => {
      if (!isMounted) return;
      setScanning(true);
      setError(null);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src;
      img.onload = async () => {
        try {
          const result = await analyzeBodyPhoto(img, gender, currentHeightCm);
          if (isMounted) {
            setScanResult(result);
            setScanning(false);
            drawScanOverlay(canvasRef.current, img, result);
          }
        } catch (err) {
          if (isMounted) {
            setError(err instanceof Error ? err.message : 'Vision analysis failed');
            setScanning(false);
          }
        }
      };
      img.onerror = () => {
        if (isMounted) {
          setError('Failed to load silhouette image');
          setScanning(false);
        }
      };
    }, 25);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, imageSrc, gender, currentHeightCm]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setImageSrc(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApply = () => {
    if (scanResult) {
      onApplyMorphs(scanResult.morphOverrides);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
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
          maxWidth: '860px',
          background: 'var(--ft-bg)',
          border: '1px solid var(--ft-rule)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera style={{ width: '16px', height: '16px', color: 'var(--ft-lime)' }} />
            <span id="photo-scan-title" className="brand-title" style={{ fontSize: '14px', letterSpacing: '0.08em' }}>
              PHOTO BIOMETRIC CONTOUR SCANNER
            </span>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost"
            style={{ padding: '6px', display: 'flex', alignItems: 'center' }}
            aria-label="Close modal"
          >
            <X style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', overflow: 'hidden', flex: 1 }}>
          {/* Left Canvas Preview with Calipers */}
          <div
            style={{
              background: '#080808',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRight: '1px solid var(--ft-rule)',
              position: 'relative',
            }}
          >
            <canvas
              ref={canvasRef}
              width={320}
              height={480}
              style={{
                width: '100%',
                maxHeight: '480px',
                objectFit: 'contain',
                border: '1px solid var(--ft-rule)',
                background: '#0d0d0d',
              }}
            />

            {scanning && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.65)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <RefreshCw className="animate-spin" style={{ width: '24px', height: '24px', color: 'var(--ft-lime)' }} />
                <span style={{ fontSize: '11px', letterSpacing: '0.08em', color: 'var(--ft-lime)', textTransform: 'uppercase' }}>
                  Extracting Contour Landmarks...
                </span>
              </div>
            )}
          </div>

          {/* Right Controls & Biometric Readout */}
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <div>
              <p className="eyebrow" style={{ marginBottom: '8px' }}>Input Source</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-ghost"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '11px' }}
                >
                  <Upload style={{ width: '12px', height: '12px', color: 'var(--ft-lime)' }} />
                  Upload Photo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => setImageSrc(generateSampleSilhouette(gender))}
                  className="btn-ghost"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '11px' }}
                >
                  <Sparkles style={{ width: '12px', height: '12px' }} />
                  Reset to Reference Silhouette
                </button>
              </div>
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255, 50, 50, 0.1)', border: '1px solid #FF3344', color: '#FF3344', fontSize: '11px' }}>
                {error}
              </div>
            )}

            {/* Extracted Biometric Readout */}
            {scanResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p className="eyebrow">Detected Silhouette Anthropometrics</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div className="card-ft" style={{ padding: '10px' }}>
                    <p className="eyebrow">Measured WHR</p>
                    <p className="data-val" style={{ fontSize: '18px', color: 'var(--ft-lime)' }}>
                      {scanResult.measuredWhr}
                    </p>
                  </div>
                  <div className="card-ft" style={{ padding: '10px' }}>
                    <p className="eyebrow">Target Height</p>
                    <p className="data-val" style={{ fontSize: '18px' }}>
                      {scanResult.measuredHeightCm} <span style={{ fontSize: '10px' }}>CM</span>
                    </p>
                  </div>
                  <div className="card-ft" style={{ padding: '10px' }}>
                    <p className="eyebrow">Confidence</p>
                    <p className="data-val" style={{ fontSize: '18px', color: 'var(--ft-t2)' }}>
                      {Math.round(scanResult.confidence * 100)}%
                    </p>
                  </div>
                </div>

                <div style={{ border: '1px solid var(--ft-rule)', background: 'var(--ft-surface)', padding: '12px' }}>
                  <p className="eyebrow" style={{ marginBottom: '8px' }}>Estimated Girths & Dimensions</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {scanResult.landmarks.map((lm) => (
                      <div key={lm.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                        <span style={{ color: 'var(--ft-t3)' }}>{lm.label}:</span>
                        <span className="data-val">{lm.estimatedCm} cm</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Footer Action */}
            <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} className="btn-ghost" style={{ padding: '8px 18px', fontSize: '11px' }}>
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={!scanResult || scanning}
                className="btn-lime"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 20px', fontSize: '11px' }}
              >
                <Check style={{ width: '14px', height: '14px' }} />
                Apply Scan to 3D Model
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
