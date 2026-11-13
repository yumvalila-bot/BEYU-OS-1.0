/**
 * MULTI_COMPANY_MANAGEMENT — the accounting-period lock, and the effective-window
 * check, proved against real Postgres.
 *
 * `raiseIntercompanyTransaction` documented these two preconditions and did not
 * perform them. This suite is what makes the documentation true:
 *
 *   1. a period Finance OS has CLOSED or LOCKED for EITHER leg refuses a raise,
 *      and refuses a side authorisation, with the row count unchanged;
 *   2. one leg open and one leg closed is still a refusal — a lock on one side
 *      cannot be worked around by naming the other;
 *   3. an agreement whose effective window does not cover the period is refused;
 *   4. ABSENCE of a period row is not a lock (Finance owns the register; MCM
 *      inventing a lock there would be MCM legislating for Finance OS), and
 *      CLOSING is not CLOSED;
 *   5. reconciliation is deliberately NOT blocked by a closed period, because
 *      reconciling is how a period becomes ready to close.
 *
 * Fixtures are created with the admin connection and removed in `afterAll`. No
 * invented company, director, ownership percentage or financial figure is written:
 * the two entities are existing seeded legal entities, used only as parties to a
 * clearly-labelled throwaway instrument in a far-future period.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  documents,
  financialPeriods,
  intercompanyAgreements,
  intercompanyReconciliationRuns,
  intercompanyTransactions,
  legalEntities,
} from "@/db/schema";
import {
  authorizeIntercompanySide,
  raiseIntercompanyTransaction,
  reconcileIntercompanyPeriod,
} from "@/lib/mcm/services";
import { McmError } from "@/lib/mcm/model";
import { seededPrincipal } from "../noelia/db-fixtures";
import type { Principal } from "@/lib/authz";

const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const PERIOD = "2031-01";
const LATE_PERIOD = "2033-01";
const AGREEMENT_ID = "ICA_TEST_PERIODLOCK_1";
const DOCUMENT_ID = "DOC_TEST_PERIODLOCK_1";
const KEY_PREFIX = "ICT_TEST_PERIODLOCK";

let admin: Client;
let entityA: { id: string; tenantId: string; countryCode: string };
let entityB: { id: string; tenantId: string; countryCode: string };
let actor: Principal;

async function upsertPeriod(legalEntityId: string, code: string, startsOn: string, endsOn: string, status: string) {
  await admin.query(
    `insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do update set status = excluded.status`,
    [`FNP_PERIODLOCK_${code}_${legalEntityId}`, legalEntityId, code, startsOn, endsOn, status],
  );
}

async function setPeriodStatus(legalEntityIds: string[], code: string, status: "OPEN" | "CLOSING" | "CLOSED" | "LOCKED") {
  await admin.query(`update financial_periods set status = $1 where legal_entity_id = any($2::text[]) and code = $3`, [
    status,
    legalEntityIds,
    code,
  ]);
}

async function raise(reference: string, periodCode: string, amountMinor = "100000") {
  return raiseIntercompanyTransaction(
    actor,
    {
      agreementId: AGREEMENT_ID,
      reference,
      transactionType: "SHARED_SERVICES",
      receivableEntityId: entityA.id,
      payableEntityId: entityB.id,
      periodCode,
      currency: "TZS",
      amountMinor,
      description: "Period-lock contract test; asserts no financial consequence.",
      idempotencyKey: `${KEY_PREFIX}_${reference}`,
    },
    `TRACE_PERIODLOCK_${reference}`,
  );
}

/**
 * Counted by AGREEMENT, not by id: the service mints the transaction id itself,
 * so a prefix filter on `id` would silently count nothing and every "no row was
 * written" assertion below would pass for the wrong reason.
 */
async function ownTransactionCount() {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(intercompanyTransactions)
    .where(eq(intercompanyTransactions.agreementId, AGREEMENT_ID));
  return Number(row.count);
}

/** A refusal must leave NOTHING behind: no partial row, no state drift. */
async function expectRefusal(promise: Promise<unknown>, code: string, message?: RegExp) {
  const before = await ownTransactionCount();
  const error = await promise.then(() => null).catch((err) => err);
  expect(error, `expected a ${code} refusal, but the call succeeded`).toBeInstanceOf(McmError);
  expect((error as McmError).code).toBe(code);
  if (message) expect((error as McmError).message).toMatch(message);
  expect(await ownTransactionCount(), `${code} must not write a row`).toBe(before);
}

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("BEYU_ADMIN_DATABASE_URL or DATABASE_URL is required");
  admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await clearFixtures();

  // Two entities from the SAME tenant, derived rather than hardcoded: the
  // agreement row carries one tenant_id, so a cross-tenant pair would test the
  // fixture rather than the control.
  const entities = await db
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId, countryCode: legalEntities.countryCode })
    .from(legalEntities)
    .where(
      sql`${legalEntities.tenantId} = (
             select tenant_id from legal_entities
              group by tenant_id having count(*) >= 2
              order by count(*) desc, tenant_id asc limit 1)`,
    )
    .orderBy(sql`id asc`)
    .limit(2);
  if (entities.length < 2) throw new Error("This suite needs a tenant with at least two seeded legal entities");
  [entityA, entityB] = entities;

  actor = await seededPrincipal("cfo@beyu.os");

  // A real ACTIVE agreement requires a real instrument row: the database refuses
  // an ACTIVE agreement without a document, so the fixture honours that instead of
  // disabling the constraint.
  await admin.query(
    `insert into documents
       (id, tenant_id, file_name, file_type, category, description, version, source, uploaded_by,
        uploaded_at, classification, authority_status, checksum, storage_uri, retention_code, legal_hold)
     values ($1, $2, 'period-lock-test-instrument.txt', 'text/plain', 'CONTRACT',
             'Intercompany instrument used only by the period-lock contract test.', '1.0.0', 'SYNTHETIC_TEST', $3,
             now(), 'CONFIDENTIAL', 'UNDER_REVIEW', md5($1), 'vault://beyu/test/period-lock.txt', 'RET-TEST-7Y', false)
     on conflict (id) do nothing`,
    [DOCUMENT_ID, entityA.tenantId, actor.userId],
  );
  await admin.query(
    `insert into intercompany_agreements
       (id, tenant_id, code, title, agreement_type, from_entity_id, to_entity_id, currency,
        pricing_basis, effective_from, effective_to, document_id, status, recorded_by, classification)
     values ($1,$2,'ICA-PERIODLOCK','Period-lock test instrument','SHARED_SERVICES',$3,$4,'TZS',
             'Cost plus two percent, stated for the test only','2030-01-01','2031-12-31',$5,'ACTIVE',$6,'CONFIDENTIAL')
     on conflict (id) do nothing`,
    [AGREEMENT_ID, entityA.tenantId, entityA.id, entityB.id, DOCUMENT_ID, actor.userId],
  );

  for (const entityId of [entityA.id, entityB.id]) {
    await upsertPeriod(entityId, PERIOD, "2031-01-01", "2031-01-31", "OPEN");
  }
});

async function reconciliationRunCount(periodCode: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(intercompanyReconciliationRuns)
    .where(eq(intercompanyReconciliationRuns.periodCode, periodCode));
  return Number(row.count);
}

/**
 * Fixture teardown, run BEFORE the setup as well as after it: a crashed run must
 * not leave idempotency keys behind that make the next run fail for a reason that
 * has nothing to do with the control under test.
 */
async function clearFixtures() {
  await admin.query(`delete from intercompany_transactions where agreement_id = $1`, [AGREEMENT_ID]);
  // `intercompany_reconciliation_runs` is append-only AT THE DATABASE: the
  // immutability trigger refuses a DELETE for the admin role too, so this suite
  // cannot clean its reconciliation run up and MUST NOT assert an exact row count
  // for that period. The trigger is the point, not an obstacle: a run is history.
  void LATE_PERIOD;
  // Matched by the fixture's OWN id prefix rather than by entity, so the cleanup
  // can also run in beforeAll, before the entities have been resolved.
  await admin.query(`delete from financial_periods where id like 'FNP_PERIODLOCK_%'`);
  await admin.query(`delete from intercompany_agreements where id = $1`, [AGREEMENT_ID]);
  await admin.query(`delete from documents where id = $1`, [DOCUMENT_ID]);
}

afterAll(async () => {
  await clearFixtures();
  await admin.end();
});

describe("intercompany writes honour the Finance-owned period", () => {
  it("raises into an OPEN period, then refuses once either leg is CLOSED", async () => {
    const raised = await raise("PL_OPEN", PERIOD);
    expect(raised.state).toBe("PROPOSED");
    expect(await ownTransactionCount()).toBe(1);

    await setPeriodStatus([entityB.id], PERIOD, "CLOSED");
    await expectRefusal(raise("PL_BLOCKED", PERIOD), "PERIOD_NOT_OPEN");
    await setPeriodStatus([entityB.id], PERIOD, "OPEN");
  });

  it("refuses when only the receivable leg is locked, and permits CLOSING", async () => {
    await setPeriodStatus([entityA.id], PERIOD, "LOCKED");
    const error = await raise("PL_LOCKED_A", PERIOD).then(() => null).catch((err) => err);
    expect(error).toBeInstanceOf(McmError);
    expect((error as McmError).code).toBe("PERIOD_NOT_OPEN");
    // The message names WHICH leg and WHY, so a reader can act on it.
    expect((error as McmError).message).toMatch(/not open for 1 of the two entities/);
    await setPeriodStatus([entityA.id], PERIOD, "CLOSING");

    // CLOSING means the close has started, not that it has been asserted.
    const ok = await raise("PL_CLOSING", PERIOD);
    expect(ok.state).toBe("PROPOSED");
    await setPeriodStatus([entityA.id, entityB.id], PERIOD, "OPEN");
  });

  it("refuses a late authorisation into a period that closed after the raise", async () => {
    const { transactionId } = await raise("PL_LATE", PERIOD);
    await setPeriodStatus([entityA.id, entityB.id], PERIOD, "CLOSED");

    const error = await authorizeIntercompanySide(
      actor,
      { transactionId, side: "RECEIVABLE", reason: "Attempted after the period closed." },
      "TRACE_PERIODLOCK_LATE",
    )
      .then(() => null)
      .catch((err) => err);
    expect(error).toBeInstanceOf(McmError);
    expect((error as McmError).code).toBe("PERIOD_NOT_OPEN");
    const unchanged = await db
      .select({ state: intercompanyTransactions.state })
      .from(intercompanyTransactions)
      .where(eq(intercompanyTransactions.id, transactionId));
    expect(unchanged[0].state).toBe("PROPOSED");

    // Re-open, and the same authorisation proceeds: the control is the calendar,
    // not a blanket refusal of this principal.
    await setPeriodStatus([entityA.id, entityB.id], PERIOD, "OPEN");
    const authorized = await authorizeIntercompanySide(
      actor,
      { transactionId, side: "RECEIVABLE", reason: "Authorized while the period is open." },
      "TRACE_PERIODLOCK_REOPEN",
    );
    expect(authorized.state).toBe("AWAITING_COUNTERPARTY");
  });

  it("refuses an agreement whose window does not cover the period", async () => {
    for (const entityId of [entityA.id, entityB.id]) {
      await upsertPeriod(entityId, LATE_PERIOD, "2033-01-01", "2033-01-31", "OPEN");
    }
    const error = await raise("PL_WINDOW", LATE_PERIOD).then(() => null).catch((err) => err);
    expect(error).toBeInstanceOf(McmError);
    expect((error as McmError).code).toBe("AGREEMENT_NOT_EFFECTIVE_FOR_PERIOD");
    expect((error as McmError).message).toMatch(/ended 2031-12-31, before period 2033-01 began/);
  });

  it("does not invent a lock where Finance has no period row", async () => {
    const unmodelled = "2035-01";
    // No financial_periods row exists for this code, so there is no date range to
    // test and no lock to respect. The only refusal available is the honest one:
    // the agreement's stated window does not reach 2035 on the fallback of
    // "effective as of today".
    const error = await raise("PL_UNMODELLED", unmodelled).then(() => null).catch((err) => err);
    expect(error).toBeInstanceOf(McmError);
    expect((error as McmError).code).toBe("AGREEMENT_NOT_EFFECTIVE_FOR_PERIOD");
    expect((error as McmError).message).toMatch(/no Finance OS date range to check against/);

    const rows = await db
      .select({ id: intercompanyTransactions.id })
      .from(intercompanyTransactions)
      .where(eq(intercompanyTransactions.periodCode, unmodelled));
    expect(rows.length).toBe(0);
  });

  it("keeps reconciliation available on a closed period, because that is how a period closes", async () => {
    // Best-effort second signature, so the run has something to compare when the
    // deployment's ABAC grants allow it. Whether the counterparty may sign is a
    // property of the seeded grants, not of this control, so the assertion below
    // does not depend on it.
    const { transactionId } = await raise("PL_RECONCILE", PERIOD);
    await authorizeIntercompanySide(
      actor,
      { transactionId, side: "PAYABLE", reason: "Counterparty signature for the reconciliation fixture." },
      "TRACE_PERIODLOCK_RECONCILE_SIDE",
    ).catch(() => undefined);

    await setPeriodStatus([entityA.id, entityB.id], PERIOD, "CLOSED");
    const runsBefore = await reconciliationRunCount(PERIOD);
    const run = await reconcileIntercompanyPeriod(
      actor,
      { periodCode: PERIOD, currency: "TZS", reason: "Closing the test period; reconciliation is the closing act." },
      "TRACE_PERIODLOCK_RECONCILE",
    );
    // The point: reconcile ran on a CLOSED period instead of refusing. Reconciling
    // is how a period becomes ready to close — blocking it would deadlock the close.
    expect(typeof run.runId).toBe("string");
    expect(run.pairsExamined).toBeGreaterThanOrEqual(0);
    expect(typeof run.totalDifferenceMinor).toBe("string");

    // The run became permanent history: exactly one new row for the period, and
    // it reflects what was examined. Counted as a DELTA because a reconciliation
    // run cannot be deleted — a suite that asserted an absolute count would go red
    // on its second green run, which is a fixture bug, not a contract.
    expect(await reconciliationRunCount(PERIOD)).toBe(runsBefore + 1);
    const [stored] = await db
      .select({ periodCode: intercompanyReconciliationRuns.periodCode, currency: intercompanyReconciliationRuns.currency })
      .from(intercompanyReconciliationRuns)
      .where(eq(intercompanyReconciliationRuns.periodCode, PERIOD))
      .orderBy(sql`run_at desc`)
      .limit(1);
    expect(stored.periodCode).toBe(PERIOD);
    expect(stored.currency).toBe("TZS");
    await setPeriodStatus([entityA.id, entityB.id], PERIOD, "OPEN");
  });
});
