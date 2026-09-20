"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { keys } from "@/lib/queries";
import { friendlyError, plural } from "@/lib/utils";
import { Alert, Button, Dialog, DialogClose, DialogContent, DialogTrigger, Input, Label, Textarea } from "@/components/ui/primitives";

/** Rename a subject or change its description. */
export function EditSubject({ subject, size = "sm", onDone }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(subject.name);
  const [description, setDescription] = useState(subject.description ?? "");
  const [problem, setProblem] = useState("");
  const save = useMutation({
    mutationFn: () => api(`/subjects/${subject.id}`, { method: "PATCH", json: { name, description } }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: keys.subjects });
      qc.setQueryData(keys.subject(String(subject.id)), s);
      qc.invalidateQueries({ queryKey: keys.subject(String(subject.id)) });
      toast.success("Subject updated");
      setOpen(false);
      onDone?.(s);
    },
    onError: (e) => setProblem(friendlyError(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setProblem(""); if (o) { setName(subject.name); setDescription(subject.description ?? ""); } }}>
      <DialogTrigger asChild>
        <Button variant="secondary" size={size} aria-label={`Edit ${subject.name}`}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</Button>
      </DialogTrigger>
      <DialogContent title="Edit subject" description="Changing the name or description does not touch your materials or progress.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setProblem(""); if (!name.trim()) return setProblem("Give the subject a name."); save.mutate(); }}>
          {problem && <Alert tone="danger">{problem}</Alert>}
          <div><Label htmlFor={`en-${subject.id}`}>Name</Label><Input id={`en-${subject.id}`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div><Label htmlFor={`ed-${subject.id}`}>Description (optional)</Label><Textarea id={`ed-${subject.id}`} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Delete a subject with everything in it, after an explicit confirmation. */
export function DeleteSubject({ subject, size = "sm", redirect = false }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState("");
  const c = subject.counts ?? {};
  const remove = useMutation({
    mutationFn: () => api(`/subjects/${subject.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.removeQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[1] === String(subject.id) });
      qc.invalidateQueries({ queryKey: keys.subjects });
      qc.invalidateQueries({ queryKey: keys.dashboard });
      toast.success(`Deleted “${subject.name}”`);
      setOpen(false);
      if (redirect) router.replace("/subjects");
    },
    onError: (e) => setProblem(friendlyError(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setProblem(""); }}>
      <DialogTrigger asChild>
        <Button variant="secondary" size={size} aria-label={`Delete ${subject.name}`} className="text-danger"><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete</Button>
      </DialogTrigger>
      <DialogContent title={`Delete “${subject.name}”?`} description="This cannot be undone.">
        <div className="space-y-4">
          <p className="text-sm">
            This permanently removes {plural(c.documents ?? 0, "material")}, {plural(c.practice_questions ?? 0, "practice question")}, {plural(c.questions ?? 0, "answered question")}, and every quiz, note, flashcard and progress record in this subject.
          </p>
          {problem && <Alert tone="danger">{problem}</Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            <DialogClose asChild><Button variant="secondary">Keep it</Button></DialogClose>
            <Button variant="danger" onClick={() => { setProblem(""); remove.mutate(); }} disabled={remove.isPending}>{remove.isPending ? "Deleting…" : "Delete subject"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
