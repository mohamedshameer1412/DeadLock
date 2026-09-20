"use client";
import { useEffect } from "react";

/** Shown instead of Next's bare "Application error" page. A page left open across an update fails to load its scripts: reload fixes it. */
export default function AppError({ error, reset }) {
  const stale = /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i.test(`${error?.name} ${error?.message}`);
  useEffect(() => {
    if (!stale) return;
    try {
      if (sessionStorage.getItem("nexus.reloaded") !== "1") {
        sessionStorage.setItem("nexus.reloaded", "1");
        window.location.reload();
      }
    } catch {}
  }, [stale]);
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-surface p-8 text-center">
      <h1 className="text-xl font-bold">{stale ? "Nexus was updated" : "Something went wrong"}</h1>
      <p className="mt-2 text-sm text-muted">{stale ? "This page was opened before an update. Reload to continue." : "The page hit an unexpected error. Your data is safe."}</p>
      {error?.digest && <p className="mt-1 text-xs text-muted">Reference: {error.digest}</p>}
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Reload</button>
        {!stale && <button type="button" onClick={reset} className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold">Try again</button>}
      </div>
    </div>
  );
}
