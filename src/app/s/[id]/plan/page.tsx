import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PlanSettings } from '@/components/PlanSettings';
import { Source } from '@/components/Source';
import { STATUS, StatusBadge } from '@/components/Status';
import { getUser } from '@/lib/auth';
import { getLatestPlan, getPassages, requireSubject } from '@/lib/repo';

const KIND = { learn: 'Study', 'second-pass': 'Second pass', review: 'Quick review', retest: 'Re-test' };
const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect('/login');
  const subject = await requireSubject(user.id, id);
  const plan = await getLatestPlan(id);
  const passages = plan ? await getPassages(plan.schedule.flatMap((d) => d.sessions.flatMap((s) => s.rereads.map((r) => r.chunkId)))) : new Map();

  return (
    <div>
      <div className="panel p-5">
        <h2 className="text-xl font-bold">How much time do you have?</h2>
        <div className="mt-3">
          <PlanSettings subjectId={id} days={plan?.days ?? subject.planDays} hours={plan?.hoursPerDay ?? subject.planHours} disabled={!plan} />
        </div>
        {!plan && (
          <p className="mt-3 text-muted">
            The plan is built from your gap report. <Link className="text-pen underline" href={`/s/${id}/quiz`}>Take the diagnostic quiz</Link> first.
          </p>
        )}
      </div>

      {plan && (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div>
              <h2 className="text-3xl font-extrabold">
                {plan.days}-day plan, {duration(Math.round(plan.hoursPerDay * 60))} a day
              </h2>
              <p className="mt-2 max-w-[66ch] text-muted">
                Based on your gap report after quiz {plan.basedOnAttempt}. Time is shared out by priority: the weaker the topic and the more
                often it is examined, the more minutes it gets. It is rebuilt every time you submit a quiz.
              </p>
              {plan.changes.length > 0 && (
                <div className="mt-4 border-l-4 border-hi bg-surface px-4 py-3">
                  <p className="font-bold">What changed since the last plan</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {plan.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="panel self-start p-4">
              <p className="font-bold">Minutes per topic</p>
              <ul className="mt-2 space-y-2">
                {plan.ranking.map((r) => (
                  <li key={r.topicId} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-[0.94rem]">
                    <span className="truncate">{r.name}</span>
                    <span className="font-bold">{r.minutes}</span>
                    <span className="col-span-2 h-2 rounded-full" style={{ width: `${Math.max(4, (r.minutes / Math.max(...plan.ranking.map((x) => x.minutes))) * 100)}%`, background: STATUS[r.status].fill }} />
                  </li>
                ))}
              </ul>
              {plan.dropped.length > 0 && <p className="note mt-3">Left out for lack of time: {plan.dropped.join(', ')}.</p>}
            </div>
          </div>

          <ol className="mt-6 space-y-4">
            {plan.schedule.map((day) => (
              <li key={day.day} className="grid gap-3 md:grid-cols-[7rem_1fr]">
                <div>
                  <p className="font-display text-xl font-bold">Day {day.day}</p>
                  <p className="note">{duration(day.minutes)}</p>
                </div>
                <div className="panel divide-y divide-line">
                  {day.sessions.length === 0 && <p className="p-4 text-muted">Free. Everything in the plan fits in the earlier days.</p>}
                  {day.sessions.map((s, i) => (
                    <div key={i} className={`p-4 ${s.kind === 'retest' ? 'bg-pen/5' : ''}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="w-16 font-bold">{s.minutes} min</span>
                        <span className="font-bold">{s.title}</span>
                        <span className="note">{KIND[s.kind]}</span>
                        {s.status && <StatusBadge status={s.status} />}
                      </div>
                      <p className="mt-1 max-w-[70ch] sm:pl-19">{s.focus}</p>
                      {(s.rereads.length > 0 || s.practice.length > 0) && (
                        <div className="mt-2 space-y-1 sm:pl-19">
                          {s.rereads.map((r) => (
                            <Source key={r.chunkId} label={`Re-read: ${r.label}`} passage={passages.get(r.chunkId)?.passage} />
                          ))}
                          {s.practice.length > 0 && <p className="note">Practise: {s.practice.join(', ')}</p>}
                        </div>
                      )}
                      {s.kind === 'retest' && (
                        <Link href={`/s/${id}/quiz`} className="btn mt-2 sm:ml-19">
                          Take a new quiz
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
