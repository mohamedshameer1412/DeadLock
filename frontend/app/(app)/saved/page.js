"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bookmark, BookmarkX } from "lucide-react";
import { api } from "@/lib/api";
import { getSaved, keys } from "@/lib/queries";
import { friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { StatusBadge } from "@/components/nexus/answer";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Button, Card, Skeleton } from "@/components/ui/primitives";

export default function SavedPage() {
  useTitle("Saved answers");
  const qc = useQueryClient();
  const { data, error, isPending, refetch } = useQuery({ queryKey: keys.saved, queryFn: getSaved });
  const unsave = useMutation({
    mutationFn: (r) => api(`/subjects/${r.subject_id}/questions/${r.id}/saved`, { method: "PUT", json: { saved: false } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.saved }); toast.success("Removed from saved"); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-40" />;
  return (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold"><Bookmark className="h-6 w-6" aria-hidden="true" /> Saved answers</h1>
      <p className="mt-1 text-sm text-muted">Answers you bookmarked in the Ask chat, from every subject.</p>
      <div className="mt-5">
        {data.saved.length === 0 ? (
          <EmptyState title="Nothing saved yet">Use the bookmark button under an answer in the Ask chat to keep it here.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {data.saved.map((r) => (
              <li key={`${r.subject_id}-${r.id}`}>
                <Card className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/subjects/${r.subject_id}/ask/${r.id}`} className="break-anywhere font-semibold">{r.question}</Link>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><span>{r.subject}</span><StatusBadge status={r.status} /></p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => unsave.mutate(r)} aria-label={`Remove from saved: ${r.question}`}><BookmarkX className="h-4 w-4" aria-hidden="true" /> Remove</Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
