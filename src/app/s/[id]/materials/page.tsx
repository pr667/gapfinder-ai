import Link from 'next/link';
import { ActionButton } from '@/components/SmallClient';
import { Uploader } from '@/components/Uploader';
import { getDocuments, getTopics } from '@/lib/repo';
import { embeddingsEnabled } from '@/lib/retrieval/embeddings';
import type { DocKind } from '@/lib/types';

const SLOTS: { kind: DocKind; title: string; why: string; hint: string }[] = [
  { kind: 'syllabus', title: 'Syllabus', why: 'The list of topics you will be examined on. The topic map is built from this.', hint: 'One file is enough. Without a syllabus, the map is built from the headings in your notes.' },
  { kind: 'material', title: 'Notes and textbook chapters', why: 'Every quiz question and every explanation is written from these pages, and cites them.', hint: 'PDFs keep their page numbers for citations. Scanned pages without selectable text cannot be read.' },
  { kind: 'paper', title: 'Past exam papers', why: 'Each question is matched to a topic, which shows what the exam asks about most.', hint: 'Numbered questions (1., Q2, 3)) are picked up automatically.' },
];

export default async function MaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docs = await getDocuments(id);
  const hasMap = (await getTopics(id)).length > 0;
  const ready = docs.some((d) => d.kind !== 'paper');
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_19rem]">
      <div className="space-y-5">
        {SLOTS.map((slot) => {
          const mine = docs.filter((d) => d.kind === slot.kind);
          return (
            <section key={slot.kind} className="panel p-5">
              <h2 className="text-xl font-bold">{slot.title}</h2>
              <p className="mt-1 max-w-[65ch] text-muted">{slot.why}</p>
              {mine.length > 0 && (
                <ul className="mt-4 divide-y divide-line border-y border-line">
                  {mine.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-x-4 py-2">
                      <span className="min-w-0 flex-1 font-bold">{d.title}</span>
                      <span className="note">
                        {d.pageCount > 1 ? `${d.pageCount} pages, ` : ''}
                        {slot.kind === 'paper' ? `${d.questions} questions found` : `${d.passages} passages indexed`}
                      </span>
                      <ActionButton quiet label="Remove" busyLabel="Removing…" method="DELETE" path={`/api/subjects/${id}/documents?doc=${d.id}`} confirm={`Remove "${d.title}"?`} />
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <Uploader subjectId={id} kind={slot.kind} hint={slot.hint} />
              </div>
            </section>
          );
        })}
      </div>
      <aside className="space-y-4">
        <div className="panel p-5">
          <h2 className="text-lg font-bold">Next step</h2>
          {!ready ? (
            <p className="mt-2 text-muted">Add a syllabus or some notes to continue.</p>
          ) : hasMap ? (
            <>
              <p className="mt-2 text-muted">Your topic map exists. New files are filed under it automatically.</p>
              <Link href={`/s/${id}/quiz`} className="btn btn-primary mt-3 w-full">
                Go to the quiz
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-muted">Turn the syllabus into a topic map and file your notes and past-paper questions under it.</p>
              <div className="mt-3">
                <ActionButton primary label="Build topic map" busyLabel="Reading your syllabus…" path={`/api/subjects/${id}/topic-map`} next={`/s/${id}/topics`} />
              </div>
            </>
          )}
        </div>
        <p className="note px-1">
          Search over your material: keyword ranking (BM25){embeddingsEnabled() ? ' combined with semantic embeddings.' : '. Semantic embeddings are off (no embeddings key set).'}
        </p>
      </aside>
    </div>
  );
}
