"use client";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, MessageCircleQuestion, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { getSubjects, keys } from "@/lib/queries";
import { friendlyError, plural } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { DeleteSubject, EditSubject } from "@/components/nexus/subject-actions";
import { Alert, Button, Card, Dialog, DialogContent, DialogTrigger, Input, Label, Skeleton, Textarea } from "@/components/ui/primitives";

const schema = z.object({
  name: z.string().trim().min(1, "Give the subject a name.").max(80, "A subject name can be at most 80 characters."),
  description: z.string().max(500, "A description can be at most 500 characters."),
});

function NewSubject() {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState("");
  const qc = useQueryClient();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: "", description: "" } });
  const { errors } = form.formState;
  const create = useMutation({
    mutationFn: (v) => api("/subjects", { method: "POST", json: v }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: keys.subjects });
      toast.success(`Created “${s.name}”`);
      setOpen(false);
      form.reset();
    },
    onError: (e) => setServerError(friendlyError(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setServerError(""); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-5 w-5" aria-hidden="true" /> New subject
        </Button>
      </DialogTrigger>
      <DialogContent title="New subject" description="Each subject keeps its own materials, questions, quizzes and progress.">
        <form onSubmit={form.handleSubmit((v) => { setServerError(""); create.mutate(v); })} className="space-y-4" noValidate>
          {serverError && <Alert tone="danger">{serverError}</Alert>}
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" aria-invalid={!!errors.name} {...form.register("name")} autoFocus />
            {errors.name && <p role="alert" className="mt-1 text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" aria-invalid={!!errors.description} {...form.register("description")} />
            {errors.description && <p role="alert" className="mt-1 text-sm text-danger">{errors.description.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create subject"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SubjectsPage() {
  useTitle("Your subjects");
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.subjects, queryFn: getSubjects });
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Your subjects</h1>
          <p className="text-sm text-muted">Each subject keeps its own materials, questions, quizzes and progress.</p>
        </div>
        <NewSubject />
      </div>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : data.length === 0 ? (
        <EmptyState title="No subjects yet" action={<NewSubject />}>Create your first subject, then upload the material you want to study.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <li key={s.id}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <Link href={`/subjects/${s.id}/materials`} className="break-anywhere text-lg font-bold no-underline hover:underline">
                  {s.name}
                </Link>
                {s.description && <p className="break-anywhere mt-1 line-clamp-2 text-sm text-muted">{s.description}</p>}
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1"><FileText className="h-4 w-4" aria-hidden="true" />{plural(s.counts.documents, "material")}</span>
                  <span className="inline-flex items-center gap-1"><MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />{plural(s.counts.questions, "question")}</span>
                </p>
                <div className="mt-3 flex gap-2 border-t border-border pt-3"><EditSubject subject={s} /><DeleteSubject subject={s} /></div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
