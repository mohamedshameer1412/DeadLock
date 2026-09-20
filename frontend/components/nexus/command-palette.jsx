"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bookmark, CornerDownLeft, LayoutDashboard, LibraryBig, Search, User } from "lucide-react";
import { getSubjects, keys } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { SECTIONS } from "@/components/nexus/nav-data";

/** Ctrl+K (or ⌘K): jump to any page or subject section from the keyboard, or search all your materials. */
export function CommandPalette({ open, onOpenChange }) {
  const router = useRouter();
  const { data: subjects } = useQuery({ queryKey: keys.subjects, queryFn: getSubjects, enabled: open });
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef(null);

  const items = useMemo(() => {
    const all = [
      { label: "Dashboard", hint: "Page", href: "/dashboard", Icon: LayoutDashboard },
      { label: "All subjects", hint: "Page", href: "/subjects", Icon: LibraryBig },
      { label: "Saved answers", hint: "Page", href: "/saved", Icon: Bookmark },
      { label: "Account", hint: "Page", href: "/account", Icon: User },
    ];
    for (const s of subjects ?? []) {
      for (const { slug, label, Icon } of SECTIONS) all.push({ label: `${s.name}: ${label}`, hint: "Subject", href: `/subjects/${s.id}/${slug}`, Icon });
      all.push({ label: `${s.name}: Flashcards`, hint: "Subject", href: `/subjects/${s.id}/practice/flashcards`, Icon: SECTIONS[2].Icon });
      all.push({ label: `${s.name}: Report`, hint: "Subject", href: `/subjects/${s.id}/report`, Icon: SECTIONS[4].Icon });
    }
    const q = text.trim().toLowerCase();
    const found = q ? all.filter((i) => q.split(/\s+/).every((w) => i.label.toLowerCase().includes(w))) : all.slice(0, 12);
    const search = text.trim().length >= 2 ? [{ label: `Search all my materials for “${text.trim()}”`, hint: "Search", href: `/search?q=${encodeURIComponent(text.trim())}`, Icon: Search }] : [];
    return [...search, ...found].slice(0, 30);
  }, [subjects, text]);

  useEffect(() => { setActive(0); }, [text]);
  useEffect(() => { if (open) setText(""); }, [open]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [active]);

  const go = (item) => { onOpenChange(false); router.push(item.href); };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && items[active]) { e.preventDefault(); go(items[active]); }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[min(92vw,34rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-xl focus:outline-none">
          <DialogPrimitive.Title className="sr-only">Search and jump</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Type to filter pages and subjects, use the arrow keys, and press Enter.</DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
            <input
              autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
              role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[active] ? `palette-${active}` : undefined} aria-label="Search and jump"
              placeholder="Jump to a page or subject, or search your materials…" className="h-12 flex-1 bg-transparent text-base outline-none"
            />
          </div>
          <ul id="palette-list" role="listbox" ref={list} className="max-h-[50vh] overflow-y-auto p-1">
            {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches.</li>}
            {items.map((it, i) => (
              <li key={it.href + it.label} id={`palette-${i}`} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={() => go(it)}
                className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm", i === active ? "bg-background text-link" : "text-foreground")}>
                <it.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="break-anywhere flex-1">{it.label}</span>
                <span className="text-xs text-muted">{it.hint}</span>
                {i === active && <CornerDownLeft className="h-3 w-3 text-muted" aria-hidden="true" />}
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-3 py-2 text-xs text-muted">↑ ↓ to move · Enter to open · Esc to close</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
