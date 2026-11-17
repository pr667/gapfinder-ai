'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { DocKind } from '@/lib/types';
import { api } from './client';
import { ErrorNote } from './SmallClient';

type Page = { page: number | null; text: string };

/**
 * PDFs are read in the browser (pdf.js) and only their text is sent to the
 * server. That keeps page numbers for citations and avoids Vercel's 4.5 MB
 * request limit for large textbook files.
 */
async function readPdf(file: File): Promise<Page[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: Page[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    let text = '';
    let lastY: number | null = null;
    for (const item of content.items as any[]) {
      if (typeof item.str !== 'string') continue;
      const y = item.transform?.[5] ?? 0;
      // A vertical jump larger than a line means a new paragraph or heading.
      if (lastY !== null && item.str.trim() && Math.abs(lastY - y) > (item.height || 10) * 1.9) text += '\n';
      text += item.str + (item.hasEOL ? '\n' : '');
      if (item.str.trim()) lastY = y;
    }
    pages.push({ page: n, text });
  }
  return pages;
}

export function Uploader({ subjectId, kind, hint }: { subjectId: string; kind: DocKind; hint: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [pasting, setPasting] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  async function send(docTitle: string, pages: Page[]) {
    await api(`/api/subjects/${subjectId}/documents`, { kind, title: docTitle, pages });
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    try {
      for (const file of Array.from(files)) {
        setBusy(`Reading ${file.name}…`);
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const pages = isPdf ? await readPdf(file) : [{ page: null, text: await file.text() }];
        setBusy(`Indexing ${file.name}…`);
        await send(file.name.replace(/\.(pdf|txt|md)$/i, ''), pages);
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
    if (input.current) input.current.value = '';
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <button className="btn" disabled={Boolean(busy)} onClick={() => input.current?.click()}>
          {busy || 'Upload PDF or text file'}
        </button>
        <button className="btn btn-quiet" disabled={Boolean(busy)} onClick={() => setPasting(!pasting)}>
          {pasting ? 'Cancel' : 'Paste text instead'}
        </button>
      </div>
      <p className="note mt-2">{hint}</p>
      {pasting && (
        <form
          className="mt-3 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy('Indexing…');
            setError('');
            try {
              await send(title || 'Pasted text', [{ page: null, text }]);
              setText('');
              setTitle('');
              setPasting(false);
              router.refresh();
            } catch (err) {
              setError((err as Error).message);
            }
            setBusy('');
          }}
        >
          <input className="field" placeholder="Title, for example: Chapter 3 notes" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
          <textarea className="field min-h-40" placeholder="Paste the text here" value={text} onChange={(e) => setText(e.target.value)} required aria-label="Text" />
          <button className="btn btn-primary" disabled={Boolean(busy)}>
            Add this text
          </button>
        </form>
      )}
      <ErrorNote message={error} />
    </div>
  );
}
