import Link from "next/link";
import { BeyuOsLogo } from "@/components/beyu-os-logo";

export default function NotFound() {
  return (
    <main className="beyu-panel mx-auto my-10 max-w-lg p-6">
      <BeyuOsLogo size={48} />
      <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
      <p className="mt-2 beyu-muted">This BEYU OS page could not be found.</p>
      <Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded border px-4 focus-visible:outline-2 focus-visible:outline-offset-2">BEYU OS home</Link>
    </main>
  );
}
