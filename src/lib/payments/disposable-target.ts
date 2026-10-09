/**
 * Disposable-target guard for payment DR, fixture, reset and demo tooling (audit H-3).
 *
 * These tools do things no operator should ever do to a live ledger: activate the
 * CAP_POSTING capability, unwind payment rows with the immutability triggers
 * switched off (session_replication_role = replica), and remove demonstration
 * rows. They are for disposable databases only, such as the CI service container
 * and a developer's local PostgreSQL.
 *
 * The guard refuses unless:
 *   - the process is not production (NODE_ENV or BEYU_ENV), and
 *   - the admin connection is a PostgreSQL URL whose host is loopback.
 *
 * It does not rely on the database name, which can be anything, and it never
 * includes the URL or its credentials in an error. Governed configuration writes
 * (payment-config) are deliberately outside this guard, because they may run
 * against real configuration.
 */

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export class DisposableTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisposableTargetError";
  }
}

export type DisposableTarget = { host: string; database: string };

export function assertDisposablePaymentsTarget(
  url: string | undefined,
  purpose: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): DisposableTarget {
  const environment = (env.BEYU_ENV ?? "").trim().toLowerCase();
  if (env.NODE_ENV === "production" || environment === "production") {
    throw new DisposableTargetError(`${purpose}: refused in a production environment.`);
  }
  if (!url || url.trim() === "") {
    throw new DisposableTargetError(`${purpose}: no admin database URL is configured.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Never echo the value: it may carry a password.
    throw new DisposableTargetError(`${purpose}: the admin database URL is not parseable (value withheld).`);
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new DisposableTargetError(`${purpose}: the admin database URL is not a PostgreSQL URL (value withheld).`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new DisposableTargetError(
      `${purpose}: refused, the target host is not loopback. This tooling runs only against a local disposable database.`,
    );
  }
  return {
    host: parsed.hostname,
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  };
}
