import { z } from 'zod';
import { generateJson } from './llm';

const text = z.string().nullish().transform((v) => (v ?? '').trim());

const schema = z.object({
  questions: z.array(
    z.object({
      passage: z.string(),
      question: z.string().min(8),
      options: z.array(z.coerce.string()).nullish().transform((v) => v ?? []),
      correct_index: z.coerce.number().nullish().transform((v) => v ?? 0),
      answer: text,
      explanation: z.string().min(8),
      evidence: z.string().min(8),
      concept: text,
    }),
  ),
});

export type QuestionRequest = { ref: string; type: 'mcq' | 'short'; topic: string; passage: string };
export type DraftQuestion = z.infer<typeof schema>['questions'][number];

/**
 * Writes one question per passage. The passages are the model's only source:
 * each question must carry a verbatim quote, which the caller verifies
 * against the passage before the question is accepted.
 */
export async function writeQuestions(requests: QuestionRequest[]): Promise<DraftQuestion[]> {
  const result = await generateJson({
    tier: 'main',
    schema,
    maxOutputTokens: 450 * requests.length + 400,
    temperature: 0.4,
    instructions: `[task:quiz]
You write diagnostic exam questions for a student, strictly from the passages provided from the student's own notes.
Rules:
- Write exactly one question for each passage, of the requested type.
- The question must be answerable from that passage alone. Do not use any outside knowledge, and do not ask about anything the passage does not state.
- Test understanding of a specific idea, not trivia such as page numbers or wording.
- Do not mention "the passage" or "the notes" in the question; it should read like an exam question.
- "mcq": 4 options, exactly one correct, wrong options plausible but clearly wrong according to the passage. Set "correct_index" (0-3) and put the correct option's text in "answer".
- "short": a question answerable in one or two sentences. Put a model answer in "answer". Leave "options" empty.
- "evidence": an exact quote of 6 to 30 words copied character for character from the passage that proves the answer.
- "explanation": one or two sentences on why the answer is correct, based on the passage.
- "concept": the specific idea tested, in 2 to 5 words.
JSON shape: {"questions":[{"passage":"P1","question":"","options":["","","",""],"correct_index":0,"answer":"","explanation":"","evidence":"","concept":""}]}`,
    prompt: requests.map((r) => `<passage id="${r.ref}" type="${r.type}" topic="${r.topic}">\n${r.passage}\n</passage>`).join('\n\n'),
  });
  return result.questions;
}
