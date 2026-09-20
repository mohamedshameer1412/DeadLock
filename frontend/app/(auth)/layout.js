import { Logo } from "@/components/nexus/shell";

export default function AuthLayout({ children }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 flex justify-center">
        <Logo />
      </div>
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">{children}</div>
      <p className="mt-4 text-center text-xs text-muted">Your subjects, materials and progress are private to your account.</p>
    </main>
  );
}
