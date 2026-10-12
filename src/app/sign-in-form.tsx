"use client";

/**
 * THE ONE BEYU SIGN-IN FORM.
 *
 * Rendered by `src/app/page.tsx` (control plane) and by
 * `src/app/governed-sign-in.tsx` (every canonical destination). It posts to the
 * ONE credential endpoint `/api/v1/auth/login`, receives the ONE session cookie
 * policy, and is subject to the ONE MFA / rate-limit / audit path. There is no
 * destination-specific credential surface, no second identity provider and no
 * simulated success: a successful state is only ever the HTTP response the
 * server actually returned.
 *
 * SECURITY PROPERTIES THIS COMPONENT MUST KEEP (pinned by tests):
 *   • the request body is exactly `{ email, password, mfaCode }`;
 *   • the password lives in component memory for the lifetime of the attempt —
 *     it is never written to localStorage/sessionStorage/cookies, never logged;
 *   • the post-auth route is a SERVER-COMPUTED same-origin path (`landing`),
 *     re-validated here (`/^\/(?!\/)/`) so the form can never become an open
 *     redirector and never accepts a URL as an input;
 *   • the MFA step-up field is never removed: the server answers 428 /
 *     MFA_REQUIRED for an MFA-enrolled identity, and the field is then revealed
 *     and focused. MFA is not bypassed by presentation.
 *
 * PRESENTATION: the reference ("BEYU LOGIN PAGE .png") shows two inputs under a
 * padlock badge and "Welcome" — Username, Password, Forgot Password, Cancel and
 * Enter. The visible identifier label is "Username" because that is the
 * reference's wording; the field itself is the BEYU identity address the
 * canonical endpoint authenticates (email), which the helper text states rather
 * than leaving the user to guess.
 */
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EyeGlyph, EyeOffGlyph, LockGlyph, PersonGlyph } from "./login-surface";

export type BootstrapIdentity = { email: string; role: string };

/**
 * `landing` is the route to open after a successful sign-in, computed
 * SERVER-SIDE by the page from the trusted canonical host contract (`/os/health`
 * on `health.beyu.co.tz`, `/os` everywhere else) and passed in as a prop. It is
 * never read from the URL, a query string or any client-controlled input.
 *
 * `destinationName` is PRESENTATION ONLY — it names the canonical destination
 * that asked for this sign-in in the accessible name of the form and of the
 * submit control, and NOTHING else. It defaults to `BEYU OS` so a caller that
 * passes nothing renders exactly the control-plane form.
 */
export function SignInForm({
  identities = [],
  landing = "/os",
  destinationName = "BEYU OS",
  sessionExpired = false,
}: {
  identities?: BootstrapIdentity[];
  landing?: string;
  destinationName?: string;
  /**
   * True when the request carried a session cookie the server no longer honours
   * — expired, revoked, or an inactive user. Decided SERVER-SIDE from cookie
   * PRESENCE plus a null principal (`src/lib/session-state.ts`). Presentation
   * only: it grants nothing and never relaxes the form.
   */
  sessionExpired?: boolean;
}) {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const mfaRef = useRef<HTMLInputElement>(null);
  const emailHelpId = `${useId()}-email-help`;

  // Pre-filling a privileged username is a provisioning convenience, and in
  // production it is also a disclosure: the value is serialised into the
  // server-rendered HTML. Empty in production, pre-filled elsewhere.
  const [identifier, setIdentifier] = useState(identities[0]?.email ?? "");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaVisible, setMfaVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // A second click while the first attempt is in flight would consume rate
    // limit, mint a second audit trail and (on success) race the router.
    if (busy) return;

    // The canonical endpoint authenticates the BEYU identity address; the
    // reference's visible wording for it is "Username".
    const email = identifier.trim();
    if (!email) {
      setError("Enter your BEYU identity address to continue.");
      emailRef.current?.focus();
      return;
    }
    if (password.length < 8) {
      setError("Enter your password (at least 8 characters).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, mfaCode }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const code = json?.error?.code as string | undefined;
        // The server refuses to authenticate without the second factor: reveal
        // the step-up field and move focus to it. MFA remains ENFORCED — this
        // only stops the user having to guess that it is required.
        if (code === "MFA_REQUIRED" || code === "INVALID_MFA") {
          setMfaVisible(true);
          requestAnimationFrame(() => mfaRef.current?.focus());
        }
        setError(json?.error?.message ?? "Authentication failed. Check your details and try again.");
        return;
      }

      // Same-origin, server-computed route only (see `landing`): a single
      // leading slash, never a scheme-relative or absolute URL.
      router.push(/^\/(?!\/)/.test(landing) ? landing : "/os");
      router.refresh();
    } catch {
      setError("The control plane is unreachable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Cancel restores the form's initial state. It navigates nowhere: the only
   *  canonical address a cancel could reach is the page itself, and a redirect
   *  target must never be derived from user input. */
  function cancel() {
    setIdentifier(identities[0]?.email ?? "");
    setPassword("");
    setMfaCode("");
    setError(null);
    setShowPassword(false);
    emailRef.current?.focus();
  }

  const field =
    "h-12 w-full rounded-[13px] border border-[#d5e0ef] bg-white text-[14px] text-[#0B1F4D] placeholder:text-[#64748b] outline-none transition focus:border-[#0B1F4D] focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/35 disabled:opacity-60";
  const labelClass = "block text-[12.5px] font-semibold text-[#0B1F4D]";

  return (
    <form onSubmit={submit} aria-label={`Sign in to ${destinationName}`} aria-busy={busy} className="space-y-5">
      {sessionExpired && (
        /* A returning identity whose session lapsed is told so, instead of being
           shown a first-visit form. This is a STATE, not a form error, so it is a
           polite live region rather than the assertive `beyu-signin-error`
           region below — which stays reserved for an authentication failure. */
        <p
          role="status"
          className="rounded-[13px] border border-[#cfe0f4] bg-[#eef5fd] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#41527a]"
        >
          Your previous BEYU session has expired or was signed out. Sign in again to continue to{" "}
          {destinationName}.
        </p>
      )}

      <div>
        <label className={labelClass} htmlFor="beyu-signin-email">
          Username <span className="beyu-gold-ink" aria-hidden="true">:</span>
        </label>
        <div className="relative mt-1.5">
          <PersonGlyph className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-[#7b8ba3]" />
          <input
            id="beyu-signin-email"
            name="email"
            ref={emailRef}
            className={`${field} pl-11`}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Enter your username"
            aria-describedby={`${emailHelpId} beyu-signin-error`}
            disabled={busy}
            required
          />
        </div>
        <p id={emailHelpId} className="mt-1.5 text-[11px] text-[#5b6b85]">
          Use your BEYU identity address, for example name@beyu.os.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="beyu-signin-password">
          Password <span className="beyu-gold-ink" aria-hidden="true">:</span>
        </label>
        <div className="relative mt-1.5">
          <LockGlyph className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-[#7b8ba3]" />
          <input
            id="beyu-signin-password"
            name="password"
            className={`${field} pr-12 pl-11`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            aria-describedby="beyu-signin-error"
            disabled={busy}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-pressed={showPassword}
            aria-controls="beyu-signin-password"
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#5b6b85] transition hover:bg-[#eef5fd] focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/40 focus-visible:outline-none"
          >
            {showPassword ? <EyeOffGlyph className="h-5 w-5" /> : <EyeGlyph className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/*
        The step-up field is ALWAYS in the document: the sign-in contract pins
        `id="beyu-signin-mfa"`, `name="mfaCode"`, its label association, its
        `one-time-code` autocomplete and its help association in the
        server-rendered HTML, and the credential path must never be able to
        "lose" the second factor by presentation. It is hidden — not removed —
        until it is required (the server's own 428/MFA_REQUIRED answer) or asked
        for, and focus moves to it when it appears.
      */}
      <div hidden={!mfaVisible}>
        <div className="rounded-[13px] border border-[#cfe0f4] bg-[#f4f9ff] p-3.5">
          <label className={labelClass} htmlFor="beyu-signin-mfa">
            Step-up code (MFA) <span className="beyu-gold-ink" aria-hidden="true">:</span>
          </label>
          <input
            id="beyu-signin-mfa"
            name="mfaCode"
            ref={mfaRef}
            className={`${field} mt-1.5 tracking-[0.2em]`}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            aria-describedby="beyu-signin-mfa-help beyu-signin-error"
            disabled={busy}
          />
          <p id="beyu-signin-mfa-help" className="mt-1.5 text-[11px] leading-relaxed text-[#5b6b85]">
            Required by BEYU identity for enrolled accounts, and for every high-risk capability.
          </p>
        </div>
      </div>
      {!mfaVisible && (
        <div className="flex justify-start">
          <button
            type="button"
            onClick={() => {
              setMfaVisible(true);
              requestAnimationFrame(() => mfaRef.current?.focus());
            }}
            className="text-[11.5px] text-[#5b6b85] underline underline-offset-2 transition hover:text-[#0B1F4D] focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/40 focus-visible:outline-none"
          >
            I have a step-up (MFA) code
          </button>
        </div>
      )}

      <div className="flex justify-end">
        {/* Connects to the real governed recovery surface — never a dead link. */}
        <a
          href="/forgot-password"
          className="text-[12.5px] font-medium text-[#0B1F4D] underline underline-offset-[3px] transition hover:text-[#8A6A12] focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/40 focus-visible:outline-none"
        >
          Forgot Password?
        </a>
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
            ? "rounded-[13px] border border-[#e6b0b0] bg-[#fdf1f1] px-3.5 py-2.5 text-[12.5px] text-[#8c2b2b]"
            : undefined
        }
      >
        {error}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          aria-label="Cancel sign-in and clear the form"
          className="h-12 rounded-[12px] border border-[#0B1F4D] bg-white text-[14px] font-semibold text-[#0B1F4D] transition hover:bg-[#f2f7fe] focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/40 focus-visible:outline-none disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          aria-label={`Enter ${destinationName}`}
          className="h-12 rounded-[12px] bg-[#0B1F4D] text-[14px] font-semibold text-white transition hover:bg-[#132c62] focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/40 focus-visible:outline-none disabled:opacity-60"
        >
          {busy ? "Authenticating…" : "Enter"}
        </button>
      </div>

      {identities.length > 0 && (
        <div className="pt-1">
          <div className="beyu-kicker text-[#5b6b85]" id="beyu-signin-identities">
            Governed bootstrap identities
          </div>
          <div className="mt-2 grid gap-1" role="group" aria-labelledby="beyu-signin-identities">
            {identities.map((d) => (
              <button
                type="button"
                key={d.email}
                onClick={() => setIdentifier(d.email)}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-[11.5px] text-[#5b6b85] transition hover:bg-[#eef5fd] hover:text-[#0B1F4D]"
              >
                <span className="font-medium">{d.email}</span>
                <span className="text-[#8b99ad]">{d.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
