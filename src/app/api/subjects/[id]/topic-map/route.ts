import { route } from '@/lib/http';
import { buildTopicMap } from '@/lib/pipeline';
import { requireSubject } from '@/lib/repo';

export const maxDuration = 60;

export const POST = route(async ({ user, params, body }) => {
  await requireSubject(user.id, params.id);
  return buildTopicMap(params.id, Boolean(body.reset));
});
