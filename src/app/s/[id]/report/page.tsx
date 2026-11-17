import Link from 'next/link';
import { Source } from '@/components/Source';
import { MasteryBar, STATUS, StatusBadge, StatusIcon } from '@/components/Status';
import { getPassages, getReports } from '@/lib/repo';
import type { Status } from '@/lib/types';

const pct = (x: number | null) => (x === null ? 'no score' : `${Math.round(x * 100)}%`);

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = (await getReports(id)).at(-1);
  if (!report) {
    return (
      <div className="panel max-w-2xl p-6">
        <h2 className="text-2xl font-bold">No gap report yet</h2>
        <p className="mt-2 text-muted">The report is built from your quiz answers. Take the diagnostic quiz and it appears here.</p>
        <Link href={`/s/${id}/quiz`} className="btn btn-primary mt-4">
          Go to the quiz
        </Link>
      </div>
    );
  }
  const passages = await getPassages(report.topics.flatMap((t) => t.rereads.map((r) => r.chunkId)));
  const groups: Status[] = ['weak', 'medium', 'strong', 'untested'];
  const count = (s: Status) => report.topics.filter((t) => t.status === s).length;
  const headline = groups.filter((s) => count(s)).map((s) => `${count(s)} ${STATUS[s].label.toLowerCase()}`).join(', ');

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="min-w-[17rem] flex-1">
          <h2 className="text-3xl font-extrabold">Gap report after quiz {report.attemptNumber}</h2>
          <p className="mt-2 text-lg">
            {headline}. Latest quiz score {pct(report.overall)}
            {report.previousOverall !== null && ` (previous quiz ${pct(report.previousOverall)})`}.
          </p>
        </div>
        <Link href={`/s/${id}/plan`} className="btn btn-primary">
          See the revision plan
        </Link>
      </div>

      {/* The whole diagnosis at a glance: one block per topic, weakest first. */}
      <div className="mt-6 flex gap-[3px]" role="img" aria-label={`Topics by status: ${headline}`}>
        {report.topics.map((t) => (
          <div key={t.topicId} className="min-w-0 flex-1" title={`${t.name}: ${STATUS[t.status].label}`}>
            <div className="h-3 rounded-sm" style={{ background: STATUS[t.status].fill }} />
            <p className="mt-1 hidden truncate text-xs text-muted md:block">{t.name}</p>
          </div>
        ))}
      </div>

      <ol className="mt-6 space-y-3">
        {report.topics.map((t, i) => (
          <li key={t.topicId} className="panel p-5">
            <div className="grid gap-x-8 gap-y-3 md:grid-cols-[17rem_1fr]">
              <div>
                <p className="note">Priority {i + 1}</p>
                <h3 className="text-xl font-bold">{t.name}</h3>
                <div className="mt-2 flex items-center gap-3">
                  <StatusBadge status={t.status} />
                  <span className="font-bold">{pct(t.mastery)}</span>
                  {t.previousMastery !== null && t.mastery !== null && Math.abs(t.mastery - t.previousMastery) >= 0.05 && (
                    <span className="note">was {pct(t.previousMastery)}</span>
                  )}
                </div>
                <div className="mt-3">
                  <MasteryBar value={t.mastery} status={t.status} />
                </div>
                <p className="note mt-2">
                  {t.totalAsked} {t.totalAsked === 1 ? 'question' : 'questions'} so far.{' '}
                  {t.examCount ? `${Math.round(t.examShare * 100)}% of past-paper questions.` : 'Not seen in past papers.'}
                </p>
              </div>
              <div className="max-w-[68ch]">
                <p>{t.reason}</p>
                {t.diagnosis && (
                  <p className="mt-2">
                    <mark className="hi">{t.diagnosis}</mark>
                  </p>
                )}
                {t.missedConcepts.length > 0 && <p className="note mt-2">Ideas missed: {t.missedConcepts.join('; ')}.</p>}
                {t.rereads.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="note">Where the missed answers are in your notes:</p>
                    {t.rereads.map((r) => (
                      <Source key={r.chunkId} label={r.label} passage={passages.get(r.chunkId)?.passage} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="note mt-5 flex flex-wrap gap-x-6 gap-y-1">
        {groups.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5" style={{ color: STATUS[s].fill }}>
            <StatusIcon status={s} />
            <span className="text-muted">
              {STATUS[s].label}
              {s === 'weak' ? ': under 50%' : s === 'medium' ? ': 50 to 79%' : s === 'strong' ? ': 80% and above' : ': no questions answered yet'}
            </span>
          </span>
        ))}
      </div>
      <p className="note mt-2 max-w-[80ch]">
        Scores weight recent quizzes more (each older quiz counts half as much as the next). Priority is how weak a topic is multiplied by how
        often it appears in your past papers. The labels and numbers are calculated in code; the highlighted sentence is the model&apos;s
        reading of your wrong answers.
      </p>
    </div>
  );
}
