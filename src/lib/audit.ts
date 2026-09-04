import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, enterpriseEvents } from "@/db/schema";
import { newId, ID_PREFIX } from "./ids";
import { sha256, stableStringify } from "./crypto";
import { SYSTEM_VERSION } from "./constants";
import {
  assertInteroperabilityEnvelope,
  type AuthorityContext,
  type InteropClassification,
} from "./interoperability/contract";

/**
 * Tamper-evident append-only ledgers.
 *
 * Remediation C-01/C-06:
 * - appends are serialized by locking audit_chain_heads with SELECT ... FOR UPDATE
 * - the audit/event insert and chain-head update occur in one DB transaction
 * - partial unique indexes on prev_hash (migration) reject duplicate parents
 * - domain mutations can call recordAuditTx()/publishEventTx() inside the same transaction
 */

/**
 * Transaction handle passed to governed mutations.
 *
 * Domain services need to read and update inside the same transaction as the
 * audit append (e.g. recomputing a vote tally under a lock, then transitioning
 * the resolution status), so `select` and `update` are exposed alongside
 * `insert`/`execute`. This is the kernel's single transaction abstraction —
 * services must not open their own.
 */
export type Tx = Pick<typeof db, "insert" | "execute" | "select" | "update" | "delete">;

export type AuditInput = {
  tenantId?: string | null;
  actorUserId?: string | null;
  actorType?: "HUMAN" | "SERVICE" | "AI";
  action: string;
  objectType: string;
  objectId: string;
  outcome?: "SUCCESS" | "DENIED" | "FAILURE";
  reason?: string;
  authority?: string;
  approvalRef?: string;
  policyVersion?: string;
  aiVersion?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  traceId?: string;
};

/** Legacy v1 payload. Retained only to verify historical audit rows. */
export function canonicalAuditPayload(input: AuditInput, id: string, occurredAt: string): string {
  return stableStringify([
    id,
    input.tenantId ?? null,
    input.actorUserId ?? null,
    input.actorType ?? "HUMAN",
    input.action,
    input.objectType,
    input.objectId,
    input.outcome ?? "SUCCESS",
    input.oldValue ?? null,
    input.newValue ?? null,
    occurredAt,
  ]);
}

/**
 * Version 2 covers the complete audit envelope. The version marker itself is
 * hashed so a row cannot be silently re-labelled as another algorithm.
 */
export function canonicalAuditPayloadV2(
  input: AuditInput,
  id: string,
  occurredAt: string,
  systemVersion = SYSTEM_VERSION,
): string {
  return stableStringify([
    "2",
    id,
    input.tenantId ?? null,
    input.actorUserId ?? null,
    input.actorType ?? "HUMAN",
    input.action,
    input.objectType,
    input.objectId,
    input.outcome ?? "SUCCESS",
    input.reason ?? null,
    input.authority ?? null,
    input.approvalRef ?? null,
    input.policyVersion ?? null,
    systemVersion,
    input.aiVersion ?? null,
    input.oldValue ?? null,
    input.newValue ?? null,
    input.ipAddress ?? null,
    input.userAgent ?? null,
    input.traceId ?? null,
    occurredAt,
  ]);
}

async function lockChainHead(tx: Tx, chainName: "AUDIT_LOG" | "ENTERPRISE_EVENTS"): Promise<string | null> {
  await tx.execute(
    sql`insert into audit_chain_heads (chain_name, current_hash) values (${chainName}, null) on conflict (chain_name) do nothing`,
  );
  const result = await tx.execute<{ current_hash: string | null }>(
    sql`select current_hash from audit_chain_heads where chain_name = ${chainName} for update`,
  );
  return result.rows[0]?.current_hash ?? null;
}

async function updateChainHead(tx: Tx, chainName: "AUDIT_LOG" | "ENTERPRISE_EVENTS", hash: string) {
  await tx.execute(
    sql`update audit_chain_heads set current_hash = ${hash}, updated_at = now() where chain_name = ${chainName}`,
  );
}

async function appendAudit(tx: Tx, input: AuditInput): Promise<string> {
  const id = newId(ID_PREFIX.audit);
  const occurredAt = new Date().toISOString();
  const prevHash = await lockChainHead(tx, "AUDIT_LOG");
  const hashVersion = "2";
  const hash = sha256(`${prevHash ?? "GENESIS"}|${canonicalAuditPayloadV2(input, id, occurredAt)}`);

  await tx.insert(auditLog).values({
    id,
    tenantId: input.tenantId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType ?? "HUMAN",
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    outcome: input.outcome ?? "SUCCESS",
    reason: input.reason,
    authority: input.authority,
    approvalRef: input.approvalRef,
    policyVersion: input.policyVersion,
    systemVersion: SYSTEM_VERSION,
    aiVersion: input.aiVersion,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    traceId: input.traceId,
    occurredAt: new Date(occurredAt),
    prevHash,
    hashVersion,
    hash,
  });
  await updateChainHead(tx, "AUDIT_LOG", hash);
  return id;
}

export async function recordAudit(input: AuditInput): Promise<string> {
  return db.transaction((tx) => appendAudit(tx as unknown as Tx, input));
}

export async function recordAuditTx(tx: Tx, input: AuditInput): Promise<string> {
  return appendAudit(tx, input);
}

export type EventInput = {
  type: string;
  source: string;
  /** Common interoperability envelope fields. */
  domain: string;
  operation: string;
  destinationDomain: string | null;
  tenantId: string | null;
  legalEntityId: string | null;
  subjectType: string;
  subjectId: string;
  actorUserId?: string | null;
  actorType?: "HUMAN" | "SERVICE" | "AI";
  classification: InteropClassification;
  payload?: Record<string, unknown>;
  traceId: string;
  correlationId: string;
  causationId: string | null;
  authorityContext: AuthorityContext | null;
  policyVersion: string | null;
  /** Optional at the input boundary for legacy callers; the writer records a controlled default. */
  eventVersion?: string;
  schemaVersion?: string;
  /**
   * Sector-declared occurrence time (ISO 8601). When absent the writer stamps
   * the current time. Included verbatim in the hashed canonical payload, so
   * the declared time is tamper-evident once accepted.
   */
  occurredAt?: string;
};

/** Version 1 is retained solely for verification of historical events. */
function canonicalEventPayloadV1(input: {
  type: string;
  tenantId: string | null;
  subjectType: string;
  subjectId: string;
  payload: Record<string, unknown>;
}, id: string, occurredAt: string) {
  return stableStringify([
    id,
    input.type,
    input.tenantId,
    input.subjectType,
    input.subjectId,
    input.payload,
    occurredAt,
  ]);
}

/** Version 2 hashes the complete interoperability identity and correlation envelope. */
function canonicalEventPayloadV2(input: EventInput, id: string, occurredAt: string) {
  return stableStringify([
    id,
    input.type,
    input.eventVersion ?? "1",
    input.schemaVersion ?? "1",
    input.source,
    input.domain,
    input.operation,
    input.destinationDomain,
    input.tenantId,
    input.legalEntityId,
    input.subjectType,
    input.subjectId,
    input.actorUserId ?? null,
    input.actorType ?? "HUMAN",
    input.classification,
    input.payload ?? {},
    input.traceId,
    input.correlationId,
    input.causationId,
    input.authorityContext,
    input.policyVersion,
    occurredAt,
  ]);
}

async function appendEvent(tx: Tx, input: EventInput): Promise<string> {
  const id = newId(ID_PREFIX.event);
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const actorType = input.actorType ?? "HUMAN";
  assertInteroperabilityEnvelope({
    messageId: id,
    messageType: "DOMAIN_EVENT",
    eventType: input.type,
    eventVersion: input.eventVersion ?? "1",
    schemaVersion: input.schemaVersion ?? "1",
    sourceDomain: input.domain,
    destinationDomain: input.destinationDomain,
    operation: input.operation,
    globalUserId: input.actorUserId ?? null,
    principalId: input.actorUserId ?? null,
    actorType,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    traceId: input.traceId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    occurredAt,
    classification: input.classification,
    authorityContext: input.authorityContext,
    policyVersion: input.policyVersion,
    payload: input.payload ?? {},
  });
  const prevHash = await lockChainHead(tx, "ENTERPRISE_EVENTS");
  const hash = sha256(`${prevHash ?? "GENESIS"}|${canonicalEventPayloadV2(input, id, occurredAt)}`);

  await tx.insert(enterpriseEvents).values({
    id,
    type: input.type,
    source: input.source,
    eventVersion: input.eventVersion ?? "1",
    schemaVersion: input.schemaVersion ?? "1",
    domain: input.domain,
    operation: input.operation,
    destinationDomain: input.destinationDomain,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    actorUserId: input.actorUserId ?? null,
    actorType,
    classification: input.classification,
    payload: input.payload ?? {},
    traceId: input.traceId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    authorityContext: input.authorityContext,
    policyVersion: input.policyVersion,
    hashVersion: "2",
    occurredAt: new Date(occurredAt),
    prevHash,
    hash,
  });
  await updateChainHead(tx, "ENTERPRISE_EVENTS", hash);
  return id;
}

/** Publish a governed enterprise event (CloudEvents-aligned envelope). */
export async function publishEvent(input: EventInput): Promise<string> {
  return db.transaction((tx) => appendEvent(tx as unknown as Tx, input));
}

export async function publishEventTx(tx: Tx, input: EventInput): Promise<string> {
  return appendEvent(tx, input);
}

/**
 * Run a domain mutation, its audit record and its durable domain event(s) in ONE
 * transaction.
 *
 * `event` may return a single event or an array: a decision-producing mutation
 * emits both the act (e.g. VOTE_CAST) and its consequence (e.g. DECIDED), and
 * both must be durable atomically with the state transition. If any append
 * fails, the domain mutation rolls back with it.
 */
export async function withAuditTransaction<T>(
  operation: (tx: Tx) => Promise<T>,
  audit: (result: T) => AuditInput,
  event?: (result: T) => EventInput | EventInput[],
): Promise<T> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as Tx;
    const result = await operation(tx);
    await recordAuditTx(tx, audit(result));
    if (event) {
      const produced = event(result);
      // Appends are sequential: each event links to the previous hash, so the
      // chain must be extended one entry at a time.
      for (const e of Array.isArray(produced) ? produced : [produced]) {
        await publishEventTx(tx, e);
      }
    }
    return result;
  });
}

export type ChainVerification = {
  verified: boolean;
  records: number;
  brokenAt: string | null;
  duplicateParents: number;
  headMatches: boolean;
};

function expectedAuditHash(row: typeof auditLog.$inferSelect, prev: string | null): string | null {
  if (row.hashVersion === "2") {
    return sha256(
      `${prev ?? "GENESIS"}|${canonicalAuditPayloadV2(
        {
          tenantId: row.tenantId,
          actorUserId: row.actorUserId,
          actorType: row.actorType as "HUMAN" | "SERVICE" | "AI",
          action: row.action,
          objectType: row.objectType,
          objectId: row.objectId,
          outcome: row.outcome as "SUCCESS" | "DENIED" | "FAILURE",
          reason: row.reason ?? undefined,
          authority: row.authority ?? undefined,
          approvalRef: row.approvalRef ?? undefined,
          policyVersion: row.policyVersion ?? undefined,
          aiVersion: row.aiVersion ?? undefined,
          oldValue: row.oldValue ?? null,
          newValue: row.newValue ?? null,
          ipAddress: row.ipAddress ?? null,
          userAgent: row.userAgent ?? null,
          traceId: row.traceId ?? undefined,
        },
        row.id,
        row.occurredAt.toISOString(),
        row.systemVersion,
      )}`,
    );
  }

  // NULL/"1" rows are legacy hashes. They are still checked using the exact
  // historical algorithm, but are not represented as v2-complete evidence.
  if (row.hashVersion !== null && row.hashVersion !== "1") return null;
  return sha256(
    `${prev ?? "GENESIS"}|${canonicalAuditPayload(
      {
        tenantId: row.tenantId,
        actorUserId: row.actorUserId,
        actorType: row.actorType as "HUMAN" | "SERVICE" | "AI",
        action: row.action,
        objectType: row.objectType,
        objectId: row.objectId,
        outcome: row.outcome as "SUCCESS" | "DENIED" | "FAILURE",
        oldValue: row.oldValue ?? null,
        newValue: row.newValue ?? null,
      },
      row.id,
      row.occurredAt.toISOString(),
    )}`,
  );
}

/** Re-computes the complete audit hash chain. Used by assurance and tests. */
export async function verifyAuditChain(limit?: number): Promise<ChainVerification> {
  let query = db.select().from(auditLog).orderBy(auditLog.sequence).$dynamic();
  if (limit) query = query.limit(limit);
  const rows = await query;

  const forks = await db.execute<{ count: string }>(sql`
    select count(*)::text as count
    from (
      select prev_hash
      from audit_log
      where prev_hash is not null
      group by prev_hash
      having count(*) > 1
    ) forks
  `);
  const duplicateParents = Number(forks.rows[0]?.count ?? 0);

  let prev: string | null = null;
  for (const row of rows) {
    const expected = expectedAuditHash(row, prev);
    if (expected === null || expected !== row.hash || row.prevHash !== prev) {
      return { verified: false, records: rows.length, brokenAt: row.id, duplicateParents, headMatches: false };
    }
    prev = row.hash;
  }

  const head = await db.execute<{ current_hash: string | null }>(
    sql`select current_hash from audit_chain_heads where chain_name = 'AUDIT_LOG'`,
  );
  const headHash = head.rows[0]?.current_hash ?? null;
  return {
    verified: duplicateParents === 0 && headHash === prev,
    records: rows.length,
    brokenAt: null,
    duplicateParents,
    headMatches: headHash === prev,
  };
}

export type EventChainVerification = ChainVerification;

function expectedEventHash(row: typeof enterpriseEvents.$inferSelect, prev: string | null): string {
  const occurredAt = row.occurredAt.toISOString();
  const hashPayload =
    row.hashVersion === "2"
      ? canonicalEventPayloadV2({
          type: row.type,
          source: row.source,
          domain: row.domain ?? "",
          operation: row.operation ?? "",
          destinationDomain: row.destinationDomain ?? null,
          tenantId: row.tenantId ?? null,
          legalEntityId: row.legalEntityId ?? null,
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          actorUserId: row.actorUserId ?? null,
          actorType: row.actorType as "HUMAN" | "SERVICE" | "AI",
          eventVersion: row.eventVersion ?? "1",
          schemaVersion: row.schemaVersion,
          classification: row.classification as InteropClassification,
          payload: row.payload ?? {},
          traceId: row.traceId,
          correlationId: row.correlationId ?? "",
          causationId: row.causationId ?? null,
          authorityContext: (row.authorityContext ?? null) as AuthorityContext | null,
          policyVersion: row.policyVersion ?? null,
        }, row.id, occurredAt)
      : canonicalEventPayloadV1({
          type: row.type,
          tenantId: row.tenantId ?? null,
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          payload: row.payload ?? {},
        }, row.id, occurredAt);
  return sha256(`${prev ?? "GENESIS"}|${hashPayload}`);
}

/** Re-computes the complete enterprise event hash chain, including legacy v1 events. */
export async function verifyEventChain(limit?: number): Promise<EventChainVerification> {
  let query = db.select().from(enterpriseEvents).orderBy(enterpriseEvents.sequence).$dynamic();
  if (limit) query = query.limit(limit);
  const rows = await query;
  const forks = await db.execute<{ count: string }>(sql`
    select count(*)::text as count
    from (
      select prev_hash from enterprise_events
      where prev_hash is not null group by prev_hash having count(*) > 1
    ) forks
  `);
  const duplicateParents = Number(forks.rows[0]?.count ?? 0);
  let prev: string | null = null;
  for (const row of rows) {
    if (
      row.hashVersion !== null &&
      row.hashVersion !== "1" &&
      row.hashVersion !== "2"
    ) {
      return { verified: false, records: rows.length, brokenAt: row.id, duplicateParents, headMatches: false };
    }
    if (
      row.hashVersion === "2" &&
      (!row.eventVersion || !row.domain || !row.operation || !row.correlationId || !row.traceId || !row.schemaVersion)
    ) {
      return { verified: false, records: rows.length, brokenAt: row.id, duplicateParents, headMatches: false };
    }
    if (expectedEventHash(row, prev) !== row.hash || row.prevHash !== prev) {
      return { verified: false, records: rows.length, brokenAt: row.id, duplicateParents, headMatches: false };
    }
    prev = row.hash;
  }
  const head = await db.execute<{ current_hash: string | null }>(
    sql`select current_hash from audit_chain_heads where chain_name = 'ENTERPRISE_EVENTS'`,
  );
  const headHash = head.rows[0]?.current_hash ?? null;
  return {
    verified: duplicateParents === 0 && headHash === prev,
    records: rows.length,
    brokenAt: null,
    duplicateParents,
    headMatches: headHash === prev,
  };
}

/**
 * Provenance trail for a single governed object: who did what, when, under which
 * authority and with which outcome.
 *
 * `objectType` is part of the WHERE clause rather than a post-filter. Previously
 * it was applied after `limit(50)`, so a busy ledger could return an empty trail
 * for an object that genuinely had audit records.
 *
 * `tenantId` must be supplied by a caller that has already resolved the object
 * inside the principal's tenant scope; passing null restricts to platform-level
 * (tenant-less) records rather than matching every tenant.
 */
export async function auditTrailFor(
  objectType: string,
  objectId: string,
  tenantId?: string | null,
  limit = 50,
) {
  return db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.objectType, objectType),
        eq(auditLog.objectId, objectId),
        tenantId ? eq(auditLog.tenantId, tenantId) : isNull(auditLog.tenantId),
      ),
    )
    .orderBy(desc(auditLog.sequence))
    .limit(limit);
}

/** Provenance trails for many objects of one type in a single query. */
export async function auditTrailsFor(
  objectType: string,
  objectIds: string[],
  tenantIds: string[],
): Promise<Map<string, (typeof auditLog.$inferSelect)[]>> {
  const trails = new Map<string, (typeof auditLog.$inferSelect)[]>();
  if (objectIds.length === 0 || tenantIds.length === 0) return trails;

  const rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.objectType, objectType),
        inArray(auditLog.objectId, objectIds),
        inArray(auditLog.tenantId, tenantIds),
      ),
    )
    .orderBy(desc(auditLog.sequence));

  for (const row of rows) {
    const list = trails.get(row.objectId) ?? [];
    list.push(row);
    trails.set(row.objectId, list);
  }
  return trails;
}
