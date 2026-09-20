import { EmptyState } from "@/components/nexus/shell";

/** Honest placeholder for tabs whose screens are built in a later phase (the backend for them already exists or is planned). */
export default function ComingNext({ title, phase, children }) {
  return (
    <EmptyState title={`${title} is coming in phase ${phase}`}>
      {children} Nexus is being built in stages; this tab is not usable yet.
    </EmptyState>
  );
}
