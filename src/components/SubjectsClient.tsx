'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from './client';
import { ErrorNote } from './SmallClient';

export function NewSubject({ hasSample }: { hasSample: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function create(body: unknown, which: string) {
    setBusy(which);
    setError('');
    try {
      const { id } = await api<{ id: string }>('/api/subjects', body);
      router.push(`/s/${id}/materials`);
    } catch (e) {
      setError((e as Error).message);
      setBusy('');
    }
  }

  return (
    <div className="panel p-5">
      <h2 className="text-xl font-bold">Start a subject</h2>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create({ name }, 'new');
        }}
      >
        <input className="field max-w-sm" placeholder="For example: Physics, Unit 3" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Subject name" />
        <button className="btn btn-primary" disabled={Boolean(busy)}>
          {busy === 'new' ? 'Creating…' : 'Create subject'}
        </button>
      </form>
      {!hasSample && (
        <p className="note mt-4">
          Nothing to upload right now?{' '}
          <button className="cursor-pointer font-bold text-pen underline underline-offset-4" disabled={Boolean(busy)} onClick={() => create({ sample: true }, 'sample')}>
            {busy === 'sample' ? 'Loading sample…' : 'Load the sample biology subject'}
          </button>{' '}
          (a syllabus, class notes and a past paper).
        </p>
      )}
      <ErrorNote message={error} />
    </div>
  );
}
