import { route } from '@/lib/http';
import { deleteDocument, ingestDocument } from '@/lib/pipeline';
import { requireSubject, UserError } from '@/lib/repo';

export const maxDuration = 60;

export const POST = route(async ({ user, params, body }) => {
  await requireSubject(user.id, params.id);
  if (!['syllabus', 'material', 'paper'].includes(body.kind)) throw new UserError('Choose what kind of file this is.');
  const pages = Array.isArray(body.pages) ? body.pages : [];
  return ingestDocument(params.id, {
    kind: body.kind,
    title: String(body.title || 'Untitled'),
    pages: pages.map((p: any) => ({ page: Number.isInteger(p.page) ? p.page : null, text: String(p.text ?? '') })),
  });
});

export const DELETE = route(async ({ user, params, req }) => {
  await requireSubject(user.id, params.id);
  const documentId = new URL(req.url).searchParams.get('doc');
  if (documentId) await deleteDocument(params.id, documentId);
});
