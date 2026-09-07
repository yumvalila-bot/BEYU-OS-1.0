import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { getBootstrapStatus } from "@/lib/bootstrap/service";
import { EnrollmentForm } from "./enrollment-form";

export const dynamic = "force-dynamic";

/**
 * Secure first-administrator enrollment page.
 *
 * SERVER COMPONENT. It reads the coarse bootstrap status (never any credential)
 * and renders the appropriate state: not-configured, sealed, in-progress or the
 * live enrollment ceremony. All authorization and credential work happens
 * server-side through the /api/v1/auth/bootstrap/* endpoints; this page never
 * holds the bootstrap secret, a password, or an MFA secret.
 */
export default async function EnrollPage() {
  let status: Awaited<ReturnType<typeof getBootstrapStatus>>;
  try {
    status = await getBootstrapStatus();
  } catch {
    status = { state: "NOT_PREPARED", secretConfigured: false, enrollable: false };
  }

  return (
    <main className="beyu-shell min-h-screen text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
        <div className="flex items-center gap-3">
          <span className="inline-flex w-fit items-center justify-center rounded-xl bg-white p-2">
            <BeyuOsLogo size={40} ariaLabel="BEYU OS" />
          </span>
          <div>
            <div className="text-[17px] font-semibold">Administrator enrollment</div>
            <div className="text-[12px] text-white/60">One-time secure establishment of the first administrator</div>
          </div>
        </div>
        <div className="beyu-gold-rule my-6" />

        <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-7 backdrop-blur">
          <EnrollmentForm initialState={status} />
        </div>

        <p className="mt-6 text-[10.5px] leading-relaxed text-white/45">
          This flow is protected by an owner-controlled bootstrap secret provisioned in the deployment
          environment. It can be completed only once; after activation it is permanently sealed and cannot be
          reopened. Every step is recorded in the immutable audit ledger. No password or MFA secret is stored in
          plaintext, logged, or known to any AI system.
        </p>
      </div>
    </main>
  );
}
