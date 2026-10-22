import Link from "next/link";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { probeSchemaState } from "@/lib/health/schema-state";

/**
 * BEYU OS — governed "database release pending" screen.
 *
 * WHY THIS SCREEN EXISTS (evidence, 2026-10-12 and 2026-10-22)
 *   A database that has not applied a migration the running artifact reads
 *   makes the FIRST database statement of every authenticated request fail —
 *   `resolvePrincipal()` → `loadGrants()` → `role_assignments.global_scope`
 *   (SQLSTATE 42703). Before this screen, that failure reached the user as the
 *   route error boundary: a 500 whose copy is careful to say it is not an
 *   access decision, but which names no cause and offers no next step, on a
 *   surface that a genuine denial never uses. A release state was therefore
 *   indistinguishable, to the person suffering it, from a permissions problem.
 *
 *   `requirePrincipal()` now routes that one condition here. Everything else —
 *   an unreachable database, a refused privilege, an RLS violation, any other
 *   error — still fails closed as an error. This screen is not a fallback, not
 *   a degraded mode and not an authorization outcome: nothing is read on behalf
 *   of the caller and no capability is granted.
 *
 * WHAT IT MAY PUBLISH
 *   Only the two migration tags and the count that `GET /api/health/schema`
 *   already publishes unauthenticated — repository filenames, no tenant, no
 *   entity, no actor, no credential, no driver text, no SQLSTATE. It calls no
 *   authorization primitive and establishes no tenant context.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Database release pending — BEYU OS" };

export default async function DatabaseReleasePendingPage() {
  const schema = await probeSchemaState();
  const pending =
    schema.state === "BEHIND" || schema.state === "AHEAD" || schema.state === "UNKNOWN";

  return (
    <main className="beyu-panel mx-auto my-10 max-w-lg p-6">
      <BeyuOsLogo size={48} />
      <h1 className="mt-4 text-xl font-semibold">
        {pending ? "A governed database release is pending" : "No pending database release"}
      </h1>

      {pending ? (
        <>
          <p className="mt-2 beyu-muted">
            BEYU OS could not complete this request because the database has not yet applied the
            schema release this deployment requires.
          </p>
          <p className="mt-3 beyu-muted">
            This is a release state, not an access decision. Nothing was granted or removed, your
            permissions are unchanged, and signing in again will not change it. No data was read or
            written on your behalf.
          </p>

          <dl className="mt-4 space-y-1 text-[13px]">
            <div className="flex gap-2">
              <dt className="beyu-muted w-40 shrink-0">Schema state</dt>
              <dd className="font-mono break-all">{schema.state}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="beyu-muted w-40 shrink-0">Database release</dt>
              <dd className="font-mono break-all">{schema.appliedMigration ?? "unknown"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="beyu-muted w-40 shrink-0">Required by this build</dt>
              <dd className="font-mono break-all">{schema.expectedMigration ?? "unknown"}</dd>
            </div>
          </dl>

          <p className="mt-4 text-[12.5px] beyu-muted">
            Operators: the same facts are published unauthenticated at{" "}
            <span className="font-mono">GET /api/health/schema</span>. Apply the pending release
            through the governed database release pipeline, then reload this page.
          </p>
        </>
      ) : (
        <p className="mt-2 beyu-muted">
          The database is at the release this deployment requires. Nothing is pending — return to
          sign-in to continue.
        </p>
      )}

      <Link
        href="/"
        className="mt-5 inline-flex min-h-11 items-center rounded border px-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Return to sign-in
      </Link>
    </main>
  );
}
