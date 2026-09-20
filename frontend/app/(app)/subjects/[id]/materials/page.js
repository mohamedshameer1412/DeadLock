"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { getDocs, getSearch, getSubject, getTopics, keys } from "@/lib/queries";
import { useTitle } from "@/lib/use-title";
import { plural } from "@/lib/utils";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import UploadDropzone from "@/components/nexus/upload-dropzone";
import { PassageCard } from "@/components/nexus/passage";
import { Alert, Badge, Button, Card, Input, Skeleton } from "@/components/ui/primitives";

function Documents({ id }) {
  const { data, isPending, error, refetch } = useQuery({ queryKey: keys.docs(id), queryFn: () => getDocs(id) });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-24" />;
  if (data.length === 0) return <EmptyState title="No materials yet">Upload a PDF, a Word document or a text file to start.</EmptyState>;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.id}>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link href={`/subjects/${id}/materials/${d.id}`} className="break-anywhere text-base font-bold no-underline hover:underline">{d.title}</Link>
              <div className="flex flex-wrap gap-1.5">
                <Badge>{d.kind.toUpperCase()}</Badge>
                {d.pages ? <Badge>{plural(d.pages, "page")}</Badge> : null}
                <Badge>{plural(d.chunks, "passage")}</Badge>
                {d.status !== "parsed" && <Badge tone="warning">{d.status}</Badge>}
              </div>
            </div>
            <p className="break-anywhere mt-1 text-xs text-muted">{d.source}</p>
            {d.warnings.map((w) => <Alert key={w} className="mt-2">{w}</Alert>)}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Topics({ id }) {
  const { data } = useQuery({ queryKey: keys.topics(id), queryFn: () => getTopics(id) });
  if (!data?.length) return null;
  return (
    <section aria-labelledby="topics-h" className="mt-8">
      <h2 id="topics-h" className="mb-2 text-lg font-bold">Topics found</h2>
      <ul className="flex flex-wrap gap-2">
        {data.map((t) => <li key={t.id}><Badge className="break-anywhere">{t.path} · {plural(t.passages, "passage")}</Badge></li>)}
      </ul>
    </section>
  );
}

function SearchBox({ id }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const { data, isFetching, error } = useQuery({ queryKey: keys.search(id, q), queryFn: () => getSearch(id, q), enabled: q.length > 0 });
  const strong = data?.results.filter((r) => r.relevant) ?? [];
  const weak = data?.results.filter((r) => !r.relevant).slice(0, 3) ?? [];
  return (
    <section aria-labelledby="search-h" className="mt-8">
      <h2 id="search-h" className="mb-2 text-lg font-bold">Search your materials</h2>
      <form role="search" onSubmit={(e) => { e.preventDefault(); setQ(text.trim().slice(0, 200)); }} className="flex gap-2">
        <Input aria-label="Search your materials" placeholder="e.g. binary tree traversal" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" aria-label="Search"><Search className="h-5 w-5" aria-hidden="true" /><span className="hidden sm:inline">Search</span></Button>
      </form>
      <div className="mt-3 space-y-3" aria-live="polite">
        {error && <Alert tone="danger">{error.message}</Alert>}
        {q && isFetching && <Skeleton className="h-16" />}
        {data && !isFetching && data.results.length === 0 && <p className="text-sm text-muted">No passage in this subject matches. Nothing is guessed: try other words, or upload material that covers it.</p>}
        {data && !isFetching && strong.map((r) => <PassageCard key={r.passage_id} subjectId={id} item={r} terms={data.terms} />)}
        {data && !isFetching && strong.length === 0 && weak.length > 0 && <p className="text-sm text-muted">No passage matches most of your words. These contain only some of them, so they may not be about your topic:</p>}
        {data && !isFetching && weak.map((r) => <PassageCard key={r.passage_id} subjectId={id} item={r} terms={data.terms} weak />)}
      </div>
    </section>
  );
}

export default function MaterialsPage() {
  const { id } = useParams();
  const { data: subject } = useQuery({ queryKey: keys.subject(id), queryFn: () => getSubject(id) });
  useTitle("Materials", subject?.name);
  return (
    <div>
      <h2 className="mb-2 text-lg font-bold">Materials</h2>
      <UploadDropzone subjectId={id} />
      <div className="mt-4"><Documents id={id} /></div>
      <Topics id={id} />
      <SearchBox id={id} />
    </div>
  );
}
