import type { Metadata } from "next";
/**
 * Health OS Entry Point
 *
 * This page serves as the entry point to Health OS from the BEYU OS control plane.
 * Health OS is a separate application surface that consumes canonical BEYU identity
 * through federation.
 *
 * Authorized users are redirected to `/health/os`, which serves the EXISTING
 * Health OS implementation (the `sectors/health` single-file SPA compiled by
 * `scripts/build-health-spa.mjs`). That route re-runs this exact gate
 * (canonical BEYU session + canonical identity federation link, fail-closed)
 * so a deep link cannot bypass it. Unauthenticated and unauthorized states are
 * rendered here with truthful availability copy.
 */

import { redirect } from "next/navigation";
import { resolvePrincipal } from "@/lib/session";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";
import { Icon } from "@/components/icons";
import { SignOutButton } from "../os/sign-out-button";

export const metadata: Metadata = { title: "Health OS" };

export default async function HealthOSPage() {
  const principal = await resolvePrincipal();

  // Unauthenticated → redirect to sign-in
  if (!principal) {
    redirect("/");
  }

  // Check Health OS authorization
  const healthAuth = await checkHealthOSAuthorization(principal.userId);

  if (!healthAuth.authorized) {
    const unavailable = healthAuth.reason === "AUTHORIZATION_SERVICE_UNAVAILABLE";
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <section aria-labelledby="health-access-title" className="max-w-md mx-auto text-center p-8">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0b1f4d] text-[#e7c45c]">
            <Icon name={unavailable ? "health" : "security"} className="h-8 w-8" />
          </span>
          <h1 id="health-access-title" className="text-3xl font-bold text-slate-900 mb-2">
            {unavailable ? "Health OS authorization unavailable" : "Health OS access denied"}
          </h1>
          <p className="text-slate-600 mb-6">
            {unavailable
              ? "Health authorization could not be verified, so access is failing closed."
              : "No active Health OS authorization link exists for this identity."}
          </p>
          <p className="text-sm text-slate-500 mb-6">
            {unavailable
              ? "This availability state does not prove that your canonical identity is unlinked. Try again after the Health federation service is restored."
              : "Health OS access requires a canonical identity link established through the BEYU identity federation system."}
          </p>
          <div className="flex gap-3 justify-center">
            <a
              href="/launcher"
              className="px-6 py-3 bg-slate-200 text-slate-900 rounded-lg hover:bg-slate-300 transition-colors"
            >
              Back to Launcher
            </a>
            <SignOutButton className="rounded-lg bg-slate-900 px-6 py-3 text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" />
          </div>
        </section>
      </main>
    );
  }

  // Health OS authorized — mount the EXISTING Health OS implementation.
  // `/health/os` serves the compiled sector SPA and re-runs this exact gate
  // (canonical session + federation link, fail-closed) on every request, so
  // this redirect never relaxes authority.
  redirect("/health/os");
}
