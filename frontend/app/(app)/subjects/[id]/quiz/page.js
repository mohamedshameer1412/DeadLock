"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { getQuiz, getRevision, getSubject, keys } from "@/lib/queries";
import { friendlyError, plural } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { CameraCheck } from "@/components/nexus/camera-check";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Alert, Badge, Button, Card, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton , Checkbox } from "@/components/ui/primitives";

const selectClass = "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base focus-visible:outline-2";
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function QuizHome() {
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: subject } = useQuery({ queryKey: keys.subject(id), queryFn: () => getSubject(id) });
  useTitle("Quiz", subject?.name);
  const { data, error, isPending, refetch } = useQuery({ queryKey: keys.quiz(id), queryFn: () => getQuiz(id) });
  const revision = useQuery({ queryKey: keys.revision(id), queryFn: () => getRevision(id) });
  const [kind, setKind] = useState("standard");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState("practice");
  const [limit, setLimit] = useState("none");
  const [agreed, setAgreed] = useState(false);
  const [problem, setProblem] = useState("");
  const start = useMutation({
    mutationFn: () => api(`/subjects/${id}/quiz/attempts`, { method: "POST", json: { topic_id: kind === "standard" && topic ? Number(topic) : null, mode, kind } }),
    onSuccess: (r) => {
      if (limit !== "none") { try { localStorage.setItem(`nexus.deadline.${r.id}`, String(Date.now() + Number(limit) * 60000)); } catch {} }
      qc.invalidateQueries({ queryKey: keys.quiz(id) }); router.push(`/subjects/${id}/quiz/${r.id}`); },
    onError: (e) => { setProblem(friendlyError(e)); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); },
  });

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-64" />;
  if (data.questions_in_bank === 0) {
    return (
      <EmptyState title="No questions to be quizzed on yet" action={<Button asChild><Link href={`/subjects/${id}/practice`}>Write practice questions</Link></Button>}>
        A quiz is made from the practice questions Nexus has written from your materials.
      </EmptyState>
    );
  }
  const wrongCount = revision.data?.wrong.length ?? 0;
  const blocked = (mode === "assessment" && !agreed) || (kind === "revision" && wrongCount === 0 && !(revision.data?.shaky_topics.length));

  // Full screen has to be asked for inside the click itself, so it comes first; then the camera permission is checked before the quiz exists.
  async function beginAssessment() {
    try { await document.documentElement.requestFullscreen?.(); } catch {}
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      probe.getTracks().forEach((t) => t.stop());
    } catch {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      setProblem("An assessment needs the camera. Allow the camera for this site, or choose Practice quiz.");
      return;
    }
    start.mutate();
  }
  return (
    <div className="space-y-8">
      <section aria-labelledby="start-h">
        <h2 id="start-h" className="mb-2 text-lg font-bold">Start a quiz</h2>
        <Card>
          {data.active_attempt && (
            <Alert className="mb-4">You have a quiz in progress. <Link href={`/subjects/${id}/quiz/${data.active_attempt}`}>Continue it</Link>, or start a new one below (the old one is closed).</Alert>
          )}
          <form onSubmit={(e) => {
            e.preventDefault();
            setProblem("");
            if (mode === "assessment") beginAssessment();
            else start.mutate();
          }} className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Type of quiz</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ["standard", "Standard quiz", "Up to 20 questions. If you miss one, Nexus steps back to the topic it builds on."],
                  ["diagnostic", "Diagnostic test", "Two questions from every topic: a quick way to get your first confidence scores."],
                  ["revision", "Revision quiz", `Only what you got wrong (${wrongCount}) and topics that are still shaky.`],
                ].map(([value, label, hint]) => (
                  <label key={value} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 has-[:focus-visible]:outline-2 ${kind === value ? "border-primary bg-accent" : "border-border bg-surface hover:bg-surface-2 shadow-sm"}`}>
                    <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-1 h-4 w-4 accent-primary" />
                    <span><span className="block font-semibold">{label}</span><span className="text-sm text-muted">{hint}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {kind === "standard" && (
              <div className="sm:max-w-md">
                <Label htmlFor="quiz-topic">Topic</Label>
                <Select value={topic || "all"} onValueChange={(val) => setTopic(val === "all" ? "" : val)}>
                  <SelectTrigger id="quiz-topic">
                    <SelectValue placeholder="Whole subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Whole subject</SelectItem>
                    {data.topics.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.path}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted">{plural(data.questions_in_bank, "question")} in your bank.</p>
              </div>
            )}
            <div className="sm:max-w-xs">
              <Label htmlFor="quiz-limit">Time limit</Label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger id="quiz-limit"><SelectValue placeholder="No limit" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No limit</SelectItem>
                  {[5, 10, 15, 30].map((m) => <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted">When time runs out the quiz ends; unanswered questions are not counted.</p>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Mode</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["practice", "Practice quiz", "Nothing is watched or blocked. Answer at your own pace."],
                  ["assessment", "Assessment", "Full screen and camera on. Copy/paste is blocked. It ends at once if you leave the page or full screen, or your face is not visible."],
                ].map(([value, label, hint]) => (
                  <label key={value} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 has-[:focus-visible]:outline-2 ${mode === value ? "border-primary bg-accent" : "border-border bg-surface hover:bg-surface-2 shadow-sm"}`}>
                    <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1 h-4 w-4 accent-primary" />
                    <span><span className="block font-semibold">{label}</span><span className="text-sm text-muted">{hint}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {mode === "assessment" && (
              <Alert tone="info">
                <p className="font-semibold">Before you start, please read this.</p>
                <p className="mt-1">Nexus opens full screen and turns on your camera. The camera picture is checked inside your browser only: it is never uploaded or saved. The assessment <b>ends at once</b> if you leave the page or full screen, if no face is visible for 6 seconds, or if more than one face is visible for 3 seconds. Copying, pasting and right-click are blocked. Questions you have not answered by then are not counted. It cannot see other devices or photos of your screen, and it is not a score of what you know or of honesty.</p>
                <CameraCheck />
                <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2">
                  <Checkbox id="agree-checkbox" checked={agreed} onCheckedChange={(checked) => setAgreed(!!checked)} />
                  <span>I understand and allow the camera</span>
                </label>
              </Alert>
            )}
            {problem && <Alert tone="danger">{problem}</Alert>}
            <Button type="submit" disabled={blocked || start.isPending}><GraduationCap className="h-4 w-4" aria-hidden="true" /> {start.isPending ? "Starting…" : `Start ${kind === "diagnostic" ? "diagnostic test" : kind === "revision" ? "revision" : mode === "assessment" ? "assessment" : "quiz"}${kind !== "standard" && mode === "assessment" ? " (assessment)" : ""}`}</Button>
          </form>
        </Card>
      </section>

      {revision.data && (revision.data.wrong.length > 0 || revision.data.shaky_topics.length > 0) && (
        <section aria-labelledby="rev-h">
          <h2 id="rev-h" className="mb-1 flex items-center gap-2 text-lg font-bold"><RotateCcw className="h-5 w-5" aria-hidden="true" /> Revision</h2>
          <p className="mb-3 text-sm text-muted">Questions whose latest answer was wrong, with the right answer. Choose <b>Revision quiz</b> above to be asked them again.</p>
          {revision.data.shaky_topics.length > 0 && (
            <p className="mb-3 text-sm">Shaky topics: {revision.data.shaky_topics.map((t) => `${t.name} (${Math.round(t.confidence * 100)}% confidence)`).join(", ")}.</p>
          )}
          <ul className="space-y-2">
            {revision.data.wrong.slice(0, 8).map((w) => (
              <li key={w.item_id}>
                <Card className="p-3 text-sm">
                  <p className="break-anywhere font-semibold">{w.question}</p>
                  {w.topic && <p className="break-anywhere text-xs text-muted">{w.topic}</p>}
                  {w.chosen_index !== null && <p className="break-anywhere mt-1 text-danger">You chose {String.fromCharCode(65 + w.chosen_index)}: {w.options[w.chosen_index]}</p>}
                  <p className="break-anywhere mt-1 text-success">Right answer {String.fromCharCode(65 + w.answer_index)}: {w.options[w.answer_index]}</p>
                  {w.explanation && <p className="break-anywhere mt-1 text-muted">{w.explanation}</p>}
                </Card>
              </li>
            ))}
          </ul>
          {revision.data.wrong.length > 8 && <p className="mt-2 text-sm text-muted">and {revision.data.wrong.length - 8} more.</p>}
        </section>
      )}

      {data.weak_topics.length > 0 && (
        <section aria-labelledby="weak-h">
          <h2 id="weak-h" className="mb-2 text-lg font-bold">Worth another look</h2>
          <ul className="space-y-2">
            {data.weak_topics.map((w) => (
              <li key={w.topic_id}><Card className="p-3 text-sm"><b className="break-anywhere">{w.name}</b> · {w.correct} of {w.answered} answered correctly</Card></li>
            ))}
          </ul>
        </section>
      )}

      {data.attempts.length > 0 && (
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="mb-2 text-lg font-bold">Recent quizzes</h2>
          <ul className="space-y-2">
            {data.attempts.map((a) => (
              <li key={a.id}>
                <Card className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="font-semibold">{when(a.started_at)}</span>
                  <span>{a.correct} of {a.answered} correct</span>
                  <Badge tone={a.active ? "warning" : "neutral"}>{a.active ? "In progress" : "Finished"}</Badge>
                  {a.mode === "assessment" && <Badge>Assessment</Badge>}
                  {a.kind && a.kind !== "standard" && <Badge>{a.kind === "diagnostic" ? "Diagnostic" : "Revision"}</Badge>}
                  <Link className="ml-auto inline-flex min-h-11 items-center" href={a.active ? `/subjects/${id}/quiz/${a.id}` : `/subjects/${id}/quiz/${a.id}/result`}>{a.active ? "Continue" : "See answers"}</Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
