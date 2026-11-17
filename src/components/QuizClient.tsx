'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from './client';
import { ErrorNote } from './SmallClient';

export function StartQuiz({ subjectId, attemptNumber, adaptive }: { subjectId: string; attemptNumber: number; adaptive: boolean }) {
  const router = useRouter();
  const [size, setSize] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="panel max-w-2xl p-6">
      <h2 className="text-2xl font-bold">{attemptNumber === 1 ? 'Diagnostic quiz' : `Quiz ${attemptNumber}`}</h2>
      <p className="mt-2 text-muted">
        {adaptive
          ? 'This quiz leans towards the topics your gap report marks weak or untested, and still checks the strong ones.'
          : 'The first quiz covers every topic once before going deeper, weighted by how often each topic appears in your past papers.'}{' '}
        Every question is written from a passage of your own notes and names that passage.
      </p>
      <fieldset className="mt-4">
        <legend className="note">How many questions?</legend>
        <div className="mt-1 flex gap-2">
          {[6, 8, 12].map((n) => (
            <button key={n} type="button" className={`btn ${size === n ? 'border-pen text-pen' : ''}`} aria-pressed={size === n} onClick={() => setSize(n)}>
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <button
        className="btn btn-primary mt-5"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await api(`/api/subjects/${subjectId}/quiz`, { size });
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          }
          setBusy(false);
        }}
      >
        {busy ? 'Writing questions from your notes…' : 'Write my quiz'}
      </button>
      {busy && <p className="note mt-2">This takes up to a minute: passages are picked first, then each question is checked against its passage.</p>}
      <ErrorNote message={error} />
    </div>
  );
}

export type OpenQuestion = { id: string; type: 'mcq' | 'short'; prompt: string; options: string[] | null; topic: string; source: string };

export function TakeQuiz({ subjectId, attemptId, questions }: { subjectId: string; attemptId: string; questions: OpenQuestion[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const answered = questions.filter((q) => (answers[q.id] ?? '').trim()).length;

  async function submit() {
    if (answered < questions.length && !window.confirm(`${questions.length - answered} unanswered. Blank answers count as wrong. Submit anyway?`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/subjects/${subjectId}/submit`, { attemptId, answers });
      router.push(`/s/${subjectId}/quiz?attempt=${attemptId}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      className="max-w-3xl"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <ol className="space-y-4">
        {questions.map((q, i) => (
          <li key={q.id} className="panel p-5">
            <p className="note">
              Question {i + 1} of {questions.length}, {q.topic}
            </p>
            <p className="mt-1 text-lg font-bold">{q.prompt}</p>
            {q.type === 'mcq' ? (
              <div className="mt-3 space-y-2">
                {q.options!.map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 ${answers[q.id] === option ? 'border-pen bg-pen/5' : 'border-line hover:border-ink/40'}`}
                  >
                    <input type="radio" name={q.id} className="mt-1.5" checked={answers[q.id] === option} onChange={() => setAnswers({ ...answers, [q.id]: option })} />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                className="field mt-3 min-h-24"
                placeholder="Answer in one or two sentences"
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                aria-label={`Answer to question ${i + 1}`}
              />
            )}
            <p className="note mt-3">Written from: {q.source}. The passage is shown after you submit.</p>
          </li>
        ))}
      </ol>
      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-4 border-t border-line bg-paper py-3">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Marking and updating your gap report…' : 'Submit answers'}
        </button>
        <span className="text-muted">
          {answered} of {questions.length} answered
        </span>
      </div>
      <ErrorNote message={error} />
    </form>
  );
}
