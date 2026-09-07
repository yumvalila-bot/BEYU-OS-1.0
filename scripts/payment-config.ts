/**
 * Governed payment configuration CLI.
 *
 * This is the only sanctioned way to change payment authority: provider status,
 * connections, accounts, ledger account mappings and limits. It writes through
 * `adminDb` (`BEYU_ADMIN_DATABASE_URL`) and every write needs an accountable
 * human plus an approval reference; `src/lib/payments/config-write.ts` refuses the
 * write when the process is running as the runtime role, because the runtime role
 * must not be able to move the rules it is measured against.
 *
 *   npx tsx scripts/payment-config.ts status
 *   npx tsx scripts/payment-config.ts provider --code MOCK_SANDBOX --kind MOBILE_MONEY \
 *        --country TZ --status ADAPTER_CODED --sandbox-evidence "…" --by cfo@beyu.os --ref GOV-1234
 *   npx tsx scripts/payment-config.ts connection --provider MOCK_SANDBOX --tenant TEN_BEYU_TZ \
 *        --entity <LEN_…> --label sandbox --env SANDBOX --secret-ref BEYU_MOCK_WEBHOOK_SECRET \
 *        --enable --by cfo@beyu.os --ref SANDBOX-DEMO:NOT-RATIFIED
 *   npx tsx scripts/payment-config.ts mapping --role CASH --account <ACC_…> --by … --ref …
 *   npx tsx scripts/payment-config.ts policy --currency TZS --max 10000000 --by … --ref …
 *   npx tsx scripts/payment-config.ts sandbox-demo --tenant TEN_BEYU_TZ [--cleanup]
 */
import "dotenv/config";
import { adminPool } from "@/db/admin";
import {
  runtimePrivilegeReport,
  upsertAccount,
  upsertAccountMapping,
  upsertConnection,
  upsertPolicy,
  upsertProvider,
  CONFIG_WRITE_BOUNDARIES,
  CONFIG_WRITE_VERSION,
  removeSandboxDemoFixture,
} from "@/lib/payments/config-write";
import { listDemoFixtureTags, removeDemoPaymentRows } from "@/lib/payments/fixture-reset";
import { allStatuses } from "@/lib/payments/providers";
import { MOCK_ADAPTER_VERSION, MOCK_PROVIDER_CODE } from "@/lib/payments/providers/mock";
import { resolveParty } from "@/lib/payments/resolve";

type Args = Record<string, string | boolean>;

function parse(argv: string[]): { command: string; args: Args } {
  const [command = "status", ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]!;
    if (!token.startsWith("--")) throw new Error(`Unexpected argument "${token}" (expected --flag or --flag=value).`);
    const body = token.slice(2);
    if (body.includes("=")) {
      const [k, ...v] = body.split("=");
      args[k!] = v.join("=");
    } else if (rest[i + 1] && !rest[i + 1]!.startsWith("--")) {
      args[body] = rest[i + 1]!;
      i += 1;
    } else {
      args[body] = true;
    }
  }
  return { command, args };
}

const str = (args: Args, key: string): string | null => {
  const v = args[key];
  if (typeof v === "string" && v.length > 0) return v;
  if (v === true) return "";
  return null;
};
const num = (args: Args, key: string): number | null => {
  const v = str(args, key);
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`--${key} must be an integer of minor units, got "${v}".`);
  return n;
};
const require = (args: Args, key: string): string => {
  const v = str(args, key);
  if (!v) throw new Error(`--${key} is required.`);
  return v;
};

async function status(): Promise<unknown> {
  const providerRows = (await adminPool.query(`select code, display_name, kind, country_code, integration_status, contract_status, credential_status, api_availability, webhook_model, settlement_model, signature_scheme, enabled_by, approval_reference, blocked_reason from public.payment_providers order by code`)).rows;
  const connections = (await adminPool.query(`select id, provider_code, environment, label, enabled, tenant_id from public.payment_provider_connections order by created_at`)).rows;
  const privileges = await runtimePrivilegeReport();
  return {
    version: CONFIG_WRITE_VERSION,
    boundaries: CONFIG_WRITE_BOUNDARIES,
    registry: allStatuses().map((s) => ({
      provider: s.provider,
      integrationStatus: s.integrationStatus,
      contractStatus: s.contractStatus,
      credentialStatus: s.credentialStatus,
      apiAvailability: s.apiAvailability,
      webhookModel: s.webhookModel,
      settlementModel: s.settlementModel,
      signatureScheme: s.signatureScheme,
      regulatoryEnforcement: s.regulatoryEnforcement,
      sandboxMode: s.sandboxMode,
      capabilities: s.supportedCapabilities,
      blockedOn: s.blockedOn,
    })),
    registeredRows: providerRows as unknown[],
    connections,
    runtimeRolePrivileges: privileges,
    interpretation:
      "runtimeRolePrivileges shows what the application's own role may do. insert/update/delete = false on the five configuration tables is the goal; true on any of them means the least-privilege revocation is missing and payment authority is self-modifiable.",
  };
}

/**
 * Sandbox demo configuration. Creates the smallest configuration under which the
 * pipeline can be exercised end-to-end, and labels every row so that no report
 * can mistake it for a ratified policy:
 *   policyVersion  = SANDBOX-DEMO-1.0.0
 *   approvalRef    = SANDBOX-DEMO:NOT-RATIFIED
 * It creates the chart-of-accounts lines it needs (the platform has no writer for
 * the chart of accounts, and an empty COA is precisely why ingestion stops at
 * MISSING_ACCOUNT_MAPPING in a fresh install). Those accounts are prefixed
 * `SD-` and carry the run tag, so `--cleanup` can remove exactly them.
 */
async function sandboxDemo(args: Args): Promise<unknown> {
  const tenantId = str(args, "tenant") ?? "TEN_BEYU_TZ";
  const cleanup = args.cleanup === true;
  const purgeTags = str(args, "purge-tags")
    ?.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const tag = `SD${Date.now().toString(36).toUpperCase()}`;

  if (cleanup) {
    // The removal is delegated to the governed writer, like every other
    // configuration mutation this CLI performs. A `delete` statement here would
    // make the CLI a second writer of the configuration tables and defeat the
    // single-path rule the payment suite is built on.
    // Optional, explicit, operator-only: demonstration HISTORY (transactions,
    // inbox rows, state trail, exceptions, settlement batches) is append-only for
    // real tenants and stays that way. For sandbox rows the removal path is
    // payments/fixture-reset — tag-scoped, mock-provider-scoped, trigger-restoring
    // and audited — so a demonstration can leave the database as it found it.
    let purged: unknown = { skipped: "no --purge-tags given" };
    if (purgeTags && purgeTags.length > 0) {
      purged = await removeDemoPaymentRows({ prefixes: purgeTags, confirm: str(args, "purge-confirm") ?? "" });
    }

    const result = await removeSandboxDemoFixture({
      approvedBy: str(args, "by") ?? "sandbox-demo",
      approvalReference: str(args, "ref") ?? "SANDBOX-DEMO:CLEANUP",
      confirm: str(args, "confirm") ?? "",
    });

    // The chart-of-accounts lines are this CLI's own fixture — it created them
    // because the platform has no chart-of-accounts writer. Leaving them behind
    // would make the Finance OS substrate look populated, and
    // tests/finance/accounting-substrate-boundary.test.ts reports the real state
    // ("no chart of accounts exists"), so a stale demo row would contradict a
    // canonical finding. Anything still referenced by the ledger or by a mapping is
    // kept and reported; no row that something depends on is removed underneath it.
    const removable = await adminPool.query(
      `select count(*)::int as n from public.ledger_accounts a
        where a.code like 'SD-%'
          and not exists (select 1 from public.journal_lines l where l.account_id = a.id)
          and not exists (select 1 from public.payment_account_mappings m where m.ledger_account_id = a.id)`,
    );
    const removed = await adminPool.query(
      `delete from public.ledger_accounts a
        where a.code like 'SD-%'
          and not exists (select 1 from public.journal_lines l where l.account_id = a.id)
          and not exists (select 1 from public.payment_account_mappings m where m.ledger_account_id = a.id)
        returning a.id`,
    );
    const retained = await adminPool.query(
      `select count(*)::int as n from public.ledger_accounts where code like 'SD-%'`,
    );
    return {
      mode: "cleanup",
      ...result,
      purged,
      demoAccountsRemovable: Number(removable.rows[0].n),
      demoAccountsRemoved: removed.rowCount ?? 0,
      demoAccountsRetained: Number(retained.rows[0].n),
    };
  }

  const [entity] = (await adminPool.query(`select id, code from public.legal_entities where tenant_id = $1 and country_code = 'TZ' order by code limit 1`, [tenantId])).rows as {
    id: string;
    code: string;
  }[];
  if (!entity) throw new Error(`No legal entity found for tenant ${tenantId}; pass --entity explicitly.`);

  const provider = await upsertProvider({
    code: MOCK_PROVIDER_CODE,
    displayName: "BEYU Payment Sandbox (mock)",
    kind: "MOBILE_MONEY",
    countryCode: "TZ",
    integrationStatus: "SANDBOX_VERIFIED",
    contractStatus: "NOT_REQUIRED",
    credentialStatus: "SANDBOX_ISSUED",
    apiAvailability: "NONE_FOUND",
    webhookModel: "PROVIDER_PUSH",
    settlementModel: "MANUAL_BATCH",
    signatureScheme: "HMAC_SHA256",
    sandboxMode: "MOCK_ONLY",
    regulatoryEnforcement: "NOT_INVESTIGATED",
    capabilities: { INBOUND_WEBHOOK: true, OUTBOUND_PAYOUT: false, SETTLEMENT_BATCH: true, STATEMENT_FILE: true, REFUND: false, REVERSAL_NOTICE: true, TXN_QUERY: false, BALANCE_QUERY: false },
    sandboxEvidence: `Mock adapter ${MOCK_ADAPTER_VERSION}: inbound HMAC verification, idempotent inbox, normalization and settlement matching exercised by tests/payments/*. No external provider contacted.`,
    blockedReason: "In-process simulation only. There is no external provider behind this adapter, so PRODUCTION_VERIFIED is unreachable.",
    approvedBy: str(args, "by") ?? "sandbox-demo",
    approvalReference: "SANDBOX-DEMO:NOT-RATIFIED",
  });

  const connection = await upsertConnection({
    tenantId,
    legalEntityId: entity.id,
    providerCode: MOCK_PROVIDER_CODE,
    countryCode: "TZ",
    label: "sandbox-demo",
    environment: "SANDBOX",
    credentialRef: "BEYU_MOCK_SANDBOX_API_KEY",
    signingSecretRef: "BEYU_MOCK_WEBHOOK_SECRET",
    enabled: true,
    approvedBy: str(args, "by") ?? "sandbox-demo",
    approvalReference: "SANDBOX-DEMO:NOT-RATIFIED",
  });

  const account = await upsertAccount({
    tenantId,
    legalEntityId: entity.id,
    connectionId: connection.id,
    providerCode: MOCK_PROVIDER_CODE,
    externalAccountId: "TILL-SD-DEMO",
    accountType: "COLLECTION",
    currency: "TZS",
    label: "sandbox-demo collection",
  });

  const coa = await adminPool.query(
    `insert into public.ledger_accounts (id, tenant_id, code, name, account_type, ifrs_category, active)
     values ($1,$2,$3,$4,'ASSET','CASH_AND_CASH_EQUIVALENTS',true),
            ($5,$6,$7,$8,'ASSET','TRADE_AND_OTHER_RECEIVABLES',true),
            ($9,$10,$11,$12,'EXPENSE','OTHER_OPERATING_EXPENSES',true),
            ($13,$14,$15,$16,'ASSET','CASH_AND_CASH_EQUIVALENTS',true)
     on conflict (tenant_id, code) do update set name = excluded.name, active = true
     returning id, code`,
    [
      `ACC-${tag}-CASH`, tenantId, `SD-${tag}-CASH`, "Sandbox demo cash at provider",
      `ACC-${tag}-AR`, tenantId, `SD-${tag}-AR`, "Sandbox demo receipts clearing",
      `ACC-${tag}-FEE`, tenantId, `SD-${tag}-FEE`, "Sandbox demo provider fees",
      `ACC-${tag}-SUS`, tenantId, `SD-${tag}-SUS`, "Sandbox demo suspense",
    ],
  );
  const byCode = new Map((coa.rows as { id: string; code: string }[]).map((r) => [r.code, r.id]));
  const cashId = byCode.get(`SD-${tag}-CASH`)!;
  const arId = byCode.get(`SD-${tag}-AR`)!;
  const feeId = byCode.get(`SD-${tag}-FEE`)!;
  const susId = byCode.get(`SD-${tag}-SUS`)!;

  const mappings = [];
  for (const [role, accountId] of [
    ["CASH", cashId],
    ["RECEIVABLE", arId],
    ["FEE_EXPENSE", feeId],
    ["SUSPENSE", susId],
  ] as const) {
    mappings.push(
      await upsertAccountMapping({
        tenantId,
        legalEntityId: entity.id,
        providerCode: MOCK_PROVIDER_CODE,
        currency: "TZS",
        mappingRole: role,
        ledgerAccountId: accountId,
        policyVersion: "SANDBOX-DEMO-1.0.0",
        approvedBy: str(args, "by") ?? "sandbox-demo",
        approvalReference: "SANDBOX-DEMO:NOT-RATIFIED",
      }),
    );
  }

  const policy = await upsertPolicy({
    tenantId,
    legalEntityId: entity.id,
    providerCode: MOCK_PROVIDER_CODE,
    currency: "TZS",
    maxTransactionMinor: num(args, "max") ?? 50_000_000,
    dailyInboundLimitMinor: 500_000_000,
    // 0, not null: `evaluateAccountingGate` reads null as "no ceiling" (anything
    // posts), so a demo policy must pin the ceiling at zero for every payment to
    // need a named human approver.
    autoPostCeilingMinor: 0,
    confidenceFloor: 0.99,
    maxClockSkewSeconds: 300,
    requireApprovalAboveMinor: 1_000_000,
    unknownTransactionTreatment: "SUSPENSE_REVIEW",
    policyVersion: "SANDBOX-DEMO-1.0.0",
    approvedBy: str(args, "by") ?? "sandbox-demo",
    approvalReference: "SANDBOX-DEMO:NOT-RATIFIED",
  });

  return {
    mode: "sandbox-demo",
    note: "SANDBOX DEMO CONFIGURATION. Not a ratified accounting policy. The chart-of-accounts lines it created are labelled with the run tag and exist only so the pipeline can be demonstrated; production activation requires the CFO's ratified policy and the governed account creation path.",
    provider,
    connectionId: connection.id,
    accountId: account.id,
    entity: entity.code,
    mappings: mappings.length,
    policyId: policy.id,
    ledgerAccountCodes: [...byCode.keys()],
    webhookSecretEnvVar: "BEYU_MOCK_WEBHOOK_SECRET (set this in the server environment; the value is never stored in the database)",
    cleanup: "re-run with --cleanup to remove exactly these rows",
    partyResolutionProbe: await resolveParty({ tenantId, normalizedKey: null }).then((r) => ({ gap: r.gap })),
  };
}


/** Recent transactions with all four status axes, for `transactions` (read-only). */
async function transactions(args: Args): Promise<unknown> {
  const limit = Math.min(Math.max(num(args, "limit") ?? 20, 1), 200);
  const tenant = str(args, "tenant");
  const where = tenant ? `where tenant_id = $1` : "";
  const rows = (
    await adminPool.query(
      `select id, tenant_id, legal_entity_id, provider_code, direction, transaction_type, currency,
              gross_minor, fee_minor, tax_minor, net_minor, net_basis,
              verification_status, trust_level, reconciliation_status, settlement_status, accounting_status,
              provider_transaction_id, occurred_at, created_at
         from public.payment_transactions ${where} order by created_at desc limit $${tenant ? 2 : 1}`,
      tenant ? [tenant, limit] : [limit],
    )
  ).rows;
  return {
    count: rows.length,
    limit,
    note: "Read through the administrative connection. The four status axes are reported independently: verification (was the message authenticated), trust (may we believe the row), reconciliation (is it attributed), settlement (has the money arrived). None implies another.",
    rows,
  };
}

/** Settlement batches and their variances (read-only). */
async function settlements(args: Args): Promise<unknown> {
  const limit = Math.min(Math.max(num(args, "limit") ?? 20, 1), 200);
  const rows = (
    await adminPool.query(
      `select id, tenant_id, provider_code, provider_settlement_id, settlement_date, currency,
              gross_minor, fee_minor, tax_minor, net_minor, credited_minor, variance_minor,
              item_count, matched_count, unmatched_count, status, source, accounting_status
         from public.payment_settlements order by created_at desc limit $1`,
      [limit],
    )
  ).rows;
  return {
    count: rows.length,
    openVariance: rows.filter((r: { variance_minor: string }) => r.variance_minor !== "0").length,
    note: "A variance is never plugged or written off here; it is reported for a human to decide.",
    rows,
  };
}

async function main(): Promise<void> {
  const { command, args } = parse(process.argv.slice(2));
  let result: unknown;
  switch (command) {
    case "status":
      result = await status();
      break;
    case "provider":
      result = await upsertProvider({
        code: require(args, "code"),
        displayName: str(args, "display") ?? require(args, "code"),
        kind: (str(args, "kind") ?? "MOBILE_MONEY") as never,
        countryCode: require(args, "country"),
        integrationStatus: (str(args, "status") ?? "NOT_INTEGRATED") as never,
        contractStatus: str(args, "contract") ?? undefined,
        credentialStatus: str(args, "credential") ?? undefined,
        apiAvailability: str(args, "api") ?? undefined,
        webhookModel: str(args, "webhook") ?? undefined,
        settlementModel: str(args, "settlement") ?? undefined,
        signatureScheme: str(args, "signature") ?? undefined,
        sandboxMode: str(args, "sandbox-mode") ?? undefined,
        regulatoryEnforcement: str(args, "regulatory") ?? undefined,
        sandboxEvidence: str(args, "sandbox-evidence"),
        productionEvidence: str(args, "production-evidence"),
        blockedReason: str(args, "blocked-reason"),
        approvedBy: str(args, "by"),
        approvalReference: str(args, "ref"),
      });
      break;
    case "connection":
      result = await upsertConnection({
        tenantId: require(args, "tenant"),
        legalEntityId: require(args, "entity"),
        providerCode: require(args, "provider"),
        countryCode: require(args, "country"),
        label: require(args, "label"),
        environment: (str(args, "env") ?? "SANDBOX") as "SANDBOX" | "PRODUCTION",
        baseUrl: str(args, "base-url"),
        merchantId: str(args, "merchant"),
        credentialRef: str(args, "credential-ref"),
        signingSecretRef: str(args, "secret-ref"),
        callbackPath: str(args, "callback"),
        enabled: args.enable === true,
        approvedBy: str(args, "by"),
        approvalReference: str(args, "ref"),
      });
      break;
    case "account":
      result = await upsertAccount({
        tenantId: require(args, "tenant"),
        legalEntityId: require(args, "entity"),
        connectionId: require(args, "connection"),
        providerCode: require(args, "provider"),
        externalAccountId: require(args, "external"),
        accountType: (str(args, "type") ?? "OPERATING") as never,
        currency: require(args, "currency"),
        label: require(args, "label"),
      });
      break;
    case "mapping":
      result = await upsertAccountMapping({
        tenantId: require(args, "tenant"),
        legalEntityId: require(args, "entity"),
        providerCode: str(args, "provider"),
        currency: str(args, "currency"),
        mappingRole: require(args, "role") as never,
        ledgerAccountId: require(args, "account"),
        policyVersion: str(args, "policy-version") ?? "SANDBOX-DEMO-1.0.0",
        approvedBy: require(args, "by"),
        approvalReference: require(args, "ref"),
      });
      break;
    case "policy":
      result = await upsertPolicy({
        tenantId: require(args, "tenant"),
        legalEntityId: str(args, "entity"),
        providerCode: str(args, "provider"),
        currency: require(args, "currency"),
        maxTransactionMinor: num(args, "max") ?? 0,
        dailyInboundLimitMinor: num(args, "daily-in"),
        dailyOutboundLimitMinor: num(args, "daily-out"),
        // Fail safe: an omitted ceiling means "nothing auto-posts", not "no limit".
        autoPostCeilingMinor: num(args, "auto-post-ceiling") ?? 0,
        confidenceFloor: args.floor ? Number(str(args, "floor")) : undefined,
        maxClockSkewSeconds: args.skew ? Number(str(args, "skew")) : undefined,
        requireApprovalAboveMinor: num(args, "approval-above"),
        unknownTransactionTreatment: (str(args, "unknown-treatment") ?? "SUSPENSE_REVIEW") as never,
        policyVersion: str(args, "policy-version") ?? "SANDBOX-DEMO-1.0.0",
        approvedBy: require(args, "by"),
        approvalReference: require(args, "ref"),
      });
      break;
    case "sandbox-demo":
      result = await sandboxDemo(args);
      break;
    case "transactions":
      result = await transactions(args);
      break;
    case "settlements":
      result = await settlements(args);
      break;
    case "fixtures":
      // Operator aid: which sandbox run tags are still present, so a cleanup can
      // name exactly the tags it intends to remove.
      result = { sandboxRunTags: await listDemoFixtureTags(Number(str(args, "limit") ?? "50")) };
      break;
    default:
      throw new Error(`Unknown command "${command}". Commands: status, provider, connection, account, mapping, policy, sandbox-demo, transactions, settlements, fixtures.`);
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2));
  process.exit(1);
});
