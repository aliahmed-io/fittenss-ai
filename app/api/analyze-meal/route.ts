import { NextRequest, NextResponse } from 'next/server';
import { GEMINI_MODEL, generateJson } from '@/lib/ai/gemini';
import { isRecord } from '@/lib/ai/coachSchemas';
import { checkRateLimit, clientKey, exceedsContentLength } from '@/lib/ai/rateLimiter';
import type { Provenance } from '@/lib/fitness/types';

export const runtime = 'nodejs';

export interface FoodItem {
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface MealScanResult {
  foods: FoodItem[];
  confidence: 'high' | 'medium' | 'low';
  note?: string;
  provenance: Provenance;
}

const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_CHARS = 5_500_000;
const RATE = { limit: 10, windowMs: 60_000 } as const;
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const CONFIDENCES = ['high', 'medium', 'low'] as const;

const PROMPT = `You are a professional nutritionist and food recognition AI.
Analyze this meal photo carefully and identify every visible food item.

Return ONLY a valid JSON object — no markdown, no explanation, no extra text — in this exact schema:
{
  "foods": [
    {
      "name": "string — specific food name, e.g. 'Grilled Chicken Breast'",
      "amount": number — estimated portion size,
      "unit": "string — g | ml | piece | cup | tbsp | tsp",
      "calories": number — kcal for this portion,
      "protein": number — grams,
      "carbs": number — grams,
      "fat": number — grams,
      "fiber": number — grams
    }
  ],
  "confidence": "high | medium | low",
  "note": "optional string — any important caveat about the analysis"
}

Rules:
- List EVERY distinct food item visible, including sauces, dressings, garnishes.
- Use common weight/volume units appropriate for the food type.
- All numbers must be reasonable estimates based on typical restaurant or home-cooked portions.
- If image is unclear or not food, set "foods": [] and confidence "low" with a note.
- Return ONLY the JSON object, nothing else.`;

function bounded(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;
}

function normalizeMeal(value: unknown): Omit<MealScanResult, 'provenance'> | null {
  if (!isRecord(value) || !Array.isArray(value.foods)) return null;
  const confidence = CONFIDENCES.find((c) => c === value.confidence) ?? 'low';
  const foods: FoodItem[] = [];
  for (const raw of value.foods.slice(0, 20)) {
    if (!isRecord(raw)) continue;
    const calories = bounded(raw.calories, 0, 3000);
    const protein = bounded(raw.protein, 0, 300);
    const carbs = bounded(raw.carbs, 0, 500);
    const fat = bounded(raw.fat, 0, 300);
    const amount = bounded(raw.amount, 0, 5000);
    if (
      typeof raw.name !== 'string' || raw.name.trim() === '' || typeof raw.unit !== 'string' ||
      calories === null || protein === null || carbs === null || fat === null || amount === null
    ) {
      continue;
    }
    foods.push({
      name: raw.name.trim().slice(0, 80),
      amount,
      unit: raw.unit.slice(0, 12),
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
      fiber: Math.round(bounded(raw.fiber, 0, 100) ?? 0),
    });
  }
  const note = typeof value.note === 'string' ? value.note.slice(0, 240) : undefined;
  return note ? { foods, confidence, note } : { foods, confidence };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limit = checkRateLimit(clientKey(req.headers, 'meal-scan'), RATE);
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
  const mimeType = MIME_TYPES.find((m) => m === body.mimeType);
  if (!image || !mimeType) {
    return NextResponse.json({ error: 'A JPEG, PNG or WEBP image is required.' }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: 'Image is too large.' }, { status: 413 });
  }

  const raw = await generateJson([{ inlineData: { mimeType, data: image } }, PROMPT], isRecord, 0.1);
  const meal = raw ? normalizeMeal(raw) : null;
  if (meal) {
    const result: MealScanResult = {
      ...meal,
      provenance: { source: 'gemini', confidence: meal.confidence, model: GEMINI_MODEL },
    };
    return NextResponse.json(result);
  }

  const fallback: MealScanResult = {
    foods: [],
    confidence: 'low',
    note: 'AI meal recognition is unavailable right now. Add the meal manually or try again later.',
    provenance: { source: 'engine-fallback', confidence: 'low' },
  };
  return NextResponse.json(fallback);
}
