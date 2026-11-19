/**
 * UNWIRED Health BFF replay-consumption primitive. The table and runtime grants
 * do not yet exist in the governed migration chain. No production request uses
 * this code. It is not an assertion verifier or an authorization check.
 *
 * The caller MUST first verify signature, issuer, audience, mTLS, times, and
 * request binding. Use an independent autocommit pool, never a transaction that
 * can roll back with the downstream operation: a consumed assertion must stay
 * consumed even if that operation fails. Never put a retry around this INSERT.
 */
export interface ReplayAutocommitDatabase {
  query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }>;
}

export type ReplayResult = "CONSUMED" | "REPLAY" | "UNAVAILABLE";

/**
 * Atomic unique-key insert. Retain through exp + 5s clock skew + 60s safety.
 * Database-clock bounds defend against accidental unverified/unbounded expiry.
 * Only a unique constraint on (issuer, jti) makes this safe across replicas.
 * Any database error, malformed input or unexpected result denies access.
 */
export async function consumeHealthRequestOnce(
  pool: ReplayAutocommitDatabase,
  issuer: string,
  jti: string,
  expirySeconds: number,
): Promise<ReplayResult> {
  if (
    issuer.length === 0 ||
    issuer.length > 512 ||
    !/^[A-Za-z0-9_-]{22,128}$/.test(jti) ||
    !Number.isSafeInteger(expirySeconds) ||
    expirySeconds <= 0
  )
    return "UNAVAILABLE";

  try {
    const result = await pool.query(
      `INSERT INTO beyu_identity.health_request_replay (issuer, jti, retain_until)
       SELECT $1, $2, to_timestamp($3::double precision) + interval '65 seconds'
       WHERE to_timestamp($3::double precision) >= clock_timestamp() - interval '5 seconds'
         AND to_timestamp($3::double precision) <= clock_timestamp() + interval '35 seconds'
       ON CONFLICT (issuer, jti) DO NOTHING
       RETURNING 1`,
      [issuer, jti, expirySeconds],
    );
    // A zero-row response can mean replay OR expiry outside the DB-clock
    // bounds. Both deny. Keep those facts indistinguishable to callers.
    if (result.rows.length === 1) return "CONSUMED";
    return result.rows.length === 0 ? "REPLAY" : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  }
}
