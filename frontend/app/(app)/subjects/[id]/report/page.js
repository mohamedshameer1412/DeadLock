"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { getReport, keys } from "@/lib/queries";
import { plural } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { HBars, Stat, TrendChart } from "@/components/nexus/charts";
import { ErrorState } from "@/components/nexus/shell";
import { Button, Skeleton } from "@/components/ui/primitives";

const pct = (x) => Math.round(x * 100);
const LEVEL = { confident: "Confident", building: "Building", shaky: "Shaky", few: "Not enough answers", untried: "Not tried" };
const SWATCH = { confident: "bg-success", building: "bg-primary", shaky: "bg-danger", few: "bg-warning", untried: "bg-muted" };
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export default function ReportPage() {
  const { id } = useParams();
  useTitle("Report");
  const { data: r, error, isPending, refetch } = useQuery({ queryKey: keys.report(id), queryFn: () => getReport(id) });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-64" />;
  const o = r.overall;
  const trend = r.ability_trend.map((p) => ({ id: p.attempt_id, pct: pct(p.confidence), label: new Date(p.at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" }), detail: `ability ${p.theta}` }));
  const tried = r.topics.filter((t) => t.answered > 0);
  return (
    <article className="space-y-6">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href={`/subjects/${id}/progress`} className="mr-auto inline-flex min-h-11 items-center gap-1 text-sm no-underline hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Progress</Link>
        <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" /> Print or save as PDF</Button>
        <Button asChild size="sm"><a href={`/api/v1/subjects/${id}/report.csv`} download><Download className="h-4 w-4" aria-hidden="true" /> Download CSV</a></Button>
      </div>

      <header>
        <p className="text-sm font-semibold text-muted">Nexus learning report</p>
        <h1 className="break-anywhere text-2xl font-bold">{r.subject}</h1>
        <p className="text-sm text-muted">Made {when(r.generated_at)}</p>
      </header>

      {o ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Overall confidence" value={`${pct(o.confidence)}%`} />
          <Stat label="Ability (θ)" value={`${o.theta > 0 ? "+" : ""}${o.theta}`} hint={`± ${o.se}`} />
          <Stat label="Expected accuracy" value={`${pct(o.expected_accuracy)}%`} />
          <Stat label="Answers used" value={o.answered} hint={`${o.correct} correct`} />
        </div>
      ) : <p className="rounded-md bg-surface-2 p-4 text-sm">No quiz answers yet, so there are no scores. Take a diagnostic test first.</p>}

      <section aria-labelledby="rec-h" className="print-break">
        <h2 id="rec-h" className="mb-2 text-lg font-bold">What to do next</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm">{r.recommendations.map((t, i) => <li key={i} className="break-anywhere">{t}</li>)}</ul>
      </section>

      <section aria-labelledby="topics-h" className="print-break">
        <h2 id="topics-h" className="mb-2 text-lg font-bold">Confidence by topic</h2>
        {tried.length > 0 && <HBars rows={tried.map((t) => ({ key: t.topic_id, label: t.name, value: pct(t.confidence), swatch: SWATCH[t.label], detail: `${LEVEL[t.label]} · ${t.correct} of ${t.answered} correct` }))} />}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">All topics</caption>
            <thead><tr>{["Topic", "Confidence", "Ability θ", "Correct / answered", "Level", "Avg time"].map((h) => <th key={h} scope="col" className="border-b border-border px-2 py-1 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {r.topics.map((t) => (
                <tr key={t.topic_id}>
                  <th scope="row" className="break-anywhere border-b border-border px-2 py-1 font-normal">{t.name}</th>
                  <td className="border-b border-border px-2 py-1">{t.confidence === null ? "–" : `${pct(t.confidence)}%`}</td>
                  <td className="border-b border-border px-2 py-1">{t.theta ?? "–"}</td>
                  <td className="border-b border-border px-2 py-1">{t.correct} / {t.answered}</td>
                  <td className="border-b border-border px-2 py-1">{LEVEL[t.label]}</td>
                  <td className="border-b border-border px-2 py-1">{t.avg_seconds ? `${Math.round(t.avg_seconds)} s` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {trend.length > 0 && (
        <section aria-labelledby="trend-h" className="print-break">
          <h2 id="trend-h" className="mb-2 text-lg font-bold">Confidence over time</h2>
          <TrendChart points={trend} />
        </section>
      )}

      {r.backtracking.length > 0 && (
        <section aria-labelledby="back-h" className="print-break">
          <h2 id="back-h" className="mb-1 text-lg font-bold">Basics checks</h2>
          <p className="mb-2 text-sm text-muted">Questions asked from an earlier topic after a miss. If these go wrong too, the earlier topic is the place to start.</p>
          <ul className="space-y-1 text-sm">{r.backtracking.map((b) => <li key={b.topic} className="break-anywhere"><b>{b.topic}</b>: {b.correct} of {b.asked} right</li>)}</ul>
        </section>
      )}

      {r.attempts.length > 0 && (
        <section aria-labelledby="att-h" className="print-break">
          <h2 id="att-h" className="mb-2 text-lg font-bold">Quizzes</h2>
          <ul className="space-y-1 text-sm">
            {r.attempts.map((a) => (
              <li key={a.id} className="break-anywhere">
                {when(a.finished_at)} · {a.kind === "standard" ? "quiz" : a.kind} · {a.mode} · <b>{a.correct} of {a.answered}</b> correct{a.ended_reason ? ` · ended early: ${a.ended_reason}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.wrong_questions > 0 && <p className="text-sm">{plural(r.wrong_questions, "question")} still answered wrongly. <span className="no-print">A revision quiz on the <Link href={`/subjects/${id}/quiz`}>Quiz</Link> tab asks exactly those.</span></p>}

      <footer className="border-t border-border pt-3 text-xs text-muted">{r.method} Scores describe your answers in Nexus only; they are not a grade.</footer>
    </article>
  );
}
