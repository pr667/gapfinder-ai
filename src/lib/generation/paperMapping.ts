import { z } from 'zod';
import { generateJson } from './llm';

const schema = z.object({ choices: z.array(z.object({ q: z.coerce.number(), topic: z.coerce.number() })) });

export type MappingItem = { question: string; candidates: string[] };

/**
 * Retrieval has already shortlisted up to three candidate topics per question.
 * The model only picks among them (or 0 for "none fits").
 * Returns, per item, the index into `candidates` or -1.
 */
export async function pickTopics(items: MappingItem[]): Promise<number[]> {
  const result = await generateJson({
    tier: 'fast',
    schema,
    maxOutputTokens: 1200,
    temperature: 0,
    instructions: `[task:paper_mapping]
You file past exam questions under syllabus topics. For each question pick the one candidate topic it mainly tests.
Choose only from that question's numbered candidates. Use 0 if none of them fits.
JSON shape: {"choices":[{"q":1,"topic":2}]}`,
    prompt: items
      .map((item, i) => `Question ${i + 1}: ${item.question.slice(0, 320)}\nCandidates: ${item.candidates.map((c, j) => `${j + 1}) ${c}`).join('  ')}`)
      .join('\n\n'),
  });
  return items.map((item, i) => {
    const choice = result.choices.find((c) => c.q === i + 1);
    const index = (choice?.topic ?? 1) - 1;
    return index >= 0 && index < item.candidates.length ? index : -1;
  });
}
