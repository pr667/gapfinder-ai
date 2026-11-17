import { route } from '@/lib/http';
import { rebuildPlan } from '@/lib/pipeline';
import { requireSubject } from '@/lib/repo';

export const POST = route(async ({ user, params, body }) => {
  const subject = await requireSubject(user.id, params.id);
  const plan = await rebuildPlan(subject, { days: Number(body.days), hoursPerDay: Number(body.hoursPerDay) });
  return { plan };
});
