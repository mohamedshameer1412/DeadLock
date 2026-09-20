"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { pageLabel, plural } from "@/lib/utils";
import { Alert, Badge, Card } from "@/components/ui/primitives";

export const STATUS = {
  pending: { label: "Working on it", tone: "neutral" },
  answered: { label: "Answered from your materials", tone: "success" },
  abstained: { label: "Not answered: nothing was guessed", tone: "warning" },
  extractive: { label: "No model: matching passages only", tone: "warning" },
  failed: { label: "Something went wrong", tone: "danger" },
};

export function StatusBadge({ status, kind }) {
  const s = kind === "conflict" && status === "answered" ? { label: "Your materials disagree", tone: "warning" } : STATUS[status] ?? { label: status, tone: "neutral" };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Shown while a background job runs: says what is happening, counts up, and tells the student they can leave. */
export function JobProgress({ createdAt, what }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 1000));
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-border bg-surface p-5">
      <p className="flex items-center gap-2 font-semibold">
        <Loader2 className="h-5 w-5 animate-spin text-link" aria-hidden="true" /> {what}
      </p>
      <p className="mt-1 text-sm text-muted">
        {secs} s so far. A model running on this computer can take a minute or two. You can leave this page; the answer will be here when you come back.
      </p>
    </div>
  );
}

/** [1], [2]… numbers for every distinct (passage, quote), in order of first use. */
export function numberCitations(claims) {
  const list = [];
  const index = new Map();
  for (const c of claims) for (const x of c.citations) {
    const key = `${x.passage_id}|${x.quote}`;
    if (!index.has(key)) { list.push(x); index.set(key, list.length); }
  }
  return { list, numberOf: (x) => index.get(`${x.passage_id}|${x.quote}`) };
}

function goTo(n) {
  const el = document.getElementById(`source-${n}`);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

export function Where({ x }) {
  return (
    <>
      {x.document}
      {x.heading_path && <> · section: {x.heading_path}</>}
      {x.page_start != null && <> · {pageLabel(x.page_start, x.page_end)}</>}
    </>
  );
}

export function AnswerView({ q }) {
  const claims = q.claims ?? [];
  const { list, numberOf } = numberCitations(claims);
  const conflict = q.kind === "conflict";
  return (
    <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-8">
      <div>
        <section aria-labelledby="answer-h">
          <h2 id="answer-h" className="text-lg font-bold">{conflict ? "Your materials disagree" : "Answer"}</h2>
          {conflict && <p className="mt-1 text-sm text-muted">Two passages say different things. Each side is shown with its own quote; Nexus does not pick a winner.</p>}
          <ol className="mt-3 list-decimal space-y-3 pl-6">
            {claims.map((c, i) => (
              <li key={i} className="break-anywhere">
                {c.text}
                {c.citations.map((x) => {
                  const n = numberOf(x);
                  return (
                    <button key={n} type="button" onClick={() => goTo(n)} aria-label={`Show source ${n}`} className="ml-1 inline-flex min-h-8 min-w-8 items-center justify-center rounded-md align-super text-xs font-bold text-link underline">
                      [{n}]
                    </button>
                  );
                })}
              </li>
            ))}
          </ol>
          {q.dropped > 0 && <Alert className="mt-3">{plural(q.dropped, "other statement")} the model wrote could not be verified against your materials and {q.dropped === 1 ? "was" : "were"} left out.</Alert>}
        </section>

        {q.explanation && (
          <section aria-labelledby="explain-h" className="mt-8">
            <h2 id="explain-h" className="text-lg font-bold">Explanation, step by step</h2>
            <Card className="mt-2">
              <p className="break-anywhere">{q.explanation}</p>
              <p className="mt-2 text-xs text-muted">The model&apos;s own reasoning. It passed simple checks (no invented numbers, follows the quotes) but is not verified word for word.</p>
            </Card>
          </section>
        )}

        {q.verification?.length > 0 && (
          <section aria-labelledby="verify-h" className="mt-8">
            <h2 id="verify-h" className="text-lg font-bold">Verification</h2>
            <ul className="mt-2 space-y-1">
              {q.verification.map((v) => (
                <li key={v} className="flex gap-2 text-sm text-success"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> <span>{v}</span></li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section aria-labelledby="sources-h" className="mt-8 lg:sticky lg:top-20 lg:mt-0">
        <h2 id="sources-h" className="text-lg font-bold">Sources and evidence</h2>
        <p className="mt-1 text-xs text-muted">Nexus checks that these exact words exist in your material. It cannot check that a statement reads them correctly, so read the quote.</p>
        <ul className="mt-3 space-y-3">
          {list.map((x, i) => (
            <li key={i}>
              <Card id={`source-${i + 1}`} tabIndex={-1} className="scroll-mt-24 focus:outline-2">
                <p className="break-anywhere text-xs text-muted"><b>[{i + 1}]</b> <Where x={x} /></p>
                <blockquote className="break-anywhere my-2 border-l-4 border-primary pl-3 text-sm">{x.quote}</blockquote>
                <p className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> These exact words were found in your material (checked by Nexus).</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Not answered / no model / failed: the reason, and the student's own passages exactly as stored. */
export function PassagesView({ q }) {
  const sources = q.sources ?? [];
  return (
    <div>
      {q.reason && <Alert>{q.reason}</Alert>}
      {sources.length > 0 && (
        <section aria-labelledby="closest-h" className="mt-6">
          <h2 id="closest-h" className="text-lg font-bold">{q.status === "extractive" ? "Passages that match" : "Closest passages"}</h2>
          <p className="mt-1 text-xs text-muted">These are your own words from your materials, shown exactly as stored.</p>
          <ul className="mt-3 space-y-3">
            {sources.map((s, i) => (
              <li key={i}>
                <Card>
                  <p className="break-anywhere text-xs text-muted"><Where x={s} />{s.matched.length > 0 && <> · matched: {s.matched.join(", ")}</>}</p>
                  <p className="break-anywhere mt-1 whitespace-pre-wrap text-sm">{s.text}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {q.status === "abstained" && <p className="mt-4 text-sm text-muted">Try different words, or upload material that covers this.</p>}
    </div>
  );
}
