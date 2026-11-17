'use client';

import { useState } from 'react';

/** Quiz score over attempts. One series, so no legend; hover or focus a point for the value. */
export function ScoreChart({ points }: { points: { label: string; value: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 640;
  const H = 240;
  const pad = { l: 44, r: 24, t: 18, b: 34 };
  const x = (i: number) => (points.length === 1 ? (pad.l + W - pad.r) / 2 : pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl" role="img" aria-label={`Quiz score by attempt: ${points.map((p) => `${p.label} ${Math.round(p.value * 100)}%`).join(', ')}`}>
      {[0, 0.5, 0.8, 1].map((tick) => (
        <g key={tick}>
          <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} stroke="var(--color-line)" strokeDasharray={tick === 0.5 || tick === 0.8 ? '3 4' : undefined} />
          <text x={pad.l - 8} y={y(tick) + 4} textAnchor="end" fontSize="12" fill="var(--color-muted)">
            {tick * 100}%
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--color-pen)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i} tabIndex={0} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} style={{ outline: 'none' }}>
          <rect x={x(i) - 26} y={pad.t} width="52" height={H - pad.t - pad.b} fill="transparent" />
          <circle cx={x(i)} cy={y(p.value)} r={active === i ? 7 : 5} fill="var(--color-pen)" stroke="#fff" strokeWidth="2" />
          <text x={x(i)} y={H - 12} textAnchor="middle" fontSize="12" fill="var(--color-muted)">
            {p.label}
          </text>
          {(active === i || i === points.length - 1 || i === 0) && (
            <text x={x(i)} y={y(p.value) - 12} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-ink)">
              {Math.round(p.value * 100)}%
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
