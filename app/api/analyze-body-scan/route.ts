import { NextRequest, NextResponse } from 'next/server';
import { GEMINI_MODEL, generateJson } from '@/lib/ai/gemini';
import { isRecord } from '@/lib/ai/coachSchemas';
import { checkRateLimit, clientKey, exceedsContentLength } from '@/lib/ai/rateLimiter';
import { DEFAULT_HEIGHT_CM, generateSmartMeasurements, type Gender } from '@/lib/bodyModel/anthropometry';
import type { Provenance } from '@/lib/fitness/types';

export const runtime = 'nodejs';

export interface BodyScanResult {
  shoulderWidthCm: number;
  chestCircumferenceCm: number;
  waistCircumferenceCm: number;
  hipCircumferenceCm: number;
  thighCircumferenceCm: number;
  estimatedBodyFatPct: number;
  somatotype: 'Ectomorph' | 'Mesomorph' | 'Endomorph';
  confidence: 'high' | 'medium' | 'low';
  morphOverrides: Record<string, number>;
  feedback: string;
  provenance: Provenance;
}

const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_CHARS = 5_500_000;
const RATE = { limit: 8, windowMs: 60_000 } as const;
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type ImageMime = (typeof MIME_TYPES)[number];

const SYSTEM_PROMPT = `You are an elite anthropometry and computer vision specialist in sports science and biomechanics.
Analyze this human body photo (front, 3/4, or side silhouette/fitness photo) to estimate accurate anthropometric dimensions and body composition.

The user's stated height is: {HEIGHT_CM} cm, and biological gender profile is: {GENDER}.

Using the stated height as the absolute metric reference scale, estimate the person's:
1. Biacromial Shoulder Width (cm) [typical adult: 36-52 cm]
2. Chest / Bust Circumference (cm) [typical adult: 75-120 cm]
3. Natural Waist Circumference (narrowest cinch above iliac crest) (cm) [typical adult: 58-105 cm]
4. Hip / Glute Circumference (widest trochanteric span) (cm) [typical adult: 82-125 cm]
5. Thigh Circumference (mid-quad) (cm) [typical adult: 46-70 cm]
6. Estimated Body Fat Percentage (%) [typical male: 8-30%, female: 14-36%]
7. Somatotype: Ectomorph (lean/narrow), Mesomorph (muscular/athletic), or Endomorph (wider/higher adiposity)

Return ONLY a valid JSON object matching this exact schema:
{
  "shoulderWidthCm": number,
  "chestCircumferenceCm": number,
  "waistCircumferenceCm": number,
  "hipCircumferenceCm": number,
  "thighCircumferenceCm": number,
  "estimatedBodyFatPct": number,
  "somatotype": "Ectomorph" | "Mesomorph" | "Endomorph",
  "confidence": "high" | "medium" | "low",
  "morphOverrides": {
    "Shoulders": number,
    "Chest": number,
    "Breast": number,
    "Waist": number,
    "Hip Girth": number,
    "Thigh Girth": number,
    "Calf Girth": number,
    "Upper Arm Girth": number,
    "Stomach Form": number
  },
  "feedback": "A concise 2-sentence biomechanical assessment of the silhouette, frame symmetry, and waist-to-hip ratio."
}

Rules:
- For "Shoulders": return biacromial diameter in cm scaled to slider range (approx 11.5 - 17.5).
- For "Chest" / "Breast": return circumference in cm (approx 78 - 118).
- For "Waist": return natural waist in cm (approx 60 - 100).
- For "Hip Girth": return circumference in cm (approx 84 - 120).
- For "Thigh Girth": return circumference in cm (approx 48 - 68).
- For "Stomach Form": return 0.2 (flat/ripped abs) to 1.8 (distended belly).
- If the image does not depict a human body or is completely unreadable, return reasonable baseline numbers for {GENDER} at {HEIGHT_CM} cm with confidence "low" and explain in feedback.
- Output ONLY the JSON object, with no markdown formatting or markdown fences.`;

const SOMATOTYPES = ['Ectomorph', 'Mesomorph', 'Endomorph'] as const;
const CONFIDENCES = ['high', 'medium', 'low'] as const;

function bounded(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;
}

/** Validates the model output into a BodyScanResult (without provenance). */
function normalizeScan(value: unknown): Omit<BodyScanResult, 'provenance'> | null {
  if (!isRecord(value) || !isRecord(value.morphOverrides)) return null;
  const shoulder = bounded(value.shoulderWidthCm, 25, 70);
  const chest = bounded(value.chestCircumferenceCm, 55, 160);
  const waist = bounded(value.waistCircumferenceCm, 45, 160);
  const hip = bounded(value.hipCircumferenceCm, 60, 170);
  const thigh = bounded(value.thighCircumferenceCm, 30, 95);
  const bodyFat = bounded(value.estimatedBodyFatPct, 3, 60);
  const somatotype = SOMATOTYPES.find((s) => s === value.somatotype);
  const confidence = CONFIDENCES.find((c) => c === value.confidence);
  if (
    shoulder === null || chest === null || waist === null || hip === null || thigh === null ||
    bodyFat === null || !somatotype || !confidence || typeof value.feedback !== 'string'
  ) {
    return null;
  }

  const morphOverrides: Record<string, number> = {};
  for (const [key, v] of Object.entries(value.morphOverrides)) {
    if (typeof v === 'number' && Number.isFinite(v) && key.length <= 32) morphOverrides[key] = v;
  }
  return {
    shoulderWidthCm: shoulder,
    chestCircumferenceCm: chest,
    waistCircumferenceCm: waist,
    hipCircumferenceCm: hip,
    thighCircumferenceCm: thigh,
    estimatedBodyFatPct: bodyFat,
    somatotype,
    confidence,
    morphOverrides,
    feedback: value.feedback.slice(0, 500),
  };
}

/** Deterministic population-average estimate scaled to the user's height. */
function fallbackScan(gender: Gender, heightCm: number): BodyScanResult {
  const bodyFat = gender === 'female' ? 22 : 15;
  const weight = gender === 'female' ? 62 : 78;
  const scaledWeight = weight * Math.pow(heightCm / DEFAULT_HEIGHT_CM[gender], 2);
  const smart = generateSmartMeasurements(gender, heightCm, scaledWeight, bodyFat);
  const keys = ['Shoulders', 'Chest', 'Breast', 'Waist', 'Hip Girth', 'Thigh Girth', 'Calf Girth', 'Upper Arm Girth', 'Stomach Form'];
  const morphOverrides: Record<string, number> = {};
  for (const key of keys) {
    const v = smart[key];
    if (v !== undefined) morphOverrides[key] = v;
  }
  return {
    shoulderWidthCm: Math.round((smart['Shoulders'] ?? 14) * 3),
    chestCircumferenceCm: Math.round(smart['Chest'] ?? (smart['Bust Girth'] ?? 66) * 1.28),
    waistCircumferenceCm: Math.round(smart['Waist'] ?? 75),
    hipCircumferenceCm: Math.round(smart['Hip Girth'] ?? 98),
    thighCircumferenceCm: Math.round(smart['Thigh Girth'] ?? 56),
    estimatedBodyFatPct: bodyFat,
    somatotype: 'Mesomorph',
    confidence: 'low',
    morphOverrides,
    feedback:
      'AI vision is unavailable, so these are population-average proportions scaled to your height. Adjust the sliders manually or retry the scan later for a photo-based estimate.',
    provenance: { source: 'engine-fallback', confidence: 'low' },
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limit = checkRateLimit(clientKey(req.headers, 'body-scan'), RATE);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many scans. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } }
    );
  }
  if (exceedsContentLength(req.headers, MAX_BODY_BYTES)) {
    return NextResponse.json({ error: 'Image is too large.' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (!isRecord(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const image = typeof body.image === 'string' ? body.image : '';
  const mimeType: ImageMime | undefined = MIME_TYPES.find((m) => m === body.mimeType);
  const gender: Gender = body.gender === 'male' ? 'male' : 'female';
  const heightCm = bounded(body.heightCm, 100, 250) ?? DEFAULT_HEIGHT_CM[gender];

  if (!image || !mimeType) {
    return NextResponse.json({ error: 'A JPEG, PNG or WEBP image is required.' }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: 'Image is too large.' }, { status: 413 });
  }

  const prompt = SYSTEM_PROMPT.replace(/\{HEIGHT_CM\}/g, String(Math.round(heightCm))).replace(/\{GENDER\}/g, gender);
  const raw = await generateJson(
    [{ inlineData: { mimeType, data: image } }, prompt],
    isRecord,
    0.1
  );
  const scan = raw ? normalizeScan(raw) : null;
  if (scan) {
    const result: BodyScanResult = {
      ...scan,
      provenance: { source: 'gemini', confidence: scan.confidence, model: GEMINI_MODEL },
    };
    return NextResponse.json(result);
  }
  return NextResponse.json(fallbackScan(gender, heightCm));
}
