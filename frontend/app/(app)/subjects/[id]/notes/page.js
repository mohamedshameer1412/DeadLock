"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, Eye, MessageCircleQuestion, NotebookPen, Pencil, Plus, Printer, Save, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { getNote, getNotes, getSubject, keys } from "@/lib/queries";
import { cn, friendlyError, plural } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { Markdown } from "@/components/nexus/markdown";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Alert, Badge, Button, Card, Dialog, DialogClose, DialogContent, Input, Label, Skeleton, Textarea } from "@/components/ui/primitives";

const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function Editor({ subjectId, noteId, onSaved, onDeleted, onClose }) {
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: keys.note(subjectId, noteId), queryFn: () => getNote(subjectId, noteId), enabled: noteId !== "new" });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState("");
  const [del, setDel] = useState(false);
  useEffect(() => { if (existing.data) { setTitle(existing.data.title); setBody(existing.data.body); setDirty(false); setPreview(existing.data.source === "chat"); } }, [existing.data]);
  useEffect(() => { if (noteId === "new") { setTitle(""); setBody(""); setDirty(false); setPreview(false); } }, [noteId]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => (noteId === "new"
      ? api(`/subjects/${subjectId}/notes`, { method: "POST", json: { title, body } })
      : api(`/subjects/${subjectId}/notes/${noteId}`, { method: "PUT", json: { title, body } })),
    onSuccess: (n) => { setDirty(false); setProblem(""); qc.invalidateQueries({ queryKey: keys.notes(subjectId) }); qc.setQueryData(keys.note(subjectId, n.id), n); toast.success("Note saved"); onSaved(n.id); },
    onError: (e) => setProblem(friendlyError(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/subjects/${subjectId}/notes/${noteId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.notes(subjectId) }); toast.success("Note deleted"); setDel(false); onDeleted(); },
    onError: (e) => { toast.error(friendlyError(e)); setDel(false); },
  });
  const download = () => {
    const url = URL.createObjectURL(new Blob([`# ${title}\n\n${body}`], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "note").replace(/[^\w -]+/g, "").trim().slice(0, 60) || "note"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (noteId !== "new" && existing.isPending) return <Skeleton className="h-64" />;
  if (existing.error) return <ErrorState error={existing.error} onRetry={existing.refetch} />;
  return (
    <div>
      <button type="button" onClick={onClose} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm lg:hidden"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All notes</button>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <div><Label htmlFor="note-title">Title</Label><Input id="note-title" value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} placeholder="e.g. Stacks and queues" /></div>
        <div className="flex items-center justify-between">
          <Label htmlFor="note-body">Note</Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((v) => !v)} aria-pressed={preview}>{preview ? <><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</> : <><Eye className="h-4 w-4" aria-hidden="true" /> Preview</>}</Button>
        </div>
        {preview ? (
          <div className="min-h-48 rounded-md border border-border bg-surface p-3"><Markdown text={body} />{!body.trim() && <p className="text-sm text-muted">Nothing to preview yet.</p>}</div>
        ) : (
          <Textarea id="note-body" value={body} onChange={(e) => { setBody(e.target.value); setDirty(true); }} maxLength={50000} className="min-h-64 font-mono text-sm" placeholder={"Write in plain text. You can use:\n# Heading\n- a list\n**bold**, *italic*, `code`\n> a quote"} />
        )}
        {problem && <Alert tone="danger">{problem}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={save.isPending || (!dirty && noteId !== "new")}><Save className="h-4 w-4" aria-hidden="true" /> {save.isPending ? "Saving…" : "Save note"}</Button>
          {dirty && <span className="text-xs text-muted" role="status">Unsaved changes</span>}
          {noteId !== "new" && (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={download}><Download className="h-4 w-4" aria-hidden="true" /> Download</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => { setPreview(true); setTimeout(() => window.print(), 100); }}><Printer className="h-4 w-4" aria-hidden="true" /> Print</Button>
              <Dialog open={del} onOpenChange={setDel}>
                <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete</Button>
                <DialogContent title="Delete this note?" description="It is removed for good. Your materials are not touched.">
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                    <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>{remove.isPending ? "Deleting…" : "Delete"}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

export default function NotesPage() {
  const { id } = useParams();
  const { data: subject } = useQuery({ queryKey: keys.subject(id), queryFn: () => getSubject(id) });
  useTitle("Notes", subject?.name);
  const { data, error, isPending, refetch } = useQuery({ queryKey: keys.notes(id), queryFn: () => getNotes(id) });
  const [selected, setSelected] = useState(null); // note id, "new", or null
  const [filter, setFilter] = useState("");
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-64" />;
  const q = filter.trim().toLowerCase();
  const shown = q ? data.notes.filter((n) => `${n.title} ${n.snippet}`.toLowerCase().includes(q)) : data.notes;

  return (
    <div className="lg:grid lg:grid-cols-[18rem_1fr] lg:gap-6">
      <section aria-labelledby="notes-h" className={cn(selected !== null && "hidden lg:block")}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="notes-h" className="flex items-center gap-2 text-lg font-bold"><NotebookPen className="h-5 w-5" aria-hidden="true" /> Notes ({data.notes.length})</h2>
          <Button size="sm" onClick={() => setSelected("new")}><Plus className="h-4 w-4" aria-hidden="true" /> New note</Button>
        </div>
        {data.notes.length > 0 && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input aria-label="Search your notes" placeholder="Search notes" value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9" />
          </div>
        )}
        {data.notes.length === 0 ? (
          <EmptyState title="No notes yet" action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setSelected("new")}>Write a note</Button><Button asChild variant="secondary"><Link href={`/subjects/${id}/ask`}>Turn answers into notes</Link></Button></div>}>
            Write your own, or save answers from the Ask chat: they arrive with their sources.
          </EmptyState>
        ) : shown.length === 0 ? <p className="text-sm text-muted">No note matches.</p> : (
          <ul className="space-y-2">
            {shown.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => setSelected(n.id)} aria-current={selected === n.id ? "true" : undefined} className={cn("w-full rounded-lg border p-3 text-left hover:bg-surface-2", selected === n.id ? "border-primary bg-accent" : "border-border bg-surface")}>
                  <span className="break-anywhere block font-semibold">{n.title}</span>
                  <span className="break-anywhere mt-0.5 block text-xs text-muted">{n.snippet || "Empty note"}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted">{when(n.updated_at)} {n.source === "chat" && <Badge>From chat</Badge>}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Note editor" className={cn(selected === null && "hidden lg:block")}>
        {selected === null ? (
          <Card className="hidden text-sm text-muted lg:block">Pick a note to read or edit it, or start a new one. To turn a chat answer into a note, use the bookmark-with-plus button under it in <Link href={`/subjects/${id}/ask`}><MessageCircleQuestion className="inline h-4 w-4" aria-hidden="true" /> Ask</Link>. {plural(data.notes.length, "note")} so far.</Card>
        ) : (
          <Editor key={String(selected)} subjectId={id} noteId={selected} onSaved={(nid) => setSelected(nid)} onDeleted={() => setSelected(null)} onClose={() => setSelected(null)} />
        )}
      </section>
    </div>
  );
}
