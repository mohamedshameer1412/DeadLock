"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { BookOpen, Bookmark, Briefcase, LayoutDashboard, LibraryBig, Search, User, X } from "lucide-react";
import { getSubjects, keys } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/nexus/logo";
import { SECTIONS } from "@/components/nexus/nav-data";

function Item({ href, Icon, label, active, compact, sub, onNavigate }) {
  return (
    <Link
      href={href} onClick={onNavigate} title={compact ? label : undefined} aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md text-sm no-underline",
        compact ? "w-11 justify-center" : sub ? "px-3 pl-9" : "px-3",
        active ? "bg-white font-bold text-[#1360B2] shadow-sm" : "text-white hover:bg-white hover:text-[#1360B2]")}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className={cn("break-anywhere", compact && "sr-only")}>{label}</span>
    </Link>
  );
}

/** The links themselves. `compact` = icons only (collapsed desktop sidebar). */
function NavLinks({ compact, onNavigate }) {
  const pathname = usePathname();
  const { data: subjects } = useQuery({ queryKey: keys.subjects, queryFn: getSubjects });
  const activeId = pathname.match(/^\/subjects\/(\d+)/)?.[1];
  const is = (href) => pathname === href;
  return (
    <nav aria-label="Main" className="flex flex-col gap-4 p-3">
      <ul className="space-y-1">
        <li><Item href="/dashboard" Icon={LayoutDashboard} label="Dashboard" active={is("/dashboard")} compact={compact} onNavigate={onNavigate} /></li>
        <li><Item href="/subjects" Icon={LibraryBig} label="All subjects" active={is("/subjects")} compact={compact} onNavigate={onNavigate} /></li>
        <li><Item href="/search" Icon={Search} label="Search materials" active={is("/search")} compact={compact} onNavigate={onNavigate} /></li>
        <li><Item href="/saved" Icon={Bookmark} label="Saved answers" active={is("/saved")} compact={compact} onNavigate={onNavigate} /></li>
        <li><Item href="/career" Icon={Briefcase} label="Career goals" active={pathname === "/career" || pathname.startsWith("/career/")} compact={compact} onNavigate={onNavigate} /></li>
      </ul>
      {!compact && subjects?.length > 0 && (
        <div>
          <p id="side-subjects" className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-white/80">Your subjects</p>
          <ul aria-labelledby="side-subjects" className="space-y-1">
            {subjects.map((s) => {
              const open = String(s.id) === activeId;
              return (
                <li key={s.id}>
                  <Item href={`/subjects/${s.id}/materials`} Icon={BookOpen} label={s.name} active={open && !SECTIONS.some((x) => pathname.startsWith(`/subjects/${s.id}/${x.slug}`))} onNavigate={onNavigate} />
                  {open && (
                    <ul className="mt-1 space-y-1">
                      {SECTIONS.map(({ slug, label, Icon }) => (
                        <li key={slug}><Item sub href={`/subjects/${s.id}/${slug}`} Icon={Icon} label={label} active={pathname === `/subjects/${s.id}/${slug}` || pathname.startsWith(`/subjects/${s.id}/${slug}/`)} onNavigate={onNavigate} /></li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ul className="space-y-1 border-t border-white/20 pt-3">
        <li><Item href="/account" Icon={User} label="Account" active={is("/account")} compact={compact} onNavigate={onNavigate} /></li>
      </ul>
    </nav>
  );
}

/** Desktop: fixed under the header, full width or icons only. */
export function DesktopSidebar({ collapsed }) {
  return (
    <aside id="app-sidebar" aria-label="Sidebar" className={cn("fixed bottom-0 left-0 top-14 z-20 overflow-y-auto bg-[#1360B2] text-white transition-[width] duration-150", collapsed ? "w-16" : "w-64")}>
      <NavLinks compact={collapsed} />
    </aside>
  );
}

/** Phones and tablets: a drawer over the page (focus is kept inside, Escape and the backdrop close it). */
export function MobileDrawer({ open, onOpenChange }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content id="app-sidebar" onCloseAutoFocus={(e) => { e.preventDefault(); document.getElementById("menu-toggle")?.focus(); }} className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-[#1360B2] text-white shadow-xl focus:outline-none">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/20 px-4">
            <DialogPrimitive.Title asChild><span><Logo /></span></DialogPrimitive.Title>
            <DialogPrimitive.Close className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-white hover:text-[#1360B2] text-white" aria-label="Close menu"><X className="h-5 w-5" aria-hidden="true" /></DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">Site navigation</DialogPrimitive.Description>
          <NavLinks onNavigate={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
