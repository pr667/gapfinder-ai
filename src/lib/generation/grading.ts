import { z } from 'zod';
import { generateJson } from './llm';

// Accept "Correct", "partially correct" and similar, and map them to the three verdicts.
const verdict = z.string().transform((v): 'correct' | 'partial' | 'incorrect' => {
  const s = v.trim().toLowerCase();
  return s.startsWith('part') ? 'partial' : s.startsWith('correct') ? 'correct' : 'incorrect';
});

const schema = z.object({
  grades: z.array(z.object({ ref: z.string(), verdict, feedback: z.string().min(4) })),
});

export type GradeRequest = { ref: string; question: string; passage: string; modelAnswer: string; studentAnswer: string };
export type Grade = z.infer<typeof schema>['grades'][number];

/** Marks free-text answers against the source passage and explains the mark. */
export async function gradeShortAnswers(requests: GradeRequest[]): Promise<Grade[]> {
  const result = await generateJson({
    tier: 'main',
    schema,
    maxOutputTokens: 260 * requests.length + 300,
    temperature: 0,
    instructions: `[task:grading]
You mark a student's short answers. The source passage is the only authority: judge each answer against the passage and the model answer, not against your own knowledge.
- "correct": the key idea is right, even if worded differently or briefly.
- "partial": some of the key idea is right but an essential part is missing or wrong.
- "incorrect": wrong, irrelevant, or contradicts the passage.
- "feedback": speak to the student ("you"). Say what was right, what was missing or wrong, and what the passage actually says. Two sentences at most.
JSON shape: {"grades":[{"ref":"A1","verdict":"partial","feedback":""}]}`,
    prompt: requests
      .map(
        (r) =>
          `<item ref="${r.ref}">\nPassage: ${r.passage}\nQuestion: ${r.question}\nModel answer: ${r.modelAnswer}\nStudent answer: ${r.studentAnswer}\n</item>`,
      )
      .join('\n\n'),
  });
  return result.grades;
}
