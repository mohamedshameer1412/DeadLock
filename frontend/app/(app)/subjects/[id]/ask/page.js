"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { api } from "@/lib/api";
import { getDocs, getQuestions, getSubject, getTopics, keys } from "@/lib/queries";
import { friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { Bubble, ChatTurn } from "@/components/nexus/chat";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Alert, Button, Dialog, DialogClose, DialogContent, Skeleton } from "@/components/ui/primitives";

const MAX = 500;
const SHOWN = 20;

function Composer({ id, text, setText, onSent }) {
  const qc = useQueryClient();
  const ref = useRef(null);
  const [error, setError] = useState("");
  const ask = useMutation({
    mutationFn: (question) => api(`/subjects/${id}/questions`, { method: "POST", json: { question } }),
    onSuccess: async () => {
      setText("");
      await Promise.all([qc.invalidateQueries({ queryKey: keys.questions(id) }), qc.invalidateQueries({ queryKey: keys.subjects })]);
      onSent();
    },
    onError: (e) => setError(friendlyError(e)),
  });
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; } // grows with the text, like a chat box
  }, [text]);
  const send = () => {
    const t = text.trim();
    setError("");
    if (t.length < 3) return setError("Type your question first.");
    ask.mutate(t);
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-1">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex items-end gap-2">
        <label htmlFor="question" className="sr-only">Your question</label>
        <textarea
          id="question" ref={ref} rows={1} value={text} maxLength={MAX} disabled={ask.isPending}
          placeholder="Ask about your materials…" aria-describedby="q-help"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          className="min-h-[44px] flex-1 resize-none overflow-hidden rounded-2xl border border-border bg-surface px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
        <Button type="submit" size="icon" aria-label="Ask" disabled={ask.isPending} className="rounded-full"><Send className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
      <p id="q-help" className="px-1 text-xs text-muted">Enter to send · Shift+Enter for a new line · {text.length}/{MAX}. Answers use only this subject&apos;s materials, with the exact words they rest on.</p>
    </form>
  );
}

export default function AskPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: subject } = useQuery({ queryKey: keys.subject(id), queryFn: () => getSubject(id) });
  useTitle("Ask", subject?.name);
  const docs = useQuery({ queryKey: keys.docs(id), queryFn: () => getDocs(id) });
  const topics = useQuery({ queryKey: keys.topics(id), queryFn: () => getTopics(id) });
  const history = useQuery({ queryKey: keys.questions(id), queryFn: () => getQuestions(id) });
  const [all, setAll] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);
  const hasMaterial = docs.data?.some((d) => d.chunks > 0);

  const items = history.data ? [...history.data].sort((a, b) => a.id - b.id) : [];
  const visible = all ? items : items.slice(-SHOWN);
  const lastId = items.at(-1)?.id;
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [lastId]);

  const remove = useMutation({
    mutationFn: (item) => api(`/subjects/${id}/questions/${item.id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.questions(id) }); qc.invalidateQueries({ queryKey: keys.subjects }); toast.success("Question deleted"); setToDelete(null); },
    onError: (e) => { toast.error(friendlyError(e)); setToDelete(null); },
  });

  if (docs.isPending || history.isPending) return <Skeleton className="h-64" />;
  if (history.error) return <ErrorState error={history.error} onRetry={history.refetch} />;
  if (!hasMaterial) {
    return (
      <EmptyState title="Upload some material first" action={<Button asChild><Link href={`/subjects/${id}/materials`}>Go to Materials</Link></Button>}>
        Answers are written only from what you upload to this subject.
      </EmptyState>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-16rem)] flex-col">
      <h2 className="sr-only">Chat with your materials</h2>
      <div role="log" aria-label="Conversation" aria-live="polite" className="flex-1 pb-4">
        {items.length > visible.length && (
          <div className="mb-4 text-center"><Button variant="secondary" size="sm" onClick={() => setAll(true)}>Show {items.length - visible.length} earlier</Button></div>
        )}
        <ul className="space-y-6">
          <li>
            <Bubble label="Nexus said:">
              <p>Ask me anything about <b className="break-anywhere">{subject?.name ?? "this subject"}</b>. I answer only from your uploaded materials, show the exact words I used, and say so when they do not cover your question.</p>
              {items.length === 0 && (topics.data?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {topics.data.slice(0, 3).map((t) => (
                    <button key={t.id} type="button" className="min-h-11 rounded-full border border-border bg-background px-3 text-sm text-link hover:bg-surface-2"
                      onClick={() => { setDraft(`What is ${t.name}?`); document.getElementById("question")?.focus(); }}>
                      What is {t.name}?
                    </button>
                  ))}
                </div>
              )}
            </Bubble>
          </li>
          {visible.map((item) => <ChatTurn key={item.id} subjectId={id} item={item} onDelete={setToDelete} />)}
        </ul>
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-[4.25rem] z-20 -mx-4 border-t border-border bg-background/95 px-4 pb-2 pt-3 backdrop-blur sm:bottom-0">
        <Composer id={id} text={draft} setText={setDraft} onSent={() => endRef.current?.scrollIntoView({ block: "end" })} />
      </div>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent title="Delete this question?" description="The question and its answer are removed. Your materials are not touched.">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
            <Button variant="danger" onClick={() => remove.mutate(toDelete)} disabled={remove.isPending}>{remove.isPending ? "Deleting…" : "Delete"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
