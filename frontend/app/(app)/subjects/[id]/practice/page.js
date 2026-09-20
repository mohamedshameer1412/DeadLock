"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { check, McqStarted } from "@/lib/schemas";
import { getDocs, getMcq, getMcqJob, getSubject, getTopics, keys } from "@/lib/queries";
import { friendlyError, plural } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { JobProgress } from "@/components/nexus/answer";
import McqCard from "@/components/nexus/mcq-card";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Alert, Button, Card, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton , Checkbox } from "@/components/ui/primitives";

const selectClass = "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-2";

function Generator({ id, topics }) {
  const qc = useQueryClient();
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("5");
  const [jobId, setJobId] = useState(null);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const start = useMutation({
    mutationFn: () => api(`/subjects/${id}/mcq/jobs`, { method: "POST", json: { topic_id: topic ? Number(topic) : null, count: Number(count) } }),
    onSuccess: (r) => { setStartedAt(new Date().toISOString()); setJobId(check(McqStarted, r).id); setError(""); },
    onError: (e) => setError(friendlyError(e)),
  });
  const job = useQuery({
    queryKey: keys.mcqJob(id, jobId), queryFn: () => getMcqJob(id, jobId), enabled: jobId !== null,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 2500 : false),
  });
  const status = job.data?.status;
  useEffect(() => {
    if (!status || status === "pending") return;
    qc.invalidateQueries({ queryKey: keys.mcq(id) });
    qc.invalidateQueries({ queryKey: keys.quiz(id) });
    qc.invalidateQueries({ queryKey: keys.subjects });
  }, [status, id, qc]);

  const running = start.isPending || status === "pending" || (jobId !== null && !job.data && !job.error);
  const d = job.data;
  return (
    <Card>
      <form onSubmit={(e) => { e.preventDefault(); setJobId(null); start.mutate(); }} className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
        <div>
          <Label htmlFor="topic">Topic</Label>
          <Select value={topic || "all"} onValueChange={(val) => setTopic(val === "all" ? "" : val)}>
              <SelectTrigger id="topic">
                <SelectValue placeholder="Whole subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Whole subject</SelectItem>
                {topics.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.path}</SelectItem>)}
              </SelectContent>
            </Select>
        </div>
        <div>
          <Label htmlFor="count">How many</Label>
          <Select value={String(count)} onValueChange={(val) => setCount(Number(val))}>
              <SelectTrigger id="count">
                <SelectValue placeholder="5" />
              </SelectTrigger>
              <SelectContent>
                {[3, 5, 8, 10].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
        </div>
        <Button type="submit" disabled={running}><Wand2 className="h-4 w-4" aria-hidden="true" /> {running ? "Writing…" : "Write questions"}</Button>
      </form>
      <p className="mt-2 text-xs text-muted">Each question must quote your material word for word, and its answer is checked a second time before you see it. Nexus keeps only questions that pass.</p>
      {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
      {running && jobId !== null && <div className="mt-4"><JobProgress createdAt={startedAt} what="Writing and checking questions…" /></div>}
      {d && status !== "pending" && (
        <Alert tone={d.produced > 0 ? "success" : "warning"} className="mt-4">
          {d.produced > 0
            ? `Added ${plural(d.produced, "question")}${d.rejected ? `; ${plural(d.rejected, "draft")} did not pass the checks and ${d.rejected === 1 ? "was" : "were"} thrown away` : ""}.`
            : d.reason || "No question passed the checks, so none were added. Nothing was made up."}
        </Alert>
      )}
    </Card>
  );
}

export default function PracticePage() {
  const { id } = useParams();
  const { data: subject } = useQuery({ queryKey: keys.subject(id), queryFn: () => getSubject(id) });
  useTitle("Practice", subject?.name);
  const docs = useQuery({ queryKey: keys.docs(id), queryFn: () => getDocs(id) });
  const topics = useQuery({ queryKey: keys.topics(id), queryFn: () => getTopics(id) });
  const bank = useQuery({ queryKey: keys.mcq(id), queryFn: () => getMcq(id) });
  const [filter, setFilter] = useState("");

  if (docs.isPending || bank.isPending) return <Skeleton className="h-64" />;
  if (bank.error) return <ErrorState error={bank.error} onRetry={bank.refetch} />;
  if (!docs.data?.some((d) => d.chunks > 0)) {
    return (
      <EmptyState title="Upload some material first" action={<Button asChild><Link href={`/subjects/${id}/materials`}>Go to Materials</Link></Button>}>
        Practice questions are written from what you upload to this subject.
      </EmptyState>
    );
  }
  const usable = (topics.data ?? []).filter((t) => t.passages > 0);
  const shown = filter ? bank.data.filter((q) => String(q.topic_id) === filter) : bank.data;
  return (
    <div className="space-y-6">
      <section aria-labelledby="gen-h">
        <h2 id="gen-h" className="mb-2 text-lg font-bold">Write practice questions</h2>
        <Generator id={id} topics={usable} />
      </section>

      <section aria-labelledby="bank-h">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="bank-h" className="text-lg font-bold">Your questions ({bank.data.length})</h2>
          {bank.data.length > 0 && (
            <div className="w-full sm:w-64">
              <Label htmlFor="filter">Show topic</Label>
              <Select value={filter || "all"} onValueChange={(val) => setFilter(val === "all" ? "" : val)}>
                <SelectTrigger id="filter">
                  <SelectValue placeholder="All topics" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All topics</SelectItem>
                  {usable.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.path}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {bank.data.length === 0 ? (
          <p className="text-sm text-muted">No questions yet. Write some above; practice is not scored and nothing here is a test.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted">No questions for that topic yet.</p>
        ) : (
          <ul className="space-y-4">
            {shown.map((q, i) => <li key={q.id}><McqCard subjectId={id} q={q} index={i + 1} /></li>)}
          </ul>
        )}
        {bank.data.length > 0 && (
          <p className="mt-4 text-sm text-muted">Ready to be scored? <Link href={`/subjects/${id}/quiz`}>Take a quiz</Link>.</p>
        )}
      </section>
    </div>
  );
}
