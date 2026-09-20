"use client";
import { WifiOff } from "lucide-react";

/** Shown by the service worker when a page that was never opened before is requested without a connection. */
export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto mt-24 max-w-md rounded-lg border border-border bg-surface p-8 text-center">
      <WifiOff className="mx-auto h-10 w-10 text-muted" aria-hidden="true" />
      <h1 className="mt-3 text-xl font-bold">You are offline</h1>
      <p className="mt-2 text-sm text-muted">This page has not been saved on this device yet. Pages and materials you opened before are still available. Asking, quizzes and saving need a connection.</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-4 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Try again</button>
    </main>
  );
}
