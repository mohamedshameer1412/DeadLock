"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, GraduationCap, ListChecks, MessageCircleQuestion, Target } from "lucide-react";
import { getDashboard, keys } from "@/lib/queries";
import { plural } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { ActivityChart, ChartCard, Donut, HBars, Stat, StackedBar, TrendChart } from "@/components/nexus/charts";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Button, Skeleton } from "@/components/ui/primitives";

const pct = (c, n) => (n ? Math.round((100 * c) / n) : null);
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");
const Nothing = ({ children }) => <p className="rounded-md bg-surface-2 p-4 text-sm text-muted">{children}</p>;

export default function DashboardPage() {
  useTitle("Dashboard");
  const { data: d, error, isPending, refetch } = useQuery({ queryKey: keys.dashboard, queryFn: getDashboard });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;
  const t = d.totals;
  if (t.subjects === 0) {
    return (
      <EmptyState title="Your dashboard is empty" action={<Button asChild><Link href="/subjects">Create a subject</Link></Button>}>
        Charts appear here once you have a subject, some material, and have asked or practised.
      </EmptyState>
    );
  }
  const accuracy = pct(t.correct, t.answered);
  const trend = d.quiz_trend.map((q) => ({ id: q.attempt_id, pct: pct(q.correct, q.answered), label: shortDate(q.finished_at), detail: `${q.correct} of ${q.answered} in ${q.subject}` }));
  const ts = d.topic_states;
  const topicTotal = ts.mastered + ts.learning + ts.weak + ts.unknown;
  const o = d.question_outcomes;
  const outcomeTotal = o.answered + o.extractive + o.abstained + o.failed + o.pending;
  const firstQuiz = d.subjects.find((s) => s.practice_questions > 0) ?? d.subjects[0];
  const activityTotal = d.activity.reduce((n, x) => n + x.asked + x.answered, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">Everything here is counted from your own questions, quizzes and materials. Nothing is estimated for you.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Subjects" value={t.subjects} Icon={BookOpen} />
        <Stat label="Materials" value={t.materials} Icon={FileText} />
        <Stat label="Questions asked" value={t.questions} Icon={MessageCircleQuestion} />
        <Stat label="Practice questions" value={t.practice_questions} Icon={ListChecks} />
        <Stat label="Quizzes taken" value={t.quizzes} Icon={GraduationCap} />
        <Stat label="Quiz accuracy" value={accuracy === null ? "–" : `${accuracy}%`} hint={t.answered ? `${t.correct} of ${t.answered} answers` : "no quiz answers yet"} Icon={Target} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          id="activity" className="lg:col-span-2" title="Activity, last 14 days" description="Questions you asked and quiz answers you gave, per day."
          summary={`Activity over 14 days: ${d.activity.reduce((n, x) => n + x.asked, 0)} questions asked and ${d.activity.reduce((n, x) => n + x.answered, 0)} quiz answers.`}
          table={{ head: ["Day", "Questions asked", "Quiz answers"], rows: d.activity.map((x) => [x.date, x.asked, x.answered]) }}
        >
          {activityTotal === 0 ? <Nothing>No activity in the last 14 days. Ask a question or take a quiz and it shows up here.</Nothing> : (
            <ActivityChart days={d.activity} series={[{ key: "asked", label: "Questions asked", swatch: "bg-primary" }, { key: "answered", label: "Quiz answers", swatch: "bg-success" }]} />
          )}
        </ChartCard>

        <ChartCard
          id="topics" title="Topic strength" description="From your scored quiz answers."
          summary={`${topicTotal} topics: ${ts.mastered} strong, ${ts.learning} getting there, ${ts.weak} need work, ${ts.unknown} not tried yet.`}
          table={{ head: ["State", "Topics"], rows: [["Strong", ts.mastered], ["Getting there", ts.learning], ["Needs work", ts.weak], ["Not tried yet", ts.unknown]] }}
        >
          {topicTotal === 0 ? <Nothing>No topics yet. Upload material and Nexus finds them.</Nothing> : (
            <Donut centre={topicTotal} centreLabel={topicTotal === 1 ? "topic" : "topics"} segments={[
              { label: "Strong", value: ts.mastered, stroke: "stroke-success", swatch: "bg-success" },
              { label: "Getting there", value: ts.learning, stroke: "stroke-primary", swatch: "bg-primary" },
              { label: "Needs work", value: ts.weak, stroke: "stroke-danger", swatch: "bg-danger" },
              { label: "Not tried yet", value: ts.unknown, stroke: "stroke-muted", swatch: "bg-muted" },
            ]} />
          )}
        </ChartCard>

        <ChartCard
          id="trend" className="lg:col-span-2" title="Quiz scores over time" description={`Your last ${plural(trend.length || 0, "finished quiz", "finished quizzes")}, oldest to newest.`}
          summary={trend.length ? `Scores: ${trend.map((p) => `${p.pct}%`).join(", ")}.` : "No finished quizzes yet."}
          table={trend.length ? { head: ["Finished", "Subject and result", "Score"], rows: trend.map((p) => [p.label, p.detail, `${p.pct}%`]) } : undefined}
        >
          {trend.length === 0 ? (
            <Nothing>No finished quizzes yet. <Link href={`/subjects/${firstQuiz.id}/quiz`}>Take a quiz</Link> and your scores are plotted here.</Nothing>
          ) : <TrendChart points={trend} />}
        </ChartCard>

        <ChartCard
          id="subjects" title="Accuracy by subject" description="Correct quiz answers, per subject."
          summary={d.subjects.map((s) => `${s.name}: ${pct(s.correct, s.answered) === null ? "no answers yet" : `${pct(s.correct, s.answered)}%`}`).join("; ")}
          table={{ head: ["Subject", "Correct", "Answered", "Materials", "Questions", "Practice questions"], rows: d.subjects.map((s) => [s.name, s.correct, s.answered, s.materials, s.questions, s.practice_questions]) }}
        >
          <HBars rows={d.subjects.map((s) => ({ key: s.id, label: s.name, value: pct(s.correct, s.answered), detail: `${plural(s.materials, "material")} · ${plural(s.practice_questions, "practice question")}` }))} />
        </ChartCard>

        <ChartCard
          id="outcomes" className="lg:col-span-2" title="How your questions were answered" description="Nexus answers only from your materials, and says so when it cannot."
          summary={outcomeTotal ? `${o.answered} answered from materials, ${o.extractive} matching passages only, ${o.abstained} not answered, ${o.failed} failed, ${o.pending} in progress.` : "No questions asked yet."}
          table={{ head: ["Result", "Questions"], rows: [["Answered from your materials", o.answered], ["Matching passages only (no model)", o.extractive], ["Not answered: nothing was guessed", o.abstained], ["Something went wrong", o.failed], ["Still working", o.pending]] }}
        >
          {outcomeTotal === 0 ? <Nothing>No questions yet. Ask one in the Ask tab of a subject.</Nothing> : (
            <>
              <StackedBar parts={[
                { label: "Answered from materials", value: o.answered, swatch: "bg-success" },
                { label: "Passages only", value: o.extractive, swatch: "bg-primary" },
                { label: "Not answered", value: o.abstained, swatch: "bg-warning" },
                { label: "Failed", value: o.failed, swatch: "bg-danger" },
                { label: "In progress", value: o.pending, swatch: "bg-muted" },
              ]} />
              {(d.feedback.helpful > 0 || d.feedback.wrong > 0) && <p className="mt-3 text-sm text-muted">Your feedback on answers: <b>{d.feedback.helpful}</b> helpful, <b>{d.feedback.wrong}</b> marked wrong.</p>}
            </>
          )}
        </ChartCard>

        <section aria-labelledby="weak-h" className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 id="weak-h" className="text-base font-bold">Worth another look</h2>
          <p className="mt-0.5 text-sm text-muted">Topics with the lowest scores (at least 2 answers).</p>
          {d.weak_topics.length === 0 ? <div className="mt-4"><Nothing>Nothing to flag yet.</Nothing></div> : (
            <ul className="mt-3 space-y-3">
              {d.weak_topics.map((w) => (
                <li key={`${w.subject_id}-${w.topic_id}`} className="text-sm">
                  <p className="break-anywhere font-semibold">{w.name}</p>
                  <p className="break-anywhere text-xs text-muted">{w.subject} · {w.correct} of {w.answered} correct ({Math.round(w.mastery * 100)}%)</p>
                  <Link href={`/subjects/${w.subject_id}/practice`} className="inline-flex min-h-11 items-center">Practise this subject</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
