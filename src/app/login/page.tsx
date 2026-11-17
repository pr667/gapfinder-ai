import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { MasteryBar, StatusBadge } from '@/components/Status';
import { DEMO, getUser } from '@/lib/auth';
import type { Status } from '@/lib/types';

const preview: { name: string; status: Status; value: number; reason: string }[] = [
  { name: 'Photosynthesis', status: 'weak', value: 0.25, reason: '1 of 4 right. Marks were lost mostly on the light reaction. In 4 of 16 past-paper questions.' },
  { name: 'Respiration', status: 'medium', value: 0.67, reason: '2 of 3 right. You mix up where pyruvate goes with and without oxygen.' },
  { name: 'Transport in humans', status: 'strong', value: 1, reason: '3 of 3 right. A quick recall check is enough.' },
];

export default async function LoginPage() {
  if (await getUser()) redirect('/subjects');
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 md:grid-cols-[1.15fr_1fr] md:py-16">
      <section>
        <p className="font-display text-xl font-bold">GapFinder AI</p>
        <h1 className="mt-6 max-w-[14ch] text-5xl font-extrabold md:text-6xl">You can&apos;t ask about a gap you can&apos;t see.</h1>
        <p className="mt-5 max-w-[52ch] text-lg text-muted">
          Upload your syllabus, notes and past papers. GapFinder tests you on your own material, shows which topics are weak and why, and
          builds a revision plan that changes as you improve.
        </p>
        <div className="panel mt-8 max-w-xl divide-y divide-line" aria-label="Example gap report">
          {preview.map((row) => (
            <div key={row.name} className="grid gap-2 p-4 sm:grid-cols-[9.5rem_1fr]">
              <div>
                <p className="font-bold">{row.name}</p>
                <div className="mt-1">
                  <StatusBadge status={row.status} />
                </div>
              </div>
              <div>
                <MasteryBar value={row.value} status={row.status} />
                <p className="note mt-2">{row.reason}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="note mt-3">An example of the gap report, the main thing this app produces.</p>
      </section>
      <section className="md:pt-14">
        <LoginForm demo={{ email: DEMO.email, password: DEMO.password }} />
      </section>
    </main>
  );
}
