import Link from "next/link";
import { highlightParts, pageLabel } from "@/lib/utils";
import { Card } from "@/components/ui/primitives";

/** Text with the matched words marked. Rendered as React nodes (never as HTML), so document text cannot inject anything. */
export function Highlighted({ text, terms }) {
  if (!terms?.length) return text;
  return highlightParts(text, terms).map((p) => (p.mark ? <mark key={p.key}>{p.text}</mark> : <span key={p.key}>{p.text}</span>));
}

export function PassageCard({ subjectId, item, terms, weak }) {
  return (
    <Card>
      <p className="break-anywhere text-xs text-muted">
        <Link href={`/subjects/${subjectId}/materials/${item.document_id}`}>{item.document}</Link>
        {item.heading_path && <> · {item.heading_path}</>}
        {item.page_start != null && <> · {pageLabel(item.page_start, item.page_end)}</>}
        {item.matched.length > 0 && <> · matched: {item.matched.join(", ")}</>}
        {weak && <> · weaker match</>}
      </p>
      <p className="break-anywhere mt-1 whitespace-pre-wrap text-sm">
        <Highlighted text={item.text} terms={terms} />
      </p>
    </Card>
  );
}
