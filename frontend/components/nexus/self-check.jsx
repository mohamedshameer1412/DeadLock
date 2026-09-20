"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Brain } from "lucide-react";
import { api } from "@/lib/api";
import { getSelfCheck, keys } from "@/lib/queries";
import { SelfCheck as SelfCheckSchema } from "@/lib/schemas";
import { cn, friendlyError } from "@/lib/utils";
import { Alert, Badge, Button, Card, Skeleton } from "@/components/ui/primitives";

const VERDICT = {
  overconfident: { label: "Surer than your answers", tone: "warning" },
  underconfident: { label: "Better than you think", tone: "success" },
  aligned: { label: "Feeling matches results", tone: "success" },
  not_enough_answers: { label: "Needs 3+ answers", tone: "neutral" },
  not_rated: { label: "Not rated", tone: "neutral" },
};
const pc = (x) => `${Math.round(x * 100)}%`;

/** Rate how sure you feel about each topic (1 to 5) and see it beside what your answers show. */
export function SelfCheck({ id }) {
  const qc = useQueryClient();
  const { data, error, isPending } = useQuery({ queryKey: keys.selfCheck(id), queryFn: () => getSelfCheck(id) });
  const [draft, setDraft] = useState({});
  useEffect(() => { setDraft({}); }, [data]);
  const save = useMutation({
    mutationFn: async () => SelfCheckSchema.parse(await api(`/subjects/${id}/self-check`, { method: "PUT", json: { ratings: draft } })),
    onSuccess: (r) => { qc.setQueryData(keys.selfCheck(id), r); toast.success("Saved"); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  if (isPending) return <Skeleton className="h-32" />;
  if (error || data.topics.length === 0) return null;
  const labels = data.labels;
  const changed = Object.keys(draft).length > 0;
  return (
    <section aria-labelledby="self-h">
      <h2 id="self-h" className="mb-1 flex items-center gap-2 text-lg font-bold"><Brain className="h-5 w-5" aria-hidden="true" /> How sure do you feel?</h2>
      <p className="mb-3 text-sm text-muted">Rate each topic from 1 (lost) to 5 (very sure), then compare it with what your answers show. Feeling sure and being right are different things.</p>
      <Alert tone="info" className="mb-3" aria-live="polite">{data.message}</Alert>
      <ul className="space-y-3">
        {data.topics.map((t) => {
          const rating = draft[t.topic_id] ?? t.rating;
          const v = VERDICT[t.verdict] ?? VERDICT.not_rated;
          return (
            <li key={t.topic_id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-anywhere font-semibold">{t.name}</p>
                  <Badge tone={v.tone} className="ml-auto">{v.label}</Badge>
                </div>
                <div role="group" aria-label={`How sure are you about ${t.name}`} className="mt-2 flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n} type="button" aria-pressed={rating === n} title={labels[String(n)]}
                      onClick={() => setDraft((d) => ({ ...d, [t.topic_id]: n }))}
                      className={cn("inline-flex h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm font-semibold", rating === n ? "border-primary bg-primary text-white" : "border-border bg-surface hover:bg-accent")}
                    >
                      {n}<span className="sr-only"> {labels[String(n)]}</span>
                    </button>
                  ))}
                  <span className="self-center text-xs text-muted">{rating ? labels[String(rating)] : "not rated"}</span>
                </div>
                {t.rating !== null && t.confidence !== null && (
                  <p className="mt-2 text-xs text-muted">You felt about <b>{pc(t.perceived)}</b>; your answers show <b>{pc(t.confidence)}</b> confidence ({t.answered} answer{t.answered === 1 ? "" : "s"}).</p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      <div className="mt-3"><Button onClick={() => save.mutate()} disabled={!changed || save.isPending}>{save.isPending ? "Saving…" : "Save my ratings"}</Button></div>
    </section>
  );
}
