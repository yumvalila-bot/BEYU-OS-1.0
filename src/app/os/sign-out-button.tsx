"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        await fetch("/api/v1/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      disabled={busy}
      className="rounded-md border border-white/20 px-2 py-1 text-[10.5px] text-white/70 transition hover:border-[#d4af37]/60 hover:text-white"
    >
      {busy ? "…" : "Sign out"}
    </button>
  );
}
