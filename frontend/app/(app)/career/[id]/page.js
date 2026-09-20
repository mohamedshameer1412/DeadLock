"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lightbulb, Printer, Target, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { getCareer, keys } from "@/lib/queries";
import { cn, friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { Stat } from "@/components/nexus/charts";
import { ErrorState } from "@/components/nexus/shell";
import { Alert, Badge, Button, Card, Skeleton } from "@/components/ui/primitives";

const STATUS = {
  verified: { label: "Verified", tone: "success", bar: "bg-success", note: "Enough right answers on a matching topic." },
  developing: { label: "Developing", tone: "warning", bar: "bg-warning", note: "You have answers on it, but it is not solid yet." },
  not_tested: { label: "Not tested yet", tone: "neutral", bar: "bg-muted", note: "Your materials cover it, but you have not answered questions on it." },
  no_evidence: { label: "No evidence", tone: "danger", bar: "bg-danger", note: "Nothing in your materials and no answers yet." },
};
const pc = (x) => (x === null || x === undefined ? "–" : `${Math.round(x * 100)}%`);

export default function CareerDetail() {
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: keys.career(id), queryFn: () => getCareer(id),
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 3000 : false),
  });
  useTitle(data?.title ?? "Career goal");
  const remove = useMutation({
    mutationFn: () => api(`/career/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.careers }); router.push("/career"); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-64" />;

  const sc = data.score;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Target className="h-6 w-6" aria-hidden="true" /> <span className="break-anywhere">{data.title}</span></h1>
        <div className="no-print flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" /> Print or save as PDF</Button>
          <Button variant="ghost" size="sm" onClick={() => { if (window.confirm("Delete this career goal?")) remove.mutate(); }} disabled={remove.isPending}><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete</Button>
        </div>
      </div>
      <Link href="/career" className="no-print text-sm">← All career goals</Link>

      {data.status === "pending" && <Alert tone="info"><span role="status" className="flex items-center gap-2"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span> Reading the job description…</span></Alert>}
      {data.status === "failed" && <Alert tone="danger">No skills could be read from this text. Paste the requirements section, with one skill per line or a comma-separated list, and try again.</Alert>}

      {data.status === "done" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Readiness" value={pc(sc.readiness)} hint="weighted: required skills count double" />
            <Stat label="Verified skills" value={`${sc.verified}/${sc.total}`} hint="proven by your answers" />
            <Stat label="Developing" value={sc.counts.developing ?? 0} hint="answers, not solid yet" />
            <Stat label="No evidence yet" value={(sc.counts.no_evidence ?? 0) + (sc.counts.not_tested ?? 0)} hint="not tested or not covered" />
          </div>

          <section aria-labelledby="sk-h">
            <h2 id="sk-h" className="mb-1 text-lg font-bold">Skills the job asks for</h2>
            <p className="mb-3 text-sm text-muted">
              {data.from_model ? `Read by ${data.model}` : "Read by plain rules"} from your text; every skill quotes the description. Each is checked against the topics and answers in all your subjects. A skill with no evidence is shown as such, never as weak.
            </p>
            <ul className="space-y-3">
              {data.skills.map((s) => {
                const st = STATUS[s.status];
                return (
                  <li key={s.skill} className="print-break">
                    <Card className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-anywhere font-semibold">{s.skill}</p>
                        <Badge tone={s.importance === "required" ? "neutral" : "warning"}>{s.importance === "required" ? "Required" : "Preferred"}</Badge>
                        <Badge tone={st.tone} className="ml-auto">{st.label}</Badge>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-accent" role="img" aria-label={s.confidence === null ? "No confidence yet" : `Confidence ${pc(s.confidence)}`}>
                        {s.confidence !== null && <div className={cn("h-full rounded-full", st.bar)} style={{ width: `${Math.round(s.confidence * 100)}%` }} />}
                      </div>
                      <p className="mt-2 text-sm text-muted">
                        {st.note}
                        {s.topic && <> Matched to <Link href={`/subjects/${s.subject_id}/progress`}><b>{s.topic}</b></Link> in {s.subject}{s.answered ? ` (${s.correct} of ${s.answered} correct, confidence ${pc(s.confidence)})` : ""}.</>}
                        {!s.topic && s.subject && <> Mentioned in <Link href={`/subjects/${s.subject_id}/materials`}><b>{s.subject}</b></Link>.</>}
                      </p>
                      <p className="break-anywhere mt-1 text-xs text-muted">From the description: “{s.quote}”</p>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>

          {data.next_steps.length > 0 && (
            <section aria-labelledby="ns-h">
              <h2 id="ns-h" className="mb-1 flex items-center gap-2 text-lg font-bold"><Lightbulb className="h-5 w-5" aria-hidden="true" /> What to do next</h2>
              <p className="mb-3 text-sm text-muted">The biggest gaps first, required skills before preferred ones. The project ideas are suggestions, not matches with real opportunities.</p>
              <ol className="space-y-3">
                {data.next_steps.map((n) => (
                  <li key={n.skill}>
                    <Card className="p-4">
                      <p className="break-anywhere font-semibold"><Link href={n.href}>{n.title}</Link></p>
                      <p className="break-anywhere mt-1 text-sm text-muted">Suggestion: {n.suggestion}</p>
                    </Card>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="hist-h">
            <h2 id="hist-h" className="mb-1 text-lg font-bold">Your record over time</h2>
            {data.history.length < 2 ? (
              <p className="text-sm text-muted">This page keeps a record each time your readiness changes. Come back after more quizzes to see it move.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.history.map((h, i) => <li key={i}>{h.at ? new Date(h.at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""}: readiness <b>{pc(h.readiness)}</b>, {h.verified} of {h.total} skills verified</li>)}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
