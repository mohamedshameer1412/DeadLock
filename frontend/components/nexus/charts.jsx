// Small, dependency-free charts. Labels are real HTML text (readable at any width); shapes are SVG or CSS boxes.
// Every chart has a text summary for screen readers and a "Show the numbers" table, so nothing depends on colour or on seeing the picture.
import { cn } from "@/lib/utils";

export function ChartCard({ id, title, description, summary, table, className, children }) {
  return (
    <section aria-labelledby={`${id}-h`} className={cn("rounded-lg border border-border bg-surface p-4 shadow-sm", className)}>
      <h2 id={`${id}-h`} className="text-base font-bold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4" role="img" aria-label={summary}>{children}</div>
      {table && (
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-link">Show the numbers</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead><tr>{table.head.map((h) => <th key={h} scope="col" className="border-b border-border px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="break-anywhere border-b border-border px-2 py-1 font-normal">{c}</th> : <td key={j} className="border-b border-border px-2 py-1">{c}</td>))}</tr>)}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

export function Stat({ label, value, hint, Icon }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="flex items-center gap-2 text-sm text-muted">{Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2">
          <span aria-hidden="true" className={cn("inline-block h-3 w-3 rounded-sm", it.swatch)} />
          <span>{it.label}: <b>{it.value}</b></span>
        </li>
      ))}
    </ul>
  );
}

/** Bars per day; two series side by side. */
export function ActivityChart({ days, series }) {
  const max = Math.max(1, ...days.flatMap((d) => series.map((s) => d[s.key])));
  return (
    <div>
      <div className="flex items-end gap-1 border-b border-border" style={{ height: "10rem" }}>
        {days.map((d) => (
          <div key={d.date} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px" title={`${d.date}: ${series.map((s) => `${d[s.key]} ${s.label.toLowerCase()}`).join(", ")}`}>
            {series.map((s) => (
              <div key={s.key} className={cn("w-full max-w-3 rounded-t-sm", s.swatch)} style={{ height: d[s.key] ? `${Math.max(4, (d[s.key] / max) * 100)}%` : "0" }} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-xs text-muted" aria-hidden="true">
        {days.map((d, i) => <span key={d.date} className={cn("min-w-0 flex-1 text-center", i % 2 && "hidden sm:block")}>{Number(d.date.slice(8))}</span>)}
      </div>
      <p className="mt-1 text-xs text-muted">Tallest bar = {max}. Days are UTC; the last one is today.</p>
      <Legend items={series.map((s) => ({ label: s.label, value: days.reduce((n, d) => n + d[s.key], 0), swatch: s.swatch }))} />
    </div>
  );
}

/** Score (percent) per finished quiz, oldest to newest. */
export function TrendChart({ points }) {
  const n = points.length;
  const x = (i) => (n === 1 ? 50 : 6 + (i / (n - 1)) * 88);
  const y = (pct) => 100 - pct;
  const line = points.map((p, i) => `${x(i)},${y(p.pct)}`).join(" ");
  return (
    <div className="flex gap-2">
      <div className="flex h-44 flex-col justify-between text-xs text-muted" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
      <div className="min-w-0 flex-1">
        <div className="relative h-44 border-b border-l border-border">
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" aria-hidden="true" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
            {n > 1 && <polygon points={`${x(0)},100 ${line} ${x(n - 1)},100`} className="fill-primary" fillOpacity="0.12" />}
            {n > 1 && <polyline points={line} fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="stroke-primary" />}
          </svg>
          {points.map((p, i) => (
            <span key={p.id} title={`${p.label}: ${p.pct}% (${p.detail})`} className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary" style={{ left: `${x(i)}%`, top: `${y(p.pct)}%` }} />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted" aria-hidden="true"><span>{points[0].label}</span>{n > 1 && <span>{points[n - 1].label}</span>}</div>
      </div>
    </div>
  );
}

/** Ring split into labelled segments. */
export function Donut({ segments, centre, centreLabel }) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  let offset = 25;
  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full" aria-hidden="true">
          <circle cx="21" cy="21" r="15.915" fill="none" strokeWidth="6" className="stroke-border" />
          {segments.map((s) => {
            const pct = (s.value / total) * 100;
            const el = s.value > 0 && <circle key={s.label} cx="21" cy="21" r="15.915" fill="none" strokeWidth="6" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} className={s.stroke} />;
            offset -= pct;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold">{centre}</span>
          <span className="text-xs text-muted">{centreLabel}</span>
        </div>
      </div>
      <Legend items={segments.map((s) => ({ label: s.label, value: s.value, swatch: s.swatch }))} />
    </div>
  );
}

/** One horizontal bar per row (0-100). value === null means "no data yet". */
export function HBars({ rows }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="break-anywhere font-semibold">{r.label}</span>
            <span className="shrink-0 text-muted">{r.value === null ? "no answers yet" : `${r.value}%`}</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-accent" aria-hidden="true">
            {r.value !== null && <div className={cn("h-full rounded-full", r.swatch ?? "bg-primary")} style={{ width: `${r.value}%` }} />}
          </div>
          {r.detail && <p className="mt-0.5 text-xs text-muted">{r.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

/** A single bar split into proportional parts. */
export function StackedBar({ parts }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded-full bg-accent" aria-hidden="true">
        {parts.filter((p) => p.value > 0).map((p) => <div key={p.label} className={p.swatch} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${p.value}`} />)}
      </div>
      <Legend items={parts.map((p) => ({ label: p.label, value: p.value, swatch: p.swatch }))} />
    </div>
  );
}
