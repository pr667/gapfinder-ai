import { notFound, redirect } from 'next/navigation';
import { Header, setupWarning } from '@/components/Header';
import { SubjectNav } from '@/components/SubjectNav';
import { getUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { requireSubject } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export default async function SubjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const subject = await requireSubject(user.id, id).catch(() => null);
  if (!subject) notFound();
  const counts = await one(
    `select (select count(*) from documents where subject_id = $1) as docs,
            (select count(*) from topics where subject_id = $1) as topics,
            (select count(*) from attempts where subject_id = $1 and status = 'submitted') as attempts,
            (select count(*) from plans where subject_id = $1) as plans`,
    [id],
  );
  const done = {
    materials: Number(counts?.docs) > 0,
    topics: Number(counts?.topics) > 0,
    quiz: Number(counts?.attempts) > 0,
    report: Number(counts?.attempts) > 0,
    plan: Number(counts?.plans) > 0,
  };
  return (
    <>
      <Header userName={user.name} warning={setupWarning()} />
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 pt-5">
          <h1 className="text-2xl font-extrabold md:text-3xl">{subject.name}</h1>
          <SubjectNav id={id} done={done} />
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </>
  );
}
