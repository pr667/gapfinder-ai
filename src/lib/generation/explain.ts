import { streamText } from 'ai';
import { friendly, modelFor } from './llm';

export type ExplainPassage = { n: number; label: string; text: string };

/** Streams an explanation that may only use the numbered passages it is given. */
export function streamExplanation(input: {
  question: string;
  topic: string | null;
  passages: ExplainPassage[];
  history: { role: 'user' | 'assistant'; content: string }[];
}) {
  const { model, providerOptions } = modelFor('main');
  const failure: { error: Error | null } = { error: null };
  const context = input.passages.map((p) => `[${p.n}] (${p.label})\n${p.text}`).join('\n\n');
  const result = streamText({
    model,
    providerOptions,
    temperature: 0.2,
    maxOutputTokens: 700,
    maxRetries: 2,
    instructions: `[task:explain]
You are a study helper that explains topics using only the numbered passages from the student's own uploaded material, shown below.
Rules:
- Use only facts stated in the passages. Do not add facts, examples or definitions from your own knowledge, even if you are sure they are right.
- After each claim, cite the passage it came from like [1] or [2].
- If the passages do not contain the answer, say: "Your uploaded material doesn't cover this." Then mention what closely related point the passages do cover, if any.
- Explain simply, as to a student revising for an exam. Short paragraphs or a short list. No headings.
${input.topic ? `The student is currently revising the topic: ${input.topic}.` : ''}

PASSAGES FROM THE STUDENT'S MATERIAL:
${context}`,
    messages: [...input.history.slice(-4), { role: 'user' as const, content: input.question }],
    onError: ({ error }) => {
      failure.error = friendly(error);
    },
  });
  // streamText never throws; the route reads `failure` after the stream ends.
  return { textStream: result.textStream, failure };
}
