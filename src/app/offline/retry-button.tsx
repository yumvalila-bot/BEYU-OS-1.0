"use client";

export function OfflineRetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--beyu-line)] bg-white px-5 text-[13px] font-semibold text-[#0B1F4D] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Try again
    </button>
  );
}
