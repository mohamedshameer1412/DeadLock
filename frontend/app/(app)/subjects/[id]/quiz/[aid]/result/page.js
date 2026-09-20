"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { getResult, keys } from "@/lib/queries";
import { plural } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { ErrorState } from "@/components/nexus/shell";
import { Alert, Badge, Button, Card, Skeleton } from "@/components/ui/primitives";

const LEVEL = { new: "New learner", intermediate: "Intermediate", professional: "Professional" };
const pc = (x) => Math.round(x * 100);

/** What a diagnostic test concludes: accuracy at each difficulty, the level it suggests, and the strong and weak topics. */
function DiagnosisCard({ d, subjectId }) {
  const qc = useQueryClient();
  const accept = useMutation({
    mutationFn: () => api(`/subjects/${subjectId}/level`, { method: "PUT", json: { level: d.suggested } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.subject(subjectId) }); toast.success(`Your level is now ${LEVEL[d.suggested]}`); },
  });
  return (
    <section aria-labelledby="diag-h" className="rounded-lg border-2 border-primary bg-surface p-4">
      <h2 id="diag-h" className="text-lg font-bold">Your diagnostic conclusion</h2>
      {d.suggested ? (
        <p className="mt-2 flex flex-wrap items-center gap-2">Suggested level: <Badge tone="success">{LEVEL[d.suggested]}</Badge> <span className="text-sm text-muted">overall confidence <b>{pc(d.confidence)}%</b></span></p>
      ) : <p className="mt-2 text-sm text-muted">Too few answers to suggest a level.</p>}
      {d.note && <p className="mt-1 text-sm">{d.note}</p>}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {["easy", "medium", "hard"].map((k) => (
          <div key={k} className="rounded-md bg-surface-2 p-2"><p className="text-xs capitalize text-muted">{k} questions</p><p className="text-lg font-bold">{d.by_difficulty[k].correct} of {d.by_difficulty[k].answered}</p></div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><h3 className="font-semibold text-success">Looks strong</h3>{d.strongest.length === 0 ? <p className="text-sm text-muted">No topic stands out yet.</p> : <ul className="mt-1 space-y-1 text-sm">{d.strongest.map((t) => <li key={t.topic_id} className="break-anywhere">{t.name} <span className="text-muted">({pc(t.confidence)}%, {t.correct} of {t.answered})</span></li>)}</ul>}</div>
        <div><h3 className="font-semibold text-danger">Start here</h3>{d.weakest.length === 0 ? <p className="text-sm text-muted">Nothing to flag.</p> : <ul className="mt-1 space-y-1 text-sm">{d.weakest.map((t) => <li key={t.topic_id} className="break-anywhere">{t.name} <span className="text-muted">({pc(t.confidence)}%, {t.correct} of {t.answered})</span></li>)}</ul>}</div>
      </div>
      <p className="mt-3 text-xs text-muted">Ten questions are a starting point, not a verdict. Every quiz you take sharpens these numbers.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {d.suggested && d.suggested !== d.claimed && <Button size="sm" onClick={() => accept.mutate()} disabled={accept.isPending}>Use {LEVEL[d.suggested]} as my level</Button>}
        <Button asChild size="sm" variant="secondary"><Link href={`/subjects/${subjectId}/progress`}>See confidence by topic</Link></Button>
      </div>
    </section>
  );
}

const EVENT_LABELS = { tab_switch: "Tab switches", full_screen_exit: "Left full screen", copy_attempt: "Copy attempts blocked", paste_attempt: "Paste attempts blocked" };

export default function ResultPage() {
  const { id, aid } = useParams();
  useTitle("Quiz result");
  const { data, error, isPending, refetch } = useQuery({ queryKey: keys.result(id, aid), queryFn: () => getResult(id, aid) });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-48" />;
  const { attempt: a } = data;
  const total = a.correct + a.incorrect;
  const pct = total ? Math.round((100 * a.correct) / total) : 0;
  const events = Object.entries(data.focus_events).filter(([, n]) => n > 0);
  return (
    <div className="space-y-8">
      {data.diagnosis && <DiagnosisCard d={data.diagnosis} subjectId={id} />}
      {data.ended_reason && <Alert tone="warning"><b>This assessment was ended early:</b> {data.ended_reason}. Questions you had not answered yet are not counted.</Alert>}

      <section aria-labelledby="score-h">
        <h2 id="score-h" className="text-lg font-bold">Your result</h2>
        <Card className="mt-2">
          <p className="text-3xl font-bold">{a.correct} of {total} correct <span className="text-lg font-semibold text-muted">({pct}%)</span></p>
          {data.skipped > 0 && <p className="mt-1 text-sm text-muted">{plural(data.skipped, "question")} skipped.</p>}
          <p className="mt-2 text-sm text-muted">This is a count of your answers in this quiz, not a measure of everything you know.</p>
        </Card>
      </section>

      {events.length > 0 && (
        <section aria-labelledby="focus-h">
          <h2 id="focus-h" className="text-lg font-bold">Focus events</h2>
          <p className="mt-1 text-sm text-muted">Counted during your assessment. They say only what the browser reported, not why.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {events.map(([k, n]) => <li key={k} className="rounded-full border border-border bg-surface px-3 py-1 text-sm">{EVENT_LABELS[k]}: <b>{n}</b></li>)}
          </ul>
        </section>
      )}

      {data.weak_topics.length > 0 && (
        <section aria-labelledby="weak-h">
          <h2 id="weak-h" className="text-lg font-bold">Worth another look</h2>
          <ul className="mt-2 space-y-2">
            {data.weak_topics.map((w) => <li key={w.topic_id}><Card className="p-3 text-sm"><b className="break-anywhere">{w.name}</b> · {w.correct} of {w.answered} answered correctly so far</Card></li>)}
          </ul>
        </section>
      )}

      <section aria-labelledby="break-h">
        <h2 id="break-h" className="text-lg font-bold">Question by question</h2>
        <ol className="mt-2 space-y-3">
          {data.answers.map((x, i) => (
            <li key={i}>
              <Card className="p-4">
                <p className="break-anywhere font-semibold"><span className="text-muted">{i + 1}. </span>{x.question}</p>
                {x.topic && <p className="break-anywhere mt-1 text-xs text-muted">{x.topic}{x.backtrack && " · asked as a step back to the basics"}</p>}
                <p className={`mt-2 flex items-start gap-2 text-sm font-semibold ${x.correct ? "text-success" : "text-danger"}`}>
                  {x.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                  <span className="break-anywhere">{x.correct ? "Correct" : "Not correct"}. You chose {String.fromCharCode(65 + x.chosen_index)}: {x.options[x.chosen_index]}</span>
                </p>
                {!x.correct && <p className="break-anywhere mt-1 text-sm">Right answer: <b>{String.fromCharCode(65 + x.answer_index)}: {x.options[x.answer_index]}</b></p>}
                {x.explanation && <p className="break-anywhere mt-2 text-sm text-muted">{x.explanation}</p>}
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <p className="flex flex-wrap gap-4 text-sm">
        <Link href={`/subjects/${id}/quiz`}>Take another quiz</Link>
        <Link href={`/subjects/${id}/progress`}>See progress</Link>
        <Link href={`/subjects/${id}/practice`}>Back to practice</Link>
      </p>
    </div>
  );
}
