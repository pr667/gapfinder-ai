import { z } from 'zod';
import { generateJson } from './llm';

const text = (max: number) => z.string().nullish().transform((v) => (v ?? '').trim().slice(0, max));
const words = (max: number) => z.array(z.string()).nullish().transform((v) => (v ?? []).map((w) => w.trim()).filter(Boolean).slice(0, max));

// Lenient on purpose: trim and cap what the model sends instead of rejecting it.
const schema = z.object({
  topics: z
    .array(
      z.object({
        name: z.string().min(2).transform((v) => v.trim().slice(0, 90)),
        summary: text(300),
        keywords: words(14),
        subtopics: z
          .array(z.object({ name: z.string().min(2).transform((v) => v.trim().slice(0, 90)), keywords: words(10) }))
          .nullish()
          .transform((v) => (v ?? []).slice(0, 8)),
      }),
    )
    .min(1)
    .transform((v) => v.slice(0, 14)),
});

export type TopicMapDraft = z.infer<typeof schema>;

/** Turns syllabus text (or, without a syllabus, an outline of the notes) into a topic tree. */
export function draftTopicMap(source: string, sourceKind: 'syllabus' | 'outline') {
  return generateJson({
    tier: 'main',
    schema,
    maxOutputTokens: 2400,
    temperature: 0.1,
    instructions: `[task:topic_map]
You organise a course ${sourceKind} into a topic map for exam revision.
Rules:
- Use only topics that appear in the text below. Keep the syllabus's own wording and order. Do not add topics from your own knowledge of the subject.
- 3 to 12 top-level topics. Each may have up to 8 subtopics.
- "keywords": distinctive terms from the text that would appear in notes about that topic (used for search), not generic words.
- "summary": one sentence saying what the topic covers, based on the text.
JSON shape: {"topics":[{"name":"","summary":"","keywords":[""],"subtopics":[{"name":"","keywords":[""]}]}]}`,
    prompt: `${sourceKind === 'syllabus' ? 'SYLLABUS' : 'OUTLINE OF THE NOTES (no syllabus was uploaded)'}:\n"""\n${source}\n"""`,
  });
}
