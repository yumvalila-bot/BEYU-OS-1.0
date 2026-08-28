/**
 * Test credential separation (C-02 remediation).
 *
 * The governed-mutation unit/integration suites call BEYU domain services
 * directly (e.g. recordAudit, repository reads) WITHOUT the `guarded()` HTTP
 * tenant-context wrapper that the production runtime uses to establish
 * transaction-local Row Level Security scope. Under the non-superuser runtime
 * role those direct calls fail RLS `WITH CHECK`/`USING` because no tenant
 * context is set — a structural property of the unit suite, not a product bug.
 *
 * Therefore this setup file points the suite's `db` handle at a privileged TEST
 * role (BEYU_TEST_DATABASE_URL) so the regression suite runs as before.
 *
 * The RUNTIME role (DATABASE_URL / BEYU_RUNTIME_DATABASE_URL) is exercised by:
 *   - the production application (HTTP server started from .env),
 *   - the HTTP/E2E suite (server runs on the runtime role),
 *   - the dedicated adversarial RLS tests that connect explicitly as the runtime
 *     role to prove tenant/entity isolation at the database layer.
 *
 * This keeps the runtime role NON-SUPERUSER and RLS-bound while ensuring
 * nothing that previously passed regresses.
 */
if (process.env.BEYU_TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.BEYU_TEST_DATABASE_URL;
}
