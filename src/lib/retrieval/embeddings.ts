/**
 * Optional semantic layer. Off unless EMBEDDING_API_KEY is set. Every call is
 * wrapped so that a failing embeddings provider degrades to BM25-only rather
 * than breaking the app.
 */
import { embedMany } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const DIMS = 768;

export const embeddingsEnabled = () => Boolean(process.env.EMBEDDING_API_KEY);

function model() {
  const provider = createOpenAICompatible({
    name: 'embeddings',
    apiKey: process.env.EMBEDDING_API_KEY,
    baseURL: process.env.EMBEDDING_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
  });
  return provider.embeddingModel(process.env.EMBEDDING_MODEL || 'gemini-embedding-001');
}

/** Keeps storage small. Truncation is valid for Matryoshka models (Gemini, OpenAI v3). */
function compact(vector: number[]) {
  const v = vector.length > 1024 ? vector.slice(0, DIMS) : vector;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => Math.round((x / norm) * 1e4) / 1e4);
}

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!embeddingsEnabled() || !texts.length) return null;
  try {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 48) {
      const { embeddings } = await embedMany({ model: model(), values: texts.slice(i, i + 48), maxRetries: 2 });
      out.push(...embeddings.map(compact));
    }
    return out;
  } catch (error) {
    console.warn('[embeddings] unavailable, falling back to BM25 only:', (error as Error).message);
    return null;
  }
}

export function cosine(a: number[], b: number[]) {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // vectors are stored normalised
}
