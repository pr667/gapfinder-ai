import { redirect } from 'next/navigation';
import { one } from '@/lib/db';

/** Opens the subject at the step the student has reached. */
export default async function SubjectHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await one(
    `select (select count(*) from documents where subject_id = $1) as docs,
            (select count(*) from topics where subject_id = $1) as topics,
            (select count(*) from attempts where subject_id = $1 and status = 'submitted') as attempts`,
    [id],
  );
  const step = !Number(c?.docs) ? 'materials' : !Number(c?.topics) ? 'topics' : !Number(c?.attempts) ? 'quiz' : 'report';
  redirect(`/s/${id}/${step}`);
}
