"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type BootstrapState = {
  state: "NOT_PREPARED" | "AVAILABLE" | "IN_PROGRESS" | "SEALED";
  secretConfigured: boolean;
  enrollable: boolean;
};

type MfaMaterial = {
  method: string;
  secret: string;
  otpauthUri: string;
  issuer: string;
  digits: number;
  period: number;
};

const field =
  "w-full rounded-lg border border-white/15 bg-[#050f22]/60 px-3 py-2.5 text-[13px] text-white placeholder-white/30 outline-none focus:border-[#d4af37]/70 focus-visible:ring-2 focus-visible:ring-[#d4af37]/60";

/**
 * Multi-step administrator enrollment ceremony (client UI).
 *
 * The client never sees or stores any long-lived secret: the enrollment token
 * is an httpOnly cookie set by the server. The MFA secret and recovery codes are
 * shown ONCE (returned by /begin) purely so the operator can capture them, then
 * are held only in component state for the duration of the ceremony.
 */
export function EnrollmentForm({ initialState }: { initialState: BootstrapState }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"intro" | "mfa" | "recovery" | "done">("intro");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [mfa, setMfa] = useState<MfaMaterial | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryAck, setRecoveryAck] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (!initialState.secretConfigured) {
    return (
      <Notice
        title="Enrollment not available"
        body="The owner-controlled bootstrap secret has not been provisioned for this deployment. An operator with access to the deployment platform must set BEYU_BOOTSTRAP_SECRET and redeploy before the first administrator can be enrolled."
      />
    );
  }
  if (initialState.state === "SEALED") {
    return (
      <Notice
        title="Administrator already enrolled"
        body="The first administrator has been established and the bootstrap is permanently sealed. Sign in from the main login page."
        action={{ label: "Go to sign in", onClick: () => router.push("/") }}
      />
    );
  }
  if (initialState.state === "NOT_PREPARED") {
    return (
      <Notice
        title="Enrollment not prepared"
        body="No administrator identity is prepared for enrollment on this deployment. An operator must run the bootstrap preparation step before enrollment can begin."
      />
    );
  }
  if (initialState.state === "IN_PROGRESS" && phase === "intro") {
    // A ceremony is live elsewhere; still allow this operator to attempt begin
    // (the server will reject if genuinely concurrent), but warn.
  }

  async function begin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setReasons([]);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/bootstrap/begin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bootstrapSecret, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Enrollment could not start.");
        if (Array.isArray(json?.error?.details)) setReasons(json.error.details);
        return;
      }
      setMfa(json.data.mfa);
      setRecoveryCodes(json.data.recoveryCodes ?? []);
      setEmail(json.data.email ?? "");
      // Do not keep the password/secret in memory beyond this point.
      setBootstrapSecret("");
      setPassword("");
      setConfirm("");
      setPhase("mfa");
    } catch {
      setError("The control plane is unreachable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/bootstrap/verify-mfa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "MFA verification failed.");
        return;
      }
      setCode("");
      setPhase("recovery");
    } catch {
      setError("The control plane is unreachable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/bootstrap/complete", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Enrollment could not be completed.");
        return;
      }
      setPhase("done");
    } catch {
      setError("The control plane is unreachable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <StepIndicator phase={phase} />

      {phase === "intro" && (
        <form onSubmit={begin} className="space-y-4" aria-label="Begin administrator enrollment">
          <p className="text-[12.5px] leading-relaxed text-white/70">
            Establish the first administrator. You will authorize with the deployment&apos;s bootstrap secret,
            set your own password, enroll an authenticator, and store recovery codes. No credential is created
            for you.
          </p>
          <div>
            <label className="beyu-kicker text-white/55" htmlFor="enroll-secret">Bootstrap secret</label>
            <input
              id="enroll-secret"
              className={`${field} mt-1.5`}
              value={bootstrapSecret}
              onChange={(e) => setBootstrapSecret(e.target.value)}
              type="password"
              autoComplete="off"
              required
            />
          </div>
          <div>
            <label className="beyu-kicker text-white/55" htmlFor="enroll-password">New password</label>
            <input
              id="enroll-password"
              className={`${field} mt-1.5`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              required
            />
            <p className="mt-1 text-[10.5px] text-white/40">
              At least 14 characters, mixing letters, numbers and symbols. Use a password manager.
            </p>
          </div>
          <div>
            <label className="beyu-kicker text-white/55" htmlFor="enroll-confirm">Confirm password</label>
            <input
              id="enroll-confirm"
              className={`${field} mt-1.5`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
          <ErrorBox error={error} reasons={reasons} />
          <SubmitButton busy={busy} label="Begin enrollment" busyLabel="Authorizing…" />
        </form>
      )}

      {phase === "mfa" && mfa && (
        <form onSubmit={verifyMfa} className="space-y-4" aria-label="Verify authenticator">
          <p className="text-[12.5px] leading-relaxed text-white/70">
            Add this secret to your authenticator app{email ? ` for ${email}` : ""}, then enter the 6-digit code
            it shows.
          </p>
          <div className="rounded-lg border border-white/12 bg-[#050f22]/50 p-4">
            <div className="beyu-kicker text-white/45">Manual entry key</div>
            <code className="mt-1 block break-all font-mono text-[13px] text-[#d4af37]">{mfa.secret}</code>
            <div className="mt-3 beyu-kicker text-white/45">otpauth URI</div>
            <code className="mt-1 block break-all font-mono text-[10.5px] text-white/60">{mfa.otpauthUri}</code>
          </div>
          <div>
            <label className="beyu-kicker text-white/55" htmlFor="enroll-mfa">Authenticator code</label>
            <input
              id="enroll-mfa"
              className={`${field} mt-1.5`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              required
            />
          </div>
          <ErrorBox error={error} reasons={[]} />
          <SubmitButton busy={busy} label="Verify authenticator" busyLabel="Verifying…" />
        </form>
      )}

      {phase === "recovery" && (
        <div className="space-y-4">
          <p className="text-[12.5px] leading-relaxed text-white/70">
            Store these single-use recovery codes somewhere safe. They are shown only once and let you sign in if
            you lose your authenticator. Each code works once.
          </p>
          <ul className="grid grid-cols-2 gap-2 rounded-lg border border-white/12 bg-[#050f22]/50 p-4">
            {recoveryCodes.map((c) => (
              <li key={c} className="font-mono text-[12.5px] text-[#d4af37]">{c}</li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-[12px] text-white/70">
            <input type="checkbox" checked={recoveryAck} onChange={(e) => setRecoveryAck(e.target.checked)} />
            I have securely stored these recovery codes.
          </label>
          <ErrorBox error={error} reasons={[]} />
          <button
            type="button"
            disabled={busy || !recoveryAck}
            onClick={complete}
            className="w-full rounded-lg bg-[#d4af37] px-4 py-2.5 text-[13px] font-semibold text-[#0b1d3a] transition hover:bg-[#e2c25f] disabled:opacity-60"
          >
            {busy ? "Activating…" : "Activate administrator & seal bootstrap"}
          </button>
        </div>
      )}

      {phase === "done" && (
        <Notice
          title="Administrator activated"
          body="The first administrator is established and the bootstrap is permanently sealed. Sign in with your identity, password and 6-digit authenticator code."
          action={{ label: "Go to sign in", onClick: () => router.push("/") }}
        />
      )}
    </div>
  );
}

function StepIndicator({ phase }: { phase: string }) {
  const steps = ["Authorize", "MFA", "Recovery", "Done"];
  const index = { intro: 0, mfa: 1, recovery: 2, done: 3 }[phase] ?? 0;
  return (
    <div className="flex gap-2" aria-hidden>
      {steps.map((s, i) => (
        <div
          key={s}
          className={`h-1 flex-1 rounded-full ${i <= index ? "bg-[#d4af37]" : "bg-white/12"}`}
        />
      ))}
    </div>
  );
}

function SubmitButton({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy}
      className="w-full rounded-lg bg-[#d4af37] px-4 py-2.5 text-[13px] font-semibold text-[#0b1d3a] transition hover:bg-[#e2c25f] disabled:opacity-60"
    >
      {busy ? busyLabel : label}
    </button>
  );
}

function ErrorBox({ error, reasons }: { error: string | null; reasons: string[] }) {
  if (!error && reasons.length === 0) return <div role="alert" aria-live="assertive" />;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200"
    >
      {error}
      {reasons.length > 0 && (
        <ul className="mt-1 list-disc pl-4">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Notice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="space-y-3">
      <div className="text-[15px] font-semibold text-[#d4af37]">{title}</div>
      <p className="text-[12.5px] leading-relaxed text-white/70">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-lg bg-[#d4af37] px-4 py-2.5 text-[13px] font-semibold text-[#0b1d3a] transition hover:bg-[#e2c25f]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
