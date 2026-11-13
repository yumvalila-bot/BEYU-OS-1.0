/**
 * MULTI_COMPANY_MANAGEMENT — the consolidation engine's governed adapter.
 *
 * `consolidation_runs`, `consolidation_entities` and `consolidation_adjustments`
 * existed with their constraints, and `consolidationOverview` could read them, but
 * nothing ever wrote a row: a run could only exist if a human inserted it by hand.
 * This module is the missing half — and the arithmetic it drives lives in
 * `./consolidation-core`, which is pure and unit-tested without a database (see the
 * reason stated there: the ledger's immutability triggers mean no test may commit
 * journal rows, so a DB-only test could never hand the engine a real trial balance).
 *
 * WHAT THIS FILE IS RESPONSIBLE FOR
 *   * authority — `mcm:consolidation.prepare` / `.review` through the canonical
 *     `requireMcmCapability`, with the run's RESTRICTED classification stated;
 *   * scope — only entities `visibleEntities` returns, and every SQL read re-filters
 *     by tenant rather than trusting the scope it was handed;
 *   * membership — an entity is consolidated when its MCM company profile says so.
 *     No profile is not "not consolidated" and not "consolidated": it is reported in
 *     the response and absent from the run, because MCM has decided nothing about it;
 *   * the calendar — Finance OS owns `financial_periods` per entity, so the trial
 *     balance is scoped to the entity's own period row for the requested code;
 *   * finance authority — the trial balance comes from the Finance OS ledger, which is
 *     a DIFFERENT capability's data. `mcm:consolidation.prepare` is therefore not
 *     enough to read it: without `finance:ledger.read` the ledger is not queried at
 *     all and every member is excluded with that reason. The alternative — letting
 *     consolidation authority launder journal balances — is the permission bug this
 *     module would otherwise be;
 *   * FX authority — `fx_rates` rows, handed to `resolveRate`, which is the only
 *     thing that decides whether a rate may be used. This file mints no rate;
 *   * the write — run, entity rows and proposed adjustments in ONE transaction with
 *     its audit record and enterprise event, so no half-a-run can exist. That is not
 *     a stylistic preference here: migration 0077 gave `consolidation_entities` and
 *     `consolidation_adjustments` `USING false` DELETE policies, so the application
 *     role CANNOT delete a row of either kind. A run left half-written by a crash
 *     would be permanent, which is why nothing is written outside the transaction.
 *
 * WHAT IT NEVER DOES
 *   * It never posts. CAP_POSTING remains LOCKED, adjustments are written with
 *     `applied = false` and `approved_by_user_id` null, and no Finance OS row is
 *     touched. `consolidation_adjustments_approved_check` is what makes "applied"
 *     mean a named human approved it, so this module has no way to set it.
 *   * It never reports an absent figure as zero. When no member could be translated
 *     the run is written with state COLLECTING, `data_state` PENDING and NULL totals
 *     — a run that records the attempt and every reason for it — rather than totals
 *     of 0, which would read as "the group has no assets".
 *   * It never lets the preparer review. `consolidation_runs_review_check` enforces
 *     that in the database; `reviewConsolidationRun` refuses earlier so the reason
 *     reaches the caller as a governed refusal instead of a constraint violation.
 */
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  consolidationAdjustments,
  consolidationEntities,
  consolidationRuns,
  financialPeriods,
  fxRates,
  intercompanyTransactions,
  journalEntries,
  journalLines,
  ledgerAccounts,
  ownershipRecords,
} from "@/db/schema";
import { can, type Principal } from "@/lib/authz";
import { withAuditTransaction } from "@/lib/audit";
import { newId, ID_PREFIX } from "@/lib/ids";
import { resolveRate, type FxRate } from "@/lib/finance/fx";
import { isSupportedCurrency } from "@/lib/payments/money";
import { McmError, requireMcmCapability } from "./model";
import { mcmEvent } from "./services";
import { visibleEntities, type VisibleEntity } from "./read-services";
import {
  computeConsolidation,
  type AccountTotals,
  type ConsolidationCoreOutput,
  type EntityResult,
  type IntercompanyInput,
  type MemberInput,
  type RateKind,
  type RateLookup,
  type RateResolution,
} from "./consolidation-core";

export type { ConsolidationCoreOutput, EntityResult, OutstandingItem } from "./consolidation-core";
export { computeConsolidation } from "./consolidation-core";

export type PrepareConsolidationInput = {
  code: string;
  periodCode: string;
  reportingCurrency: string;
  /** The date every rate in the run is taken as at. No default: "latest rate" is a policy. */
  asOf: string;
  /** Optional narrowing; every id must already be visible to the principal. */
  entityIds?: string[] | null;
  reason: string;
};

export type PreparedConsolidationRun = {
  runId: string;
  code: string;
  /** COLLECTING means the attempt is recorded and nothing was translatable. */
  state: "COLLECTING" | "TRANSLATED" | "ELIMINATED";
  dataState: "CONSOLIDATED" | "PENDING";
  periodCode: string;
  asOf: string;
  reportingCurrency: string;
  entitiesRequested: number;
  entitiesIncluded: number;
  entitiesExcluded: number;
  /** Null when nothing translated: absent, not zero. */
  totalAssetsMinor: string | null;
  totalLiabilitiesMinor: string | null;
  totalEquityMinor: string | null;
  eliminationsMinor: string | null;
  residualMinor: string | null;
  balances: boolean;
  entities: EntityResult[];
  adjustments: Array<{
    ordinal: number;
    adjustmentType: string;
    description: string;
    amountMinor: string;
    currency: string;
    sourceReferences: string[];
    applied: false;
  }>;
  /** What this run could not do, in the words of the authority or the gap that stopped it. */
  outstanding: ConsolidationCoreOutput["outstanding"];
  /** What no run of this engine can do yet. Separate from `outstanding` by design. */
  limitations: Array<{ kind: string; appliesTo: string; statement: string }>;
};

/**
 * Consolidation entries this engine will not attempt at all, for any run.
 *
 * Kept apart from a run's `outstanding` items on purpose: a limitation of the
 * capability must not read as a defect in one period's data, and `dataState`
 * CONSOLIDATED has to mean something a preparer can actually achieve.
 */
export const CONSOLIDATION_LIMITATIONS: ReadonlyArray<{ kind: string; appliesTo: string; statement: string }> = [
  {
    kind: "INVESTMENT_ELIMINATION",
    appliesTo: "every run",
    statement:
      "a parent's investment in a subsidiary is not eliminated against that subsidiary's equity, because no account-to-consolidation mapping exists and MCM will not infer one from free-text account categories or names",
  },
  {
    kind: "UNREALISED_PROFIT",
    appliesTo: "every run",
    statement:
      "unrealised profit inside intragroup inventory or asset transfers is not eliminated, because the margin is not recorded on the intercompany transaction",
  },
  {
    kind: "POSTING",
    appliesTo: "every run",
    statement:
      "no elimination is written into Finance OS: CAP_POSTING remains LOCKED, adjustments stay applied = false, and a reviewed run remains an analysis a human must still act on through the finance rails",
  },
  {
    kind: "RATE_INTAKE",
    appliesTo: "every run",
    statement:
      "fx_rates has no write route and no ratified intake authority, so until a governed rate is recorded by a named person, any member whose functional currency differs from the reporting currency is excluded rather than translated",
  },
];

/* ------------------------------------------------------------------ */
/* Prepare                                                            */
/* ------------------------------------------------------------------ */

export async function prepareConsolidationRun(
  principal: Principal,
  input: PrepareConsolidationInput,
  traceId: string,
): Promise<PreparedConsolidationRun> {
  requireMcmCapability(principal, "mcm:consolidation.prepare", {}, "RESTRICTED");

  const reportingCurrency = input.reportingCurrency.trim().toUpperCase();
  const asOf = input.asOf.trim();
  if (!/^[A-Z]{3}$/.test(reportingCurrency)) {
    throw new McmError("INVALID_CURRENCY", `Reporting currency must be a 3-letter ISO code, got '${input.reportingCurrency}'.`, 422);
  }
  if (!isSupportedCurrency(reportingCurrency)) {
    // Refused up front rather than discovered halfway, and not worked around: a run
    // cannot be expressed in a currency whose minor unit is undefined here, and
    // inventing an exponent for a currency is an authoritative decision about that
    // currency. `CURRENCY_EXPONENTS` is where that decision is recorded.
    throw new McmError(
      "UNSUPPORTED_REPORTING_CURRENCY",
      `${reportingCurrency} has no registered minor-unit exponent in ` + "`CURRENCY_EXPONENTS`" + ", so no amount can be stated in its minor units. Refusing rather than assuming 2 decimal places: a wrong exponent is a 100× error that still looks like a number.",
      422,
      { currency: reportingCurrency },
    );
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.periodCode)) {
    throw new McmError("INVALID_PERIOD_CODE", `Period code must look like 2026-07, got '${input.periodCode}'.`, 422);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new McmError("INVALID_AS_OF_DATE", `The FX rate date must be an ISO date (YYYY-MM-DD), got '${input.asOf}'.`, 422);
  }
  if (!/^[A-Z][A-Z0-9_-]{2,39}$/.test(input.code.trim())) {
    throw new McmError("INVALID_RUN_CODE", "A run code is 3–40 characters of upper case letters, digits, hyphen or underscore.", 422);
  }

  const scope = await visibleEntities(principal);
  const wanted = input.entityIds?.length ? new Set(input.entityIds) : null;
  if (wanted) {
    const visibleIds = new Set(scope.map((entity) => entity.id));
    const unknown = [...wanted].filter((id) => !visibleIds.has(id));
    if (unknown.length > 0) {
      throw new McmError(
        "ENTITY_NOT_IN_SCOPE",
        `These entities are not visible to you and cannot be consolidated: ${unknown.join(", ")}.`,
        403,
      );
    }
  }
  const inScope = wanted ? scope.filter((entity) => wanted.has(entity.id)) : scope;
  if (inScope.length === 0) {
    throw new McmError("NO_ENTITIES_IN_SCOPE", "No legal entity is visible to consolidate.", 409);
  }

  const code = input.code.trim();
  const [existingRun] = await db
    .select({ id: consolidationRuns.id })
    .from(consolidationRuns)
    .where(and(eq(consolidationRuns.tenantId, principal.tenantId), eq(consolidationRuns.code, code)))
    .limit(1);
  if (existingRun) {
    throw new McmError(
      "RUN_EXISTS",
      `Consolidation run ${code} already exists (id ${existingRun.id}). A run is a governed record, not a scratchpad: prepare the corrected attempt under a new code so both stay auditable.`,
      409,
    );
  }

  /* ---------------------------------------------------------------- */
  /* 1. Membership: only entities MCM has profiled as consolidated     */
  /* ---------------------------------------------------------------- */
  const preExcluded: Array<{ entity: VisibleEntity; reason: string; kind: string }> = [];
  const members: VisibleEntity[] = [];
  for (const entity of inScope) {
    if (!entity.profile) {
      // Not an MCM row at all. Reported to the caller, absent from the run: there is
      // no MCM decision about this entity to record.
      preExcluded.push({ entity, kind: "PROFILE", reason: "No MCM company profile exists, so nothing records whether this entity is consolidated. Whether it belongs to the group is a decision, not a default." });
      continue;
    }
    if (entity.profile.consolidated !== true) {
      preExcluded.push({
        entity,
        kind: "EXCLUDED_BY_PROFILE",
        reason: `The company profile records consolidated = ${String(entity.profile.consolidated)} with method ${entity.profile.consolidationMethod}; excluded by a recorded decision, not by a gap.`,
      });
      continue;
    }
    members.push(entity);
  }
  if (members.length === 0) {
    throw new McmError(
      "NO_CONSOLIDATED_ENTITIES",
      `None of the ${inScope.length} visible ${inScope.length === 1 ? "entity is" : "entities are"} marked consolidated in an MCM company profile. A run over an empty group is not a consolidation; it is a row that looks like one.`,
      409,
    );
  }

  /* ---------------------------------------------------------------- */
  /* 2. Periods: Finance OS owns the calendar, per entity              */
  /* ---------------------------------------------------------------- */
  const periodRows = await db
    .select({
      id: financialPeriods.id,
      legalEntityId: financialPeriods.legalEntityId,
      endsOn: financialPeriods.endsOn,
    })
    .from(financialPeriods)
    .where(
      and(
        inArray(
          financialPeriods.legalEntityId,
          members.map((entity) => entity.id),
        ),
        eq(financialPeriods.code, input.periodCode),
      ),
    );
  const periodByEntity = new Map(periodRows.map((row) => [row.legalEntityId, row]));
  const withPeriod: Array<{ entity: VisibleEntity; periodId: string; endsOn: string }> = [];
  for (const entity of members) {
    const period = periodByEntity.get(entity.id);
    if (!period) {
      preExcluded.push({
        entity,
        kind: "PERIOD",
        reason: `Finance OS records no financial period ${input.periodCode} for ${entity.code}, so its trial balance cannot be scoped to that period. Summing every entry instead would put a period label on an unscoped total.`,
      });
      continue;
    }
    withPeriod.push({ entity, periodId: period.id, endsOn: isoDateOf(period.endsOn) });
  }
  if (withPeriod.length === 0) {
    throw new McmError(
      "NO_PERIODS_FOR_PERIOD_CODE",
      `No consolidated member has a Finance OS financial period ${input.periodCode}, so there is nothing to consolidate for it. ${preExcluded.length} exclusion(s) recorded; no run was written.`,
      409,
    );
  }

  /* ---------------------------------------------------------------- */
  /* 3. Trial balances — only for a principal who may read the ledger    */
  /* ---------------------------------------------------------------- */
  if (!can(principal, "finance:ledger.read").allowed) {
    // Nothing is read, and nothing is zeroed. Each member is excluded with the reason,
    // so the run shows an authority it did not have rather than a group with no
    // assets. `entityFinancialSnapshots` sets the precedent: MCM checks the owning
    // capability's permission before touching its table.
    for (const { entity } of withPeriod) {
      preExcluded.push({
        entity,
        kind: "TRIAL_BALANCE_AUTHORITY",
        reason:
          `The preparing principal does not hold finance:ledger.read, so MCM will not read ${entity.code}'s journal through consolidation authority. Consolidation can be prepared by someone with no right to see the ledger, and their run must not end up showing one.`,
      });
    }
    withPeriod.length = 0;
  }
  const balances = withPeriod.length > 0 ? await readTrialBalances(withPeriod) : new Map();

  /* ---------------------------------------------------------------- */
  /* 4. Ownership, effective at each entity's period end               */
  /* ---------------------------------------------------------------- */
  const ownershipRows = await db
    .select({
      id: ownershipRecords.id,
      ownedEntityId: ownershipRecords.ownedEntityId,
      ownerEntityId: ownershipRecords.ownerEntityId,
      ownershipType: ownershipRecords.ownershipType,
      economicPct: ownershipRecords.economicPct,
      effectiveFrom: ownershipRecords.effectiveFrom,
      effectiveTo: ownershipRecords.effectiveTo,
    })
    .from(ownershipRecords)
    .where(
      // NOT filtered by tenant, deliberately. `ownership_records.tenant_id` is the
      // tenant that RECORDED the holding, and in this group the same subsidiary's
      // interests are recorded under more than one tenant (the seeded BEYU-HEA rows
      // sit under both TEN_BEYU_TZ and TEN_BEYU_GROUP). Filtering by the preparing
      // tenant would silently drop a subsidiary's real ownership and then treat the
      // entity as unowned. The boundary that matters is the visible-entity set, which
      // `ownedEntityId` is already restricted to, plus the in-scope owner test below.
      and(
        inArray(
          ownershipRecords.ownedEntityId,
          withPeriod.map(({ entity }) => entity.id),
        ),
      ),
    );
  const scopedIds = new Set(inScope.map((entity) => entity.id));
  const endsOnById = new Map(withPeriod.map((row) => [row.entity.id, row.endsOn]));
  const ownershipFor = new Map<string, MemberInput["ownership"]>();
  const evidenceMissing = new Set<string>();
  for (const { entity } of withPeriod) {
    const endsOn = endsOnById.get(entity.id) ?? "";
    const isRootInScope = entity.parentEntityId === null || !scopedIds.has(entity.parentEntityId);
    const records = ownershipRows
      .filter(
        (row) =>
          row.ownedEntityId === entity.id &&
          row.ownerEntityId !== null &&
          scopedIds.has(row.ownerEntityId) &&
          // The registry's own window decides relevance; a record that has expired
          // or has not begun cannot support a percentage for this period.
          endsOn >= isoDateOf(row.effectiveFrom) &&
          (row.effectiveTo === null || endsOn <= isoDateOf(row.effectiveTo)),
      )
      .map((row) => ({ id: row.id, ownerEntityId: row.ownerEntityId as string, pct: row.economicPct, ownershipType: row.ownershipType }));
    ownershipFor.set(entity.id, records);
    if (!isRootInScope && records.length === 0) evidenceMissing.add(entity.id);
  }

  /* ---------------------------------------------------------------- */
  /* 5. Rates: `fx_rates` rows handed to the governed rail             */
  /* ---------------------------------------------------------------- */
  const { lookup, rateSetRows } = fxRateLookup(asOf);

  /* ---------------------------------------------------------------- */
  /* 6. Intercompany transactions for the period                        */
  /* ---------------------------------------------------------------- */
  const intercompany = withPeriod.length > 0
    ? await readIntercompanyForElimination(withPeriod.map(({ entity }) => entity.id), input.periodCode)
    : [];

  /* ---------------------------------------------------------------- */
  /* 7. The computation                                                 */
  /* ---------------------------------------------------------------- */
  const memberInputs: MemberInput[] = withPeriod.map(({ entity }) => ({
    id: entity.id,
    code: entity.code,
    functionalCurrency: entity.functionalCurrency,
    isRootInScope: entity.parentEntityId === null || !scopedIds.has(entity.parentEntityId),
    balancesByCurrency: balances.get(entity.id) ?? [],
    ownership: ownershipFor.get(entity.id) ?? [],
    ownershipEvidenceMissing: evidenceMissing.has(entity.id),
  }));

  const core = await computeConsolidation({
    periodCode: input.periodCode,
    asOf,
    reportingCurrency,
    members: memberInputs,
    intercompany,
    rates: lookup,
  });

  // Entities excluded before the arithmetic (no profile, no period) never reach the
  // core, so their rows are appended here: a reviewer reading the run must see the
  // whole membership and each reason, not an unexplained short list.
  const entityRows: EntityResult[] = [
    ...core.entities,
    ...preExcluded.map(({ entity, reason }) => ({
      legalEntityId: entity.id,
      entityCode: entity.code,
      included: false,
      dataState: "UNAVAILABLE" as const,
      unavailabilityReason: reason,
      functionalCurrency: entity.functionalCurrency,
      localCurrency: entity.functionalCurrency,
      localAssetsMinor: null,
      localLiabilitiesMinor: null,
      localEquityMinor: null,
      translatedAssetsMinor: null,
      translatedLiabilitiesMinor: null,
      translatedEquityMinor: null,
      translationReserveMinor: null,
      ownershipPct: null,
      closingRate: null,
      averageRate: null,
      sourceRefs: [],
    })),
  ];
  const outstanding = [...preExcluded.map(({ kind, entity, reason }) => ({ kind, subject: entity.code, reason })), ...core.outstanding];

  /* ---------------------------------------------------------------- */
  /* 8. One governed write                                              */
  /* ---------------------------------------------------------------- */
  const runId = newId(ID_PREFIX.consolidationRun);
  const complete = outstanding.length === 0;
  // COLLECTING is the honest state for a run nothing could translate; it is not a
  // failure to hide behind a total of zero.
  const state = core.nothingTranslatable ? "COLLECTING" : core.proposals.length > 0 ? "ELIMINATED" : "TRANSLATED";
  const dataState = complete ? "CONSOLIDATED" : "PENDING";
  const nullify = (value: string): string | null => (value === "" ? null : value);
  const writtenRateSet = [...rateSetRows.values()];

  await withAuditTransaction(
    async (tx) => {
      await tx.insert(consolidationRuns).values({
        id: runId,
        tenantId: principal.tenantId,
        code,
        // Consolidation spans one period PER entity, so there is no single period id
        // to name; the code is the join key and the id stays NULL rather than being
        // filled with an arbitrary leg.
        periodId: null,
        periodCode: input.periodCode,
        reportingCurrency,
        state,
        rateSet: writtenRateSet,
        entitiesIncluded: core.includedCount,
        totalAssetsMinor: nullify(core.totalAssetsMinor),
        totalLiabilitiesMinor: nullify(core.totalLiabilitiesMinor),
        totalEquityMinor: nullify(core.totalEquityMinor),
        eliminationsMinor: nullify(core.eliminationsMinor),
        residualMinor: nullify(core.residualMinor),
        preparedByUserId: principal.userId,
        dataState,
        classification: "RESTRICTED",
      });

      for (const entity of entityRows) {
        await tx.insert(consolidationEntities).values({
          id: newId(ID_PREFIX.consolidationEntity),
          runId,
          legalEntityId: entity.legalEntityId,
          functionalCurrency: entity.functionalCurrency,
          // An excluded row has no measured holding. `ownership_pct` is NOT NULL, so
          // the schema forces a number: 0 alongside data_state UNAVAILABLE reads as
          // "not determined", which is exactly what happened, and the reason column
          // says so rather than letting 0 be read as a nil stake.
          ownershipPct: entity.ownershipPct ?? "0.000000",
          closingRate: entity.closingRate,
          averageRate: entity.averageRate,
          localAssetsMinor: entity.localAssetsMinor,
          localLiabilitiesMinor: entity.localLiabilitiesMinor,
          localEquityMinor: entity.localEquityMinor,
          translatedAssetsMinor: entity.translatedAssetsMinor,
          translatedLiabilitiesMinor: entity.translatedLiabilitiesMinor,
          translatedEquityMinor: entity.translatedEquityMinor,
          translationReserveMinor: entity.translationReserveMinor,
          dataState: entity.dataState,
          unavailabilityReason: entity.unavailabilityReason,
          included: entity.included,
        });
      }

      for (const proposal of core.proposals) {
        await tx.insert(consolidationAdjustments).values({
          id: newId(ID_PREFIX.consolidationAdjustment),
          runId,
          adjustmentType: proposal.adjustmentType,
          description: proposal.description,
          debitEntityId: proposal.debitEntityId,
          creditEntityId: proposal.creditEntityId,
          amountMinor: proposal.amountMinor,
          currency: proposal.currency,
          sourceReferences: proposal.sourceReferences,
          applied: false,
          dataState: "PENDING",
          classification: "RESTRICTED",
        });
      }
      return { runId };
    },
    () => ({
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      action: "MCM_CONSOLIDATION_RUN_PREPARED",
      objectType: "CONSOLIDATION_RUN",
      objectId: runId,
      outcome: "SUCCESS",
      reason: input.reason,
      authority: "mcm:consolidation.prepare",
      traceId,
      newValue: {
        code,
        periodCode: input.periodCode,
        asOf,
        reportingCurrency,
        state,
        dataState,
        entitiesIncluded: core.includedCount,
        entitiesExcluded: entityRows.length - core.includedCount,
        adjustmentsProposed: core.proposals.length,
        totalAssetsMinor: nullify(core.totalAssetsMinor),
        totalLiabilitiesMinor: nullify(core.totalLiabilitiesMinor),
        totalEquityMinor: nullify(core.totalEquityMinor),
        residualMinor: nullify(core.residualMinor),
        outstanding: outstanding.map((item) => item.kind),
        limitations: CONSOLIDATION_LIMITATIONS.map((entry) => entry.kind),
      },
    }),
    () =>
      mcmEvent({
        tenantId: principal.tenantId,
        legalEntityId: null,
        type: "MCM_CONSOLIDATION_RUN_PREPARED",
        subjectType: "CONSOLIDATION_RUN",
        subjectId: runId,
        actorUserId: principal.userId,
        permission: "mcm:consolidation.prepare",
        classification: "RESTRICTED",
        traceId,
        payload: {
          code,
          periodCode: input.periodCode,
          reportingCurrency,
          state,
          dataState,
          entitiesIncluded: core.includedCount,
          adjustmentsProposed: core.proposals.length,
        },
      }),
  );

  return {
    runId,
    code,
    state,
    dataState,
    periodCode: input.periodCode,
    asOf,
    reportingCurrency,
    entitiesRequested: inScope.length,
    entitiesIncluded: core.includedCount,
    entitiesExcluded: entityRows.length - core.includedCount,
    totalAssetsMinor: nullify(core.totalAssetsMinor),
    totalLiabilitiesMinor: nullify(core.totalLiabilitiesMinor),
    totalEquityMinor: nullify(core.totalEquityMinor),
    eliminationsMinor: nullify(core.eliminationsMinor),
    residualMinor: nullify(core.residualMinor),
    balances: core.balances,
    entities: entityRows,
    adjustments: core.proposals.map((proposal, index) => ({
      ordinal: index + 1,
      adjustmentType: proposal.adjustmentType,
      description: proposal.description,
      amountMinor: proposal.amountMinor,
      currency: proposal.currency,
      sourceReferences: proposal.sourceReferences,
      applied: false as const,
    })),
    outstanding,
    limitations: CONSOLIDATION_LIMITATIONS.map((entry) => ({ ...entry })),
  };
}

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

/** Postgres `date` arrives as a Date or a string depending on the driver path. */
function isoDateOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

/**
 * One grouped read over the ONE ledger, per (entity, entry currency).
 *
 * Grouped by ENTRY currency and not merely by entity, because `journal_entries`
 * carries its own currency: an entity that posts in two currencies has two trial
 * balances, and summing them into one column would add together numbers whose units
 * differ. Each bucket is restated separately by the core.
 *
 * Debits minus credits for asset/expense accounts, credits minus debits for the
 * rest: that is the normal side of each account type, not an accounting judgement.
 */
async function readTrialBalances(
  withPeriod: ReadonlyArray<{ entity: VisibleEntity; periodId: string; endsOn: string }>,
): Promise<Map<string, Array<{ currency: string; accounts: AccountTotals }>>> {
  const result = new Map<string, Array<{ currency: string; accounts: AccountTotals }>>();
  if (withPeriod.length === 0) return result;
  // Scoped by (entity, that entity's own period row) and not merely by entity:
  // `journal_entries.period_id` is nullable by policy (P7 unratified), so an entry
  // with no period exists in the ledger but belongs to no period, and must not be
  // pulled into a run for one.
  //
  // The entity's OWN tenant is part of the predicate, and deliberately not the
  // preparing principal's: this group's subsidiaries each live in their own tenant, so
  // `journal_entries.tenant_id = <preparer's tenant>` would quietly drop a subsidiary's
  // whole ledger and the run would report "no journal entries" about data that exists.
  // The authorisation boundary is the visible-entity set, which these ids came from.
  const scopedPairs = sql.join(
    withPeriod.map(
      ({ entity, periodId }) =>
        sql`(${journalEntries.legalEntityId} = ${entity.id} and ${journalEntries.tenantId} = ${entity.tenantId} and ${journalEntries.periodId} = ${periodId} and ${ledgerAccounts.tenantId} = ${entity.tenantId})`,
    ),
    sql` or `,
  );
  const rows = await db
    .select({
      entityId: journalEntries.legalEntityId,
      currency: journalEntries.currency,
      accountType: ledgerAccounts.accountType,
      total: sql<string>`coalesce(sum(case when ${ledgerAccounts.accountType} in ('ASSET','EXPENSE') then ${journalLines.debit} - ${journalLines.credit} else ${journalLines.credit} - ${journalLines.debit} end), 0)::text`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .innerJoin(ledgerAccounts, eq(journalLines.accountId, ledgerAccounts.id))
    .where(scopedPairs)
    .groupBy(journalEntries.legalEntityId, journalEntries.currency, ledgerAccounts.accountType);

  for (const row of rows) {
    const list = result.get(row.entityId) ?? [];
    const bucket = list.find((entry) => entry.currency === row.currency);
    const accounts: Record<string, string> = bucket?.accounts ?? { ASSET: "0", LIABILITY: "0", EQUITY: "0", REVENUE: "0", EXPENSE: "0" };
    accounts[row.accountType] = row.total;
    if (bucket) bucket.accounts = accounts as AccountTotals;
    else list.push({ currency: row.currency, accounts: accounts as AccountTotals });
    result.set(row.entityId, list);
  }
  return result;
}

/**
 * Intra-group transactions that could support an elimination, for the run's period.
 *
 * Deliberately NOT filtered by state here: a transaction that is not yet authorized
 * on both sides still has to appear in the run's `outstanding` list, because "there
 * is a 40,000,000 balance we cannot eliminate yet" is information a reviewer needs,
 * while silently dropping it is not. The core decides what is eliminable.
 */
async function readIntercompanyForElimination(memberEntityIds: string[], periodCode: string): Promise<IntercompanyInput[]> {
  const rows = await db
    .select({
      id: intercompanyTransactions.id,
      reference: intercompanyTransactions.reference,
      currency: intercompanyTransactions.currency,
      amountMinor: intercompanyTransactions.amountMinor,
      state: intercompanyTransactions.state,
      receivableEntityId: intercompanyTransactions.receivableEntityId,
      payableEntityId: intercompanyTransactions.payableEntityId,
      reconciliationDifferenceMinor: intercompanyTransactions.reconciliationDifferenceMinor,
    })
    .from(intercompanyTransactions)
    .where(
      and(
        eq(intercompanyTransactions.periodCode, periodCode),
        // At least one leg must be a member of this run. The other leg may be outside
        // the group — that is exactly the case the core reports as "not eliminable
        // here" — but a transaction between two entities this caller cannot see is not
        // this run's data and is not read.
        or(inArray(intercompanyTransactions.receivableEntityId, memberEntityIds), inArray(intercompanyTransactions.payableEntityId, memberEntityIds)),
      ),
    );
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    currency: row.currency,
    amountMinor: row.amountMinor,
    bothSidesAuthorized: row.state === "BOTH_SIDES_AUTHORIZED" || row.state === "RECONCILED",
    state: row.state,
    receivableEntityId: row.receivableEntityId,
    payableEntityId: row.payableEntityId,
    reconciliationDifferenceMinor: row.reconciliationDifferenceMinor,
  }));
}

/**
 * The rate authority this engine can see: `fx_rates`, and nothing else.
 *
 * `fx_rates` is the MCM table the schema introduced for exactly this purpose
 * ("Effective-dated FX rate with provenance… so a consolidated figure can always
 * name where its rate came from") and which has had no reader until now. A row is
 * offered to `resolveRate` as GOVERNED only when it names a source, a provenance and
 * the person who recorded it; an incomplete row is offered as REFERENCE_DATA, which
 * the rail refuses to convert with. The engine therefore cannot use a number that no
 * one has stood behind, and it holds no precedence rule of its own: two governed
 * rates that disagree come back as `RATE_CONFLICT`, quoted.
 *
 * There is still no governed way to PUT a row in that table — no route, no
 * permission, no ratified intake — which is why `RATE_INTAKE` is in
 * `CONSOLIDATION_LIMITATIONS` and why a cross-currency run on a database nobody has
 * populated produces exclusions rather than figures.
 */
function fxRateLookup(asOf: string): {
  lookup: RateLookup;
  rateSetRows: Map<string, { base: string; quote: string; rate: string; rateType: string; rateDate: string; source: string }>;
} {
  const cache = new Map<string, RateResolution>();
  const rateSetRows = new Map<string, { base: string; quote: string; rate: string; rateType: string; rateDate: string; source: string }>();

  const lookup: RateLookup = async ({ from, to, kind }: { from: string; to: string; kind: RateKind }): Promise<RateResolution> => {
    const key = `${from}/${to}@${asOf}:${kind}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const rows = await db
      .select({
        id: fxRates.id,
        baseCurrency: fxRates.baseCurrency,
        quoteCurrency: fxRates.quoteCurrency,
        rate: fxRates.rate,
        rateDate: fxRates.rateDate,
        rateType: fxRates.rateType,
        source: fxRates.source,
        provenance: fxRates.provenance,
        recordedBy: fxRates.recordedBy,
      })
      .from(fxRates)
      .where(and(eq(fxRates.baseCurrency, from), eq(fxRates.quoteCurrency, to), eq(fxRates.rateDate, asOf), eq(fxRates.rateType, kind)));

    const candidates: FxRate[] = [];
    for (const row of rows) {
      const complete = row.source.trim().length > 0 && row.provenance.trim().length > 0 && row.recordedBy.trim().length > 0;
      candidates.push({
        fromCurrency: row.baseCurrency,
        toCurrency: row.quoteCurrency,
        rate: row.rate,
        asOf: isoDateOf(row.rateDate),
        sourceKind: complete ? "GOVERNED" : "REFERENCE_DATA",
        sourceAuthority: row.source,
        approvedByResolutionId: row.provenance,
        provenanceComplete: complete,
      });
      rateSetRows.set(`${from}/${to}@${kind}`, {
        base: row.baseCurrency,
        quote: row.quoteCurrency,
        rate: row.rate,
        rateType: kind,
        rateDate: isoDateOf(row.rateDate),
        source: `fx_rates/${row.id}; source ${row.source}; provenance ${row.provenance}; recorded_by ${row.recordedBy}`,
      });
    }

    const resolution = await resolveRate({ fromCurrency: from, toCurrency: to, asOf, governedRates: candidates });
    const outcome: RateResolution =
      resolution.usable && resolution.rate
        ? {
            ok: true,
            rate: resolution.rate.rate,
            // Cite the ROWS carrying that rate, so a figure can be traced to the
            // person who recorded it without re-reading the table.
            rowIds: rows.filter((row) => row.rate === resolution.rate?.rate).map((row) => row.id),
          }
        : { ok: false, decision: resolution.decision, reason: resolution.reason };
    cache.set(key, outcome);
    return outcome;
  };

  return { lookup, rateSetRows };
}

/* ------------------------------------------------------------------ */
/* Review                                                             */
/* ------------------------------------------------------------------ */

export type ReviewConsolidationInput = {
  runId: string;
  decision: "REVIEWED" | "REJECTED";
  note: string;
};

/**
 * Review a prepared run. Two humans, always, and the second one says something.
 *
 * Four-eyes is a database constraint (`consolidation_runs_review_check`: a REVIEWED
 * row needs a reviewer, a timestamp, a note, and
 * `reviewed_by_user_id <> prepared_by_user_id`). This refuses earlier and more
 * legibly, and holds a REJECTED decision to the same evidentiary bar, because "I
 * looked at it and it is wrong" is also a governed act.
 *
 * Review changes the run's state only. It marks no adjustment applied, touches no
 * ledger, and cannot retire the run's gaps: `data_state` stays PENDING wherever a
 * member was excluded, so "a person reviewed this" and "this is complete" remain two
 * separate claims.
 */
export async function reviewConsolidationRun(
  principal: Principal,
  input: ReviewConsolidationInput,
  traceId: string,
): Promise<{ runId: string; code: string; state: string; reviewedAt: string }> {
  requireMcmCapability(principal, "mcm:consolidation.review", {}, "RESTRICTED");
  const [run] = await db
    .select()
    .from(consolidationRuns)
    .where(and(eq(consolidationRuns.id, input.runId), eq(consolidationRuns.tenantId, principal.tenantId)))
    .limit(1);
  if (!run) throw new McmError("RUN_NOT_FOUND", `Consolidation run ${input.runId} was not found.`, 404);
  if (run.state === "REVIEWED" || run.state === "REJECTED") {
    throw new McmError(
      "ALREADY_DECIDED",
      `Run ${run.code} is already ${run.state}. A consolidation decision is not edited; a corrected run is prepared under a new code so both attempts stay auditable.`,
      409,
    );
  }
  if (run.preparedByUserId === principal.userId) {
    throw new McmError(
      "FOUR_EYES_REQUIRED",
      "The preparer cannot review their own consolidation run. The database enforces this too; this refusal exists so the reason reaches the caller instead of a constraint violation.",
      403,
    );
  }
  const note = input.note.trim();
  if (note.length < 8) {
    throw new McmError(
      "REVIEW_NOTE_REQUIRED",
      "A review note of at least 8 characters is required — a decision with nothing said for it is not evidence.",
      422,
    );
  }
  const reviewedAt = new Date();
  await withAuditTransaction(
    async (tx) => {
      await tx
        .update(consolidationRuns)
        .set({ state: input.decision, reviewedByUserId: principal.userId, reviewedAt, reviewNote: note })
        .where(eq(consolidationRuns.id, run.id));
      return { ok: true };
    },
    () => ({
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      action: `MCM_CONSOLIDATION_RUN_${input.decision}`,
      objectType: "CONSOLIDATION_RUN",
      objectId: run.id,
      outcome: "SUCCESS",
      reason: note,
      authority: "mcm:consolidation.review",
      traceId,
      newValue: { state: input.decision, reviewedByUserId: principal.userId, reviewedAt: reviewedAt.toISOString() },
      oldValue: { state: run.state, reviewedByUserId: run.reviewedByUserId },
    }),
    () =>
      mcmEvent({
        tenantId: principal.tenantId,
        legalEntityId: null,
        type: `MCM_CONSOLIDATION_RUN_${input.decision}`,
        subjectType: "CONSOLIDATION_RUN",
        subjectId: run.id,
        actorUserId: principal.userId,
        permission: "mcm:consolidation.review",
        classification: "RESTRICTED",
        traceId,
        payload: { code: run.code, decision: input.decision },
      }),
  );
  return { runId: run.id, code: run.code, state: input.decision, reviewedAt: reviewedAt.toISOString() };
}
