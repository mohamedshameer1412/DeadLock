"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Fingerprint, GraduationCap, History, ListChecks, Repeat, TrendingDown, TrendingUp, WandSparkles } from "lucide-react";
import { api } from "@/lib/api";
import { getExamples, getTwin, keys } from "@/lib/queries";
import { cn, friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { Stat } from "@/components/nexus/charts";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Alert, Badge, Button, Card, Skeleton } from "@/components/ui/primitives";

const pc = (x) => (x === null || x === undefined ? "–" : `${Math.round(x * 100)}%`);
const KIND = { worked_example: "Worked example", flashcards: "Flashcards", revision: "Revision quiz", practice: "Practice", ask: "Ask the tutor" };
const STATUS = {
  critical: { label: "Far below target", tone: "danger", bar: "bg-danger" },
  moderate: { label: "Below target", tone: "warning", bar: "bg-warning" },
  minor: { label: "Close to target", tone: "neutral", bar: "bg-primary" },
  on_track: { label: "On track", tone: "success", bar: "bg-success" },
  unassessed: { label: "Not assessed yet", tone: "neutral", bar: "bg-muted" },
};
const FEELING = { overconfident: ["Surer than your answers", "warning"], underconfident: ["Better than you think", "success"], aligned: ["Feeling matches results", "success"] };
const OUTCOME = { improved: ["Improved", "success"], no_change: ["No change", "warning"], worse: ["Got worse", "danger"] };
const DIFF = { easy: "Start with easier questions", medium: "Mixed questions fit you", hard: "Try harder questions" };

/** A worked example for one topic, written from that topic's own passages. */
function WorkedExample({ id, topic, name, openNow }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: keys.examples(id, topic), queryFn: () => getExamples(id, topic),
    refetchInterval: (s) => (s.state.data?.[0]?.status === "pending" ? 3000 : false),
  });
  const make = useMutation({
    mutationFn: () => api(`/subjects/${id}/examples`, { method: "POST", json: { topic_id: topic } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.examples(id, topic) }); qc.invalidateQueries({ queryKey: keys.twin(id) }); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const latest = q.data?.[0];
  const pending = latest?.status === "pending" || make.isPending;
  return (
    <details className="mt-3 rounded-md border border-border p-3" open={openNow || undefined}>
      <summary className="cursor-pointer text-sm font-semibold"><WandSparkles className="mr-1 inline h-4 w-4" aria-hidden="true" /> Worked example for {name}</summary>
      <div className="mt-3 space-y-3" aria-live="polite">
        {pending && <p role="status" className="flex items-center gap-2 text-sm text-muted"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span> Writing an example from your material…</p>}
        {!pending && latest?.status === "failed" && <Alert tone="danger">The example could not be written. Try again.</Alert>}
        {!pending && latest?.status === "done" && latest.example && (
          <div>
            <p className="break-anywhere font-semibold">{latest.example.problem}</p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
              {latest.example.steps.map((s, i) => (
                <li key={i} className="break-anywhere">{s.text}<br /><span className="text-xs text-muted">From your material: “{s.quote}”</span></li>
              ))}
            </ol>
            {latest.example.answer && <p className="break-anywhere mt-2 text-sm"><b>Result:</b> {latest.example.answer}</p>}
            {latest.example.check && <p className="break-anywhere mt-2 text-sm"><b>Now you try:</b> {latest.example.check}</p>}
            <p className="mt-2 text-xs text-muted">{latest.example.from_model ? `Written by ${latest.model} from this topic's passages only; every step quotes them.` : "No model answered, so these are the topic's own key passages to work through."}</p>
          </div>
        )}
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => make.mutate()}>{latest ? "Write another example" : "Write a worked example"}</Button>
      </div>
    </details>
  );
}

function Planner({ id, data }) {
  if (data.next.length === 0) return <Alert tone="success">Nothing is below your target right now. Keep it that way with a short quiz each week.</Alert>;
  return (
    <ol className="space-y-3">
      {data.next.map((n, i) => (
        <li key={n.topic_id}>
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-white" aria-hidden="true">{i + 1}</span>
              <p className="break-anywhere font-semibold">{n.title}</p>
              <Badge className="ml-auto">{n.minutes} min</Badge>
              {!n.fits_this_week && <Badge tone="warning">Not this week</Badge>}
            </div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">{n.why.map((w, k) => <li key={k} className="break-anywhere">{w}</li>)}</ul>
            <p className="mt-2 text-xs text-muted">Level: {DIFF[n.difficulty]}. {n.difficulty_why}</p>
            <div className="mt-3">
              {n.kind === "worked_example" ? <Button size="sm" asChild><a href={`#topic-${n.topic_id}`}>Open the worked example <ArrowRight className="h-4 w-4" aria-hidden="true" /></a></Button>
                : <Button size="sm" asChild><Link href={n.href}>Go <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>}
            </div>
          </Card>
        </li>
      ))}
    </ol>
  );
}

function TopicCard({ id, t, openExample }) {
  const st = STATUS[t.status];
  const f = FEELING[t.feeling];
  const loop = t.loop;
  return (
    <li id={`topic-${t.topic_id}`} className="scroll-mt-20">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-anywhere font-semibold">{t.subtopic ? `${t.unit} › ${t.subtopic}` : t.name}</p>
          {t.trend === "improving" && <span className="inline-flex items-center gap-1 text-xs text-success"><TrendingUp className="h-4 w-4" aria-hidden="true" /> improving</span>}
          {t.trend === "slipping" && <span className="inline-flex items-center gap-1 text-xs text-danger"><TrendingDown className="h-4 w-4" aria-hidden="true" /> slipping</span>}
          <Badge tone={st.tone} className="ml-auto">{st.label}</Badge>
        </div>
        <div className="mt-2 h-2 rounded-full bg-accent" role="img" aria-label={t.confidence === null ? "Not assessed" : `Confidence ${pc(t.confidence)}`}>
          {t.confidence !== null && <div className={cn("h-full rounded-full", st.bar)} style={{ width: `${Math.round(t.confidence * 100)}%` }} />}
        </div>
        <p className="mt-2 text-sm text-muted">
          {t.confidence === null ? "No answers yet." : <>Confidence <b>{pc(t.confidence)}</b> · ability {t.theta > 0 ? "+" : ""}{t.theta} (± {t.se}) · {t.answered} answer{t.answered === 1 ? "" : "s"}</>}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {f && <Badge tone={f[1]}>{f[0]}</Badge>}
          {t.exam_count > 0 && <Badge tone="warning">Asked {t.exam_count}× in past papers</Badge>}
          {t.blocked_by.length > 0 && <Badge tone="warning">Builds on {t.blocked_by.join(", ")}</Badge>}
          {t.answered >= 3 && <Badge>{DIFF[t.difficulty]}</Badge>}
        </div>
        {t.drift_note && <p className="mt-2 text-xs text-muted">{t.drift_note}</p>}
        {loop.tries > 0 && (
          <p className="mt-2 text-xs">
            <Repeat className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            {loop.state === "improved"
              ? <>Last action (<b>{KIND[loop.last_kind]}</b>) was followed by an improvement of {Math.round(loop.change * 100)} points.</>
              : <>Last action (<b>{KIND[loop.last_kind]}</b>) did not raise this topic ({OUTCOME[loop.last_outcome]?.[0].toLowerCase()}), so the planner is changing the approach.</>}
          </p>
        )}
        {(t.gap || t.status === "unassessed") && <WorkedExample id={id} topic={t.topic_id} name={t.name} openNow={openExample === t.topic_id} />}
      </Card>
    </li>
  );
}

function Inner() {
  const { id } = useParams();
  const params = useSearchParams();
  useTitle("My twin");
  const { data, error, isPending, refetch } = useQuery({ queryKey: keys.twin(id), queryFn: () => getTwin(id) });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-64" />;
  if (data.topics.length === 0) {
    return <EmptyState title="Your twin starts with your materials" action={<Button asChild><Link href={`/subjects/${id}/materials`}>Add materials</Link></Button>}>Upload a syllabus or notes, then answer a few questions, and this page becomes a picture of what you know.</EmptyState>;
  }
  const p = data.profile;
  const open = Number(params.get("topic")) || null;
  const units = [...new Set(data.topics.map((t) => t.unit))];
  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Fingerprint className="h-5 w-5" aria-hidden="true" /> Learner twin for {data.subject}</h2>
      <Card>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted">Level</dt><dd className="font-semibold">{p.level ? { new: "New learner", intermediate: "Intermediate", professional: "Professional" }[p.level] : "Not chosen"}</dd></div>
          <div><dt className="text-xs text-muted">Studying</dt><dd className="font-semibold">{p.department || "–"}{p.semester ? `, semester ${p.semester}` : ""}</dd></div>
          <div><dt className="text-xs text-muted">Time</dt><dd className="font-semibold">{p.hours_per_week} h a week</dd></div>
          <div><dt className="text-xs text-muted">Exam / deadline</dt><dd className="font-semibold">{p.exam_date ?? p.target_date ?? "–"}</dd></div>
          {p.goal && <div className="col-span-2 sm:col-span-4"><dt className="text-xs text-muted">Goal</dt><dd className="break-anywhere font-semibold">{p.goal}</dd></div>}
        </dl>
        <p className="mt-3 text-xs text-muted">Set your department in <Link href="/account">Account</Link> and your exam date and hours on the <Link href={`/subjects/${id}/roadmap`}>Roadmap</Link>.</p>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Match to target" value={pc(data.readiness)} hint={`target ${pc(data.target)} per topic`} />
        <Stat label="Overall ability" value={data.overall ? `${data.overall.theta > 0 ? "+" : ""}${data.overall.theta}` : "–"} hint={data.overall ? `± ${data.overall.se}, ${data.overall.answered} answers` : "no answers yet"} />
        <Stat label="Strong topics" value={data.strengths.length} hint={data.strengths.slice(0, 2).join(", ") || "none yet"} />
        <Stat label="Needs work" value={data.weaknesses.length} hint={data.weaknesses.slice(0, 2).join(", ") || "none"} />
      </div>

      <section aria-labelledby="plan-h">
        <h2 id="plan-h" className="mb-1 flex items-center gap-2 text-lg font-bold"><ListChecks className="h-5 w-5" aria-hidden="true" /> Your next best actions</h2>
        <p className="mb-3 text-sm text-muted">The planner ranks topics by how far below target they are, how often past papers ask about them, whether they are slipping, and your deadline. If a topic builds on a weak one, it aims at the cause. If an action did not help last time, it tries a different one.</p>
        <Planner id={id} data={data} />
      </section>

      {data.units.length > 1 && (
        <section aria-labelledby="units-h">
          <h2 id="units-h" className="mb-3 text-lg font-bold">Mastery by unit</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.units.map((u) => (
              <li key={u.unit}>
                <Card className="p-4">
                  <p className="break-anywhere font-semibold">{u.unit}</p>
                  <div className="mt-2 h-2 rounded-full bg-accent" role="img" aria-label={u.confidence === null ? "Not assessed" : `Unit confidence ${pc(u.confidence)}`}>
                    {u.confidence !== null && <div className={cn("h-full rounded-full", u.status === "on_track" ? "bg-success" : "bg-warning")} style={{ width: `${Math.round(u.confidence * 100)}%` }} />}
                  </div>
                  <p className="mt-2 text-xs text-muted">{u.confidence === null ? "No answers yet" : `${pc(u.confidence)} average`} · {u.assessed} of {u.topics} topics assessed</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="topics-h">
        <h2 id="topics-h" className="mb-3 text-lg font-bold">Topic by topic</h2>
        {units.map((u) => (
          <div key={u} className="mb-4">
            {units.length > 1 && <h3 className="mb-2 text-base font-semibold">{u}</h3>}
            <ul className="space-y-3">{data.topics.filter((t) => t.unit === u).map((t) => <TopicCard key={t.topic_id} id={id} t={t} openExample={open} />)}</ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="pat-h">
        <h2 id="pat-h" className="mb-1 text-lg font-bold">How you go wrong</h2>
        <p className="mb-3 text-sm text-muted">{data.patterns.method}</p>
        {data.patterns.patterns.length === 0 ? <p className="text-sm text-muted">No repeated pattern yet ({data.patterns.answers} answers so far).</p> : (
          <ul className="space-y-3">
            {data.patterns.patterns.map((p, i) => (
              <li key={i}><Card className="p-4"><p className="font-semibold">{p.title}{p.topic ? ` · ${p.topic}` : ""}</p><p className="break-anywhere mt-1 text-sm text-muted">{p.detail}</p></Card></li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="mem-h">
        <h2 id="mem-h" className="mb-1 flex items-center gap-2 text-lg font-bold"><History className="h-5 w-5" aria-hidden="true" /> What has worked for you</h2>
        {data.memory.length === 0 ? (
          <p className="text-sm text-muted">Nexus notes each study action on a weak topic, then checks after 3 or more new answers whether the topic improved. Nothing has been checked yet.</p>
        ) : (
          <ul className="mb-4 space-y-2 text-sm">
            {data.memory.map((m) => <li key={m.kind}><b>{m.label}</b>: followed by an improvement {m.improved} of {m.tried} time{m.tried === 1 ? "" : "s"}, on average {m.mean_change > 0 ? "+" : ""}{Math.round(m.mean_change * 100)} points.</li>)}
          </ul>
        )}
        {data.history.length > 0 && (
          <ul className="space-y-1 text-sm">
            {data.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2">
                <span className="break-anywhere">{KIND[h.kind]} · {h.topic}</span>
                {h.outcome ? <Badge tone={OUTCOME[h.outcome][1]}>{OUTCOME[h.outcome][0]}</Badge> : <Badge>{h.status === "pending" ? "Writing…" : "Waiting for 3 new answers"}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="no-print flex flex-wrap gap-2">
        <Button asChild variant="secondary"><Link href={`/subjects/${id}/quiz`}><GraduationCap className="h-4 w-4" aria-hidden="true" /> Take a quiz</Link></Button>
        <Button asChild variant="secondary"><Link href={`/subjects/${id}/outlook`}>Outlook and what-if</Link></Button>
      </div>
    </div>
  );
}

export default function TwinPage() {
  return <Suspense fallback={<Skeleton className="h-64" />}><Inner /></Suspense>;
}
