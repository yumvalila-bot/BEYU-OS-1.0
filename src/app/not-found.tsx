import Link from "next/link";
import { BeyuOsLogo } from "@/components/beyu-os-logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#eef5fd] px-6 py-12 text-[#0B1F4D]">
      <div className="w-full max-w-md rounded-[26px] bg-white p-8 text-center shadow-[0_20px_50px_-30px_rgba(11,31,77,0.5)] ring-1 ring-[#0B1F4D]/10">
        <span className="inline-flex rounded-2xl bg-[#eef5fd] p-3 ring-1 ring-[#0B1F4D]/10">
          <BeyuOsLogo size={56} ariaLabel="BEYU OS" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[#0B1F4D]">Page Not Found</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#5b6b85]">
          The requested resource does not exist or has been moved within the BEYU ecosystem.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0B1F4D] px-5 text-[13px] font-semibold text-white transition hover:bg-[#132a5c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a017]"
          >
            Return to BEYU Home
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#0B1F4D]/20 bg-transparent px-5 text-[13px] font-semibold text-[#0B1F4D] transition hover:bg-[#0B1F4D]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a017]"
          >
            Sign In to Permitted Workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
