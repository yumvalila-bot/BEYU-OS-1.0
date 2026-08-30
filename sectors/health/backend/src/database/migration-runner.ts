/**
 * BEYU Health OS — deterministic migration runner.
 *
 * Applies the committed identity migration (001_identity_foundation) exactly
 * once, in a transaction, recording the version in a `beyu_migrations` ledger so
 * it is safe to run repeatedly through the deployment pipeline.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node dist/database/migration-runner.js up
 *   DATABASE_URL=postgres://... node dist/database/migration-runner.js down
 */
import { PgConnection } from "../modules/identity/db-connection";
import {
  IDENTITY_SCHEMA_SQL,
  identitySeedSql,
} from "../modules/identity/identity-schema";

const MIGRATION_ID = "001_identity_foundation";

function connectionString(): string {
  return (
    process.env.DATABASE_URL ||
    `postgres://${process.env.DB_USERNAME ?? "postgres"}:${process.env.DB_PASSWORD ?? ""}@${
      process.env.DB_HOST ?? "localhost"
    }:${process.env.DB_PORT ?? 5432}/${process.env.DB_DATABASE ?? "beyu_health"}`
  );
}

async function run(direction: "up" | "down"): Promise<void> {
  const conn = new PgConnection({ connectionString: connectionString() });
  try {
    if (direction === "down") {
      await conn.exec(
        `DROP TABLE IF EXISTS beyu_identity.auth_events;
         DROP TABLE IF EXISTS beyu_identity.sessions;
         DROP TABLE IF EXISTS beyu_identity.role_permissions;
         DROP TABLE IF EXISTS beyu_identity.permissions;
         DROP TABLE IF EXISTS beyu_identity.roles;
         DROP TABLE IF EXISTS beyu_identity.tenant_memberships;
         DROP TABLE IF EXISTS beyu_identity.tenants;
         DROP TABLE IF EXISTS beyu_identity.users;
         DROP SCHEMA IF EXISTS beyu_identity;
         DELETE FROM beyu_migrations WHERE id = '${MIGRATION_ID}';`,
      );
      console.log(`DOWN: ${MIGRATION_ID} applied.`);
      return;
    }

    await conn.exec(
      `CREATE TABLE IF NOT EXISTS beyu_migrations (
         id text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       );`,
    );

    const applied = await conn.query(
      `SELECT id FROM beyu_migrations WHERE id = $1`,
      [MIGRATION_ID],
    );
    if (applied.length > 0) {
      console.log(`Migration ${MIGRATION_ID} already applied; skipping.`);
      return;
    }

    await conn.transaction(async (tx) => {
      await tx.exec(IDENTITY_SCHEMA_SQL);
      await tx.exec(identitySeedSql());
      await tx.query(`INSERT INTO beyu_migrations (id) VALUES ($1)`, [
        MIGRATION_ID,
      ]);
    });
    console.log(`UP: ${MIGRATION_ID} applied.`);
  } finally {
    await conn.close();
  }
}

const direction = (process.argv[2] as "up" | "down") ?? "up";
run(direction)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
