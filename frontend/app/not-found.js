import Link from "next/link";
import { Button } from "@/components/ui/primitives";

export const metadata = { title: "Not found" };
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="mt-1 text-sm text-muted">That page does not exist, or it is not yours.</p>
      <Button asChild className="mt-4"><Link href="/subjects">Your subjects</Link></Button>
    </main>
  );
}
