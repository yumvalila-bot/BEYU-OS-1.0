/**
 * BEYU OS — minimal constitutional foundation for first-administrator preparation.
 *
 * PURPOSE
 *   Establish only the deterministic data prerequisites required by
 *   scripts/prepare-admin-bootstrap.ts:
 *     1. the canonical enterprise tenant;
 *     2. the canonical PLATFORM_ADMIN role.
 *
 *   This is NOT the application seed. It creates no user, credential, MFA
 *   material, role assignment, bootstrap state, sector tenant or demo data.
 *   Administrator identity preparation remains exclusively owned by
 *   scripts/prepare-admin-bootstrap.ts.
 *
 * PREREQUISITES
 *   - BEYU_ADMIN_DATABASE_URL (or DATABASE_URL) — admin/migration DSN
 *
 * USAGE
 *   npm run prepare:constitutional-foundation
 */
import "dotenv/config";
import { adminDb, adminPool } from "../src/db/admin";
import { recordAuditTx, type Tx } from "../src/lib/audit";
import { ensureConstitutionalFoundation } from "../src/lib/bootstrap/foundation";
import { newId, ID_PREFIX } from "../src/lib/ids";

async function main(): Promise<void> {
  const result = await adminDb.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    const foundation = await ensureConstitutionalFoundation(rawTx);

    if (foundation.tenantCreated || foundation.roleCreated) {
      await recordAuditTx(tx, {
        actorType: "SERVICE",
        action: "bootstrap.foundation.prepared",
        objectType: "BOOTSTRAP_FOUNDATION",
        objectId: "BEYU_GROUP",
        outcome: "SUCCESS",
        reason: "Minimal constitutional prerequisites established for first-administrator preparation",
        authority: "OWNER_BOOTSTRAP_FOUNDATION",
        newValue: {
          tenantCreated: foundation.tenantCreated,
          roleCreated: foundation.roleCreated,
        },
        traceId: newId(ID_PREFIX.event),
      });
    }

    return foundation;
  });

  console.log(
    [
      "Minimal constitutional foundation verified.",
      `  - Canonical enterprise tenant: ${result.tenantCreated ? "created" : "already present"}.`,
      `  - Canonical PLATFORM_ADMIN role: ${result.roleCreated ? "created" : "already present"}.`,
      "  - No user, password, MFA material, role assignment, or bootstrap state was created.",
      "Next step: run npm run prepare:admin-bootstrap with the owner email.",
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  })
  .finally(() => adminPool.end());
