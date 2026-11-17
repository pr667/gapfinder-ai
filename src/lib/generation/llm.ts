// Generation never reads the database; retrieval never calls the model.
import { APICallError, generateText } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import type { z } from 'zod';

export class LlmError extends Error {}

export type Tier = 'main' | 'fast';

export function modelFor(tier: Tier) {
  if (!process.env.GROQ_API_KEY) {
    throw new LlmError('GROQ_API_KEY is not set. Add a free key from console.groq.com to your environment variables.');
  }
  const id =
    tier === 'main'
      ? process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
      : process.env.GROQ_FAST_MODEL || process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY, baseURL: process.env.GROQ_BASE_URL || undefined });
  // gpt-oss models reason before answering; "low" keeps them fast and cheap.
  const providerOptions = id.startsWith('openai/gpt-oss') ? { groq: { reasoningEffort: 'low' as const } } : undefined;
  return { model: groq(id), providerOptions, id };
}

export function friendly(error: unknown): Error {
  if (error instanceof LlmError) return error;
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) return new LlmError('Groq rate limit reached (free tier). Wait about a minute and try again.');
    if (error.statusCode === 401) return new LlmError('Groq rejected the API key. Check GROQ_API_KEY.');
    if (error.statusCode === 404 || /model/i.test(error.message)) {
      return new LlmError(`Groq could not run the configured model (${error.message}). Set GROQ_MODEL to a model listed in your Groq console.`);
    }
    return new LlmError(`Groq request failed: ${error.message}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in the response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Generates and validates JSON, with one corrective retry. */
export async function generateJson<T>(options: {
  tier: Tier;
  instructions: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<T> {
  const { model, providerOptions } = modelFor(options.tier);
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    let finishReason: string;
    try {
      ({ text, finishReason } = await generateText({
        model,
        providerOptions,
        instructions: `${options.instructions}\n\nRespond with one valid JSON object and nothing else. No markdown fences, no commentary.`,
        prompt: problem ? `${options.prompt}\n\nYour previous reply was rejected (${problem}). Return corrected JSON only.` : options.prompt,
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: (options.maxOutputTokens ?? 2200) + 3000,
        maxRetries: 2,
      }));
    } catch (error) {
      throw friendly(error);
    }
    if (finishReason === 'length') {
    problem = 'the reply was cut off; keep it shorter';
     continue;
    }
    try {
      const parsed = options.schema.safeParse(extractJson(text));
      if (parsed.success) return parsed.data;
      problem = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    } catch (error) {
      problem = (error as Error).message;
    }
  }
  throw new LlmError(`The model returned output that could not be validated (${problem}). Try again.`);
}
