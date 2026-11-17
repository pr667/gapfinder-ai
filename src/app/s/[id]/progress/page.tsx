import Link from 'next/link';
import { ScoreChart } from '@/components/ScoreChart';
import { STATUS, StatusBadge } from '@/components/Status';
import { statusFor } from '@/lib/analysis/gaps';
import { q } from '@/lib/db';
import { getAttempts, getReports, getTopics } from '@/lib/repo';
import type { Status } from '@/lib/types';

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attempts = (await getAttempts(id)).filter((a) => a.status === 'submitted');
  if (!attempts.length) {
    return (
      <div className="panel max-w-2xl p-6">
        <h2 className="text-2xl font-bold">Nothing to chart yet</h2>
        <p className="mt-2 text-muted">Progress appears after your first quiz, and gets useful from the second.</p>
        <Link href={`/s/${id}/quiz`} className="btn btn-primary mt-4">
          Go to the quiz
        </Link>
      </div>
    );
  }
  const topics = (await getTopics(id)).filter((t) => !t.parentId);
  const reports = await getReports(id);
  const rows = await q(
    `select t.topic_id, a.number, count(*) as asked, sum(t.score) as earned from questions t join attempts a on a.id = t.attempt_id
     where t.subject_id = $1 and a.status = 'submitted' group by t.topic_id, a.number`,
    [id],
  );
  const cell = (topicId: string, n: number) => {
    const r = rows.find((x) => x.topic_id === topicId && x.number === n);
    return r ? Number(r.earned) / Number(r.asked) : null;
  };
  const latest = reports.at(-1)!;
  const first = reports[0];
  const groups: Status[] = ['weak', 'medium', 'strong', 'untested'];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-3xl font-extrabold">Progress across {attempts.length} {attempts.length === 1 ? 'quiz' : 'quizzes'}</h2>
        <p className="mt-2 text-muted">
          {attempts.length > 1
            ? `Quiz score went from ${Math.round((attempts[0].score ?? 0) * 100)}% to ${Math.round((attempts.at(-1)!.score ?? 0) * 100)}%. Weak topics: ${first.topics.filter((t) => t.status === 'weak').length} at the start, ${latest.topics.filter((t) => t.status === 'weak').length} now.`
            : 'One quiz so far. Take another after some revision to see what moved.'}
        </p>
        <div className="panel mt-4 p-4">
          <p className="font-bold">Quiz score</p>
          <ScoreChart points={attempts.map((a) => ({ label: `Quiz ${a.number}`, value: a.score ?? 0 }))} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">Topics by status after each quiz</h2>
        <div className="panel mt-3 space-y-3 p-4">
          {reports.map((r) => (
            <div key={r.attemptNumber} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
              <span className="note">Quiz {r.attemptNumber}</span>
              <div className="flex gap-[2px]">
                {groups.map((s) => {
                  const n = r.topics.filter((t) => t.status === s).length;
                  return n ? (
                    <div key={s} className="flex h-7 items-center justify-center rounded-sm text-sm font-bold text-white" style={{ flex: n, background: STATUS[s].fill }} title={`${n} ${STATUS[s].label.toLowerCase()}`}>
                      {n}
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-3 pt-1">
            {groups.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">Score per topic, quiz by quiz</h2>
        <div className="panel mt-3 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-[0.94rem] text-muted">
                <th className="px-4 py-2 font-normal">Topic</th>
                {attempts.map((a) => (
                  <th key={a.id} className="px-3 py-2 text-right font-normal">
                    Quiz {a.number}
                  </th>
                ))}
                <th className="px-4 py-2 font-normal">Now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {topics.map((t) => {
                const now = latest.topics.find((g) => g.topicId === t.id);
                return (
                  <tr key={t.id}>
                    <th className="px-4 py-2.5 font-bold">{t.name}</th>
                    {attempts.map((a) => {
                      const v = cell(t.id, a.number);
                      return (
                        <td key={a.id} className="px-3 py-2.5 text-right tabular-nums">
                          {v === null ? (
                            <span className="text-muted">not asked</span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ background: STATUS[statusFor(v)].fill }} />
                              {Math.round(v * 100)}%
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5">{now && <StatusBadge status={now.status} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note mt-2">Each cell is the share of that quiz&apos;s questions on the topic you got right. &quot;Now&quot; uses the recency-weighted score from the gap report.</p>
      </section>
    </div>
  );
}
