/**
import { appendPaymentAudit, withPaymentTenantScope } from "./audit-scope"; * The payment ingestion pipeline — the one door a provider event walks through.
 *
 * ORDERING IS THE SECURITY MODEL. Each step may only narrow what the next step is
 * allowed to believe:
 *
 *   1  identify the channel from the URL path and the enabled connection — never
 *      from the payload. Tenant, legal entity and country are inherited from the
 *      connection row, so a body cannot claim a different tenant than the
 *      credential that signed it.
 *   2  authenticate (HMAC over `${timestamp}.${rawBody}`, constant-time compare,
 *      clock-skew window). An unauthenticated body is recorded and refused; it
 *      never becomes a transaction.
 *   3  deduplicate against the durable inbox, unique on (connection, provider
 *      event id) — the only idempotency that survives two processes and a crash.
 *   4  normalize into candidate money. An unparseable payload is recorded and
 *      refused; a partially parseable one records its gaps.
 *   5  resolve party / own-account / invoice from canonical records on exact
 *      matches only.
 *   6  persist one transaction with trust RAW→AUTHENTICATED, plus its immutable
 *      transition trail, plus any exceptions, plus its audit record and governed
 *      events, in ONE RLS-scoped transaction.
 *   7  run deterministic risk rules; they can block advance, never delete.
 *
 * WHAT THIS FILE CANNOT DO
 *   It does not post. It does not touch `journal_entries`, `ledger_accounts` or
 *   `treasury_positions`, and it does not grant anything. Reaching accounting is
 *   `accounting.ts` + `postJournal()` + `CAP_POSTING`, all outside here. An
 *   ingest therefore ends at AUTHENTICATED / RECONCILIATION_REQUIRED and that is
 *   the correct terminal state for a webhook, however inconvenient it looks next
 *   to a "posted" flag.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import {
  paymentTransactionStates,
  paymentTransactions,
  paymentWebhookEvents,
} from "@/db/schema";
import { ID_PREFIX, newId } from "@/lib/ids";
import { publishEvent } from "@/lib/audit";
import { appendPaymentAudit, withPaymentTenantScope } from "./audit-scope";
import { NO_AUTHORITY_CONTEXT, paymentEvent } from "./events";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import { adapterFor } from "./providers";
import { type RawInbound } from "./providers/adapter";
import { findCandidateConnections, loadConfiguration, loadProviderRow, secretFromRef, type PaymentConfiguration } from "./config";
import { assertTransition, describeUntrustedText, PAYMENT_DOMAIN_VERSION } from "./domain";
import { raiseException } from "./exceptions";
import { evaluateRisk, type RiskSignal } from "./risk";
import { counterpartyDigest, normalizeCounterpartyRef, resolveAccount, resolveParty, stableDigest } from "./resolve";

export const INGEST_VERSION = "payment-ingest-1.1.0";

/** Hard ceiling on accepted request bodies, mirrored by a DB CHECK in 0028. */
export const MAX_PAYLOAD_BYTES = 256 * 1024;

export const GROSS_REQUIRED_GAPS = new Set([
  "AMOUNT_ABSENT",
  "AMOUNT_INVALID_AMOUNT",
  "AMOUNT_UNSUPPORTED_CURRENCY",
  "AMOUNT_AMOUNT_OVERFLOW",
  "AMOUNT_FRACTIONAL_MINOR_UNIT",
  "AMOUNT_NEGATIVE_AMOUNT",
]);

export type IngestRequest = {
  providerCode: string;
  rawBody: string;
  headers: Record<string, string>;
  connectionIdHeader?: string | null;
  sourceIp?: string | null;
  receivedAt?: Date;
  traceId?: string | null;
  correlationId?: string | null;
};

export type IngestReceipt = {
  outcome: "INGESTED" | "DUPLICATE" | "REJECTED";
  /** HTTP status the route should return. */
  // 422 is reserved for a payload the money model itself refused: the signature
  // verified, the data was not. A provider retrying that delivery gets the same
  // answer, which is the point of distinguishing it from 400 and 503.
  status: 200 | 202 | 400 | 401 | 409 | 413 | 422 | 503;
  code: string;
  message: string;
  webhookEventId: string | null;
  transactionId: string | null;
  verificationStatus: string | null;
  trustLevel: string | null;
  reconciliationStatus: string | null;
  gaps: string[];
  riskFindings: RiskSignal[];
  configurationProblems: string[];
  correlationId: string | null;
};

type ReceiptPatch = Partial<Omit<IngestReceipt, "outcome" | "status" | "code" | "message">> &
  Pick<IngestReceipt, "outcome" | "status" | "code" | "message">;

/**
 * Drizzle wraps the driver error, so the SQLSTATE and constraint name live on
 * `cause` — never on `message`. Returns the refusal details when a Postgres
 * integrity constraint rejected a payload, and null for anything else, which
 * must keep propagating as a real fault.
 */
function driverConstraintFailure(e: unknown): { sqlstate: string; constraint: string } | null {
  const cause = (e as { cause?: { code?: string; constraint?: string } } | undefined)?.cause;
  const code = cause?.code ?? "";
  if (code !== "23514" && code !== "23502" && code !== "23503") return null;
  return { sqlstate: code, constraint: cause?.constraint || "unknown_constraint" };
}

function receipt(input: ReceiptPatch): IngestReceipt {
  return {
    webhookEventId: null,
    transactionId: null,
    verificationStatus: null,
    trustLevel: null,
    reconciliationStatus: null,
    gaps: [],
    riskFindings: [],
    configurationProblems: [],
    correlationId: null,
    ...input,
  };
}

/**
 * Step 1-2. Everything a provider asserts about *identity* is ignored; the
 * channel is what the URL and the enabled connection say it is.
 */
type ChannelResolution =
  | { ok: false; error: "UNKNOWN_PROVIDER" | "NO_ACTIVE_CONNECTION" | "AMBIGUOUS_CONNECTION" | "PROVIDER_NOT_REGISTERED" }
  | { ok: true; adapter: NonNullable<ReturnType<typeof adapterFor>>; connection: Awaited<ReturnType<typeof findCandidateConnections>>[number]; provider: NonNullable<Awaited<ReturnType<typeof loadProviderRow>>> };

async function resolveChannel(request: IngestRequest): Promise<ChannelResolution> {
  const adapter = adapterFor(request.providerCode);
  if (!adapter) return { ok: false, error: "UNKNOWN_PROVIDER" };
  // A webhook arrives with no principal, so no request-scope RLS context exists
  // (the authenticated routes get theirs from `guarded()` in src/lib/api.ts).
  // Connection resolution therefore runs in a short-lived platform scope, and it
  // is deliberately the ONLY read made that way: it selects the connection
  // catalogue by provider code, never a payment row, and the tenant is then
  // DERIVED from the matched connection — a caller-supplied tenant id in the
  // payload is ignored, never trusted. Every subsequent read and write happens
  // inside `withDatabaseRlsContext([connection.tenantId], false, …)`.
  const candidates = await withDatabaseRlsContext([], true, () =>
    findCandidateConnections({
      providerCode: request.providerCode,
      connectionId: request.connectionIdHeader ?? null,
    }),
  );
  if (candidates.length === 0) return { ok: false, error: "NO_ACTIVE_CONNECTION" };
  if (candidates.length > 1) return { ok: false, error: "AMBIGUOUS_CONNECTION" };
  const connection = candidates[0]!;
  const provider = await loadProviderRow(connection.providerCode);
  if (!provider) return { ok: false, error: "PROVIDER_NOT_REGISTERED" };
  return { ok: true, adapter, connection, provider };
}

/**
 * The whole pipeline. Never throws for a bad *provider* input: an unusable
 * payload is a 4xx plus a durable record, because the record is what a human
 * reconciles from later.
 */
/**
 * True when the failure is Postgres' unique-index violation on `constraint`
 * (SQLSTATE 23505). Deliberately conservative: an unrecognised error is NOT
 * treated as a duplicate, so a real outage is still reported as one.
 */
function isUniqueViolation(e: unknown, constraint: string): boolean {
  const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string; constraint?: string } };
  const code = err.cause?.code ?? err.code;
  if (code !== "23505") return false;
  const haystack = `${err.cause?.constraint ?? ""} ${err.cause?.message ?? ""} ${err.message ?? ""}`;
  return haystack.includes(constraint);
}

export async function ingestWebhookEvent(request: IngestRequest): Promise<IngestReceipt> {
  const receivedAt = request.receivedAt ?? new Date();
  const correlationId = request.correlationId ?? request.traceId ?? null;

  const bodyBytes = Buffer.byteLength(request.rawBody ?? "", "utf8");
  if (bodyBytes === 0) {
    // No tenant is attributable yet, and `audit_log`'s RLS only admits a
    // tenant-less row inside a short-lived platform-scope transaction — the same
    // sanctioned pattern the login route uses for pre-auth denials. Without the
    // wrapper the refusal would throw out of the route instead of being recorded.
    await appendPaymentAudit({
      action: "PAYMENT_WEBHOOK_REJECTED",
      objectType: "payment_webhook_event",
      objectId: "unattributed",
      outcome: "DENIED",
      reason: "EMPTY_BODY",
      authority: INGEST_VERSION,
      newValue: { provider: describeUntrustedText(request.providerCode, 40) },
    });
    return receipt({ outcome: "REJECTED", status: 400, code: "EMPTY_BODY", message: "Request body is empty.", correlationId });
  }
  if (bodyBytes > MAX_PAYLOAD_BYTES) {
    return receipt({
      outcome: "REJECTED",
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes.`,
      correlationId,
    });
  }

  const channel = await resolveChannel(request);
  if (!channel.ok) {
    // Refused before attribution is possible, so nothing is written to a tenant's
    // tables; the refusal itself is audited against the platform, not a tenant.
    await appendPaymentAudit({
      action: "PAYMENT_WEBHOOK_REJECTED",
      objectType: "payment_webhook_event",
      objectId: `provider:${describeUntrustedText(request.providerCode, 40) || "unknown"}`,
      outcome: "DENIED",
      reason: channel.error,
      authority: INGEST_VERSION,
      newValue: { bytes: bodyBytes, hasConnectionHeader: Boolean(request.connectionIdHeader) },
    });
    return receipt({
      outcome: "REJECTED",
      status: channel.error === "UNKNOWN_PROVIDER" ? 400 : 503,
      code: channel.error,
      message:
        channel.error === "UNKNOWN_PROVIDER"
          ? "No adapter is registered for this provider."
          : channel.error === "AMBIGUOUS_CONNECTION"
            ? "More than one enabled connection matches this endpoint; send the connection identifier so the channel is unambiguous."
            : "No enabled provider connection is available for this endpoint.",
      correlationId,
    });
  }
  const { adapter, connection, provider } = channel;

  // The provider is only as good as its registered status. A connection that is
  // enabled while the provider row still says NOT_INTEGRATED is a configuration
  // contradiction; refuse it loudly rather than quietly accepting money from a
  // channel nobody ratified.
  if (provider.integrationStatus === "NOT_INTEGRATED") {
    return receipt({
      outcome: "REJECTED",
      status: 503,
      code: "PROVIDER_NOT_INTEGRATED",
      message: "The provider is enabled at connection level but not registered as integrated; refusing to ingest.",
      correlationId,
      configurationProblems: ["PROVIDER_NOT_INTEGRATED"],
    });
  }

  const signingSecret = secretFromRef(connection.signingSecretRef);
  const raw: RawInbound = {
    rawBody: request.rawBody,
    headers: lowerHeaders(request.headers),
    providerCode: request.providerCode,
    receivedAt,
    sourceIp: request.sourceIp ?? null,
  };

  const verification = adapter.verifyInbound(raw, {
    signingSecret,
    maxClockSkewSeconds: 300,
  });

  const eventId = newId(ID_PREFIX.paymentWebhookEvent);
  const payloadDigest = stableDigest(request.rawBody);
  const providerEventHeader = firstHeader(request.headers, ["x-beyu-event-id", "x-provider-event-id", "x-mock-event-id"]) ?? null;

  // Step 3 — durable inbox. Written for every attempt, including failures: an
  // unverified event is still evidence of an attempt against a live channel.
  const inboxState = verification.signatureValid ? "RECEIVED" : "REJECTED";
  try {
    await withDatabaseRlsContext([connection.tenantId], false, async () => {
      await db.insert(paymentWebhookEvents).values({
        id: eventId,
        tenantId: connection.tenantId,
        legalEntityId: connection.legalEntityId,
        providerCode: connection.providerCode,
        connectionId: connection.id,
        providerEventId: providerEventHeader ?? `digest:${payloadDigest.slice(0, 32)}`,
        eventType: "TRANSACTION",
        payloadDigest,
        payloadSizeBytes: bodyBytes,
        signatureValid: verification.signatureValid ? 1 : 0,
        timestampValid: verification.timestampValid ? 1 : 0,
        replayDetected: verification.replaySuspected ? 1 : 0,
        verificationDetail: verification.detail.slice(0, 120),
        processingState: inboxState,
        attemptCount: 1,
        correlationId,
        traceId: request.traceId ?? null,
        sourceIp: request.sourceIp ?? null,
        receivedAt,
      });
    });
  } catch (e) {
    // Drizzle wraps the driver error, so the constraint name lives on `cause`, not
    // on `message`. String-matching the message alone silently turns every genuine
    // duplicate delivery into a 503, which is exactly the opposite of what an
    // idempotent inbox is for.
    if (isUniqueViolation(e, "payment_webhook_events_inbox_uidx")) {
      return await handleDuplicate({ request, connection, payloadDigest, verificationValid: verification.signatureValid, correlationId });
    }
    return receipt({
      outcome: "REJECTED",
      status: 503,
      code: "INGEST_UNAVAILABLE",
      message: "The event could not be recorded; nothing was accepted.",
      correlationId,
      configurationProblems: [`DB_WRITE_FAILED`],
    });
  }

  if (!verification.signatureValid || !verification.timestampValid) {
    await withDatabaseRlsContext([connection.tenantId], false, async () => {
      await raiseException({
        tenantId: connection.tenantId,
        legalEntityId: connection.legalEntityId,
        webhookEventId: eventId,
        code: verification.signatureValid ? "BAD_TIMESTAMP" : "UNSIGNED_PAYLOAD",
        severity: "HIGH",
        detail: {
          detail: verification.detail,
          clockSkewSeconds: verification.clockSkewSeconds,
          scheme: provider.signatureScheme,
          hasSecretRef: Boolean(connection.signingSecretRef),
        },
        correlationId,
      });
    });
    await appendPaymentAudit({
      tenantId: connection.tenantId,
      actorType: "SERVICE",
      action: "PAYMENT_WEBHOOK_REJECTED",
      objectType: "payment_webhook_event",
      objectId: eventId,
      outcome: "DENIED",
      reason: verification.signatureValid ? verification.detail : "SIGNATURE_INVALID",
      authority: INGEST_VERSION,
      newValue: { provider: connection.providerCode, bytes: bodyBytes },
    });
    return receipt({
      outcome: "REJECTED",
      status: 401,
      code: verification.signatureValid ? "BAD_TIMESTAMP" : "UNSIGNED_PAYLOAD",
      message: "The event failed authentication and was recorded as a refusal.",
      webhookEventId: eventId,
      correlationId,
    });
  }

  // Step 4 — normalize.
  let normalized;
  try {
    normalized = adapter.parseInbound(raw);
  } catch (e) {
    const reason = e instanceof Error ? describeUntrustedText(e.message, 200) : "unparseable";
    await withDatabaseRlsContext([connection.tenantId], false, async () => {
      await db.update(paymentWebhookEvents).set({ processingState: "REJECTED", lastErrorCode: "PAYLOAD_UNPARSEABLE", processedAt: new Date() }).where(eq(paymentWebhookEvents.id, eventId));
      await raiseException({
        tenantId: connection.tenantId,
        legalEntityId: connection.legalEntityId,
        webhookEventId: eventId,
        code: "PAYLOAD_UNPARSEABLE",
        severity: "MEDIUM",
        detail: { reason },
        correlationId,
      });
    });
    return receipt({
      outcome: "REJECTED",
      status: 400,
      code: "PAYLOAD_UNPARSEABLE",
      message: "The authenticated payload could not be normalized; it was recorded and refused.",
      webhookEventId: eventId,
      gaps: [reason],
      correlationId,
    });
  }

  if (normalized.gaps.some((g) => GROSS_REQUIRED_GAPS.has(g))) {
    await withDatabaseRlsContext([connection.tenantId], false, async () => {
      await db.update(paymentWebhookEvents).set({ processingState: "REJECTED", lastErrorCode: "AMOUNT_MISSING" }).where(eq(paymentWebhookEvents.id, eventId));
      await raiseException({
        tenantId: connection.tenantId,
        legalEntityId: connection.legalEntityId,
        webhookEventId: eventId,
        code: "AMOUNT_MISSING",
        severity: "HIGH",
        detail: { gaps: normalized.gaps },
        correlationId,
      });
    });
    return receipt({
      outcome: "REJECTED",
      status: 400,
      code: "AMOUNT_MISSING",
      message: "No usable transaction amount could be derived; refusing to record money as zero.",
      webhookEventId: eventId,
      gaps: normalized.gaps,
      correlationId,
    });
  }

  // The reads that decide how much of this event the platform may believe — the
  // governed policy and its account mappings, the counterparty, the registered
  // till — all touch tenant-owned tables. A provider push carries no principal,
  // so without the attributed connection's tenant scope RLS returns nothing and
  // the pipeline would report POLICY_MISSING and ACCOUNT_NOT_REGISTERED about rows
  // that do exist. That is not caution, it is a measurement artefact, and it would
  // make the governed stop indistinguishable from a misconfigured installation.
  const { configuration, normalizedKey, party, account } = await withPaymentTenantScope(connection.tenantId, async () => {
    const resolved = await loadConfiguration({
      connection,
      provider,
      currency: normalized.currency,
      direction: normalized.direction,
    });
    const key = normalized.counterpartyRef ? normalizeCounterpartyRef(normalized.counterpartyRef, resolved.connection.countryCode) : null;
    const [resolvedParty, resolvedAccount] = await Promise.all([
      resolveParty({ tenantId: connection.tenantId, normalizedKey: key?.key ?? null }),
      resolveAccount({
        tenantId: connection.tenantId,
        connectionId: connection.id,
        externalId: normalized.direction === "INBOUND" ? normalized.to : normalized.from,
      }),
    ]);
    return { configuration: resolved, normalizedKey: key, party: resolvedParty, account: resolvedAccount };
  });
  const digest = counterpartyDigest(normalizedKey?.key ?? null);

  const gaps = [
    ...normalized.gaps,
    ...(party.gap ? [party.gap] : []),
    ...(digest.gap ? [digest.gap] : []),
    ...(account.gap ? [account.gap] : []),
  ];

  // Steps 5-7 — one transaction, one receipt, one trail, one audit, one event.
  const transactionId = newId(ID_PREFIX.paymentTransaction);
  let risk: { findings: RiskSignal[]; blocking: boolean } = { findings: [], blocking: false };
  let inserted = true;
  // Boxed, not a plain local: the assignment happens inside an async callback and
  // TypeScript's control-flow analysis would otherwise narrow it back to null.
  const persistence: { refusal: { sqlstate: string; constraint: string } | null } = { refusal: null };

  await withDatabaseRlsContext([connection.tenantId], false, async () => {
    let conflict: { id: string }[] = [];
    try {
      conflict = await db
      .insert(paymentTransactions)
      .values({
        id: transactionId,
        tenantId: connection.tenantId,
        legalEntityId: connection.legalEntityId,
        countryCode: configuration.connection.countryCode,
        providerCode: connection.providerCode,
        connectionId: connection.id,
        accountId: account.accountId,
        webhookEventId: eventId,
        providerTransactionId: normalized.providerTransactionId ?? `evt:${normalized.providerEventId}`,
        providerReference: normalized.providerReference,
        idempotencyKey: `webhook:${normalized.providerEventId}`,
        source: "PROVIDER_WEBHOOK",
        direction: normalized.direction,
        transactionType: normalized.transactionType,
        currency: normalized.currency,
        grossMinor: String(normalized.grossMinor),
        feeMinor: normalized.feeMinor === null ? null : String(normalized.feeMinor),
        taxMinor: normalized.taxMinor === null ? null : String(normalized.taxMinor),
        netMinor: normalized.netMinor === null ? null : String(normalized.netMinor),
        netBasis: normalized.netBasis,
        settlementCurrency: normalized.settlementCurrency,
        settlementMinor: normalized.settlementMinor === null ? null : String(normalized.settlementMinor),
        occurredAt: normalized.occurredAt,
        providerSettledAt: normalized.providerSettledAt,
        verificationStatus: "VERIFIED",
        verificationEvidence: {
          signature: "VALID",
          scheme: provider.signatureScheme,
          detail: verification.detail,
          clockSkewSeconds: verification.clockSkewSeconds,
          adapterVersion: adapter.isMock ? "MOCK" : adapter.providerCode,
          ingestedAt: receivedAt.toISOString(),
        } as unknown as Record<string, never>,
        trustLevel: "AUTHENTICATED",
        reconciliationStatus: "RECONCILIATION_REQUIRED",
        settlementStatus: "PENDING",
        accountingStatus: "NOT_PREPARED",
        partyId: party.partyId,
        customerUserId: party.customerUserId,
        counterpartyRef: normalizedKey?.masked ?? null,
        counterpartyDigest: digest.digest,
        counterpartyName: normalized.counterpartyName,
        invoiceReference: normalized.invoiceReference,
        description: normalized.description,
        providerMetadata: {
          mock: adapter.isMock,
          gaps,
          rawEventType: normalized.metadata.rawEventType ?? null,
          adapter: adapter.providerCode,
        } as unknown as Record<string, never>,
        stateVersion: 1,
      })
        .onConflictDoNothing()
        .returning({ id: paymentTransactions.id });
    } catch (e) {
      const refused = driverConstraintFailure(e);
      if (!refused) throw e;
      // The money model itself rejected the payload. That is a provider data
      // problem, not a server fault: the event is refused and recorded, no
      // transaction exists, and the SQL text stays inside the platform instead of
      // travelling back to a provider over a webhook response.
      persistence.refusal = refused;
      return;
    }

    if (conflict.length === 0) {
      inserted = false;
      return;
    }

    await db.insert(paymentTransactionStates).values([
      stateRow(connection.tenantId, transactionId, "VERIFICATION", null, "VERIFIED", "provider signature and timestamp verified", "SERVICE", null, correlationId, request.traceId ?? null, receivedAt),
      stateRow(connection.tenantId, transactionId, "TRUST", "RAW", "AUTHENTICATED", "single authenticated source; no independent confirmation yet", "SERVICE", null, correlationId, request.traceId ?? null, receivedAt),
    ]);

    await db
      .update(paymentWebhookEvents)
      .set({ processingState: "PROCESSED", transactionId, processedAt: new Date() })
      .where(eq(paymentWebhookEvents.id, eventId));

    if (party.gap) {
      await raiseException({
        tenantId: connection.tenantId,
        legalEntityId: connection.legalEntityId,
        transactionId,
        code: party.gap === "PARTY_AMBIGUOUS" ? "PARTY_AMBIGUOUS" : "UNKNOWN_PARTY",
        severity: "MEDIUM",
        detail: { gap: party.gap, candidateCount: party.candidateCount, treatment: configuration.policy?.unknownTransactionTreatment ?? "SUSPENSE_REVIEW" },
        correlationId,
      });
    }
    if (configuration.policy === null) {
      await raiseException({
        tenantId: connection.tenantId,
        legalEntityId: connection.legalEntityId,
        transactionId,
        code: "POLICY_MISSING",
        severity: "HIGH",
        detail: { reason: "No enabled policy covers this tenant, entity, provider and currency. Auto-posting is stopped until one is ratified." },
        correlationId,
      });
    }
    if (configuration.problems.some((p) => p.startsWith("ACCOUNT_MAPPING_MISSING"))) {
      await raiseException({
        tenantId: connection.tenantId,
        legalEntityId: connection.legalEntityId,
        transactionId,
        code: "MISSING_ACCOUNT_MAPPING",
        severity: "HIGH",
        detail: { problems: configuration.problems.filter((p) => p.startsWith("ACCOUNT_MAPPING_MISSING")) },
        correlationId,
      });
    }

    risk = await evaluateRisk({
      tenantId: connection.tenantId,
      legalEntityId: connection.legalEntityId,
      connectionId: connection.id,
      transactionId,
      occurredAt: normalized.occurredAt,
      amountMinor: normalized.grossMinor,
      currency: normalized.currency,
      direction: normalized.direction,
      counterpartyDigest: digest.digest,
      policy: configuration.policy,
      unmatchedHighValue: party.gap !== null,
    });
    if (risk.blocking) {
      await raiseException({
        tenantId: connection.tenantId,
        legalEntityId: connection.legalEntityId,
        transactionId,
        code: "LIMIT_EXCEEDED",
        severity: "HIGH",
        detail: { signals: risk.findings.filter((f) => f.blocking).map((f) => ({ signal: f.signal, evidence: f.evidence })) },
        correlationId,
      });
    }

    await publishEvent(
      paymentEvent({
        type: "payment.transaction.received",
        operation: "INGEST",
        tenantId: connection.tenantId,
        legalEntityId: connection.legalEntityId,
        subjectType: "PAYMENT_TRANSACTION",
        subjectId: transactionId,
        traceId: request.traceId ?? null,
        correlationId,
        authorityContext: NO_AUTHORITY_CONTEXT,
        policyVersion: configuration.policy?.policyVersion ?? undefined,
      payload: {
        provider: connection.providerCode,
        direction: normalized.direction,
        currency: normalized.currency,
        grossMinor: normalized.grossMinor,
        verificationStatus: "VERIFIED",
        trustLevel: "AUTHENTICATED",
        reconciliationStatus: "RECONCILIATION_REQUIRED",
        accountingStatus: "NOT_PREPARED",
        gapCount: gaps.length,
        domainVersion: PAYMENT_DOMAIN_VERSION,
        },
      }),
    );

    await appendPaymentAudit({
      tenantId: connection.tenantId,
      actorType: "SERVICE",
      action: "PAYMENT_TRANSACTION_INGESTED",
      objectType: "payment_transaction",
      objectId: transactionId,
      outcome: "SUCCESS",
      reason: `provider=${connection.providerCode} gaps=${gaps.length} risk=${risk.findings.length}`,
      authority: INGEST_VERSION,
      policyVersion: configuration.policy?.policyVersion ?? undefined,
      newValue: { grossMinor: normalized.grossMinor, currency: normalized.currency, trust: "AUTHENTICATED" },
    });
  });

  if (persistence.refusal !== null) {
    const refusal = persistence.refusal;
    await withDatabaseRlsContext([connection.tenantId], false, async () => {
      await db
        .update(paymentWebhookEvents)
        .set({ processingState: "REJECTED", lastErrorCode: refusal.constraint, processedAt: new Date() })
        .where(eq(paymentWebhookEvents.id, eventId));
      await raiseException({
        tenantId: connection.tenantId,
        legalEntityId: connection.legalEntityId,
        transactionId: null,
        code: "PROVIDER_DATA_REFUSED",
        severity: "HIGH",
        detail: {
          reason: "The provider payload could not be recorded against the money model; no transaction was created.",
          constraint: refusal.constraint,
          sqlstate: refusal.sqlstate,
        },
        correlationId,
      });
      await appendPaymentAudit({
        tenantId: connection.tenantId,
        actorType: "SERVICE",
        action: "PAYMENT_WEBHOOK_REJECTED",
        objectType: "payment_webhook_event",
        objectId: eventId,
        outcome: "DENIED",
        reason: `money model refused payload: ${refusal.constraint}`,
        authority: INGEST_VERSION,
      });
    });
    return receipt({
      outcome: "REJECTED",
      status: 422,
      code: "PROVIDER_DATA_REFUSED",
      message: `The provider payload was refused by the money model (${refusal.constraint}). No transaction was created; the event is held for review.`,
      correlationId,
      webhookEventId: eventId,
    });
  }

  if (!inserted) {
    // Same provider transaction id seen again — a genuine retry, not a new event.
    const existing = await withDatabaseRlsContext([connection.tenantId], false, () =>
      db
        .select({ id: paymentTransactions.id, digest: paymentTransactions.counterpartyDigest })
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.connectionId, connection.id),
            eq(paymentTransactions.providerTransactionId, normalized.providerTransactionId ?? `evt:${normalized.providerEventId}`),
          ),
        )
        .limit(1),
    );
    const same = existing[0];
    if (!same) {
      return receipt({
        outcome: "REJECTED",
        status: 409,
        code: "DUPLICATE_CONFLICT",
        message: "An idempotency conflict occurred without a visible prior row.",
        webhookEventId: eventId,
        correlationId,
      });
    }
    await withDatabaseRlsContext([connection.tenantId], false, async () => {
      await db
        .update(paymentWebhookEvents)
        .set({ processingState: "DUPLICATE", transactionId: same.id, attemptCount: sql`${paymentWebhookEvents.attemptCount} + 1` })
        .where(eq(paymentWebhookEvents.id, eventId));
    });
    return receipt({
      outcome: "DUPLICATE",
      status: 200,
      code: "ALREADY_INGESTED",
      message: "This provider transaction was already ingested; no second record was created.",
      webhookEventId: eventId,
      transactionId: same.id,
      correlationId,
    });
  }

  return receipt({
    outcome: "INGESTED",
    status: 202,
    code: "ACCEPTED_AWAITING_RECONCILIATION",
    message: "Transaction recorded as an authenticated provider claim. It is not accounting truth and has not been posted.",
    webhookEventId: eventId,
    transactionId,
    verificationStatus: "VERIFIED",
    trustLevel: "AUTHENTICATED",
    reconciliationStatus: "RECONCILIATION_REQUIRED",
    gaps,
    riskFindings: risk.findings,
    configurationProblems: configuration.problems,
    correlationId,
  });
}

function stateRow(
  tenantId: string,
  transactionId: string,
  axis: "VERIFICATION" | "TRUST",
  from: string | null,
  to: string,
  reason: string,
  actorType: "SERVICE" | "HUMAN" | "SYSTEM",
  actorUserId: string | null,
  correlationId: string | null,
  traceId: string | null,
  at: Date,
) {
  const check = assertTransition({ axis, from, to });
  return {
    id: newId(ID_PREFIX.paymentStateTransition),
    tenantId,
    transactionId,
    axis,
    fromState: check.from,
    toState: check.to,
    reason,
    actorType,
    actorUserId,
    controlRole: null,
    evidence: {} as Record<string, never>,
    policyVersion: INGEST_VERSION,
    correlationId,
    traceId,
    occurredAt: at,
  };
}

/** Replay of a known provider event id. Acknowledged, but only for an event that was validly signed. */
async function handleDuplicate(input: {
  request: IngestRequest;
  connection: { tenantId: string; legalEntityId: string; id: string; providerCode: string };
  payloadDigest: string;
  verificationValid: boolean;
  correlationId: string | null;
}): Promise<IngestReceipt> {
  if (!input.verificationValid) {
    return receipt({
      outcome: "REJECTED",
      status: 401,
      code: "REPLAY_WITHOUT_SIGNATURE",
      message: "A known event id was replayed without valid authentication.",
      correlationId: input.correlationId,
    });
  }
  const prior = await withDatabaseRlsContext([input.connection.tenantId], false, () =>
    db
      .select({ id: paymentWebhookEvents.id, digest: paymentWebhookEvents.payloadDigest, transactionId: paymentWebhookEvents.transactionId })
      .from(paymentWebhookEvents)
      .where(and(eq(paymentWebhookEvents.connectionId, input.connection.id), eq(paymentWebhookEvents.payloadDigest, input.payloadDigest)))
      .limit(1),
  );
  const found = prior[0];
  if (!found) {
    // Same event id, different bytes: the provider reused an id for a different
    // payment. This must never be treated as an idempotent retry.
    await withDatabaseRlsContext([input.connection.tenantId], false, () =>
      raiseException({
        tenantId: input.connection.tenantId,
        legalEntityId: input.connection.legalEntityId,
        code: "DUPLICATE_CONFLICT",
        severity: "CRITICAL",
        detail: { reason: "provider event id reused with a different payload digest", digest: input.payloadDigest.slice(0, 16) },
        correlationId: input.correlationId,
      }),
    );
    return receipt({
      outcome: "REJECTED",
      status: 409,
      code: "DUPLICATE_CONFLICT",
      message: "The provider reused an event id for a different payload.",
      correlationId: input.correlationId,
    });
  }
  await withDatabaseRlsContext([input.connection.tenantId], false, () =>
    db
      .update(paymentWebhookEvents)
      .set({ processingState: "PROCESSED", lastErrorCode: "ALREADY_RECORDED" })
      .where(eq(paymentWebhookEvents.id, found.id)),
  );
  return receipt({
    outcome: "DUPLICATE",
    status: 200,
    code: "ALREADY_RECEIVED",
    message: "This event was already received; acknowledged without reprocessing.",
    webhookEventId: found.id,
    transactionId: found.transactionId,
    correlationId: input.correlationId,
  });
}

function lowerHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) out[k.toLowerCase()] = v;
  return out;
}

function firstHeader(headers: Record<string, string>, names: string[]): string | null {
  const lowered = lowerHeaders(headers);
  for (const name of names) {
    const value = lowered[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Test seam: the pipeline must run inside an RLS context or open its own. */
export function ingestRequiresFreshContext(): boolean {
  return !hasDatabaseTransactionContext();
}
