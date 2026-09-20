"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe } from "lucide-react";
import { api } from "@/lib/api";
import { check, Upload } from "@/lib/schemas";
import { keys } from "@/lib/queries";
import { friendlyError, plural } from "@/lib/utils";
import { Alert, Button, Input, Label } from "@/components/ui/primitives";

/** Add a web page as material. The server fetches it under strict rules (public web pages only) and keeps the readable text. */
export default function WebPageForm({ subjectId }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e) {
    e.preventDefault();
    setError("");
    if (!url.trim()) return setError("Paste a web address first.");
    setBusy(true);
    try {
      const r = check(Upload, await api(`/subjects/${subjectId}/materials/url`, { method: "POST", json: { url: url.trim() } }));
      if (r.duplicate) toast.info("That page is already in this subject.");
      else toast.success(`Added “${r.document.title}” (${plural(r.document.chunks, "passage")})`);
      setUrl("");
      await Promise.all([keys.docs(subjectId), keys.topics(subjectId), keys.subject(subjectId), keys.subjects].map((k) => qc.invalidateQueries({ queryKey: k })));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="mt-4 rounded-lg border border-border bg-surface p-4" aria-labelledby="web-h">
      <h3 id="web-h" className="flex items-center gap-2 font-semibold"><Globe className="h-5 w-5 text-link" aria-hidden="true" /> Or add a web page</h3>
      <p className="mt-1 text-xs text-muted">Public pages only (articles, documentation, lecture notes). Nexus keeps the readable text as it is today; later changes to the page are not tracked.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="page-url">Web address</Label>
          <Input id="page-url" type="url" inputMode="url" placeholder="https://en.wikipedia.org/wiki/Queue_(abstract_data_type)" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2000} autoComplete="off" />
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Fetching…" : "Add page"}</Button>
      </div>
      {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
    </form>
  );
}
