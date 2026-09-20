"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { SECTIONS } from "@/components/nexus/nav-data";
import { getSubject, keys } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/nexus/shell";
import { LevelPrompt } from "@/components/nexus/level-prompt";
import { DeleteSubject, EditSubject } from "@/components/nexus/subject-actions";
import { Skeleton } from "@/components/ui/primitives";

const TABS = SECTIONS;

export default function SubjectLayout({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const { data: subject, isPending, error, refetch } = useQuery({ queryKey: keys.subject(id), queryFn: () => getSubject(id) });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) return <Skeleton className="h-24 w-full" />;
  const base = `/subjects/${id}`;
  const active = (slug) => pathname === `${base}/${slug}` || pathname.startsWith(`${base}/${slug}/`);

  return (
    <div>
      <Link href="/subjects" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm no-underline hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All subjects
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-anywhere text-2xl font-bold">{subject.name}</h1>
          {subject.description && <p className="break-anywhere mt-1 text-sm text-muted">{subject.description}</p>}
        </div>
        <div className="no-print flex gap-2"><EditSubject subject={subject} /><DeleteSubject subject={subject} redirect /></div>
      </div>

      {/* Tablet and desktop: tabs under the title */}
      <nav aria-label="Subject sections" className="mt-4 hidden overflow-x-auto border-b border-border sm:block">
        <ul className="-mb-px flex gap-1 whitespace-nowrap">
          {TABS.map(({ slug, label, Icon }) => (
            <li key={slug}>
              <Link
                href={`${base}/${slug}`}
                aria-current={active(slug) ? "page" : undefined}
                className={cn("inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold no-underline", active(slug) ? "border-primary text-link" : "border-transparent text-muted hover:text-foreground")}
              >
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Phones: a bottom tab bar */}
      <nav aria-label="Subject sections" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
        <ul className="flex overflow-x-auto">
          {TABS.map(({ slug, label, Icon }) => (
            <li key={slug} className="shrink-0">
              <Link
                href={`${base}/${slug}`}
                aria-current={active(slug) ? "page" : undefined}
                className={cn("flex min-h-14 min-w-[4.6rem] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold no-underline", active(slug) ? "border-t-2 border-primary text-link" : "text-muted")}
              >
                <Icon className="h-5 w-5" aria-hidden="true" /> {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6">
        {/\/(materials|ask|notes|practice)$/.test(pathname) && <LevelPrompt subject={subject} />}
        {children}
      </div>
    </div>
  );
}
