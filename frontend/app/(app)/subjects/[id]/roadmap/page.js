"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CalendarCheck, Printer, Route, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { getRoadmap, keys } from "@/lib/queries";
import { cn, friendlyError, plural } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { ChartCard, Stat } from "@/components/nexus/charts";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Alert, Badge, Button, Card, Checkbox, Input, Label, Skeleton, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/primitives";

const STATUS = {
  critical: { label: "Far below target", tone: "danger", bar: "bg-danger" },
  moderate: { label: "Below target", tone: "warning", bar: "bg-warning" },
  minor: { label: "Close to target", tone: "neutral", bar: "bg-primary" },
  on_track: { label: "On track", tone: "success", bar: "bg-success" },
  unassessed: { label: "Not assessed yet", tone: "neutral", bar: "bg-muted" },
};
const STEP_LABEL = { read: "Read", notes: "Note", flashcards: "Flashcards", quiz: "Quiz", revision: "Revision" };
const pc = (x) => Math.round(x * 100);
const hours = (m) => `${Math.round((m / 60) * 10) / 10} h`;

/** A confidence bar with a marker where the target is, so the distance is visible. */
function GapBar({ confidence, target, tone }) {
  return (
    <div className="relative mt-2 h-3 rounded-full bg-accent" role="img" aria-label={confidence === null ? `Not assessed. Target ${pc(target)}%.` : `Confidence ${pc(confidence)}%, target ${pc(target)}%.`}>
      {confidence !== null && <div className={cn("h-full rounded-full", tone)} style={{ width: `${pc(confidence)}%` }} />}
      <div className="absolute -top-1 h-5 w-0.5 bg-foreground" style={{ left: `${pc(target)}%` }} aria-hidden="true" />
    </div>
  );
}

function Profile({ id, data }) {
  const qc = useQueryClient();
  const [goal, setGoal] = useState(data.profile.goal);
  const [hoursPerWeek, setHours] = useState(String(data.profile.hours_per_week));
  const [date, setDate] = useState(data.profile.target_date ?? "");
  const [problem, setProblem] = useState("");
  const save = useMutation({
    mutationFn: () => api(`/subjects/${id}/roadmap/profile`, { method: "PUT", json: { goal, hours_per_week: Number(hoursPerWeek), target_date: date || null } }),
    onSuccess: (r) => { qc.setQueryData(keys.roadmap(id), r); setProblem(""); toast.success("Roadmap updated"); },
    onError: (e) => setProblem(friendlyError(e)),
  });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Card className="no-print">
      <h2 className="text-lg font-bold">Your study profile</h2>
      <p className="mt-1 text-sm text-muted">The roadmap is fitted to the time you have. Your level (<b>{data.level ? { new: "new learner", intermediate: "intermediate", professional: "professional" }[data.level] : "not chosen"}</b>) sets the target: <b>{pc(data.target)}%</b> confidence in every topic.</p>
      <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_9rem_11rem_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); setProblem(""); save.mutate(); }}>
        <div><Label htmlFor="goal">Goal (optional)</Label><Input id="goal" value={goal} maxLength={300} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. pass the unit test" /></div>
        <div>
          <Label htmlFor="hpw">Hours per week</Label>
          <Select value={hoursPerWeek} onValueChange={setHours}>
            <SelectTrigger id="hpw"><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3, 5, 8, 12, 20, 30].map((h) => <SelectItem key={h} value={String(h)}>{h} {h === 1 ? "hour" : "hours"}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label htmlFor="target-date">Target date (optional)</Label><Input id="target-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Update plan"}</Button>
      </form>
      {problem && <Alert tone="danger" className="mt-3">{problem}</Alert>}
    </Card>
  );
}

function Coach({ id, data }) {
  const qc = useQueryClient();
  const c = data.coach;
  const ask = useMutation({
    mutationFn: () => api(`/subjects/${id}/roadmap/coach`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.roadmap(id) }),
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-link" aria-hidden="true" /> Your coach</h2>
      {c.status === "pending" ? (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span> The coach is writing your plan…</p>
      ) : (
        <>
          <p className="break-anywhere mt-2 text-sm">{c.text}</p>
          <p className="mt-2 text-xs text-muted">
            {c.from_model ? `Written by ${c.model} from your topic names and scores.` : "Worked out from your numbers by plain rules."}
            {c.stale && " Your progress has changed since this was written."}
            {c.status === "failed" && " The last attempt did not finish."}
          </p>
        </>
      )}
      <div className="no-print mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => ask.mutate()} disabled={ask.isPending || c.status === "pending"}>{c.from_model ? "Ask the coach again" : "Ask the coach to write it"}</Button>
        <span className="text-xs text-muted">Only topic names and scores are sent to the model, never your materials.</span>
      </div>
    </Card>
  );
}

function Heatmap({ data }) {
  const cols = Object.keys(data.source_labels);
  const cell = (s) => (s.answered ? `${Math.round((100 * s.correct) / s.answered)}%` : "–");
  const tone = (s) => (!s.answered ? "" : s.correct / s.answered >= 0.7 ? "bg-success-bg text-success" : s.correct / s.answered >= 0.4 ? "bg-warning-bg text-warning" : "bg-danger-bg text-danger");
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">Accuracy per topic and kind of test</caption>
        <thead><tr><th scope="col" className="border-b border-border px-2 py-1 font-semibold">Topic</th>{cols.map((k) => <th key={k} scope="col" className="border-b border-border px-2 py-1 text-center font-semibold">{data.source_labels[k]}</th>)}</tr></thead>
        <tbody>
          {data.gaps.map((g) => (
            <tr key={g.topic_id}>
              <th scope="row" className="break-anywhere border-b border-border px-2 py-1 font-normal">{g.name}</th>
              {cols.map((k) => <td key={k} className={cn("border-b border-border px-2 py-1 text-center", tone(g.sources[k]))} title={g.sources[k].answered ? `${g.sources[k].correct} of ${g.sources[k].answered}` : "no answers"}>{cell(g.sources[k])}</td>)}
            </tr>
          ))}
          <tr>
            <th scope="row" className="px-2 py-1 font-semibold">All topics</th>
            {cols.map((k) => <td key={k} className="px-2 py-1 text-center font-semibold">{cell(data.source_totals[k])}</td>)}
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Share of answers that were right (or recalled, for flashcards). A dash means no answers of that kind yet.</p>
    </div>
  );
}

export default function RoadmapPage() {
  const { id } = useParams();
  useTitle("Roadmap");
  const { data, error, isPending, refetch } = useQuery({
    queryKey: keys.roadmap(id), queryFn: () => getRoadmap(id),
    refetchInterval: (q) => (q.state.data?.coach.status === "pending" ? 3000 : false),
  });
  const [done, setDone] = useState({});
  const storeKey = `nexus.roadmap.${id}`;
  useEffect(() => { try { setDone(JSON.parse(localStorage.getItem(storeKey) || "{}")); } catch {} }, [storeKey]);
  const toggle = (key, on) => setDone((d) => { const n = { ...d, [key]: on }; try { localStorage.setItem(storeKey, JSON.stringify(n)); } catch {} return n; });

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-64" />;
  if (data.gaps.length === 0) {
    return <EmptyState title="Nothing to plan yet" action={<Button asChild><Link href={`/subjects/${id}/materials`}>Add materials</Link></Button>}>A roadmap is built from the topics Nexus finds in your material.</EmptyState>;
  }
  const s = data.roadmap.summary;
  const lagging = data.gaps.filter((g) => g.status === "critical" || g.status === "moderate");
  const ranked = [...data.gaps].sort((a, b) => (["critical", "moderate", "unassessed", "minor", "on_track"].indexOf(a.status) - ["critical", "moderate", "unassessed", "minor", "on_track"].indexOf(b.status)) || ((b.gap ?? 0) - (a.gap ?? 0)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Route className="h-5 w-5" aria-hidden="true" /> Study roadmap for {data.subject}</h2>
        <Button variant="secondary" size="sm" className="no-print" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" /> Print or save as PDF</Button>
      </div>

      <Profile key={JSON.stringify(data.profile)} id={id} data={data} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Match to your target" value={data.readiness === null ? "–" : `${pc(data.readiness)}%`} hint={data.readiness === null ? "take a diagnostic to see it" : `target ${pc(data.target)}% per topic`} />
        <Stat label="Topics below target" value={lagging.length} hint={`${data.counts.critical} far below`} />
        <Stat label="Not assessed yet" value={data.counts.unassessed} hint="no answers on these" />
        <Stat label="Plan length" value={s.weeks ? plural(s.weeks, "week") : "–"} hint={`${hours(s.total_minutes)} at ${s.hours_per_week} h a week`} />
      </div>

      {s.target_date && (
        <Alert tone={s.on_track ? "success" : "warning"}>
          <span className="flex items-start gap-2"><CalendarCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{s.weeks_available === 0 ? "The target date has passed." : s.on_track ? `On track: the plan needs ${plural(s.weeks, "week")} and you have ${plural(s.weeks_available, "week")} until ${s.target_date}.` : `Tight: the plan needs ${plural(s.weeks, "week")} but you have ${plural(s.weeks_available, "week")}. About ${s.hours_needed} hours a week would fit.`}</span></span>
        </Alert>
      )}

      <Coach id={id} data={data} />

      <section aria-labelledby="gaps-h">
        <h2 id="gaps-h" className="mb-1 text-lg font-bold">Skill gaps</h2>
        <p className="mb-3 text-sm text-muted">Each topic against your target, judged from every test you took: the diagnostic, regular and revision quizzes, assessments and flashcards. A topic with no answers is shown as not assessed, never as weak.</p>
        <ul className="space-y-3">
          {ranked.map((g) => {
            const st = STATUS[g.status];
            return (
              <li key={g.topic_id} className="print-break">
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-anywhere font-semibold">{g.name}</p>
                    {g.trend === "improving" && <span className="inline-flex items-center gap-1 text-xs text-success"><TrendingUp className="h-4 w-4" aria-hidden="true" /> improving</span>}
                    {g.trend === "slipping" && <span className="inline-flex items-center gap-1 text-xs text-danger"><TrendingDown className="h-4 w-4" aria-hidden="true" /> slipping</span>}
                    <Badge tone={st.tone} className="ml-auto">{st.label}</Badge>
                  </div>
                  <GapBar confidence={g.confidence} target={g.target} tone={st.bar} />
                  <p className="mt-2 text-sm text-muted">
                    {g.confidence === null ? "No answers yet." : <>Confidence <b>{pc(g.confidence)}%</b> of a <b>{pc(g.target)}%</b> target{g.gap ? <> · gap <b>{Math.round(g.gap * 100)} points</b></> : null}</>}
                  </p>
                  {g.blocked_by.length > 0 && (
                    <Alert tone="warning" className="mt-2"><span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>Likely cause: <b>{g.blocked_by.map((b) => b.name).join(", ")}</b> {g.blocked_by.length === 1 ? "is" : "are"} not solid yet. The roadmap puts {g.blocked_by.length === 1 ? "it" : "them"} first.</span></span></Alert>
                  )}
                  {g.reasons.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">{g.reasons.map((r, i) => <li key={i} className="break-anywhere">{r}</li>)}</ul>}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <ChartCard id="heat" title="Gap by kind of test" description="Where the evidence comes from, topic by topic."
        summary={`Accuracy by kind of test across ${data.gaps.length} topics.`}>
        <Heatmap data={data} />
      </ChartCard>

      <section aria-labelledby="road-h">
        <h2 id="road-h" className="mb-1 text-lg font-bold">Your roadmap</h2>
        <p className="mb-3 text-sm text-muted">Foundations first, the biggest gaps early, in weeks that fit {s.hours_per_week} hours. Tick steps off as you finish them (kept on this device).</p>
        {s.weeks > s.shown_weeks && <Alert tone="info" className="mb-3">Showing the first {s.shown_weeks} of {s.weeks} weeks. Update the plan as you progress and the next weeks appear.</Alert>}
        <ol className="space-y-4">
          {data.roadmap.weeks.map((w) => (
            <li key={w.week} className="print-break">
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-bold">Week {w.week}</h3>
                  <span className="text-xs text-muted">about {hours(w.minutes)}</span>
                </div>
                <p className="break-anywhere mt-1 text-sm font-semibold">{w.goal}</p>
                <ul className="mt-3 space-y-1">
                  {w.steps.map((step, i) => {
                    const key = `${w.week}-${i}-${step.topic_id}-${step.type}`;
                    return (
                      <li key={key} className="flex min-h-11 items-center gap-3">
                        <Checkbox checked={!!done[key]} onCheckedChange={(c) => toggle(key, !!c)} aria-label={`Done: ${step.title}`} />
                        <Link href={step.href} className={cn("break-anywhere flex-1 text-sm", done[key] && "text-muted line-through")}><b>{STEP_LABEL[step.type]}</b> · {step.title.replace(/^(Read: |Quiz yourself on |Flashcards for )/, "")}</Link>
                        <span className="text-xs text-muted">{step.minutes} min</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs"><b>Milestone:</b> {w.milestone}</p>
                {w.idea && <p className="mt-1 text-xs"><b>Mini-project:</b> {w.idea}</p>}
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
