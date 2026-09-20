"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Layers } from "lucide-react";
import { api } from "@/lib/api";
import { getFlashcards, getMcqAnswer, getSubject, keys } from "@/lib/queries";
import { friendlyError, plural } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Alert, Button, Card, Progress, Skeleton } from "@/components/ui/primitives";

const GRADES = [
  ["again", "Again", "I did not know it. Back in 10 minutes."],
  ["hard", "Hard", "I got it with effort."],
  ["good", "Good", "I knew it."],
  ["easy", "Easy", "Too easy. Much later."],
];

export default function FlashcardsPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: subject } = useQuery({ queryKey: keys.subject(id), queryFn: () => getSubject(id) });
  useTitle("Flashcards", subject?.name);
  const { data, error, isPending, refetch } = useQuery({ queryKey: keys.flashcards(id), queryFn: () => getFlashcards(id), staleTime: Infinity, refetchOnWindowFocus: false });
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const card = data?.cards[index];
  const answer = useQuery({ queryKey: ["fc-answer", id, card?.item_id], queryFn: () => getMcqAnswer(id, card.item_id), enabled: shown && !!card, staleTime: Infinity });
  const rate = useMutation({
    mutationFn: (grade) => api(`/subjects/${id}/flashcards/${card.item_id}/review`, { method: "POST", json: { grade } }),
    onSuccess: () => { setShown(false); setReviewed((n) => n + 1); setIndex((i) => i + 1); qc.invalidateQueries({ queryKey: keys.dashboard }); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-64" />;
  const back = <Link href={`/subjects/${id}/practice`} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm no-underline hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Practice</Link>;
  if (data.total === 0) {
    return <div>{back}<EmptyState title="No cards yet" action={<Button asChild><Link href={`/subjects/${id}/practice`}>Write practice questions</Link></Button>}>Every practice question becomes a flashcard.</EmptyState></div>;
  }
  if (!card) {
    return (
      <div>{back}
        <EmptyState title={reviewed ? `Done: ${plural(reviewed, "card")} reviewed` : "Nothing is due right now"}>
          {data.next_due ? `The next card is due ${new Date(data.next_due).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}.` : "Come back later."} Cards you know return later and later; cards you miss return soon.
        </EmptyState>
      </div>
    );
  }
  const a = answer.data;
  return (
    <div className="mx-auto max-w-2xl">
      {back}
      <h2 className="flex items-center gap-2 text-lg font-bold"><Layers className="h-5 w-5" aria-hidden="true" /> Flashcards</h2>
      <p className="mt-1 text-sm text-muted">{data.due} due · {data.new} new · card {index + 1} of {data.cards.length}{card.is_new ? " (new)" : ""}</p>
      <Progress value={Math.round((index / data.cards.length) * 100)} aria-label="Session progress" className="mt-2" />
      <Card className="mt-4">
        <p className="break-anywhere text-lg font-semibold">{card.question}</p>
        {card.topic && <p className="break-anywhere mt-1 text-xs text-muted">{card.topic}</p>}
        <ol className="mt-3 space-y-2">
          {card.options.map((o, i) => (
            <li key={i} className={`break-anywhere rounded-md border px-3 py-2 text-sm ${a && a.answer_index === i ? "border-success bg-success-bg font-semibold" : "border-border bg-surface"}`}>
              <b>{String.fromCharCode(65 + i)}.</b> {o}{a && a.answer_index === i && <span className="ml-2 text-success">Correct answer</span>}
            </li>
          ))}
        </ol>
        {a && (
          <div className="mt-3 rounded-md bg-surface-2 p-3 text-sm" role="status">
            {a.explanation && <p className="break-anywhere">{a.explanation}</p>}
            <blockquote className="break-anywhere my-2 border-l-4 border-primary pl-3">{a.quote}</blockquote>
          </div>
        )}
      </Card>
      {!shown ? (
        <Button className="mt-4 w-full sm:w-auto" onClick={() => setShown(true)}>Show answer</Button>
      ) : answer.isPending ? <p className="mt-4 text-sm text-muted">Loading the answer…</p> : (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold">How well did you know it?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GRADES.map(([g, label, hint]) => <Button key={g} variant={g === "good" ? "default" : "secondary"} title={hint} disabled={rate.isPending} onClick={() => rate.mutate(g)}>{label}</Button>)}
          </div>
          <Alert tone="info" className="mt-3">Be honest: the schedule only works if you rate what you really remembered.</Alert>
        </div>
      )}
    </div>
  );
}
