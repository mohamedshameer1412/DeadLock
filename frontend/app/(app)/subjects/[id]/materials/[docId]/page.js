"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { getDoc, keys } from "@/lib/queries";
import { friendlyError, pageLabel, plural } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { ErrorState } from "@/components/nexus/shell";
import { Alert, Badge, Button, Card, Dialog, DialogClose, DialogContent, DialogTrigger, Skeleton } from "@/components/ui/primitives";

export default function DocumentPage() {
  const { id, docId } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.doc(id, docId), queryFn: () => getDoc(id, docId) });
  const remove = useMutation({
    mutationFn: () => api(`/subjects/${id}/materials/${docId}`, { method: "DELETE" }),
    onSuccess: () => {
      for (const k of [keys.docs(id), keys.topics(id), keys.subject(id), keys.subjects]) qc.invalidateQueries({ queryKey: k });
      toast.success("Material removed");
      router.replace(`/subjects/${id}/materials`);
    },
    onError: (e) => { toast.error(friendlyError(e)); setOpen(false); },
  });

  useTitle(data?.document.title, "Materials");
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-40" />;
  const { document: d, passages } = data;
  return (
    <div>
      <Link href={`/subjects/${id}/materials`} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm no-underline hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Materials
      </Link>
      <h2 className="break-anywhere text-xl font-bold">{d.title}</h2>
      <p className="mt-1 flex flex-wrap gap-1.5">
        <Badge>{d.kind.toUpperCase()}</Badge>
        {d.pages ? <Badge>{plural(d.pages, "page")}</Badge> : null}
        <Badge>{plural(d.chunks, "passage")}</Badge>
        <Badge tone={d.status === "parsed" ? "success" : "warning"}>{d.status}</Badge>
      </p>
      {d.warnings.map((w) => <Alert key={w} className="mt-2">{w}</Alert>)}
      {d.kind === "pdf" && (
        <details open className="mt-4 rounded-lg border border-border bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">The uploaded PDF</summary>
          <iframe src={`/api/v1/subjects/${id}/materials/${docId}/file`} title={`${d.title} (PDF)`} className="h-[70vh] w-full border-0" />
        </details>
      )}
      {d.kind === "url" && <p className="break-anywhere mt-2 text-sm">Web page: <a href={d.source} target="_blank" rel="noopener noreferrer">{d.source}</a></p>}
      <div className="mt-4 space-y-3">
        {passages.length === 0 && <p className="text-sm text-muted">Nothing could be extracted from this file.</p>}
        {passages.map((p) => (
          <Card key={p.id} id={`c${p.id}`}>
            <p className="break-anywhere text-xs text-muted">
              #{p.ordinal + 1}{p.heading_path && <> · {p.heading_path}</>}{p.page_start != null && <> · {pageLabel(p.page_start, p.page_end)}</>}
            </p>
            {p.quarantined && <Alert className="mt-2">Not used for answers: it reads like instructions to an AI ({p.flag_reason}).</Alert>}
            <p className="break-anywhere mt-1 whitespace-pre-wrap text-sm">{p.text}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8 border-t border-border pt-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary"><Trash2 className="h-4 w-4" aria-hidden="true" /> Remove material</Button>
          </DialogTrigger>
          <DialogContent title="Remove this material?" description="Its passages disappear from search, questions and quizzes. This cannot be undone.">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
              <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>{remove.isPending ? "Removing…" : "Remove"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
