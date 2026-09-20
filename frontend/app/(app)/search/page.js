"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { getSearchAll, keys } from "@/lib/queries";
import { highlightParts, pageLabel, plural } from "@/lib/utils";
import { useTitle } from "@/lib/use-title";
import { EmptyState, ErrorState } from "@/components/nexus/shell";
import { Button, Card, Input, Skeleton } from "@/components/ui/primitives";

function Marked({ text, terms }) {
  return <>{highlightParts(text, terms).map((p, i) => (p.match ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}

function Results() {
  const router = useRouter();
  const q = (useSearchParams().get("q") ?? "").trim();
  const [text, setText] = useState(q);
  useTitle(q ? `Search: ${q}` : "Search");
  const { data, error, isFetching, refetch } = useQuery({ queryKey: keys.searchAll(q), queryFn: () => getSearchAll(q), enabled: q.length > 0 });
  return (
    <div>
      <h1 className="text-2xl font-bold">Search all your materials</h1>
      <form role="search" className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(text.trim())}`); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="Words to look for" placeholder="e.g. enqueue operation" maxLength={200} />
        <Button type="submit"><Search className="h-4 w-4" aria-hidden="true" /> Search</Button>
      </form>
      <div className="mt-5" aria-live="polite">
        {!q ? <p className="text-sm text-muted">Type the words you remember. Every subject of yours is searched; results link to the exact passage.</p>
          : error ? <ErrorState error={error} onRetry={refetch} />
          : isFetching && !data ? <Skeleton className="h-32" />
          : data && data.results.length === 0 ? <EmptyState title="Nothing found">None of your materials contain those words together. Try fewer or different words.</EmptyState>
          : data && (
            <>
              <p className="mb-3 text-sm text-muted">{plural(data.results.length, "passage")} found in {plural(new Set(data.results.map((r) => r.subject_id)).size, "subject")}.</p>
              <ul className="space-y-3">
                {data.results.map((r) => (
                  <li key={`${r.subject_id}-${r.passage_id}`}>
                    <Card>
                      <p className="break-anywhere text-xs text-muted">
                        <Link href={`/subjects/${r.subject_id}/materials`}>{r.subject}</Link> · {r.document}{r.heading_path && <> · section: {r.heading_path}</>}{r.page_start != null && <> · {pageLabel(r.page_start, r.page_end)}</>}
                      </p>
                      <p className="break-anywhere mt-1 whitespace-pre-wrap text-sm"><Marked text={r.text} terms={data.terms} /></p>
                      <Link className="mt-1 inline-flex min-h-11 items-center text-sm" href={`/subjects/${r.subject_id}/materials/${r.document_id}#passage-${r.passage_id}`}>Open in the document</Link>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return <Suspense fallback={<Skeleton className="h-32" />}><Results /></Suspense>;
}
