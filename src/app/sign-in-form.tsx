"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEMO_IDENTITIES = [
  { email: "ceo@beyu.os", role: "Group Chief Executive" },
  { email: "cfo@beyu.os", role: "Group CFO — Finance OS authority" },
  { email: "governance@beyu.os", role: "Chief Governance Officer" },
  { email: "risk@beyu.os", role: "Chief Risk & Compliance" },
  { email: "family@beyu.os", role: "Family Office Principal" },
  { email: "auditor@beyu.os", role: "Internal Auditor (read-only)" },
];

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("ceo@beyu.os");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, mfaCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Authentication failed.");
        return;
      }
      router.push("/os");
      router.refresh();
    } catch {
      setError("The control plane is unreachable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-white/15 bg-[#050f22]/60 px-3 py-2.5 text-[13px] text-white placeholder-white/30 outline-none focus:border-[#d4af37]/70";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="beyu-kicker text-white/55">Identity</label>
        <input className={`${field} mt-1.5`} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required />
      </div>
      <div>
        <label className="beyu-kicker text-white/55">Password</label>
        <input className={`${field} mt-1.5`} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
      </div>
      <div>
        <label className="beyu-kicker text-white/55">Step-up code (MFA)</label>
        <input className={`${field} mt-1.5`} value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} inputMode="numeric" placeholder="6-digit authenticator code" />
        <p className="mt-1 text-[10.5px] text-white/40">Required for high-risk capabilities such as waterfall commitment and ownership changes.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">{error}</div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-[#d4af37] px-4 py-2.5 text-[13px] font-semibold text-[#0b1d3a] transition hover:bg-[#e2c25f] disabled:opacity-60"
      >
        {busy ? "Authenticating…" : "Enter BEYU OS"}
      </button>

      <div className="pt-1">
        <div className="beyu-kicker text-white/40">Governed bootstrap identities</div>
        <div className="mt-2 grid gap-1">
          {DEMO_IDENTITIES.map((d) => (
            <button
              type="button"
              key={d.email}
              onClick={() => setEmail(d.email)}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-[11.5px] text-white/60 transition hover:bg-white/5 hover:text-white"
            >
              <span className="font-medium">{d.email}</span>
              <span className="text-white/35">{d.role}</span>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
