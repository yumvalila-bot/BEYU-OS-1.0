/**
 * Surface governed-release failures as GitHub Actions annotations.
 *
 * WHY THIS EXISTS
 *   `migrate.ts`, `setup-db-role.ts` and `db-release.ts` all reported failure by
 *   writing a JSON blob to stderr and exiting 1. Inside the `deploy` job that
 *   produces exactly one API-visible annotation — "Process completed with exit
 *   code 1" — while the actual reason lives only in the step log. An operator
 *   (or an automated agent) who cannot download the job log archive therefore
 *   sees a production deploy failure with no stated cause, and the natural
 *   inference becomes "a secret is missing" or "the database is unreachable"
 *   whether or not that is true.
 *
 *   Workflow-command annotations ARE retrievable from the check-runs
 *   annotations API without the log archive, so emitting the reason there makes
 *   a failed governed release self-describing.
 *
 * SAFETY
 *   Only two things are ever published:
 *     - `sanitizeError(e)`, which by construction returns a fixed failure
 *       vocabulary plus the public PostgreSQL SQLSTATE constant — never a
 *       hostname, port, username, database name, password or DSN;
 *     - `db-release.ts` gate failures, which are assembled from migration
 *       version names, fingerprints and role names already committed to the
 *       repository.
 *   Raw driver messages are never forwarded. The message is flattened to a
 *   single line because a newline would terminate the workflow command.
 */
import { sanitizeError } from "./sanitize-error";

function isActions(): boolean {
  return process.env.GITHUB_ACTIONS === "true";
}

/** Emit a single-line `::error::` annotation. No-op outside GitHub Actions. */
export function annotateError(title: string, detail: string): void {
  if (!isActions()) return;
  const flat = detail.replace(/\s*\n\s*/g, " | ").replace(/%/g, "%25");
  // `title` is interpolated into the command, so keep it to a safe charset.
  const safeTitle = title.replace(/[^A-Za-z0-9 ._/-]/g, "");
  process.stdout.write(`::error title=${safeTitle}::${safeTitle}: ${flat}\n`);
}

/**
 * Terminal failure handler for the governed database tooling.
 *
 * Publishes the sanitized reason as an annotation, writes the same JSON the
 * scripts have always written to stderr, and exits non-zero.
 */
export function failSanitized(context: string, e: unknown): never {
  const detail = sanitizeError(e);
  annotateError(context, detail);
  console.error(JSON.stringify({ ok: false, context, error: detail }, null, 2));
  process.exit(1);
}

/**
 * Publish `db-release.ts` gate failures (verify / preflight / drift) as an
 * annotation so a red release record states which gate tripped.
 */
export function annotateGateFailures(context: string, failures: string[]): void {
  if (failures.length === 0) return;
  annotateError(context, failures.join(" | "));
}
