import { route } from '@/lib/http';
import { submitAttempt } from '@/lib/pipeline';
import { requireSubject } from '@/lib/repo';

export const maxDuration = 60;

export const POST = route(async ({ user, params, body }) => {
  const subject = await requireSubject(user.id, params.id);
  const { score } = await submitAttempt(subject, String(body.attemptId), body.answers ?? {});
  return { score };
});
