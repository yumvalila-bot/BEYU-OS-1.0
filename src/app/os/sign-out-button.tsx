"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton({ className }: { className?: string } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/v1/auth/logout", {
              method: "POST",
            });
            if (!response.ok) throw new Error("logout request rejected");
            router.replace("/");
            router.refresh();
          } catch {
            setBusy(false);
            setError("Sign out could not be completed. Please try again.");
          }
        }}
        disabled={busy}
        className={
          className ??
          "rounded-md border border-white/20 px-2 py-1 text-[10.5px] text-white/70 transition hover:border-[#d4af37]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <span
          className="text-[11px] text-rose-600 dark:text-rose-300"
          role="alert"
        >
          {error}
        </span>
      )}
    </>
  );
}
