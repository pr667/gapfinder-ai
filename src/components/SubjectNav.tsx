'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const STEPS = [
  { key: 'materials', label: 'Material' },
  { key: 'topics', label: 'Topic map' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'report', label: 'Gap report' },
  { key: 'plan', label: 'Plan' },
] as const;
const TOOLS = [
  { key: 'explain', label: 'Explain a topic' },
  { key: 'progress', label: 'Progress' },
];

/** The five steps really are a sequence (each needs the one before), so they are numbered. */
export function SubjectNav({ id, done }: { id: string; done: Record<string, boolean> }) {
  const path = usePathname();
  const item = (key: string, label: string, n?: number) => {
    const active = path.includes(`/s/${id}/${key}`);
    return (
      <Link
        key={key}
        href={`/s/${id}/${key}`}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-2 border-b-[3px] px-1 pb-2.5 pt-1 whitespace-nowrap ${active ? 'border-pen font-bold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
      >
        {n !== undefined && (
          <span
            className={`grid h-6 w-6 place-items-center rounded-full text-sm font-bold ${done[key] ? 'bg-strong text-white' : active ? 'bg-pen text-white' : 'bg-idle-bg text-muted'}`}
          >
            {done[key] ? '✓' : n}
          </span>
        )}
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label="Subject steps" className="mt-4 flex gap-5 overflow-x-auto">
      {STEPS.map((s, i) => item(s.key, s.label, i + 1))}
      <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
      {TOOLS.map((t) => item(t.key, t.label))}
    </nav>
  );
}
