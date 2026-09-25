/**
 * BEYU OS — canonical MIGRATION-LEDGER fingerprint (single source of truth).
 *
 * WHAT THIS IS
 * ────────────
 * One pure, DB-free implementation of the migration-ledger fingerprint:
 *
 *   sha256( ordered `beyu_migrations.checksum` values joined by "\n" )
 *
 * The ordering is the ledger's own `order by version` (text, ascending) — the
 * exact expression the live probe already used as
 * `string_agg(checksum, '\n' order by version)`. `array_agg(... order by version)`
 * followed by `join("\n")` produces the identical string, so this module is a
 * refactor of that expression into ONE place, never a second, subtly-different
 * algorithm.
 *
 * WHY IT EXISTS (PVG contract repair)
 * ───────────────────────────────────
 * PVG has two DIFFERENT, NON-INTERCHANGEABLE fingerprints, and conflating them
 * made two blocking checks fail deterministically:
 *
 *   • SCHEMA fingerprint   — physical `public` schema state (tables, columns,
 *                            constraints, indexes, RLS), md5 over that aggregate.
 *                            Produced by `scripts/db-release.ts`.
 *   • MIGRATION fingerprint — ordered migration-ledger checksums, sha256 (this
 *                            module). Consumed by `src/lib/release/live-pvg.ts`.
 *
 * A schema md5 can never equal a ledger sha256. `scripts/db-release.ts` now
 * emits `ledgerFingerprint` from THIS function so the pipeline can supply a
 * genuine ledger fingerprint (instead of the schema md5) to the migration
 * expectation, while the schema md5 stays where it belongs. See
 * `docs/architecture/RELEASE_APPROVALS.md` and `scripts/release/pvg-cli.ts`.
 *
 * SECURITY NOTE
 * ─────────────
 * A fingerprint is EVIDENCE, never authority. It reports whether the applied
 * migration ledger is the one this revision expects; it grants nothing and it
 * is not an authorization input. RLS remains the final data-isolation boundary.
 */

import { createHash } from "node:crypto";

/** Separator used to join ordered checksums before hashing (canonical). */
export const MIGRATION_FINGERPRINT_JOIN = "\n";

/**
 * Canonical migration-ledger fingerprint.
 *
 * @param orderedChecksums `beyu_migrations.checksum` values in `version` order.
 *   An empty/absent ledger yields `null` — mirroring the SQL behaviour where
 *   `string_agg` over zero rows returns NULL (never a hash of ""), so "no
 *   ledger" can never be mistaken for "a ledger that hashes to X".
 */
export function migrationFingerprintFromChecksums(
  orderedChecksums: readonly (string | null)[] | null | undefined,
): string | null {
  if (!orderedChecksums || orderedChecksums.length === 0) return null;
  const joined = orderedChecksums
    .map((checksum) => checksum ?? "")
    .join(MIGRATION_FINGERPRINT_JOIN);
  return createHash("sha256").update(joined).digest("hex");
}
