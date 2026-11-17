import type { Status } from '@/lib/types';

export const STATUS: Record<Status, { label: string; fill: string; chip: string }> = {
  weak: { label: 'Weak', fill: 'var(--color-weak)', chip: 'bg-weak-bg text-weak' },
  medium: { label: 'Medium', fill: 'var(--color-medium)', chip: 'bg-medium-bg text-medium-ink' },
  strong: { label: 'Strong', fill: 'var(--color-strong)', chip: 'bg-strong-bg text-strong-ink' },
  untested: { label: 'Not tested', fill: '#8a93a6', chip: 'bg-idle-bg text-muted' },
};

/** Shape + word, so the status never depends on colour alone. */
export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true } as const;
  if (status === 'weak')
    return (
      <svg {...common}>
        <path d="M8 1.5 15 14H1z" fill="currentColor" />
        <path d="M8 6v4M8 11.6v.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  if (status === 'medium')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor" />
      </svg>
    );
  if (status === 'strong')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="m4.6 8.2 2.2 2.2 4.6-4.8" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.6 2.6" />
    </svg>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-bold ${STATUS[status].chip}`}>
      <StatusIcon status={status} />
      {STATUS[status].label}
    </span>
  );
}

/** 0-100% bar with the weak/strong thresholds marked. */
export function MasteryBar({ value, status }: { value: number | null; status: Status }) {
  const pct = value === null ? 0 : Math.round(value * 100);
  return (
    <div className="relative h-2.5 w-full rounded-full bg-idle-bg" role="img" aria-label={value === null ? 'Not tested' : `${pct}%`}>
      {value !== null && <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 3)}%`, background: STATUS[status].fill }} />}
      <span className="absolute top-[-3px] h-4 w-px bg-ink/40" style={{ left: '50%' }} />
      <span className="absolute top-[-3px] h-4 w-px bg-ink/40" style={{ left: '80%' }} />
    </div>
  );
}
