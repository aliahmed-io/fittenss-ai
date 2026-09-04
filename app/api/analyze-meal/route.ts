import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';

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
}

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

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not set. Add it to .env.local to enable meal scanning.' },
        { status: 500 }
      );
    }

    const body = await req.json() as { image: string; mimeType: string };
    const { image, mimeType } = body;

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'image and mimeType are required.' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT,      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,     threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ],
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent([
      { inlineData: { mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: image } },
      PROMPT,
    ]);

    const text = result.response.text();
    const parsed = JSON.parse(text) as MealScanResult;

    if (!Array.isArray(parsed.foods)) {
      return NextResponse.json({ error: 'Unexpected response format from AI.' }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('[analyze-meal]', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Analysis failed: ${message}` }, { status: 500 });
  }
}
