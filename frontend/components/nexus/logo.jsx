export function Logo({ className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src="/logo.png" alt="Nexus Logo" className="h-10 w-auto object-contain" />
      <span className="text-xl font-bold tracking-tight text-white">Nexus</span>
    </span>
  );
}
