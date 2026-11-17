'use client';

import { useState } from 'react';

function Highlighted({ passage, evidence }: { passage: string; evidence?: string }) {
  if (!evidence) return <>{passage}</>;
  // Match the quote while tolerating differences in spacing and punctuation.
  const words = evidence.match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length < 3) return <>{passage}</>;
  const match = passage.match(new RegExp(words.join('[^A-Za-z0-9]+'), 'i'));
  if (!match || match.index === undefined) return <>{passage}</>;
  return (
    <>
      {passage.slice(0, match.index)}
      <mark className="hi">{match[0]}</mark>
      {passage.slice(match.index + match[0].length)}
    </>
  );
}

/** A citation. Click to read the stored passage, with the supporting words highlighted. */
export function Source({ label, passage, evidence, n, defaultOpen }: { label: string; passage?: string; evidence?: string; n?: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="text-[0.94rem]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={!passage}
        aria-expanded={open}
        className="inline-flex cursor-pointer items-baseline gap-1.5 text-left text-pen underline decoration-pen/40 underline-offset-4 hover:decoration-pen disabled:cursor-default disabled:text-muted disabled:no-underline"
      >
        {n !== undefined && <span className="rounded bg-pen px-1.5 text-xs font-bold text-white no-underline">{n}</span>}
        <span>{label}</span>
      </button>
      {open && passage && (
        <blockquote className="mt-2 max-w-[70ch] whitespace-pre-line border-l-4 border-hi bg-paper px-4 py-3 text-ink">
          <Highlighted passage={passage} evidence={evidence} />
        </blockquote>
      )}
    </div>
  );
}
