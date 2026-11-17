import Link from 'next/link';
import { StartQuiz, TakeQuiz } from '@/components/QuizClient';
import { ActionButton } from '@/components/SmallClient';
import { Source } from '@/components/Source';
import { getAttempts, getPassages, getQuestions, getTopics } from '@/lib/repo';

const RESULT = {
  correct: { label: 'Correct', chip: 'bg-strong-bg text-strong-ink' },
  partial: { label: 'Partly correct', chip: 'bg-medium-bg text-medium-ink' },
  incorrect: { label: 'Incorrect', chip: 'bg-weak-bg text-weak' },
};

export default async function QuizPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ attempt?: string }> }) {
  const { id } = await params;
  const { attempt: reviewId } = await searchParams;
  const topics = await getTopics(id);
  const attempts = await getAttempts(id);
  const topicName = (topicId: string) => topics.find((t) => t.id === topicId)?.name ?? 'Topic';

  if (!topics.length) {
    return (
      <div className="panel max-w-2xl p-6">
        <h2 className="text-2xl font-bold">Build the topic map first</h2>
        <p className="mt-2 text-muted">The quiz needs to know which topics exist and which passages of your notes belong to each.</p>
        <div className="mt-4">
          <ActionButton primary label="Build topic map" busyLabel="Reading your syllabus…" path={`/api/subjects/${id}/topic-map`} />
        </div>
      </div>
    );
  }

  // Review of a submitted quiz: verdict, reason and the source passage for every answer.
  const review = attempts.find((a) => a.id === reviewId && a.status === 'submitted');
  if (review) {
    const questions = await getQuestions(review.id);
    const passages = await getPassages(questions.map((x) => x.chunkId));
    return (
      <div className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-2xl font-bold">
            Quiz {review.number}: {Math.round((review.score ?? 0) * 100)}%
          </h2>
          <Link href={`/s/${id}/report`} className="btn btn-primary">
            See your gap report
          </Link>
          <Link href={`/s/${id}/quiz`} className="btn">
            Back to quizzes
          </Link>
        </div>
        <ol className="mt-5 space-y-4">
          {questions.map((x, i) => {
            const source = passages.get(x.chunkId);
            const result = RESULT[x.result ?? 'incorrect'];
            return (
              <li key={x.id} className="panel p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${result.chip}`}>{result.label}</span>
                  <span className="note">
                    Question {i + 1}, {topicName(x.topicId)}
                    {x.concept ? `, ${x.concept}` : ''}
                  </span>
                </div>
                <p className="mt-2 text-lg font-bold">{x.prompt}</p>
                <dl className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr]">
                  <dt className="text-muted">Your answer</dt>
                  <dd>{x.response || <em className="text-muted">left blank</em>}</dd>
                  {x.result !== 'correct' && (
                    <>
                      <dt className="text-muted">{x.type === 'mcq' ? 'Correct answer' : 'Full answer'}</dt>
                      <dd>{x.answer}</dd>
                    </>
                  )}
                  <dt className="text-muted">Why</dt>
                  <dd>{x.feedback}</dd>
                  <dt className="text-muted">Source</dt>
                  <dd>
                    <Source label={source?.label ?? 'Source file was removed'} passage={source?.passage} evidence={x.evidence} defaultOpen={x.result !== 'correct'} />
                  </dd>
                </dl>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  const open = attempts.find((a) => a.status === 'open');
  const submitted = attempts.filter((a) => a.status === 'submitted');

  if (open) {
    const questions = await getQuestions(open.id);
    const passages = await getPassages(questions.map((x) => x.chunkId));
    const rejected = (open.meta.rejectedUngrounded ?? 0) + (open.meta.rejectedInvalid ?? 0);
    return (
      <div>
        <h2 className="text-2xl font-bold">{open.number === 1 ? 'Diagnostic quiz' : `Quiz ${open.number}`}</h2>
        <p className="note mb-5 mt-1 max-w-[70ch]">
          {questions.length} questions, each written from one passage of your notes.
          {rejected > 0 &&
            ` ${rejected} draft ${rejected === 1 ? 'question was' : 'questions were'} thrown away because ${open.meta.rejectedUngrounded ? 'the supporting quote could not be found in the passage' : 'the format was invalid'}.`}
          {open.meta.cutShort && ` This quiz is shorter than you asked for: ${open.meta.cutShort}`}
        </p>
        {/* Answers, explanations and evidence stay on the server until the quiz is submitted. */}
        <TakeQuiz
          subjectId={id}
          attemptId={open.id}
          questions={questions.map((x) => ({
            id: x.id,
            type: x.type,
            prompt: x.prompt,
            options: x.options,
            topic: topicName(x.topicId),
            source: passages.get(x.chunkId)?.label ?? 'your notes',
          }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StartQuiz subjectId={id} attemptNumber={submitted.length + 1} adaptive={submitted.length > 0} />
      {submitted.length > 0 && (
        <section className="max-w-2xl">
          <h2 className="text-xl font-bold">Earlier quizzes</h2>
          <ul className="panel mt-3 divide-y divide-line">
            {[...submitted].reverse().map((a) => (
              <li key={a.id} className="flex items-center gap-4 px-5 py-3">
                <span className="font-bold">Quiz {a.number}</span>
                <span className="text-muted">{a.submittedAt ? new Date(a.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                <span className="ml-auto font-bold">{Math.round((a.score ?? 0) * 100)}%</span>
                <Link className="text-pen underline underline-offset-4" href={`/s/${id}/quiz?attempt=${a.id}`}>
                  Review answers
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
