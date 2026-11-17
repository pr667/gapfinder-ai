'use client';

import { useRef, useState } from 'react';
import { Source } from './Source';

type SourceItem = { n: number; chunkId: string; label: string; passage: string };
type Turn = { question: string; answer: string; sources: SourceItem[]; done: boolean };

export function ExplainClient({ subjectId, topics, initialTopic }: { subjectId: string; topics: { id: string; name: string }[]; initialTopic: string }) {
  const [topicId, setTopicId] = useState(initialTopic);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setInput('');
    const history = turns.flatMap((t) => [
      { role: 'user', content: t.question },
      { role: 'assistant', content: t.answer },
    ]);
    const index = turns.length;
    setTurns((all) => [...all, { question, answer: '', sources: [], done: false }]);
    const patch = (change: Partial<Turn>) => setTurns((all) => all.map((t, i) => (i === index ? { ...t, ...change } : t)));
    try {
      const res = await fetch(`/api/subjects/${subjectId}/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, topicId: topicId || null, history }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || 'The request failed.');
      // First line: the retrieved sources as JSON. Everything after: the answer text.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let gotSources = false;
      let answer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (!gotSources) {
          const newline = buffer.indexOf('\n');
          if (newline === -1) continue;
          patch({ sources: JSON.parse(buffer.slice(0, newline)).sources });
          buffer = buffer.slice(newline + 1);
          gotSources = true;
        }
        answer += buffer;
        buffer = '';
        patch({ answer });
        end.current?.scrollIntoView({ block: 'nearest' });
      }
      patch({ done: true });
    } catch (e) {
      patch({ answer: (e as Error).message, done: true });
    }
    setBusy(false);
  }

  const topic = topics.find((t) => t.id === topicId);
  return (
    <div className="max-w-3xl">
      <p className="max-w-[66ch] text-muted">
        Answers come only from the files you uploaded. The passages are looked up first and shown with each answer; if your material does
        not cover something, you are told so instead of getting an answer from elsewhere.
      </p>
      <div className="mt-5 space-y-5">
        {turns.map((t, i) => (
          <article key={i} className="panel p-5">
            <p className="font-bold">{t.question}</p>
            {t.sources.length > 0 && (
              <div className="mt-3 space-y-1.5 border-l-4 border-hi pl-4">
                <p className="note">Found in your material:</p>
                {t.sources.map((s) => (
                  <Source key={s.chunkId} n={s.n} label={s.label} passage={s.passage} />
                ))}
              </div>
            )}
            <div className="mt-3 max-w-[68ch] whitespace-pre-wrap">
              {t.answer.split(/(\[\d+\])/).map((part, k) =>
                /^\[\d+\]$/.test(part) ? (
                  <sup key={k} className="mx-0.5 rounded bg-pen px-1 text-[0.7rem] font-bold text-white">
                    {part.slice(1, -1)}
                  </sup>
                ) : (
                  part
                ),
              )}
              {!t.done && <span className="text-muted"> …</span>}
            </div>
          </article>
        ))}
        <div ref={end} />
      </div>
      <form
        className="panel mt-5 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="note" htmlFor="topic">
            Topic
          </label>
          <select id="topic" className="field w-auto max-w-full" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">Any topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {topic && (
            <button type="button" className="btn" disabled={busy} onClick={() => ask(`Explain ${topic.name} simply, step by step.`)}>
              Explain this topic
            </button>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <input className="field" placeholder="Ask about something in your notes" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Your question" />
          <button className="btn btn-primary" disabled={busy || !input.trim()}>
            {busy ? 'Answering…' : 'Ask'}
          </button>
        </div>
      </form>
    </div>
  );
}
