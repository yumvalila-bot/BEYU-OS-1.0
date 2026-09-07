/**
 * Governed WRITES to payment configuration. Exists so that the authority question
 * has one answer in one place, and so `mayWrite("payments/config-write", …)` in
 * `src/lib/finance/truth.ts` names a real module.
 *
 * WHY THIS IS NOT EXPOSED OVER HTTP
 *   Configuration sets the limits, the ledger account mappings, the provider
 *   enablement and the settlement authority that every other payment control is
 *   measured against. If the application could write it with its own credentials,
 *   the runtime role would hold exactly the self-modification power the platform's
 *   open finding F-01 describes for the governance tables — and this program was
 *   told not to build payment controls that are equally mutable. So the only path
 *   here is a process running under `BEYU_ADMIN_DATABASE_URL` with an explicit
 *   approval reference, plus the database's own revocation of DML from the runtime
 *   role (migration 0028), which holds even if someone later wires this module to
 *   a route by mistake.
 *
 * `assertPrivilegedWriter()` is therefore not theatre: it asks the database who it
 * is, and refuses to continue when the answer is the runtime role.
 */
import { sql } from "drizzle-orm";
import { adminPool } from "@/db/admin";
import { db } from "@/db";
import { ID_PREFIX, newId } from "@/lib/ids";
import { appendPaymentAudit } from "./audit-scope";
import type { AuditInput } from "@/lib/audit";
import { mayWrite } from "@/lib/finance/truth";
import { refLooksLikeSecretValue } from "./config";
import type { MappingRole } from "./config";
import type { ProviderIntegrationStatus } from "./providers/adapter";

export const CONFIG_WRITE_VERSION = "payment-config-write-1.0.0";
export const CONFIG_WRITE_MODULE = "payments/config-write";

/** The registry itself is asked, so the answer cannot drift from the declaration. */
export function permittedTablesForThisModule(): string[] {
  return [
    "payment_providers",
    "payment_provider_connections",
    "payment_accounts",
    "payment_account_mappings",
    "payment_policies",
  ].filter((t) => mayWrite(CONFIG_WRITE_MODULE, t));
}

export class ConfigWriteError extends Error {
  constructor(
    readonly code: "NOT_PRIVILEGED" | "APPROVAL_REQUIRED" | "SECRET_VALUE_REFUSED" | "EVIDENCE_REQUIRED" | "TABLE_NOT_PERMITTED",
    message: string,
  ) {
    super(message);
    this.name = "ConfigWriteError";
  }
}

export type WriterIdentity = { databaseUser: string; isSuperuser: boolean; privileged: boolean; via: string };

/**
 * Ask the database who is writing. `beyu_runtime` is refused even though it would
 * in practice be stopped by the grant/revocation anyway — a module that only
 * works because of a grant is one `GRANT` away from being able to change its own
 * rules.
 */
export async function assertPrivilegedWriter(): Promise<WriterIdentity> {
  const result = (await adminPool.query(
    `select current_user as "databaseUser", exists (select 1 from pg_roles where rolname = current_user and rolsuper) as "isSuperuser"`,
  )) as unknown as { rows: { databaseUser: string; isSuperuser: boolean }[] };
  const row = result.rows[0] ?? { databaseUser: "unknown", isSuperuser: false };
  const privileged = row.databaseUser !== "beyu_runtime" && (row.isSuperuser || row.databaseUser.startsWith("beyu_owner"));
  if (!privileged) {
    throw new ConfigWriteError(
      "NOT_PRIVILEGED",
      `Payment configuration must be written under BEYU_ADMIN_DATABASE_URL by a privileged role; this process is "${row.databaseUser}". Nothing was changed.`,
    );
  }
  return { ...row, privileged, via: process.env.BEYU_ADMIN_DATABASE_URL ? "BEYU_ADMIN_DATABASE_URL" : "DATABASE_URL" };
}

/** Every write needs an accountable human and a reference. No exceptions, no defaults. */
function requireApproval(input: { approvedBy?: string | null; approvalReference?: string | null }): void {
  if (!input.approvedBy || input.approvedBy.trim().length < 3) {
    throw new ConfigWriteError("APPROVAL_REQUIRED", "approvedBy (the accountable human) is required.");
  }
  if (!input.approvalReference || input.approvalReference.trim().length < 4) {
    throw new ConfigWriteError("APPROVAL_REQUIRED", "approvalReference is required (a governance decision, ticket, or an explicit SANDBOX-DEMO marker).");
  }
}

function requireRef(name: string, value: string | null | undefined): void {
  if (value === null || value === undefined || value === "") return;
  if (refLooksLikeSecretValue(value)) {
    throw new ConfigWriteError(
      "SECRET_VALUE_REFUSED",
      `${name} must be the NAME of an environment variable (e.g. BEYU_MPESA_WEBHOOK_SECRET), never a value. Nothing was written.`,
    );
  }
}

/**
 * The audit append goes through the canonical audit API, which runs as the
 * runtime role and therefore needs an explicit RLS context — a bare append with a
 * NULL tenant is rejected by `audit_log`'s policy. Platform-global rows (a
 * provider is not tenant-owned) append a tenant-less row inside short-lived
 * platform scope, the same sanctioned pattern used for pre-auth denials in
 * `src/app/api/v1/auth/login/route.ts`; tenant-owned rows append under that
 * tenant only. Nothing here widens the write scope of the caller.
 */
async function appendConfigAudit(input: AuditInput): Promise<void> {
  await appendPaymentAudit(input);
}

export type ProviderUpsert = {
  code: string;
  displayName: string;
  kind: "MOBILE_MONEY" | "BANK_TRANSFER" | "CARD" | "AGENT" | "UNIFIED_SWITCH";
  countryCode: string;
  integrationStatus?: ProviderIntegrationStatus;
  contractStatus?: string;
  credentialStatus?: string;
  apiAvailability?: string;
  webhookModel?: string;
  settlementModel?: string;
  signatureScheme?: string;
  sandboxMode?: string;
  regulatoryEnforcement?: string;
  capabilities?: Record<string, boolean>;
  sandboxEvidence?: string | null;
  productionEvidence?: string | null;
  blockedReason?: string | null;
  approvedBy?: string | null;
  approvalReference?: string | null;
};

/**
 * Provider status advances only with evidence, and the CHECK constraints in 0028
 * refuse a production claim without an approver + reference. A SANDBOX_VERIFIED
 * entry never implies anything about production; those two fields are separate
 * columns precisely so a reader cannot merge them.
 */
export async function upsertProvider(input: ProviderUpsert): Promise<{ code: string; action: "INSERTED" | "UPDATED" }> {
  requireApproval(input);
  const identity = await assertPrivilegedWriter();
  const live = input.integrationStatus === "PRODUCTION_CONFIGURED" || input.integrationStatus === "PRODUCTION_VERIFIED";
  if (live && (!input.productionEvidence || input.productionEvidence.trim().length < 10)) {
    throw new ConfigWriteError("EVIDENCE_REQUIRED", "A production status requires productionEvidence describing what was actually verified and where.");
  }
  const needsSandboxEvidence = input.integrationStatus && input.integrationStatus !== "NOT_INTEGRATED" && input.integrationStatus !== "ADAPTER_CODED" && input.integrationStatus !== "BLOCKED_EXTERNAL_DEPENDENCY";
  if (needsSandboxEvidence && !input.sandboxEvidence) {
    throw new ConfigWriteError("EVIDENCE_REQUIRED", "Sandbox or better status requires sandboxEvidence: what was tested, against what, on what date.");
  }

  const existing = await adminPool.query(`select code, integration_status as "integrationStatus" from public.payment_providers where code = $1`, [input.code]);
  const before = existing.rows[0] ?? null;
  const values = {
    code: input.code,
    displayName: input.displayName,
    kind: input.kind,
    countryCode: input.countryCode.toUpperCase(),
    integrationStatus: input.integrationStatus ?? "NOT_INTEGRATED",
    contractStatus: input.contractStatus ?? "NOT_INVESTIGATED",
    credentialStatus: input.credentialStatus ?? "NOT_ISSUED",
    apiAvailability: input.apiAvailability ?? "UNVERIFIED",
    webhookModel: input.webhookModel ?? "UNVERIFIED",
    settlementModel: input.settlementModel ?? "UNVERIFIED",
    signatureScheme: input.signatureScheme ?? "NONE",
    capabilities: (input.capabilities ?? {}) as Record<string, never>,
    sandboxEvidence: input.sandboxEvidence ?? null,
    productionEvidence: input.productionEvidence ?? null,
    blockedReason: input.blockedReason ?? null,
    enabledBy: input.approvedBy ?? null,
    enabledAt: input.approvedBy ? new Date() : null,
    approvalReference: input.approvalReference ?? null,
    updatedAt: new Date(),
  };

  if (before) {
    const { code: _code, ...rest } = values;
    await adminPool.query(
      `update public.payment_providers set
         display_name=$2, kind=$3, country_code=$4, integration_status=$5, contract_status=$6,
         credential_status=$7, api_availability=$8, webhook_model=$9, settlement_model=$10,
         signature_scheme=$11, capabilities=$12::jsonb, sandbox_evidence=$13, production_evidence=$14,
         blocked_reason=$15, enabled_by=$16, enabled_at=$17, approval_reference=$18, updated_at=$19
       where code=$1`,
      [
        input.code,
        values.displayName,
        values.kind,
        values.countryCode,
        values.integrationStatus,
        values.contractStatus,
        values.credentialStatus,
        values.apiAvailability,
        values.webhookModel,
        values.settlementModel,
        values.signatureScheme,
        JSON.stringify(values.capabilities),
        values.sandboxEvidence,
        values.productionEvidence,
        values.blockedReason,
        values.enabledBy,
        values.enabledAt,
        values.approvalReference,
        values.updatedAt,
      ],
    );
  } else {
    await adminPool.query(
      `insert into public.payment_providers
         (code, display_name, kind, country_code, integration_status, contract_status, credential_status,
          api_availability, webhook_model, settlement_model, signature_scheme, capabilities, sandbox_evidence,
          production_evidence, blocked_reason, enabled_by, enabled_at, approval_reference, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19)`,
      [
        values.code,
        values.displayName,
        values.kind,
        values.countryCode,
        values.integrationStatus,
        values.contractStatus,
        values.credentialStatus,
        values.apiAvailability,
        values.webhookModel,
        values.settlementModel,
        values.signatureScheme,
        JSON.stringify(values.capabilities),
        values.sandboxEvidence,
        values.productionEvidence,
        values.blockedReason,
        values.enabledBy,
        values.enabledAt,
        values.approvalReference,
        values.updatedAt,
      ],
    );
  }

  await appendConfigAudit({
    actorType: "HUMAN",
    action: before ? "PAYMENT_PROVIDER_UPDATED" : "PAYMENT_PROVIDER_REGISTERED",
    objectType: "payment_provider",
    objectId: input.code,
    outcome: "SUCCESS",
    reason: `integration_status=${values.integrationStatus} via ${identity.databaseUser}`,
    authority: CONFIG_WRITE_VERSION,
    approvalRef: input.approvalReference ?? undefined,
    oldValue: before ? { integrationStatus: before.integrationStatus } : null,
    newValue: { integrationStatus: values.integrationStatus, contractStatus: values.contractStatus, credentialStatus: values.credentialStatus },
  });

  return { code: input.code, action: before ? "UPDATED" : "INSERTED" };
}

export type ConnectionUpsert = {
  tenantId: string;
  legalEntityId: string;
  providerCode: string;
  countryCode: string;
  label: string;
  environment: "SANDBOX" | "PRODUCTION";
  baseUrl?: string | null;
  merchantId?: string | null;
  credentialRef?: string | null;
  signingSecretRef?: string | null;
  callbackPath?: string | null;
  enabled: boolean;
  approvedBy?: string | null;
  approvalReference?: string | null;
};

export async function upsertConnection(input: ConnectionUpsert): Promise<{ id: string; enabled: boolean }> {
  requireApproval(input);
  requireRef("credentialRef", input.credentialRef);
  requireRef("signingSecretRef", input.signingSecretRef);
  const identity = await assertPrivilegedWriter();
  await assertProviderIntegratedFor(input.providerCode, input.environment);

  const id = newId(ID_PREFIX.paymentConnection);
  const written = await adminPool.query(
    `insert into public.payment_provider_connections
       (id, tenant_id, legal_entity_id, provider_code, country_code, label, environment, base_url, merchant_id,
        credential_ref, signing_secret_ref, callback_path, enabled, enabled_by, enabled_at, approval_reference)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     on conflict (tenant_id, legal_entity_id, provider_code, environment, label) do update set
       base_url=excluded.base_url, merchant_id=excluded.merchant_id, credential_ref=excluded.credential_ref,
       signing_secret_ref=excluded.signing_secret_ref, callback_path=excluded.callback_path,
       enabled=excluded.enabled, enabled_by=excluded.enabled_by, enabled_at=excluded.enabled_at,
       approval_reference=excluded.approval_reference, updated_at=now()
     returning id`,
    [
      id,
      input.tenantId,
      input.legalEntityId,
      input.providerCode,
      input.countryCode.toUpperCase(),
      input.label,
      input.environment,
      input.baseUrl ?? null,
      input.merchantId ?? null,
      input.credentialRef ?? null,
      input.signingSecretRef ?? null,
      input.callbackPath ?? null,
      input.enabled ? 1 : 0,
      input.approvedBy ?? null,
      input.approvedBy ? new Date() : null,
      input.approvalReference ?? null,
    ],
  );

  await appendConfigAudit({
    tenantId: input.tenantId,
    actorType: "HUMAN",
    action: input.enabled ? "PAYMENT_CONNECTION_ENABLED" : "PAYMENT_CONNECTION_CONFIGURED",
    objectType: "payment_provider_connection",
    objectId: input.label,
    outcome: "SUCCESS",
    reason: `${input.providerCode}/${input.environment} via ${identity.databaseUser}`,
    authority: CONFIG_WRITE_VERSION,
    approvalRef: input.approvalReference ?? undefined,
    newValue: { enabled: input.enabled, credentialRef: input.credentialRef ?? null, signingSecretRef: input.signingSecretRef ?? null },
  });

  // The conflict path keeps the existing row, so the id reported back is the row's
  // own — never the id this call would have used. Returning the generated id would
  // hand callers a key that does not exist and cascade into a foreign-key failure on
  // the next table in the chain.
  const storedId = (written.rows as { id: string }[])[0]?.id ?? id;
  return { id: storedId, enabled: input.enabled };
}

/**
 * Enabling a connection against a provider that the registry says is
 * NOT_INTEGRATED is the precise way a "we support M-Pesa" claim is born. The
 * module refuses it even though an operator could do it by hand in psql — the
 * point is that no governed path lets it happen by accident.
 */
async function assertProviderIntegratedFor(providerCode: string, environment: "SANDBOX" | "PRODUCTION"): Promise<void> {
  const rows = (await adminPool.query(`select integration_status as "integrationStatus" from public.payment_providers where code=$1`, [providerCode])) as unknown as {
    rows: { integrationStatus: string }[];
  };
  const status = rows.rows[0]?.integrationStatus;
  if (!status) throw new ConfigWriteError("EVIDENCE_REQUIRED", `Provider ${providerCode} is not registered; register it first.`);
  if (environment === "PRODUCTION" && status !== "PRODUCTION_CONFIGURED" && status !== "PRODUCTION_VERIFIED") {
    throw new ConfigWriteError("EVIDENCE_REQUIRED", `Refusing to enable a PRODUCTION connection while ${providerCode} is ${status}.`);
  }
  if (environment === "SANDBOX" && status === "NOT_INTEGRATED") {
    throw new ConfigWriteError("EVIDENCE_REQUIRED", `Refusing to enable a sandbox connection while ${providerCode} is NOT_INTEGRATED; register the adapter status first.`);
  }
}

export type AccountUpsert = {
  tenantId: string;
  legalEntityId: string;
  connectionId: string;
  providerCode: string;
  externalAccountId: string;
  accountType: "OPERATING" | "COLLECTION" | "PAYOUT" | "CLEARING" | "FLOAT";
  currency: string;
  label: string;
};

/**
 * Every upsert here reports the row's OWN id. On the conflict path Postgres keeps
 * the existing row, so the freshly generated id never reaches the table; returning
 * it would hand the next step a key that does not exist and fail on the foreign
 * key. `returning id` is therefore part of the contract, not decoration.
 */
export async function upsertAccount(input: AccountUpsert): Promise<{ id: string }> {
  const identity = await assertPrivilegedWriter();
  void identity;
  const { stableDigest } = await import("./resolve");
  const id = newId(ID_PREFIX.paymentAccount);
  const digest = stableDigest(input.externalAccountId);
  const written = await adminPool.query(
    `insert into public.payment_accounts
       (id, tenant_id, legal_entity_id, connection_id, provider_code, external_account_id, external_account_digest,
        account_type, currency, label, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE')
     on conflict (connection_id, external_account_id, account_type) do update set label=excluded.label, currency=excluded.currency
     returning id`,
    [id, input.tenantId, input.legalEntityId, input.connectionId, input.providerCode, input.externalAccountId, digest, input.accountType, input.currency.toUpperCase(), input.label],
  );
  const writtenId = (written.rows as { id: string }[])[0]?.id ?? id;
  return { id: writtenId };
}

export type MappingUpsert = {
  tenantId: string;
  legalEntityId: string;
  providerCode: string | null;
  currency: string | null;
  mappingRole: MappingRole;
  ledgerAccountId: string;
  policyVersion: string;
  approvedBy: string;
  approvalReference: string;
};

/**
 * A ledger account mapping IS an accounting policy statement, so it requires the
 * same triple as everything else here: a named approver, a reference, and a
 * policy version. `approvedBy` is not metadata — `payment_account_mappings` has it
 * NOT NULL, and the accounting gate reads `policy.approvedBy` before it will draft
 * anything at all.
 */
export async function upsertAccountMapping(input: MappingUpsert): Promise<{ id: string }> {
  requireApproval(input);
  await assertPrivilegedWriter();
  const id = newId(ID_PREFIX.paymentAccountMapping);
  const written = await adminPool.query(
    `insert into public.payment_account_mappings
       (id, tenant_id, legal_entity_id, provider_code, currency, mapping_role, ledger_account_id, policy_version, approved_by, approval_reference)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (tenant_id, legal_entity_id, provider_code, currency, mapping_role) do update set
       ledger_account_id=excluded.ledger_account_id, policy_version=excluded.policy_version,
       approved_by=excluded.approved_by, approval_reference=excluded.approval_reference
     returning id`,
    [id, input.tenantId, input.legalEntityId, input.providerCode, input.currency?.toUpperCase() ?? null, input.mappingRole, input.ledgerAccountId, input.policyVersion, input.approvedBy, input.approvalReference],
  );
  const writtenId = (written.rows as { id: string }[])[0]?.id ?? id;
  await appendConfigAudit({
    tenantId: input.tenantId,
    actorType: "HUMAN",
    action: "PAYMENT_ACCOUNT_MAPPING_CONFIGURED",
    objectType: "payment_account_mapping",
    objectId: writtenId,
    outcome: "SUCCESS",
    reason: `${input.mappingRole} → ledger account ${input.ledgerAccountId} at policy ${input.policyVersion}`,
    authority: CONFIG_WRITE_VERSION,
    approvalRef: input.approvalReference,
    policyVersion: input.policyVersion,
  });
  return { id: writtenId };
}

export type PolicyUpsert = {
  tenantId: string;
  legalEntityId: string | null;
  providerCode: string | null;
  currency: string;
  maxTransactionMinor: number;
  dailyInboundLimitMinor?: number | null;
  dailyOutboundLimitMinor?: number | null;
  autoPostCeilingMinor?: number | null;
  confidenceFloor?: number;
  maxClockSkewSeconds?: number;
  requireApprovalAboveMinor?: number | null;
  unknownTransactionTreatment?: "SUSPENSE_REVIEW" | "REJECT";
  enabled?: boolean;
  policyVersion: string;
  approvedBy: string;
  approvalReference: string;
};

export async function upsertPolicy(input: PolicyUpsert): Promise<{ id: string }> {
  requireApproval(input);
  await assertPrivilegedWriter();
  if (!(input.confidenceFloor === undefined || (input.confidenceFloor >= 0 && input.confidenceFloor <= 1))) {
    throw new ConfigWriteError("APPROVAL_REQUIRED", "confidenceFloor must be between 0 and 1.");
  }
  const id = newId(ID_PREFIX.paymentPolicy);
  const written = await adminPool.query(
    `insert into public.payment_policies
       (id, tenant_id, legal_entity_id, provider_code, currency, max_transaction_minor, daily_inbound_limit_minor,
        daily_outbound_limit_minor, auto_post_ceiling_minor, confidence_floor, max_clock_skew_seconds,
        require_approval_above_minor, unknown_transaction_treatment, enabled, policy_version, approved_by, approval_reference)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     on conflict (tenant_id, legal_entity_id, provider_code, currency) do update set
       max_transaction_minor=excluded.max_transaction_minor,
       daily_inbound_limit_minor=excluded.daily_inbound_limit_minor,
       daily_outbound_limit_minor=excluded.daily_outbound_limit_minor,
       auto_post_ceiling_minor=excluded.auto_post_ceiling_minor,
       confidence_floor=excluded.confidence_floor,
       max_clock_skew_seconds=excluded.max_clock_skew_seconds,
       require_approval_above_minor=excluded.require_approval_above_minor,
       unknown_transaction_treatment=excluded.unknown_transaction_treatment,
       enabled=excluded.enabled, policy_version=excluded.policy_version,
       approved_by=excluded.approved_by, approval_reference=excluded.approval_reference
     returning id`,
    [
      id,
      input.tenantId,
      input.legalEntityId,
      input.providerCode,
      input.currency.toUpperCase(),
      String(input.maxTransactionMinor),
      input.dailyInboundLimitMinor == null ? null : String(input.dailyInboundLimitMinor),
      input.dailyOutboundLimitMinor == null ? null : String(input.dailyOutboundLimitMinor),
      input.autoPostCeilingMinor == null ? null : String(input.autoPostCeilingMinor),
      String(input.confidenceFloor ?? 0.99),
      input.maxClockSkewSeconds ?? 300,
      input.requireApprovalAboveMinor == null ? null : String(input.requireApprovalAboveMinor),
      input.unknownTransactionTreatment ?? "SUSPENSE_REVIEW",
      input.enabled === false ? 0 : 1,
      input.policyVersion,
      input.approvedBy,
      input.approvalReference,
    ],
  );
  const writtenId = (written.rows as { id: string }[])[0]?.id ?? id;
  await appendConfigAudit({
    tenantId: input.tenantId,
    actorType: "HUMAN",
    action: "PAYMENT_POLICY_CONFIGURED",
    objectType: "payment_policy",
    objectId: writtenId,
    outcome: "SUCCESS",
    reason: `max ${input.maxTransactionMinor} minor ${input.currency}; auto-post ceiling ${input.autoPostCeilingMinor ?? "NONE (any amount an authorised principal may post)"}`,
    authority: CONFIG_WRITE_VERSION,
    approvalRef: input.approvalReference,
    policyVersion: input.policyVersion,
  });
  return { id: writtenId };
}

/** Read-only helper for the CLI: what does the runtime role actually hold right now? */
export async function runtimePrivilegeReport(): Promise<{ table: string; insert: boolean; update: boolean; delete: boolean; select: boolean }[]> {
  const rows = await db.execute(
    // `has_table_privilege` is evaluated for CURRENT_USER, i.e. the runtime role,
    // which is precisely the subject under test.
    sql`select table_name as "table",
            has_table_privilege(current_user, table_name, 'INSERT') as "insert",
            has_table_privilege(current_user, table_name, 'UPDATE') as "update",
            has_table_privilege(current_user, table_name, 'DELETE') as "delete",
            has_table_privilege(current_user, table_name, 'SELECT') as "select"
       from information_schema.tables
      where table_schema='public' and table_name like 'payment_%'
      order by table_name`,
  );
  return ((rows as unknown as { rows: unknown[] }).rows ?? []) as { table: string; insert: boolean; update: boolean; delete: boolean; select: boolean }[];
}

export const CONFIG_WRITE_BOUNDARIES = {
  exposedOverHttp: false,
  requiresAdminDsn: true,
  requiresApprovalReference: true,
  acceptsSecretValues: false,
  canActivateCapability: false,
  canWriteLedger: false,
} as const;

/* ------------------------- sandbox fixture removal ------------------------- */

/** The labels the sandbox fixture stamps on everything it creates. */
export const SANDBOX_DEMO_POLICY_VERSION = "SANDBOX-DEMO-1.0.0";
export const SANDBOX_DEMO_APPROVAL_REFERENCE = "SANDBOX-DEMO:NOT-RATIFIED";
export const SANDBOX_DEMO_CONFIRM_TOKEN = "REMOVE-SANDBOX-DEMO";

export type FixtureRemoval =
  | { refused: true; reason: string; detail: Record<string, number> }
  | { refused: false; removed: Record<string, number> };

/**
 * Removing the sandbox fixture is a governed configuration write too, so it lives
 * here rather than in the CLI: one module holds the write path for these tables,
 * which is what makes "the CLI is the canonical interface" a structural property
 * instead of a convention (tests/payments/governed-config-write-path.test.ts).
 *
 * It refuses rather than cascades. Configuration that transactions were recorded
 * against cannot be deleted out from under them: the history would lose the row
 * that explains why those payments were accepted. Undo a fixture only while
 * nothing depends on it.
 */
export async function removeSandboxDemoFixture(input: {
  approvedBy: string;
  approvalReference: string;
  confirm: string;
}): Promise<FixtureRemoval> {
  requireApproval(input);
  if (input.confirm !== SANDBOX_DEMO_CONFIRM_TOKEN) {
    throw new ConfigWriteError("APPROVAL_REQUIRED", `Pass --confirm=${SANDBOX_DEMO_CONFIRM_TOKEN} explicitly: this deletes configuration rows.`);
  }
  const identity = await assertPrivilegedWriter();

  const blockers = (
    await adminPool.query(
      `select
         (select count(*)::int from public.payment_transactions t
            where t.connection_id in (select id from public.payment_provider_connections where approval_reference = $1)) as transactions,
         (select count(*)::int from public.payment_webhook_events w
            where w.connection_id in (select id from public.payment_provider_connections where approval_reference = $1)) as webhook_events,
         (select count(*)::int from public.journal_lines l
            where l.account_id in (select id from public.ledger_accounts where code like 'SD-%' and code like '%-CASH')) as journal_lines`,
      [SANDBOX_DEMO_APPROVAL_REFERENCE],
    )
  ).rows[0] as Record<string, number>;

  const dependent = Object.fromEntries(Object.entries(blockers).filter(([, n]) => n > 0));
  if (Object.keys(dependent).length > 0) {
    return {
      refused: true,
      reason: "Sandbox configuration has recorded history underneath it. Deleting it now would orphan the rows that explain those payments, so history wins: remove or re-point the dependent records through a governed decision first.",
      detail: dependent,
    };
  }

  const client = await adminPool.connect();
  const removed: Record<string, number> = {};
  try {
    await client.query("begin");
    const steps: [string, string, unknown[]][] = [
      ["accountMappings", `delete from public.payment_account_mappings where policy_version = $1`, [SANDBOX_DEMO_POLICY_VERSION]],
      ["policies", `delete from public.payment_policies where policy_version = $1`, [SANDBOX_DEMO_POLICY_VERSION]],
      ["paymentAccounts", `delete from public.payment_accounts where label like 'sandbox-demo%'`, []],
      ["connections", `delete from public.payment_provider_connections where approval_reference = $1`, [SANDBOX_DEMO_APPROVAL_REFERENCE]],
      ["ledgerAccounts", `delete from public.ledger_accounts where code like 'SD-%'`, []],
    ];
    for (const [name, sqlText, params] of steps) {
      const r = await client.query(sqlText, params);
      removed[name] = r.rowCount ?? 0;
    }
    // The provider row is kept: it is the assessment record, not fixture data. A
    // registered provider with evidence of a mock adapter is a true statement
    // about the platform, and deleting it would silently change what the registry
    // claims. It is disabled by having no enabled connections.
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }

  await appendConfigAudit({
    actorType: "HUMAN",
    action: "PAYMENT_SANDBOX_FIXTURE_REMOVED",
    objectType: "payment_provider_connection",
    objectId: SANDBOX_DEMO_APPROVAL_REFERENCE,
    outcome: "SUCCESS",
    reason: `fixture removed by ${input.approvedBy} via ${identity.databaseUser}: ${JSON.stringify(removed)}`,
    authority: CONFIG_WRITE_VERSION,
    approvalRef: input.approvalReference,
    policyVersion: SANDBOX_DEMO_POLICY_VERSION,
  });

  return { refused: false, removed };
}
