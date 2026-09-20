"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Briefcase } from "lucide-react";
import { api } from "@/lib/api";
import { getCareers, keys } from "@/lib/queries";
import { friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { ErrorState } from "@/components/nexus/shell";
import { Alert, Badge, Button, Card, Input, Label, Skeleton, Textarea } from "@/components/ui/primitives";

const STATE = { pending: { label: "Reading…", tone: "warning" }, done: { label: "Ready", tone: "success" }, failed: { label: "Could not read", tone: "danger" } };

export default function CareerPage() {
  useTitle("Career goals");
  const router = useRouter();
  const qc = useQueryClient();
  const { data, error, isPending, refetch } = useQuery({ queryKey: keys.careers, queryFn: getCareers });
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const create = useMutation({
    mutationFn: () => api("/career", { method: "POST", json: { title, text } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: keys.careers }); router.push(`/career/${r.id}`); },
    onError: (e) => { setProblem(friendlyError(e)); toast.error(friendlyError(e)); },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Briefcase className="h-6 w-6" aria-hidden="true" /> Career goals</h1>
        <p className="mt-1 text-sm text-muted">Paste a job description. Nexus lists the skills it asks for and checks each one against your own materials and quiz answers, so you see what is proven, what is still developing and what has no evidence yet.</p>
      </div>

      <Card>
        <h2 className="text-lg font-bold">Add a job description</h2>
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); setProblem(""); create.mutate(); }}>
          <div><Label htmlFor="cg-title">Job title</Label><Input id="cg-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Junior Data Analyst" required minLength={2} /></div>
          <div>
            <Label htmlFor="cg-text">Job description</Label>
            <Textarea id="cg-text" value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={16000} minLength={40} required placeholder="Paste the requirements and responsibilities here…" />
            <p className="mt-1 text-xs text-muted">Only this text is sent to a model (and only if you allowed cloud models in Account). Your materials are never sent.</p>
          </div>
          {problem && <Alert tone="danger">{problem}</Alert>}
          <Button type="submit" disabled={create.isPending || title.trim().length < 2 || text.trim().length < 40}>{create.isPending ? "Saving…" : "Read the skills"}</Button>
        </form>
      </Card>

      <section aria-labelledby="cg-list-h">
        <h2 id="cg-list-h" className="mb-3 text-lg font-bold">Your goals</h2>
        {error ? <ErrorState error={error} onRetry={refetch} /> : isPending ? <Skeleton className="h-24" /> : data.length === 0 ? (
          <p className="text-sm text-muted">No career goals yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.map((g) => (
              <li key={g.id}>
                <Card className="flex flex-wrap items-center gap-3 p-4">
                  <Link href={`/career/${g.id}`} className="break-anywhere flex-1 font-semibold">{g.title}</Link>
                  <span className="text-xs text-muted">{g.skills} skill{g.skills === 1 ? "" : "s"}</span>
                  <Badge tone={(STATE[g.status] ?? STATE.done).tone}>{(STATE[g.status] ?? STATE.done).label}</Badge>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
