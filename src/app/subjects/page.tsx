import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header, setupWarning } from '@/components/Header';
import { ActionButton } from '@/components/SmallClient';
import { NewSubject } from '@/components/SubjectsClient';
import { getUser } from '@/lib/auth';
import { listSubjects } from '@/lib/repo';
import { SAMPLE } from '@/lib/sample';

export const dynamic = 'force-dynamic';

export default async function SubjectsPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const subjects = await listSubjects(user.id);
  return (
    <>
      <Header userName={user.name} warning={setupWarning()} />
      <main className="mx-auto max-w-4xl px-5 py-8">
        <h1 className="text-4xl font-extrabold">My subjects</h1>
        <p className="mt-2 max-w-[60ch] text-muted">Each subject keeps its own material, quizzes, gap report and revision plan.</p>
        <div className="mt-6 space-y-3">
          {subjects.map((s) => (
            <div key={s.id} className="panel flex flex-wrap items-center gap-x-6 gap-y-2 p-5">
              <div className="min-w-0 flex-1">
                <Link href={`/s/${s.id}`} className="font-display text-xl font-bold text-pen underline-offset-4 hover:underline">
                  {s.name}
                </Link>
                <p className="note mt-1">
                  {s.docs} {s.docs === 1 ? 'file' : 'files'}, {s.topics} topics, {s.attempts} {s.attempts === 1 ? 'quiz' : 'quizzes'} taken
                  {s.lastScore !== null && `, last score ${Math.round(s.lastScore * 100)}%`}
                </p>
              </div>
              <Link href={`/s/${s.id}`} className="btn">
                Open
              </Link>
              <ActionButton
                quiet
                label="Delete"
                busyLabel="Deleting…"
                path={`/api/subjects/${s.id}`}
                method="DELETE"
                confirm={`Delete "${s.name}" and all its quizzes and reports?`}
              />
            </div>
          ))}
          {!subjects.length && <p className="panel p-5 text-muted">No subjects yet. Create one below, or load the sample to see the whole loop in a few minutes.</p>}
        </div>
        <div className="mt-8">
          <NewSubject hasSample={subjects.some((s) => s.name === SAMPLE.name)} />
        </div>
      </main>
    </>
  );
}
