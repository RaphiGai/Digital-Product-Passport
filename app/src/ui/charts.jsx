/**
 * Dependency-free charts (SVG + CSS) for the sustainability dashboard. Kept
 * deliberately small and self-contained — no chart library is installed. If richer
 * interactivity is ever needed, recharts/visx can replace these without touching the
 * pages that consume them.
 */

const identity = (v) => v;

/**
 * Vertical bars from `[{ label, value }]` — used for the monthly trend.
 * @param {{ data: {label: string, value: number}[], height?: number, color?: string,
 *   format?: (v: number) => string }} props
 */
export function BarChart({ data, height = 150, color = 'var(--bar-color, #16a34a)', format = identity }) {
  if (!data || data.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">No data in this period.</p>;
  }
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  const plot = height - 22;
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const v = Number(d.value) || 0;
          const h = Math.max(2, Math.round((v / max) * plot));
          return (
            <div
              key={i}
              className="flex flex-1 flex-col items-center justify-end gap-1"
              title={`${d.label}: ${format(v)}`}
            >
              <span className="text-[10px] tabular-nums text-ink-muted">{format(v)}</span>
              <div className="w-full rounded-t" style={{ height: h, background: color }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center text-[10px] text-ink-muted" title={d.label}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Horizontal bars from `[{ label, value, sub? }]` — used for Top-N rankings.
 * @param {{ data: {label: string, value: number, sub?: string}[], color?: string,
 *   format?: (v: number) => string, empty?: string }} props
 */
export function HBars({ data, color = '#16a34a', format = identity, empty = 'No data.' }) {
  if (!data || data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">{empty}</p>;
  }
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  return (
    <ul className="space-y-2">
      {data.map((d, i) => {
        const v = Number(d.value) || 0;
        return (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="w-44 shrink-0 truncate text-ink" title={d.label}>
              {d.label}
              {d.sub && <span className="ml-1 text-xs text-ink-muted">{d.sub}</span>}
            </span>
            <span className="relative h-5 flex-1 overflow-hidden rounded bg-gray-100">
              <span
                className="absolute inset-y-0 left-0 rounded"
                style={{ width: `${(v / max) * 100}%`, background: color }}
              />
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums text-ink">{format(v)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Donut from `[{ label, value, color }]` with a legend — used for the ESPR mix.
 * Drawn with stroke-dasharray on stacked circles (no arc-path math).
 * @param {{ segments: {label: string, value: number, color: string}[], size?: number,
 *   thickness?: number, centerLabel?: string }} props
 */
export function DonutChart({ segments, size = 160, thickness = 22, centerLabel }) {
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={thickness} />
          {total > 0 &&
            segments.map((s, i) => {
              const v = Number(s.value) || 0;
              if (v <= 0) return null;
              const dash = (v / total) * c;
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-acc}
                />
              );
              acc += dash;
              return el;
            })}
        </g>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fill: '#111827', fontSize: 22, fontWeight: 600 }}
        >
          {centerLabel ?? total}
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
            <span className="text-ink">{s.label}</span>
            <span className="text-ink-muted">— {Number(s.value) || 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
