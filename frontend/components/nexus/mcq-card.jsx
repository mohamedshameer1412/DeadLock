"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Trash2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { getMcqAnswer, keys } from "@/lib/queries";
import { cn, friendlyError, pageLabel } from "@/lib/utils";
import { Badge, Button, Card, Dialog, DialogClose, DialogContent } from "@/components/ui/primitives";

/** One practice question. Nothing is scored; the answer is fetched only when the student asks for it. */
export default function McqCard({ subjectId, q, index }) {
  const qc = useQueryClient();
  const [chosen, setChosen] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(false);
  const ans = useQuery({ queryKey: ["mcq-answer", subjectId, q.id], queryFn: () => getMcqAnswer(subjectId, q.id), enabled: revealed, staleTime: Infinity });
  const remove = useMutation({
    mutationFn: () => api(`/subjects/${subjectId}/mcq/${q.id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.mcq(subjectId) }); qc.invalidateQueries({ queryKey: keys.quiz(subjectId) }); qc.invalidateQueries({ queryKey: keys.subjects }); toast.success("Question deleted"); },
    onError: (e) => { toast.error(friendlyError(e)); setOpen(false); },
  });
  const a = revealed ? ans.data : undefined; // "Try again" hides the answer again
  return (
    <Card className="p-4">
      <fieldset>
        <legend className="break-anywhere mb-3 font-semibold"><span className="text-muted">{index}. </span>{q.question}</legend>
        <div className="space-y-2">
          {q.options.map((opt, i) => {
            const isAnswer = a && a.answer_index === i;
            const isWrongPick = a && chosen === i && a.answer_index !== i;
            return (
              <label key={i} className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm has-[:focus-visible]:outline-2",
                isAnswer ? "border-success bg-success-bg" : isWrongPick ? "border-danger bg-danger-bg" : chosen === i ? "border-primary bg-accent" : "border-border bg-surface hover:bg-surface-2")}>
                <input type="radio" name={`mcq-${q.id}`} className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={chosen === i} disabled={revealed} onChange={() => setChosen(i)} />
                <span className="break-anywhere flex-1">
                  <span className="font-semibold">{String.fromCharCode(65 + i)}.</span> {opt}
                  {isAnswer && <span className="ml-2 inline-flex items-center gap-1 font-semibold text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Correct answer</span>}
                  {isWrongPick && <span className="ml-2 inline-flex items-center gap-1 font-semibold text-danger"><XCircle className="h-4 w-4" aria-hidden="true" /> Your choice</span>}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {a && (
        <div className="mt-4 rounded-md bg-surface-2 p-3 text-sm" role="status">
          {chosen !== null && <p className={cn("mb-2 font-semibold", chosen === a.answer_index ? "text-success" : "text-danger")}>{chosen === a.answer_index ? "You got it." : "Not this time."}</p>}
          {a.explanation && <p className="break-anywhere">{a.explanation}</p>}
          <blockquote className="break-anywhere my-2 border-l-4 border-primary pl-3">{a.quote}</blockquote>
          <p className="break-anywhere text-xs text-muted">
            {a.document}{a.heading_path && <> · section: {a.heading_path}</>}{a.page_start != null && <> · {pageLabel(a.page_start, a.page_end)}</>}
          </p>
          <p className="mt-1 text-xs text-muted">
            The quote was found word for word in your material. {a.independently_checked ? "A second, independent check reached the same answer." : "The answer was not independently re-checked."}
          </p>
        </div>
      )}
      {ans.error && <p className="mt-3 text-sm text-danger">{friendlyError(ans.error)}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!revealed && <Button size="sm" onClick={() => setRevealed(true)}>{chosen === null ? "Show answer" : "Check answer"}</Button>}
        {revealed && <Button size="sm" variant="secondary" onClick={() => { setRevealed(false); setChosen(null); }}>Try again</Button>}
        {q.topic_path && <Badge className="break-anywhere">{q.topic_path}</Badge>}
        <Dialog open={open} onOpenChange={setOpen}>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setOpen(true)} aria-label={`Delete question ${index}`}><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete</Button>
          <DialogContent title="Delete this question?" description="It is removed from your practice questions and from future quizzes.">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
              <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>{remove.isPending ? "Deleting…" : "Delete"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}
