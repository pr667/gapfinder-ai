'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from './client';
import { ErrorNote } from './SmallClient';

export function PlanSettings({ subjectId, days, hours, disabled }: { subjectId: string; days: number; hours: number; disabled: boolean }) {
  const router = useRouter();
  const [d, setD] = useState(String(days));
  const [h, setH] = useState(String(hours));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await api(`/api/subjects/${subjectId}/plan`, { days: Number(d), hoursPerDay: Number(h) });
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        }
        setBusy(false);
      }}
    >
      <label>
        <span className="note block">Days until the exam</span>
        <input className="field w-28" type="number" min={1} max={60} value={d} onChange={(e) => setD(e.target.value)} />
      </label>
      <label>
        <span className="note block">Hours a day</span>
        <input className="field w-28" type="number" min={0.25} max={14} step={0.25} value={h} onChange={(e) => setH(e.target.value)} />
      </label>
      <button className="btn" disabled={busy || disabled}>
        {busy ? 'Updating…' : 'Update plan'}
      </button>
      <ErrorNote message={error} />
    </form>
  );
}
