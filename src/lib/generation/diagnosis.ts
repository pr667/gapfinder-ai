import { z } from 'zod';
import { generateJson } from './llm';

const schema = z.object({ topics: z.array(z.object({ ref: z.string(), diagnosis: z.string().min(4), tip: z.string().min(4) })) });

export type DiagnosisRequest = {
  ref: string;
  topic: string;
  stats: string;
  misses: { question: string; studentAnswer: string; correctAnswer: string; concept: string }[];
};
export type Diagnosis = z.infer<typeof schema>['topics'][number];

/**
 * Reads the wrong answers per topic and names the pattern behind them.
 * Input is quiz results only; the scores and the weak/medium/strong label are
 * computed in code (src/lib/analysis), never by the model.
 */
export async function diagnoseTopics(requests: DiagnosisRequest[]): Promise<Diagnosis[]> {
  const result = await generateJson({
    tier: 'fast',
    schema,
    maxOutputTokens: 200 * requests.length + 300,
    temperature: 0.2,
    instructions: `[task:diagnosis]
You are a tutor reading a student's quiz mistakes, topic by topic.
For each topic write:
- "diagnosis": one sentence naming the specific misunderstanding the wrong answers show (for example which two ideas are being confused, or which step is missing). Speak to the student ("you"). Base it only on the mistakes listed. Do not restate the score.
- "tip": one concrete revision action for this topic that targets that misunderstanding (for example what to compare, draw, or practise). Under 25 words.
JSON shape: {"topics":[{"ref":"T1","diagnosis":"","tip":""}]}`,
    prompt: requests
      .map(
        (r) =>
          `<topic ref="${r.ref}" name="${r.topic}" result="${r.stats}">\n${r.misses
            .map((m) => `- Asked (${m.concept || 'concept'}): ${m.question}\n  Student: ${m.studentAnswer || '(left blank)'}\n  Correct: ${m.correctAnswer}`)
            .join('\n')}\n</topic>`,
      )
      .join('\n\n'),
  });
  return result.topics;
}
