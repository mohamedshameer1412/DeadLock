"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Maximize, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { getAttempt, keys } from "@/lib/queries";
import { cn, friendlyError } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { useFaceWatch } from "@/lib/use-face-watch";
import { ErrorState } from "@/components/nexus/shell";
import { Alert, Button, Progress, Skeleton } from "@/components/ui/primitives";

const NO_COUNTS = { tab_switch: 0, full_screen_exit: 0, copy_attempt: 0, paste_attempt: 0 };
const LABELS = { tab_switch: "left the page", full_screen_exit: "left full screen", copy_attempt: "copy attempts", paste_attempt: "paste attempts" };

/**
 * Assessment mode only (the student chose it and accepted the notice).
 * Blocks copy, cut, paste, right-click and the matching shortcuts; counts leaving the page or full screen.
 * The browser can only report what it sees: this does not stop a second device or a photo of the screen.
 */
function useAssessment(id, aid, on, finished, onViolation) {
  const [counts, setCounts] = useState(NO_COUNTS);
  const [fullscreen, setFullscreen] = useState(false);
  const wasFull = useRef(false);
  const lastLeave = useRef(0);
  const violation = useRef(onViolation);
  violation.current = onViolation;

  useEffect(() => {
    if (!on) return;
    const armedAt = Date.now() + 2500; // page changes and permission prompts right at the start are not violations
    const record = (type, message) => {
      if (finished.current) return;
      setCounts((c) => ({ ...c, [type]: c[type] + 1 }));
      api(`/subjects/${id}/quiz/attempts/${aid}/events`, { method: "POST", json: { event_type: type } }).catch(() => {});
      if (message) toast.warning(message, { id: "assessment-block" });
    };
    const block = (e) => e.preventDefault();
    const onCopy = (e) => { e.preventDefault(); record("copy_attempt", "Copying is turned off during an assessment. This was counted."); };
    const onPaste = (e) => { e.preventDefault(); record("paste_attempt", "Pasting is turned off during an assessment. This was counted."); };
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "c" || k === "x" || k === "insert") { e.preventDefault(); record("copy_attempt", "Copying is turned off during an assessment. This was counted."); }
      else if (k === "v") { e.preventDefault(); record("paste_attempt", "Pasting is turned off during an assessment. This was counted."); }
      else if (["a", "p", "s", "u"].includes(k)) e.preventDefault(); // select all, print, save, view source
    };
    const leave = () => {
      const now = Date.now();
      if (now - lastLeave.current < 1500) return; // switching tabs fires both "hidden" and "blur": count it once
      lastLeave.current = now;
      if (now < armedAt) return;
      record("tab_switch", "You left the assessment page.");
      violation.current("tab_switch"); // the assessment ends at once
    };
    const onHidden = () => { if (document.hidden) leave(); };
    const onFull = () => {
      const now = !!document.fullscreenElement;
      setFullscreen(now);
      if (wasFull.current && !now && Date.now() >= armedAt) { record("full_screen_exit", "You left full screen."); violation.current("full_screen_exit"); }
      wasFull.current = now;
    };
    setFullscreen(!!document.fullscreenElement);
    wasFull.current = !!document.fullscreenElement;
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", leave);
    document.addEventListener("fullscreenchange", onFull);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", leave);
      document.removeEventListener("fullscreenchange", onFull);
    };
  }, [id, aid, on, finished]);

  const enterFullscreen = () => document.documentElement.requestFullscreen?.().catch(() => toast.error("Your browser did not allow full screen."));
  return { counts, fullscreen, enterFullscreen };
}

function Mcq({ id, aid, st, refresh }) {
  const [chosen, setChosen] = useState(null);
  const [problem, setProblem] = useState("");
  const t0 = useRef(Date.now());
  const changes = useRef(0);
  const it = st.item;
  const submit = useMutation({
    mutationFn: () => api(`/subjects/${id}/quiz/attempts/${aid}/answer`, {
      method: "POST", json: { answer_row_id: it.answer_row_id, item_id: it.item_id, chosen, response_time: (Date.now() - t0.current) / 1000, hesitations: changes.current },
    }),
    onSuccess: (r) => {
      if (r?.backtrack) toast.info(`Stepping back to the basics: ${r.backtrack.to.join(", ")}`, { id: "backtrack" });
      return refresh();
    },
    onError: (e) => setProblem(friendlyError(e)),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (chosen !== null) submit.mutate(); }}>
      {it.backtrack && (
        <Alert tone="info" className="mb-3">
          <b>Checking the basics.</b> A question about <b>{it.backtrack.from}</b> went wrong, so here is one from <b>{it.backtrack.topic}</b>, which it builds on.
        </Alert>
      )}
      <fieldset>
        <legend className="break-anywhere mb-4 text-lg font-semibold">{it.question}</legend>
        <div className="space-y-2">
          {it.options.map((opt, i) => (
            <label key={i} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-md border px-3 py-3 has-[:focus-visible]:outline-2 ${chosen === i ? "border-primary bg-accent" : "border-border bg-surface hover:bg-surface-2 shadow-sm"}`}>
              <input type="radio" name="choice" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={chosen === i} onChange={() => { if (chosen !== null) changes.current += 1; setChosen(i); }} />
              <span className="break-anywhere"><span className="font-semibold">{String.fromCharCode(65 + i)}.</span> {opt}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {problem && <Alert tone="danger" className="mt-3">{problem}</Alert>}
      <Button type="submit" className="mt-4 w-full sm:w-auto" disabled={chosen === null || submit.isPending}>{submit.isPending ? "Saving…" : st.position === st.total_questions ? "Finish quiz" : "Next question"}</Button>
    </form>
  );
}

export default function QuizRun() {
  const { id, aid } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const finished = useRef(false);
  const { data: st, error, isPending, refetch } = useQuery({
    queryKey: keys.attempt(id, aid), queryFn: () => getAttempt(id, aid), refetchOnWindowFocus: false, staleTime: Infinity, retry: false,
  });
  const assessment = st?.attempt.mode === "assessment"; // stored with the quiz, so resuming it keeps the same rules
  useTitle(assessment ? "Assessment" : "Quiz");

  // The assessment ends the moment a rule is broken: tell the server, then show the result of what was answered so far.
  const end = async (reason) => {
    if (finished.current) return;
    finished.current = true;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    try { await api(`/subjects/${id}/quiz/attempts/${aid}/terminate`, { method: "POST", json: { reason } }); } catch {}
    await qc.invalidateQueries({ queryKey: keys.quiz(id) });
    router.replace(`/subjects/${id}/quiz/${aid}/result`);
  };
  const guard = useAssessment(id, aid, assessment, finished, end);
  const face = useFaceWatch({ on: assessment, onViolation: end });
  useEffect(() => {
    if (st?.state !== "complete") return;
    finished.current = true; // leaving full screen now is not an event
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    qc.invalidateQueries({ queryKey: keys.quiz(id) });
    router.replace(`/subjects/${id}/quiz/${aid}/result`);
  }, [st?.state, id, aid, router, qc]);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.attempt(id, aid) });

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending || st.state === "complete") return <Skeleton className="h-48" />;
  const pct = Math.round(((st.position - 1) / st.total_questions) * 100);
  const total = Object.values(guard.counts).reduce((n, x) => n + x, 0);
  return (
    <div className={cn("mx-auto max-w-2xl", assessment && "select-none")}>
      {assessment && (
        <Alert tone="info" className="mb-4">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <b>Assessment mode:</b> the camera checks that your face is visible, and copy/paste is blocked. <b>The assessment ends at once</b> if you leave this page or full screen, or if no face (6 s) or more than one face (3 s) is seen. You agreed to this before starting.
              <span aria-live="polite" className="mt-1 block">
                Focus events so far: <b>{total}</b>
                {total > 0 && <> ({Object.entries(guard.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${LABELS[k]}`).join(", ")})</>}
              </span>
            </span>
          </span>
          {!guard.fullscreen && <Button size="sm" variant="secondary" className="mt-2" onClick={guard.enterFullscreen}><Maximize className="h-4 w-4" aria-hidden="true" /> Enter full screen</Button>}
        </Alert>
      )}
      {assessment && (
        <div className="fixed bottom-20 right-3 z-30 w-32 overflow-hidden rounded-lg border border-border bg-surface shadow-lg sm:bottom-4 sm:right-4 sm:w-40">
          <video ref={face.videoRef} muted playsInline className="aspect-[4/3] w-full -scale-x-100 object-cover" aria-hidden="true" />
          <p role="status" aria-live="polite" className={cn("flex items-center gap-1 px-2 py-1 text-xs font-semibold", face.faces === 1 && !face.secondsLeft ? "text-success" : "text-danger")}>
            <Camera className="h-3 w-3 shrink-0" aria-hidden="true" />
            {face.status === "error" ? face.problem
              : face.status !== "ready" ? "Starting camera…"
              : face.secondsLeft ? `${face.faces === 0 ? "No face" : "More than one face"}: ends in ${face.secondsLeft}s`
              : face.faces === 1 ? "Face detected" : "Checking…"}
          </p>
        </div>
      )}
      <div className="mb-4">
        <p className="text-sm font-semibold">Question {st.position} of {st.total_questions}</p>
        <Progress value={pct} aria-label="Quiz progress" className="mt-1" />
      </div>
      <Mcq key={st.item.answer_row_id} id={id} aid={aid} st={st} refresh={refresh} />
    </div>
  );
}
