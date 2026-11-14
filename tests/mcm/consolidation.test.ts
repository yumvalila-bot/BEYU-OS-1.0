/**
 * MULTI_COMPANY_MANAGEMENT — the consolidation run, against real Postgres.
 *
 * WHAT THIS SUITE PROVES, AND WHAT IT CANNOT
 * ---------------------------------------------------------------------
 * The arithmetic — totals, the exponent rescale, the translation reserve, non-
 * controlling interests, which transaction may be eliminated — lives in
 * `src/lib/mcm/consolidation-core.ts` and is proved in
 * `tests/mcm/consolidation-core.test.ts`, without a database.
 *
 * It is proved there and NOT here for a reason that is itself a property of this
 * system: `journal_entries` and `journal_lines` carry `BEFORE UPDATE OR DELETE`
 * triggers that refuse mutation, so a ledger row inserted by a test is permanent —
 * and four finance suites assert that the ledger is EMPTY while CAP_POSTING is
 * LOCKED (`select count(*) from journal_entries` → 0). A fixture that committed a
 * trial balance would therefore destroy another suite's invariant and leave the
 * debris behind forever. So this suite exercises the ADAPTER — authority, scope,
 * the membership decision, the exclusions, the governed write, the four-eyes review,
 * the audit and event trail — and does it on seeded data with no ledger rows, which
 * means every member is legitimately excluded "no trial balance". That is exactly the
 * case a naive engine would paper over with zeros, which makes it the most valuable
 * thing to test against the real schema.
 *
 * WHAT THE FIXTURES ARE
 *   * `legal_entity_profiles` rows marking existing seeded entities as consolidated
 *     — nothing about the group structure is invented: the parent/child edges and the
 *     ownership percentages are the ones the registry already holds (70% for
 *     BEYU-AGR, 100% for BEYU-FIN, none for BEYU-UJZ, which is the point of one case).
 *   * `financial_periods` rows in a far-future year derived from the run token, so
 *     two runs of this file never read each other's data.
 *   * One synthetic reviewer (party + user + role assignment), created because
 *     `mcm:consolidation.review` is held by exactly one seeded seat and that seat
 *     prepared the run: inventing a second holder of the real CFO's authority would
 *     be less honest than a row that says "test fixture" in its display name.
 *   * No journal entry, no ownership record, no FX rate, no intercompany transaction.
 *
 * CLEANUP
 *   Every fixture is removed before and after the run (a crashed run must not make
 *   the next one fail for an unrelated reason), in FK order. The financial periods
 *   are removed too; nothing this suite writes is append-only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { consolidationAdjustments, consolidationEntities, consolidationRuns, legalEntities, ownershipRecords } from "@/db/schema";
import { prepareConsolidationRun, reviewConsolidationRun } from "@/lib/mcm/consolidation";
import { consolidationOverview } from "@/lib/mcm/read-services";
import { McmError } from "@/lib/mcm/model";
import { seededPrincipal } from "../noelia/db-fixtures";
import { can, type Principal } from "@/lib/authz";

const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const TOKEN = `CONS${Date.now().toString(36).toUpperCase()}`;
const RUN_CODE = `CON-${TOKEN}`;
const REVIEW_CODE = `CON-${TOKEN}-REV`;
const PERIOD_YEAR = 2040 + (Number(Date.now().toString().slice(-3)) % 400);
const PERIOD = `${PERIOD_YEAR}-11`;
const AS_OF = `${PERIOD_YEAR}-11-30`;
const TRACE_PREPARE = `TRACE_${TOKEN}_PREPARE`;
const TRACE_REVIEW = `TRACE_${TOKEN}_REVIEW`;
const REVIEWER_ID = `USR_TEST_${TOKEN}_REVIEWER`;
const REVIEWER_PARTY = `PTY_TEST_${TOKEN}_REVIEWER`;
const REVIEWER_ASSIGNMENT = `RAS_TEST_${TOKEN}_REVIEWER`;
const REVIEWER_EMAIL = `consolidation-reviewer-${TOKEN.toLowerCase()}@beyu.test`;
const PROFILE_PREFIX = `LEP_TEST_${TOKEN}`;

let admin: Client;
let tenantId: string;
let preparer: Principal;
let reviewer: Principal;
let nonReviewer: Principal;
/** Seeded entities this suite leans on, resolved rather than hardcoded. */
const entities = new Map<string, { id: string; tenantId: string; functionalCurrency: string }>();

async function refusal(run: () => Promise<unknown>): Promise<McmError | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error as McmError;
  }
}

/** A refusal must write nothing: a rejected preparation leaves no run row behind. */
async function expectRefusal(run: () => Promise<unknown>, code: string, message?: RegExp) {
  const error = await refusal(run);
  expect(error, `expected a ${code} refusal, but the call succeeded`).toBeInstanceOf(McmError);
  expect((error as McmError).code).toBe(code);
  if (message) expect((error as McmError).message).toMatch(message);
}

async function runCount(code: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(consolidationRuns)
    .where(eq(consolidationRuns.code, code));
  return Number(row.n);
}

beforeAll(async () => {
  if (!ADMIN_URL) throw new Error("BEYU_ADMIN_DATABASE_URL or DATABASE_URL is required");
  admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await clearFixtures();

  // The holding company and its children, from the seed data.
  const [holding] = await db
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
    .from(legalEntities)
    .where(eq(legalEntities.code, "BEYU-TZH"))
    .limit(1);
  if (!holding) throw new Error("This suite needs the seeded BEYU-TZH legal entity");
  tenantId = holding.tenantId;
  // Deliberately CROSS-tenant: each seeded subsidiary lives in its own tenant, and a
  // group consolidation is exactly the case where one preparation spans them. An
  // engine that assumed "member.tenant_id = preparer.tenant_id" would find nothing.
  const rows = await db
    .select({
      id: legalEntities.id,
      code: legalEntities.code,
      tenantId: legalEntities.tenantId,
      functionalCurrency: legalEntities.functionalCurrency,
    })
    .from(legalEntities)
    .where(inArray(legalEntities.code, ["BEYU-TZH", "BEYU-AGR", "BEYU-FIN", "BEYU-UJZ", "BEYU-MIN"]));
  for (const row of rows) entities.set(row.code, { id: row.id, tenantId: row.tenantId, functionalCurrency: row.functionalCurrency });
  for (const code of ["BEYU-TZH", "BEYU-AGR", "BEYU-FIN", "BEYU-UJZ"]) {
    if (!entities.has(code)) throw new Error(`This suite needs the seeded ${code} legal entity`);
  }
  // The registry facts the assertions depend on. If a seed change breaks these, the
  // suite must say so here rather than quietly assert something else.
  const ownershipRows = await db
    .select({ owned: ownershipRecords.ownedEntityId, owner: ownershipRecords.ownerEntityId, pct: ownershipRecords.economicPct })
    .from(ownershipRecords)
    .where(eq(ownershipRecords.tenantId, tenantId));
  const agri = ownershipRows.filter((row) => row.owned === entities.get("BEYU-AGR")!.id);
  if (agri.length === 0 || agri[0].owner !== entities.get("BEYU-TZH")!.id) {
    throw new Error("This suite expects BEYU-AGR to be owned by BEYU-TZH in the seeded registry");
  }

  preparer = await seededPrincipal("cfo@beyu.os");
  nonReviewer = await seededPrincipal("governance@beyu.os");

  // Mark the seeded entities as consolidated. Nothing else about them is changed.
  for (const code of ["BEYU-TZH", "BEYU-AGR", "BEYU-FIN", "BEYU-UJZ"]) {
    const entity = entities.get(code)!;
    await admin.query(
      // `legal_entity_profiles_pending_note_check` requires a note whenever the
      // verification state is PENDING_VERIFICATION, and the constraint applies to the
      // admin role too — so the fixture honours it instead of disabling it, and says
      // what is actually true: this profile has no verification evidence.
      `insert into legal_entity_profiles
         (id, tenant_id, legal_entity_id, mcm_lifecycle_state, reporting_currency, reporting_timezone,
          consolidated, consolidation_method, verification_state, pending_verification_note, created_at, updated_at, updated_by)
       values ($1, $2, $3, 'ACTIVE', 'TZS', 'Africa/Dar_es_Salaam', true, 'FULL', 'PENDING_VERIFICATION', $4, now(), now(), $5)
       on conflict (legal_entity_id) do nothing`,
      [
        `${PROFILE_PREFIX}_${code}`,
        entity.tenantId,
        entity.id,
        `Fixture profile for tests/mcm/consolidation.test.ts, created only to mark an existing seeded entity as a consolidated member. No verification evidence exists for it.`,
        preparer.userId,
      ],
    );
    const periodId = `FNP_${TOKEN}_${code}`;
    await admin.query(
      `insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
       values ($1, $2, $3, $4, $5, 'OPEN') on conflict (id) do nothing`,
      [periodId, entity.id, PERIOD, `${PERIOD_YEAR}-11-01`, `${PERIOD_YEAR}-11-30`],
    );
  }

  // A second holder of the reviewing authority, so four-eyes can be shown to work
  // rather than asserted.
  await admin.query(
    `insert into parties (id, type, display_name, classification)
     values ($1, 'PERSON', 'Consolidation review fixture (test only)', 'INTERNAL')`,
    [REVIEWER_PARTY],
  );
  await admin.query(
    `insert into users (id, party_id, email, password_hash, primary_tenant_id, status)
     values ($1, $2, $3, 'test-fixture-no-login', $4, 'ACTIVE')`,
    [REVIEWER_ID, REVIEWER_PARTY, REVIEWER_EMAIL, preparer.tenantId],
  );
  await admin.query(
    `insert into role_assignments (id, user_id, role_id, tenant_id, effective_from, granted_by, justification, global_scope)
     values ($1, $2, 'ROL_GROUP_CFO', $3, '2024-01-01', $4, $5, true)`,
    [
      REVIEWER_ASSIGNMENT,
      REVIEWER_ID,
      preparer.tenantId,
      `TEST_FIXTURE/${TOKEN}`,
      `Fixture for tests/mcm/consolidation.test.ts: a second holder of the reviewing authority so four-eyes can be exercised. Not a real appointment.`,
    ],
  );
  reviewer = await seededPrincipal(REVIEWER_EMAIL);
});

async function clearFixtures() {
  // FK order: adjustments → entities → run; profiles and periods have nothing
  // depending on them from this fixture.
  await admin.query(`delete from consolidation_adjustments where run_id in (select id from consolidation_runs where code like 'CON-${TOKEN}%')`);
  await admin.query(`delete from consolidation_entities where run_id in (select id from consolidation_runs where code like 'CON-${TOKEN}%')`);
  await admin.query(`delete from consolidation_runs where code like 'CON-${TOKEN}%'`);
  await admin.query(`delete from financial_periods where id like 'FNP_${TOKEN}_%'`);
  await admin.query(`delete from legal_entity_profiles where id like 'LEP_TEST_${TOKEN}%'`);
  await admin.query(`delete from role_assignments where id = $1`, [REVIEWER_ASSIGNMENT]);
  await admin.query(`delete from users where id = $1`, [REVIEWER_ID]);
  await admin.query(`delete from parties where id = $1`, [REVIEWER_PARTY]);
}

afterAll(async () => {
  await clearFixtures();
  await admin.end();
});

function prepare(over: Partial<Parameters<typeof prepareConsolidationRun>[1]> = {}) {
  return prepareConsolidationRun(
    preparer,
    {
      code: RUN_CODE,
      periodCode: PERIOD,
      reportingCurrency: "TZS",
      asOf: AS_OF,
      entityIds: null,
      reason: `Contract test consolidation for period ${PERIOD}; asserts no financial consequence.`,
      ...over,
    },
    TRACE_PREPARE,
  );
}

const scope = () =>
  [entities.get("BEYU-TZH")!.id, entities.get("BEYU-AGR")!.id, entities.get("BEYU-FIN")!.id, entities.get("BEYU-UJZ")!.id];

describe("consolidation preparation — membership and authority", () => {
  it("refuses a group whose only member MCM has not profiled as consolidated", async () => {
    // BEYU-MIN is visible and seeded, and deliberately has no profile row: the run
    // must not decide for itself that an unprofiled company belongs to the group.
    await expectRefusal(
      () => prepare({ code: `CON-${TOKEN}-NOPROF`, entityIds: [entities.get("BEYU-MIN")!.id] }),
      "NO_CONSOLIDATED_ENTITIES",
      /marked consolidated in an MCM company profile/,
    );
    expect(await runCount(`CON-${TOKEN}-NOPROF`)).toBe(0);
  });

  it("names each exclusion and writes a run that records the attempt", async () => {
    const prepared = await prepare({ entityIds: scope() });
    expect(prepared.code).toBe(RUN_CODE);
    // No trial balance exists for any member, so nothing is translatable. The run is
    // still written — as COLLECTING, with NULL totals.
    expect(prepared.state).toBe("COLLECTING");
    expect(prepared.dataState).toBe("PENDING");
    expect(prepared.entitiesIncluded).toBe(0);
    expect(prepared.totalAssetsMinor).toBeNull();
    expect(prepared.totalLiabilitiesMinor).toBeNull();
    expect(prepared.totalEquityMinor).toBeNull();
    expect(prepared.residualMinor).toBeNull();
    expect(prepared.balances).toBe(false);
    expect(prepared.adjustments).toHaveLength(0);
    expect(prepared.outstanding.length).toBe(4);
    expect(new Set(prepared.outstanding.map((item) => item.kind))).toEqual(new Set(["TRIAL_BALANCE"]));
    expect(prepared.outstanding[0].reason).toMatch(/no journal entries/i);
    // The capability's own limits are reported separately from this run's gaps.
    expect(prepared.limitations.map((limitation) => limitation.kind)).toEqual([
      "INVESTMENT_ELIMINATION",
      "UNREALISED_PROFIT",
      "POSTING",
      "RATE_INTAKE",
    ]);
  });

  it("will not read the Finance OS ledger through consolidation authority", async () => {
    // The point of this case is that the ACT is permitted and the DATA is not.
    // `mcm:consolidation.prepare` says who may prepare a run; it says nothing about who
    // may read journals. Without this gate, preparing a consolidation would be a route
    // around `finance:ledger.read` for anyone holding MCM authority.
    const ledgerBlind: Principal = {
      ...preparer,
      authorityGrants: (preparer.authorityGrants ?? []).filter((grant) => grant.permission !== "finance:ledger.read"),
      permissions: new Set([...preparer.permissions].filter((permission: string) => permission !== "finance:ledger.read")),
    };
    // The fixture must be what it claims, or the assertion below proves nothing.
    expect(can(preparer, "finance:ledger.read").allowed, "the seeded CFO must hold the ledger read for this to be a test").toBe(true);
    expect(can(ledgerBlind, "finance:ledger.read").allowed).toBe(false);
    expect(can(ledgerBlind, "mcm:consolidation.prepare").allowed).toBe(true);

    const prepared = await prepareConsolidationRun(
      ledgerBlind,
      {
        code: `CON-${TOKEN}-BLIND`,
        periodCode: PERIOD,
        reportingCurrency: "TZS",
        asOf: AS_OF,
        entityIds: scope(),
        reason: `Authority-boundary test for period ${PERIOD}; asserts no financial consequence.`,
      },
      TRACE_PREPARE,
    );
    expect(prepared.state).toBe("COLLECTING");
    expect(prepared.entitiesIncluded).toBe(0);
    expect(prepared.totalAssetsMinor).toBeNull();
    expect(new Set(prepared.outstanding.map((item) => item.kind))).toEqual(new Set(["TRIAL_BALANCE_AUTHORITY"]));
    expect(prepared.outstanding[0].reason).toMatch(/finance:ledger\.read/);
    expect(prepared.outstanding[0].reason).toMatch(/will not read/i);
    // The attempt is still recorded, because a refused read that leaves no trace is
    // indistinguishable from a read that was never asked for.
    expect(await runCount(`CON-${TOKEN}-BLIND`)).toBe(1);
  });

  it("persists the run exactly as it was computed, with every constraint honoured", async () => {
    const [run] = await db.select().from(consolidationRuns).where(eq(consolidationRuns.code, RUN_CODE));
    expect(run.state).toBe("COLLECTING");
    expect(run.dataState).toBe("PENDING");
    expect(run.periodCode).toBe(PERIOD);
    expect(run.reportingCurrency).toBe("TZS");
    expect(run.periodId).toBeNull();
    expect(run.totalAssetsMinor).toBeNull();
    expect(run.eliminationsMinor).toBeNull();
    expect(run.preparedByUserId).toBe(preparer.userId);
    expect(run.reviewedByUserId).toBeNull();
    expect(run.reviewNote).toBeNull();
    expect(run.classification).toBe("RESTRICTED");
    // No governed rate source exists, and the engine invented none: the rate set is
    // empty rather than full of 1.0s.
    expect(run.rateSet).toEqual([]);

    const rows = await db
      .select()
      .from(consolidationEntities)
      .where(eq(consolidationEntities.runId, run.id))
      .orderBy(consolidationEntities.legalEntityId);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.included).toBe(false);
      // `consolidation_entities_unavailable_reason_check`: UNAVAILABLE requires a reason.
      expect(row.dataState).toBe("UNAVAILABLE");
      expect(row.unavailabilityReason).not.toBeNull();
      expect(row.unavailabilityReason!.length).toBeGreaterThan(40);
      // No figure was fabricated: the columns stay NULL, they are not zero.
      expect(row.translatedAssetsMinor).toBeNull();
      expect(row.translatedEquityMinor).toBeNull();
      expect(row.closingRate).toBeNull();
      expect(row.averageRate).toBeNull();
    }
    const adjustments = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(consolidationAdjustments)
      .where(eq(consolidationAdjustments.runId, run.id));
    expect(Number(adjustments[0].n)).toBe(0);
  });

  it("records the governed act in the audit ledger and the event stream", async () => {
    const [run] = await db.select({ id: consolidationRuns.id }).from(consolidationRuns).where(eq(consolidationRuns.code, RUN_CODE));
    const [audit] = await db
      .select({ action: sql<string>`action`, objectId: sql<string>`object_id`, traceId: sql<string>`trace_id` })
      .from(sql`audit_log`)
      .where(eq(sql`trace_id`, TRACE_PREPARE));
    expect(audit).toBeDefined();
    expect(audit.action).toBe("MCM_CONSOLIDATION_RUN_PREPARED");
    expect(audit.objectId).toBe(run.id);
    const [event] = await db
      .select({ subjectId: sql<string>`subject_id` })
      .from(sql`enterprise_events`)
      .where(eq(sql`trace_id`, TRACE_PREPARE));
    expect(event.subjectId).toBe(run.id);
  });

  it("refuses a second preparation under the same code, so both attempts stay auditable", async () => {
    await expectRefusal(() => prepare({ entityIds: scope() }), "RUN_EXISTS", /not a scratchpad/i);
    expect(await runCount(RUN_CODE)).toBe(1);
  });

  it("refuses a run over a period Finance OS has not opened for any member", async () => {
    const error = await refusal(() => prepare({ code: `CON-${TOKEN}-NOPERIOD`, periodCode: `${PERIOD_YEAR + 1}-11`, entityIds: scope() }));
    expect(error).toBeInstanceOf(McmError);
    expect((error as McmError).code).toBe("NO_PERIODS_FOR_PERIOD_CODE");
    expect(await runCount(`CON-${TOKEN}-NOPERIOD`)).toBe(0);
  });

  it("refuses an entity the caller cannot see instead of quietly narrowing the group", async () => {
    await expectRefusal(
      () => prepare({ code: `CON-${TOKEN}-SCOPE`, entityIds: ["LEN_NOT_VISIBLE_AT_ALL"] }),
      "ENTITY_NOT_IN_SCOPE",
    );
  });

  it("refuses a currency it cannot express, a malformed code, and a smuggled rate", async () => {
    await expectRefusal(() => prepare({ code: `CON-${TOKEN}-CUR`, reportingCurrency: "XBT" }), "UNSUPPORTED_REPORTING_CURRENCY");
    await expectRefusal(() => prepare({ code: `bad code`, reportingCurrency: "TZS" }), "INVALID_RUN_CODE");
    await expectRefusal(() => prepare({ code: `CON-${TOKEN}-P`, periodCode: "FY2031" }), "INVALID_PERIOD_CODE");
    await expectRefusal(() => prepare({ code: `CON-${TOKEN}-D`, asOf: "latest" }), "INVALID_AS_OF_DATE");
    // The contract itself has no field a caller could put a rate in.
    const { prepareConsolidationSchema } = await import("@/app/api/v1/mcm/_shared");
    for (const smuggled of [
      { fxRate: "2500" },
      { rate: "2500" },
      { rates: [{ base: "TZS", quote: "USD", rate: "0.0004" }] },
      { rateSet: [{ base: "TZS", quote: "USD", rate: "0.0004", rateType: "CLOSING" }] },
      { fxRates: ["2500"] },
      { source: "my bank's screen" },
      { asOf: "latest" },
      { periodCode: "2031-13" },
    ]) {
      expect(
        prepareConsolidationSchema.safeParse({ ...baseBody(), ...smuggled }).success,
        `a body carrying ${JSON.stringify(smuggled)} must be rejected, not ignored`,
      ).toBe(false);
    }
    expect(prepareConsolidationSchema.safeParse(baseBody()).success).toBe(true);
  });
});

describe("consolidation review — four eyes, in the database", () => {
  it("refuses the preparer, and refuses with the reason rather than a constraint error", async () => {
    const [run] = await db.select({ id: consolidationRuns.id }).from(consolidationRuns).where(eq(consolidationRuns.code, RUN_CODE));
    await expectRefusal(
      () => reviewConsolidationRun(preparer, { runId: run.id, decision: "REVIEWED", note: "The preparer attempting their own review." }, TRACE_REVIEW),
      "FOUR_EYES_REQUIRED",
      /cannot review their own/i,
    );
    const [unchanged] = await db.select().from(consolidationRuns).where(eq(consolidationRuns.id, run.id));
    expect(unchanged.state).toBe("COLLECTING");
    expect(unchanged.reviewedByUserId).toBeNull();
  });

  it("refuses a principal who does not hold the review authority at all", async () => {
    const [run] = await db.select({ id: consolidationRuns.id }).from(consolidationRuns).where(eq(consolidationRuns.code, RUN_CODE));
    await expectRefusal(
      () => reviewConsolidationRun(nonReviewer, { runId: run.id, decision: "REVIEWED", note: "Governance officer attempting a review." }, TRACE_REVIEW),
      "FORBIDDEN",
    );
  });

  it("requires a note, then records the reviewer and the timestamp", async () => {
    const second = await prepare({ code: REVIEW_CODE, entityIds: scope() });
    expect(second.state).toBe("COLLECTING");
    await expectRefusal(
      () => reviewConsolidationRun(reviewer, { runId: second.runId, decision: "REVIEWED", note: "seen" }, TRACE_REVIEW),
      "REVIEW_NOTE_REQUIRED",
    );
    const reviewed = await reviewConsolidationRun(
      reviewer,
      { runId: second.runId, decision: "REVIEWED", note: "Reviewed with the four exclusions declared; no figure was presented as complete." },
      TRACE_REVIEW,
    );
    expect(reviewed.state).toBe("REVIEWED");
    const [row] = await db.select().from(consolidationRuns).where(eq(consolidationRuns.id, second.runId));
    expect(row.state).toBe("REVIEWED");
    expect(row.reviewedByUserId).toBe(reviewer.userId);
    expect(row.reviewedByUserId).not.toBe(row.preparedByUserId);
    expect(row.reviewedAt).not.toBeNull();
    expect(row.reviewNote).toMatch(/no figure was presented as complete/);
    // Reviewing is not completing: the gaps the run recorded are still its state.
    expect(row.dataState).toBe("PENDING");

    await expectRefusal(
      () => reviewConsolidationRun(reviewer, { runId: second.runId, decision: "REJECTED", note: "A second opinion, after the fact." }, TRACE_REVIEW),
      "ALREADY_DECIDED",
      /not edited/i,
    );
  });

  it("enforces four-eyes at the database, not only in the service", async () => {
    const [run] = await db.select().from(consolidationRuns).where(eq(consolidationRuns.code, RUN_CODE));
    const error = await admin
      .query(
        `update consolidation_runs
            set state = 'REVIEWED', reviewed_by_user_id = prepared_by_user_id, reviewed_at = now(), review_note = 'Self-review attempted by a test.'
          where id = $1`,
        [run.id],
      )
      .then(() => null)
      .catch((err: Error) => err);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/consolidation_runs_review_check/);
    const [after] = await db.select({ state: consolidationRuns.state }).from(consolidationRuns).where(eq(consolidationRuns.id, run.id));
    expect(after.state).toBe("COLLECTING");
  });

  it("survives the read side: the overview lists the run and its declared gaps", async () => {
    const overview = await consolidationOverview(preparer);
    const listed = overview.runs.find((row) => row.code === REVIEW_CODE);
    expect(listed).toBeDefined();
    expect(listed!.state).toBe("REVIEWED");
    expect(listed!.entitiesIncluded).toBe(0);
    expect(listed!.totalAssetsMinor).toBeNull();
    // The latest run's per-entity rows are what a reader sees: every exclusion with
    // its reason, not a short list that looks complete.
    expect(overview.latestRunEntities.length).toBeGreaterThan(0);
    expect(overview.latestRunEntities.every((row) => row.dataState === "UNAVAILABLE")).toBe(true);
    expect(overview.latestRunEntities.every((row) => row.unavailabilityReason !== null)).toBe(true);
  });
});

function baseBody() {
  return {
    code: `CON-${TOKEN}-BODY`,
    periodCode: PERIOD,
    reportingCurrency: "TZS",
    asOf: AS_OF,
    reason: "Schema contract check for the prepare boundary.",
  };
}
