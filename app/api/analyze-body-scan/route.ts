import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';

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
}

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

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured. Add it to .env.local to enable AI vision analysis.' },
        { status: 500 }
      );
    }

    const body = (await req.json()) as {
      image: string;
      mimeType: string;
      gender?: 'female' | 'male';
      heightCm?: number;
    };
    const { image, mimeType, gender = 'female', heightCm = 170 } = body;

    if (!image || !mimeType) {
      return NextResponse.json({ error: 'image and mimeType are required.' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ],
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        responseMimeType: 'application/json',
      },
    });

    const prompt = SYSTEM_PROMPT.replace(/\{HEIGHT_CM\}/g, String(heightCm)).replace(
      /\{GENDER\}/g,
      gender
    );

    const result = await model.generateContent([
      { inlineData: { mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: image } },
      prompt,
    ]);

    const text = result.response.text();
    const parsed = JSON.parse(text) as BodyScanResult;

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('[analyze-body-scan]', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Body scan analysis failed: ${message}` }, { status: 500 });
  }
}
