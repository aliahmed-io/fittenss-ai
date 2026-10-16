import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  type Part,
} from '@google/generative-ai';

export const GEMINI_MODEL = 'gemini-2.0-flash';
const REQUEST_TIMEOUT_MS = 25_000;

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Calls Gemini and returns validated JSON, or null when the key is missing,
 * the call fails/times out, or the output does not match the expected shape.
 * Callers must supply a deterministic fallback for the null case.
 */
export async function generateJson<T>(
  parts: (string | Part)[],
  validate: (value: unknown) => value is T,
  temperature = 0.2
): Promise<T | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: GEMINI_MODEL,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ],
      generationConfig: { temperature, topP: 0.95, responseMimeType: 'application/json' },
    });

    const result = await Promise.race([
      model.generateContent(parts),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Gemini request timed out')), REQUEST_TIMEOUT_MS);
      }),
    ]);

    const parsed: unknown = JSON.parse(result.response.text());
    return validate(parsed) ? parsed : null;
  } catch (err) {
    console.error('[gemini]', err instanceof Error ? err.message : 'unknown error');
    return null;
  }
}
