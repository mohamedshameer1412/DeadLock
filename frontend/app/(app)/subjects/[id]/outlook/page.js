"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Compass, FlaskConical, Gauge, Scale } from "lucide-react";
import { api } from "@/lib/api";
import { WhatIf } from "@/lib/schemas";
import { getOutlook, keys } from "@/lib/queries";
import { cn, friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { Stat } from "@/components/nexus/charts";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Alert, Badge, Button, Card, Checkbox, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from "@/components/ui/primitives";

const LEVEL = {
  high: { label: "High risk", tone: "danger", bar: "bg-danger" },
  medium: { label: "Medium risk", tone: "warning", bar: "bg-warning" },
  low: { label: "Low risk", tone: "success", bar: "bg-success" },
  unknown: { label: "Not enough answers", tone: "neutral", bar: "bg-muted" },
};
const pc = (x) => (x === null || x === undefined ? "–" : `${Math.round(x * 100)}%`);
const hrs = (m) => `${Math.round((m / 60) * 10) / 10} h`;

function Risk({ data }) {
  const s = data.risk.summary;
  const lv = LEVEL[s.level];
  return (
    <section aria-labelledby="risk-h">
      <h2 id="risk-h" className="mb-1 flex items-center gap-2 text-lg font-bold"><Gauge className="h-5 w-5" aria-hidden="true" /> Risk of missing your target</h2>
      <p className="mb-3 text-sm text-muted">{data.risk.method}</p>
      {s.late && <Alert tone="warning" className="mb-3">Your plan does not fit before your target date at {s.hours_per_week} hours a week{s.hours_needed ? `. About ${s.hours_needed} hours a week would fit.` : "."}</Alert>}
      <ul className="space-y-3">
        {data.risk.topics.map((t) => {
          const l = LEVEL[t.level] ?? LEVEL.unknown;
          return (
            <li key={t.topic_id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-anywhere font-semibold">{t.name}</p>
                  <Badge tone={l.tone} className="ml-auto">{l.label}{t.score !== null ? ` · ${t.score}` : ""}</Badge>
                </div>
                <div className="mt-2 h-2 rounded-full bg-accent" role="img" aria-label={t.score === null ? "Risk not judged" : `Risk ${t.score} out of 100`}>
                  {t.score !== null && <div className={cn("h-full rounded-full", l.bar)} style={{ width: `${t.score}%` }} />}
                </div>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">{t.reasons.map((r, i) => <li key={i} className="break-anywhere">{r}</li>)}</ul>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Debt({ id, data }) {
  const d = data.debt;
  if (d.topics.length === 0) {
    return (
      <section aria-labelledby="debt-h">
        <h2 id="debt-h" className="mb-1 flex items-center gap-2 text-lg font-bold"><Scale className="h-5 w-5" aria-hidden="true" /> Learning debt</h2>
        <Alert tone="success">No topic is below your target right now, so you owe no study time.</Alert>
      </section>
    );
  }
  const maxMin = Math.max(...d.topics.map((t) => t.own_minutes + t.interest_minutes), 1);
  return (
    <section aria-labelledby="debt-h">
      <h2 id="debt-h" className="mb-1 flex items-center gap-2 text-lg font-bold"><Scale className="h-5 w-5" aria-hidden="true" /> Learning debt: about {d.total_hours} hours owed</h2>
      <p className="mb-3 text-sm text-muted">{d.method}</p>
      <ul className="space-y-3">
        {d.topics.map((t) => (
          <li key={t.topic_id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-anywhere font-semibold">{t.name}</p>
                {t.repay_first && <Badge tone="danger">Repay first</Badge>}
                <span className="ml-auto text-sm text-muted">{hrs(t.own_minutes)} owed{t.interest_minutes ? ` + ${hrs(t.interest_minutes)} interest` : ""}</span>
              </div>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-accent" role="img" aria-label={`${hrs(t.own_minutes)} owed, ${hrs(t.interest_minutes)} interest`}>
                <div className="h-full bg-primary" style={{ width: `${(t.own_minutes / maxMin) * 100}%` }} />
                <div className="h-full bg-warning" style={{ width: `${(t.interest_minutes / maxMin) * 100}%` }} />
              </div>
              {t.blocks.length > 0 && (
                <p className="break-anywhere mt-2 flex flex-wrap items-center gap-1 text-sm">
                  <b>{t.name}</b> <ArrowRight className="h-4 w-4" aria-hidden="true" /> holds up {t.blocks.join(", ")}
                </p>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary align-middle" /> own time <span className="mx-1 inline-block h-2 w-2 rounded-full bg-warning align-middle" /> interest from topics that build on it. <Link href={`/subjects/${id}/roadmap`}>See the weekly plan</Link>.</p>
    </section>
  );
}

function Compare({ label, sim, tone }) {
  return (
    <Card className={cn("p-4", tone)}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs text-muted">{sim.hours_per_week} h a week for {sim.weeks} {sim.weeks === 1 ? "week" : "weeks"} = {hrs(sim.budget_minutes)}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div><dt className="text-xs text-muted">Match to target</dt><dd className="text-xl font-bold">{pc(sim.readiness_after)}</dd></div>
        <div><dt className="text-xs text-muted">Topics fully planned</dt><dd className="text-xl font-bold">{sim.covered}/{sim.lagging}</dd></div>
        <div><dt className="text-xs text-muted">Weeks to finish all</dt><dd className="text-xl font-bold">{sim.weeks_to_finish}</dd></div>
      </dl>
    </Card>
  );
}

function Simulator({ id, data }) {
  const [hours, setHours] = useState(String(data.profile.hours_per_week));
  const [weeks, setWeeks] = useState(String(Math.min(data.profile.weeks, 26)));
  const [focus, setFocus] = useState([]);
  const [problem, setProblem] = useState("");
  const run = useMutation({
    mutationFn: async () => WhatIf.parse(await api(`/subjects/${id}/whatif`, { method: "POST", json: { hours_per_week: Number(hours), weeks: Number(weeks), focus } })),
    onError: (e) => { setProblem(friendlyError(e)); toast.error(friendlyError(e)); },
    onSuccess: () => setProblem(""),
  });
  const lagging = data.topics.filter((t) => t.status === "critical" || t.status === "moderate" || t.status === "minor");
  const toggle = (tid, on) => setFocus((f) => (on ? [...f, tid].slice(0, 10) : f.filter((x) => x !== tid)));
  const r = run.data;
  return (
    <section aria-labelledby="sim-h">
      <h2 id="sim-h" className="mb-1 flex items-center gap-2 text-lg font-bold"><FlaskConical className="h-5 w-5" aria-hidden="true" /> What if…?</h2>
      <p className="mb-3 text-sm text-muted">Try a different plan and see the difference before you commit. Nothing here is saved.</p>
      <Card>
        <form className="grid gap-3 sm:grid-cols-[9rem_9rem_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); run.mutate(); }}>
          <div>
            <Label htmlFor="wi-hours">Hours per week</Label>
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger id="wi-hours"><SelectValue /></SelectTrigger>
              <SelectContent>{[...new Set([1, 2, 3, 5, 8, 12, 20, 30, Number(data.profile.hours_per_week)])].sort((a, b) => a - b).map((h) => <SelectItem key={h} value={String(h)}>{h} {h === 1 ? "hour" : "hours"}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="wi-weeks">For how many weeks</Label>
            <Select value={weeks} onValueChange={setWeeks}>
              <SelectTrigger id="wi-weeks"><SelectValue /></SelectTrigger>
              <SelectContent>{[...new Set([1, 2, 3, 4, 6, 8, 12, 16, 26, Math.min(data.profile.weeks, 26)])].sort((a, b) => a - b).map((w) => <SelectItem key={w} value={String(w)}>{w} {w === 1 ? "week" : "weeks"}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={run.isPending}>{run.isPending ? "Working it out…" : "Compare"}</Button>
        </form>
        {lagging.length > 0 && (
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">Study these first (optional, up to 10)</legend>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {lagging.map((t) => (
                <li key={t.topic_id} className="flex min-h-11 items-center gap-2">
                  <Checkbox id={`wi-f-${t.topic_id}`} checked={focus.includes(t.topic_id)} onCheckedChange={(c) => toggle(t.topic_id, !!c)} />
                  <Label htmlFor={`wi-f-${t.topic_id}`} className="break-anywhere font-normal">{t.name}</Label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        {problem && <Alert tone="danger" className="mt-3">{problem}</Alert>}
      </Card>

      {r && (
        <div className="mt-4 space-y-4" aria-live="polite">
          <div className="grid gap-3 sm:grid-cols-2">
            <Compare label="Your current plan" sim={r.baseline} />
            <Compare label="This what-if" sim={r.scenario} tone="border-primary" />
          </div>
          <Card>
            <h3 className="text-base font-bold">Why it changes</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{r.why.map((w, i) => <li key={i} className="break-anywhere">{w}</li>)}</ul>
            <p className="mt-3 text-xs text-muted">{r.assumption}</p>
          </Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">Confidence per topic now, with the current plan and with this what-if</caption>
              <thead><tr>{["Topic", "Now", "Current plan", "This what-if"].map((h, i) => <th key={h} scope="col" className={cn("border-b border-border px-2 py-1 font-semibold", i > 0 && "text-center")}>{h}</th>)}</tr></thead>
              <tbody>
                {r.scenario.topics.map((t) => {
                  const b = r.baseline.topics.find((x) => x.topic_id === t.topic_id);
                  return (
                    <tr key={t.topic_id}>
                      <th scope="row" className="break-anywhere border-b border-border px-2 py-1 font-normal">{t.name}{t.focus ? " ★" : ""}</th>
                      <td className="border-b border-border px-2 py-1 text-center">{pc(t.now)}</td>
                      <td className="border-b border-border px-2 py-1 text-center">{pc(b?.after)}</td>
                      <td className={cn("border-b border-border px-2 py-1 text-center font-semibold", t.after !== null && b?.after !== null && t.after > b.after && "text-success")}>{pc(t.after)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">★ studied first. A dash means the topic has no answers yet, so nothing is estimated for it.</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default function OutlookPage() {
  const { id } = useParams();
  useTitle("Outlook");
  const { data, error, isPending, refetch } = useQuery({ queryKey: keys.outlook(id), queryFn: () => getOutlook(id) });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-64" />;
  if (data.topics.length === 0) {
    return <EmptyState title="Nothing to look ahead at yet" action={<Button asChild><Link href={`/subjects/${id}/materials`}>Add materials</Link></Button>}>The outlook is built from the topics Nexus finds in your material and the answers you give.</EmptyState>;
  }
  const s = data.risk.summary;
  const lv = LEVEL[s.level];
  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Compass className="h-5 w-5" aria-hidden="true" /> Outlook for {data.subject}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Overall risk" value={s.score === null ? "–" : `${s.score}/100`} hint={lv.label} />
        <Stat label="Learning debt" value={`${data.debt.total_hours} h`} hint="study time owed" />
        <Stat label="Topics at high risk" value={s.high} hint={`${s.medium} medium`} />
        <Stat label="Match to target" value={pc(data.readiness)} hint={`target ${pc(data.target)} per topic`} />
      </div>
      {s.unassessed > 0 && <Alert tone="info">{s.unassessed} topic{s.unassessed === 1 ? " has" : "s have"} no answers yet, so the risk cannot be judged. <Link href={`/subjects/${id}/quiz`}>Take a quick quiz</Link>.</Alert>}
      <Risk data={data} />
      <Debt id={id} data={data} />
      <Simulator id={id} data={data} />
    </div>
  );
}
