import type { Metadata } from "next";
import { LoginCard, LoginHero, LoginShell } from "../login-surface";
import { RecoveryRequestForm } from "./recovery-request-form";

export const metadata: Metadata = { title: "Password recovery" };

// The page reflects deployment/instance state through its API and must never be
// prerendered or cached: the same rule as `/`, `/sign-in` and `/enroll`.
export const dynamic = "force-dynamic";

/**
 * `/forgot-password` — the governed recovery entry the sign-in surface links to.
 *
 * It exists so "Forgot Password?" is never a decorative link, and it is
 * deliberately NOT a credential-reset page: BEYU identity has one password
 * verification path and one session authority, and this page adds neither. It
 * records a request (audited, rate-limited, account-agnostic) that an authorised
 * identity administrator acts on.
 *
 * The route is the same on every canonical host — it is not a destination
 * surface and grants nothing, so a hostile or unknown host gains nothing by
 * reaching it, and the browser stays on the canonical hostname throughout
 * (same-origin links only).
 */
export default function ForgotPasswordPage() {
  return (
    <LoginShell>
      <LoginHero />

      <div className="mx-auto mt-9 max-w-[560px]">
        <LoginCard
          titleId="beyu-recovery-title"
          heading="Password recovery"
          headingLevel="h1"
          subline={null}
          signInSubtitle="Governed recovery request"
          className="mt-0"
        >
          <p className="mb-4 text-[12.5px] leading-relaxed text-[#41527a]">
            Recovery is a governed administrative action, not a self-service reset: it is recorded in the immutable
            audit ledger, decided server-side, and performed by an authorised identity administrator under least
            privilege. No password, MFA secret or recovery code is ever emailed or displayed.
          </p>
          <RecoveryRequestForm />
          <p className="mt-5 text-[11px] leading-relaxed text-[#5b6b85]">
            Already have your credentials?{" "}
            <a
              href="/sign-in"
              className="text-[#0B1F4D] underline underline-offset-2 hover:text-[#8A6A12] focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/40 focus-visible:outline-none"
            >
              Return to sign in
            </a>
            .
          </p>
        </LoginCard>
      </div>
    </LoginShell>
  );
}
