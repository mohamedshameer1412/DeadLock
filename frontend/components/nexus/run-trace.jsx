"use client";
import { CornerUpLeft, ShieldCheck, Sparkles, Search, Bot, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/primitives";

const ACTOR = { verifier: "Checker (code)", orchestrator: "Controller (code)", local: "Local model", cloud: "Cloud model", solver: "Independent reader" };
const SENT_BACK = new Set(["revision"]);
const REJECTED = new Set(["revision_stopped", "tier_failed", "model_error"]);

function Icon({ kind, sentBack }) {
  const cls = "h-4 w-4 shrink-0";
  if (sentBack) return <CornerUpLeft className={cn(cls, "text-danger")} aria-hidden="true" />;
  if (kind === "verification" || kind === "solver") return <ShieldCheck className={cn(cls, "text-success")} aria-hidden="true" />;
  if (kind === "retrieval" || kind === "topic" || kind === "request") return <Search className={cls} aria-hidden="true" />;
  if (kind === "draft") return <Bot className={cls} aria-hidden="true" />;
  if (REJECTED.has(kind)) return <XCircle className={cn(cls, "text-warning")} aria-hidden="true" />;
  return <Sparkles className={cls} aria-hidden="true" />;
}

/** The recorded steps of one run, in order, with every "sent back" step marked: the checker rejected a draft and the model was asked to redo it. */
export function RunTrace({ steps, title = "How this was produced", loop }) {
  if (!steps || steps.length === 0) return null;
  const back = steps.filter((s) => SENT_BACK.has(s.kind)).length;
  return (
    <section aria-labelledby="trace-h" className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="trace-h" className="text-lg font-bold">{title}</h2>
        {back > 0
          ? <Badge tone="danger"><CornerUpLeft className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Sent back {back} time{back === 1 ? "" : "s"}</Badge>
          : <Badge tone="success">Passed the checks the first time</Badge>}
        {loop?.rejected > 0 && <Badge tone="warning">{loop.rejected} rejected by the checker</Badge>}
      </div>
      <p className="mt-1 text-xs text-muted">A model writes a draft, code checks it against your material, and anything that fails is sent back to be redone. Every step below was recorded while it ran.</p>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => {
          const sentBack = SENT_BACK.has(s.kind);
          return (
            <li key={i} className={cn("flex items-start gap-2 rounded-md border p-2 text-sm", sentBack ? "border-danger bg-danger-bg" : "border-border")}>
              <Icon kind={s.kind} sentBack={sentBack} />
              <span className="break-anywhere flex-1">
                {sentBack && <b>Sent back: </b>}{s.text}
              </span>
              <span className="shrink-0 text-xs text-muted">{ACTOR[s.by] ?? s.by}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
