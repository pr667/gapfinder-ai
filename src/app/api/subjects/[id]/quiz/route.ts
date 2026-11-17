import { route } from '@/lib/http';
import { generateQuiz } from '@/lib/pipeline';
import { getAttempts, getQuestions, requireSubject } from '@/lib/repo';

export const maxDuration = 60;

/** The open quiz, without answers, explanations or evidence. */
export const GET = route(async ({ user, params }) => {
  await requireSubject(user.id, params.id);
  const open = (await getAttempts(params.id)).find((a) => a.status === 'open');
  if (!open) return { attempt: null };
  const questions = await getQuestions(open.id);
  return { attempt: { id: open.id, number: open.number, meta: open.meta }, questions: questions.map(({ id, type, prompt, options, topicId }) => ({ id, type, prompt, options, topicId })) };
});

export const POST = route(async ({ user, params, body }) => {
  await requireSubject(user.id, params.id);
  return generateQuiz(params.id, Number(body.size) || 8);
});
