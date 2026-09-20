"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, FileBarChart, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { getProgress, getSubject, keys } from "@/lib/queries";
import { friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { ChartCard, HBars, Stat, TrendChart } from "@/components/nexus/charts";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Alert, Badge, Button, Card, Label, Progress, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from "@/components/ui/primitives";

const LEVEL = {
  confident: { label: "Confident", tone: "success", swatch: "bg-success" },
  building: { label: "Building", tone: "neutral", swatch: "bg-primary" },
  shaky: { label: "Shaky", tone: "danger", swatch: "bg-danger" },
  few: { label: "Not enough answers yet", tone: "warning", swatch: "bg-warning" },
  untried: { label: "Not tried yet", tone: "neutral", swatch: "bg-muted" },
};
const pct = (x) => Math.round(x * 100);
const day = (t) => (t ? new Date(t * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

export default function ProgressPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: subject } = useQuery({ queryKey: keys.subject(id), queryFn: () => getSubject(id) });
  useTitle("Progress", subject?.name);
  const { data, error, isPending, refetch } = useQuery({ queryKey: keys.progress(id), queryFn: () => getProgress(id) });
  const [topic, setTopic] = useState("");
  const [prereq, setPrereq] = useState("");
  const [problem, setProblem] = useState("");
  const done = () => qc.invalidateQueries({ queryKey: keys.progress(id) });
  const add = useMutation({
    mutationFn: () => api(`/subjects/${id}/prerequisites`, { method: "POST", json: { topic_id: Number(topic), prereq_id: Number(prereq) } }),
    onSuccess: () => { setTopic(""); setPrereq(""); setProblem(""); toast.success("Link added"); done(); },
    onError: (e) => setProblem(friendlyError(e)),
  });
  const remove = useMutation({
    mutationFn: (p) => api(`/subjects/${id}/prerequisites/${p.topic_id}/${p.prereq_id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Link removed"); done(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-64" />;
  if (data.topics.length === 0) {
    return (
      <EmptyState title="No topics yet" action={<Button asChild><Link href={`/subjects/${id}/materials`}>Go to Materials</Link></Button>}>
        Progress is tracked per topic, and topics come from the material you upload.
      </EmptyState>
    );
  }
  const o = data.overall;
  const tried = data.topics.filter((t) => t.answered > 0);
  const trend = data.ability_trend.map((p) => ({ id: p.attempt_id, pct: pct(p.confidence), label: day(p.at), detail: `ability ${p.theta > 0 ? "+" : ""}${p.theta}, ${pct(p.accuracy)}% right in that quiz` }));
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">A confidence score for every topic, worked out from your quiz answers with an IRT model. It grows more certain as you answer more.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm"><Link href={`/subjects/${id}/quiz`}>Diagnostic or revision quiz</Link></Button>
          <Button asChild size="sm"><Link href={`/subjects/${id}/report`}><FileBarChart className="h-4 w-4" aria-hidden="true" /> Report</Link></Button>
        </div>
      </div>

      {!o && <Alert tone="info">Nothing to show yet. <Link href={`/subjects/${id}/quiz`}>Take a diagnostic test</Link> (two questions per topic) to get your first scores.</Alert>}

      {o && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Overall confidence" value={`${pct(o.confidence)}%`} hint="chance you are above the proficient line" />
          <Stat label="Ability (θ)" value={`${o.theta > 0 ? "+" : ""}${o.theta}`} hint={`± ${o.se} · 0 is average`} />
          <Stat label="Expected accuracy" value={`${pct(o.expected_accuracy)}%`} hint="on an average question" />
          <Stat label="Answers used" value={o.answered} hint={`${o.correct} correct`} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          id="conf" title="Confidence by topic" description="Higher is better. The label says how much evidence is behind each number."
          summary={tried.length ? tried.map((t) => `${t.name}: ${pct(t.confidence)}% (${LEVEL[t.label]?.label})`).join("; ") : "No answers yet."}
          table={{ head: ["Topic", "Confidence", "Ability θ", "Correct / answered", "Level"], rows: data.topics.map((t) => [t.name, t.confidence === null ? "–" : `${pct(t.confidence)}%`, t.theta ?? "–", `${t.correct} / ${t.answered}`, LEVEL[t.label]?.label]) }}
        >
          {tried.length === 0 ? <p className="rounded-md bg-surface-2 p-4 text-sm text-muted">No topic has been answered yet.</p> : (
            <HBars rows={tried.map((t) => ({ key: t.topic_id, label: t.name, value: pct(t.confidence), swatch: LEVEL[t.label]?.swatch, detail: `${LEVEL[t.label]?.label} · ${t.correct} of ${t.answered} correct` }))} />
          )}
        </ChartCard>

        <ChartCard
          id="ability" title="Confidence over time" description="Overall confidence after each quiz (all answers so far)."
          summary={trend.length ? `Overall confidence after each quiz: ${trend.map((p) => `${p.pct}%`).join(", ")}.` : "No finished quizzes yet."}
          table={trend.length ? { head: ["Quiz", "Day", "Confidence", "Detail"], rows: trend.map((p) => [`#${p.id}`, p.label, `${p.pct}%`, p.detail]) } : undefined}
        >
          {trend.length === 0 ? <p className="rounded-md bg-surface-2 p-4 text-sm text-muted">Finish a quiz to start the line.</p> : <TrendChart points={trend} />}
        </ChartCard>
      </div>

      <section aria-labelledby="topics-h">
        <h2 id="topics-h" className="mb-3 text-lg font-bold">Topics</h2>
        <ul className="space-y-3">
          {data.topics.map((t) => {
            const lv = LEVEL[t.label] ?? LEVEL.untried;
            return (
              <li key={t.topic_id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-anywhere font-semibold">{t.name}</p>
                    <Badge tone={lv.tone} className="ml-auto">{lv.label}</Badge>
                  </div>
                  <Progress value={t.confidence === null ? 0 : pct(t.confidence)} aria-label={`${t.name} confidence`} className="mt-3" />
                  <p className="mt-2 text-sm text-muted">
                    {t.confidence === null ? "No answers yet." : (
                      <>Confidence <b>{pct(t.confidence)}%</b> · ability {t.theta > 0 ? "+" : ""}{t.theta} (± {t.se}) · {t.correct} of {t.answered} correct{t.avg_seconds ? ` · about ${Math.round(t.avg_seconds)} s each` : ""}</>
                    )}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="pre-h">
        <h2 id="pre-h" className="mb-1 text-lg font-bold">What builds on what</h2>
        <p className="mb-3 text-sm text-muted">When you miss a question in a quiz, Nexus steps back and asks a few questions from the topic it builds on. Set that here; if you do not, it uses the topic just before in your material.</p>
        {data.prerequisites.length > 0 && (
          <ul className="mb-4 space-y-2">
            {data.prerequisites.map((p) => (
              <li key={`${p.topic_id}-${p.prereq_id}`}>
                <Card className="flex items-center gap-2 p-3 text-sm">
                  <span className="break-anywhere flex-1"><b>{p.topic}</b> builds on <ArrowRight className="inline h-4 w-4" aria-hidden="true" /> <b>{p.prereq}</b></span>
                  <Button variant="ghost" size="icon" aria-label={`Remove: ${p.topic} builds on ${p.prereq}`} onClick={() => remove.mutate(p)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
        <Card>
          <form onSubmit={(e) => { e.preventDefault(); setProblem(""); add.mutate(); }} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="pre-topic">This topic</Label>
              <Select value={topic} onValueChange={setTopic}>
                <SelectTrigger id="pre-topic"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>{data.topics.map((t) => <SelectItem key={t.topic_id} value={String(t.topic_id)}>{t.path}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pre-req">builds on this one</Label>
              <Select value={prereq} onValueChange={setPrereq}>
                <SelectTrigger id="pre-req"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>{data.topics.map((t) => <SelectItem key={t.topic_id} value={String(t.topic_id)}>{t.path}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={!topic || !prereq || add.isPending}>Add link</Button>
          </form>
          {problem && <Alert tone="danger" className="mt-3">{problem}</Alert>}
        </Card>
      </section>

      <details className="rounded-lg border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-semibold">How is the confidence score calculated?</summary>
        <p className="mt-2 text-muted">
          Nexus uses item response theory (IRT). Every answer you give updates an estimate of your ability on that topic, θ, using a 3-parameter model (discrimination 1, guessing 0.25 because there are four options).
          The estimate starts at average with a wide uncertainty, so a topic with two answers is never shown as certain. Confidence is the probability that your true ability is above the proficient line (θ &gt; 0, about 6 in 10 on an average question).
          A question you answered several times is treated as easier or harder based on your <i>other</i> answers to it. It uses only your own answers and no one else&apos;s.
        </p>
      </details>
    </div>
  );
}
