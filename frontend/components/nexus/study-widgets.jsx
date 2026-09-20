"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Circle, Flame, Minus, Plus } from "lucide-react";
import { Card } from "@/components/ui/primitives";

/** Study streak (days in a row with any study) and a daily goal ring. The goal is a personal setting kept in this browser. */
export function StreakCard({ streak }) {
  const [goal, setGoal] = useState(() => {
    try { return Math.min(100, Math.max(1, Number(localStorage.getItem("nexus.goal")) || streak.goal)); } catch { return streak.goal; }
  });
  const change = (d) => setGoal((g) => {
    const n = Math.min(100, Math.max(1, g + d));
    try { localStorage.setItem("nexus.goal", String(n)); } catch {}
    return n;
  });
  const pct = Math.min(100, Math.round((streak.today / goal) * 100));
  const done = streak.today >= goal;
  return (
    <section aria-labelledby="streak-h" className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h2 id="streak-h" className="text-base font-bold">Study streak and daily goal</h2>
      <div className="mt-3 flex items-center gap-5">
        <div className="relative h-24 w-24 shrink-0" role="img" aria-label={`${streak.today} of ${goal} questions answered today`}>
          <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="21" cy="21" r="15.915" fill="none" strokeWidth="5" className="stroke-border" />
            <circle cx="21" cy="21" r="15.915" fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${pct} ${100 - pct}`} className={done ? "stroke-success" : "stroke-primary"} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-bold">{streak.today}</span><span className="text-xs text-muted">of {goal}</span></div>
        </div>
        <div className="min-w-0 text-sm">
          <p className="flex items-center gap-1 text-lg font-bold"><Flame className={`h-5 w-5 ${streak.days > 0 ? "text-warning" : "text-muted"}`} aria-hidden="true" /> {streak.days} {streak.days === 1 ? "day" : "days"}</p>
          <p className="text-muted">{done ? "Goal reached today. Well done." : streak.days > 0 ? "in a row. Answer today to keep it going." : "Answer a question today to start a streak."}</p>
          <div className="mt-2 flex items-center gap-1">
            <span className="text-xs text-muted">Daily goal</span>
            <button type="button" onClick={() => change(-5)} aria-label="Lower the daily goal" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-surface-2"><Minus className="h-4 w-4" aria-hidden="true" /></button>
            <b className="min-w-8 text-center">{goal}</b>
            <button type="button" onClick={() => change(5)} aria-label="Raise the daily goal" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-surface-2"><Plus className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <p className="mt-1 text-xs text-muted">Counts quiz answers and flashcards reviewed today (UTC).</p>
        </div>
      </div>
    </section>
  );
}

/** First-run guide. Disappears by itself once every step is done. */
export function Onboarding({ totals, firstSubjectId }) {
  const base = firstSubjectId ? `/subjects/${firstSubjectId}` : "/subjects";
  const steps = [
    { done: totals.subjects > 0, label: "Create a subject", href: "/subjects" },
    { done: totals.materials > 0, label: "Upload a PDF, Word or text file", href: `${base}/materials` },
    { done: totals.questions > 0, label: "Ask a question and check its sources", href: `${base}/ask` },
    { done: totals.practice_questions > 0, label: "Write practice questions", href: `${base}/practice` },
    { done: totals.quizzes > 0, label: "Take a diagnostic quiz to get confidence scores", href: `${base}/quiz` },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (left === 0) return null;
  return (
    <Card className="mt-6">
      <h2 className="text-base font-bold">Get started ({steps.length - left} of {steps.length} done)</h2>
      <ol className="mt-2 space-y-1">
        {steps.map((s) => (
          <li key={s.label} className="flex min-h-11 items-center gap-2 text-sm">
            {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Done" /> : <Circle className="h-5 w-5 shrink-0 text-muted" aria-label="Not done yet" />}
            {s.done ? <span className="text-muted line-through">{s.label}</span> : <Link href={s.href} className="font-semibold">{s.label}</Link>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
