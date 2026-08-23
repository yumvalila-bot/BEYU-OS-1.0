import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, enterpriseEvents } from "@/db/schema";
import { newId, ID_PREFIX } from "./ids";
import { sha256, stableStringify } from "./crypto";
import { SYSTEM_VERSION } from "./constants";

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
  const hash = sha256(`${prevHash ?? "GENESIS"}|${canonicalAuditPayload(input, id, occurredAt)}`);

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
  tenantId?: string | null;
  subjectType: string;
  subjectId: string;
  actorUserId?: string | null;
  actorType?: "HUMAN" | "SERVICE" | "AI";
  classification?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "HIGHLY_RESTRICTED";
  payload?: Record<string, unknown>;
  traceId?: string;
  schemaVersion?: string;
};

function canonicalEventPayload(input: EventInput, id: string, occurredAt: string) {
  return stableStringify([
    id,
    input.type,
    input.tenantId ?? null,
    input.subjectType,
    input.subjectId,
    input.payload ?? {},
    occurredAt,
  ]);
}

async function appendEvent(tx: Tx, input: EventInput): Promise<string> {
  const id = newId(ID_PREFIX.event);
  const occurredAt = new Date().toISOString();
  const prevHash = await lockChainHead(tx, "ENTERPRISE_EVENTS");
  const hash = sha256(`${prevHash ?? "GENESIS"}|${canonicalEventPayload(input, id, occurredAt)}`);

  await tx.insert(enterpriseEvents).values({
    id,
    type: input.type,
    source: input.source,
    schemaVersion: input.schemaVersion ?? "1",
    tenantId: input.tenantId ?? null,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType ?? "HUMAN",
    classification: input.classification ?? "INTERNAL",
    payload: input.payload ?? {},
    traceId: input.traceId ?? id,
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

async function expectedAuditHash(row: typeof auditLog.$inferSelect, prev: string | null): Promise<string> {
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
    const expected = await expectedAuditHash(row, prev);
    if (expected !== row.hash || row.prevHash !== prev) {
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
