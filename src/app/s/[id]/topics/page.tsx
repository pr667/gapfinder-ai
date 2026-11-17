import Link from 'next/link';
import { ActionButton } from '@/components/SmallClient';
import { q } from '@/lib/db';
import { getPaperQuestions, getTopics } from '@/lib/repo';

export default async function TopicsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topics = await getTopics(id);
  const top = topics.filter((t) => !t.parentId);
  const papers = await getPaperQuestions(id);
  const passageRows = await q(
    `select c.topic_id, c.subtopic_id, count(*) as n from chunks c join documents d on d.id = c.document_id
     where c.subject_id = $1 and d.kind = 'material' group by c.topic_id, c.subtopic_id`,
    [id],
  );
  const attempts = Number((await q('select count(*) as n from attempts where subject_id = $1', [id]))[0]?.n ?? 0);
  const passages = (topicId: string) => passageRows.filter((r) => r.topic_id === topicId).reduce((s, r) => s + Number(r.n), 0);
  const subPassages = (subId: string) => passageRows.filter((r) => r.subtopic_id === subId).reduce((s, r) => s + Number(r.n), 0);
  const unfiled = passageRows.filter((r) => !r.topic_id).reduce((s, r) => s + Number(r.n), 0);
  const mapped = papers.filter((p) => p.topicId);
  const maxExam = Math.max(1, ...top.map((t) => papers.filter((p) => p.topicId === t.id).length));

  if (!top.length) {
    return (
      <div className="panel max-w-2xl p-6">
        <h2 className="text-2xl font-bold">No topic map yet</h2>
        <p className="mt-2 text-muted">
          The map breaks your syllabus into topics and subtopics, then files every passage of your notes and every past-paper question under
          the topic it belongs to.
        </p>
        <div className="mt-4">
          <ActionButton primary label="Build topic map" busyLabel="Reading your syllabus…" path={`/api/subjects/${id}/topic-map`} />
        </div>
        <p className="note mt-3">
          Needs a syllabus or notes. <Link className="text-pen underline" href={`/s/${id}/materials`}>Add material</Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <p className="max-w-[62ch] min-w-[17rem] flex-1 text-muted">
          {top.length} topics from your syllabus. Passages and past-paper questions were filed under them by search over your material
          {papers.length > 0 && `; ${mapped.length} of ${papers.length} past-paper questions matched a topic`}.
        </p>
        <Link href={`/s/${id}/quiz`} className="btn btn-primary">
          Take the diagnostic quiz
        </Link>
      </div>
      <ol className="mt-6 space-y-3">
        {top.map((t, i) => {
          const exam = papers.filter((p) => p.topicId === t.id);
          const n = passages(t.id);
          return (
            <li key={t.id} className="panel p-5">
              <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
                <div>
                  <h2 className="text-xl font-bold">
                    <span className="mr-2 text-muted">{i + 1}.</span>
                    {t.name}
                  </h2>
                  {t.summary && <p className="mt-1 max-w-[62ch] text-muted">{t.summary}</p>}
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {topics.filter((s) => s.parentId === t.id).map((s) => (
                      <li key={s.id} className="rounded-md border border-line px-2.5 py-1 text-[0.94rem]">
                        {s.name}
                        <span className="ml-1.5 text-muted">{subPassages(s.id)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <dl className="space-y-2 text-[0.94rem]">
                  <div>
                    <dt className="text-muted">In past papers</dt>
                    <dd className="flex items-center gap-2">
                      <span className="h-2.5 rounded-full bg-pen" style={{ width: `${(exam.length / maxExam) * 7}rem`, minWidth: exam.length ? '0.4rem' : 0 }} />
                      <span className="font-bold">{exam.length ? `${exam.length} ${exam.length === 1 ? 'question' : 'questions'}` : 'none found'}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">In your notes</dt>
                    <dd className={n ? 'font-bold' : 'font-bold text-weak'}>{n ? `${n} ${n === 1 ? 'passage' : 'passages'}` : 'No matching passages, so it cannot be tested yet'}</dd>
                  </div>
                </dl>
              </div>
              {exam.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-pen underline-offset-4 hover:underline">Past-paper questions on this topic</summary>
                  <ul className="mt-2 space-y-1.5 text-[0.94rem]">
                    {exam.map((p) => (
                      <li key={p.id}>
                        <span className="font-bold">
                          {p.docTitle} {p.label}:
                        </span>{' '}
                        {p.content}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ol>
      <p className="note mt-4">
        Numbers next to subtopics count the passages of your notes filed there.
        {unfiled > 0 && ` ${unfiled} ${unfiled === 1 ? 'passage' : 'passages'} did not match any topic and are left out of quizzes.`}
        {papers.length - mapped.length > 0 && ` ${papers.length - mapped.length} past-paper questions did not match any topic.`}
      </p>
      <div className="mt-4">
        <ActionButton
          quiet
          label="Rebuild the topic map"
          busyLabel="Rebuilding…"
          path={`/api/subjects/${id}/topic-map`}
          body={{ reset: true }}
          confirm={attempts ? 'Rebuilding the map clears the quiz history for this subject. Continue?' : undefined}
        />
      </div>
    </div>
  );
}
