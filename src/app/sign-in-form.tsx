"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type BootstrapIdentity = { email: string; role: string };

/**
 * Sign-in form.
 *
 * The bootstrap-identity list is passed IN from a server component rather than
 * living here on purpose. This is a client component, so any literal written in
 * it is compiled into the shipped JavaScript bundle and is readable by anyone
 * who fetches the chunk — gating the RENDER is not enough, because the data is
 * still delivered. Keeping the list server-side means a production build never
 * contains those addresses at all.
 *
 * `identities` defaults to empty so the control fails CLOSED: if a caller ever
 * forgets the prop, the result is a missing convenience, never a disclosure.
 */
export function SignInForm({ identities = [] }: { identities?: BootstrapIdentity[] }) {
  const router = useRouter();
  // Pre-filling a privileged username is a provisioning convenience, and in
  // production it is also a disclosure: the value is serialised into the
  // server-rendered HTML, so the Group Chief Executive's mailbox is published
  // on an unauthenticated page. Empty in production, pre-filled elsewhere.
  const [email, setEmail] = useState(identities[0]?.email ?? "");
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
    "w-full rounded-lg border border-white/15 bg-[#050f22]/60 px-3 py-2.5 text-[13px] text-white placeholder-white/30 outline-none focus:border-[#d4af37]/70 focus-visible:ring-2 focus-visible:ring-[#d4af37]/60";

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Sign in to BEYU OS">
      <div>
        <label className="beyu-kicker text-white/55" htmlFor="beyu-signin-email">
          Identity
        </label>
        <input
          id="beyu-signin-email"
          name="email"
          className={`${field} mt-1.5`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="username"
          aria-describedby="beyu-signin-error"
          required
        />
      </div>
      <div>
        <label className="beyu-kicker text-white/55" htmlFor="beyu-signin-password">
          Password
        </label>
        <input
          id="beyu-signin-password"
          name="password"
          className={`${field} mt-1.5`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          aria-describedby="beyu-signin-error"
          required
        />
      </div>
      <div>
        <label className="beyu-kicker text-white/55" htmlFor="beyu-signin-mfa">
          Step-up code (MFA)
        </label>
        <input
          id="beyu-signin-mfa"
          name="mfaCode"
          className={`${field} mt-1.5`}
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-describedby="beyu-signin-mfa-help beyu-signin-error"
          placeholder="6-digit authenticator code"
        />
        <p id="beyu-signin-mfa-help" className="mt-1 text-[10.5px] text-white/40">
          Required for high-risk capabilities such as waterfall commitment and ownership changes.
        </p>
      </div>

      {/*
        The denial reason is announced to assistive technology. Without a live
        region a failed sign-in is invisible to a screen-reader user: focus never
        leaves the submit button and nothing is read out.
      */}
      <div
        id="beyu-signin-error"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className={
          error
            ? "rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200"
            : undefined
        }
      >
        {error}
      </div>

      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="w-full rounded-lg bg-[#d4af37] px-4 py-2.5 text-[13px] font-semibold text-[#0b1d3a] transition hover:bg-[#e2c25f] disabled:opacity-60"
      >
        {busy ? "Authenticating…" : "Enter BEYU OS"}
      </button>

      {identities.length > 0 && (
        <div className="pt-1">
          <div className="beyu-kicker text-white/40" id="beyu-signin-identities">
            Governed bootstrap identities
          </div>
          <div className="mt-2 grid gap-1" role="group" aria-labelledby="beyu-signin-identities">
            {identities.map((d) => (
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
      )}
    </form>
  );
}
