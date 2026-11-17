import { route } from '@/lib/http';
import { deleteSubject, requireSubject } from '@/lib/repo';

export const DELETE = route(async ({ user, params }) => {
  await requireSubject(user.id, params.id);
  await deleteSubject(params.id);
});
