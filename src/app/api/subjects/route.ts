import { newId, q } from '@/lib/db';
import { route } from '@/lib/http';
import { ingestDocument } from '@/lib/pipeline';
import { listSubjects, UserError } from '@/lib/repo';
import { SAMPLE } from '@/lib/sample';

export const maxDuration = 60;

export const GET = route(async ({ user }) => ({ subjects: await listSubjects(user.id) }));

export const POST = route(async ({ user, body }) => {
  const name = body.sample ? SAMPLE.name : String(body.name ?? '').trim().slice(0, 80);
  if (!name) throw new UserError('Give the subject a name.');
  const id = newId();
  await q('insert into subjects (id, user_id, name) values ($1,$2,$3)', [id, user.id, name]);
  if (body.sample) {
    await ingestDocument(id, { kind: 'syllabus', title: SAMPLE.syllabus.title, pages: [{ page: null, text: SAMPLE.syllabus.text }] });
    await ingestDocument(id, { kind: 'material', title: SAMPLE.notes.title, pages: [{ page: null, text: SAMPLE.notes.text }] });
    await ingestDocument(id, { kind: 'paper', title: SAMPLE.paper.title, pages: [{ page: null, text: SAMPLE.paper.text }] });
  }
  return { id };
});
