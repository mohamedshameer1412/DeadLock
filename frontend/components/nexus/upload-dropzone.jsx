"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { uploadFile } from "@/lib/api";
import { check, Upload } from "@/lib/schemas";
import { keys } from "@/lib/queries";
import { friendlyError, cn, plural } from "@/lib/utils";
import { Alert, Progress } from "@/components/ui/primitives";

const MAX_MB = 20;

/** Accepts PDF, DOCX or TXT (choose or drop). One file at a time, with real upload progress and a per-file result. */
export default function UploadDropzone({ subjectId }) {
  const qc = useQueryClient();
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(null); // { name, pct }
  const [error, setError] = useState("");

  async function send(files) {
    setError("");
    for (const file of files) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`“${file.name}” is larger than ${MAX_MB} MB.`);
        continue;
      }
      setBusy({ name: file.name, pct: 0 });
      try {
        const r = check(Upload, await uploadFile(`/subjects/${subjectId}/materials`, file, (pct) => setBusy({ name: file.name, pct })));
        if (r.duplicate) toast.info(`“${r.document.title}” is already in this subject.`);
        else toast.success(`Added “${r.document.title}” (${plural(r.document.chunks, "passage")})`);
        await Promise.all([
          qc.invalidateQueries({ queryKey: keys.docs(subjectId) }),
          qc.invalidateQueries({ queryKey: keys.topics(subjectId) }),
          qc.invalidateQueries({ queryKey: keys.subject(subjectId) }),
          qc.invalidateQueries({ queryKey: keys.subjects }),
        ]);
      } catch (e) {
        setError(friendlyError(e));
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <label
        htmlFor="file-input"
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); send([...e.dataTransfer.files]); }}
        className={cn("flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center focus-within:outline-2", drag ? "border-primary bg-accent" : "border-border bg-surface hover:bg-surface-2")}
      >
        <UploadCloud className="h-8 w-8 text-link" aria-hidden="true" />
        <span className="font-semibold">Choose a file or drop it here</span>
        <span className="text-sm text-muted">PDF, Word (.docx) or text, up to {MAX_MB} MB</span>
        <input id="file-input" ref={input} type="file" className="sr-only" accept=".pdf,.docx,.txt,.md,text/plain,application/pdf" onChange={(e) => send([...e.target.files])} />
      </label>
      {busy && (
        <div className="mt-3" role="status" aria-live="polite">
          <p className="break-anywhere text-sm">Uploading “{busy.name}”… {busy.pct}%</p>
          <Progress value={busy.pct} aria-label="Upload progress" className="mt-1" />
        </div>
      )}
      {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
    </div>
  );
}
