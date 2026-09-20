"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, User } from "lucide-react";
import { DesktopSidebar, MobileDrawer } from "@/components/nexus/sidebar";
import { Logo } from "@/components/nexus/logo";
import { api, fetchSession } from "@/lib/api";
import { getSession, keys } from "@/lib/queries";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Skeleton } from "@/components/ui/primitives";

export { Logo };

export function useLogout() {
  const router = useRouter();
  const qc = useQueryClient();
  return async () => {
    try {
      await api("/logout", { method: "POST" });
    } catch {}
    qc.clear();
    await fetchSession(); // a fresh pre-session token for the next login
    router.replace("/login");
  };
}

const DESKTOP = "(min-width: 1024px)";
function useDesktop() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(DESKTOP); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

/** Signed-in frame: header + guard. Sends signed-out visitors to /login. */
export function AppShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const desktop = useDesktop();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("nexus.sidebar") === "collapsed"; } catch { return false; } });
  const [drawer, setDrawer] = useState(false);
  const logout = useLogout();
  useEffect(() => setDrawer(false), [pathname]);
  const toggle = () => {
    if (!desktop) return setDrawer((o) => !o);
    setCollapsed((c) => { try { localStorage.setItem("nexus.sidebar", c ? "expanded" : "collapsed"); } catch {} return !c; });
  };
  const expanded = desktop ? !collapsed : drawer;
  const { data: session, isPending } = useQuery({ queryKey: keys.session, queryFn: getSession, staleTime: 60_000 });

  useEffect(() => {
    if (session && !session.authenticated) router.replace("/login");
  }, [session, router]);

  if (isPending || !session?.authenticated) {
    return (
      <div className="mx-auto max-w-5xl p-4" aria-busy="true">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="mt-6 h-32 w-full" />
      </div>
    );
  }
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-[#1360B2] text-white shadow-md">
        <div className="flex h-14 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button id="menu-toggle" variant="ghost" size="icon" onClick={toggle} className="text-white hover:bg-white hover:text-[#1360B2]" aria-expanded={expanded} aria-controls="app-sidebar" aria-label={desktop ? (collapsed ? "Expand sidebar" : "Collapse sidebar") : "Open menu"}>
              {desktop ? (collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />) : <Menu className="h-5 w-5" aria-hidden="true" />}
            </Button>
            <Link href="/dashboard" aria-label="Nexus, dashboard" className="no-underline">
              <Logo />
            </Link>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`Account menu for ${session.user.username}`}>
                <User className="h-5 w-5" aria-hidden="true" />
                <span className="hidden max-w-32 truncate sm:inline">{session.user.username}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => router.push("/account")}>
                <User className="h-4 w-4" aria-hidden="true" /> Account
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={logout}>
                <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {desktop ? <DesktopSidebar collapsed={collapsed} /> : <MobileDrawer open={drawer} onOpenChange={setDrawer} />}
      <div className={collapsed ? "lg:pl-16" : "lg:pl-64"}>
        <main id="main" className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const gone = error?.status === 404;
  return (
    <div role="alert" className="rounded-lg border border-border bg-surface p-8 text-center">
      <h1 className="text-xl font-bold">{gone ? "Not found" : "Something went wrong"}</h1>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">
        {gone ? "That page does not exist, or it is not yours." : error?.message || "Please try again."}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        {!gone && onRetry && <Button onClick={onRetry}>Try again</Button>}
        <Button asChild variant="secondary">
          <Link href="/subjects">Your subjects</Link>
        </Button>
      </div>
    </div>
  );
}
